import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import picomatch from 'picomatch';
import { globSync } from 'tinyglobby';

import { cmdLine } from './commandLine';
import { cyanLog, redLog, yellowLog } from './consoleColor';

/**
 * Find files with identical content based on SHA256 hash
 */
const findSimilarFiles = (files: Map<string, Buffer>): string[][] => {
  const contentComparer: Map<string, string[]> = new Map();

  for (const [filename, content] of files.entries()) {
    const hash = createHash('sha256').update(content).digest('hex');
    const existingFiles = contentComparer.get(hash);

    if (existingFiles) existingFiles.push(filename);
    else contentComparer.set(hash, [filename]);
  }

  const result: string[][] = [];
  for (const filenames of contentComparer.values()) if (filenames.length > 1) result.push(filenames);

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
 * Check if a file matches any of the exclude patterns
 * @param filename - Relative file path to check
 * @param excludePatterns - Array of glob patterns to match against
 * @returns true if file should be excluded
 */
const isExcluded = (filename: string, excludePatterns: string[]): boolean => {
  if (excludePatterns.length === 0) return false;

  // Normalize path separators for consistent matching (Windows compatibility)
  // eslint-disable-next-line unicorn/prefer-string-replace-all
  const normalizedFilename = filename.replace(/\\/g, '/');

  // Create matcher function for all patterns
  const isMatch = picomatch(excludePatterns, {
    dot: true, // Match dotfiles
    noglobstar: false, // Enable ** for directory recursion
    matchBase: false // Don't match basename only (require full path)
  });

  return isMatch(normalizedFilename);
};

/**
 * Get all files from the source directory, excluding pre-compressed variants
 * @returns Map of filename to file contents
 */
export const getFiles = (): Map<string, Buffer> => {
  const allFilenames = globSync('**/*', { cwd: cmdLine.sourcepath, onlyFiles: true, dot: false });

  // Filter pre-compressed files
  const withoutCompressed = allFilenames.filter((filename) => !shouldSkipFile(filename, allFilenames));

  // Filter excluded files
  const excludePatterns = cmdLine.exclude || [];
  const excludedFiles: string[] = [];
  const filenames = withoutCompressed.filter((filename) => {
    if (isExcluded(filename, excludePatterns)) {
      excludedFiles.push(filename);
      return false;
    }
    return true;
  });

  // Report excluded files
  if (excludedFiles.length > 0) {
    console.log(`\nExcluded ${excludedFiles.length} file(s):`);
    // Show first 10 excluded files, then summarize if more
    const displayLimit = 10;
    for (const file of excludedFiles.slice(0, displayLimit)) console.log(cyanLog(`- ${file}`));

    if (excludedFiles.length > displayLimit)
      console.log(cyanLog(`... and ${excludedFiles.length - displayLimit} more`));

    console.log(); // Blank line for readability
  }

  const result: Map<string, Buffer> = new Map();
  for (const filename of filenames) {
    const filePath = path.join(cmdLine.sourcepath, filename);
    result.set(filename, readFileSync(filePath, { flag: 'r' }));
  }

  // Report duplicate files
  const duplicates = findSimilarFiles(result);
  for (const sameFiles of duplicates) console.log(yellowLog(` ${sameFiles.join(', ')} files look like identical`));

  return result;
};
