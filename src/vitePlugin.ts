import path from 'node:path';

import type { ICopyFilesArguments, IRcFileConfig } from './commandLine';
import { loadRcFileConfig, validateBasePath } from './commandLine';
import { runPipeline } from './pipeline';

// Minimal Vite Plugin interface subset — avoids a hard Vite devDependency
interface ResolvedViteConfig {
  build: {
    outDir: string;
  };
}

interface VitePlugin {
  name: string;
  apply: 'build';
  enforce: 'post';
  configResolved: (config: ResolvedViteConfig) => void;
  closeBundle: () => void;
}

export interface SvelteESP32PluginOptions {
  /**
  Output .h file path (required when using plugin options)
  */
  output?: string;
  /**
  Source directory — defaults to Vite's build.outDir
  */
  sourcepath?: string;
  /**
  Target engine (default: 'psychic')
  */
  engine?: 'psychic' | 'async' | 'espidf' | 'webserver';
  /**
  ETag generation (default: 'never')
  */
  etag?: 'always' | 'never' | 'compiler';
  /**
  Gzip compression (default: 'always')
  */
  gzip?: 'always' | 'never' | 'compiler';
  /**
  Cache-Control max-age in seconds (default: 0)
  */
  cachetime?: number;
  /**
  Cache-Control max-age for HTML files (overrides cachetime)
  */
  cachetimehtml?: number;
  /**
  Cache-Control max-age for non-HTML assets (overrides cachetime)
  */
  cachetimeassets?: number;
  /**
  Files to exclude (glob patterns)
  */
  exclude?: string[];
  /**
  URL base path prefix (e.g. '/ui')
  */
  basepath?: string;
  /**
  Generated method name (default: 'initSvelteStaticFiles')
  */
  espmethod?: string;
  /**
  C++ #define prefix (default: 'SVELTEESP32')
  */
  define?: string;
  /**
  Version string to embed in the header
  */
  version?: string;
  /**
  Include creation timestamp (default: false)
  */
  created?: boolean;
  /**
  Serve index.html for unmatched routes (SPA routing)
  */
  spa?: boolean;
  /**
  Write companion JSON manifest alongside the header
  */
  manifest?: boolean;
  /**
  Skip index.html validation
  */
  noindexcheck?: boolean;
  /**
  Maximum total uncompressed size in bytes
  */
  maxsize?: number;
  /**
  Maximum total gzip size in bytes
  */
  maxgzipsize?: number;
}

function coerceBool(value: boolean | 'true' | 'false' | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return value === true || value === 'true';
}

// The RC file and the plugin options carry the same key names (only outputfile/output differ) but
// different value types: RC booleans may arrive as "true"/"false" strings, plugin options are real
// booleans. coerceBool accepts both, so one builder covers the two modes and they cannot drift.
type ConfigSource = Omit<SvelteESP32PluginOptions, 'output' | 'created' | 'noindexcheck' | 'spa' | 'manifest'> & {
  created?: boolean | 'true' | 'false';
  noindexcheck?: boolean | 'true' | 'false';
  spa?: boolean | 'true' | 'false';
  manifest?: boolean | 'true' | 'false';
};

function buildArguments(
  source: ConfigSource,
  resolved: {
    configSource: ICopyFilesArguments['configSource'];
    sourcepath: string;
    outputfile: string;
    basePath: string;
  }
): ICopyFilesArguments {
  return {
    configSource: resolved.configSource,
    engine: source.engine ?? 'psychic',
    sourcepath: resolved.sourcepath,
    outputfile: resolved.outputfile,
    etag: source.etag ?? 'never',
    gzip: source.gzip ?? 'always',
    cachetime: source.cachetime ?? 0,
    cachetimeHtml: source.cachetimehtml,
    cachetimeAssets: source.cachetimeassets,
    created: coerceBool(source.created) ?? false,
    version: source.version ?? '',
    espmethod: source.espmethod ?? 'initSvelteStaticFiles',
    define: source.define ?? 'SVELTEESP32',
    exclude: source.exclude ?? [],
    basePath: resolved.basePath,
    noIndexCheck: coerceBool(source.noindexcheck),
    spa: coerceBool(source.spa),
    manifest: coerceBool(source.manifest),
    maxSize: source.maxsize,
    maxGzipSize: source.maxgzipsize
  };
}

/**
Vite plugin for svelteesp32.

Call with no argument (or a string RC file path) to load all settings from the RC file:
  svelteESP32()
  svelteESP32('/path/to/custom.rc.json')

Call with an options object to configure entirely from the plugin — the RC file is ignored:
  svelteESP32({ output: '../firmware/web.h', engine: 'async' })
*/
export function svelteESP32(optionsOrRcPath?: SvelteESP32PluginOptions | string): VitePlugin {
  let outDirectory = 'dist';

  return {
    name: 'svelteesp32',

    // The dev server's plugin container also fires closeBundle on shutdown, which would regenerate
    // the header from a stale or partially written outDir; 'build' keeps the plugin out of it entirely.
    apply: 'build',

    // Run after plugins that emit into outDir during their own closeBundle (PWA service workers,
    // compression, static copy) so their output is picked up regardless of plugin array order.
    enforce: 'post',

    configResolved(config: ResolvedViteConfig): void {
      outDirectory = config.build.outDir;
    },

    closeBundle(): void {
      let options_: ICopyFilesArguments;

      if (optionsOrRcPath === undefined || typeof optionsOrRcPath === 'string') {
        // RC file mode — load config exclusively from the RC file
        const rcPath = optionsOrRcPath;
        const rcConfig: Partial<IRcFileConfig> = loadRcFileConfig(rcPath);

        const rawOutput = rcConfig.outputfile;
        if (!rawOutput) throw new Error('output is required — specify outputfile in the RC file (.svelteesp32rc.json)');
        const outputfile = path.resolve(rawOutput);

        const sourcepath = rcConfig.sourcepath ?? outDirectory;
        const rawBasepath = rcConfig.basepath ?? '';
        const basePath = validateBasePath(rawBasepath);

        options_ = buildArguments(
          {
            ...rcConfig,
            maxsize: rcConfig.maxsize as number | undefined,
            maxgzipsize: rcConfig.maxgzipsize as number | undefined
          },
          { configSource: 'rcfile', sourcepath, outputfile, basePath }
        );
      } else {
        // Plugin options mode — use options exclusively, RC file is ignored
        const options = optionsOrRcPath;

        const rawOutput = options.output;
        if (!rawOutput)
          throw new Error('output is required — specify it as a plugin option or use svelteESP32() for RC file mode');
        const outputfile = path.resolve(rawOutput);

        const sourcepath = options.sourcepath ?? outDirectory;
        const rawBasepath = options.basepath ?? '';
        const basePath = validateBasePath(rawBasepath);

        options_ = buildArguments(options, { configSource: 'vite', sourcepath, outputfile, basePath });
      }

      runPipeline(options_);
    }
  };
}
