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

describe('formatDryRunRoutes', () => {
  let createSourceEntry: Awaited<ReturnType<typeof import('../../src/index')>>['createSourceEntry'];
  let formatDryRunRoutes: Awaited<ReturnType<typeof import('../../src/index')>>['formatDryRunRoutes'];

  beforeEach(async () => {
    vi.resetModules();
    const module_ = await import('../../src/index');
    createSourceEntry = module_.createSourceEntry;
    formatDryRunRoutes = module_.formatDryRunRoutes;
  });

  it('should return "(no files)" for empty sources', () => {
    expect(formatDryRunRoutes([], 'psychic', '', false)).toBe('  (no files)');
  });

  it('should show "/" as default route when no basePath', () => {
    const source = createSourceEntry(
      'index.html',
      'index_html',
      Buffer.alloc(500),
      Buffer.alloc(300),
      'text/html',
      'h',
      false
    );
    const result = formatDryRunRoutes([source], 'psychic', '', false);
    expect(result).toContain('GET /  ');
    expect(result).toContain('[default]');
  });

  it('should show basePath as default route when basePath is set', () => {
    const source = createSourceEntry(
      'index.html',
      'index_html',
      Buffer.alloc(500),
      Buffer.alloc(300),
      'text/html',
      'h',
      false
    );
    const result = formatDryRunRoutes([source], 'psychic', '/ui', false);
    expect(result).toContain('GET /ui ');
    expect(result).toContain('[default]');
    expect(result).toContain('GET /ui/index.html');
  });

  it('should add [no gzip] tag when isGzip is false', () => {
    const source = createSourceEntry(
      'app.css',
      'app_css',
      Buffer.alloc(500),
      Buffer.alloc(480),
      'text/css',
      'h',
      false
    );
    const result = formatDryRunRoutes([source], 'psychic', '', false);
    expect(result).toContain('[no gzip]');
  });

  it('should show arrow in size cell when isGzip is true', () => {
    const source = createSourceEntry(
      'index.html',
      'index_html',
      Buffer.alloc(2048),
      Buffer.alloc(800),
      'text/html',
      'h',
      true
    );
    const result = formatDryRunRoutes([source], 'psychic', '', false);
    expect(result).toContain('→');
    expect(result).not.toContain('[no gzip]');
  });

  it('should show no arrow in size cell when isGzip is false', () => {
    const source = createSourceEntry(
      'app.css',
      'app_css',
      Buffer.alloc(500),
      Buffer.alloc(480),
      'text/css',
      'h',
      false
    );
    const result = formatDryRunRoutes([source], 'psychic', '', false);
    expect(result).not.toContain('→');
  });

  it('should show SPA catch-all with basePath for psychic engine', () => {
    const source = createSourceEntry(
      'index.html',
      'index_html',
      Buffer.alloc(500),
      Buffer.alloc(300),
      'text/html',
      'h',
      false
    );
    const result = formatDryRunRoutes([source], 'psychic', '/ui', true);
    expect(result).toContain('GET /ui/*');
    expect(result).toContain('[SPA catch-all → index.html]');
  });

  it('should show "(SPA catch-all)" for psychic engine without basePath', () => {
    const source = createSourceEntry(
      'index.html',
      'index_html',
      Buffer.alloc(500),
      Buffer.alloc(300),
      'text/html',
      'h',
      false
    );
    const result = formatDryRunRoutes([source], 'psychic', '', true);
    expect(result).toContain('(SPA catch-all)');
    expect(result).toContain('[SPA catch-all → index.html]');
  });

  it('should show "(SPA catch-all)" for async engine even with basePath', () => {
    const source = createSourceEntry(
      'index.html',
      'index_html',
      Buffer.alloc(500),
      Buffer.alloc(300),
      'text/html',
      'h',
      false
    );
    const result = formatDryRunRoutes([source], 'async', '/ui', true);
    expect(result).toContain('(SPA catch-all)');
    expect(result).not.toContain('/ui/*');
  });

  it('should show "(SPA catch-all)" for webserver engine even with basePath', () => {
    const source = createSourceEntry(
      'index.html',
      'index_html',
      Buffer.alloc(500),
      Buffer.alloc(300),
      'text/html',
      'h',
      false
    );
    const result = formatDryRunRoutes([source], 'webserver', '/ui', true);
    expect(result).toContain('(SPA catch-all)');
    expect(result).not.toContain('/ui/*');
  });

  it('should show "(SPA catch-all)" for espidf engine even with basePath', () => {
    const source = createSourceEntry(
      'index.html',
      'index_html',
      Buffer.alloc(500),
      Buffer.alloc(300),
      'text/html',
      'h',
      false
    );
    const result = formatDryRunRoutes([source], 'espidf', '/ui', true);
    expect(result).toContain('(SPA catch-all)');
    expect(result).not.toContain('/ui/*');
  });

  it('should not add SPA row when spa is false', () => {
    const source = createSourceEntry(
      'index.html',
      'index_html',
      Buffer.alloc(500),
      Buffer.alloc(300),
      'text/html',
      'h',
      false
    );
    const result = formatDryRunRoutes([source], 'psychic', '/ui', false);
    expect(result).not.toContain('[SPA catch-all');
  });

  it('should not add SPA or default rows when no index.html/htm in sources', () => {
    const source = createSourceEntry(
      'app.js',
      'app_js',
      Buffer.alloc(2048),
      Buffer.alloc(800),
      'application/javascript',
      'h',
      true
    );
    const result = formatDryRunRoutes([source], 'psychic', '/ui', true);
    expect(result).not.toContain('[default]');
    expect(result).not.toContain('[SPA catch-all');
  });
});

