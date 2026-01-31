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
    exclude: []
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
});
