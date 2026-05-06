import path from 'node:path';

import type { ICopyFilesArguments, IRcFileConfig } from './commandLine';
import { loadRcFileConfig, validateBasePath } from './commandLine';
import { runPipeline } from './pipeline';

// Minimal Vite Plugin interface subset — avoids a hard vite devDependency
interface ResolvedViteConfig {
  build: {
    outDir: string;
  };
}

interface VitePlugin {
  name: string;
  configResolved: (config: ResolvedViteConfig) => void;
  closeBundle: () => void;
}

export interface SvelteESP32PluginOptions {
  /** Output .h file path (required when using plugin options) */
  output?: string;
  /** Source directory — defaults to Vite's build.outDir */
  sourcepath?: string;
  /** Target engine (default: 'psychic') */
  engine?: 'psychic' | 'async' | 'espidf' | 'webserver';
  /** ETag generation (default: 'never') */
  etag?: 'always' | 'never' | 'compiler';
  /** Gzip compression (default: 'always') */
  gzip?: 'always' | 'never' | 'compiler';
  /** Cache-Control max-age in seconds (default: 0) */
  cachetime?: number;
  /** Cache-Control max-age for HTML files (overrides cachetime) */
  cachetimehtml?: number;
  /** Cache-Control max-age for non-HTML assets (overrides cachetime) */
  cachetimeassets?: number;
  /** Files to exclude (glob patterns) */
  exclude?: string[];
  /** URL base path prefix (e.g. '/ui') */
  basepath?: string;
  /** Generated method name (default: 'initSvelteStaticFiles') */
  espmethod?: string;
  /** C++ #define prefix (default: 'SVELTEESP32') */
  define?: string;
  /** Version string to embed in the header */
  version?: string;
  /** Include creation timestamp (default: false) */
  created?: boolean;
  /** Serve index.html for unmatched routes (SPA routing) */
  spa?: boolean;
  /** Write companion JSON manifest alongside the header */
  manifest?: boolean;
  /** Skip index.html validation */
  noindexcheck?: boolean;
  /** Maximum total uncompressed size in bytes */
  maxsize?: number;
  /** Maximum total gzip size in bytes */
  maxgzipsize?: number;
}

function coerceBool(value: boolean | 'true' | 'false' | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return value === true || value === 'true';
}

/**
 * Vite plugin for svelteesp32.
 *
 * Call with no argument (or a string RC file path) to load all settings from the RC file:
 *   svelteESP32()
 *   svelteESP32('/path/to/custom.rc.json')
 *
 * Call with an options object to configure entirely from the plugin — the RC file is ignored:
 *   svelteESP32({ output: '../firmware/web.h', engine: 'async' })
 */
export function svelteESP32(optionsOrRcPath?: SvelteESP32PluginOptions | string): VitePlugin {
  let outDirectory = 'dist';

  return {
    name: 'svelteesp32',

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

        options_ = {
          configSource: 'rcfile',
          engine: rcConfig.engine ?? 'psychic',
          sourcepath,
          outputfile,
          etag: rcConfig.etag ?? 'never',
          gzip: rcConfig.gzip ?? 'always',
          cachetime: rcConfig.cachetime ?? 0,
          cachetimeHtml: rcConfig.cachetimehtml,
          cachetimeAssets: rcConfig.cachetimeassets,
          created: coerceBool(rcConfig.created) ?? false,
          version: rcConfig.version ?? '',
          espmethod: rcConfig.espmethod ?? 'initSvelteStaticFiles',
          define: rcConfig.define ?? 'SVELTEESP32',
          exclude: rcConfig.exclude ?? [],
          basePath,
          noIndexCheck: coerceBool(rcConfig.noindexcheck),
          spa: coerceBool(rcConfig.spa),
          manifest: coerceBool(rcConfig.manifest),
          maxSize: rcConfig.maxsize as number | undefined,
          maxGzipSize: rcConfig.maxgzipsize as number | undefined
        };
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

        options_ = {
          configSource: 'vite',
          engine: options.engine ?? 'psychic',
          sourcepath,
          outputfile,
          etag: options.etag ?? 'never',
          gzip: options.gzip ?? 'always',
          cachetime: options.cachetime ?? 0,
          cachetimeHtml: options.cachetimehtml,
          cachetimeAssets: options.cachetimeassets,
          created: options.created ?? false,
          version: options.version ?? '',
          espmethod: options.espmethod ?? 'initSvelteStaticFiles',
          define: options.define ?? 'SVELTEESP32',
          exclude: options.exclude ?? [],
          basePath,
          noIndexCheck: options.noindexcheck,
          spa: options.spa,
          manifest: options.manifest,
          maxSize: options.maxsize,
          maxGzipSize: options.maxgzipsize
        };
      }

      runPipeline(options_);
    }
  };
}
