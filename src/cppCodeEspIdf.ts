export const espidfTemplate = `
//engine:   espidf
//config:   {{{config}}}
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
#include <string.h>
#include <stdlib.h>
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
static const char etag_{{this.dataname}}[] = "{{this.sha256}}";
  {{/each}}
{{/case}}
{{#case "false"}}
{{/case}}
{{#case "compiler"}}
#ifdef {{definePrefix}}_ENABLE_ETAG
  {{#each sources}}
static const char etag_{{this.dataname}}[] = "{{this.sha256}}";
  {{/each}}
#endif
{{/case}}
{{/switch}}

// File manifest struct (C-compatible typedef)
typedef struct {
  const char* path;
  uint32_t size;
  uint32_t gzipSize;
  const char* etag;
  const char* contentType;
} {{definePrefix}}_FileInfo;

// File manifest array
static const {{definePrefix}}_FileInfo {{definePrefix}}_FILES[] = {
{{#each sources}}
  { "{{../basePath}}/{{this.filename}}", {{this.length}}, {{this.gzipSizeForManifest}}, {{this.etagForManifest}}, "{{this.mime}}" },
{{/each}}
};
static const size_t {{definePrefix}}_FILE_COUNT = sizeof({{definePrefix}}_FILES) / sizeof({{definePrefix}}_FILES[0]);

// File served hook - override with your own implementation
__attribute__((weak)) void {{definePrefix}}_onFileServed(const char* path, int statusCode) {}

{{#each sources}}

static esp_err_t file_handler_{{this.datanameUpperCase}} (httpd_req_t *req)
{
{{#switch ../etag}}
{{#case "true"}}
    size_t hdr_len = httpd_req_get_hdr_value_len(req, "If-None-Match");
    if (hdr_len > 0) {
        char* hdr_value = malloc(hdr_len + 1);
        if (httpd_req_get_hdr_value_str(req, "If-None-Match", hdr_value, hdr_len + 1) == ESP_OK) {
            if (strcmp(hdr_value, etag_{{this.dataname}}) == 0) {
                free(hdr_value);
                httpd_resp_set_status(req, "304 Not Modified");
                {{../definePrefix}}_onFileServed("{{../basePath}}/{{this.filename}}", 304);
                httpd_resp_send(req, NULL, 0);
                return ESP_OK;
            }
        }
        free(hdr_value);
    }
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
    size_t hdr_len = httpd_req_get_hdr_value_len(req, "If-None-Match");
    if (hdr_len > 0) {
        char* hdr_value = malloc(hdr_len + 1);
        if (httpd_req_get_hdr_value_str(req, "If-None-Match", hdr_value, hdr_len + 1) == ESP_OK) {
            if (strcmp(hdr_value, etag_{{this.dataname}}) == 0) {
                free(hdr_value);
                httpd_resp_set_status(req, "304 Not Modified");
                {{../definePrefix}}_onFileServed("{{../basePath}}/{{this.filename}}", 304);
                httpd_resp_send(req, NULL, 0);
                return ESP_OK;
            }
        }
        free(hdr_value);
    }
  #endif
{{/case}}
{{/switch}}
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
    {{../definePrefix}}_onFileServed("{{../basePath}}/{{this.filename}}", 200);
    httpd_resp_send(req, datagzip_{{this.dataname}}, {{this.lengthGzip}});
{{/case}}
{{#case "false"}}
    {{../definePrefix}}_onFileServed("{{../basePath}}/{{this.filename}}", 200);
    httpd_resp_send(req, data_{{this.dataname}}, {{this.length}});
{{/case}}
{{#case "compiler"}}
    {{../definePrefix}}_onFileServed("{{../basePath}}/{{this.filename}}", 200);
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
    .uri = "{{#if ../basePath}}{{../basePath}}{{else}}/{{/if}}",
    .method = HTTP_GET,
    .handler = file_handler_{{this.datanameUpperCase}},
};
{{/if}}

static const httpd_uri_t route_{{this.datanameUpperCase}} = {
    .uri = "{{../basePath}}/{{this.filename}}",
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
