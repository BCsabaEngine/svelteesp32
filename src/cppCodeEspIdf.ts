export const espidfTemplate = `
//engine:   espidf
//cmdline:  {{{commandLine}}}
{{#if created }}
//created:  {{now}}
{{/if}}
//

{{#switch etag}}
{{#case "true"}}
#ifdef {{definePrefix}}_ENABLE_ETAG
#warning {{definePrefix}}_ENABLE_ETAG has no effect because it is permanently switched ON
#endif
{{/case}}
{{#case "false"}}
#ifdef {{definePrefix}}_ENABLE_ETAG
#warning {{definePrefix}}_ENABLE_ETAG has no effect because it is permanently switched OFF
#endif
{{/case}}
{{/switch}}

{{#switch gzip}}
{{#case "true"}}
#ifdef {{definePrefix}}_ENABLE_GZIP
#warning {{definePrefix}}_ENABLE_GZIP has no effect because it is permanently switched ON
#endif
{{/case}}
{{#case "false"}}
#ifdef {{definePrefix}}_ENABLE_GZIP
#warning {{definePrefix}}_ENABLE_GZIP has no effect because it is permanently switched OFF
#endif
{{/case}}
{{/switch}}

//
{{#if version }}
#define {{definePrefix}}_VERSION "{{version}}"
{{/if}}
#define {{definePrefix}}_COUNT {{fileCount}}
#define {{definePrefix}}_SIZE {{fileSize}}
#define {{definePrefix}}_SIZE_GZIP {{fileGzipSize}}

//
{{#each sources}}
#define {{../definePrefix}}_FILE_{{this.datanameUpperCase}}
{{/each}}

//
{{#each filesByExtension}}
#define {{../definePrefix}}_{{this.extension}}_FILES {{this.count}}
{{/each}}

#include <stdint.h>
#include <esp_err.h>
#include <esp_http_server.h>

//
{{#switch gzip}}
{{#case "true"}}
  {{#each sources}}
const char datagzip_{{this.dataname}}[{{this.lengthGzip}}] = { {{this.bytesGzip}} };
  {{/each}}
{{/case}}
{{#case "false"}}
  {{#each sources}}
const char data_{{this.dataname}}[{{this.length}}] = { {{this.bytes}} };
  {{/each}}
{{/case}}
{{#case "compiler"}}
#ifdef {{definePrefix}}_ENABLE_GZIP
  {{#each sources}}
const char datagzip_{{this.dataname}}[{{this.lengthGzip}}] = { {{this.bytesGzip}} };
  {{/each}}
#else
  {{#each sources}}
const char data_{{this.dataname}}[{{this.length}}] = { {{this.bytes}} };
  {{/each}}
#endif 
{{/case}}
{{/switch}}

//
{{#switch etag}}
{{#case "true"}}
  {{#each sources}}
const char * etag_{{this.dataname}} = "{{this.md5}}";
  {{/each}}
{{/case}}
{{#case "false"}}
{{/case}}
{{#case "compiler"}}
#ifdef {{definePrefix}}_ENABLE_ETAG
  {{#each sources}}
const char * etag_{{this.dataname}} = "{{this.md5}}";
  {{/each}}
#endif 
{{/case}}
{{/switch}}

{{#each sources}}

static esp_err_t file_handler_{{this.datanameUpperCase}} (httpd_req_t *req)
{
    httpd_resp_set_type(req, "{{this.mime}}");
{{#switch ../gzip}}
{{#case "true"}}
{{#if this.isGzip}}
    httpd_resp_set_hdr(req, "Content-Encoding", "gzip");
{{/if}}
{{/case}}
{{#case "compiler"}}
  {{#if this.isGzip}}
  #ifdef {{../definePrefix}}_ENABLE_GZIP
    httpd_resp_set_hdr(req, "Content-Encoding", "gzip");
  #endif 
  {{/if}}
{{/case}}
{{/switch}}

{{#switch ../etag}}
{{#case "true"}}
{{#../cacheTime}}
    httpd_resp_set_hdr(req, "Cache-Control", "max-age={{value}}");
{{/../cacheTime}}
{{^../cacheTime}}
    httpd_resp_set_hdr(req, "Cache-Control", "no-cache");
{{/../cacheTime}}
    httpd_resp_set_hdr(req, "ETag", etag_{{this.dataname}});
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
{{#../cacheTime}}
    httpd_resp_set_hdr(req, "Cache-Control", "max-age={{value}}");
{{/../cacheTime}}
{{^../cacheTime}}
    httpd_resp_set_hdr(req, "Cache-Control", "no-cache");
{{/../cacheTime}}
    httpd_resp_set_hdr(req, "ETag", etag_{{this.dataname}});
  #endif 
{{/case}}
{{/switch}}

{{#switch ../gzip}}
{{#case "true"}}
    httpd_resp_send(req, datagzip_{{this.dataname}}, {{this.lengthGzip}});
{{/case}}
{{#case "false"}}
    httpd_resp_send(req, data_{{this.dataname}}, {{this.length}});
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_GZIP
    httpd_resp_send(req, datagzip_{{this.dataname}}, {{this.lengthGzip}});
  #else
    httpd_resp_send(req, data_{{this.dataname}}, {{this.length}});
  #endif 
{{/case}}
{{/switch}}
    return ESP_OK;
}

{{#if this.isDefault}}
static const httpd_uri_t route_def_{{this.datanameUpperCase}} = {
    .uri = "/",
    .method = HTTP_GET,
    .handler = file_handler_{{this.datanameUpperCase}},
};
{{/if}}

static const httpd_uri_t route_{{this.datanameUpperCase}} = {
    .uri = "/{{this.filename}}",
    .method = HTTP_GET,
    .handler = file_handler_{{this.datanameUpperCase}},
};

{{/each}}



static inline void {{methodName}}(httpd_handle_t server) {
{{#each sources}}
{{#if this.isDefault}}
    httpd_register_uri_handler(server, &route_def_{{this.datanameUpperCase}});
{{/if}}
    httpd_register_uri_handler(server, &route_{{this.datanameUpperCase}});
{{/each}}

}`;
