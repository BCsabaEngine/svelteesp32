import type { TemplateData, TransformedSource } from './cppCode';
import { cacheCtrl, genCommonHeader, genDataArrays, genEtagArrays, genHook, genManifest, sw } from './cppCode';

// isAnyMethod: the route is registered as HTTP_ANY, so the handler must reject methods other than GET/HEAD itself
const genPsychicHandlerBody = (
  d: TemplateData,
  source: TransformedSource,
  path: string,
  isAnyMethod: boolean
): string => {
  const lines: string[] = [];
  if (isAnyMethod)
    lines.push(
      [
        `    if (request->method() != HTTP_GET && request->method() != HTTP_HEAD) {`,
        `      response->setCode(405);`,
        `      response->addHeader("Allow", "GET, HEAD");`,
        `      return response->send();`,
        `    }`
      ].join('\n')
    );
  const etagCheck = sw(d.etag, {
    always: [
      `    if (request->hasHeader("If-None-Match") && strstr(request->header("If-None-Match").c_str(), etag_${source.dataname}) != nullptr) {`,
      `      response->setCode(304);`,
      `      ${d.definePrefix}_onFileServed("${path}", 304);`,
      `      return response->send();`,
      `    }`
    ].join('\n'),
    compiler: [
      `  #ifdef ${d.definePrefix}_ENABLE_ETAG`,
      `    if (request->hasHeader("If-None-Match") && strstr(request->header("If-None-Match").c_str(), etag_${source.dataname}) != nullptr) {`,
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
  // HEAD: same status and headers as GET, but no body. esp-idf's httpd_resp_send() derives
  // Content-Length from the buffer length, so a body-less send always reports Content-Length: 0.
  lines.push(
    `    if (request->method() != HTTP_HEAD) {`,
    sw(d.gzip, {
      always: `      response->setContent(datagzip_${source.dataname}, ${source.lengthGzip});`,
      never: `      response->setContent(data_${source.dataname}, ${source.length});`,
      compiler: [
        `  #ifdef ${d.definePrefix}_ENABLE_GZIP`,
        `      response->setContent(datagzip_${source.dataname}, ${source.lengthGzip});`,
        `  #else`,
        `      response->setContent(data_${source.dataname}, ${source.length});`,
        `  #endif`
      ].join('\n')
    }),
    `    }`,
    `    ${d.definePrefix}_onFileServed("${path}", 200);`,
    `    return response->send();`
  );
  return lines.join('\n');
};

export const genPsychicCpp = (d: TemplateData): string => {
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
  // HTTP_ANY keeps GET and HEAD on a single endpoint (psychic matches HTTP_ANY against every method),
  // so HEAD costs no extra PsychicEndpoint. The handler rejects anything but GET/HEAD with a 405.
  for (const source of d.sources) {
    const path = `${d.basePath}/${source.filename}`;
    const serverPrefix = source.isDefault && !d.basePath ? 'server->defaultEndpoint = ' : '';
    lines.push(
      '//',
      `// ${source.filename}`,
      `  ${serverPrefix}server->on("${path}", HTTP_ANY, [](PsychicRequest * request, PsychicResponse * response) {`,
      genPsychicHandlerBody(d, source, path, true),
      `  });`
    );
    if (source.isDefault && d.basePath)
      lines.push(
        '//',
        `// ${source.filename} (base path route)`,
        `  server->on("${d.basePath}", HTTP_ANY, [](PsychicRequest * request, PsychicResponse * response) {`,
        genPsychicHandlerBody(d, source, d.basePath, true),
        `  });`
      );
  }
  // The SPA catch-all stays method-specific: an HTTP_ANY wildcard would shadow API routes the user
  // registers under basePath after this function runs, since psychic matches endpoints in order.
  if (d.spa && d.spaSource && d.basePath) {
    const source = d.spaSource;
    const path = `${d.basePath}/${source.filename}`;
    for (const method of ['HTTP_GET', 'HTTP_HEAD'])
      lines.push(
        '//',
        `// SPA catch-all (${method}): unmatched routes serve ${source.filename}`,
        `  server->on("${d.basePath}/*", ${method}, [](PsychicRequest * request, PsychicResponse * response) {`,
        genPsychicHandlerBody(d, source, path, false),
        `  });`
      );
  }
  lines.push('}');
  return lines.join('\n');
};
