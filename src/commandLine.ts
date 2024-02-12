import { existsSync, statSync } from 'node:fs';

import { parse } from 'ts-command-line-args';

interface ICopyFilesArguments {
  sveltePath: string;
  espFile: string;
  espMethodName: string;
  gzip: boolean;
  help?: boolean;
}

export const cmdLine = parse<ICopyFilesArguments>(
  {
    sveltePath: {
      type: String,
      alias: 's',
      description: 'Svelte dist folder contains compiled files'
    },
    espFile: {
      type: String,
      alias: 'e',
      description: 'Generated file with path',
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

if (!existsSync(cmdLine.sveltePath) || !statSync(cmdLine.sveltePath).isDirectory()) {
  console.error(`Directory ${cmdLine.sveltePath} not exists or not a directory`);
  process.exit(1);
}
