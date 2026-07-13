import type { TemplateData, TransformedSource } from './cppCode';
import { cacheCtrl, etagLiteral, sw } from './cppCode';

const genEspIdfFileHandler = (d: TemplateData, source: TransformedSource): string => {
  const path = `${d.basePath}/${source.filename}`;
  const lines: string[] = [`static esp_err_t file_handler_${source.datanameUpperCase} (httpd_req_t *req)`, '{'];
  // RFC 7232 4.1: a 304 must repeat the Cache-Control and ETag a 200 would have carried, otherwise
  // the client cannot refresh the stored response's freshness lifetime and revalidates every time.
  // httpd_resp_set_hdr() does not copy its key/value - both point at static storage here.
  const etagBody = [
    `    size_t hdr_len = httpd_req_get_hdr_value_len(req, "If-None-Match");`,
    `    if (hdr_len > 0) {`,
    `        char* hdr_value = malloc(hdr_len + 1);`,
    `        if (hdr_value == NULL) { httpd_resp_send_500(req); return ESP_FAIL; }`,
    `        if (httpd_req_get_hdr_value_str(req, "If-None-Match", hdr_value, hdr_len + 1) == ESP_OK) {`,
    `            if (strstr(hdr_value, etag_${source.dataname}) != NULL) {`,
    `                free(hdr_value);`,
    `                httpd_resp_set_status(req, "304 Not Modified");`,
    `                httpd_resp_set_hdr(req, "Cache-Control", "${cacheCtrl(source)}");`,
    `                httpd_resp_set_hdr(req, "ETag", etag_${source.dataname});`,
    `                ${d.definePrefix}_onFileServed("${path}", 304);`,
    `                httpd_resp_send(req, NULL, 0);`,
    `                return ESP_OK;`,
    `            }`,
    `        }`,
    `        free(hdr_value);`,
    `    }`
  ].join('\n');
  const etagCheck = sw(d.etag, {
    always: etagBody,
    compiler: [`  #ifdef ${d.definePrefix}_ENABLE_ETAG`, etagBody, `  #endif`].join('\n')
  });
  if (etagCheck) lines.push(etagCheck);
  lines.push(`    httpd_resp_set_type(req, "${source.mime}");`);
  const gzipEncoding = sw(d.gzip, {
    always: source.isGzip ? `    httpd_resp_set_hdr(req, "Content-Encoding", "gzip");` : '',
    compiler: source.isGzip
      ? [
          `  #ifdef ${d.definePrefix}_ENABLE_GZIP`,
          `    httpd_resp_set_hdr(req, "Content-Encoding", "gzip");`,
          `  #endif`
        ].join('\n')
      : ''
  });
  if (gzipEncoding) lines.push(gzipEncoding);
  const cacheHeaders = sw(d.etag, {
    always: [
      `    httpd_resp_set_hdr(req, "Cache-Control", "${cacheCtrl(source)}");`,
      `    httpd_resp_set_hdr(req, "ETag", etag_${source.dataname});`
    ].join('\n'),
    compiler: [
      `  #ifdef ${d.definePrefix}_ENABLE_ETAG`,
      `    httpd_resp_set_hdr(req, "Cache-Control", "${cacheCtrl(source)}");`,
      `    httpd_resp_set_hdr(req, "ETag", etag_${source.dataname});`,
      `  #endif`
    ].join('\n')
  });
  if (cacheHeaders) lines.push(cacheHeaders);
  lines.push(
    sw(d.gzip, {
      always: [
        `    ${d.definePrefix}_onFileServed("${path}", 200);`,
        `    httpd_resp_send(req, (const char *)datagzip_${source.dataname}, ${source.lengthGzip});`
      ].join('\n'),
      never: [
        `    ${d.definePrefix}_onFileServed("${path}", 200);`,
        `    httpd_resp_send(req, (const char *)data_${source.dataname}, ${source.length});`
      ].join('\n'),
      compiler: [
        `    ${d.definePrefix}_onFileServed("${path}", 200);`,
        `  #ifdef ${d.definePrefix}_ENABLE_GZIP`,
        `    httpd_resp_send(req, (const char *)datagzip_${source.dataname}, ${source.lengthGzip});`,
        `  #else`,
        `    httpd_resp_send(req, (const char *)data_${source.dataname}, ${source.length});`,
        `  #endif`
      ].join('\n')
    }),
    `    return ESP_OK;`,
    `}`
  );
  if (source.isDefault) {
    const defaultUri = d.basePath || '/';
    lines.push(
      `static const httpd_uri_t route_def_${source.datanameUpperCase} = {`,
      `    .uri = "${defaultUri}",`,
      `    .method = HTTP_GET,`,
      `    .handler = file_handler_${source.datanameUpperCase},`,
      `};`
    );
  }
  lines.push(
    `static const httpd_uri_t route_${source.datanameUpperCase} = {`,
    `    .uri = "${path}",`,
    `    .method = HTTP_GET,`,
    `    .handler = file_handler_${source.datanameUpperCase},`,
    `};`
  );
  return lines.join('\n');
};

