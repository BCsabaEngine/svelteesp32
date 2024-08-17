import path from 'node:path';

import { globSync } from 'glob';

import { cmdLine } from './commandLine';

export const getFiles = (): string[] => {
  let files = globSync('**/*', { cwd: cmdLine.sourcepath, nodir: true });
  files = files.filter((filename) => {
    const extension = path.extname(filename);
    if (['.gz', '.brottli', '.br'].includes(extension)) {
      const original = filename.slice(0, -1 * extension.length);
      if (files.includes(original)) {
        console.log(`Skip because ${filename} is perhaps a compressed version of ${original}`);
        return false;
      }
    }
    return true;
  });
  return files.sort();
};
