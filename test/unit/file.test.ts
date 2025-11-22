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
    prefix: 'SVELTEESP32'
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
        if (pathString.includes('file1') || pathString.includes('file2')) {
          return content1;
        }
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
});
