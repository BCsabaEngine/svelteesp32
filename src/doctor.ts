import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import type { ICopyFilesArguments } from './commandLine';
import { parseArguments } from './commandLine';
import { cyanLog, greenLog, redLog, yellowLog } from './consoleColor';
import { getSourcepathNotFoundError } from './errorMessages';
import { type FileData, getFiles } from './file';
import { findIdentifierCollisions, formatSize, shouldUseGzip, toDataName } from './pipeline';

export type Finding = {
  severity: 'error' | 'warning';
  check: string;
  message: string;
  items?: string[];
  hint?: string;
};

type DoctorOptions = Pick<ICopyFilesArguments, 'engine' | 'basePath' | 'maxSize' | 'noIndexCheck'>;

// esp_http_server's CONFIG_HTTPD_MAX_URI_LEN default (a Kconfig value, so users may have raised it)
const MAX_URI_LENGTH = 512;
const DOMINANT_MIN_BYTES = 100 * 1024;
const DOMINANT_SHARE = 0.6;
const DOMINANT_BUDGET_SHARE = 0.5;
const URI_LIMITED_ENGINES: ReadonlySet<string> = new Set(['psychic', 'espidf']);
const LISTED_ITEMS = 8;

// Hosts scanned for inside JS bundles. JS is full of harmless URLs (w3.org/2000/svg), so only known asset CDNs count there.
const CDN_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'ajax.googleapis.com',
  'unpkg.com',
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'code.jquery.com',
  'stackpath.bootstrapcdn.com',
  'maxcdn.bootstrapcdn.com',
  'use.fontawesome.com',
  'kit.fontawesome.com'
];

const LEFTOVERS: { label: string; pattern: RegExp; glob: string }[] = [
  { label: 'source maps', pattern: /\.map$/i, glob: '**/*.map' },
  {
    label: 'source files',
    pattern: /\.(tsx?|scss|sass|less|svelte|vue)$/i,
    glob: '**/*.{ts,tsx,scss,sass,less,svelte,vue}'
  },
  { label: 'markdown files', pattern: /\.md$/i, glob: '**/*.md' },
  { label: 'license dumps', pattern: /\.license\.txt$/i, glob: '**/*.LICENSE.txt' },
  { label: 'bundle analyzer reports', pattern: /(^|\/)(stats|report)\.html$/i, glob: '**/stats.html' }
];

const isHtml = (filename: string): boolean => /\.html?$/i.test(filename);
const isCss = (filename: string): boolean => /\.css$/i.test(filename);
const isJs = (filename: string): boolean => /\.(m?js)$/i.test(filename);
const isDefaultFile = (filename: string): boolean => /(^|\/)index\.html?$/.test(filename);

