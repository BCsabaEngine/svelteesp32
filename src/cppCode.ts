import type { ICopyFilesArguments } from './commandLine';
import { formatConfiguration } from './commandLine';
import { genEspIdfCpp } from './cppCodeEspIdf';

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

const sw = (value: string, cases: Partial<Record<'always' | 'never' | 'compiler', string>>): string =>
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

const cacheCtrl = (source: TransformedSource): string =>
  source.cacheTime ? `max-age=${source.cacheTime.value}` : 'no-cache';

const genCommonHeader = (d: TemplateData): string => {
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

const genDataArrays = (d: TemplateData, progmem: boolean): string => {
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

const genEtagArrays = (d: TemplateData): string => {
  const items = d.sources.map((s) => `static const char etag_${s.dataname}[] = "${s.sha256}";`).join('\n');
  return sw(d.etag, {
    always: items,
    compiler: [`#ifdef ${d.definePrefix}_ENABLE_ETAG`, items, '#endif'].join('\n')
  });
};

const genManifest = (d: TemplateData): string =>
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

const genHook = (d: TemplateData): string =>
  `// File served hook - override with your own implementation\nextern "C" void __attribute__((weak)) ${d.definePrefix}_onFileServed(const char* path, int statusCode) {}`;

// Psychic engine

const genPsychicHandlerBody = (d: TemplateData, source: TransformedSource, path: string): string => {
  const lines: string[] = [];
  const etagCheck = sw(d.etag, {
    always: [
      `    if (request->hasHeader("If-None-Match") && request->header("If-None-Match").equals(etag_${source.dataname})) {`,
      `      response->setCode(304);`,
      `      ${d.definePrefix}_onFileServed("${path}", 304);`,
      `      return response->send();`,
      `    }`
    ].join('\n'),
    compiler: [
      `  #ifdef ${d.definePrefix}_ENABLE_ETAG`,
      `    if (request->hasHeader("If-None-Match") && request->header("If-None-Match").equals(etag_${source.dataname})) {`,
      `      response->setCode(304);`,
      `      ${d.definePrefix}_onFileServed("${path}", 304);`,
      `      return response->send();`,
      `    }`,
      `  #endif`
    ].join('\n')
  });
  if (etagCheck) lines.push(etagCheck);
  lines.push(`    response->setContentType("${source.mime}");`);
  const gzipEncoding = sw(d.gzip, {
    always: source.isGzip ? `    response->addHeader("Content-Encoding", "gzip");` : '',
    compiler: source.isGzip
      ? [
          `  #ifdef ${d.definePrefix}_ENABLE_GZIP`,
          `    response->addHeader("Content-Encoding", "gzip");`,
          `  #endif`
        ].join('\n')
      : ''
  });
  if (gzipEncoding) lines.push(gzipEncoding);
  const cacheHeaders = sw(d.etag, {
    always: [
      `    response->addHeader("Cache-Control", "${cacheCtrl(source)}");`,
      `    response->addHeader("ETag", etag_${source.dataname});`
    ].join('\n'),
    compiler: [
      `  #ifdef ${d.definePrefix}_ENABLE_ETAG`,
      `    response->addHeader("Cache-Control", "${cacheCtrl(source)}");`,
      `    response->addHeader("ETag", etag_${source.dataname});`,
      `  #endif`
    ].join('\n')
  });
  if (cacheHeaders) lines.push(cacheHeaders);
  lines.push(
    sw(d.gzip, {
      always: `    response->setContent(datagzip_${source.dataname}, ${source.lengthGzip});`,
      never: `    response->setContent(data_${source.dataname}, ${source.length});`,
      compiler: [
        `  #ifdef ${d.definePrefix}_ENABLE_GZIP`,
        `    response->setContent(datagzip_${source.dataname}, ${source.lengthGzip});`,
        `  #else`,
        `    response->setContent(data_${source.dataname}, ${source.length});`,
        `  #endif`
      ].join('\n')
    }),
    `    ${d.definePrefix}_onFileServed("${path}", 200);`,
    `    return response->send();`
  );
  return lines.join('\n');
};

const genPsychicCpp = (d: TemplateData): string => {
  const lines: string[] = [
    `//engine:   PsychicHttpServer`,
    `//config:   ${d.config}`,
    ...(d.created ? [`//created:  ${d.now}`] : []),
    '//',
    genCommonHeader(d),
    '//',
    '#include <Arduino.h>',
    '#include <PsychicHttp.h>',
    '#include <PsychicHttpsServer.h>',
    '//',
    genDataArrays(d, false),
    '//',
    genEtagArrays(d),
    '//',
    genManifest(d),
    '//',
    genHook(d),
    '//',
    '// Http Handlers',
    `void ${d.methodName}(PsychicHttpServer * server) {`
  ];
  for (const source of d.sources) {
    const path = `${d.basePath}/${source.filename}`;
    const serverPrefix = source.isDefault && !d.basePath ? 'server->defaultEndpoint = ' : '';
    lines.push(
      '//',
      `// ${source.filename}`,
      `  ${serverPrefix}server->on("${path}", HTTP_GET, [](PsychicRequest * request, PsychicResponse * response) {`,
      genPsychicHandlerBody(d, source, path),
      `  });`
    );
    if (source.isDefault && d.basePath)
      lines.push(
        '//',
        `// ${source.filename} (base path route)`,
        `  server->on("${d.basePath}", HTTP_GET, [](PsychicRequest * request, PsychicResponse * response) {`,
        genPsychicHandlerBody(d, source, d.basePath),
        `  });`
      );
  }
  if (d.spa && d.spaSource && d.basePath) {
    const source = d.spaSource;
    const path = `${d.basePath}/${source.filename}`;
    lines.push(
      '//',
      `// SPA catch-all: unmatched routes serve ${source.filename}`,
      `  server->on("${d.basePath}/*", HTTP_GET, [](PsychicRequest * request, PsychicResponse * response) {`,
      genPsychicHandlerBody(d, source, path),
      `  });`
    );
  }
  lines.push('}');
  return lines.join('\n');
};

// Async engine

const genAsyncHandlerBody = (d: TemplateData, source: TransformedSource, path: string): string => {
  const lines: string[] = [];
  const etagCheck = sw(d.etag, {
    always: [
      `    const AsyncWebHeader* h = request->getHeader("If-None-Match");`,
      `    if (h && h->value().equals(etag_${source.dataname})) {`,
      `      ${d.definePrefix}_onFileServed("${path}", 304);`,
      `      request->send(304);`,
      `      return;`,
      `    }`
    ].join('\n'),
    compiler: [
      `  #ifdef ${d.definePrefix}_ENABLE_ETAG`,
      `    const AsyncWebHeader* h = request->getHeader("If-None-Match");`,
      `    if (h && h->value().equals(etag_${source.dataname})) {`,
      `      ${d.definePrefix}_onFileServed("${path}", 304);`,
      `      request->send(304);`,
      `      return;`,
      `    }`,
      `  #endif`
    ].join('\n')
  });
  if (etagCheck) lines.push(etagCheck);
  lines.push(
    sw(d.gzip, {
      always: [
        `    AsyncWebServerResponse *response = request->beginResponse(200, "${source.mime}", datagzip_${source.dataname}, ${source.lengthGzip});`,
        ...(source.isGzip ? [`    response->addHeader("Content-Encoding", "gzip");`] : [])
      ].join('\n'),
      never: `    AsyncWebServerResponse *response = request->beginResponse(200, "${source.mime}", data_${source.dataname}, ${source.length});`,
      compiler: [
        `  #ifdef ${d.definePrefix}_ENABLE_GZIP`,
        `    AsyncWebServerResponse *response = request->beginResponse(200, "${source.mime}", datagzip_${source.dataname}, ${source.lengthGzip});`,
        ...(source.isGzip ? [`    response->addHeader("Content-Encoding", "gzip");`] : []),
        `  #else`,
        `    AsyncWebServerResponse *response = request->beginResponse(200, "${source.mime}", data_${source.dataname}, ${source.length});`,
        `  #endif`
      ].join('\n')
    })
  );
  const cacheHeaders = sw(d.etag, {
    always: [
      `    response->addHeader("Cache-Control", "${cacheCtrl(source)}");`,
      `    response->addHeader("ETag", etag_${source.dataname});`
    ].join('\n'),
    compiler: [
      `  #ifdef ${d.definePrefix}_ENABLE_ETAG`,
      `    response->addHeader("Cache-Control", "${cacheCtrl(source)}");`,
      `    response->addHeader("ETag", etag_${source.dataname});`,
      `  #endif`
    ].join('\n')
  });
  if (cacheHeaders) lines.push(cacheHeaders);
  lines.push(`    ${d.definePrefix}_onFileServed("${path}", 200);`, `    request->send(response);`);
  return lines.join('\n');
};

const genAsyncCpp = (d: TemplateData): string => {
  const lines: string[] = [
    `//engine:   ESPAsyncWebServer`,
    `//config:   ${d.config}`,
    ...(d.created ? [`//created:  ${d.now}`] : []),
    '//',
    genCommonHeader(d),
    '//',
    '#include <Arduino.h>',
    '#include <ESPAsyncWebServer.h>',
    '//',
    genDataArrays(d, true),
    '//',
    genEtagArrays(d),
    '//',
    genManifest(d),
    '//',
    genHook(d),
    '//',
    '// Http Handlers',
    `void ${d.methodName}(AsyncWebServer * server) {`
  ];
  for (const source of d.sources) {
    const path = `${d.basePath}/${source.filename}`;
    const defaultPath = d.basePath || '/';
    lines.push(
      '//',
      `// ${source.filename}`,
      `  server->on("${path}", HTTP_GET, [](AsyncWebServerRequest * request) {`,
      genAsyncHandlerBody(d, source, path),
      `  });`
    );
    if (source.isDefault)
      lines.push(
        `  server->on("${defaultPath}", HTTP_GET, [](AsyncWebServerRequest * request) {`,
        genAsyncHandlerBody(d, source, defaultPath),
        `  });`
      );
  }
  if (d.spa && d.spaSource) {
    const source = d.spaSource;
    const path = `${d.basePath}/${source.filename}`;
    lines.push(
      '//',
      `// SPA catch-all: unmatched routes serve ${source.filename}`,
      `  server->onNotFound([](AsyncWebServerRequest * request) {`,
      `    if (request->method() != HTTP_GET) { request->send(404); return; }`
    );
    if (d.basePath)
      lines.push(
        `    if (!request->url().startsWith("${d.basePath}/") && request->url() != "${d.basePath}") { request->send(404); return; }`
      );
    lines.push(genAsyncHandlerBody(d, source, path), `  });`);
  }
  lines.push('}');
  return lines.join('\n');
};

// WebServer engine

const genWebserverHandlerBody = (d: TemplateData, source: TransformedSource, path: string): string => {
  const lines: string[] = [];
  const etagCheck = sw(d.etag, {
    always: [
      `    if (server->hasHeader("If-None-Match") && server->header("If-None-Match").equals(etag_${source.dataname})) {`,
      `      server->send(304);`,
      `      ${d.definePrefix}_onFileServed("${path}", 304);`,
      `      return;`,
      `    }`
    ].join('\n'),
    compiler: [
      `  #ifdef ${d.definePrefix}_ENABLE_ETAG`,
      `    if (server->hasHeader("If-None-Match") && server->header("If-None-Match").equals(etag_${source.dataname})) {`,
      `      server->send(304);`,
      `      ${d.definePrefix}_onFileServed("${path}", 304);`,
      `      return;`,
      `    }`,
      `  #endif`
    ].join('\n')
  });
  if (etagCheck) lines.push(etagCheck);
  const cacheHeaders = sw(d.etag, {
    always: [
      `    server->sendHeader("Cache-Control", "${cacheCtrl(source)}");`,
      `    server->sendHeader("ETag", etag_${source.dataname});`
    ].join('\n'),
    compiler: [
      `  #ifdef ${d.definePrefix}_ENABLE_ETAG`,
      `    server->sendHeader("Cache-Control", "${cacheCtrl(source)}");`,
      `    server->sendHeader("ETag", etag_${source.dataname});`,
      `  #endif`
    ].join('\n')
  });
  if (cacheHeaders) lines.push(cacheHeaders);
  lines.push(
    sw(d.gzip, {
      always: [
        ...(source.isGzip ? [`    server->sendHeader("Content-Encoding", "gzip");`] : []),
        `    server->setContentLength(${source.lengthGzip});`,
        `    server->send(200, "${source.mime}", "");`,
        `    ${d.definePrefix}_sendChunked(server, datagzip_${source.dataname}, ${source.lengthGzip});`
      ].join('\n'),
      never: [
        `    server->setContentLength(${source.length});`,
        `    server->send(200, "${source.mime}", "");`,
        `    ${d.definePrefix}_sendChunked(server, data_${source.dataname}, ${source.length});`
      ].join('\n'),
      compiler: [
        `  #ifdef ${d.definePrefix}_ENABLE_GZIP`,
        ...(source.isGzip ? [`    server->sendHeader("Content-Encoding", "gzip");`] : []),
        `    server->setContentLength(${source.lengthGzip});`,
        `    server->send(200, "${source.mime}", "");`,
        `    ${d.definePrefix}_sendChunked(server, datagzip_${source.dataname}, ${source.lengthGzip});`,
        `  #else`,
        `    server->setContentLength(${source.length});`,
        `    server->send(200, "${source.mime}", "");`,
        `    ${d.definePrefix}_sendChunked(server, data_${source.dataname}, ${source.length});`,
        `  #endif`
      ].join('\n')
    }),
    `    ${d.definePrefix}_onFileServed("${path}", 200);`
  );
  return lines.join('\n');
};

const genWebserverCpp = (d: TemplateData): string => {
  const lines: string[] = [
    `//engine:   Arduino WebServer`,
    `//config:   ${d.config}`,
    ...(d.created ? [`//created:  ${d.now}`] : []),
    '//',
    genCommonHeader(d),
    '//',
    '#include <Arduino.h>',
    '#include <WebServer.h>',
    '//',
    genDataArrays(d, true),
    '//',
    genEtagArrays(d),
    '//',
    genManifest(d),
    '//',
    genHook(d),
    '//',
    `// Chunked send helper for PROGMEM data`,
    `static inline void ${d.definePrefix}_sendChunked(WebServer * server, const uint8_t * data, size_t len) {`,
    `  const size_t chunkSize = 4096;`,
    `  for (size_t offset = 0; offset < len; offset += chunkSize) {`,
    `    size_t remaining = len - offset;`,
    `    size_t toSend = remaining < chunkSize ? remaining : chunkSize;`,
    `    server->sendContent_P((const char *)(data + offset), toSend);`,
    `  }`,
    `}`,
    '//',
    '// Http Handlers',
    `void ${d.methodName}(WebServer * server) {`
  ];
  for (const source of d.sources) {
    const path = `${d.basePath}/${source.filename}`;
    const defaultPath = d.basePath || '/';
    lines.push(
      '//',
      `// ${source.filename}`,
      `  server->on("${path}", HTTP_GET, [server]() {`,
      genWebserverHandlerBody(d, source, path),
      `  });`
    );
    if (source.isDefault)
      lines.push(
        `  server->on("${defaultPath}", HTTP_GET, [server]() {`,
        genWebserverHandlerBody(d, source, defaultPath),
        `  });`
      );
  }
  if (d.spa && d.spaSource) {
    const source = d.spaSource;
    const path = `${d.basePath}/${source.filename}`;
    lines.push(
      '//',
      `// SPA catch-all: unmatched routes serve ${source.filename}`,
      `  server->onNotFound([server]() {`,
      `    if (server->method() != HTTP_GET) { server->send(404, "text/plain", "Not found"); return; }`
    );
    if (d.basePath)
      lines.push(
        `    if (!server->uri().startsWith("${d.basePath}/") && server->uri() != "${d.basePath}") { server->send(404, "text/plain", "Not found"); return; }`
      );
    lines.push(genWebserverHandlerBody(d, source, path), `  });`);
  }
  lines.push('}');
  return lines.join('\n');
};

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
