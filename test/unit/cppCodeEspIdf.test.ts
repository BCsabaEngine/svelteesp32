import { describe, expect, it } from 'vitest';

import { type CppCodeSource, type CppCodeSources, type ExtensionGroups, getCppCode } from '../../src/cppCode';

const mockOptions = {
  sourcepath: '/test/path',
  outputfile: '/test/output.h',
  engine: 'espidf' as const,
  etag: 'always' as const,
  gzip: 'always' as const,
  cachetime: 86_400,
  cachetimeHtml: undefined,
  cachetimeAssets: undefined,
  created: false,
  version: 'v1.0.0',
  espmethod: 'initSvelteStaticFiles',
  define: 'SVELTEESP32',
  exclude: [],
  basePath: '',
  spa: false
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

describe('cppCodeEspIdf', () => {
  const mockFilesByExtension: ExtensionGroups = [
    { extension: 'HTML', count: 1 },
    { extension: 'CSS', count: 1 }
  ];

  describe('espidf template structure', () => {
    it('should contain esp_http_server.h include', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('#include <esp_http_server.h>');
    });

    it('should contain required standard includes', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('#include <stdint.h>');
      expect(result).toContain('#include <string.h>');
      expect(result).toContain('#include <stdlib.h>');
      expect(result).toContain('#include <esp_err.h>');
    });

    it('should use typedef struct for manifest (C-compatible)', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('typedef struct {');
      expect(result).toContain('} SVELTEESP32_FileInfo;');
    });

    it('should use C-style weak function for hook (no extern "C")', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain(
        '__attribute__((weak)) void SVELTEESP32_onFileServed(const char* path, int statusCode) {}'
      );
      // Should NOT have extern "C" for espidf
      expect(result).not.toContain('extern "C" void __attribute__((weak)) SVELTEESP32_onFileServed');
    });

    it('should generate httpd_uri_t route structs', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('static const httpd_uri_t route_INDEX_HTML = {');
      expect(result).toContain('.uri = "/index.html"');
      expect(result).toContain('.method = HTTP_GET');
      expect(result).toContain('.handler = file_handler_INDEX_HTML');
    });

    it('should generate file handler functions', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('static esp_err_t file_handler_INDEX_HTML (httpd_req_t *req)');
      expect(result).toContain('return ESP_OK;');
    });

    it('should generate httpd_register_uri_handler calls', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('httpd_register_uri_handler(server, &route_INDEX_HTML)');
    });

    it('should generate default route for index.html', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('static const httpd_uri_t route_def_INDEX_HTML = {');
      expect(result).toContain('.uri = "/"');
    });

    it('should generate init function with httpd_handle_t parameter', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('static inline void initSvelteStaticFiles(httpd_handle_t server)');
    });

    it('should include engine comment', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('//engine:   espidf');
    });

    it('should include config comment', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('//config:');
    });

    it('should include version define when specified', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('#define SVELTEESP32_VERSION "v1.0.0"');
    });
  });

  describe('etag/gzip combinations for espidf', () => {
    it('should handle etag=always gzip=always', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, { ...mockOptions, version: '', cachetime: 0 });

      // Etag enabled - should check If-None-Match
      expect(result).toContain('httpd_req_get_hdr_value_len(req, "If-None-Match")');
      expect(result).toContain('etag_index_html');
      // Gzip enabled - should use gzip data array
      expect(result).toContain('const unsigned char datagzip_index_html');
      expect(result).toContain('httpd_resp_set_hdr(req, "Content-Encoding", "gzip")');
    });

    it('should handle etag=never gzip=never', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        etag: 'never' as const,
        gzip: 'never' as const,
        version: '',
        cachetime: 0
      });

      // Etag disabled - no If-None-Match check
      expect(result).not.toContain('If-None-Match');
      // Gzip disabled - should use regular data array
      expect(result).toContain('const unsigned char data_index_html');
      expect(result).not.toContain('const unsigned char datagzip_');
    });

    it('should handle etag=always gzip=never', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        gzip: 'never' as const,
        version: '',
        cachetime: 0
      });

      expect(result).toContain('If-None-Match');
      expect(result).toContain('etag_index_html');
      expect(result).toContain('const unsigned char data_index_html');
      expect(result).not.toContain('const unsigned char datagzip_');
    });

    it('should handle etag=never gzip=always', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        etag: 'never' as const,
        version: '',
        cachetime: 0
      });

      expect(result).not.toContain('If-None-Match');
      expect(result).toContain('const unsigned char datagzip_index_html');
      expect(result).toContain('httpd_resp_set_hdr(req, "Content-Encoding", "gzip")');
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

    it('should handle etag=compiler gzip=always', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        etag: 'compiler' as const,
        version: '',
        cachetime: 0
      });

      expect(result).toContain('#ifdef SVELTEESP32_ENABLE_ETAG');
      expect(result).toContain('const unsigned char datagzip_index_html');
    });

    it('should handle etag=always gzip=compiler', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        gzip: 'compiler' as const,
        version: '',
        cachetime: 0
      });

      expect(result).toContain('If-None-Match');
      expect(result).toContain('etag_index_html');
      expect(result).toContain('#ifdef SVELTEESP32_ENABLE_GZIP');
    });

    it('should handle etag=compiler gzip=never', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        etag: 'compiler' as const,
        gzip: 'never' as const,
        version: '',
        cachetime: 0
      });

      expect(result).toContain('#ifdef SVELTEESP32_ENABLE_ETAG');
      expect(result).toContain('const unsigned char data_index_html');
      expect(result).not.toContain('const unsigned char datagzip_');
    });

    it('should handle etag=never gzip=compiler', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        etag: 'never' as const,
        gzip: 'compiler' as const,
        version: '',
        cachetime: 0
      });

      expect(result).not.toContain('If-None-Match');
      expect(result).toContain('#ifdef SVELTEESP32_ENABLE_GZIP');
    });
  });

  describe('basePath for espidf', () => {
    it('should prefix URI with basePath', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        version: '',
        basePath: '/ui',
        cachetime: 0
      });

      expect(result).toContain('.uri = "/ui/index.html"');
      expect(result).toContain('SVELTEESP32_onFileServed("/ui/index.html", 200)');
      expect(result).toContain('SVELTEESP32_onFileServed("/ui/index.html", 304)');
    });

    it('should create basePath default route', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        version: '',
        basePath: '/admin',
        cachetime: 0
      });

      // Should have basePath as default route
      expect(result).toContain('.uri = "/admin"');
      expect(result).toContain('route_def_INDEX_HTML');
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

    it('should use "/" as default route when basePath is empty', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, { ...mockOptions, version: '', cachetime: 0 });

      // Check for default route with "/"
      expect(result).toContain('.uri = "/"');
    });
  });

  describe('memory management for espidf', () => {
    it('should use malloc/free for ETag validation', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, { ...mockOptions, version: '', cachetime: 0 });

      expect(result).toContain('char* hdr_value = malloc(hdr_len + 1)');
      expect(result).toContain('free(hdr_value)');
    });

    it('should use httpd_req_get_hdr_value_len for ETag header length', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, { ...mockOptions, version: '', cachetime: 0 });

      expect(result).toContain('httpd_req_get_hdr_value_len(req, "If-None-Match")');
      expect(result).toContain('httpd_req_get_hdr_value_str(req, "If-None-Match", hdr_value, hdr_len + 1)');
    });
  });

  describe('file manifest for espidf', () => {
    it('should generate C-compatible typedef struct', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('typedef struct {');
      expect(result).toContain('const char* path;');
      expect(result).toContain('uint32_t size;');
      expect(result).toContain('uint32_t gzipSize;');
      expect(result).toContain('const char* etag;');
      expect(result).toContain('const char* contentType;');
      expect(result).toContain('} SVELTEESP32_FileInfo;');
    });

    it('should use static const for manifest array', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('static const SVELTEESP32_FileInfo SVELTEESP32_FILES[] = {');
      expect(result).toContain('static const size_t SVELTEESP32_FILE_COUNT');
    });

    it('should use custom definePrefix in manifest', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        version: '',
        define: 'MYAPP',
        cachetime: 0
      });

      expect(result).toContain('} MYAPP_FileInfo;');
      expect(result).toContain('static const MYAPP_FileInfo MYAPP_FILES[]');
      expect(result).toContain('static const size_t MYAPP_FILE_COUNT');
    });
  });

  describe('onFileServed hook for espidf', () => {
    it('should generate C-style weak function (no extern "C")', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain(
        '__attribute__((weak)) void SVELTEESP32_onFileServed(const char* path, int statusCode) {}'
      );
      // Should NOT have extern "C" - this is already C code
      const lines = result.split('\n');
      const hookLine = lines.find(
        (line) => line.includes('__attribute__((weak)) void') && line.includes('onFileServed')
      );
      expect(hookLine).not.toContain('extern "C"');
    });

    it('should generate hook calls with status 200', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('SVELTEESP32_onFileServed("/index.html", 200)');
    });

    it('should generate hook calls with status 304 when etag enabled', () => {
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

      expect(result).toContain('__attribute__((weak)) void MYAPP_onFileServed(const char* path, int statusCode) {}');
      expect(result).toContain('MYAPP_onFileServed("/index.html", 200)');
      expect(result).toContain('MYAPP_onFileServed("/index.html", 304)');
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
      // Should NOT have 304 hook call
      expect(result).not.toContain('SVELTEESP32_onFileServed("/index.html", 304)');
    });
  });

  describe('cache control for espidf', () => {
    it('should include cache-control header with cachetime', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('httpd_resp_set_hdr(req, "Cache-Control", "max-age=86400")');
    });

    it('should use no-cache when cachetime is 0', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, { ...mockOptions, version: '', cachetime: 0 });

      expect(result).toContain('httpd_resp_set_hdr(req, "Cache-Control", "no-cache")');
    });

    it('should set ETag header when etag is enabled', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('httpd_resp_set_hdr(req, "ETag", etag_index_html)');
    });
  });

  describe('304 response handling for espidf', () => {
    it('should set 304 status correctly', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('httpd_resp_set_status(req, "304 Not Modified")');
    });

    it('should send empty response for 304', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, mockOptions);

      expect(result).toContain('httpd_resp_send(req, NULL, 0)');
    });
  });

  describe('multiple files for espidf', () => {
    it('should generate handlers for multiple files', async () => {
      const sources: CppCodeSources = [
        createMockSource('index.html', '<html></html>'),
        createMockSource('style.css', 'body{}'),
        createMockSource('app.js', 'console.log()')
      ];
      const result = getCppCode(sources, mockFilesByExtension, { ...mockOptions, version: '', cachetime: 0 });

      expect(result).toContain('file_handler_INDEX_HTML');
      expect(result).toContain('file_handler_STYLE_CSS');
      expect(result).toContain('file_handler_APP_JS');
      expect(result).toContain('.uri = "/index.html"');
      expect(result).toContain('.uri = "/style.css"');
      expect(result).toContain('.uri = "/app.js"');
    });

    it('should generate correct COUNT define for multiple files', async () => {
      const sources: CppCodeSources = [
        createMockSource('index.html', '<html></html>'),
        createMockSource('style.css', 'body{}')
      ];
      const result = getCppCode(sources, mockFilesByExtension, { ...mockOptions, version: '', cachetime: 0 });

      expect(result).toContain('#define SVELTEESP32_COUNT 2');
    });
  });

  describe('SPA catch-all', () => {
    it('should not generate spa_handler when spa is false', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, { ...mockOptions, version: '', cachetime: 0 });

      expect(result).not.toContain('spa_handler_');
      expect(result).not.toContain('httpd_register_err_handler');
    });

    it('should generate spa_handler and register it when spa is true', async () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension, {
        ...mockOptions,
        version: '',
        cachetime: 0,
        spa: true
      });

      expect(result).toContain('spa_handler_INDEX_HTML');
      expect(result).toContain('httpd_register_err_handler');
      expect(result).toContain('HTTPD_404_NOT_FOUND');
    });
  });
});
