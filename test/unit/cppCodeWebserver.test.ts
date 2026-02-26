import { describe, expect, it, vi } from 'vitest';

import { CppCodeSource, CppCodeSources, ExtensionGroups, getCppCode } from '../../src/cppCode';

vi.mock('../../src/commandLine', () => ({
  cmdLine: {
    sourcepath: '/test/path',
    outputfile: '/test/output.h',
    engine: 'webserver',
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

describe('cppCodeWebserver', () => {
  const mockFilesByExtension: ExtensionGroups = [
    { extension: 'HTML', count: 1 },
    { extension: 'CSS', count: 1 }
  ];

  describe('webserver template structure', () => {
    it('should contain WebServer.h include', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('#include <WebServer.h>');
    });

    it('should contain Arduino.h include', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('#include <Arduino.h>');
    });

    it('should generate init function with WebServer pointer', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('void initSvelteStaticFiles(WebServer * server)');
    });

    it('should include engine comment', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('//engine:   Arduino WebServer');
    });

    it('should include config comment', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('//config:');
    });

    it('should include version define when specified', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('#define SVELTEESP32_VERSION "v1.0.0"');
    });

    it('should use PROGMEM on data arrays', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('PROGMEM');
    });

    it('should use chunked send helper', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('SVELTEESP32_sendChunked');
      expect(result).toContain('sendContent_P');
      expect(result).toContain('4096');
    });

    it('should use server->on with lambda capturing server', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('server->on("/index.html", HTTP_GET, [server]()');
    });

    it('should use setContentLength before send', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('server->setContentLength(');
      expect(result).toContain('server->send(200, "text/html", "")');
    });

    it('should generate default "/" route for index.html', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('server->on("/", HTTP_GET, [server]()');
    });

    it('should not generate default route for non-index files', () => {
      const sources: CppCodeSources = [createMockSource('style.css', 'body{}')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).not.toContain('server->on("/", HTTP_GET');
    });

    it('should use extern "C" weak function for hook', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('extern "C" void __attribute__((weak)) SVELTEESP32_onFileServed');
    });

    it('should generate file manifest struct', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('struct SVELTEESP32_FileInfo');
      expect(result).toContain('SVELTEESP32_FILES[]');
      expect(result).toContain('SVELTEESP32_FILE_COUNT');
    });
  });

  describe('etag/gzip combinations for webserver', () => {
    it('should handle etag=true gzip=true', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'webserver',
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

      expect(result).toContain('server->hasHeader("If-None-Match")');
      expect(result).toContain('etag_index_html');
      expect(result).toContain('datagzip_index_html');
      expect(result).toContain('Content-Encoding');
    });

    it('should handle etag=false gzip=false', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'webserver',
          etag: 'false',
          gzip: 'false',
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

      expect(result).not.toContain('If-None-Match');
      expect(result).toContain('data_index_html');
      expect(result).not.toContain('datagzip_');
    });

    it('should handle etag=true gzip=false', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'webserver',
          etag: 'true',
          gzip: 'false',
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

      expect(result).toContain('If-None-Match');
      expect(result).toContain('etag_index_html');
      expect(result).toContain('data_index_html');
      expect(result).not.toContain('datagzip_');
    });

    it('should handle etag=false gzip=true', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'webserver',
          etag: 'false',
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

      expect(result).not.toContain('If-None-Match');
      expect(result).toContain('datagzip_index_html');
      expect(result).toContain('Content-Encoding');
    });

    it('should handle etag=compiler gzip=compiler', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'webserver',
          etag: 'compiler',
          gzip: 'compiler',
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

      expect(result).toContain('#ifdef SVELTEESP32_ENABLE_ETAG');
      expect(result).toContain('#ifdef SVELTEESP32_ENABLE_GZIP');
    });

    it('should handle etag=compiler gzip=true', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'webserver',
          etag: 'compiler',
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

      expect(result).toContain('#ifdef SVELTEESP32_ENABLE_ETAG');
      expect(result).toContain('datagzip_index_html');
    });

    it('should handle etag=true gzip=compiler', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'webserver',
          etag: 'true',
          gzip: 'compiler',
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

      expect(result).toContain('If-None-Match');
      expect(result).toContain('etag_index_html');
      expect(result).toContain('#ifdef SVELTEESP32_ENABLE_GZIP');
    });

    it('should handle etag=compiler gzip=false', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'webserver',
          etag: 'compiler',
          gzip: 'false',
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

      expect(result).toContain('#ifdef SVELTEESP32_ENABLE_ETAG');
      expect(result).toContain('data_index_html');
      expect(result).not.toContain('datagzip_');
    });

    it('should handle etag=false gzip=compiler', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'webserver',
          etag: 'false',
          gzip: 'compiler',
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

      expect(result).not.toContain('If-None-Match');
      expect(result).toContain('#ifdef SVELTEESP32_ENABLE_GZIP');
    });
  });

  describe('cache-control for webserver', () => {
    it('should include Cache-Control max-age when cachetime is set', () => {
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('server->sendHeader("Cache-Control", "max-age=86400")');
    });

    it('should use no-cache when cachetime is 0', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'webserver',
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

      expect(result).toContain('server->sendHeader("Cache-Control", "no-cache")');
    });
  });

  describe('basePath for webserver', () => {
    it('should prefix URI with basePath', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'webserver',
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
    });

    it('should create basePath default route', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'webserver',
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

      expect(result).toContain('server->on("/admin", HTTP_GET');
      expect(result).toContain('SVELTEESP32_onFileServed("/admin", 200)');
    });

    it('should use "/" as default route when basePath is empty', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'webserver',
          etag: 'false',
          gzip: 'false',
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

      expect(result).toContain('server->on("/", HTTP_GET');
    });

    it('should include basePath in manifest paths', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'webserver',
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
  });

  describe('custom define prefix for webserver', () => {
    it('should use custom definePrefix in all generated code', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'webserver',
          etag: 'true',
          gzip: 'true',
          cachetime: 0,
          created: false,
          version: '',
          espmethod: 'initSvelteStaticFiles',
          define: 'MYAPP',
          exclude: [],
          basePath: ''
        },
        formatConfiguration: vi.fn((cmdLine) => `engine=${cmdLine.engine}`)
      }));

      const { getCppCode } = await import('../../src/cppCode');
      const sources: CppCodeSources = [createMockSource('index.html', '<html></html>')];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('MYAPP_sendChunked');
      expect(result).toContain('MYAPP_onFileServed');
      expect(result).toContain('struct MYAPP_FileInfo');
      expect(result).toContain('MYAPP_FILES[]');
    });
  });

  describe('multiple files for webserver', () => {
    it('should generate routes for all files', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'webserver',
          etag: 'false',
          gzip: 'false',
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
      const sources: CppCodeSources = [
        createMockSource('index.html', '<html></html>'),
        createMockSource('style.css', 'body{}'),
        createMockSource('app.js', 'var x=1')
      ];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('server->on("/index.html", HTTP_GET');
      expect(result).toContain('server->on("/style.css", HTTP_GET');
      expect(result).toContain('server->on("/app.js", HTTP_GET');
      // Only index.html should get default route
      expect(result).toContain('server->on("/", HTTP_GET');
    });

    it('should generate file count define for multiple files', async () => {
      vi.resetModules();
      vi.doMock('../../src/commandLine', () => ({
        cmdLine: {
          engine: 'webserver',
          etag: 'false',
          gzip: 'false',
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
      const sources: CppCodeSources = [
        createMockSource('index.html', '<html></html>'),
        createMockSource('style.css', 'body{}')
      ];
      const result = getCppCode(sources, mockFilesByExtension);

      expect(result).toContain('#define SVELTEESP32_COUNT 2');
    });
  });
});
