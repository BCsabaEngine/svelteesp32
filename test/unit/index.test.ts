import * as fs from 'node:fs';
import * as zlib from 'node:zlib';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExtensionGroup, getCppCode } from '../../src/cppCode';
import type { getFiles } from '../../src/file';

// Mock modules before importing index
vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn()
}));

vi.mock('node:zlib', () => ({
  gzipSync: vi.fn(() => Buffer.from('gzipped'))
}));

vi.mock('mime-types', () => ({
  lookup: vi.fn(() => 'text/html')
}));

vi.mock('../../src/file', () => ({
  getFiles: vi.fn(() => new Map([['index.html', { content: Buffer.from('<html></html>'), hash: 'mock-sha256-hash' }]]))
}));

vi.mock('../../src/cppCode', () => ({
  getCppCode: vi.fn(() => 'mock-cpp-code')
}));

vi.mock('../../src/commandLine', () => ({
  cmdLine: {
    engine: 'psychic',
    sourcepath: '/test/dist',
    outputfile: '/test/output.h',
    etag: 'true',
    gzip: 'true',
    exclude: [],
    noindexcheck: false,
    espmethod: 'initSvelteStaticFiles'
  }
}));

describe('index.ts helper functions', () => {
  describe('shouldUseGzip', () => {
    it('should return true for files >1024 bytes with >15% reduction', async () => {
      vi.resetModules();
      const { shouldUseGzip } = await import('../../src/index');
      expect(shouldUseGzip(2048, 1024)).toBe(true);
    });

    it('should return false for files <=1024 bytes', async () => {
      vi.resetModules();
      const { shouldUseGzip } = await import('../../src/index');
      expect(shouldUseGzip(1024, 512)).toBe(false);
    });

    it('should return false when compression <15% reduction (>=85% of original)', async () => {
      vi.resetModules();
      const { shouldUseGzip } = await import('../../src/index');
      // 2048 * 0.85 = 1740.8, so 1741 bytes is 85.01% - should not use gzip
      expect(shouldUseGzip(2048, 1741)).toBe(false);
    });

    it('should return true at exact threshold boundary (1024 bytes + 84.9% ratio)', async () => {
      vi.resetModules();
      const { shouldUseGzip } = await import('../../src/index');
      // 1025 * 0.85 = 871.25, so 871 bytes is 84.98% - should use gzip
      expect(shouldUseGzip(1025, 871)).toBe(true);
    });

    it('should return false for exact threshold (1024 bytes)', async () => {
      vi.resetModules();
      const { shouldUseGzip } = await import('../../src/index');
      expect(shouldUseGzip(1024, 800)).toBe(false);
    });

    it('should handle zero-size files', async () => {
      vi.resetModules();
      const { shouldUseGzip } = await import('../../src/index');
      expect(shouldUseGzip(0, 0)).toBe(false);
    });
  });

  describe('calculateCompressionRatio', () => {
    it('should calculate correct percentage', async () => {
      vi.resetModules();
      const { calculateCompressionRatio } = await import('../../src/index');
      expect(calculateCompressionRatio(2048, 1024)).toBe(50);
    });

    it('should handle equal sizes (100%)', async () => {
      vi.resetModules();
      const { calculateCompressionRatio } = await import('../../src/index');
      expect(calculateCompressionRatio(1024, 1024)).toBe(100);
    });

    it('should handle near-perfect compression', async () => {
      vi.resetModules();
      const { calculateCompressionRatio } = await import('../../src/index');
      expect(calculateCompressionRatio(10_000, 100)).toBe(1);
    });

    it('should round to nearest integer', async () => {
      vi.resetModules();
      const { calculateCompressionRatio } = await import('../../src/index');
      // 683/1024 = 0.6669... = 67%
      expect(calculateCompressionRatio(1024, 683)).toBe(67);
    });
  });

  describe('formatCompressionLog', () => {
    it('should format green log when gzip used', async () => {
      vi.resetModules();
      const { formatCompressionLog } = await import('../../src/index');
      const result = formatCompressionLog('test.js', '  ', 2048, 1024, true);
      expect(result).toContain('✓ gzip used');
      expect(result).toContain('(2048 -> 1024 = 50%)');
    });

    it('should format yellow log with "too small" for <=1024 bytes', async () => {
      vi.resetModules();
      const { formatCompressionLog } = await import('../../src/index');
      const result = formatCompressionLog('small.txt', '', 512, 400, false);
      expect(result).toContain('x gzip unused');
      expect(result).toContain('(too small)');
      expect(result).toContain('(512 -> 400 = 78%)');
    });

    it('should format yellow log without "too small" for >1024 bytes with poor compression', async () => {
      vi.resetModules();
      const { formatCompressionLog } = await import('../../src/index');
      const result = formatCompressionLog('large.txt', '', 2048, 1900, false);
      expect(result).toContain('x gzip unused');
      expect(result).not.toContain('(too small)');
      expect(result).toContain('(2048 -> 1900 = 93%)');
    });
  });

  describe('formatSize', () => {
    it('should show bytes for sizes < 1024', async () => {
      vi.resetModules();
      const { formatSize } = await import('../../src/index');
      expect(formatSize(100)).toBe('100B');
      expect(formatSize(0)).toBe('0B');
      expect(formatSize(1023)).toBe('1023B');
    });

    it('should show kB for sizes >= 1024', async () => {
      vi.resetModules();
      const { formatSize } = await import('../../src/index');
      expect(formatSize(1024)).toBe('1kB');
      expect(formatSize(2048)).toBe('2kB');
      expect(formatSize(10_240)).toBe('10kB');
    });
  });

  describe('createSourceEntry', () => {
    it('should create correct CppCodeSource structure with all fields', async () => {
      vi.resetModules();
      const { createSourceEntry } = await import('../../src/index');
      const content = Buffer.from('<html></html>');
      const contentGzip = Buffer.from('gzipped');

      const result = createSourceEntry('index.html', 'index_html', content, contentGzip, 'text/html', 'abc123', true);

      expect(result).toEqual({
        filename: 'index.html',
        dataname: 'index_html',
        datanameUpperCase: 'INDEX_HTML',
        content,
        contentGzip,
        isGzip: true,
        mime: 'text/html',
        sha256: 'abc123'
      });
    });

    it('should use original content when isGzip is false', async () => {
      vi.resetModules();
      const { createSourceEntry } = await import('../../src/index');
      const content = Buffer.from('<html></html>');
      const contentGzip = Buffer.from('gzipped');

      const result = createSourceEntry('index.html', 'index_html', content, contentGzip, 'text/html', 'abc123', false);

      expect(result.contentGzip).toBe(content);
      expect(result.isGzip).toBe(false);
    });
  });

  describe('updateExtensionGroup', () => {
    it('should add new extension and increment existing', async () => {
      vi.resetModules();
      const { updateExtensionGroup } = await import('../../src/index');

      const groups: { extension: string; count: number }[] = [];
      updateExtensionGroup(groups, 'HTML');
      expect(groups).toEqual([{ extension: 'HTML', count: 1 }]);

      updateExtensionGroup(groups, 'HTML');
      expect(groups).toEqual([{ extension: 'HTML', count: 2 }]);

      updateExtensionGroup(groups, 'CSS');
      expect(groups).toEqual([
        { extension: 'HTML', count: 2 },
        { extension: 'CSS', count: 1 }
      ]);
    });
  });
});

