import type { TemplateData, TransformedSource } from './cppCode';
import {
  cacheCtrl,
  genCacheHeaders,
  genCommonHeader,
  genDataArrays,
  genEtagArrays,
  genHook,
  genManifest,
  sw
} from './cppCode';

const genAsyncHandlerBody = (d: TemplateData, source: TransformedSource, path: string): string => {
  const lines: string[] = [];
  // RFC 7232 4.1: a 304 must repeat the Cache-Control and ETag a 200 would have carried, otherwise
  // the client cannot refresh the stored response's freshness lifetime and revalidates every time.
  // request->send(304) builds and sends in one call, leaving no handle to add headers to - the
  // 304 has to go through beginResponse() instead.
  const etagBody = [
    `    const AsyncWebHeader* h = request->getHeader("If-None-Match");`,
    `    if (h && strstr(h->value().c_str(), etag_${source.dataname}) != nullptr) {`,
    `      AsyncWebServerResponse *notModified = request->beginResponse(304);`,
    `      notModified->addHeader("Cache-Control", "${cacheCtrl(source)}");`,
    `      notModified->addHeader("ETag", etag_${source.dataname});`,
    `      ${d.definePrefix}_onFileServed("${path}", 304);`,
    `      request->send(notModified);`,
    `      return;`,
    `    }`
  ].join('\n');
  const etagCheck = sw(d.etag, {
    always: etagBody,
    compiler: [`  #ifdef ${d.definePrefix}_ENABLE_ETAG`, etagBody, `  #endif`].join('\n')
  });
  if (etagCheck) lines.push(etagCheck);
  // HEAD: same status and headers as GET, but no body. The empty-content beginResponse() overload
  // reports Content-Length: 0 - a truthful length would stall the response, because
  // AsyncWebServerResponse only completes once _sentLength reaches _contentLength.
  const beginResponse = (array: string, length: number): string =>
    [
      `    AsyncWebServerResponse *response = request->method() == HTTP_HEAD`,
      `      ? request->beginResponse(200, "${source.mime}")`,
      `      : request->beginResponse(200, "${source.mime}", ${array}_${source.dataname}, ${length});`
    ].join('\n');
  lines.push(
    sw(d.gzip, {
      always: [
        beginResponse('datagzip', source.lengthGzip),
        ...(source.isGzip ? [`    response->addHeader("Content-Encoding", "gzip");`] : [])
      ].join('\n'),
      never: beginResponse('data', source.length),
      compiler: [
        `  #ifdef ${d.definePrefix}_ENABLE_GZIP`,
        beginResponse('datagzip', source.lengthGzip),
        ...(source.isGzip ? [`    response->addHeader("Content-Encoding", "gzip");`] : []),
        `  #else`,
        beginResponse('data', source.length),
        `  #endif`
      ].join('\n')
    }),
    // Must follow beginResponse(): there is no `response` to hang the headers on before it.
    genCacheHeaders(d, source, (h, v) => `    response->addHeader("${h}", ${v});`),
    `    ${d.definePrefix}_onFileServed("${path}", 200);`,
    `    request->send(response);`
  );
  return lines.join('\n');
};

export const genAsyncCpp = (d: TemplateData): string => {
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
      `  server->on("${path}", HTTP_GET | HTTP_HEAD, [](AsyncWebServerRequest * request) {`,
      genAsyncHandlerBody(d, source, path),
      `  });`
    );
    if (source.isDefault)
      lines.push(
        `  server->on("${defaultPath}", HTTP_GET | HTTP_HEAD, [](AsyncWebServerRequest * request) {`,
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
      `    if (request->method() != HTTP_GET && request->method() != HTTP_HEAD) { request->send(404); return; }`
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
