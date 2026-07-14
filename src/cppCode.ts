import type { ICopyFilesArguments } from './commandLine';
import { formatConfig } from './commandLine';
import { genAsyncCpp } from './cppCodeAsync';
import { genEspIdfCpp } from './cppCodeEspIdf';
import { genPsychicCpp } from './cppCodePsychic';
import { genWebserverCpp } from './cppCodeWebserver';

export type CppCodeSource = {
  filename: string;
  dataname: string;
  datanameUpperCase: string;
  mime: string;
  content: Buffer;
  contentGzip: Buffer;
  isGzip: boolean;
  sha256: string;
};
export type CppCodeSources = CppCodeSource[];

export type ExtensionGroup = {
  extension: string;
  count: number;
};
export type ExtensionGroups = ExtensionGroup[];

export const sw = (value: string, cases: Partial<Record<'always' | 'never' | 'compiler', string>>): string =>
  cases[value as 'always' | 'never' | 'compiler'] ?? '';

const bufferToByteString = (buffer: Buffer): string => {
  if (buffer.length === 0) return '';
  let result = buffer[0]!.toString(10);
  for (let index = 1; index < buffer.length; index++) result += ',' + buffer[index]!.toString(10);
  return result;
};

const transformSourceToTemplateData = (s: CppCodeSource, etag: string, effectiveCacheTime: number) => ({
  ...s,
  length: s.content.length,
  bytes: bufferToByteString(s.content),
  lengthGzip: s.contentGzip.length,
  bytesGzip: bufferToByteString(s.contentGzip),
  isDefault: s.filename === 'index.html' || s.filename === 'index.htm',
  gzipSizeForManifest: s.isGzip ? s.contentGzip.length : 0,
  etagForManifest: etag === 'never' ? 'NULL' : `etag_${s.dataname}`,
  cacheTime: effectiveCacheTime ? { value: effectiveCacheTime } : undefined
});

export type TransformedSource = ReturnType<typeof transformSourceToTemplateData>;

export type TemplateData = {
  config: string;
  now: string;
  fileCount: string;
  fileSize: string;
  fileGzipSize: string;
  sources: TransformedSource[];
  filesByExtension: ExtensionGroups;
  etag: string;
  gzip: string;
  created: boolean | undefined;
  version: string | undefined;
  methodName: string;
  definePrefix: string;
  basePath: string;
  spa: boolean;
  spaSource: TransformedSource | undefined;
  isPsychic: boolean;
  uriHandlers: string;
  maxUriHandlers: string;
};

export const cacheCtrl = (source: TransformedSource): string =>
  source.cacheTime ? `max-age=${source.cacheTime.value}` : 'no-cache';

// Emit `body` only when ETag is on: verbatim in 'always' mode, fenced behind the ENABLE_ETAG #ifdef
// in 'compiler' mode, and not at all in 'never' mode. Top-level declarations (the etag arrays) sit at
// column 0; everything inside a handler body is indented two spaces.
export const gateEtag = (d: TemplateData, body: string, indent = '  '): string =>
  sw(d.etag, {
    always: body,
    compiler: [`${indent}#ifdef ${d.definePrefix}_ENABLE_ETAG`, body, `${indent}#endif`].join('\n')
  });

// Cache-Control is independent of the ETag switch: --cachetime must survive --etag=never, and an
// ifdef'd-out ETag must not take caching down with it. Only the validator line is gated.
// Emitting this from one place is the point - four engine copies drifting apart is how the 304
// lost its headers.
export const genCacheHeaders = (
  d: TemplateData,
  source: TransformedSource,
  emit: (header: string, value: string) => string
): string =>
  [emit('Cache-Control', `"${cacheCtrl(source)}"`), gateEtag(d, emit('ETag', `etag_${source.dataname}`))]
    .filter(Boolean)
    .join('\n');

const ETAG_HEX_LENGTH = 16;

