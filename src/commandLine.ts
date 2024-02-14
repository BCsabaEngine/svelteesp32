import { existsSync, statSync } from 'node:fs';

import { parse } from 'ts-command-line-args';

interface ICopyFilesArguments {
  sourcepath: string;
  outputfile: string;
  espmethod: string;
  'no-gzip': boolean;
  help?: boolean;
}

export const cmdLine = parse<ICopyFilesArguments>(
  {
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
    'no-gzip': {
      type: Boolean,
      description: 'Do not compress content with gzip',
      defaultValue: false
    },
    espmethod: {
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

if (!existsSync(cmdLine.sourcepath) || !statSync(cmdLine.sourcepath).isDirectory()) {
  console.error(`Directory ${cmdLine.sourcepath} not exists or not a directory`);
  process.exit(1);
}