describe('formatSizePrecise', () => {
  let formatSizePrecise: Awaited<ReturnType<typeof import('../../src/index')>>['formatSizePrecise'];

  beforeEach(async () => {
    const module_ = await import('../../src/index');
    formatSizePrecise = module_.formatSizePrecise;
  });

  it('should return bytes for values under 1024', () => {
    expect(formatSizePrecise(512)).toBe('512B');
  });

  it('should return one-decimal kB for values >= 1024', () => {
    expect(formatSizePrecise(1024)).toBe('1.0kB');
    expect(formatSizePrecise(1536)).toBe('1.5kB');
    expect(formatSizePrecise(10_240)).toBe('10.0kB');
  });
});

const makeAnalyzeSummary = (size: number, gzipsize: number) => ({ filecount: 1, size, gzipsize });

describe('formatAnalyzeTable', () => {
  let createSourceEntry: Awaited<ReturnType<typeof import('../../src/index')>>['createSourceEntry'];
  let formatAnalyzeTable: Awaited<ReturnType<typeof import('../../src/index')>>['formatAnalyzeTable'];

  beforeEach(async () => {
    const module_ = await import('../../src/index');
    createSourceEntry = module_.createSourceEntry;
    formatAnalyzeTable = module_.formatAnalyzeTable;
  });

  it('should include header and separator lines', () => {
    const source = createSourceEntry(
      'app.js',
      'app_js',
      Buffer.from('x'.repeat(2000)),
      Buffer.from('gz'),
      'application/javascript',
      'abc',
      true
    );
    const result = formatAnalyzeTable([source], makeAnalyzeSummary(2000, 2));
    expect(result).toContain('File');
    expect(result).toContain('Original');
    expect(result).toContain('Gzip');
    expect(result).toContain('Total');
  });

  it('should show [no gzip] tag when isGzip is false', () => {
    const source = createSourceEntry(
      'tiny.txt',
      'tiny_txt',
      Buffer.from('hi'),
      Buffer.from('gz'),
      'text/plain',
      'abc',
      false
    );
    const result = formatAnalyzeTable([source], makeAnalyzeSummary(2, 2));
    expect(result).toContain('[no gzip]');
  });

  it('should not show [no gzip] tag when isGzip is true', () => {
    const source = createSourceEntry(
      'app.js',
      'app_js',
      Buffer.from('x'.repeat(2000)),
      Buffer.from('gz'),
      'application/javascript',
      'abc',
      true
    );
    const result = formatAnalyzeTable([source], makeAnalyzeSummary(2000, 2));
    expect(result).not.toContain('[no gzip]');
  });

  it('should show PASS budget row when maxSize is within limit', () => {
    const source = createSourceEntry(
      'app.js',
      'app_js',
      Buffer.from('x'.repeat(100)),
      Buffer.from('gz'),
      'application/javascript',
      'abc',
      false
    );
    const result = formatAnalyzeTable([source], makeAnalyzeSummary(100, 100), 200);
    expect(result).toContain('Budget (maxsize)');
    expect(result).toContain('✓ PASS');
  });

  it('should show FAIL budget row when maxSize is exceeded', () => {
    const source = createSourceEntry(
      'app.js',
      'app_js',
      Buffer.from('x'.repeat(100)),
      Buffer.from('gz'),
      'application/javascript',
      'abc',
      false
    );
    const result = formatAnalyzeTable([source], makeAnalyzeSummary(100, 100), 50);
    expect(result).toContain('Budget (maxsize)');
    expect(result).toContain('✗ FAIL');
  });

  it('should show PASS gzip budget row when maxGzipSize is within limit', () => {
    const source = createSourceEntry(
      'app.js',
      'app_js',
      Buffer.from('x'.repeat(2000)),
      Buffer.from('gz'),
      'application/javascript',
      'abc',
      true
    );
    const result = formatAnalyzeTable([source], makeAnalyzeSummary(2000, 2), undefined, 100);
    expect(result).toContain('Budget (maxgzipsize)');
    expect(result).toContain('✓ PASS');
  });

  it('should show FAIL gzip budget row when maxGzipSize is exceeded', () => {
    const source = createSourceEntry(
      'app.js',
      'app_js',
      Buffer.from('x'.repeat(2000)),
      Buffer.from('gz'),
      'application/javascript',
      'abc',
      true
    );
    const result = formatAnalyzeTable([source], makeAnalyzeSummary(2000, 200), undefined, 100);
    expect(result).toContain('Budget (maxgzipsize)');
    expect(result).toContain('✗ FAIL');
  });

  it('should not include budget rows when no budgets are defined', () => {
    const source = createSourceEntry(
      'app.js',
      'app_js',
      Buffer.from('x'.repeat(100)),
      Buffer.from('gz'),
      'application/javascript',
      'abc',
      false
    );
    const result = formatAnalyzeTable([source], makeAnalyzeSummary(100, 100));
    expect(result).not.toContain('Budget');
  });
});