// RFC 9110: opaque-tag = DQUOTE *etagc DQUOTE — the quotes are part of the value.
// The full hash stays in the JSON manifest; only the emitted tag is truncated.
export const etagLiteral = (sha256: string): string => String.raw`"\"${sha256.slice(0, ETAG_HEX_LENGTH)}\""`;

export const computeRouteCount = (
  sources: CppCodeSources,
  engine: ICopyFilesArguments['engine'],
  basePath: string,
  isSpa: boolean
): number => {
  const numberDefault = sources.filter((s) => s.filename === 'index.html' || s.filename === 'index.htm').length;
  const hasDefault = numberDefault > 0;
  if (engine === 'psychic') {
    // psychic aliases the default route onto the existing handler when basePath is empty, so no extra handler is registered.
    // File routes are HTTP_ANY (one endpoint serves GET and HEAD), but the SPA catch-all is registered once per method.
    const defaultExtra = basePath ? numberDefault : 0;
    const spaExtra = isSpa && hasDefault && basePath ? 2 : 0;
    return sources.length + defaultExtra + spaExtra;
  }
  // espidf/async/webserver always register a separate default-route handler and a separate SPA/404 handler
  const spaExtra = isSpa && hasDefault ? 1 : 0;
  return sources.length + numberDefault + spaExtra;
};

export const genCommonHeader = (d: TemplateData): string => {
  const lines: string[] = [];
  const etagWarn = sw(d.etag, {
    always: [
      `#ifdef ${d.definePrefix}_ENABLE_ETAG`,
      `#warning ${d.definePrefix}_ENABLE_ETAG has no effect because it is permanently switched ON`,
      '#endif'
    ].join('\n'),
    never: [
      `#ifdef ${d.definePrefix}_ENABLE_ETAG`,
      `#warning ${d.definePrefix}_ENABLE_ETAG has no effect because it is permanently switched OFF`,
      '#endif'
    ].join('\n')
  });
  if (etagWarn) lines.push(etagWarn);
  const gzipWarn = sw(d.gzip, {
    always: [
      `#ifdef ${d.definePrefix}_ENABLE_GZIP`,
      `#warning ${d.definePrefix}_ENABLE_GZIP has no effect because it is permanently switched ON`,
      '#endif'
    ].join('\n'),
    never: [
      `#ifdef ${d.definePrefix}_ENABLE_GZIP`,
      `#warning ${d.definePrefix}_ENABLE_GZIP has no effect because it is permanently switched OFF`,
      '#endif'
    ].join('\n')
  });
  if (gzipWarn) lines.push(gzipWarn);
  lines.push('//');
  if (d.version) lines.push(`#define ${d.definePrefix}_VERSION "${d.version}"`);
  lines.push(
    `#define ${d.definePrefix}_COUNT ${d.fileCount}`,
    `#define ${d.definePrefix}_SIZE ${d.fileSize}`,
    `#define ${d.definePrefix}_SIZE_GZIP ${d.fileGzipSize}`
  );
  if (d.isPsychic)
    lines.push(
      `// Informational: PsychicHttp 3.x sizes the esp-idf handler table itself in start(), so`,
      `// assigning these to server.config.max_uri_handlers has no effect.`,
      `#define ${d.definePrefix}_URI_HANDLERS ${d.uriHandlers}`,
      `#define ${d.definePrefix}_MAX_URI_HANDLERS ${d.maxUriHandlers}`
    );
  lines.push('//');
  for (const s of d.sources) lines.push(`#define ${d.definePrefix}_FILE_${s.datanameUpperCase}`);
  lines.push('//');
  for (const g of d.filesByExtension) lines.push(`#define ${d.definePrefix}_${g.extension}_FILES ${g.count}`);
  return lines.join('\n');
};

