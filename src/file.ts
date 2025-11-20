import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { globSync } from 'tinyglobby';

import { cmdLine } from './commandLine';
import { redLog, yellowLog } from './consoleColor';

/**
 * Find files with identical content based on SHA256 hash
 */
const findSimilarFiles = (files: Map<string, Buffer>): string[][] => {
  const contentComparer: Map<string, string[]> = new Map();

  for (const [filename, content] of files.entries()) {
    const hash = createHash('sha256').update(content).digest('hex');
    const existingFiles = contentComparer.get(hash);

    if (existingFiles) {
      existingFiles.push(filename);
    } else {
      contentComparer.set(hash, [filename]);
    }
  }

  const result: string[][] = [];
  for (const filenames of contentComparer.values()) {
    if (filenames.length > 1) {
      result.push(filenames);
    }
  }

  return result;
};

/**
 * Check if a file should be skipped (e.g., pre-compressed files when original exists)
 */
const shouldSkipFile = (filename: string, allFilenames: string[]): boolean => {
  const extension = path.extname(filename);
  const compressedExtensions = ['.gz', '.brottli', '.br'];

  if (compressedExtensions.includes(extension)) {
    const original = filename.slice(0, -1 * extension.length);
    if (allFilenames.includes(original)) {
      console.log(redLog(` ${filename} skipped because is perhaps a compressed version of ${original}`));
      return true;
    }
  }

  return false;
};

/**
 * Get all files from the source directory, excluding pre-compressed variants
 * @returns Map of filename to file contents
 */
export const getFiles = (): Map<string, Buffer> => {
  const allFilenames = globSync('**/*', { cwd: cmdLine.sourcepath, onlyFiles: true, dot: false });
  const filenames = allFilenames.filter((filename) => !shouldSkipFile(filename, allFilenames));

  const result: Map<string, Buffer> = new Map();
  for (const filename of filenames) {
    const filePath = path.join(cmdLine.sourcepath, filename);
    result.set(filename, readFileSync(filePath, { flag: 'r' }));
  }

  // Report duplicate files
  const duplicates = findSimilarFiles(result);
  for (const sameFiles of duplicates) {
    console.log(yellowLog(` ${sameFiles.join(', ')} files look like identical`));
  }

  return result;
};
