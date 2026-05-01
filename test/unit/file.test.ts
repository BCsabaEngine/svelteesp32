import * as fs from 'node:fs';
import path from 'node:path';

import * as tinyglobby from 'tinyglobby';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getFiles } from '../../src/file';

vi.mock('tinyglobby');
vi.mock('node:fs');

const defaultOptions = {
  sourcepath: '/test/path',
  engine: 'psychic' as const,
  exclude: [] as string[],
  noIndexCheck: false
};

describe('file', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(fs.statSync).mockReturnValue({ size: 100 } as fs.Stats);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getFiles', () => {
    it('should read all files from source directory', () => {
      const mockFiles = ['index.html', 'style.css', 'script.js'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const result = getFiles({ ...defaultOptions, noIndexCheck: true });

      expect(result.size).toBe(3);
      expect(result.get('index.html')?.content).toBe(mockContent);
      expect(result.get('style.css')?.content).toBe(mockContent);
      expect(result.get('script.js')?.content).toBe(mockContent);
      // Hash should be computed
      expect(result.get('index.html')?.hash).toBeDefined();
      expect(typeof result.get('index.html')?.hash).toBe('string');
    });

    it('should skip pre-compressed files when original exists', () => {
      const mockFiles = ['index.html', 'index.html.gz', 'style.css', 'style.css.br'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const result = getFiles({ ...defaultOptions, noIndexCheck: true });

      expect(result.size).toBe(2);
      expect(result.has('index.html')).toBe(true);
      expect(result.has('style.css')).toBe(true);
      expect(result.has('index.html.gz')).toBe(false);
      expect(result.has('style.css.br')).toBe(false);
    });

    it('should include pre-compressed files when original does not exist', () => {
      const mockFiles = ['archive.tar.gz', 'compressed.brotli'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const result = getFiles({ ...defaultOptions, noIndexCheck: true });

      expect(result.size).toBe(2);
      expect(result.has('archive.tar.gz')).toBe(true);
      expect(result.has('compressed.brotli')).toBe(true);
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

      const result = getFiles({ ...defaultOptions, noIndexCheck: true });

      expect(result.size).toBe(3);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('file1.txt, file2.txt'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('identical'));
    });

    it('should handle empty directory', () => {
      vi.mocked(tinyglobby.globSync).mockReturnValue([]);

      const result = getFiles({ ...defaultOptions, noIndexCheck: true });

      expect(result.size).toBe(0);
    });

    it('should correctly join paths when reading files', () => {
      const mockFiles = ['subdir/index.html'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      getFiles({ ...defaultOptions, noIndexCheck: true });

      expect(fs.readFileSync).toHaveBeenCalledWith(path.join('/test/path', 'subdir/index.html'), { flag: 'r' });
    });

    it('should handle multiple compressed extensions', () => {
      const mockFiles = ['file.txt', 'file.txt.gz', 'file.txt.br', 'file.txt.brotli', 'other.js'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const result = getFiles({ ...defaultOptions, noIndexCheck: true });

      expect(result.size).toBe(2);
      expect(result.has('file.txt')).toBe(true);
      expect(result.has('other.js')).toBe(true);
      expect(result.has('file.txt.gz')).toBe(false);
      expect(result.has('file.txt.br')).toBe(false);
      expect(result.has('file.txt.brotli')).toBe(false);
    });

    it('should pass correct options to globSync', () => {
      vi.mocked(tinyglobby.globSync).mockReturnValue([]);

      getFiles({ ...defaultOptions, noIndexCheck: true });

      expect(tinyglobby.globSync).toHaveBeenCalledWith('**/*', {
        cwd: '/test/path',
        onlyFiles: true,
        dot: false,
        followSymbolicLinks: false
      });
    });

    it('should throw when a file exceeds the 50MB size limit', () => {
      vi.mocked(tinyglobby.globSync).mockReturnValue(['large.bin']);
      vi.mocked(fs.statSync).mockReturnValue({ size: 51 * 1024 * 1024 } as fs.Stats);

      expect(() => getFiles({ ...defaultOptions, noIndexCheck: true })).toThrow('File too large');
    });
  });

  describe('file exclusion', () => {
    it('should exclude files matching simple glob pattern', () => {
      const mockFiles = ['index.html', 'script.js', 'script.js.map', 'style.css'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const result = getFiles({ ...defaultOptions, noIndexCheck: true, exclude: ['*.map'] });

      expect(result.size).toBe(3);
      expect(result.has('index.html')).toBe(true);
      expect(result.has('script.js')).toBe(true);
      expect(result.has('style.css')).toBe(true);
      expect(result.has('script.js.map')).toBe(false);
    });

    it('should exclude files matching directory glob pattern', () => {
      const mockFiles = ['index.html', 'src/app.js', 'test/unit.test.js', 'test/integration.test.js'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const result = getFiles({ ...defaultOptions, noIndexCheck: true, exclude: ['test/**/*.js'] });

      expect(result.size).toBe(2);
      expect(result.has('index.html')).toBe(true);
      expect(result.has('src/app.js')).toBe(true);
      expect(result.has('test/unit.test.js')).toBe(false);
      expect(result.has('test/integration.test.js')).toBe(false);
    });

    it('should exclude files matching multiple patterns', () => {
      const mockFiles = ['index.html', 'script.js', 'script.js.map', 'README.md', 'docs.txt'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const result = getFiles({ ...defaultOptions, noIndexCheck: true, exclude: ['*.map', '*.md', '*.txt'] });

      expect(result.size).toBe(2);
      expect(result.has('index.html')).toBe(true);
      expect(result.has('script.js')).toBe(true);
    });

    it('should exclude default system files', () => {
      const mockFiles = ['index.html', '.DS_Store', 'Thumbs.db', '.gitignore'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const result = getFiles({
        ...defaultOptions,
        noIndexCheck: true,
        exclude: ['.DS_Store', 'Thumbs.db', '.gitignore']
      });

      expect(result.size).toBe(1);
      expect(result.has('index.html')).toBe(true);
    });

    it('should not exclude when patterns array is empty', () => {
      const mockFiles = ['index.html', 'script.js', 'style.css'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const result = getFiles({ ...defaultOptions, noIndexCheck: true, exclude: [] });

      expect(result.size).toBe(3);
    });

    it('should handle Windows-style paths in exclusion', () => {
      const mockFiles = [String.raw`src\app.js`, String.raw`test\unit.test.js`];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const result = getFiles({ ...defaultOptions, noIndexCheck: true, exclude: ['test/**/*.js'] });

      // Should normalize backslashes and match pattern
      expect(result.size).toBe(1);
      expect(result.has(String.raw`src\app.js`)).toBe(true);
    });

    it('should log excluded files with count and list', () => {
      const mockFiles = ['index.html', 'script.js.map', 'README.md'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const consoleLogSpy = vi.spyOn(console, 'log');

      getFiles({ ...defaultOptions, noIndexCheck: true, exclude: ['*.map', '*.md'] });

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Excluded 2 file(s)'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('script.js.map'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('README.md'));
    });
  });

  describe('index.html validation', () => {
    it('should throw if no index.html or index.htm exists', () => {
      const mockFiles = ['style.css', 'script.js'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      expect(() => getFiles({ ...defaultOptions, noIndexCheck: false })).toThrow('No index.html or index.htm found');
    });

    it('should pass if index.html exists', () => {
      const mockFiles = ['index.html', 'style.css'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const result = getFiles({ ...defaultOptions, noIndexCheck: false });

      expect(result.size).toBe(2);
    });

    it('should pass if index.htm exists', () => {
      const mockFiles = ['index.htm', 'style.css'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const result = getFiles({ ...defaultOptions, noIndexCheck: false });

      expect(result.size).toBe(2);
    });

    it('should skip validation if noIndexCheck is true', () => {
      const mockFiles = ['style.css', 'script.js'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const result = getFiles({ ...defaultOptions, noIndexCheck: true });

      expect(result.size).toBe(2);
    });

    it('should pass if index.html is in subdirectory', () => {
      const mockFiles = ['assets/index.html', 'style.css'];
      const mockContent = Buffer.from('test content');

      vi.mocked(tinyglobby.globSync).mockReturnValue(mockFiles);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const result = getFiles({ ...defaultOptions, noIndexCheck: false });

      expect(result.size).toBe(2);
    });
  });

  describe('excluded files display', () => {
    it('should show "... and X more" message when more than 10 files are excluded', async () => {
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

      vi.resetModules();
      const { getFiles: getFilesReloaded } = await import('../../src/file');
      const result = getFilesReloaded({
        sourcepath: '/test/path',
        engine: 'psychic',
        exclude: ['*.map'],
        noIndexCheck: false
      });

      // Should only have index.html (14 .map files excluded)
      expect(result.size).toBe(1);
      // Should log "... and 4 more" since we show first 10 and have 14 excluded
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('... and 4 more'));
    });
  });
});
