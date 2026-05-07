import type { ICopyFilesArguments } from './commandLine';
import { formatConfiguration } from './commandLine';
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
  maxUriHandlers: string;
};

export const cacheCtrl = (source: TransformedSource): string =>
  source.cacheTime ? `max-age=${source.cacheTime.value}` : 'no-cache';

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
  if (d.isPsychic) lines.push(`#define ${d.definePrefix}_MAX_URI_HANDLERS ${d.maxUriHandlers}`);
  lines.push('//');
  for (const s of d.sources) lines.push(`#define ${d.definePrefix}_FILE_${s.datanameUpperCase}`);
  lines.push('//');
  for (const g of d.filesByExtension) lines.push(`#define ${d.definePrefix}_${g.extension}_FILES ${g.count}`);
  return lines.join('\n');
};

export const genDataArrays = (d: TemplateData, progmem: boolean): string => {
  const mem = progmem ? ' PROGMEM' : '';
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

export const genEtagArrays = (d: TemplateData): string => {
  const items = d.sources.map((s) => `static const char etag_${s.dataname}[] = "${s.sha256}";`).join('\n');
  return sw(d.etag, {
    always: items,
    compiler: [`#ifdef ${d.definePrefix}_ENABLE_ETAG`, items, '#endif'].join('\n')
  });
};

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
  const templateData: TemplateData = {
    config: formatConfiguration(options),
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
    maxUriHandlers: (sources.length + 5).toString()
  };
  return postProcessCppCode(getGenerator(options.engine)(templateData));
};