const isExternal = (reference: string): boolean => /^(https?:)?\/\//i.test(reference);
const isIgnorable = (reference: string): boolean =>
  reference === '' || /^(#|data:|mailto:|tel:|javascript:|blob:)/i.test(reference);

const extractCssReferences = (text: string): string[] => [
  ...text.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi).map((m) => m[2]!.trim()),
  ...text.matchAll(/@import\s+(['"])([^'"]+)\1/gi).map((m) => m[2]!.trim())
];

const extractHtmlReferences = (text: string): string[] => {
  const references: string[] = [];
  for (const [, tag, attributes = ''] of text.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/gi)) {
    const tagName = tag!.toLowerCase();
    if (tagName === 'a' || tagName === 'area') continue;
    const relation = /\brel\s*=\s*["']?([\w\s-]+)/i.exec(attributes)?.[1]?.toLowerCase() ?? '';
    if (tagName === 'link' && /canonical|alternate|dns-prefetch/.test(relation)) continue;
    for (const [, name, double, single] of attributes.matchAll(
      /\b(src|href|poster|srcset|data-src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
    )) {
      const value = double ?? single ?? '';
      if (name!.toLowerCase() === 'srcset')
        for (const candidate of value.split(',')) references.push(candidate.trim().split(/\s+/, 1)[0] ?? '');
      else references.push(value.trim());
    }
  }
  return [...references, ...extractCssReferences(text)];
};

const isKnownCdn = (url: string): boolean => CDN_HOSTS.some((host) => url.includes('//' + host));

const stripQuery = (reference: string): string => reference.split(/[?#]/, 1)[0] ?? '';

/**
Resolve a reference found in `fromFile` to a served file name, or undefined when nothing is served there.
*/
const resolveReference = (
  reference: string,
  fromFile: string,
  basePath: string,
  files: ReadonlySet<string>
): string | undefined => {
  const target = stripQuery(reference);
  let served: string;
  if (target.startsWith('/')) {
    if (basePath && target !== basePath && !target.startsWith(basePath + '/')) return undefined;
    served = target.slice(basePath.length).replace(/^\//, '');
  } else {
    served = path.posix.join(path.posix.dirname(fromFile), target);
    if (served.startsWith('..')) return undefined;
  }

  if (served === '' || served.endsWith('/'))
    return [`${served}index.html`, `${served}index.htm`].find((candidate) => files.has(candidate)) ?? undefined;
  return files.has(served) ? served : undefined;
};

/**
If every unresolved absolute ref ends in a served file, the part before it is the prefix the build was made for.
*/
const inferBuiltPrefix = (unresolved: string[], files: ReadonlySet<string>): string | undefined => {
  const prefixes = new Set<string>();
  for (const reference of unresolved) {
    const target = stripQuery(reference);
    let best: string | undefined;
    for (const file of files) if (target.endsWith('/' + file) && (!best || file.length > best.length)) best = file;
    if (best === undefined) return undefined;
    prefixes.add(target.slice(0, target.length - best.length - 1));
  }
  return prefixes.size === 1 ? [...prefixes][0] : undefined;
};

const checkReferences = (files: Map<string, FileData>, basePath: string): Finding[] => {
  const findings: Finding[] = [];
  const names = new Set(files.keys());
  const unresolved: string[] = [];
  const unresolvedAbsolute: string[] = [];
  const cdn: string[] = [];
  const relativeIndexes: string[] = [];

  for (const [filename, { content }] of files) {
    const text = isHtml(filename) || isCss(filename) || isJs(filename) ? content.toString('utf8') : '';
    if (isJs(filename)) {
      for (const match of text.matchAll(/https?:\/\/[^\s"'`)]+/gi))
        if (isKnownCdn(match[0])) cdn.push(`${filename} → ${match[0]}`);
      continue;
    }
    if (!isHtml(filename) && !isCss(filename)) continue;

    const references = isHtml(filename) ? extractHtmlReferences(text) : extractCssReferences(text);
    const uniqueReferences = new Set(references);
    for (const reference of uniqueReferences) {
      if (isIgnorable(reference)) continue;
      if (isExternal(reference)) {
        cdn.push(`${filename} → ${reference}`);
        continue;
      }
      if (resolveReference(reference, filename, basePath, names) !== undefined) {
        if (basePath && isDefaultFile(filename) && !reference.startsWith('/'))
          relativeIndexes.push(`${filename} → ${reference}`);
        continue;
      }
      unresolved.push(`${filename} → ${reference}`);
      if (reference.startsWith('/')) unresolvedAbsolute.push(reference);
    }
  }

  if (unresolved.length > 0) {
    const built =
      unresolvedAbsolute.length === unresolved.length ? inferBuiltPrefix(unresolvedAbsolute, names) : undefined;
    const served = basePath || '/';
    const hint =
      built === undefined
        ? 'Check that every referenced file is in the source directory and not matched by --exclude.'
        : `Assets are referenced under '${built || '/'}' but served under '${served}'. Set Vite's base to '${basePath || ''}/' or pass --basepath=${built || '(none)'} so they agree.`;
    findings.push({
      severity: 'error',
      check: 'basepath',
      message: `${unresolved.length} reference(s) in HTML/CSS do not resolve to a served file (basepath: ${basePath || '(none)'}) — the page would load blank or unstyled`,
      items: unresolved,
      hint
    });
  }

  if (relativeIndexes.length > 0)
    findings.push({
      severity: 'warning',
      check: 'basepath',
      message: `Relative asset references with --basepath=${basePath}: they resolve against '${basePath}/' but may resolve against '/' when the page is opened as '${basePath}' without a trailing slash`,
      items: relativeIndexes,
      hint: "Prefer Vite's base set to the base path so references are root-absolute."
    });

  if (cdn.length > 0)
    findings.push({
      severity: 'warning',
      check: 'cdn',
      message: `${cdn.length} external reference(s) — they will not load when the device runs as an offline access point`,
      items: cdn,
      hint: 'Bundle these assets locally (npm package or self-hosted font) so the UI works without internet.'
    });

  return findings;
};

const checkLeftovers = (files: Map<string, FileData>): Finding[] => {
  const findings: Finding[] = [];
  for (const { label, pattern, glob } of LEFTOVERS) {
    const matched = files
      .keys()
      .filter((filename) => pattern.test(filename))
      .toArray();
    if (matched.length > 0)
      findings.push({
        severity: 'warning',
        check: 'leftovers',
        message: `${matched.length} ${label} would be embedded in firmware`,
        items: matched,
        hint: `Add --exclude="${glob}" (or "exclude" in the RC file).`
      });
  }
  return findings;
};

const checkDominantFile = (files: Map<string, FileData>, maxSize: number | undefined): Finding[] => {
  const findings: Finding[] = [];
  const served = new Map<string, number>();
  let total = 0;
  for (const [filename, { content }] of files) {
    const zipped = gzipSync(content, { level: 9 }).length;
    const bytes = shouldUseGzip(content.length, zipped) ? zipped : content.length;
    served.set(filename, bytes);
    total += bytes;
  }

  for (const [filename, bytes] of served) {
    const size = files.get(filename)!.content.length;
    if (bytes >= DOMINANT_MIN_BYTES && bytes > total * DOMINANT_SHARE)
      findings.push({
        severity: 'warning',
        check: 'size',
        message: `${filename} is ${Math.round((bytes / total) * 100)}% of the embedded payload (${formatSize(bytes)} of ${formatSize(total)})`,
        hint: 'Consider code-splitting, dropping a heavy dependency, or optimising the asset.'
      });
    if (maxSize !== undefined && size > maxSize * DOMINANT_BUDGET_SHARE)
      findings.push({
        severity: 'warning',
        check: 'size',
        message: `${filename} (${formatSize(size)}) uses more than half of the --maxsize budget (${formatSize(maxSize)})`
      });
  }
  return findings;
};

const checkUriLength = (files: Map<string, FileData>, options: DoctorOptions): Finding[] => {
  if (!URI_LIMITED_ENGINES.has(options.engine)) return [];
  const tooLong = files
    .keys()
    .filter((filename) => encodeURI(`${options.basePath}/${filename}`).length > MAX_URI_LENGTH)
    .toArray();
  return tooLong.length === 0
    ? []
    : [
        {
          severity: 'error',
          check: 'uri',
          message: `${tooLong.length} route(s) exceed ${MAX_URI_LENGTH} characters, the default CONFIG_HTTPD_MAX_URI_LEN of esp_http_server`,
          items: tooLong,
          hint: 'Shorten the file paths (Vite output.assetFileNames) or raise CONFIG_HTTPD_MAX_URI_LEN in the firmware.'
        }
      ];
};

const checkCollisions = (files: Map<string, FileData>): Finding[] => {
  const datanames = new Map<string, string>();
  for (const filename of files.keys()) datanames.set(filename, toDataName(filename));
  const collisions = findIdentifierCollisions(datanames);
  return collisions.length === 0
    ? []
    : [
        {
          severity: 'error',
          check: 'collision',
          message: `${collisions.length} group(s) of files map to the same C++ identifier — the generated header would not compile`,
          items: collisions.map((c) => `${c.files.join(', ')} → ${c.identifier}`),
          hint: 'Rename or exclude one file of each group.'
        }
      ];
};

const checkIndex = (files: Map<string, FileData>): Finding[] =>
  files.keys().some((filename) => isDefaultFile(filename))
    ? []
    : [
        {
          severity: 'error',
          check: 'index',
          message: 'No index.html or index.htm found — there is no default route',
          hint: 'Point --sourcepath at the build output, or pass --noindexcheck if that is intended.'
        }
      ];

/**
Pure static analysis of a build directory. Never touches the file system.
*/
export const runChecks = (files: Map<string, FileData>, options: DoctorOptions): Finding[] => {
  return files.size === 0
    ? [{ severity: 'error', check: 'empty', message: 'The source directory contains no files' }]
    : [
        ...(options.noIndexCheck ? [] : checkIndex(files)),
        ...checkCollisions(files),
        ...checkUriLength(files, options),
        ...checkReferences(files, options.basePath),
        ...checkLeftovers(files),
        ...checkDominantFile(files, options.maxSize)
      ];
};

export const formatFindings = (findings: Finding[], fileCount: number): string => {
  const lines: string[] = [];
  for (const finding of findings) {
    const paint = finding.severity === 'error' ? redLog : yellowLog;
    lines.push(
      `${paint(finding.severity === 'error' ? '✖ error  ' : '⚠ warning')} ${cyanLog(`[${finding.check}]`)} ${finding.message}`
    );
    const listed = (finding.items ?? []).slice(0, LISTED_ITEMS);
    for (const item of listed) lines.push(`    ${item}`);
    if ((finding.items?.length ?? 0) > LISTED_ITEMS)
      lines.push(`    … and ${finding.items!.length - LISTED_ITEMS} more`);
    if (finding.hint) lines.push(`    ↳ ${finding.hint}`);
    lines.push('');
  }

  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.length - errors;
  lines.push(
    findings.length === 0
      ? greenLog(`✔ ${fileCount} file(s) checked, no problems found`)
      : `${fileCount} file(s) checked: ${errors} error(s), ${warnings} warning(s)`
  );
  return lines.join('\n');
};

export function main(): void {
  const isStrict = process.argv.includes('--strict');
  process.argv = process.argv.filter((argument) => argument !== '--strict');
  const options = parseArguments();

  if (!existsSync(options.sourcepath)) {
    console.error(getSourcepathNotFoundError(options.sourcepath, 'not_found'));
    process.exit(1);
  }
  if (!statSync(options.sourcepath).isDirectory()) {
    console.error(getSourcepathNotFoundError(options.sourcepath, 'not_directory'));
    process.exit(1);
  }

  console.log(`[SvelteESP32] Doctor: checking ${options.sourcepath} for the ${options.engine} engine`);

  try {
    // The index check is a finding here, not an exception
    const files = getFiles({ ...options, noIndexCheck: true });
    const findings = runChecks(files, options);
    console.log(formatFindings(findings, files.size));
    if (findings.some((f) => f.severity === 'error') || (isStrict && findings.length > 0)) process.exit(1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (require.main === module) main();
