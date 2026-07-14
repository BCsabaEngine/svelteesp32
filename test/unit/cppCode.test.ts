import { describe, expect, it } from 'vitest';

import type { ICopyFilesArguments } from '../../src/commandLine';
import {
  computeRouteCount,
  type CppCodeSource,
  type CppCodeSources,
  type ExtensionGroups,
  getCppCode
} from '../../src/cppCode';

const mockOptions: ICopyFilesArguments = {
  sourcepath: '/test/path',
  outputfile: '/test/output.h',
  engine: 'psychic',
  etag: 'always',
  gzip: 'always',
  cachetime: 86_400,
  cachetimeHtml: undefined,
  cachetimeAssets: undefined,
  created: false,
  version: 'v1.0.0',
  espmethod: 'initSvelteStaticFiles',
  define: 'SVELTEESP32',
  exclude: [],
  basePath: '',
  spa: false,
  configSource: 'cli'
};

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

const createMockAssetSource = (filename: string, content: string): CppCodeSource => ({
  ...createMockSource(filename, content),
  mime: 'text/css'
});

describe('computeRouteCount (issue #120)', () => {
  const sourcesWithIndex: CppCodeSources = [
    createMockSource('index.html', '<html></html>'),
    createMockAssetSource('style.css', 'body{}')
  ];
  const sourcesWithoutIndex: CppCodeSources = [
    createMockAssetSource('app.js', 'console.log()'),
    createMockAssetSource('style.css', 'body{}')
  ];

  it('espidf/async/webserver: counts the default-route registration unconditionally when index.html is present', () => {
    expect(computeRouteCount(sourcesWithIndex, 'espidf', '', false)).toBe(3);
    expect(computeRouteCount(sourcesWithIndex, 'async', '/ui', false)).toBe(3);
    expect(computeRouteCount(sourcesWithIndex, 'webserver', '', false)).toBe(3);
  });

  it('espidf/async/webserver: adds one more handler for the SPA catch-all', () => {
    expect(computeRouteCount(sourcesWithIndex, 'espidf', '', true)).toBe(4);
  });

  it('does not add default-route/SPA extras when there is no index.html/index.htm', () => {
    expect(computeRouteCount(sourcesWithoutIndex, 'espidf', '', true)).toBe(2);
  });

  it('psychic: aliases the default route (no extra) when basePath is empty', () => {
    expect(computeRouteCount(sourcesWithIndex, 'psychic', '', false)).toBe(2);
    expect(computeRouteCount(sourcesWithIndex, 'psychic', '', true)).toBe(2);
  });

  it('psychic: counts the extra default-route and SPA catch-all only when basePath is set', () => {
    expect(computeRouteCount(sourcesWithIndex, 'psychic', '/ui', false)).toBe(3);
    // the SPA catch-all is registered once for HTTP_GET and once for HTTP_HEAD
    expect(computeRouteCount(sourcesWithIndex, 'psychic', '/ui', true)).toBe(5);
  });
});