const makeFileData = (content: string, hash = 'mock-sha256-hash') => ({
  content: Buffer.from(content),
  hash
});

describe('index.ts main pipeline integration', () => {
  const originalArgv = process.argv;
  const originalExit = process.exit;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  let mockGetFiles: ReturnType<typeof vi.mocked<typeof getFiles>>;
  let mockGetCppCode: ReturnType<typeof vi.mocked<typeof getCppCode>>;
  let mockMkdirSync: ReturnType<typeof vi.mocked<typeof fs.mkdirSync>>;
  let mockWriteFileSync: ReturnType<typeof vi.mocked<typeof fs.writeFileSync>>;
  let mockGzipSync: ReturnType<typeof vi.mocked<typeof zlib.gzipSync>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.exit = vi.fn() as never;
    console.log = vi.fn();
    console.error = vi.fn();

    // Get mock references
    const fileModule = await import('../../src/file');
    const cppCodeModule = await import('../../src/cppCode');
    const zlibModule = await import('node:zlib');

    mockGetFiles = vi.mocked(fileModule.getFiles);
    mockGetCppCode = vi.mocked(cppCodeModule.getCppCode);
    mockMkdirSync = vi.mocked(fs.mkdirSync);
    mockWriteFileSync = vi.mocked(fs.writeFileSync);
    mockGzipSync = vi.mocked(zlibModule.gzipSync);
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    vi.resetModules();
  });

  describe('file processing pipeline', () => {
    it('should exit with code 1 when no files found', async () => {
      mockGetFiles.mockReturnValue(new Map());
      vi.resetModules();
      await import('../../src/index');
      expect(process.exit).toHaveBeenCalledWith(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('is empty'));
    });

    it('should process single file correctly', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', makeFileData('<html></html>')]]));
      mockGzipSync.mockReturnValue(Buffer.from('gzipped'));

      vi.resetModules();
      await import('../../src/index');

      expect(mockGetCppCode).toHaveBeenCalled();
      expect(mockWriteFileSync).toHaveBeenCalledWith(expect.any(String), 'mock-cpp-code', {
        flush: true,
        encoding: 'utf8'
      });
    });

    it('should process multiple files correctly', async () => {
      mockGetFiles.mockReturnValue(
        new Map([
          ['index.html', makeFileData('<html></html>')],
          ['style.css', makeFileData('body {}')],
          ['script.js', makeFileData('console.log()')]
        ])
      );
      mockGzipSync.mockReturnValue(Buffer.from('gzipped'));

      vi.resetModules();
      await import('../../src/index');

      expect(mockGetCppCode).toHaveBeenCalled();
      const sources = mockGetCppCode.mock.calls[0][0];
      expect(sources).toHaveLength(3);
    });

    it('should use pre-computed SHA256 hash from getFiles', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', makeFileData('<html></html>', 'pre-computed-hash')]]));

      vi.resetModules();
      await import('../../src/index');

      expect(mockGetCppCode).toHaveBeenCalled();
      const sources = mockGetCppCode.mock.calls[0][0];
      expect(sources[0].sha256).toBe('pre-computed-hash');
    });

    it('should apply gzip compression with level 9', async () => {
      const content = Buffer.from('<html></html>');
      mockGetFiles.mockReturnValue(new Map([['index.html', { content, hash: 'hash' }]]));

      vi.resetModules();
      await import('../../src/index');

      expect(mockGzipSync).toHaveBeenCalledWith(content, { level: 9 });
    });
  });

  describe('file writing', () => {
    it('should create output directory if missing', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', makeFileData('<html></html>')]]));

      vi.resetModules();
      await import('../../src/index');

      expect(mockMkdirSync).toHaveBeenCalled();
      expect(mockMkdirSync.mock.calls[0][1]).toEqual({ recursive: true });
    });

    it('should write C++ header file with correct encoding', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', makeFileData('<html></html>')]]));

      vi.resetModules();
      await import('../../src/index');

      expect(mockWriteFileSync).toHaveBeenCalledWith(expect.any(String), 'mock-cpp-code', {
        flush: true,
        encoding: 'utf8'
      });
    });
  });

  describe('console output', () => {
    it('should log "Collecting source files"', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', makeFileData('<html></html>')]]));

      vi.resetModules();
      await import('../../src/index');

      expect(console.log).toHaveBeenCalledWith('Collecting source files');
    });

    it('should log "Translation to header file"', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', makeFileData('<html></html>')]]));

      vi.resetModules();
      await import('../../src/index');

      expect(console.log).toHaveBeenCalledWith('Translation to header file');
    });

    it('should log summary statistics', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', makeFileData('<html></html>')]]));

      vi.resetModules();
      await import('../../src/index');

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('files'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('original size'));
    });

    it('should log output file path and size', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', makeFileData('<html></html>')]]));

      vi.resetModules();
      await import('../../src/index');

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('/test/output.h'));
    });
  });

  describe('engine-specific hints', () => {
    it('should show max_uri_handlers hint for psychic engine', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', makeFileData('<html></html>')]]));

      vi.resetModules();
      await import('../../src/index');

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('max_uri_handlers'));
    });

    it('should show max_uri_handlers hint for espidf engine', async () => {
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'espidf',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'true',
          exclude: [],
          noindexcheck: false,
          espmethod: 'initSvelteStaticFiles'
        }
      }));
      vi.doMock('../../src/file', () => ({
        getFiles: vi.fn(() => new Map([['index.html', { content: Buffer.from('<html></html>'), hash: 'h' }]]))
      }));

      vi.resetModules();
      await import('../../src/index');

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('max_uri_handlers'));
    });

    it('should not show max_uri_handlers hint for async engine', async () => {
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'async',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'true',
          exclude: [],
          noindexcheck: false,
          espmethod: 'initSvelteStaticFiles'
        }
      }));
      vi.doMock('../../src/file', () => ({
        getFiles: vi.fn(() => new Map([['index.html', { content: Buffer.from('<html></html>'), hash: 'h' }]]))
      }));

      vi.resetModules();
      await import('../../src/index');

      // Get all console.log calls and check none contain max_uri_handlers
      const mockLog = vi.mocked(console.log);
      const allLogs = mockLog.mock.calls.map((call) => call[0]);
      const hasMaxUriHandlers = allLogs.some((log) => typeof log === 'string' && log.includes('max_uri_handlers'));
      expect(hasMaxUriHandlers).toBe(false);
    });
  });

  describe('extension grouping', () => {
    it('should extract and uppercase file extensions', async () => {
      mockGetFiles.mockReturnValue(
        new Map([
          ['index.html', makeFileData('<html></html>')],
          ['style.css', makeFileData('body {}')],
          ['script.js', makeFileData('console.log()')]
        ])
      );

      vi.resetModules();
      await import('../../src/index');

      const filesByExtension = mockGetCppCode.mock.calls[0][1];
      expect(filesByExtension).toContainEqual({ extension: 'HTML', count: 1 });
      expect(filesByExtension).toContainEqual({ extension: 'CSS', count: 1 });
      expect(filesByExtension).toContainEqual({ extension: 'JS', count: 1 });
    });

    it('should sort extensions alphabetically', async () => {
      mockGetFiles.mockReturnValue(
        new Map([
          ['script.js', makeFileData('console.log()')],
          ['index.html', makeFileData('<html></html>')],
          ['style.css', makeFileData('body {}')]
        ])
      );

      vi.resetModules();
      await import('../../src/index');

      const filesByExtension = mockGetCppCode.mock.calls[0][1];
      const extensions = filesByExtension.map((group: ExtensionGroup) => group.extension);
      expect(extensions).toEqual(['CSS', 'HTML', 'JS']);
    });
  });
});
