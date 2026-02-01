import * as fs from 'node:fs';
import path from 'node:path';

import * as tinyglobby from 'tinyglobby';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getFiles } from '../../src/file';

vi.mock('../../src/commandLine', () => ({
  cmdLine: {
    sourcepath: '/test/path',
    outputpath: '/test/output.h',
    engine: 'psychic',
    etag: 'true',
    gzip: 'true',
    cachetime: 86_400,
    created: false,
    version: 'test-version',
    prefix: 'SVELTEESP32',
    exclude: [],
    noIndexCheck: false
  }
}));

vi.mock('tinyglobby');
vi.mock('node:fs');

describe('file', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getFiles', () => {
    beforeEach(async () => {
      // Set noIndexCheck to true for most tests (index.html validation has its own section)
      const commandLineModule = await import('../../src/commandLine');
      vi.mocked(commandLineModule.cmdLine).noIndexCheck = true;
    });

    it('should read all files from source directory', () => {
      const mockFiles = ['index.html', 'style.css', 'script.js'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const result = getFiles();

      expect(result.size).toBe(3);
      expect(result.get('index.html')).toBe(mockContent);
      expect(result.get('style.css')).toBe(mockContent);
      expect(result.get('script.js')).toBe(mockContent);
    });

    it('should skip pre-compressed files when original exists', () => {
      const mockFiles = ['index.html', 'index.html.gz', 'style.css', 'style.css.br'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const result = getFiles();

      expect(result.size).toBe(2);
      expect(result.has('index.html')).toBe(true);
      expect(result.has('style.css')).toBe(true);
      expect(result.has('index.html.gz')).toBe(false);
      expect(result.has('style.css.br')).toBe(false);
    });

    it('should include pre-compressed files when original does not exist', () => {
      const mockFiles = ['archive.tar.gz', 'compressed.brottli'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const result = getFiles();

      expect(result.size).toBe(2);
      expect(result.has('archive.tar.gz')).toBe(true);
      expect(result.has('compressed.brottli')).toBe(true);
    });

    it('should detect and report duplicate files', () => {
      const mockFiles = ['file1.txt', 'file2.txt', 'file3.txt'];
      const content1 = Buffer.from('identical content');
      const content3 = Buffer.from('different content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockImplementation((filePath: fs.PathOrFileDescriptor) => {
        const pathString = filePath.toString();
        if (pathString.includes('file1') || pathString.includes('file2')) return content1;

        return content3;
      });

      const consoleLogSpy = vi.spyOn(console, 'log');

      const result = getFiles();

      expect(result.size).toBe(3);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('file1.txt, file2.txt'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('identical'));
    });

    it('should handle empty directory', () => {
      vi.mocked(tinyglobby.globSync).mockReturnValue([]);

      const result = getFiles();

      expect(result.size).toBe(0);
    });

    it('should correctly join paths when reading files', () => {
      const mockFiles = ['subdir/index.html'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      getFiles();

      expect(fs.readFileSync).toHaveBeenCalledWith(path.join('/test/path', 'subdir/index.html'), { flag: 'r' });
    });

    it('should handle multiple compressed extensions', () => {
      const mockFiles = ['file.txt', 'file.txt.gz', 'file.txt.br', 'file.txt.brottli', 'other.js'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const result = getFiles();

      expect(result.size).toBe(2);
      expect(result.has('file.txt')).toBe(true);
      expect(result.has('other.js')).toBe(true);
      expect(result.has('file.txt.gz')).toBe(false);
      expect(result.has('file.txt.br')).toBe(false);
      expect(result.has('file.txt.brottli')).toBe(false);
    });

    it('should pass correct options to globSync', () => {
      vi.mocked(tinyglobby.globSync).mockReturnValue([]);

      getFiles();

      expect(tinyglobby.globSync).toHaveBeenCalledWith('**/*', { cwd: '/test/path', onlyFiles: true, dot: false });
    });
  });

  describe('file exclusion', () => {
    beforeEach(async () => {
      // Reset cmdLine mock before each test
      const commandLineModule = await import('../../src/commandLine');
      vi.mocked(commandLineModule.cmdLine).exclude = [];
      vi.mocked(commandLineModule.cmdLine).noIndexCheck = true; // Skip index.html validation for these tests
    });

    it('should exclude files matching simple glob pattern', async () => {
      const mockFiles = ['index.html', 'script.js', 'script.js.map', 'style.css'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      // Mock cmdLine to include exclude pattern
      const commandLineModule = await import('../../src/commandLine');
      vi.mocked(commandLineModule.cmdLine).exclude = ['*.map'];

      const result = getFiles();

      expect(result.size).toBe(3);
      expect(result.has('index.html')).toBe(true);
      expect(result.has('script.js')).toBe(true);
      expect(result.has('style.css')).toBe(true);
      expect(result.has('script.js.map')).toBe(false);
    });

    it('should exclude files matching directory glob pattern', async () => {
      const mockFiles = ['index.html', 'src/app.js', 'test/unit.test.js', 'test/integration.test.js'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const commandLineModule = await import('../../src/commandLine');
      vi.mocked(commandLineModule.cmdLine).exclude = ['test/**/*.js'];

      const result = getFiles();

      expect(result.size).toBe(2);
      expect(result.has('index.html')).toBe(true);
      expect(result.has('src/app.js')).toBe(true);
      expect(result.has('test/unit.test.js')).toBe(false);
      expect(result.has('test/integration.test.js')).toBe(false);
    });

    it('should exclude files matching multiple patterns', async () => {
      const mockFiles = ['index.html', 'script.js', 'script.js.map', 'README.md', 'docs.txt'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const commandLineModule = await import('../../src/commandLine');
      vi.mocked(commandLineModule.cmdLine).exclude = ['*.map', '*.md', '*.txt'];

      const result = getFiles();

      expect(result.size).toBe(2);
      expect(result.has('index.html')).toBe(true);
      expect(result.has('script.js')).toBe(true);
    });

    it('should exclude default system files', async () => {
      const mockFiles = ['index.html', '.DS_Store', 'Thumbs.db', '.gitignore'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const commandLineModule = await import('../../src/commandLine');
      vi.mocked(commandLineModule.cmdLine).exclude = ['.DS_Store', 'Thumbs.db', '.gitignore'];

      const result = getFiles();

      expect(result.size).toBe(1);
      expect(result.has('index.html')).toBe(true);
    });

    it('should not exclude when patterns array is empty', async () => {
      const mockFiles = ['index.html', 'script.js', 'style.css'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const commandLineModule = await import('../../src/commandLine');
      vi.mocked(commandLineModule.cmdLine).exclude = [];

      const result = getFiles();

      expect(result.size).toBe(3);
    });

    it('should handle Windows-style paths in exclusion', async () => {
      const mockFiles = [String.raw`src\app.js`, String.raw`test\unit.test.js`];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const commandLineModule = await import('../../src/commandLine');
      vi.mocked(commandLineModule.cmdLine).exclude = ['test/**/*.js'];

      const result = getFiles();

      // Should normalize backslashes and match pattern
      expect(result.size).toBe(1);
      expect(result.has(String.raw`src\app.js`)).toBe(true);
    });

    it('should log excluded files with count and list', async () => {
      const mockFiles = ['index.html', 'script.js.map', 'README.md'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const consoleLogSpy = vi.spyOn(console, 'log');

      const commandLineModule = await import('../../src/commandLine');
      vi.mocked(commandLineModule.cmdLine).exclude = ['*.map', '*.md'];

      getFiles();

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Excluded 2 file(s)'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('script.js.map'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('README.md'));
    });
  });

  describe('index.html validation', () => {
    const originalExit = process.exit;

    beforeEach(async () => {
      process.exit = vi.fn() as never;
      vi.spyOn(console, 'error').mockImplementation(() => {});

      // Reset noIndexCheck to false
      const commandLineModule = await import('../../src/commandLine');
      vi.mocked(commandLineModule.cmdLine).noIndexCheck = false;
    });

    afterEach(() => {
      process.exit = originalExit;
    });

    it('should fail if no index.html or index.htm exists', async () => {
      const mockFiles = ['style.css', 'script.js'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      getFiles();

      expect(console.error).toHaveBeenCalled();
      const errorMessage = vi.mocked(console.error).mock.calls[0]?.[0];
      expect(errorMessage).toContain('[ERROR]');
      expect(errorMessage).toContain('No index.html or index.htm found');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should pass if index.html exists', async () => {
      const mockFiles = ['index.html', 'style.css'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const result = getFiles();

      expect(result.size).toBe(2);
      expect(console.error).not.toHaveBeenCalled();
      expect(process.exit).not.toHaveBeenCalled();
    });

    it('should pass if index.htm exists', async () => {
      const mockFiles = ['index.htm', 'style.css'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const result = getFiles();

      expect(result.size).toBe(2);
      expect(console.error).not.toHaveBeenCalled();
      expect(process.exit).not.toHaveBeenCalled();
    });

    it('should skip validation if --noindexcheck is true', async () => {
      const mockFiles = ['style.css', 'script.js'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const commandLineModule = await import('../../src/commandLine');
      vi.mocked(commandLineModule.cmdLine).noIndexCheck = true;

      const result = getFiles();

      expect(result.size).toBe(2);
      expect(console.error).not.toHaveBeenCalled();
      expect(process.exit).not.toHaveBeenCalled();
    });

    it('should pass if index.html is in subdirectory', async () => {
      const mockFiles = ['assets/index.html', 'style.css'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const result = getFiles();

      expect(result.size).toBe(2);
      expect(console.error).not.toHaveBeenCalled();
      expect(process.exit).not.toHaveBeenCalled();
    });
  });

  describe('excluded files display', () => {
    it('should show "... and X more" message when more than 10 files are excluded', async () => {
      // Create 15 files that will be excluded (match exclude pattern)
      const mockFiles = [
        'index.html',
        'file1.map',
        'file2.map',
        'file3.map',
        'file4.map',
        'file5.map',
        'file6.map',
        'file7.map',
        'file8.map',
        'file9.map',
        'file10.map',
        'file11.map',
        'file12.map',
        'file13.map',
        'file14.map'
      ];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      // Mock picomatch to exclude .map files
      vi.doMock('picomatch', () => ({
        default: vi.fn((patterns: string[]) => {
          return (file: string) => {
            return patterns.some((pattern) => {
              if (pattern === '*.map') return file.endsWith('.map');
              return false;
            });
          };
        })
      }));

      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          sourcepath: '/test/path',
          exclude: ['*.map'],
          noindexcheck: false
        }
      }));

      vi.resetModules();
      const { getFiles } = await import('../../src/file');
      const result = getFiles();

      // Should only have index.html (14 .map files excluded)
      expect(result.size).toBe(1);
      // Should log "... and 4 more" since we show first 10 and have 14 excluded
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('... and 4 more'));
    });
  });
});
