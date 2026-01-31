import { describe, expect, it, vi } from 'vitest';

import { CppCodeSource, CppCodeSources, ExtensionGroups, getCppCode } from '../../src/cppCode';

vi.mock('../../src/commandLine', () => ({
  cmdLine: {
    sourcepath: '/test/path',
    outputfile: '/test/output.h',
    engine: 'psychic',
    etag: 'true',
    gzip: 'true',
    cachetime: 86_400,
    created: false,
    version: 'v1.0.0',
    espmethod: 'initSvelteStaticFiles',
    define: 'SVELTEESP32',
    exclude: [],
    basePath: ''
  },
  formatConfiguration: vi.fn((cmdLine) => {
    return `engine=${cmdLine.engine} sourcepath=${cmdLine.sourcepath} outputfile=${cmdLine.outputfile} etag=${cmdLine.etag} gzip=${cmdLine.gzip} cachetime=${cmdLine.cachetime}`;
  })
}));

const createMockSource = (filename: string, content: string): CppCodeSource => ({
  filename,
  dataname: filename.replaceAll(/[^\dA-Za-z]/g, '_'),
  datanameUpperCase: filename.replaceAll(/[^\dA-Za-z]/g, '_').toUpperCase(),
  mime: 'text/html',
  content: Buffer.from(content),
  contentGzip: Buffer.from('gzipped'),
  isGzip: true,
  sha256: 'abc123'
});

