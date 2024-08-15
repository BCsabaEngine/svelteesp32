import { existsSync, statSync } from 'node:fs';

import { parse } from 'ts-command-line-args';

interface ICopyFilesArguments {
  engine: 'psychic' | 'async';
  sourcepath: string;
  outputfile: string;
  espmethod: string;
  define: string;
  gzip: 'true' | 'false' | 'compiler';
  etag: 'true' | 'false' | 'compiler';
  created: boolean;
  version: string;
  help?: boolean;
}

export const cmdLine = parse<ICopyFilesArguments>(
  {
    engine: {
      type: (value) => {
        if (value === 'psychic') return 'psychic';
        if (value === 'async') return 'async';
        throw new Error(`Invalid engine: ${value}`);
      },
      alias: 'e',
      description: 'The engine for which the include file is created (psychic|async)',
      defaultValue: 'psychic'
    },
    sourcepath: {
      type: String,
      alias: 's',
      description: 'Source dist folder contains compiled web files'
    },
    outputfile: {
      type: String,
      alias: 'o',
      description: 'Generated output file with path',
      defaultValue: 'svelteesp32.h'
    },
    etag: {
      type: (value) => {
        if (value === 'true') return 'true';
        if (value === 'false') return 'false';
        if (value === 'compiler') return 'compiler';
        throw new Error(`Invalid etag: ${value}`);
      },
      description: 'Use ETAG header for cache',
      defaultValue: 'false'
    },
    gzip: {
      type: (value) => {
        if (value === 'true') return 'true';
        if (value === 'false') return 'false';
        if (value === 'compiler') return 'compiler';
        throw new Error(`Invalid etag: ${value}`);
      },
      description: 'Compress content with gzip',
      defaultValue: 'true'
    },
    created: {
      type: Boolean,
      description: 'Include creation time in the output file',
      defaultValue: false
    },
    version: {
      type: String,
      description: 'Include version info in the output file',
      defaultValue: ''
    },
    espmethod: {
      type: String,
      description: 'Name of generated method',
      defaultValue: 'initSvelteStaticFiles'
    },
    define: {
      type: String,
      description: 'Prefix of c++ defines',
      defaultValue: 'SVELTEESP32'
    },
    help: { type: Boolean, optional: true, alias: 'h', description: 'Shows this help' }
  },
  {
    helpArg: 'help',
    headerContentSections: [{ header: 'svelteesp32', content: 'Svelte JS to ESP32 converter' }]
  }
);

if (!existsSync(cmdLine.sourcepath) || !statSync(cmdLine.sourcepath).isDirectory()) {
  console.error(`Directory ${cmdLine.sourcepath} not exists or not a directory`);
  process.exit(1);
}

console.log(`[SvelteESP32] Generate code for ${cmdLine.engine} engine`);
