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
  /** Output .h file path (can be provided via RC file outputfile) */
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
  /** Path to a custom RC file (default: auto-discover .svelteesp32rc.json) */
  config?: string;
}

function coerceBool(value: boolean | 'true' | 'false' | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return value === true || value === 'true';
}

export function svelteESP32(options: SvelteESP32PluginOptions): VitePlugin {
  let outDirectory = 'dist';

  return {
    name: 'svelteesp32',

    configResolved(config: ResolvedViteConfig): void {
      outDirectory = config.build.outDir;
    },

    closeBundle(): void {
      const rcConfig: Partial<IRcFileConfig> = loadRcFileConfig(options.config);

      const rawOutput = options.output ?? rcConfig.outputfile;
      if (!rawOutput)
        throw new Error('output is required — specify it as a plugin option or in the RC file (outputfile)');
      const outputfile = path.resolve(rawOutput);

      const sourcepath = options.sourcepath ?? rcConfig.sourcepath ?? outDirectory;

      const rawBasepath = options.basepath ?? rcConfig.basepath ?? '';
      const basePath = validateBasePath(rawBasepath);

      const options_: ICopyFilesArguments = {
        engine: options.engine ?? rcConfig.engine ?? 'psychic',
        sourcepath,
        outputfile,
        etag: options.etag ?? rcConfig.etag ?? 'never',
        gzip: options.gzip ?? rcConfig.gzip ?? 'always',
        cachetime: options.cachetime ?? rcConfig.cachetime ?? 0,
        cachetimeHtml: options.cachetimehtml ?? rcConfig.cachetimehtml,
        cachetimeAssets: options.cachetimeassets ?? rcConfig.cachetimeassets,
        created: options.created ?? coerceBool(rcConfig.created) ?? false,
        version: options.version ?? rcConfig.version ?? '',
        espmethod: options.espmethod ?? rcConfig.espmethod ?? 'initSvelteStaticFiles',
        define: options.define ?? rcConfig.define ?? 'SVELTEESP32',
        exclude: options.exclude ?? rcConfig.exclude ?? [],
        basePath,
        noIndexCheck: options.noindexcheck ?? coerceBool(rcConfig.noindexcheck),
        spa: options.spa ?? coerceBool(rcConfig.spa),
        manifest: options.manifest ?? coerceBool(rcConfig.manifest),
        maxSize: options.maxsize ?? (rcConfig.maxsize as number | undefined),
        maxGzipSize: options.maxgzipsize ?? (rcConfig.maxgzipsize as number | undefined)
      };

      runPipeline(options_);
    }
  };
}
