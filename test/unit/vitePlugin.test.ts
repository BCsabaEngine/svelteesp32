import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadRcFileConfig } from '../../src/commandLine';
import { svelteESP32 } from '../../src/vitePlugin';

vi.mock('../../src/pipeline', () => ({
  runPipeline: vi.fn()
}));

vi.mock('../../src/commandLine', () => ({
  loadRcFileConfig: vi.fn(() => ({})),
  validateBasePath: vi.fn((v: string) => {
    if (v !== '' && !v.startsWith('/')) throw new Error(`basePath must start with /: ${v}`);
    if (v.endsWith('/')) throw new Error(`basePath must not end with /: ${v}`);
    if (v.includes('//')) throw new Error(`basePath must not contain //: ${v}`);
    if (v.includes('"')) throw new Error(`basePath must not contain double quotes: ${v}`);
    if (v.includes('\\')) throw new Error(`basePath must not contain backslashes: ${v}`);
    return v;
  })
}));

const mockConfig = { build: { outDir: 'dist' } };

describe('vitePlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadRcFileConfig).mockReturnValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return a plugin with name svelteesp32', () => {
    const plugin = svelteESP32({ output: './esp32/output.h' });
    expect(plugin.name).toBe('svelteesp32');
  });

  it('should have configResolved and closeBundle hooks', () => {
    const plugin = svelteESP32({ output: './esp32/output.h' });
    expect(typeof plugin.configResolved).toBe('function');
    expect(typeof plugin.closeBundle).toBe('function');
  });

  it('should call runPipeline with defaults after configResolved', async () => {
    const { runPipeline } = await import('../../src/pipeline');

    const plugin = svelteESP32({ output: './esp32/output.h' });
    plugin.configResolved(mockConfig);
    plugin.closeBundle();

    expect(runPipeline).toHaveBeenCalledOnce();
    const options = vi.mocked(runPipeline).mock.calls[0]?.[0];
    expect(options?.engine).toBe('psychic');
    expect(options?.sourcepath).toBe('dist');
    expect(options?.etag).toBe('never');
    expect(options?.gzip).toBe('always');
    expect(options?.cachetime).toBe(0);
    expect(options?.espmethod).toBe('initSvelteStaticFiles');
    expect(options?.define).toBe('SVELTEESP32');
    expect(options?.exclude).toEqual([]);
    expect(options?.basePath).toBe('');
    expect(options?.created).toBe(false);
    expect(options?.version).toBe('');
  });

  it('should resolve output path relative to cwd', async () => {
    const { runPipeline } = await import('../../src/pipeline');

    const plugin = svelteESP32({ output: './esp32/output.h' });
    plugin.configResolved(mockConfig);
    plugin.closeBundle();

    const options = vi.mocked(runPipeline).mock.calls[0]?.[0];
    expect(options?.outputfile).toMatch(/esp32[/\\]output\.h$/);
  });

  it('should use explicit sourcepath over build.outDir', async () => {
    const { runPipeline } = await import('../../src/pipeline');

    const plugin = svelteESP32({ output: './output.h', sourcepath: './custom/dist' });
    plugin.configResolved(mockConfig);
    plugin.closeBundle();

    const options = vi.mocked(runPipeline).mock.calls[0]?.[0];
    expect(options?.sourcepath).toBe('./custom/dist');
  });

  it('should pass all provided options to runPipeline', async () => {
    const { runPipeline } = await import('../../src/pipeline');

    const plugin = svelteESP32({
      output: './output.h',
      engine: 'async',
      etag: 'always',
      gzip: 'compiler',
      cachetime: 3600,
      cachetimehtml: 0,
      cachetimeassets: 86_400,
      exclude: ['*.map', '*.txt'],
      basepath: '/ui',
      espmethod: 'initFiles',
      define: 'MYAPP',
      version: '1.0.0',
      created: true,
      spa: true,
      manifest: true,
      noindexcheck: true,
      maxsize: 400_000,
      maxgzipsize: 150_000
    });
    plugin.configResolved(mockConfig);
    plugin.closeBundle();

    const options = vi.mocked(runPipeline).mock.calls[0]?.[0];
    expect(options?.engine).toBe('async');
    expect(options?.etag).toBe('always');
    expect(options?.gzip).toBe('compiler');
    expect(options?.cachetime).toBe(3600);
    expect(options?.cachetimeHtml).toBe(0);
    expect(options?.cachetimeAssets).toBe(86_400);
    expect(options?.exclude).toEqual(['*.map', '*.txt']);
    expect(options?.basePath).toBe('/ui');
    expect(options?.espmethod).toBe('initFiles');
    expect(options?.define).toBe('MYAPP');
    expect(options?.version).toBe('1.0.0');
    expect(options?.created).toBe(true);
    expect(options?.spa).toBe(true);
    expect(options?.manifest).toBe(true);
    expect(options?.noIndexCheck).toBe(true);
    expect(options?.maxSize).toBe(400_000);
    expect(options?.maxGzipSize).toBe(150_000);
  });

  it('should use build.outDir when no explicit sourcepath given', async () => {
    const { runPipeline } = await import('../../src/pipeline');

    const plugin = svelteESP32({ output: './output.h' });
    plugin.configResolved({ build: { outDir: 'public/build' } });
    plugin.closeBundle();

    const options = vi.mocked(runPipeline).mock.calls[0]?.[0];
    expect(options?.sourcepath).toBe('public/build');
  });

  it('should fall back to "dist" if configResolved was not called', async () => {
    const { runPipeline } = await import('../../src/pipeline');

    const plugin = svelteESP32({ output: './output.h' });
    plugin.closeBundle();

    const options = vi.mocked(runPipeline).mock.calls[0]?.[0];
    expect(options?.sourcepath).toBe('dist');
  });

  it('should throw for invalid basepath (missing leading slash)', () => {
    const plugin = svelteESP32({ output: './output.h', basepath: 'ui' });
    plugin.configResolved(mockConfig);
    expect(() => plugin.closeBundle()).toThrow('basePath must start with /');
  });

  it('should throw for basepath with trailing slash', () => {
    const plugin = svelteESP32({ output: './output.h', basepath: '/ui/' });
    plugin.configResolved(mockConfig);
    expect(() => plugin.closeBundle()).toThrow('basePath must not end with /');
  });

  it('should propagate runPipeline errors', async () => {
    const { runPipeline } = await import('../../src/pipeline');
    vi.mocked(runPipeline).mockImplementationOnce(() => {
      throw new Error('pipeline failed');
    });

    const plugin = svelteESP32({ output: './output.h' });
    plugin.configResolved(mockConfig);
    expect(() => plugin.closeBundle()).toThrow('pipeline failed');
  });

  describe('RC file integration', () => {
    it('should use RC file values when no explicit plugin options given', async () => {
      const { runPipeline } = await import('../../src/pipeline');
      vi.mocked(loadRcFileConfig).mockReturnValue({
        outputfile: './rc-output.h',
        engine: 'async',
        etag: 'always',
        gzip: 'never',
        cachetime: 7200,
        sourcepath: './rc-dist'
      });

      const plugin = svelteESP32({});
      plugin.configResolved(mockConfig);
      plugin.closeBundle();

      const options = vi.mocked(runPipeline).mock.calls[0]?.[0];
      expect(options?.engine).toBe('async');
      expect(options?.etag).toBe('always');
      expect(options?.gzip).toBe('never');
      expect(options?.cachetime).toBe(7200);
      expect(options?.sourcepath).toBe('./rc-dist');
      expect(options?.outputfile).toMatch(/rc-output\.h$/);
    });

    it('should throw when neither output nor RC outputfile is provided', () => {
      vi.mocked(loadRcFileConfig).mockReturnValue({});

      const plugin = svelteESP32({});
      plugin.configResolved(mockConfig);
      expect(() => plugin.closeBundle()).toThrow('output is required');
    });

    it('should use output from RC file outputfile when plugin output is not set', async () => {
      const { runPipeline } = await import('../../src/pipeline');
      vi.mocked(loadRcFileConfig).mockReturnValue({ outputfile: './from-rc.h' });

      const plugin = svelteESP32({});
      plugin.configResolved(mockConfig);
      plugin.closeBundle();

      const options = vi.mocked(runPipeline).mock.calls[0]?.[0];
      expect(options?.outputfile).toMatch(/from-rc\.h$/);
    });

    it('should let explicit plugin options override RC file values', async () => {
      const { runPipeline } = await import('../../src/pipeline');
      vi.mocked(loadRcFileConfig).mockReturnValue({
        engine: 'async',
        etag: 'always',
        gzip: 'never',
        cachetime: 7200
      });

      const plugin = svelteESP32({ output: './output.h', engine: 'webserver', cachetime: 0 });
      plugin.configResolved(mockConfig);
      plugin.closeBundle();

      const options = vi.mocked(runPipeline).mock.calls[0]?.[0];
      expect(options?.engine).toBe('webserver');
      expect(options?.cachetime).toBe(0);
      expect(options?.etag).toBe('always');
      expect(options?.gzip).toBe('never');
    });

    it('should pass config option to loadRcFileConfig', () => {
      vi.mocked(loadRcFileConfig).mockReturnValue({ outputfile: './output.h' });

      const plugin = svelteESP32({ config: './custom.rc.json' });
      plugin.configResolved(mockConfig);
      plugin.closeBundle();

      expect(loadRcFileConfig).toHaveBeenCalledWith('./custom.rc.json');
    });

    it('should use plugin sourcepath over RC sourcepath over outDir', async () => {
      const { runPipeline } = await import('../../src/pipeline');
      vi.mocked(loadRcFileConfig).mockReturnValue({ outputfile: './output.h', sourcepath: './rc-dist' });

      const plugin = svelteESP32({ sourcepath: './plugin-dist' });
      plugin.configResolved({ build: { outDir: 'vite-dist' } });
      plugin.closeBundle();

      const options = vi.mocked(runPipeline).mock.calls[0]?.[0];
      expect(options?.sourcepath).toBe('./plugin-dist');
    });

    it('should use RC sourcepath over outDir when plugin sourcepath is not set', async () => {
      const { runPipeline } = await import('../../src/pipeline');
      vi.mocked(loadRcFileConfig).mockReturnValue({ outputfile: './output.h', sourcepath: './rc-dist' });

      const plugin = svelteESP32({});
      plugin.configResolved({ build: { outDir: 'vite-dist' } });
      plugin.closeBundle();

      const options = vi.mocked(runPipeline).mock.calls[0]?.[0];
      expect(options?.sourcepath).toBe('./rc-dist');
    });

    it('should coerce boolean strings from RC file for noindexcheck, spa, manifest', async () => {
      const { runPipeline } = await import('../../src/pipeline');
      vi.mocked(loadRcFileConfig).mockReturnValue({
        outputfile: './output.h',
        noindexcheck: 'true',
        spa: 'false',
        manifest: 'true'
      });

      const plugin = svelteESP32({});
      plugin.configResolved(mockConfig);
      plugin.closeBundle();

      const options = vi.mocked(runPipeline).mock.calls[0]?.[0];
      expect(options?.noIndexCheck).toBe(true);
      expect(options?.spa).toBe(false);
      expect(options?.manifest).toBe(true);
    });

    it('should merge RC cachetimehtml and cachetimeassets', async () => {
      const { runPipeline } = await import('../../src/pipeline');
      vi.mocked(loadRcFileConfig).mockReturnValue({
        outputfile: './output.h',
        cachetimehtml: 300,
        cachetimeassets: 86_400
      });

      const plugin = svelteESP32({});
      plugin.configResolved(mockConfig);
      plugin.closeBundle();

      const options = vi.mocked(runPipeline).mock.calls[0]?.[0];
      expect(options?.cachetimeHtml).toBe(300);
      expect(options?.cachetimeAssets).toBe(86_400);
    });
  });
});
