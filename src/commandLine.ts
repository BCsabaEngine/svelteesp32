import { existsSync, statSync } from 'node:fs';

import { parse } from 'ts-command-line-args';

interface ICopyFilesArguments {
  sourcePath: string;
  outputFile: string;
  espMethodName: string;
  gzip: boolean;
  help?: boolean;
}

export const cmdLine = parse<ICopyFilesArguments>(
  {
    sourcePath: {
      type: String,
      alias: 's',
      description: 'Source dist folder contains compiled web files'
    },
    outputFile: {
      type: String,
      alias: 'o',
      description: 'Generated output file with path',
      defaultValue: 'svelteesp32.h'
    },
    gzip: {
      type: Boolean,
      alias: 'g',
      description: 'Compress content with gzip',
      defaultValue: false
    },
    espMethodName: {
      type: String,
      description: 'Name of generated method',
      defaultValue: 'initSvelteStaticFiles'
    },
    help: { type: Boolean, optional: true, alias: 'h', description: 'Shows this help' }
  },
  {
    helpArg: 'help',
    headerContentSections: [{ header: 'svelteesp32', content: 'Svelte JS to ESP32 converter' }]
  }
);

if (!existsSync(cmdLine.sourcePath) || !statSync(cmdLine.sourcePath).isDirectory()) {
  console.error(`Directory ${cmdLine.sourcePath} not exists or not a directory`);
  process.exit(1);
}
