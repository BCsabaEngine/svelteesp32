import type { TemplateData, TransformedSource } from './cppCode';
import { cacheCtrl, genCommonHeader, genDataArrays, genEtagArrays, genHook, genManifest, sw } from './cppCode';

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
