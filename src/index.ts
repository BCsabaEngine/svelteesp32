/* eslint-disable unicorn/prefer-string-replace-all */
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
 * Format a byte size for display: bytes for < 1024, kB otherwise
 */
const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  return `${Math.round(bytes / 1024)}kB`;
};

const formatSizePrecise = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}kB`;
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
const updateExtensionGroup = (filesByExtension: ExtensionGroups, extension: string): void => {
  const group = filesByExtension.find((fe) => fe.extension === extension);
  if (group) group.count += 1;
  else filesByExtension.push({ extension, count: 1 });
};

const sizeCellFor = (s: CppCodeSource): string => {
  const orig = formatSize(s.content.length);
  if (s.isGzip) return `${orig} → ${formatSize(s.contentGzip.length)}`;
  return orig;
};

/**
 * Format the route listing for dry-run output
 */
const formatDryRunRoutes = (
  sources: CppCodeSources,
  engine: 'psychic' | 'async' | 'espidf' | 'webserver',
  basePath: string,
  spa: boolean
): string => {
  if (sources.length === 0) return '  (no files)';

  const defaultSource = sources.find((s) => s.filename === 'index.html' || s.filename === 'index.htm');

  type RouteRow = { url: string; mime: string; sizeCell: string; tag: string };
  const rows: RouteRow[] = [];

  if (defaultSource)
    rows.push({
      url: basePath || '/',
      mime: defaultSource.mime,
      sizeCell: sizeCellFor(defaultSource),
      tag: '[default]'
    });

  for (const source of sources)
    rows.push({
      url: `${basePath}/${source.filename}`,
      mime: source.mime,
      sizeCell: sizeCellFor(source),
      tag: source.isGzip ? '' : '[no gzip]'
    });

  if (spa && defaultSource) {
    const spaUrl = engine === 'psychic' && basePath ? `${basePath}/*` : '(SPA catch-all)';
    rows.push({ url: spaUrl, mime: defaultSource.mime, sizeCell: '', tag: '[SPA catch-all → index.html]' });
  }

  const urlWidth = Math.max(...rows.map((r) => r.url.length));
  const mimeWidth = Math.max(...rows.map((r) => r.mime.length));
  const sizeWidth = Math.max(...rows.map((r) => r.sizeCell.length));

  return rows
    .map((r) => {
      const tagPart = r.tag ? `  ${r.tag}` : '';
      return `  GET ${r.url.padEnd(urlWidth)}  ${r.mime.padEnd(mimeWidth)}  ${r.sizeCell.padEnd(sizeWidth)}${tagPart}`.trimEnd();
    })
    .join('\n');
};

const formatAnalyzeTable = (
  sources: CppCodeSources,
  summary: ProcessingSummary,
  maxSize: number | undefined,
  maxGzipSize: number | undefined
): string => {
  type Row = { file: string; orig: string; gzip: string; tag: string };
  const rows: Row[] = sources.map((s) => ({
    file: s.filename,
    orig: formatSizePrecise(s.content.length),
    gzip: formatSizePrecise(s.isGzip ? s.contentGzip.length : s.content.length),
    tag: s.isGzip ? '' : '[no gzip]'
  }));

  const fileWidth = Math.max(4, ...rows.map((r) => r.file.length), 'Total'.length);
  const origWidth = Math.max(8, ...rows.map((r) => r.orig.length), formatSizePrecise(summary.size).length);
  const gzipWidth = Math.max(8, ...rows.map((r) => r.gzip.length), formatSizePrecise(summary.gzipsize).length);

  const separator = `${'─'.repeat(fileWidth)}  ${'─'.repeat(origWidth)}  ${'─'.repeat(gzipWidth)}`;
  const header = `${'File'.padEnd(fileWidth)}  ${'Original'.padEnd(origWidth)}  ${'Gzip'.padEnd(gzipWidth)}`;

  const dataRows = rows.map((r) => {
    const tagPart = r.tag ? `  ${r.tag}` : '';
    return `${r.file.padEnd(fileWidth)}  ${r.orig.padEnd(origWidth)}  ${r.gzip.padEnd(gzipWidth)}${tagPart}`.trimEnd();
  });

  const totalOrig = formatSizePrecise(summary.size);
  const totalGzip = formatSizePrecise(summary.gzipsize);
  const totalRow = `${'Total'.padEnd(fileWidth)}  ${totalOrig.padEnd(origWidth)}  ${totalGzip.padEnd(gzipWidth)}`;

  const lines = [header, separator, ...dataRows, separator, totalRow];

  if (maxSize !== undefined) {
    const pass = summary.size <= maxSize;
    const budgetRow = `${'Budget (maxsize)'.padEnd(fileWidth)}  ${formatSizePrecise(maxSize).padEnd(origWidth)}  ${'-'.padEnd(gzipWidth)}  ${pass ? '✓ PASS' : '✗ FAIL'}`;
    lines.push(budgetRow);
  }

  if (maxGzipSize !== undefined) {
    const pass = summary.gzipsize <= maxGzipSize;
    const budgetRow = `${'Budget (maxgzipsize)'.padEnd(fileWidth)}  ${'-'.padEnd(origWidth)}  ${formatSizePrecise(maxGzipSize).padEnd(gzipWidth)}  ${pass ? '✓ PASS' : '✗ FAIL'}`;
    lines.push(budgetRow);
  }

  return lines.join('\n');
};

/**
 * Main processing pipeline
 */
