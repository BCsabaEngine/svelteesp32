/* eslint-disable unicorn/prefer-string-replace-all */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { lookup as mimeLookup } from 'mime-types';

import { cmdLine } from './commandLine';
import { greenLog, yellowLog } from './consoleColor';
import { CppCodeSource, CppCodeSources, ExtensionGroups, getCppCode } from './cppCode';
import { getMaxUriHandlersHint, getSizeBudgetExceededError } from './errorMessages';
import { getFiles } from './file';

// Compression thresholds
const GZIP_MIN_SIZE = 1024;
const GZIP_MIN_REDUCTION_RATIO = 0.85;

type ProcessingSummary = {
  filecount: number;
  size: number;
  gzipsize: number;
};

const summary: ProcessingSummary = {
  filecount: 0,
  size: 0,
  gzipsize: 0
};

const sources: CppCodeSources = [];
const filesByExtension: ExtensionGroups = [];

/**
 * Determine if gzip compression should be used based on size and compression ratio
 */
const shouldUseGzip = (originalSize: number, compressedSize: number): boolean =>
  originalSize > GZIP_MIN_SIZE && compressedSize < originalSize * GZIP_MIN_REDUCTION_RATIO;

/**
 * Calculate compression ratio as percentage
 */
const calculateCompressionRatio = (originalSize: number, compressedSize: number): number =>
  Math.round((compressedSize / originalSize) * 100);

/**
 * Format compression log message for a file
 */
const formatCompressionLog = (
  filename: string,
  padding: string,
  originalSize: number,
  compressedSize: number,
  useGzip: boolean
): string => {
  const ratio = calculateCompressionRatio(originalSize, compressedSize);
  const sizeInfo = `(${originalSize} -> ${compressedSize} = ${ratio}%)`;

  if (useGzip) return greenLog(` [${filename}] ${padding} ✓ gzip used ${sizeInfo}`);

  const tooSmall = originalSize <= GZIP_MIN_SIZE ? '(too small) ' : '';
  return yellowLog(` [${filename}] ${padding} x gzip unused ${tooSmall}${sizeInfo}`);
};

/**
 * Create a source entry for C++ code generation
 */
const createSourceEntry = (
  filename: string,
  dataname: string,
  content: Buffer,
  contentGzip: Buffer,
  mimeType: string,
  sha256: string,
  isGzip: boolean
): CppCodeSource => ({
  filename,
  dataname,
  datanameUpperCase: dataname.toUpperCase(),
  content,
  contentGzip: isGzip ? contentGzip : content,
  isGzip,
  mime: mimeType,
  sha256
});

/**
 * Update file extension group count
 */
const updateExtensionGroup = (extension: string): void => {
  const group = filesByExtension.find((fe) => fe.extension === extension);
  if (group) group.count += 1;
  else filesByExtension.push({ extension, count: 1 });
};

console.log('Collecting source files');
const files = getFiles();
if (files.size === 0) {
  console.error(`Directory ${cmdLine.sourcepath} is empty`);
  process.exit(1);
}

console.log();
console.log('Translation to header file');
const longestFilename = [...files.keys()].reduce((p, c) => Math.max(c.length, p), 0);

for (const [originalFilename, content] of files) {
  const mimeType = mimeLookup(originalFilename) || 'text/plain';
  summary.filecount++;

  // Normalize filename and generate data name
  const filename = originalFilename.replace(/\\/g, '/');
  const dataname = filename.replace(/[!&()+./@{}~-]/g, '_');

  // Extract and update file extension statistics
  let extension = path.extname(filename).toUpperCase();
  if (extension.startsWith('.')) extension = extension.slice(1);
  updateExtensionGroup(extension);

  // Generate SHA256 hash and compress content
  const sha256 = createHash('sha256').update(content).digest('hex');
  summary.size += content.length;
  const zipContent = gzipSync(content, { level: 9 });
  summary.gzipsize += zipContent.length;

  // Determine if gzip should be used
  const useGzip = shouldUseGzip(content.length, zipContent.length);

  // Create and add source entry
  sources.push(createSourceEntry(filename, dataname, content, zipContent, mimeType, sha256, useGzip));

  // Log compression result
  const padding = ' '.repeat(longestFilename - originalFilename.length);
  console.log(formatCompressionLog(originalFilename, padding, content.length, zipContent.length, useGzip));
}

console.log('');
filesByExtension.sort((left, right) => left.extension.localeCompare(right.extension));

// Size budget validation
if (cmdLine.maxSize !== undefined && summary.size > cmdLine.maxSize) {
  console.error(getSizeBudgetExceededError('size', cmdLine.maxSize, summary.size));
  process.exit(1);
}

if (cmdLine.maxGzipSize !== undefined && summary.gzipsize > cmdLine.maxGzipSize) {
  console.error(getSizeBudgetExceededError('gzipSize', cmdLine.maxGzipSize, summary.gzipsize));
  process.exit(1);
}

const cppFile = getCppCode(sources, filesByExtension);
mkdirSync(path.normalize(path.dirname(cmdLine.outputfile)), { recursive: true });
writeFileSync(cmdLine.outputfile, cppFile, { flush: true, encoding: 'utf8' });

console.log(
  `${summary.filecount} files, ${Math.round(summary.size / 1024)}kB original size, ${Math.round(summary.gzipsize / 1024)}kB gzip size`
);

console.log(`${cmdLine.outputfile} ${Math.round(cppFile.length / 1024)}kB size`);

// Show max_uri_handlers hint for applicable engines
if (cmdLine.engine === 'psychic' || cmdLine.engine === 'espidf')
  console.log('\n' + getMaxUriHandlersHint(cmdLine.engine, sources.length));

// Export helper functions for testing
export { calculateCompressionRatio, createSourceEntry, formatCompressionLog, shouldUseGzip, updateExtensionGroup };