describe('cppCode', () => {
  const mockFilesByExtension: ExtensionGroups = [
    { extension: 'HTML', count: 1 },
    { extension: 'CSS', count: 1 }
  ];

  describe('getCppCode', () => {
    it('should generate C++ code with basic structure', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('PsychicHttpServer');
      expect(result).toContain('initSvelteStaticFiles');
      expect(result).toContain('SVELTEESP32_COUNT 1');
    });

    it('should include version when specified', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('#define SVELTEESP32_VERSION "v1.0.0"');
    });

    it('should generate file count and size defines', () => {
      const sources: CppCodeSources = [
        createMockSource('index.html', '<html></html>'),
        createMockSource('style.css', 'body{}')
      ];

      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('#define SVELTEESP32_COUNT 2');
      expect(result).toContain('#define SVELTEESP32_SIZE');
      expect(result).toContain('#define SVELTEESP32_SIZE_GZIP');
    });

    it('should generate file defines for each source', () => {
      const sources: CppCodeSources = [
        createMockSource('index.html', '<html></html>'),
        createMockSource('style.css', 'body{}')
      ];

      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('#define SVELTEESP32_FILE_INDEX_HTML');
      expect(result).toContain('#define SVELTEESP32_FILE_STYLE_CSS');
    });

    it('should generate extension count defines', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('#define SVELTEESP32_HTML_FILES 1');
      expect(result).toContain('#define SVELTEESP32_CSS_FILES 1');
    });

    it('should generate data arrays for gzip', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('const uint8_t datagzip_index_html');
      expect(result).toContain('103,122,105,112,112,101,100');
    });

    it('should generate etag arrays when enabled', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('const char * etag_index_html = "abc123"');
    });

    it('should generate route handlers for each file', () => {
      const sources: CppCodeSources = [createMockSource('test.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('server->on("/test.html", HTTP_GET');
    });

    it('should detect default route for index.html', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('server->defaultEndpoint =');
    });

    it('should detect default route for index.htm', () => {
      const sources: CppCodeSources = [createMockSource('index.htm', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('server->defaultEndpoint =');
    });

    it('should include etag validation code when etag is enabled', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('If-None-Match');
      expect(result).toContain('response304.setCode(304)');
    });

    it('should include content encoding header for gzipped files', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('Content-Encoding');
    });

    it('should include cache control headers', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('Cache-Control');
      expect(result).toContain('max-age=86400');
    });

    it('should set correct MIME type', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('setContentType("text/html")');
    });

    it('should convert buffer to byte array correctly', () => {
      const source = createMockSource('test.txt', 'ABC');
      const sources: CppCodeSources = [source];

      const result = getCppCode(sources, mockFilesByExtension);

      // When gzip is enabled (default), it uses the gzipped content
      expect(result).toContain('103,122,105,112,112,101,100'); // "gzipped" as bytes
    });

    it('should handle empty files', () => {
      const sources: CppCodeSources = [createMockSource('empty.txt', '')];

      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('SVELTEESP32_COUNT 1');
    });

    it('should handle multiple files', () => {
      const sources: CppCodeSources = [
        createMockSource('index.html', '<html></html>'),
        createMockSource('style.css', 'body{}'),
        createMockSource('script.js', 'console.log()')
      ];

      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('index.html');
      expect(result).toContain('style.css');
      expect(result).toContain('script.js');
      expect(result).toContain('SVELTEESP32_COUNT 3');
    });
  });

  describe('template selection', () => {
    it('should use psychic template for psychic engine', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          etag: 'true',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: []
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('PsychicHttpServer');
      expect(result).toContain('PsychicResponse response(request)');
    });

    it('should use psychic2 template for psychic2 engine', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic2',
          etag: 'true',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: []
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('PsychicHttpServerV2');
      expect(result).toContain('PsychicRequest * request, PsychicResponse * response');
    });

    it('should use async template for async engine', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'async',
          etag: 'true',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: []
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('ESPAsyncWebServer');
      expect(result).toContain('AsyncWebServerRequest');
      expect(result).toContain('PROGMEM');
    });

    it('should use espidf template for espidf engine', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'espidf',
          etag: 'true',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: []
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('esp_http_server.h');
      expect(result).toContain('httpd_handle_t');
    });
  });

  describe('etag and gzip combinations', () => {
    it('should handle etag=false gzip=false', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          etag: 'false',
          gzip: 'false',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: []
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).not.toContain('If-None-Match');
      expect(result).toContain('const uint8_t data_index_html');
      expect(result).not.toContain('const uint8_t datagzip_');
    });

    it('should handle etag=compiler gzip=compiler', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          etag: 'compiler',
          gzip: 'compiler',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: []
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('#ifdef SVELTEESP32_ENABLE_ETAG');
      expect(result).toContain('#ifdef SVELTEESP32_ENABLE_GZIP');
    });
  });

  describe('template switch/case helpers', () => {
    it('should handle etag=true case in switch', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          sourcepath: '/test/path',
          outputfile: '/test/output.h',
          engine: 'psychic',
          etag: 'true',
          gzip: 'false',
          cachetime: 0,
          noindexcheck: false,
          exclude: [],
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32'
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      // When etag=true, should have SHA256 hash definition
      expect(result).toContain('abc123');
    });

    it('should handle etag=false case in switch', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          sourcepath: '/test/path',
          outputfile: '/test/output.h',
          engine: 'psychic',
          etag: 'false',
          gzip: 'false',
          cachetime: 0,
          noindexcheck: false,
          exclude: [],
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32'
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      // When etag=false, should not check etag headers
      expect(result).not.toContain('If-None-Match');
    });

    it('should handle gzip=true case in switch for async engine', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          sourcepath: '/test/path',
          outputfile: '/test/output.h',
          engine: 'async',
          etag: 'false',
          gzip: 'true',
          cachetime: 0,
          noindexcheck: false,
          exclude: [],
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32'
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      // When gzip=true, should have content-encoding header
      expect(result).toContain('gzip');
    });

    it('should handle gzip=false case in switch', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          sourcepath: '/test/path',
          outputfile: '/test/output.h',
          engine: 'psychic',
          etag: 'false',
          gzip: 'false',
          cachetime: 0,
          noindexcheck: false,
          exclude: [],
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32'
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      // When gzip=false, should not have gzip-specific code
      expect(result).toBeTruthy();
    });

    it('should handle compiler case for both etag and gzip', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          sourcepath: '/test/path',
          outputfile: '/test/output.h',
          engine: 'psychic',
          etag: 'compiler',
          gzip: 'compiler',
          cachetime: 0,
          noindexcheck: false,
          exclude: [],
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32'
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      // When etag/gzip=compiler, should have #ifdef directives
      expect(result).toContain('#ifdef');
    });

    it('should handle espidf engine with etag and gzip switches', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          sourcepath: '/test/path',
          outputfile: '/test/output.h',
          engine: 'espidf',
          etag: 'true',
          gzip: 'true',
          cachetime: 0,
          noindexcheck: false,
          exclude: [],
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32'
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      // espidf should have specific handler structure
      expect(result).toContain('httpd_req_t');
    });

    it('should handle all engines in switch statement', async () => {
      const engines = ['psychic', 'psychic2', 'async', 'espidf'];

      for (const engine of engines) {
        vi.resetModules();
        vi.doMock('../../src/commandLine', () => ({
          cmdLine: {
            sourcepath: '/test/path',
            outputfile: '/test/output.h',
            engine,
            etag: 'true',
            gzip: 'true',
            cachetime: 0,
            noindexcheck: false,
            exclude: [],
            espmethod: 'initSvelteStaticFiles',
            define: 'SVELTEESP32'
          },
          formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
        }));

        const { getCppCode } = await import('../../src/cppCode');
        const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
        const result = getCppCode(sources, mockFilesByExtension);

        expect(result).toBeTruthy();
        expect(result.length).toBeGreaterThan(0);
      }
    });

    it('should handle multiple case statements in switch correctly', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          sourcepath: '/test/path',
          outputfile: '/test/output.h',
          engine: 'psychic2',
          etag: 'compiler',
          gzip: 'compiler',
          cachetime: 0,
          noindexcheck: false,
          exclude: [],
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32'
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      // Should handle psychic2 engine with compiler directives
      expect(result).toContain('PsychicHttpServer');
      expect(result).toContain('#ifdef');
    });
  });

  describe('file manifest', () => {
    it('should generate manifest struct and array', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('struct SVELTEESP32_FileInfo');
      expect(result).toContain('const char* path');
      expect(result).toContain('uint32_t size');
      expect(result).toContain('uint32_t gzipSize');
      expect(result).toContain('const char* etag');
      expect(result).toContain('const char* contentType');
      expect(result).toContain('const SVELTEESP32_FileInfo SVELTEESP32_FILES[]');
      expect(result).toContain('const size_t SVELTEESP32_FILE_COUNT');
    });

    it('should include correct file path in manifest', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('{ "/index.html"');
    });

    it('should include correct size values in manifest', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension);

      // Original size is 13 bytes ("<html></html>")
      expect(result).toContain(', 13,');
    });

    it('should include gzip size when file is gzipped', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension);

      // Gzipped content is "gzipped" which is 7 bytes
      expect(result).toContain(', 7,');
    });

    it('should have gzipSize of 0 when file is not gzipped', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          etag: 'true',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: []
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      // Create a source that is NOT gzipped (isGzip: false)
      const source: CppCodeSource = {
        filename: 'small.txt',
        dataname: 'small_txt',
        datanameUpperCase: 'SMALL_TXT',
        mime: 'text/plain',
        content: Buffer.from('hi'),
        contentGzip: Buffer.from('hi'), // Same as content - not actually gzipped
        isGzip: false, // File is NOT gzipped
        sha256: 'def456'
      };

      const result = getCppCode([source], mockFilesByExtension);

      // When isGzip is false, gzipSize should be 0
      expect(result).toMatch(/{ "\/small\.txt", 2, 0,/);
    });

    it('should reference etag variable when etag is enabled', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('etag_index_html,');
    });

    it('should use nullptr for etag when etag is disabled', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          etag: 'false',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: []
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('NULL,');
      expect(result).not.toContain('etag_index_html,');
    });

    it('should include content type in manifest', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('"text/html"');
    });

    it('should use custom definePrefix in manifest', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          etag: 'true',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'MYAPP',
          exclude: []
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('struct MYAPP_FileInfo');
      expect(result).toContain('const MYAPP_FileInfo MYAPP_FILES[]');
      expect(result).toContain('const size_t MYAPP_FILE_COUNT');
    });

    it('should generate manifest entries for multiple files', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          etag: 'true',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: []
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [
        createMockSource('index.html', '<html></html>'),
        createMockSource('style.css', 'body{}')
      ];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('{ "/index.html"');
      expect(result).toContain('{ "/style.css"');
    });

    it('should generate manifest for async engine', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'async',
          etag: 'true',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: []
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('struct SVELTEESP32_FileInfo');
      expect(result).toContain('SVELTEESP32_FILES[]');
    });

    it('should generate manifest for espidf engine', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'espidf',
          etag: 'true',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: []
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      // ESP-IDF uses C-compatible typedef struct syntax
      expect(result).toContain('typedef struct {');
      expect(result).toContain('} SVELTEESP32_FileInfo;');
      expect(result).toContain('SVELTEESP32_FILES[]');
      expect(result).toContain('SVELTEESP32_FILE_COUNT');
    });

    it('should reference etag for compiler mode in manifest', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          etag: 'compiler',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: []
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      // When etag is 'compiler', we still reference the etag variable (it exists conditionally)
      expect(result).toContain('etag_index_html,');
    });
  });

  describe('basePath support', () => {
    it('should prefix routes with basePath for psychic engine', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          etag: 'true',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: [],
          basePath: '/ui'
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('server->on("/ui/index.html", HTTP_GET');
      expect(result).toContain('SVELTEESP32_onFileServed("/ui/index.html", 200)');
      expect(result).toContain('SVELTEESP32_onFileServed("/ui/index.html", 304)');
    });

    it('should create basePath route for index.html when basePath is set', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          etag: 'true',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: [],
          basePath: '/admin'
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      // Should have handler for /admin (without index.html)
      expect(result).toContain('server->on("/admin", HTTP_GET');
      expect(result).toContain('SVELTEESP32_onFileServed("/admin", 200)');
    });

    it('should not use defaultEndpoint when basePath is set', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          etag: 'true',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: [],
          basePath: '/ui'
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      // Should NOT use defaultEndpoint when basePath is set
      expect(result).not.toContain('server->defaultEndpoint =');
    });

    it('should use defaultEndpoint when basePath is empty', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          etag: 'true',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: [],
          basePath: ''
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      // Should use defaultEndpoint when basePath is empty
      expect(result).toContain('server->defaultEndpoint =');
    });

    it('should include basePath in manifest paths', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          etag: 'true',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: [],
          basePath: '/app'
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('{ "/app/index.html"');
    });

    it('should prefix routes with basePath for async engine', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'async',
          etag: 'true',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: [],
          basePath: '/ui'
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('server->on("/ui/index.html", HTTP_GET');
      expect(result).toContain('server->on("/ui", HTTP_GET'); // Default route
      expect(result).toContain('SVELTEESP32_onFileServed("/ui/index.html", 200)');
      expect(result).toContain('SVELTEESP32_onFileServed("/ui", 200)');
    });

    it('should prefix routes with basePath for espidf engine', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'espidf',
          etag: 'true',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: [],
          basePath: '/admin'
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('.uri = "/admin/index.html"');
      expect(result).toContain('.uri = "/admin"'); // Default route
      expect(result).toContain('{ "/admin/index.html"'); // Manifest
    });

    it('should prefix routes with basePath for psychic2 engine', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic2',
          etag: 'true',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: [],
          basePath: '/dashboard'
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('server->on("/dashboard/index.html", HTTP_GET');
      expect(result).toContain('server->on("/dashboard", HTTP_GET'); // Default route
      expect(result).toContain('SVELTEESP32_onFileServed("/dashboard/index.html", 200)');
    });

    it('should generate hook call for basePath default route in psychic2 engine', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic2',
          etag: 'true',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: [],
          basePath: '/admin'
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      // Verify the basePath default route handler has the hook call with 200
      expect(result).toContain('SVELTEESP32_onFileServed("/admin", 200)');
      // Verify it also has response->send() in the basePath handler
      expect(result).toContain('return response->send();');
    });

    it('should generate 304 hook call for basePath default route in psychic2 engine with etag', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic2',
          etag: 'true',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: [],
          basePath: '/panel'
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      // Verify the basePath default route handler has the 304 hook call
      expect(result).toContain('SVELTEESP32_onFileServed("/panel", 304)');
      expect(result).toContain('SVELTEESP32_onFileServed("/panel", 200)');
    });
  });

  describe('onFileServed hook', () => {
    it('should generate weak hook function declaration for psychic engine', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain(
        'extern "C" void __attribute__((weak)) SVELTEESP32_onFileServed(const char* path, int statusCode) {}'
      );
    });

    it('should generate hook call with status 200 before content response', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('SVELTEESP32_onFileServed("/index.html", 200)');
    });

    it('should generate hook call with status 304 before cache hit response', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('SVELTEESP32_onFileServed("/index.html", 304)');
    });

    it('should use custom definePrefix in hook', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          etag: 'true',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'MYAPP',
          exclude: []
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain(
        'extern "C" void __attribute__((weak)) MYAPP_onFileServed(const char* path, int statusCode) {}'
      );
      expect(result).toContain('MYAPP_onFileServed("/index.html", 200)');
      expect(result).toContain('MYAPP_onFileServed("/index.html", 304)');
    });

    it('should generate hook for psychic2 engine', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic2',
          etag: 'true',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: []
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain(
        'extern "C" void __attribute__((weak)) SVELTEESP32_onFileServed(const char* path, int statusCode) {}'
      );
      expect(result).toContain('SVELTEESP32_onFileServed("/index.html", 200)');
      expect(result).toContain('SVELTEESP32_onFileServed("/index.html", 304)');
    });

    it('should generate hook for async engine', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'async',
          etag: 'true',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: []
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain(
        'extern "C" void __attribute__((weak)) SVELTEESP32_onFileServed(const char* path, int statusCode) {}'
      );
      expect(result).toContain('SVELTEESP32_onFileServed("/index.html", 200)');
      expect(result).toContain('SVELTEESP32_onFileServed("/index.html", 304)');
    });

    it('should generate C-style hook for espidf engine', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'espidf',
          etag: 'true',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: []
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      // ESP-IDF uses C-style weak function (no extern "C")
      expect(result).toContain(
        '__attribute__((weak)) void SVELTEESP32_onFileServed(const char* path, int statusCode) {}'
      );
      expect(result).toContain('SVELTEESP32_onFileServed("/index.html", 200)');
      expect(result).toContain('SVELTEESP32_onFileServed("/index.html", 304)');
    });

    it('should generate hook calls with compiler etag mode', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          etag: 'compiler',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: []
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      // Should have hook declaration
      expect(result).toContain('SVELTEESP32_onFileServed');
      // Should have 200 hook call
      expect(result).toContain('SVELTEESP32_onFileServed("/index.html", 200)');
      // Should have 304 hook call inside #ifdef
      expect(result).toContain('SVELTEESP32_onFileServed("/index.html", 304)');
    });

    it('should not generate 304 hook calls when etag is false', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'psychic',
          etag: 'false',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: []
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      // Should have hook declaration
      expect(result).toContain('SVELTEESP32_onFileServed');
      // Should have 200 hook call
      expect(result).toContain('SVELTEESP32_onFileServed("/index.html", 200)');
      // Should NOT have 304 hook call (no etag validation)
      expect(result).not.toContain('SVELTEESP32_onFileServed("/index.html", 304)');
    });

    it('should generate hook calls for "/" route in async engine', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'async',
          etag: 'true',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'SVELTEESP32',
          exclude: []
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      // Async engine has a separate handler for "/" that should also have hooks
      expect(result).toContain('SVELTEESP32_onFileServed("/", 200)');
      expect(result).toContain('SVELTEESP32_onFileServed("/", 304)');
    });
  });
});