describe('cppCode', () => {
  const mockFilesByExtension: ExtensionGroups = [
    { extension: 'HTML', count: 1 },
    { extension: 'CSS', count: 1 }
  ];

  describe('getCppCode', () => {
    it('should generate C++ code with basic structure', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('PsychicHttpServer');
      expect(result).toContain('initSvelteStaticFiles');
      expect(result).toContain('SVELTEESP32_COUNT 1');
    });

    it('should include version when specified', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('#define SVELTEESP32_VERSION "v1.0.0"');
    });

    it('should generate file count and size defines', () => {
      const sources: CppCodeSources = [
        createMockSource('index.html', '<html></html>'),
        createMockSource('style.css', 'body{}')
      ];

      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('#define SVELTEESP32_COUNT 2');
      expect(result).toContain('#define SVELTEESP32_SIZE');
      expect(result).toContain('#define SVELTEESP32_SIZE_GZIP');
    });

    it('should generate URI_HANDLERS and MAX_URI_HANDLERS defines for psychic engine', () => {
      const sources: CppCodeSources = [
        createMockSource('index.html', '<html></html>'),
        createMockSource('style.css', 'body{}')
      ];

      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('#define SVELTEESP32_URI_HANDLERS 2');
      expect(result).toContain('#define SVELTEESP32_MAX_URI_HANDLERS 7');
    });

    it('should not generate URI_HANDLERS or MAX_URI_HANDLERS defines for async engine', () => {
      const sources: CppCodeSources = [
        createMockSource('index.html', '<html></html>'),
        createMockSource('style.css', 'body{}')
      ];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        engine: 'async' as const,
        version: '',
        cachetime: 0
      });

      expect(result).not.toContain('URI_HANDLERS');
    });

    it('should count the extra default-route registration for URI_HANDLERS/MAX_URI_HANDLERS when basePath is set (issue #120)', () => {
      const sources: CppCodeSources = [
        createMockSource('index.html', '<html></html>'),
        createMockSource('style.css', 'body{}')
      ];

      // basePath set: index.html gets its own route AND a basePath default route (+1 vs. the no-basePath case)
      const result = getCppCode(sources, mockFilesByExtension, { ...mockOptions, basePath: '/ui' });

      expect(result).toContain('#define SVELTEESP32_URI_HANDLERS 3');
      expect(result).toContain('#define SVELTEESP32_MAX_URI_HANDLERS 8');
    });

    it('should count the extra SPA catch-all for URI_HANDLERS/MAX_URI_HANDLERS when spa and basePath are set (issue #120)', () => {
      const sources: CppCodeSources = [
        createMockSource('index.html', '<html></html>'),
        createMockSource('style.css', 'body{}')
      ];

      const result = getCppCode(sources, mockFilesByExtension, { ...mockOptions, basePath: '/ui', spa: true });

      expect(result).toContain('#define SVELTEESP32_URI_HANDLERS 5');
      expect(result).toContain('#define SVELTEESP32_MAX_URI_HANDLERS 10');
    });

    it('should generate file defines for each source', () => {
      const sources: CppCodeSources = [
        createMockSource('index.html', '<html></html>'),
        createMockSource('style.css', 'body{}')
      ];

      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        engine: 'async' as const,
        version: '',
        cachetime: 0
      });

      expect(result).toContain('#define SVELTEESP32_FILE_INDEX_HTML');
      expect(result).toContain('#define SVELTEESP32_FILE_STYLE_CSS');
    });

    it('should generate extension count defines', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('#define SVELTEESP32_HTML_FILES 1');
      expect(result).toContain('#define SVELTEESP32_CSS_FILES 1');
    });

    it('should generate data arrays for gzip', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('const uint8_t datagzip_index_html');
      expect(result).toContain('103,122,105,112,112,101,100');
    });

    it('should generate etag arrays when enabled', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain(String.raw`static const char etag_index_html[] = "\"abc123\"";`);
    });

    it('should generate route handlers for each file', () => {
      const sources: CppCodeSources = [createMockSource('test.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('server->on("/test.html", HTTP_ANY');
    });

    it('should detect default route for index.html', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('server->defaultEndpoint =');
    });

    it('should detect default route for index.htm', () => {
      const sources: CppCodeSources = [createMockSource('index.htm', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('server->defaultEndpoint =');
    });

    it('should include etag validation code when etag is enabled', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('If-None-Match');
      expect(result).toContain('response->setCode(304)');
    });

    it('should include content encoding header for gzipped files', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('Content-Encoding');
    });

    it('should include cache control headers', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('Cache-Control');
      expect(result).toContain('max-age=86400');
    });

    it('should set correct MIME type', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('setContentType("text/html")');
    });

    it('should convert buffer to byte array correctly', () => {
      const source = createMockSource('test.txt', 'ABC');
      const sources: CppCodeSources = [source];

      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      // When gzip is enabled (default), it uses the gzipped content
      expect(result).toContain('103,122,105,112,112,101,100'); // "gzipped" as bytes
    });

    it('should handle empty files', () => {
      const sources: CppCodeSources = [createMockSource('empty.txt', '')];

      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('SVELTEESP32_COUNT 1');
    });

    it('should handle multiple files', () => {
      const sources: CppCodeSources = [
        createMockSource('index.html', '<html></html>'),
        createMockSource('style.css', 'body{}'),
        createMockSource('script.js', 'console.log()')
      ];

      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('index.html');
      expect(result).toContain('style.css');
      expect(result).toContain('script.js');
      expect(result).toContain('SVELTEESP32_COUNT 3');
    });
  });

  describe('template selection', () => {
    it('should use psychic template for psychic engine', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, { ...mockOptions, version: '', cachetime: 0 });

      expect(result).toContain('PsychicHttpServer');
      expect(result).toContain('PsychicRequest * request, PsychicResponse * response');
    });

    it('should use async template for async engine', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        engine: 'async' as const,
        version: '',
        cachetime: 0
      });

      expect(result).toContain('ESPAsyncWebServer');
      expect(result).toContain('AsyncWebServerRequest');
      expect(result).toContain('PROGMEM');
    });

    it('should use espidf template for espidf engine', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        engine: 'espidf' as const,
        version: '',
        cachetime: 0
      });

      expect(result).toContain('esp_http_server.h');
      expect(result).toContain('httpd_handle_t');
    });
  });

  describe('etag and gzip combinations', () => {
    it('should handle etag=never gzip=never', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        etag: 'never' as const,
        gzip: 'never' as const,
        version: '',
        cachetime: 0
      });

      expect(result).not.toContain('If-None-Match');
      expect(result).toContain('const uint8_t data_index_html');
      expect(result).not.toContain('const uint8_t datagzip_');
    });

    it('should handle etag=compiler gzip=compiler', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        etag: 'compiler' as const,
        gzip: 'compiler' as const,
        version: '',
        cachetime: 0
      });

      expect(result).toContain('#ifdef SVELTEESP32_ENABLE_ETAG');
      expect(result).toContain('#ifdef SVELTEESP32_ENABLE_GZIP');
    });
  });

  describe('template switch/case helpers', () => {
    it('should handle etag=always case in switch', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        sourcepath: '/test/path',
        outputfile: '/test/output.h',
        gzip: 'never' as const,
        cachetime: 0
      });

      // When etag=true, should have SHA256 hash definition
      expect(result).toContain('abc123');
    });

    it('should handle etag=never case in switch', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        sourcepath: '/test/path',
        outputfile: '/test/output.h',
        etag: 'never' as const,
        gzip: 'never' as const,
        cachetime: 0
      });

      // When etag=false, should not check etag headers
      expect(result).not.toContain('If-None-Match');
    });

    it('should handle gzip=always case in switch for async engine', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        sourcepath: '/test/path',
        outputfile: '/test/output.h',
        engine: 'async' as const,
        etag: 'never' as const,
        cachetime: 0
      });

      // When gzip=true, should have content-encoding header
      expect(result).toContain('gzip');
    });

    it('should handle gzip=never case in switch', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        sourcepath: '/test/path',
        outputfile: '/test/output.h',
        etag: 'never' as const,
        gzip: 'never' as const,
        cachetime: 0
      });

      // When gzip=false, should not have gzip-specific code
      expect(result).toBeTruthy();
    });

    it('should handle compiler case for both etag and gzip', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        sourcepath: '/test/path',
        outputfile: '/test/output.h',
        etag: 'compiler' as const,
        gzip: 'compiler' as const,
        cachetime: 0
      });

      // When etag/gzip=compiler, should have #ifdef directives
      expect(result).toContain('#ifdef');
    });

    it('should handle espidf engine with etag and gzip switches', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        sourcepath: '/test/path',
        outputfile: '/test/output.h',
        engine: 'espidf' as const,
        cachetime: 0
      });

      // espidf should have specific handler structure
      expect(result).toContain('httpd_req_t');
    });

    it('should handle all engines in switch statement', async () => {
      const engines = ['psychic', 'async', 'espidf'];

      for (const engine of engines) {
        const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
        const result = getCppCode(sources, mockFilesByExtension, {
          ...mockOptions,
          engine: engine as 'psychic' | 'async' | 'espidf',
          sourcepath: '/test/path',
          outputfile: '/test/output.h',
          cachetime: 0
        });

        expect(result).toBeTruthy();
        expect(result.length).toBeGreaterThan(0);
      }
    });

    it('should handle multiple case statements in switch correctly', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        sourcepath: '/test/path',
        outputfile: '/test/output.h',
        etag: 'compiler' as const,
        gzip: 'compiler' as const,
        cachetime: 0
      });

      // Should handle psychic engine with compiler directives
      expect(result).toContain('PsychicHttpServer');
      expect(result).toContain('#ifdef');
    });
  });

  describe('file manifest', () => {
    it('should generate manifest struct and array', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

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

      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('{ "/index.html"');
    });

    it('should include correct size values in manifest', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      // Original size is 13 bytes ("<html></html>")
      expect(result).toContain(', 13,');
    });

    it('should include gzip size when file is gzipped', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      // Gzipped content is "gzipped" which is 7 bytes
      expect(result).toContain(', 7,');
    });

    it('should have gzipSize of 0 when file is not gzipped', async () => {
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

      const result = getCppCode([source], mockFilesByExtension, { ...mockOptions, version: '', cachetime: 0 });

      // When isGzip is false, gzipSize should be 0
      expect(result).toMatch(/{ "\/small\.txt", 2, 0,/);
    });

    it('should reference etag variable when etag is enabled', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('etag_index_html,');
    });

    it('should use nullptr for etag when etag is disabled', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        etag: 'never' as const,
        version: '',
        cachetime: 0
      });

      expect(result).toContain('NULL,');
      expect(result).not.toContain('etag_index_html,');
    });

    it('should include content type in manifest', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('"text/html"');
    });

    it('should use custom definePrefix in manifest', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        version: '',
        define: 'MYAPP',
        cachetime: 0
      });

      expect(result).toContain('struct MYAPP_FileInfo');
      expect(result).toContain('const MYAPP_FileInfo MYAPP_FILES[]');
      expect(result).toContain('const size_t MYAPP_FILE_COUNT');
    });

    it('should generate manifest entries for multiple files', async () => {
      const sources: CppCodeSources = [
        createMockSource('index.html', '<html></html>'),
        createMockSource('style.css', 'body{}')
      ];
      const result = getCppCode(sources, mockFilesByExtension, { ...mockOptions, version: '', cachetime: 0 });

      expect(result).toContain('{ "/index.html"');
      expect(result).toContain('{ "/style.css"');
    });

    it('should generate manifest for async engine', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        engine: 'async' as const,
        version: '',
        cachetime: 0
      });

      expect(result).toContain('struct SVELTEESP32_FileInfo');
      expect(result).toContain('SVELTEESP32_FILES[]');
    });

    it('should generate manifest for espidf engine', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        engine: 'espidf' as const,
        version: '',
        cachetime: 0
      });

      // ESP-IDF uses C-compatible typedef struct syntax
      expect(result).toContain('typedef struct {');
      expect(result).toContain('} SVELTEESP32_FileInfo;');
      expect(result).toContain('SVELTEESP32_FILES[]');
      expect(result).toContain('SVELTEESP32_FILE_COUNT');
    });

    it('should reference etag for compiler mode in manifest', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        etag: 'compiler' as const,
        version: '',
        cachetime: 0
      });

      // When etag is 'compiler', we still reference the etag variable (it exists conditionally)
      expect(result).toContain('etag_index_html,');
    });
  });

  describe('basePath support', () => {
    it('should prefix routes with basePath for psychic engine', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        version: '',
        basePath: '/ui',
        cachetime: 0
      });

      expect(result).toContain('server->on("/ui/index.html", HTTP_ANY');
      expect(result).toContain('SVELTEESP32_onFileServed("/ui/index.html", 200)');
      expect(result).toContain('SVELTEESP32_onFileServed("/ui/index.html", 304)');
    });

    it('should create basePath route for index.html when basePath is set', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        version: '',
        basePath: '/admin',
        cachetime: 0
      });

      // Should have handler for /admin (without index.html)
      expect(result).toContain('server->on("/admin", HTTP_ANY');
      expect(result).toContain('SVELTEESP32_onFileServed("/admin", 200)');
    });

    it('should not use defaultEndpoint when basePath is set', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        version: '',
        basePath: '/ui',
        cachetime: 0
      });

      // Should NOT use defaultEndpoint when basePath is set
      expect(result).not.toContain('server->defaultEndpoint =');
    });

    it('should use defaultEndpoint when basePath is empty', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, { ...mockOptions, version: '', cachetime: 0 });

      // Should use defaultEndpoint when basePath is empty
      expect(result).toContain('server->defaultEndpoint =');
    });

    it('should include basePath in manifest paths', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        version: '',
        basePath: '/app',
        cachetime: 0
      });

      expect(result).toContain('{ "/app/index.html"');
    });

    it('should prefix routes with basePath for async engine', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        engine: 'async' as const,
        version: '',
        basePath: '/ui',
        cachetime: 0
      });

      expect(result).toContain('server->on("/ui/index.html", HTTP_GET');
      expect(result).toContain('server->on("/ui", HTTP_GET'); // Default route
      expect(result).toContain('SVELTEESP32_onFileServed("/ui/index.html", 200)');
      expect(result).toContain('SVELTEESP32_onFileServed("/ui", 200)');
    });

    it('should prefix routes with basePath for espidf engine', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        engine: 'espidf' as const,
        version: '',
        basePath: '/admin',
        cachetime: 0
      });

      expect(result).toContain('.uri = "/admin/index.html"');
      expect(result).toContain('.uri = "/admin"'); // Default route
      expect(result).toContain('{ "/admin/index.html"'); // Manifest
    });

    it('should generate hook call for basePath default route in psychic engine', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        version: '',
        basePath: '/admin',
        cachetime: 0
      });

      // Verify the basePath default route handler has the hook call with 200
      expect(result).toContain('SVELTEESP32_onFileServed("/admin", 200)');
      // Verify it also has response->send() in the basePath handler
      expect(result).toContain('return response->send();');
    });

    it('should generate 304 hook call for basePath default route in psychic engine with etag', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        version: '',
        basePath: '/panel',
        cachetime: 0
      });

      // Verify the basePath default route handler has the 304 hook call
      expect(result).toContain('SVELTEESP32_onFileServed("/panel", 304)');
      expect(result).toContain('SVELTEESP32_onFileServed("/panel", 200)');
    });
  });

  describe('onFileServed hook', () => {
    it('should generate weak hook function declaration for psychic engine', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain(
        'extern "C" void __attribute__((weak)) SVELTEESP32_onFileServed(const char* path, int statusCode) {}'
      );
    });

    it('should generate hook call with status 200 before content response', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('SVELTEESP32_onFileServed("/index.html", 200)');
    });

    it('should generate hook call with status 304 before cache hit response', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('SVELTEESP32_onFileServed("/index.html", 304)');
    });

    it('should use custom definePrefix in hook', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        version: '',
        define: 'MYAPP',
        cachetime: 0
      });

      expect(result).toContain(
        'extern "C" void __attribute__((weak)) MYAPP_onFileServed(const char* path, int statusCode) {}'
      );
      expect(result).toContain('MYAPP_onFileServed("/index.html", 200)');
      expect(result).toContain('MYAPP_onFileServed("/index.html", 304)');
    });

    it('should generate hook for async engine', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        engine: 'async' as const,
        version: '',
        cachetime: 0
      });

      expect(result).toContain(
        'extern "C" void __attribute__((weak)) SVELTEESP32_onFileServed(const char* path, int statusCode) {}'
      );
      expect(result).toContain('SVELTEESP32_onFileServed("/index.html", 200)');
      expect(result).toContain('SVELTEESP32_onFileServed("/index.html", 304)');
    });

    it('should generate C-style hook for espidf engine', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        engine: 'espidf' as const,
        version: '',
        cachetime: 0
      });

      // ESP-IDF uses C-style weak function (no extern "C")
      expect(result).toContain(
        '__attribute__((weak)) void SVELTEESP32_onFileServed(const char* path, int statusCode) {}'
      );
      expect(result).toContain('SVELTEESP32_onFileServed("/index.html", 200)');
      expect(result).toContain('SVELTEESP32_onFileServed("/index.html", 304)');
    });

    it('should generate hook calls with compiler etag mode', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        etag: 'compiler' as const,
        version: '',
        cachetime: 0
      });

      // Should have hook declaration
      expect(result).toContain('SVELTEESP32_onFileServed');
      // Should have 200 hook call
      expect(result).toContain('SVELTEESP32_onFileServed("/index.html", 200)');
      // Should have 304 hook call inside #ifdef
      expect(result).toContain('SVELTEESP32_onFileServed("/index.html", 304)');
    });

    it('should not generate 304 hook calls when etag is false', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        etag: 'never' as const,
        version: '',
        cachetime: 0
      });

      // Should have hook declaration
      expect(result).toContain('SVELTEESP32_onFileServed');
      // Should have 200 hook call
      expect(result).toContain('SVELTEESP32_onFileServed("/index.html", 200)');
      // Should NOT have 304 hook call (no etag validation)
      expect(result).not.toContain('SVELTEESP32_onFileServed("/index.html", 304)');
    });

    it('should generate hook calls for "/" route in async engine', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        engine: 'async' as const,
        version: '',
        cachetime: 0
      });

      // Async engine has a separate handler for "/" that should also have hooks
      expect(result).toContain('SVELTEESP32_onFileServed("/", 200)');
      expect(result).toContain('SVELTEESP32_onFileServed("/", 304)');
    });
  });

  describe('SPA catch-all', () => {
    it('should not generate catch-all when spa is false for psychic engine', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        version: '',
        basePath: '/app',
        cachetime: 0
      });

      expect(result).not.toContain('server->on("/app/*"');
    });

    it('should generate catch-all when spa is true and basePath is set for psychic engine', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        version: '',
        basePath: '/app',
        cachetime: 0,
        spa: true
      });

      expect(result).toContain('server->on("/app/*", HTTP_GET');
    });

    it('should not generate extra catch-all for psychic engine without basePath (defaultEndpoint handles it)', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        version: '',
        cachetime: 0,
        spa: true
      });

      expect(result).not.toContain('server->on("/*"');
    });

    it('should not generate onNotFound when spa is false for async engine', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        engine: 'async' as const,
        version: '',
        cachetime: 0
      });

      expect(result).not.toContain('onNotFound');
    });

    it('should generate onNotFound when spa is true for async engine', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        engine: 'async' as const,
        version: '',
        cachetime: 0,
        spa: true
      });

      expect(result).toContain('onNotFound');
    });

    it('should include basePath prefix check in onNotFound when spa and basePath set for async engine', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        engine: 'async' as const,
        version: '',
        basePath: '/app',
        cachetime: 0,
        spa: true
      });

      expect(result).toContain('onNotFound');
      expect(result).toContain('startsWith("/app/")');
    });
  });

  describe('per-source cache time', () => {
    it('should use cachetimeHtml for HTML file when set', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        version: '',
        cachetime: 3600,
        cachetimeHtml: 0
      });

      // cachetimeHtml=0 means no-cache for HTML; cachetime=3600 is ignored
      expect(result).toContain('no-cache');
      expect(result).not.toContain('max-age=3600');
    });

    it('should use cachetimeAssets for non-HTML file when set', async () => {
      const sources: CppCodeSources = [createMockAssetSource('style.css', 'body{}')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        version: '',
        cachetime: 60,
        cachetimeAssets: 86_400
      });

      expect(result).toContain('max-age=86400');
      expect(result).not.toContain('max-age=60');
    });

    it('should fall back to cachetime for HTML when cachetimeHtml is undefined', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, { ...mockOptions, version: '', cachetime: 7200 });

      expect(result).toContain('max-age=7200');
    });

    it('should fall back to cachetime for assets when cachetimeAssets is undefined', async () => {
      const sources: CppCodeSources = [createMockAssetSource('style.css', 'body{}')];
      const result = getCppCode(sources, mockFilesByExtension, { ...mockOptions, version: '', cachetime: 3600 });

      expect(result).toContain('max-age=3600');
    });

    it('should emit no-cache for HTML when cachetimeHtml=0 overrides positive cachetime', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        version: '',
        cachetime: 31_536_000,
        cachetimeHtml: 0
      });

      expect(result).toContain('no-cache');
      expect(result).not.toContain('max-age=31536000');
    });

    it('should produce different max-age for HTML vs CSS in mixed sources', async () => {
      const sources: CppCodeSources = [
        createMockSource('index.html', '<html></html>'),
        createMockAssetSource('app.a1b2c3.css', 'body{}')
      ];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        version: '',
        cachetime: 0,
        cachetimeHtml: 0,
        cachetimeAssets: 31_536_000
      });

      expect(result).toContain('max-age=31536000');
      expect(result).toContain('no-cache');
    });
  });

  describe('HEAD support', () => {
    describe('psychic', () => {
      it('should register file routes as HTTP_ANY so one endpoint serves GET and HEAD', () => {
        const sources: CppCodeSources = [createMockAssetSource('app.css', 'body{}')];

        const result = getCppCode(sources, mockFilesByExtension, mockOptions);

        expect(result).toContain('server->on("/app.css", HTTP_ANY');
        expect(result).not.toContain('server->on("/app.css", HTTP_GET');
      });

      it('should reject methods other than GET and HEAD with a 405', () => {
        const sources: CppCodeSources = [createMockAssetSource('app.css', 'body{}')];

        const result = getCppCode(sources, mockFilesByExtension, mockOptions);

        expect(result).toContain('if (request->method() != HTTP_GET && request->method() != HTTP_HEAD) {');
        expect(result).toContain('response->setCode(405);');
        expect(result).toContain('response->addHeader("Allow", "GET, HEAD");');
      });

      it('should skip the body on HEAD but keep the headers', () => {
        const sources: CppCodeSources = [createMockAssetSource('app.css', 'body{}')];

        const result = getCppCode(sources, mockFilesByExtension, mockOptions);

        expect(result).toContain('if (request->method() != HTTP_HEAD) {');
        expect(result).toContain('response->setContent(datagzip_app_css');
        // headers are emitted unconditionally, outside the HEAD guard
        expect(result).toContain('response->setContentType("text/css");');
        expect(result).toContain('response->addHeader("ETag", etag_app_css);');
      });

      it('should register the SPA catch-all once per method, not as HTTP_ANY', () => {
        const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

        const result = getCppCode(sources, mockFilesByExtension, {
          ...mockOptions,
          basePath: '/app',
          spa: true
        });

        expect(result).toContain('server->on("/app/*", HTTP_GET');
        expect(result).toContain('server->on("/app/*", HTTP_HEAD');
        expect(result).not.toContain('server->on("/app/*", HTTP_ANY');
      });
    });

    describe('async', () => {
      const asyncOptions = { ...mockOptions, engine: 'async' as const };

      it('should register routes for the HTTP_GET | HTTP_HEAD method bitmask', () => {
        const sources: CppCodeSources = [createMockAssetSource('app.css', 'body{}')];

        const result = getCppCode(sources, mockFilesByExtension, asyncOptions);

        expect(result).toContain('server->on("/app.css", HTTP_GET | HTTP_HEAD');
      });

      it('should pick a body-less response for HEAD', () => {
        const sources: CppCodeSources = [createMockAssetSource('app.css', 'body{}')];

        const result = getCppCode(sources, mockFilesByExtension, asyncOptions);

        expect(result).toContain('AsyncWebServerResponse *response = request->method() == HTTP_HEAD');
        expect(result).toContain('? request->beginResponse(200, "text/css")');
        expect(result).toContain(': request->beginResponse(200, "text/css", datagzip_app_css');
      });

      it('should let HEAD through the SPA catch-all guard', () => {
        const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

        const result = getCppCode(sources, mockFilesByExtension, { ...asyncOptions, spa: true });

        expect(result).toContain(
          'if (request->method() != HTTP_GET && request->method() != HTTP_HEAD) { request->send(404); return; }'
        );
      });
    });

    describe('webserver and espidf stay GET-only', () => {
      it('should not register HEAD routes for webserver', () => {
        const sources: CppCodeSources = [createMockAssetSource('app.css', 'body{}')];

        const result = getCppCode(sources, mockFilesByExtension, { ...mockOptions, engine: 'webserver' as const });

        expect(result).toContain('server->on("/app.css", HTTP_GET, [server]()');
        expect(result).not.toContain('HTTP_HEAD');
      });

      it('should not register HEAD routes for espidf', () => {
        const sources: CppCodeSources = [createMockAssetSource('app.css', 'body{}')];

        const result = getCppCode(sources, mockFilesByExtension, { ...mockOptions, engine: 'espidf' as const });

        expect(result).toContain('.method = HTTP_GET');
        expect(result).not.toContain('HTTP_HEAD');
      });
    });
  });

  describe('webserver ETag header collection', () => {
    const webserverOptions = { ...mockOptions, engine: 'webserver' as const };

    // WebServer discards request headers it was not told to collect, so without this the
    // If-None-Match check below it can never match and the 304 branch is unreachable
    it('should collect all headers when etag is always', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension, webserverOptions);

      expect(result).toContain('server->collectAllHeaders();');
    });

    it('should guard header collection behind the etag define when etag is compiler', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension, {
        ...webserverOptions,
        etag: 'compiler' as const
      });

      expect(result).toContain('#ifdef SVELTEESP32_ENABLE_ETAG\n  server->collectAllHeaders();\n  #endif');
    });

    it('should not collect headers when etag is never', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

      const result = getCppCode(sources, mockFilesByExtension, {
        ...webserverOptions,
        etag: 'never' as const
      });

      expect(result).not.toContain('collectAllHeaders');
    });
  });
});