export const genEspIdfCpp = (d: TemplateData): string => {
  const lines: string[] = [
    `//engine:   espidf`,
    `//config:   ${d.config}`,
    ...(d.created ? [`//created:  ${d.now}`] : []),
    '//'
  ];
  const etagWarn = sw(d.etag, {
    always: [
      `#ifdef ${d.definePrefix}_ENABLE_ETAG`,
      `#warning ${d.definePrefix}_ENABLE_ETAG has no effect because it is permanently switched ON`,
      `#endif`
    ].join('\n'),
    never: [
      `#ifdef ${d.definePrefix}_ENABLE_ETAG`,
      `#warning ${d.definePrefix}_ENABLE_ETAG has no effect because it is permanently switched OFF`,
      `#endif`
    ].join('\n')
  });
  if (etagWarn) lines.push(etagWarn);
  const gzipWarn = sw(d.gzip, {
    always: [
      `#ifdef ${d.definePrefix}_ENABLE_GZIP`,
      `#warning ${d.definePrefix}_ENABLE_GZIP has no effect because it is permanently switched ON`,
      `#endif`
    ].join('\n'),
    never: [
      `#ifdef ${d.definePrefix}_ENABLE_GZIP`,
      `#warning ${d.definePrefix}_ENABLE_GZIP has no effect because it is permanently switched OFF`,
      `#endif`
    ].join('\n')
  });
  if (gzipWarn) lines.push(gzipWarn);
  lines.push('//');
  if (d.version) lines.push(`#define ${d.definePrefix}_VERSION "${d.version}"`);
  lines.push(
    `#define ${d.definePrefix}_COUNT ${d.fileCount}`,
    `#define ${d.definePrefix}_SIZE ${d.fileSize}`,
    `#define ${d.definePrefix}_SIZE_GZIP ${d.fileGzipSize}`,
    `#define ${d.definePrefix}_URI_HANDLERS ${d.uriHandlers}`,
    `#define ${d.definePrefix}_MAX_URI_HANDLERS ${d.maxUriHandlers}`,
    '//',
    ...d.sources.map((s) => `#define ${d.definePrefix}_FILE_${s.datanameUpperCase}`),
    '//',
    ...d.filesByExtension.map((g) => `#define ${d.definePrefix}_${g.extension}_FILES ${g.count}`),
    '#include <stdint.h>',
    '#include <string.h>',
    '#include <stdlib.h>',
    '#include <esp_err.h>',
    '#include <esp_http_server.h>',
    '//'
  );
  const gzipArrays = d.sources
    .map((s) => `static const unsigned char datagzip_${s.dataname}[${s.lengthGzip}] = { ${s.bytesGzip} };`)
    .join('\n');
  const plainArrays = d.sources
    .map((s) => `static const unsigned char data_${s.dataname}[${s.length}] = { ${s.bytes} };`)
    .join('\n');
  lines.push(
    sw(d.gzip, {
      always: gzipArrays,
      never: plainArrays,
      compiler: [`#ifdef ${d.definePrefix}_ENABLE_GZIP`, gzipArrays, '#else', plainArrays, '#endif'].join('\n')
    }),
    '//'
  );
  const etagItems = d.sources
    .map((s) => `static const char etag_${s.dataname}[] = ${etagLiteral(s.sha256)};`)
    .join('\n');
  const etagBlock = sw(d.etag, {
    always: etagItems,
    compiler: [`#ifdef ${d.definePrefix}_ENABLE_ETAG`, etagItems, '#endif'].join('\n')
  });
  if (etagBlock) lines.push(etagBlock);
  lines.push(
    `// File manifest struct (C-compatible typedef)`,
    `typedef struct {`,
    `  const char* path;`,
    `  uint32_t size;`,
    `  uint32_t gzipSize;`,
    `  const char* etag;`,
    `  const char* contentType;`,
    `} ${d.definePrefix}_FileInfo;`,
    `// File manifest array`,
    `static const ${d.definePrefix}_FileInfo ${d.definePrefix}_FILES[] = {`,
    ...d.sources.map(
      (s) =>
        `  { "${d.basePath}/${s.filename}", ${s.length}, ${s.gzipSizeForManifest}, ${s.etagForManifest}, "${s.mime}" },`
    ),
    `};`,
    `static const size_t ${d.definePrefix}_FILE_COUNT = sizeof(${d.definePrefix}_FILES) / sizeof(${d.definePrefix}_FILES[0]);`,
    `// File served hook - override with your own implementation`,
    `__attribute__((weak)) void ${d.definePrefix}_onFileServed(const char* path, int statusCode) {}`
  );
  for (const source of d.sources) lines.push(genEspIdfFileHandler(d, source));
  if (d.spa && d.spaSource) {
    const source = d.spaSource;
    lines.push(`static esp_err_t spa_handler_${source.datanameUpperCase}(httpd_req_t *req, httpd_err_code_t err) {`);
    if (d.basePath)
      lines.push(
        `    const char* prefix = "${d.basePath}/";`,
        `    if (strncmp(req->uri, prefix, strlen(prefix)) != 0 && strcmp(req->uri, "${d.basePath}") != 0) {`,
        `        httpd_resp_send_err(req, HTTPD_404_NOT_FOUND, "Not found");`,
        `        return ESP_FAIL;`,
        `    }`
      );

    lines.push(`    return file_handler_${source.datanameUpperCase}(req);`, `}`);
  }
  lines.push(`static inline void ${d.methodName}(httpd_handle_t server) {`);
  for (const source of d.sources) {
    if (source.isDefault) lines.push(`    httpd_register_uri_handler(server, &route_def_${source.datanameUpperCase});`);
    lines.push(`    httpd_register_uri_handler(server, &route_${source.datanameUpperCase});`);
  }
  if (d.spa && d.spaSource)
    lines.push(
      `    httpd_register_err_handler(server, HTTPD_404_NOT_FOUND, spa_handler_${d.spaSource.datanameUpperCase});`
    );
  lines.push('}');
  return lines.join('\n');
};
