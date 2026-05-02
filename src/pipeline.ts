/* eslint-disable unicorn/prefer-string-replace-all */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { lookup as mimeLookup } from 'mime-types';

import type { ICopyFilesArguments } from './commandLine';
import { greenLog, redLog, yellowLog } from './consoleColor';
import { type CppCodeSource, type CppCodeSources, type ExtensionGroups, getCppCode } from './cppCode';
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

const shouldUseGzip = (originalSize: number, compressedSize: number): boolean =>
  originalSize > GZIP_MIN_SIZE && compressedSize < originalSize * GZIP_MIN_REDUCTION_RATIO;

const calculateCompressionRatio = (originalSize: number, compressedSize: number): number =>
  Math.round((compressedSize / originalSize) * 100);

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

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  return `${Math.round(bytes / 1024)}kB`;
};

const formatSizePrecise = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}kB`;
};

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

export type PreviousManifestFile = { path: string; size: number; sha256?: string };

export class OverBudgetError extends Error {
  override readonly name = 'OverBudgetError';

  constructor() {
    super('Over budget in analyze mode');
  }
}

const formatChangeSummary = (sources: CppCodeSources, previousFiles: PreviousManifestFile[]): string => {
  const previousMap = new Map(previousFiles.map((f) => [f.path, f]));
  const currentMap = new Map(sources.map((s) => [s.filename, s]));

  const added: CppCodeSource[] = [];
  const removed: PreviousManifestFile[] = [];
  const modified: Array<{ source: CppCodeSource; previousSize: number }> = [];

  for (const source of sources) {
    const previous = previousMap.get(source.filename);
    if (!previous) added.push(source);
    else if (previous.sha256 ? previous.sha256 !== source.sha256 : previous.size !== source.content.length)
      modified.push({ source, previousSize: previous.size });
  }

  for (const previous of previousFiles) if (!currentMap.has(previous.path)) removed.push(previous);

  if (added.length === 0 && removed.length === 0 && modified.length === 0) return 'Change summary: (no changes)';

  const allNames = [
    ...added.map((s) => s.filename),
    ...removed.map((f) => f.path),
    ...modified.map((m) => m.source.filename)
  ];
  const nameWidth = Math.max(...allNames.map((n) => n.length));

  const lines: string[] = ['Change summary:'];

  for (const source of added)
    lines.push(greenLog(`  + ${source.filename.padEnd(nameWidth)}  ${formatSizePrecise(source.content.length)}`));

  for (const { source, previousSize } of modified)
    lines.push(
      yellowLog(
        `  ~ ${source.filename.padEnd(nameWidth)}  ${formatSizePrecise(previousSize)} → ${formatSizePrecise(source.content.length)}`
      )
    );

  for (const previous of removed) lines.push(redLog(`  - ${previous.path}`));

  return lines.join('\n');
};

/**
 * Core processing pipeline. Throws on error; never calls process.exit.
 */
export function runPipeline(options: ICopyFilesArguments): void {
  const summary: ProcessingSummary = {
    filecount: 0,
    size: 0,
    gzipsize: 0
  };

  const sources: CppCodeSources = [];
  const filesByExtension: ExtensionGroups = [];

  console.log('Collecting source files');
  const files = getFiles(options);
  if (files.size === 0) throw new Error(`Directory ${options.sourcepath} is empty`);

  if (options.spa && ![...files.keys()].some((f) => f === 'index.html' || f === 'index.htm'))
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
  if (options.analyze) {
    console.log(formatAnalyzeTable(sources, summary, options.maxSize, options.maxGzipSize));
    const overBudget =
      (options.maxSize !== undefined && summary.size > options.maxSize) ||
      (options.maxGzipSize !== undefined && summary.gzipsize > options.maxGzipSize);
    if (overBudget) throw new OverBudgetError();
    return;
  }

  // Size budget validation
  if (options.maxSize !== undefined && summary.size > options.maxSize)
    throw new Error(getSizeBudgetExceededError('size', options.maxSize, summary.size));

  if (options.maxGzipSize !== undefined && summary.gzipsize > options.maxGzipSize)
    throw new Error(getSizeBudgetExceededError('gzipSize', options.maxGzipSize, summary.gzipsize));

  // Dry run mode: show summary without writing
  if (options.dryRun) {
    const baseLabel = options.basePath || '(none)';
    const spaLabel = options.spa ? 'yes' : 'no';
    console.log(
      `[DRY RUN] Engine: ${options.engine} | ETag: ${options.etag} | Gzip: ${options.gzip} | Base: ${baseLabel} | SPA: ${spaLabel}`
    );
    console.log(
      `[DRY RUN] ${summary.filecount} files, ${formatSize(summary.size)} → ${formatSize(summary.gzipsize)} gzip | would write to ${options.outputfile}`
    );
    console.log('');
    console.log('[DRY RUN] Routes:');
    console.log(formatDryRunRoutes(sources, options.engine, options.basePath, options.spa ?? false));
    return;
  }

  const cppFile = getCppCode(sources, filesByExtension);
  mkdirSync(path.normalize(path.dirname(options.outputfile)), { recursive: true });
  writeFileSync(options.outputfile, cppFile, { flush: true, encoding: 'utf8' });

  console.log(
    `${summary.filecount} files, ${formatSize(summary.size)} original size, ${formatSize(summary.gzipsize)} gzip size`
  );

  console.log(`${options.outputfile} ${formatSize(cppFile.length)} size`);

  if (options.manifest) {
    const manifestPath = path.join(
      path.dirname(options.outputfile),
      path.basename(options.outputfile, path.extname(options.outputfile)) + '.manifest.json'
    );

    let previousManifest: { files: PreviousManifestFile[] } | undefined;
    if (existsSync(manifestPath))
      try {
        previousManifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { files: PreviousManifestFile[] };
      } catch {
        // ignore corrupt manifest
      }

    const manifest = {
      generated: new Date().toISOString(),
      engine: options.engine,
      etag: options.etag,
      gzip: options.gzip,
      filecount: summary.filecount,
      size: summary.size,
      gzipSize: summary.gzipsize,
      files: sources.map((s) => ({
        path: s.filename,
        mime: s.mime,
        size: s.content.length,
        gzipSize: s.isGzip ? s.contentGzip.length : s.content.length,
        isGzip: s.isGzip,
        sha256: s.sha256
      }))
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, undefined, 2), { encoding: 'utf8' });
    console.log(`${manifestPath} manifest written`);

    if (previousManifest) console.log(formatChangeSummary(sources, previousManifest.files));
  }

  // Show max_uri_handlers hint for applicable engines
  if (options.engine === 'psychic' || options.engine === 'espidf')
    console.log('\n' + getMaxUriHandlersHint(options.engine, sources.length, options.espmethod));
}

export {
  calculateCompressionRatio,
  createSourceEntry,
  formatAnalyzeTable,
  formatChangeSummary,
  formatCompressionLog,
  formatDryRunRoutes,
  formatSize,
  formatSizePrecise,
  shouldUseGzip,
  updateExtensionGroup
};
