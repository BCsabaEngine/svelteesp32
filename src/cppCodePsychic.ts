import type { TemplateData, TransformedSource } from './cppCode';
import { cacheCtrl, genCommonHeader, genDataArrays, genEtagArrays, genHook, genManifest, sw } from './cppCode';

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
