import path from 'node:path';

import type { ICopyFilesArguments } from './commandLine';
import { runPipeline } from './pipeline';

// Minimal Vite Plugin interface subset — avoids a hard vite devDependency
interface ResolvedViteConfig {
  build: {
    outDir: string;
  };
}

interface VitePlugin {
  name: string;
  configResolved(config: ResolvedViteConfig): void;
  closeBundle(): void;
}

export interface SvelteESP32PluginOptions {
  /** Output .h file path (required) */
  output: string;
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
  cachetimeHtml?: number;
  /** Cache-Control max-age for non-HTML assets (overrides cachetime) */
  cachetimeAssets?: number;
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
  noIndexCheck?: boolean;
  /** Maximum total uncompressed size in bytes */
  maxSize?: number;
  /** Maximum total gzip size in bytes */
  maxGzipSize?: number;
}

export function svelteESP32(options: SvelteESP32PluginOptions): VitePlugin {
  let outDirectory = 'dist';

  return {
    name: 'svelteesp32',

    configResolved(config: ResolvedViteConfig): void {
      outDirectory = config.build.outDir;
    },

    closeBundle(): void {
      const sourcepath = options.sourcepath ?? outDirectory;
      const outputfile = path.resolve(options.output);

      if (options.basepath !== undefined) {
        const bp = options.basepath;
        if (bp !== '' && !bp.startsWith('/')) throw new Error(`basePath must start with /: ${bp}`);
        if (bp.endsWith('/')) throw new Error(`basePath must not end with /: ${bp}`);
        if (bp.includes('//')) throw new Error(`basePath must not contain //: ${bp}`);
        if (bp.includes('"')) throw new Error(`basePath must not contain double quotes: ${bp}`);
        if (bp.includes('\\')) throw new Error(`basePath must not contain backslashes: ${bp}`);
      }

      const options_: ICopyFilesArguments = {
        engine: options.engine ?? 'psychic',
        sourcepath,
        outputfile,
        etag: options.etag ?? 'never',
        gzip: options.gzip ?? 'always',
        cachetime: options.cachetime ?? 0,
        cachetimeHtml: options.cachetimeHtml,
        cachetimeAssets: options.cachetimeAssets,
        created: options.created ?? false,
        version: options.version ?? '',
        espmethod: options.espmethod ?? 'initSvelteStaticFiles',
        define: options.define ?? 'SVELTEESP32',
        exclude: options.exclude ?? [],
        basePath: options.basepath ?? '',
        noIndexCheck: options.noIndexCheck,
        spa: options.spa,
        manifest: options.manifest,
        maxSize: options.maxSize,
        maxGzipSize: options.maxGzipSize
      };

      runPipeline(options_);
    }
  };
}
