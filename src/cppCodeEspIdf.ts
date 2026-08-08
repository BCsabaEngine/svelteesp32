import type { TemplateData, TransformedSource } from './cppCode';
import {
  cacheCtrl,
  gateEtag,
  gateGzip,
  genCacheHeaders,
  genCommonHeader,
  genDataArrays,
  genEtagArrays,
  genHook,
  genManifest
} from './cppCode';

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
  const etagCheck = gateEtag(d, etagBody);
  if (etagCheck) lines.push(etagCheck);
  lines.push(`    httpd_resp_set_type(req, "${source.mime}");`);
  const gzipEncoding = gateGzip(d, source.isGzip ? `    httpd_resp_set_hdr(req, "Content-Encoding", "gzip");` : '', '');
  if (gzipEncoding) lines.push(gzipEncoding);
  lines.push(
    genCacheHeaders(d, source, (h, v) => `    httpd_resp_set_hdr(req, "${h}", ${v});`),
    // The hook fires before the send in every mode, so it sits outside the gzip gate.
    [
      `    ${d.definePrefix}_onFileServed("${path}", 200);`,
      gateGzip(
        d,
        `    httpd_resp_send(req, (const char *)datagzip_${source.dataname}, ${source.lengthGzip});`,
        `    httpd_resp_send(req, (const char *)data_${source.dataname}, ${source.length});`
      )
    ].join('\n'),
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
    '//',
    // espidf is the one engine where the handler counts are load-bearing: httpd_config_t.max_uri_handlers
    // reads them, so they are emitted without psychic's "informational only" disclaimer.
    genCommonHeader(d, 'loadBearing'),
    '#include <stdint.h>',
    '#include <string.h>',
    '#include <stdlib.h>',
    '#include <esp_err.h>',
    '#include <esp_http_server.h>',
    '//',
    genDataArrays(d, { elementType: 'unsigned char', isProgmem: false }),
    '//',
    genEtagArrays(d),
    genManifest(d, true),
    genHook(d, false)
  ];
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
