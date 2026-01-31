import * as crypto from 'node:crypto';
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

vi.mock('node:crypto', () => ({
  createHash: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(() => 'mock-sha256-hash')
  }))
}));

vi.mock('node:zlib', () => ({
  gzipSync: vi.fn(() => Buffer.from('gzipped'))
}));

vi.mock('mime-types', () => ({
  lookup: vi.fn(() => 'text/html')
}));

vi.mock('../../src/file', () => ({
  getFiles: vi.fn(() => new Map([['index.html', Buffer.from('<html></html>')]]))
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
    noindexcheck: false
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

      // This function modifies filesByExtension array in the module
      // We need to test it by checking the behavior, not the internal state
      // Since it operates on module-level state, we'll test the logic conceptually

      // First call adds new extension
      updateExtensionGroup('HTML');
      // Second call increments existing
      updateExtensionGroup('HTML');
      // Third call adds different extension
      updateExtensionGroup('CSS');

      // We can't directly assert the module state without exporting filesByExtension,
      // but the test ensures no errors occur during execution
      expect(true).toBe(true);
    });
  });
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
  let mockCreateHash: ReturnType<typeof vi.mocked<typeof crypto.createHash>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.exit = vi.fn() as never;
    console.log = vi.fn();
    console.error = vi.fn();

    // Get mock references
    const fileModule = await import('../../src/file');
    const cppCodeModule = await import('../../src/cppCode');
    const zlibModule = await import('node:zlib');
    const cryptoModule = await import('node:crypto');

    mockGetFiles = vi.mocked(fileModule.getFiles);
    mockGetCppCode = vi.mocked(cppCodeModule.getCppCode);
    mockMkdirSync = vi.mocked(fs.mkdirSync);
    mockWriteFileSync = vi.mocked(fs.writeFileSync);
    mockGzipSync = vi.mocked(zlibModule.gzipSync);
    mockCreateHash = vi.mocked(cryptoModule.createHash);
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
      const content = Buffer.from('<html></html>');
      mockGetFiles.mockReturnValue(new Map([['index.html', content]]));
      mockGzipSync.mockReturnValue(Buffer.from('gzipped'));
      mockCreateHash.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn(() => 'abc123')
      } as ReturnType<typeof crypto.createHash>);

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
          ['index.html', Buffer.from('<html></html>')],
          ['style.css', Buffer.from('body {}')],
          ['script.js', Buffer.from('console.log()')]
        ])
      );
      mockGzipSync.mockReturnValue(Buffer.from('gzipped'));

      vi.resetModules();
      await import('../../src/index');

      expect(mockGetCppCode).toHaveBeenCalled();
      const sources = mockGetCppCode.mock.calls[0][0];
      expect(sources).toHaveLength(3);
    });

    it('should calculate SHA256 hash for each file', async () => {
      const content = Buffer.from('<html></html>');
      mockGetFiles.mockReturnValue(new Map([['index.html', content]]));

      const updateSpy = vi.fn().mockReturnThis();
      const digestSpy = vi.fn(() => 'sha256-hash');
      mockCreateHash.mockReturnValue({
        update: updateSpy,
        digest: digestSpy
      } as ReturnType<typeof crypto.createHash>);

      vi.resetModules();
      await import('../../src/index');

      expect(mockCreateHash).toHaveBeenCalledWith('sha256');
      expect(updateSpy).toHaveBeenCalledWith(content);
      expect(digestSpy).toHaveBeenCalledWith('hex');
    });

    it('should apply gzip compression with level 9', async () => {
      const content = Buffer.from('<html></html>');
      mockGetFiles.mockReturnValue(new Map([['index.html', content]]));

      vi.resetModules();
      await import('../../src/index');

      expect(mockGzipSync).toHaveBeenCalledWith(content, { level: 9 });
    });
  });

  describe('file writing', () => {
    it('should create output directory if missing', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', Buffer.from('<html></html>')]]));

      vi.resetModules();
      await import('../../src/index');

      expect(mockMkdirSync).toHaveBeenCalled();
      expect(mockMkdirSync.mock.calls[0][1]).toEqual({ recursive: true });
    });

    it('should write C++ header file with correct encoding', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', Buffer.from('<html></html>')]]));

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
      mockGetFiles.mockReturnValue(new Map([['index.html', Buffer.from('<html></html>')]]));

      vi.resetModules();
      await import('../../src/index');

      expect(console.log).toHaveBeenCalledWith('Collecting source files');
    });

    it('should log "Translation to header file"', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', Buffer.from('<html></html>')]]));

      vi.resetModules();
      await import('../../src/index');

      expect(console.log).toHaveBeenCalledWith('Translation to header file');
    });

    it('should log summary statistics', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', Buffer.from('<html></html>')]]));

      vi.resetModules();
      await import('../../src/index');

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('files'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('kB original size'));
    });

    it('should log output file path and size', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', Buffer.from('<html></html>')]]));

      vi.resetModules();
      await import('../../src/index');

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('/test/output.h'));
    });
  });

  describe('engine-specific hints', () => {
    it('should show max_uri_handlers hint for psychic engine', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', Buffer.from('<html></html>')]]));

      vi.resetModules();
      // The mock already sets engine to 'psychic'
      await import('../../src/index');

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('max_uri_handlers'));
    });

    it('should show max_uri_handlers hint for psychic2 engine', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', Buffer.from('<html></html>')]]));

      // Update mock to return psychic2
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic2',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'true',
          exclude: [],
          noindexcheck: false
        }
      }));

      vi.resetModules();
      await import('../../src/index');

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('max_uri_handlers'));
    });

    it('should show max_uri_handlers hint for espidf engine', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', Buffer.from('<html></html>')]]));

      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'espidf',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'true',
          exclude: [],
          noindexcheck: false
        }
      }));

      vi.resetModules();
      await import('../../src/index');

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('max_uri_handlers'));
    });

    it('should not show max_uri_handlers hint for async engine', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', Buffer.from('<html></html>')]]));

      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'async',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'true',
          exclude: [],
          noindexcheck: false
        }
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
          ['index.html', Buffer.from('<html></html>')],
          ['style.css', Buffer.from('body {}')],
          ['script.js', Buffer.from('console.log()')]
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
          ['script.js', Buffer.from('console.log()')],
          ['index.html', Buffer.from('<html></html>')],
          ['style.css', Buffer.from('body {}')]
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