describe('etag format (RFC 9110 quoted, truncated)', () => {
  const mockFilesByExtension: ExtensionGroups = [{ extension: 'HTML', count: 1 }];
  // A realistic full-length SHA256 - only the first 16 hex chars may reach the generated header.
  const sha256 = '387b88e3ef16c0a7d4f9b2c1a0e5d8f36b2a4c9e1d7f0a3b5c8e2d6f4a1b9c0e';
  const sourceWithRealHash: CppCodeSources = [{ ...createMockSource('index.html', '<html></html>'), sha256 }];

  const engines = ['psychic', 'async', 'espidf', 'webserver'] as const;

  it.each(engines)('%s: emits the tag as 16 hex chars wrapped in quotes', (engine) => {
    const result = getCppCode(sourceWithRealHash, mockFilesByExtension, { ...mockOptions, engine });

    expect(result).toContain(String.raw`static const char etag_index_html[] = "\"387b88e3ef16c0a7\"";`);
    // The remaining 48 hex chars must not leak into the header.
    expect(result).not.toContain('d4f9b2c1a0e5d8f3');
  });

  it.each(engines)('%s: matches If-None-Match with strstr, not exact equality', (engine) => {
    const result = getCppCode(sourceWithRealHash, mockFilesByExtension, { ...mockOptions, engine });

    // strstr lets a comma-separated list and a W/ weak validator still match the tag.
    expect(result).toContain('strstr(');
    expect(result).not.toContain('.equals(etag_');
    expect(result).not.toContain('strcmp(hdr_value');
  });

  it('espidf compares the malloc-ed header buffer against the tag with NULL, not nullptr', () => {
    const result = getCppCode(sourceWithRealHash, mockFilesByExtension, {
      ...mockOptions,
      engine: 'espidf' as const
    });

    expect(result).toContain('if (strstr(hdr_value, etag_index_html) != NULL) {');
  });

  it('psychic/async/webserver compare through String::c_str()', () => {
    const psychic = getCppCode(sourceWithRealHash, mockFilesByExtension, { ...mockOptions, engine: 'psychic' });
    const async = getCppCode(sourceWithRealHash, mockFilesByExtension, { ...mockOptions, engine: 'async' });
    const webserver = getCppCode(sourceWithRealHash, mockFilesByExtension, { ...mockOptions, engine: 'webserver' });

    expect(psychic).toContain('strstr(request->header("If-None-Match").c_str(), etag_index_html) != nullptr');
    expect(async).toContain('strstr(h->value().c_str(), etag_index_html) != nullptr');
    expect(webserver).toContain('strstr(server->header("If-None-Match").c_str(), etag_index_html) != nullptr');
  });

  it('truncates in the generated header only - the source keeps the full hash', () => {
    getCppCode(sourceWithRealHash, mockFilesByExtension, mockOptions);

    // The C++ emission must not mutate the source: the full hash still feeds the JSON
    // manifest and the change-summary diff, which compare against previously stored hashes.
    expect(sourceWithRealHash[0]!.sha256).toBe(sha256);
    expect(sourceWithRealHash[0]!.sha256).toHaveLength(64);
  });
});