export const genDataArrays = (d: TemplateData, isProgmem: boolean): string => {
  const mem = isProgmem ? ' PROGMEM' : '';
  const gzipArrays = d.sources
    .map((s) => `static const uint8_t datagzip_${s.dataname}[${s.lengthGzip}]${mem} = { ${s.bytesGzip} };`)
    .join('\n');
  const plainArrays = d.sources
    .map((s) => `static const uint8_t data_${s.dataname}[${s.length}]${mem} = { ${s.bytes} };`)
    .join('\n');
  return sw(d.gzip, {
    always: gzipArrays,
    never: plainArrays,
    compiler: [`#ifdef ${d.definePrefix}_ENABLE_GZIP`, gzipArrays, '#else', plainArrays, '#endif'].join('\n')
  });
};

export const genEtagArrays = (d: TemplateData): string =>
  gateEtag(
    d,
    d.sources.map((s) => `static const char etag_${s.dataname}[] = ${etagLiteral(s.sha256)};`).join('\n'),
    ''
  );

export const genManifest = (d: TemplateData): string =>
  [
    `// File manifest struct`,
    `struct ${d.definePrefix}_FileInfo {`,
    `  const char* path;`,
    `  uint32_t size;`,
    `  uint32_t gzipSize;`,
    `  const char* etag;`,
    `  const char* contentType;`,
    `};`,
    `// File manifest array`,
    `static const ${d.definePrefix}_FileInfo ${d.definePrefix}_FILES[] = {`,
    ...d.sources.map(
      (s) =>
        `  { "${d.basePath}/${s.filename}", ${s.length}, ${s.gzipSizeForManifest}, ${s.etagForManifest}, "${s.mime}" },`
    ),
    `};`,
    `static const size_t ${d.definePrefix}_FILE_COUNT = sizeof(${d.definePrefix}_FILES) / sizeof(${d.definePrefix}_FILES[0]);`
  ].join('\n');

export const genHook = (d: TemplateData): string =>
  `// File served hook - override with your own implementation\nextern "C" void __attribute__((weak)) ${d.definePrefix}_onFileServed(const char* path, int statusCode) {}`;

const getGenerator = (engine: ICopyFilesArguments['engine']): ((d: TemplateData) => string) => {
  switch (engine) {
    case 'psychic':
      return genPsychicCpp;
    case 'async':
      return genAsyncCpp;
    case 'espidf':
      return genEspIdfCpp;
    case 'webserver':
      return genWebserverCpp;
  }
};

const postProcessCppCode = (code: string): string =>
  code
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => (line === '//' ? '' : line))
    .join('\n')
    .replaceAll(/\n{2,}/g, '\n');

export const getCppCode = (
  sources: CppCodeSources,
  filesByExtension: ExtensionGroups,
  options: ICopyFilesArguments
): string => {
  const transformedSources = sources.map((s) => {
    const effectiveCacheTime =
      s.mime === 'text/html'
        ? (options.cachetimeHtml ?? options.cachetime)
        : (options.cachetimeAssets ?? options.cachetime);
    return transformSourceToTemplateData(s, options.etag, effectiveCacheTime);
  });
  const spaSource = options.spa ? transformedSources.find((s) => s.isDefault) : undefined;
  const routeCount = computeRouteCount(sources, options.engine, options.basePath, !!options.spa);
  const templateData: TemplateData = {
    config: formatConfig(options),
    now: (() => {
      const d = new Date();
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
    })(),
    fileCount: sources.length.toString(),
    fileSize: sources.reduce((previous, current) => previous + current.content.length, 0).toString(),
    fileGzipSize: sources.reduce((previous, current) => previous + current.contentGzip.length, 0).toString(),
    sources: transformedSources,
    filesByExtension,
    etag: options.etag,
    gzip: options.gzip,
    created: options.created,
    version: options.version,
    methodName: options.espmethod,
    definePrefix: options.define,
    basePath: options.basePath,
    spa: !!options.spa,
    spaSource,
    isPsychic: options.engine === 'psychic',
    uriHandlers: routeCount.toString(),
    maxUriHandlers: (routeCount + 5).toString()
  };
  return postProcessCppCode(getGenerator(options.engine)(templateData));
};
