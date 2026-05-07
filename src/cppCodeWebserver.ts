import type { TemplateData, TransformedSource } from './cppCode';
import { cacheCtrl, genCommonHeader, genDataArrays, genEtagArrays, genHook, genManifest, sw } from './cppCode';

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

export const genWebserverCpp = (d: TemplateData): string => {
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
