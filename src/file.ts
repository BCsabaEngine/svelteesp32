import { extname } from 'node:path';

import { globSync } from 'glob';

import { cmdLine } from './commandLine';

export const getFiles = (): string[] =>
  globSync('**/*', { cwd: cmdLine.sourcepath, nodir: true })
    .filter((filename) => !['.gz', '.brottli'].includes(extname(filename)))
    .sort();