// RFC 7232 4.1: a 304 must carry the Cache-Control and ETag a 200 would have. These assert the
// whole 304 block - a bare toContain('Cache-Control') would pass off the 200 path alone.
describe('304 repeats the ETag and Cache-Control headers (RFC 7232 4.1)', () => {
  const mockFilesByExtension: ExtensionGroups = [{ extension: 'HTML', count: 1 }];
  const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];

  it('psychic: sets the headers on the response before sending the 304', () => {
    const result = getCppCode(sources, mockFilesByExtension, { ...mockOptions, engine: 'psychic' });

    expect(result).toContain(
      [
        '      response->setCode(304);',
        '      response->addHeader("Cache-Control", "max-age=86400");',
        '      response->addHeader("ETag", etag_index_html);'
      ].join('\n')
    );
  });

  it('async: builds the 304 via beginResponse so it has a handle to add headers to', () => {
    const result = getCppCode(sources, mockFilesByExtension, { ...mockOptions, engine: 'async' });

    expect(result).toContain(
      [
        '      AsyncWebServerResponse *notModified = request->beginResponse(304);',
        '      notModified->addHeader("Cache-Control", "max-age=86400");',
        '      notModified->addHeader("ETag", etag_index_html);'
      ].join('\n')
    );
    // request->send(304) sends immediately and would leave no handle for the headers.
    expect(result).not.toContain('request->send(304);');
  });

  it('webserver: queues both headers before send(304), which flushes the header block', () => {
    const result = getCppCode(sources, mockFilesByExtension, { ...mockOptions, engine: 'webserver' });

    expect(result).toContain(
      [
        '      server->sendHeader("Cache-Control", "max-age=86400");',
        '      server->sendHeader("ETag", etag_index_html);',
        '      server->send(304);'
      ].join('\n')
    );
  });

  it('espidf: sets both headers before httpd_resp_send', () => {
    const result = getCppCode(sources, mockFilesByExtension, { ...mockOptions, engine: 'espidf' });

    expect(result).toContain(
      [
        '                httpd_resp_set_status(req, "304 Not Modified");',
        '                httpd_resp_set_hdr(req, "Cache-Control", "max-age=86400");',
        '                httpd_resp_set_hdr(req, "ETag", etag_index_html);'
      ].join('\n')
    );
  });

  it('keeps the headers inside the #ifdef fence in compiler mode', () => {
    const result = getCppCode(sources, mockFilesByExtension, { ...mockOptions, etag: 'compiler' as const });

    expect(result).toContain(
      [
        '  #ifdef SVELTEESP32_ENABLE_ETAG',
        '    if (request->hasHeader("If-None-Match") && strstr(request->header("If-None-Match").c_str(), etag_index_html) != nullptr) {',
        '      response->setCode(304);',
        '      response->addHeader("Cache-Control", "max-age=86400");',
        '      response->addHeader("ETag", etag_index_html);'
      ].join('\n')
    );
  });

  it('echoes the per-source cache time, so an HTML 304 uses cachetimeHtml', () => {
    const result = getCppCode(sources, mockFilesByExtension, {
      ...mockOptions,
      cachetime: 86_400,
      cachetimeHtml: 60
    });

    expect(result).toContain(
      ['      response->setCode(304);', '      response->addHeader("Cache-Control", "max-age=60");'].join('\n')
    );
    expect(result).not.toContain('max-age=86400');
  });

  it('omits Content-Encoding from the 304 - it is a representation header, and there is no body', () => {
    const result = getCppCode(sources, mockFilesByExtension, { ...mockOptions, engine: 'psychic' });

    const notModifiedBlock = result.slice(
      result.indexOf('response->setCode(304);'),
      result.indexOf('response->setContentType(')
    );
    expect(notModifiedBlock).not.toContain('Content-Encoding');
  });
});