describe('index.ts main pipeline integration', () => {
  const originalArgv = process.argv;
  const originalExit = process.exit;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

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
    console.warn = vi.fn();

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
    console.warn = originalConsoleWarn;
    vi.resetModules();
  });

  describe('file processing pipeline', () => {
    it('should exit with code 1 when no files found', async () => {
      mockGetFiles.mockReturnValue(new Map());
      vi.resetModules();
      const { main } = await import('../../src/index');
      main();
      expect(process.exit).toHaveBeenCalledWith(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('is empty'));
    });

    it('should process single file correctly', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', makeFileData('<html></html>')]]));
      mockGzipSync.mockReturnValue(Buffer.from('gzipped'));

      vi.resetModules();
      const { main } = await import('../../src/index');
      main();

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
      const { main } = await import('../../src/index');
      main();

      expect(mockGetCppCode).toHaveBeenCalled();
      const sources = mockGetCppCode.mock.calls[0][0];
      expect(sources).toHaveLength(3);
    });

    it('should use pre-computed SHA256 hash from getFiles', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', makeFileData('<html></html>', 'pre-computed-hash')]]));

      vi.resetModules();
      const { main } = await import('../../src/index');
      main();

      expect(mockGetCppCode).toHaveBeenCalled();
      const sources = mockGetCppCode.mock.calls[0][0];
      expect(sources[0].sha256).toBe('pre-computed-hash');
    });

    it('should apply gzip compression with level 9', async () => {
      const content = Buffer.from('<html></html>');
      mockGetFiles.mockReturnValue(new Map([['index.html', { content, hash: 'hash' }]]));

      vi.resetModules();
      const { main } = await import('../../src/index');
      main();

      expect(mockGzipSync).toHaveBeenCalledWith(content, { level: 9 });
    });

    it('should prepend underscore to dataname when filename starts with a digit', async () => {
      mockGetFiles.mockReturnValue(new Map([['1app.js', makeFileData('console.log()')]]));

      vi.resetModules();
      const { main } = await import('../../src/index');
      main();

      const sources = mockGetCppCode.mock.calls[0][0];
      expect(sources[0].dataname).toBe('_1app_js');
    });

    it('should not prepend underscore to dataname when filename starts with a letter', async () => {
      mockGetFiles.mockReturnValue(new Map([['app.js', makeFileData('console.log()')]]));

      vi.resetModules();
      const { main } = await import('../../src/index');
      main();

      const sources = mockGetCppCode.mock.calls[0][0];
      expect(sources[0].dataname).toBe('app_js');
    });
  });

  describe('file writing', () => {
    it('should create output directory if missing', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', makeFileData('<html></html>')]]));

      vi.resetModules();
      const { main } = await import('../../src/index');
      main();

      expect(mockMkdirSync).toHaveBeenCalled();
      expect(mockMkdirSync.mock.calls[0][1]).toEqual({ recursive: true });
    });

    it('should write C++ header file with correct encoding', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', makeFileData('<html></html>')]]));

      vi.resetModules();
      const { main } = await import('../../src/index');
      main();

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
      const { main } = await import('../../src/index');
      main();

      expect(console.log).toHaveBeenCalledWith('Collecting source files');
    });

    it('should log "Translation to header file"', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', makeFileData('<html></html>')]]));

      vi.resetModules();
      const { main } = await import('../../src/index');
      main();

      expect(console.log).toHaveBeenCalledWith('Translation to header file');
    });

    it('should log summary statistics', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', makeFileData('<html></html>')]]));

      vi.resetModules();
      const { main } = await import('../../src/index');
      main();

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('files'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('original size'));
    });

    it('should log output file path and size', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', makeFileData('<html></html>')]]));

      vi.resetModules();
      const { main } = await import('../../src/index');
      main();

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('/test/output.h'));
    });
  });

  describe('engine-specific hints', () => {
    it('should show max_uri_handlers hint for psychic engine', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', makeFileData('<html></html>')]]));

      vi.resetModules();
      const { main } = await import('../../src/index');
      main();

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
      const { main } = await import('../../src/index');
      main();

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
      const { main } = await import('../../src/index');
      main();

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
      const { main } = await import('../../src/index');
      main();

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
      const { main } = await import('../../src/index');
      main();

      const filesByExtension = mockGetCppCode.mock.calls[0][1];
      const extensions = filesByExtension.map((group: ExtensionGroup) => group.extension);
      expect(extensions).toEqual(['CSS', 'HTML', 'JS']);
    });
  });

  describe('dry-run mode', () => {
    beforeEach(() => {
      mockGetFiles.mockReturnValue(new Map([['index.html', makeFileData('<html></html>')]]));
      mockGzipSync.mockReturnValue(Buffer.from('gz'));
    });

    it('should not write file in dry-run mode', async () => {
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'true',
          basePath: '',
          spa: false,
          dryRun: true,
          exclude: [],
          noindexcheck: false,
          espmethod: 'initSvelteStaticFiles'
        }
      }));

      vi.resetModules();
      const { main } = await import('../../src/index');
      main();

      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('should log header line with engine, etag, gzip, base, spa info', async () => {
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'compiler',
          basePath: '/ui',
          spa: true,
          dryRun: true,
          exclude: [],
          noindexcheck: false,
          espmethod: 'initSvelteStaticFiles'
        }
      }));

      vi.resetModules();
      const { main } = await import('../../src/index');
      main();

      const mockLog = vi.mocked(console.log);
      const allLogs = mockLog.mock.calls.map((call) => call[0]).filter((l): l is string => typeof l === 'string');
      const headerLine = allLogs.find((l) => l.includes('[DRY RUN] Engine:'));
      expect(headerLine).toBeDefined();
      expect(headerLine).toContain('Engine: psychic');
      expect(headerLine).toContain('ETag: true');
      expect(headerLine).toContain('Gzip: compiler');
      expect(headerLine).toContain('Base: /ui');
      expect(headerLine).toContain('SPA: yes');
    });

    it('should log "[DRY RUN] Routes:" line', async () => {
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'true',
          basePath: '',
          spa: false,
          dryRun: true,
          exclude: [],
          noindexcheck: false,
          espmethod: 'initSvelteStaticFiles'
        }
      }));

      vi.resetModules();
      const { main } = await import('../../src/index');
      main();

      expect(console.log).toHaveBeenCalledWith('[DRY RUN] Routes:');
    });

    it('should log route lines containing "GET /"', async () => {
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'true',
          basePath: '',
          spa: false,
          dryRun: true,
          exclude: [],
          noindexcheck: false,
          espmethod: 'initSvelteStaticFiles'
        }
      }));

      vi.resetModules();
      const { main } = await import('../../src/index');
      main();

      const mockLog = vi.mocked(console.log);
      const allLogs = mockLog.mock.calls.map((call) => call[0]).filter((l): l is string => typeof l === 'string');
      const hasRoutes = allLogs.some((l) => l.includes('GET /'));
      expect(hasRoutes).toBe(true);
    });

    it('should show "Base: (none)" when basePath is empty', async () => {
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'async',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'false',
          gzip: 'false',
          basePath: '',
          spa: false,
          dryRun: true,
          exclude: [],
          noindexcheck: false,
          espmethod: 'initSvelteStaticFiles'
        }
      }));

      vi.resetModules();
      const { main } = await import('../../src/index');
      main();

      const mockLog = vi.mocked(console.log);
      const allLogs = mockLog.mock.calls.map((call) => call[0]).filter((l): l is string => typeof l === 'string');
      const headerLine = allLogs.find((l) => l.includes('[DRY RUN] Engine:'));
      expect(headerLine).toContain('Base: (none)');
    });
  });

  describe('--spa warning', () => {
    it('should warn when --spa is set but no index.html or index.htm exists', async () => {
      mockGetFiles.mockReturnValue(new Map([['app.js', makeFileData('console.log()')]]));
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'true',
          basePath: '',
          spa: true,
          dryRun: false,
          exclude: [],
          noindexcheck: false,
          espmethod: 'initSvelteStaticFiles'
        }
      }));
      vi.resetModules();
      const { main } = await import('../../src/index');
      main();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('--spa is set but no index.html/index.htm found')
      );
    });

    it('should not warn when --spa is set and index.html exists', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.html', makeFileData('<html></html>')]]));
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'true',
          basePath: '',
          spa: true,
          dryRun: false,
          exclude: [],
          noindexcheck: false,
          espmethod: 'initSvelteStaticFiles'
        }
      }));
      vi.resetModules();
      const { main } = await import('../../src/index');
      main();
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('should not warn when --spa is set and index.htm exists', async () => {
      mockGetFiles.mockReturnValue(new Map([['index.htm', makeFileData('<html></html>')]]));
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'true',
          basePath: '',
          spa: true,
          dryRun: false,
          exclude: [],
          noindexcheck: false,
          espmethod: 'initSvelteStaticFiles'
        }
      }));
      vi.resetModules();
      const { main } = await import('../../src/index');
      main();
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('should not warn when --spa is false even if no index.html exists', async () => {
      mockGetFiles.mockReturnValue(new Map([['app.js', makeFileData('console.log()')]]));
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'true',
          basePath: '',
          spa: false,
          dryRun: false,
          exclude: [],
          noindexcheck: false,
          espmethod: 'initSvelteStaticFiles'
        }
      }));
      vi.resetModules();
      const { main } = await import('../../src/index');
      main();
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe('size budget enforcement', () => {
    it('should exit with code 1 when total uncompressed size exceeds maxSize', async () => {
      mockGetFiles.mockReturnValue(new Map([['app.js', makeFileData('x'.repeat(100))]]));
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'true',
          basePath: '',
          spa: false,
          dryRun: false,
          exclude: [],
          noindexcheck: false,
          espmethod: 'initSvelteStaticFiles',
          maxSize: 50
        }
      }));
      vi.resetModules();
      const { main } = await import('../../src/index');
      main();
      expect(process.exit).toHaveBeenCalledWith(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Uncompressed size budget exceeded'));
    });

    it('should not exit when total uncompressed size is within maxSize', async () => {
      mockGetFiles.mockReturnValue(new Map([['app.js', makeFileData('x'.repeat(100))]]));
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'true',
          basePath: '',
          spa: false,
          dryRun: false,
          exclude: [],
          noindexcheck: false,
          espmethod: 'initSvelteStaticFiles',
          maxSize: 200
        }
      }));
      vi.resetModules();
      const { main } = await import('../../src/index');
      main();
      expect(process.exit).not.toHaveBeenCalledWith(1);
      expect(console.error).not.toHaveBeenCalledWith(expect.stringContaining('Uncompressed size budget exceeded'));
    });

    it('should not exit when total uncompressed size exactly equals maxSize (boundary: > not >=)', async () => {
      mockGetFiles.mockReturnValue(new Map([['app.js', makeFileData('x'.repeat(100))]]));
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'true',
          basePath: '',
          spa: false,
          dryRun: false,
          exclude: [],
          noindexcheck: false,
          espmethod: 'initSvelteStaticFiles',
          maxSize: 100
        }
      }));
      vi.resetModules();
      const { main } = await import('../../src/index');
      main();
      expect(process.exit).not.toHaveBeenCalledWith(1);
    });

    it('should exit with code 1 when total gzip size exceeds maxGzipSize', async () => {
      mockGetFiles.mockReturnValue(new Map([['app.js', makeFileData('x'.repeat(100))]]));
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'true',
          basePath: '',
          spa: false,
          dryRun: false,
          exclude: [],
          noindexcheck: false,
          espmethod: 'initSvelteStaticFiles',
          maxGzipSize: 50
        }
      }));
      vi.resetModules();
      const { main } = await import('../../src/index');
      main();
      expect(process.exit).toHaveBeenCalledWith(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Gzip size budget exceeded'));
    });

    it('should not exit when total gzip size is within maxGzipSize', async () => {
      mockGetFiles.mockReturnValue(new Map([['app.js', makeFileData('x'.repeat(100))]]));
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'true',
          basePath: '',
          spa: false,
          dryRun: false,
          exclude: [],
          noindexcheck: false,
          espmethod: 'initSvelteStaticFiles',
          maxGzipSize: 200
        }
      }));
      vi.resetModules();
      const { main } = await import('../../src/index');
      main();
      expect(process.exit).not.toHaveBeenCalledWith(1);
      expect(console.error).not.toHaveBeenCalledWith(expect.stringContaining('Gzip size budget exceeded'));
    });

    it('should exit with code 1 when maxSize is exceeded (first budget check wins)', async () => {
      mockGetFiles.mockReturnValue(new Map([['app.js', makeFileData('x'.repeat(100))]]));
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'true',
          basePath: '',
          spa: false,
          dryRun: false,
          exclude: [],
          noindexcheck: false,
          espmethod: 'initSvelteStaticFiles',
          maxSize: 50,
          maxGzipSize: 50
        }
      }));
      vi.resetModules();
      const { main } = await import('../../src/index');
      main();
      expect(process.exit).toHaveBeenCalledWith(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Uncompressed size budget exceeded'));
      expect(process.exit).toHaveBeenCalledTimes(1);
    });

    it('should not check size budget when maxSize is undefined', async () => {
      mockGetFiles.mockReturnValue(new Map([['app.js', makeFileData('x'.repeat(10_000))]]));
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'true',
          basePath: '',
          spa: false,
          dryRun: false,
          exclude: [],
          noindexcheck: false,
          espmethod: 'initSvelteStaticFiles'
        }
      }));
      vi.resetModules();
      const { main } = await import('../../src/index');
      main();
      expect(process.exit).not.toHaveBeenCalledWith(1);
      expect(console.error).not.toHaveBeenCalledWith(expect.stringContaining('size budget exceeded'));
    });
  });

  describe('analyze mode', () => {
    beforeEach(() => {
      mockGetFiles.mockReturnValue(new Map([['index.html', makeFileData('<html></html>')]]));
      mockGzipSync.mockReturnValue(Buffer.from('gz'));
    });

    it('should not write file in analyze mode', async () => {
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'true',
          basePath: '',
          spa: false,
          analyze: true,
          exclude: [],
          noindexcheck: false,
          espmethod: 'initSvelteStaticFiles'
        }
      }));
      vi.resetModules();
      const { main } = await import('../../src/index');
      main();
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('should not call process.exit(1) when no budget defined', async () => {
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'true',
          basePath: '',
          spa: false,
          analyze: true,
          exclude: [],
          noindexcheck: false,
          espmethod: 'initSvelteStaticFiles'
        }
      }));
      vi.resetModules();
      const { main } = await import('../../src/index');
      main();
      expect(process.exit).not.toHaveBeenCalledWith(1);
    });

    it('should not call process.exit(1) when within budget', async () => {
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'true',
          basePath: '',
          spa: false,
          analyze: true,
          maxSize: 100_000,
          maxGzipSize: 100_000,
          exclude: [],
          noindexcheck: false,
          espmethod: 'initSvelteStaticFiles'
        }
      }));
      vi.resetModules();
      const { main } = await import('../../src/index');
      main();
      expect(process.exit).not.toHaveBeenCalledWith(1);
    });

    it('should exit 1 when maxSize exceeded', async () => {
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'true',
          basePath: '',
          spa: false,
          analyze: true,
          maxSize: 1,
          exclude: [],
          noindexcheck: false,
          espmethod: 'initSvelteStaticFiles'
        }
      }));
      vi.resetModules();
      const { main } = await import('../../src/index');
      main();
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should exit 1 when maxGzipSize exceeded', async () => {
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'true',
          basePath: '',
          spa: false,
          analyze: true,
          maxGzipSize: 1,
          exclude: [],
          noindexcheck: false,
          espmethod: 'initSvelteStaticFiles'
        }
      }));
      vi.resetModules();
      const { main } = await import('../../src/index');
      main();
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should output a line containing "Total" in console.log', async () => {
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'true',
          basePath: '',
          spa: false,
          analyze: true,
          exclude: [],
          noindexcheck: false,
          espmethod: 'initSvelteStaticFiles'
        }
      }));
      vi.resetModules();
      const { main } = await import('../../src/index');
      main();
      const mockLog = vi.mocked(console.log);
      const allLogs = mockLog.mock.calls.map((call) => call[0]).filter((l): l is string => typeof l === 'string');
      expect(allLogs.some((l) => l.includes('Total'))).toBe(true);
    });

    it('should not reach budget validation that calls console.error when over budget', async () => {
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          sourcepath: '/test/dist',
          outputfile: '/test/output.h',
          etag: 'true',
          gzip: 'true',
          basePath: '',
          spa: false,
          analyze: true,
          maxSize: 1,
          exclude: [],
          noindexcheck: false,
          espmethod: 'initSvelteStaticFiles'
        }
      }));
      vi.resetModules();
      const { main } = await import('../../src/index');
      main();
      expect(console.error).not.toHaveBeenCalledWith(expect.stringContaining('budget exceeded'));
    });
  });
});