export function main(): void {
  const summary: ProcessingSummary = {
    filecount: 0,
    size: 0,
    gzipsize: 0
  };

  const sources: CppCodeSources = [];
  const filesByExtension: ExtensionGroups = [];

  console.log('Collecting source files');
  const files = getFiles();
  if (files.size === 0) {
    console.error(`Directory ${cmdLine.sourcepath} is empty`);
    process.exit(1);
  }

  if (cmdLine.spa && ![...files.keys()].some((f) => f === 'index.html' || f === 'index.htm'))
    console.warn(
      yellowLog(
        '[SvelteESP32] Warning: --spa is set but no index.html/index.htm found; catch-all will not be generated.'
      )
    );

  console.log();
  console.log('Translation to header file');
  const longestFilename = [...files.keys()].reduce((p, c) => Math.max(c.length, p), 0);

  for (const [originalFilename, fileData] of files) {
    const { content, hash: sha256 } = fileData;
    const rawMime = mimeLookup(originalFilename);
    if (!rawMime)
      console.log(
        yellowLog(
          ` [${originalFilename}] unknown MIME type for extension '${path.extname(originalFilename)}', using text/plain`
        )
      );
    const mimeType = rawMime || 'text/plain';
    summary.filecount++;

    // Normalize filename and generate data name
    const filename = originalFilename.replace(/\\/g, '/');
    let dataname = filename.replace(/\W/g, '_');
    if (/^\d/.test(dataname)) dataname = '_' + dataname;

    // Extract and update file extension statistics
    let extension = path.extname(filename).toUpperCase();
    if (extension.startsWith('.')) extension = extension.slice(1);
    updateExtensionGroup(filesByExtension, extension);

    // Compress content
    summary.size += content.length;
    const zipContent = gzipSync(content, { level: 9 });

    // Determine if gzip should be used
    const useGzip = shouldUseGzip(content.length, zipContent.length);
    summary.gzipsize += useGzip ? zipContent.length : content.length;

    // Create and add source entry
    sources.push(createSourceEntry(filename, dataname, content, zipContent, mimeType, sha256, useGzip));

    // Log compression result
    const padding = ' '.repeat(longestFilename - originalFilename.length);
    console.log(formatCompressionLog(originalFilename, padding, content.length, zipContent.length, useGzip));
  }

  console.log('');
  filesByExtension.sort((left, right) => left.extension.localeCompare(right.extension));

  // Analyze mode: show per-file size table and budget status, then exit
  if (cmdLine.analyze) {
    console.log(formatAnalyzeTable(sources, summary, cmdLine.maxSize, cmdLine.maxGzipSize));
    const overBudget =
      (cmdLine.maxSize !== undefined && summary.size > cmdLine.maxSize) ||
      (cmdLine.maxGzipSize !== undefined && summary.gzipsize > cmdLine.maxGzipSize);
    if (overBudget) process.exit(1);
    return;
  }

  // Size budget validation
  if (cmdLine.maxSize !== undefined && summary.size > cmdLine.maxSize) {
    console.error(getSizeBudgetExceededError('size', cmdLine.maxSize, summary.size));
    process.exit(1);
  }

  if (cmdLine.maxGzipSize !== undefined && summary.gzipsize > cmdLine.maxGzipSize) {
    console.error(getSizeBudgetExceededError('gzipSize', cmdLine.maxGzipSize, summary.gzipsize));
    process.exit(1);
  }

  // Dry run mode: show summary without writing
  if (cmdLine.dryRun) {
    const baseLabel = cmdLine.basePath || '(none)';
    const spaLabel = cmdLine.spa ? 'yes' : 'no';
    console.log(
      `[DRY RUN] Engine: ${cmdLine.engine} | ETag: ${cmdLine.etag} | Gzip: ${cmdLine.gzip} | Base: ${baseLabel} | SPA: ${spaLabel}`
    );
    console.log(
      `[DRY RUN] ${summary.filecount} files, ${formatSize(summary.size)} → ${formatSize(summary.gzipsize)} gzip | would write to ${cmdLine.outputfile}`
    );
    console.log('');
    console.log('[DRY RUN] Routes:');
    console.log(formatDryRunRoutes(sources, cmdLine.engine, cmdLine.basePath, cmdLine.spa ?? false));
    return;
  }

  const cppFile = getCppCode(sources, filesByExtension);
  mkdirSync(path.normalize(path.dirname(cmdLine.outputfile)), { recursive: true });
  writeFileSync(cmdLine.outputfile, cppFile, { flush: true, encoding: 'utf8' });

  console.log(
    `${summary.filecount} files, ${formatSize(summary.size)} original size, ${formatSize(summary.gzipsize)} gzip size`
  );

  console.log(`${cmdLine.outputfile} ${formatSize(cppFile.length)} size`);

  if (cmdLine.manifest) {
    const manifestPath = path.join(
      path.dirname(cmdLine.outputfile),
      path.basename(cmdLine.outputfile, path.extname(cmdLine.outputfile)) + '.manifest.json'
    );
    const manifest = {
      generated: new Date().toISOString(),
      engine: cmdLine.engine,
      etag: cmdLine.etag,
      gzip: cmdLine.gzip,
      filecount: summary.filecount,
      size: summary.size,
      gzipSize: summary.gzipsize,
      files: sources.map((s) => ({
        path: s.filename,
        mime: s.mime,
        size: s.content.length,
        gzipSize: s.isGzip ? s.contentGzip.length : s.content.length,
        isGzip: s.isGzip
      }))
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, undefined, 2), { encoding: 'utf8' });
    console.log(`${manifestPath} manifest written`);
  }

  // Show max_uri_handlers hint for applicable engines
  if (cmdLine.engine === 'psychic' || cmdLine.engine === 'espidf')
    console.log('\n' + getMaxUriHandlersHint(cmdLine.engine, sources.length, cmdLine.espmethod));
}

// Run main pipeline
main();

// Export helper functions for testing
export {
  calculateCompressionRatio,
  createSourceEntry,
  formatAnalyzeTable,
  formatCompressionLog,
  formatDryRunRoutes,
  formatSize,
  formatSizePrecise,
  shouldUseGzip,
  updateExtensionGroup
};