// Cache-Control describes freshness, ETag provides a validator - they are independent, and only the
// latter belongs behind the etag switch. Both used to live in the same sw(d.etag) block with no
// 'never' arm, so --etag=never silently dropped caching altogether.
describe('Cache-Control is emitted independently of the ETag mode', () => {
  const mockFilesByExtension: ExtensionGroups = [{ extension: 'CSS', count: 1 }];
  const sources: CppCodeSources = [createMockAssetSource('style.css', 'body{}')];
  const neverOptions = { ...mockOptions, etag: 'never' as const, cachetime: 0, cachetimeAssets: 31_536_000 };

  it.each([
    ['psychic', '    response->addHeader("Cache-Control", "max-age=31536000");'],
    ['async', '    response->addHeader("Cache-Control", "max-age=31536000");'],
    ['webserver', '    server->sendHeader("Cache-Control", "max-age=31536000");'],
    ['espidf', '    httpd_resp_set_hdr(req, "Cache-Control", "max-age=31536000");']
  ] as const)('%s: --cachetime survives --etag=never', (engine, cacheLine) => {
    const result = getCppCode(sources, mockFilesByExtension, { ...neverOptions, engine });

    expect(result).toContain(cacheLine);
    // No validator anywhere: no ETag header, and genEtagArrays emits no etag_ array to reference.
    expect(result).not.toContain('etag_');
    expect(result).not.toContain('"ETag"');
  });

  it('falls back to no-cache with etag=never and no cache time', () => {
    const result = getCppCode(sources, mockFilesByExtension, {
      ...mockOptions,
      etag: 'never' as const,
      cachetime: 0
    });

    expect(result).toContain('response->addHeader("Cache-Control", "no-cache");');
  });

  it('leaves Cache-Control outside the #ifdef fence in compiler mode, so ENABLE_ETAG cannot disable caching', () => {
    const result = getCppCode(sources, mockFilesByExtension, { ...neverOptions, etag: 'compiler' as const });

    expect(result).toContain(
      [
        '    response->addHeader("Cache-Control", "max-age=31536000");',
        '  #ifdef SVELTEESP32_ENABLE_ETAG',
        '    response->addHeader("ETag", etag_style_css);',
        '  #endif'
      ].join('\n')
    );
  });

  it('still pairs Cache-Control with the ETag on the 200 path when etag=always', () => {
    const result = getCppCode(sources, mockFilesByExtension, { ...neverOptions, etag: 'always' as const });

    expect(result).toContain(
      [
        '    response->addHeader("Cache-Control", "max-age=31536000");',
        '    response->addHeader("ETag", etag_style_css);'
      ].join('\n')
    );
  });
});
