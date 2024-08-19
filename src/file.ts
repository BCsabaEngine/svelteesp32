import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { globSync } from 'glob';

import { cmdLine } from './commandLine';
import { redLog, yellowLog } from './consoleColor';

const findSimilarFiles = (files: Map<string, Buffer>): string[][] => {
  const contentComparer: Map<string, string[]> = new Map();
  for (const [filename, content] of files.entries()) {
    const hash = createHash('md5').update(content.toString()).digest('hex');
    if (contentComparer.has(hash)) contentComparer.get(hash)!.push(filename);
    else contentComparer.set(hash, [filename]);
  }

  const result: string[][] = [];
  for (const filenames of contentComparer.values()) if (filenames.length > 1) result.push(filenames);
  return result;
};

export const getFiles = (): Map<string, Buffer> => {
  let filenames = globSync('**/*', { cwd: cmdLine.sourcepath, nodir: true });
  filenames = filenames.filter((filename) => {
    const extension = path.extname(filename);
    if (['.gz', '.brottli', '.br'].includes(extension)) {
      const original = filename.slice(0, -1 * extension.length);
      if (filenames.includes(original)) {
        console.log(redLog(`${filename} skipped because is perhaps a compressed version of ${original}`));
        return false;
      }
    }
    return true;
  });

  const result: Map<string, Buffer> = new Map();
  for (const filename of filenames)
    result.set(filename, readFileSync(path.join(cmdLine.sourcepath, filename), { flag: 'r' }));
  for (const sameFile of findSimilarFiles(result))
    console.log(yellowLog(`${sameFile.join(', ')} files look like identical`));
  return result;
};
