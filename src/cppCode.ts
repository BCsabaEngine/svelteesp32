import { compile as handlebarsCompile, type HelperOptions } from 'handlebars';

import type { ICopyFilesArguments } from './commandLine';
import { formatConfiguration } from './commandLine';
import { espidfTemplate } from './cppCodeEspIdf';

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

/**
 * Common template header section used by all engine types
 */
const commonHeaderSection = `
{{#switch etag}}
{{#case "always"}}
#ifdef {{definePrefix}}_ENABLE_ETAG
#warning {{definePrefix}}_ENABLE_ETAG has no effect because it is permanently switched ON
#endif
{{/case}}
{{#case "never"}}
#ifdef {{definePrefix}}_ENABLE_ETAG
#warning {{definePrefix}}_ENABLE_ETAG has no effect because it is permanently switched OFF
#endif
{{/case}}
{{/switch}}

{{#switch gzip}}
{{#case "always"}}
#ifdef {{definePrefix}}_ENABLE_GZIP
#warning {{definePrefix}}_ENABLE_GZIP has no effect because it is permanently switched ON
#endif
{{/case}}
{{#case "never"}}
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
{{#if isPsychic}}
#define {{definePrefix}}_MAX_URI_HANDLERS {{maxUriHandlers}}
{{/if}}

//
{{#each sources}}
#define {{../definePrefix}}_FILE_{{this.datanameUpperCase}}
{{/each}}

//
{{#each filesByExtension}}
#define {{../definePrefix}}_{{this.extension}}_FILES {{this.count}}
{{/each}}
`;

/**
 * Common data arrays section for gzip/non-gzip variants
 */
const dataArraysSection = (progmem = false) => {
  const memDirective = progmem ? ' PROGMEM' : '';
  return `
{{#switch gzip}}
{{#case "always"}}
  {{#each sources}}
static const uint8_t datagzip_{{this.dataname}}[{{this.lengthGzip}}]${memDirective} = { {{this.bytesGzip}} };
  {{/each}}
{{/case}}
{{#case "never"}}
  {{#each sources}}
static const uint8_t data_{{this.dataname}}[{{this.length}}]${memDirective} = { {{this.bytes}} };
  {{/each}}
{{/case}}
{{#case "compiler"}}
#ifdef {{definePrefix}}_ENABLE_GZIP
  {{#each sources}}
static const uint8_t datagzip_{{this.dataname}}[{{this.lengthGzip}}]${memDirective} = { {{this.bytesGzip}} };
  {{/each}}
#else
  {{#each sources}}
static const uint8_t data_{{this.dataname}}[{{this.length}}]${memDirective} = { {{this.bytes}} };
  {{/each}}
#endif
{{/case}}
{{/switch}}
`;
};

/**
 * Common ETag arrays section
 */
const etagArraysSection = `
{{#switch etag}}
{{#case "always"}}
  {{#each sources}}
static const char etag_{{this.dataname}}[] = "{{this.sha256}}";
  {{/each}}
{{/case}}
{{#case "never"}}
{{/case}}
{{#case "compiler"}}
#ifdef {{definePrefix}}_ENABLE_ETAG
  {{#each sources}}
static const char etag_{{this.dataname}}[] = "{{this.sha256}}";
  {{/each}}
#endif
{{/case}}
{{/switch}}
`;

/**
 * File manifest section - provides runtime introspection of embedded files
 */
const manifestSection = `
// File manifest struct
struct {{definePrefix}}_FileInfo {
  const char* path;
  uint32_t size;
  uint32_t gzipSize;
  const char* etag;
  const char* contentType;
};

// File manifest array
static const {{definePrefix}}_FileInfo {{definePrefix}}_FILES[] = {
{{#each sources}}
  { "{{../basePath}}/{{this.filename}}", {{this.length}}, {{this.gzipSizeForManifest}}, {{this.etagForManifest}}, "{{this.mime}}" },
{{/each}}
};
static const size_t {{definePrefix}}_FILE_COUNT = sizeof({{definePrefix}}_FILES) / sizeof({{definePrefix}}_FILES[0]);
`;

/**
 * Hook section for runtime metrics - weak function that can be overridden by users
 */
const hookSection = `
// File served hook - override with your own implementation
extern "C" void __attribute__((weak)) {{definePrefix}}_onFileServed(const char* path, int statusCode) {}
`;

const psychicTemplate = `
//engine:   PsychicHttpServer
//config:   {{{config}}}
{{#if created }}
//created:  {{now}}
{{/if}}
//
${commonHeaderSection}

//
#include <Arduino.h>
#include <PsychicHttp.h>
#include <PsychicHttpsServer.h>

//
${dataArraysSection(false)}

//
${etagArraysSection}

//
${manifestSection}

//
${hookSection}

//
// Http Handlers
void {{methodName}}(PsychicHttpServer * server) {
{{#each sources}}
//
// {{this.filename}}
  {{#if this.isDefault}}{{#unless ../basePath}}server->defaultEndpoint = {{/unless}}{{/if}}server->on("{{../basePath}}/{{this.filename}}", HTTP_GET, [](PsychicRequest * request, PsychicResponse * response) {

{{#switch ../etag}}
{{#case "always"}}
    if (request->hasHeader("If-None-Match") && request->header("If-None-Match").equals(etag_{{this.dataname}})) {
      response->setCode(304);
      {{../definePrefix}}_onFileServed("{{../basePath}}/{{this.filename}}", 304);
      return response->send();
    }
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
    if (request->hasHeader("If-None-Match") && request->header("If-None-Match").equals(etag_{{this.dataname}})) {
      response->setCode(304);
      {{../definePrefix}}_onFileServed("{{../basePath}}/{{this.filename}}", 304);
      return response->send();
    }
  #endif
{{/case}}
{{/switch}}

    response->setContentType("{{this.mime}}");

{{#switch ../gzip}}
{{#case "always"}}
{{#if this.isGzip}}
    response->addHeader("Content-Encoding", "gzip");
{{/if}}
{{/case}}
{{#case "compiler"}}
  {{#if this.isGzip}}
  #ifdef {{../definePrefix}}_ENABLE_GZIP
    response->addHeader("Content-Encoding", "gzip");
  #endif
  {{/if}}
{{/case}}
{{/switch}}

{{#switch ../etag}}
{{#case "always"}}
{{#this.cacheTime}}
    response->addHeader("Cache-Control", "max-age={{value}}");
{{/this.cacheTime}}
{{^this.cacheTime}}
    response->addHeader("Cache-Control", "no-cache");
{{/this.cacheTime}}
    response->addHeader("ETag", etag_{{this.dataname}});
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
{{#this.cacheTime}}
    response->addHeader("Cache-Control", "max-age={{value}}");
{{/this.cacheTime}}
{{^this.cacheTime}}
    response->addHeader("Cache-Control", "no-cache");
{{/this.cacheTime}}
    response->addHeader("ETag", etag_{{this.dataname}});
  #endif
{{/case}}
{{/switch}}

{{#switch ../gzip}}
{{#case "always"}}
    response->setContent(datagzip_{{this.dataname}}, {{this.lengthGzip}});
{{/case}}
{{#case "never"}}
    response->setContent(data_{{this.dataname}}, {{this.length}});
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_GZIP
    response->setContent(datagzip_{{this.dataname}}, {{this.lengthGzip}});
  #else
    response->setContent(data_{{this.dataname}}, {{this.length}});
  #endif
{{/case}}
{{/switch}}

    {{../definePrefix}}_onFileServed("{{../basePath}}/{{this.filename}}", 200);
    return response->send();
  });
{{#if this.isDefault}}{{#if ../basePath}}
//
// {{this.filename}} (base path route)
  server->on("{{../basePath}}", HTTP_GET, [](PsychicRequest * request, PsychicResponse * response) {

{{#switch ../etag}}
{{#case "always"}}
    if (request->hasHeader("If-None-Match") && request->header("If-None-Match").equals(etag_{{this.dataname}})) {
      response->setCode(304);
      {{../definePrefix}}_onFileServed("{{../basePath}}", 304);
      return response->send();
    }
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
    if (request->hasHeader("If-None-Match") && request->header("If-None-Match").equals(etag_{{this.dataname}})) {
      response->setCode(304);
      {{../definePrefix}}_onFileServed("{{../basePath}}", 304);
      return response->send();
    }
  #endif
{{/case}}
{{/switch}}

    response->setContentType("{{this.mime}}");

{{#switch ../gzip}}
{{#case "always"}}
{{#if this.isGzip}}
    response->addHeader("Content-Encoding", "gzip");
{{/if}}
{{/case}}
{{#case "compiler"}}
  {{#if this.isGzip}}
  #ifdef {{../definePrefix}}_ENABLE_GZIP
    response->addHeader("Content-Encoding", "gzip");
  #endif
  {{/if}}
{{/case}}
{{/switch}}

{{#switch ../etag}}
{{#case "always"}}
{{#this.cacheTime}}
    response->addHeader("Cache-Control", "max-age={{value}}");
{{/this.cacheTime}}
{{^this.cacheTime}}
    response->addHeader("Cache-Control", "no-cache");
{{/this.cacheTime}}
    response->addHeader("ETag", etag_{{this.dataname}});
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
{{#this.cacheTime}}
    response->addHeader("Cache-Control", "max-age={{value}}");
{{/this.cacheTime}}
{{^this.cacheTime}}
    response->addHeader("Cache-Control", "no-cache");
{{/this.cacheTime}}
    response->addHeader("ETag", etag_{{this.dataname}});
  #endif
{{/case}}
{{/switch}}

{{#switch ../gzip}}
{{#case "always"}}
    response->setContent(datagzip_{{this.dataname}}, {{this.lengthGzip}});
{{/case}}
{{#case "never"}}
    response->setContent(data_{{this.dataname}}, {{this.length}});
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_GZIP
    response->setContent(datagzip_{{this.dataname}}, {{this.lengthGzip}});
  #else
    response->setContent(data_{{this.dataname}}, {{this.length}});
  #endif
{{/case}}
{{/switch}}

    {{../definePrefix}}_onFileServed("{{../basePath}}", 200);
    return response->send();
  });
{{/if}}{{/if}}

{{/each}}
{{#if spa}}
{{#with spaSource}}
{{#if ../basePath}}
//
// SPA catch-all: unmatched routes serve {{this.filename}}
  server->on("{{../basePath}}/*", HTTP_GET, [](PsychicRequest * request, PsychicResponse * response) {

{{#switch ../etag}}
{{#case "always"}}
    if (request->hasHeader("If-None-Match") && request->header("If-None-Match").equals(etag_{{this.dataname}})) {
      response->setCode(304);
      {{../definePrefix}}_onFileServed("{{../basePath}}/{{this.filename}}", 304);
      return response->send();
    }
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
    if (request->hasHeader("If-None-Match") && request->header("If-None-Match").equals(etag_{{this.dataname}})) {
      response->setCode(304);
      {{../definePrefix}}_onFileServed("{{../basePath}}/{{this.filename}}", 304);
      return response->send();
    }
  #endif
{{/case}}
{{/switch}}

    response->setContentType("{{this.mime}}");

{{#switch ../gzip}}
{{#case "always"}}
{{#if this.isGzip}}
    response->addHeader("Content-Encoding", "gzip");
{{/if}}
{{/case}}
{{#case "compiler"}}
  {{#if this.isGzip}}
  #ifdef {{../definePrefix}}_ENABLE_GZIP
    response->addHeader("Content-Encoding", "gzip");
  #endif
  {{/if}}
{{/case}}
{{/switch}}

{{#switch ../etag}}
{{#case "always"}}
{{#this.cacheTime}}
    response->addHeader("Cache-Control", "max-age={{value}}");
{{/this.cacheTime}}
{{^this.cacheTime}}
    response->addHeader("Cache-Control", "no-cache");
{{/this.cacheTime}}
    response->addHeader("ETag", etag_{{this.dataname}});
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
{{#this.cacheTime}}
    response->addHeader("Cache-Control", "max-age={{value}}");
{{/this.cacheTime}}
{{^this.cacheTime}}
    response->addHeader("Cache-Control", "no-cache");
{{/this.cacheTime}}
    response->addHeader("ETag", etag_{{this.dataname}});
  #endif
{{/case}}
{{/switch}}

{{#switch ../gzip}}
{{#case "always"}}
    response->setContent(datagzip_{{this.dataname}}, {{this.lengthGzip}});
{{/case}}
{{#case "never"}}
    response->setContent(data_{{this.dataname}}, {{this.length}});
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_GZIP
    response->setContent(datagzip_{{this.dataname}}, {{this.lengthGzip}});
  #else
    response->setContent(data_{{this.dataname}}, {{this.length}});
  #endif
{{/case}}
{{/switch}}

    {{../definePrefix}}_onFileServed("{{../basePath}}/{{this.filename}}", 200);
    return response->send();
  });
{{/if}}
{{/with}}
{{/if}}
}`;

const asyncTemplate = `
//engine:   ESPAsyncWebServer
//config:   {{{config}}}
{{#if created }}
//created:  {{now}}
{{/if}}
//
${commonHeaderSection}

//
#include <Arduino.h>
#include <ESPAsyncWebServer.h>

//
${dataArraysSection(true)}

//
${etagArraysSection}

//
${manifestSection}

//
${hookSection}

//
// Http Handlers
void {{methodName}}(AsyncWebServer * server) {
{{#each sources}}
//
// {{this.filename}}
  server->on("{{../basePath}}/{{this.filename}}", HTTP_GET, [](AsyncWebServerRequest * request) {

{{#switch ../etag}}
{{#case "always"}}
    const AsyncWebHeader* h = request->getHeader("If-None-Match");
    if (h && h->value().equals(etag_{{this.dataname}})) {
      {{../definePrefix}}_onFileServed("{{../basePath}}/{{this.filename}}", 304);
      request->send(304);
      return;
    }
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
    const AsyncWebHeader* h = request->getHeader("If-None-Match");
    if (h && h->value().equals(etag_{{this.dataname}})) {
      {{../definePrefix}}_onFileServed("{{../basePath}}/{{this.filename}}", 304);
      request->send(304);
      return;
    }
  #endif
{{/case}}
{{/switch}}

{{#switch ../gzip}}
{{#case "always"}}
    AsyncWebServerResponse *response = request->beginResponse(200, "{{this.mime}}", datagzip_{{this.dataname}}, {{this.lengthGzip}});
    {{#if this.isGzip}}
    response->addHeader("Content-Encoding", "gzip");
    {{/if}}
{{/case}}
{{#case "never"}}
    AsyncWebServerResponse *response = request->beginResponse(200, "{{this.mime}}", data_{{this.dataname}}, {{this.length}});
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_GZIP
    AsyncWebServerResponse *response = request->beginResponse(200, "{{this.mime}}", datagzip_{{this.dataname}}, {{this.lengthGzip}});
    {{#if this.isGzip}}
    response->addHeader("Content-Encoding", "gzip");
    {{/if}}
  #else
    AsyncWebServerResponse *response = request->beginResponse(200, "{{this.mime}}", data_{{this.dataname}}, {{this.length}});
  #endif
{{/case}}
{{/switch}}

{{#switch ../etag}}
{{#case "always"}}
{{#this.cacheTime}}
    response->addHeader("Cache-Control", "max-age={{value}}");
{{/this.cacheTime}}
{{^this.cacheTime}}
    response->addHeader("Cache-Control", "no-cache");
{{/this.cacheTime}}
    response->addHeader("ETag", etag_{{this.dataname}});
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
{{#this.cacheTime}}
    response->addHeader("Cache-Control", "max-age={{value}}");
{{/this.cacheTime}}
{{^this.cacheTime}}
    response->addHeader("Cache-Control", "no-cache");
{{/this.cacheTime}}
    response->addHeader("ETag", etag_{{this.dataname}});
  #endif
{{/case}}
{{/switch}}

    {{../definePrefix}}_onFileServed("{{../basePath}}/{{this.filename}}", 200);
    request->send(response);
  });
  {{#if this.isDefault}}
  server->on("{{#if ../basePath}}{{../basePath}}{{else}}/{{/if}}", HTTP_GET, [](AsyncWebServerRequest * request) {

{{#switch ../etag}}
{{#case "always"}}
    const AsyncWebHeader* h = request->getHeader("If-None-Match");
    if (h && h->value().equals(etag_{{this.dataname}})) {
      {{../definePrefix}}_onFileServed("{{#if ../basePath}}{{../basePath}}{{else}}/{{/if}}", 304);
      request->send(304);
      return;
    }
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
    const AsyncWebHeader* h = request->getHeader("If-None-Match");
    if (h && h->value().equals(etag_{{this.dataname}})) {
      {{../definePrefix}}_onFileServed("{{#if ../basePath}}{{../basePath}}{{else}}/{{/if}}", 304);
      request->send(304);
      return;
    }
  #endif
{{/case}}
{{/switch}}

{{#switch ../gzip}}
{{#case "always"}}
    AsyncWebServerResponse *response = request->beginResponse(200, "{{this.mime}}", datagzip_{{this.dataname}}, {{this.lengthGzip}});
    {{#if this.isGzip}}
    response->addHeader("Content-Encoding", "gzip");
    {{/if}}
{{/case}}
{{#case "never"}}
    AsyncWebServerResponse *response = request->beginResponse(200, "{{this.mime}}", data_{{this.dataname}}, {{this.length}});
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_GZIP
    AsyncWebServerResponse *response = request->beginResponse(200, "{{this.mime}}", datagzip_{{this.dataname}}, {{this.lengthGzip}});
    {{#if this.isGzip}}
    response->addHeader("Content-Encoding", "gzip");
    {{/if}}
  #else
    AsyncWebServerResponse *response = request->beginResponse(200, "{{this.mime}}", data_{{this.dataname}}, {{this.length}});
  #endif
{{/case}}
{{/switch}}

{{#switch ../etag}}
{{#case "always"}}
{{#this.cacheTime}}
    response->addHeader("Cache-Control", "max-age={{value}}");
{{/this.cacheTime}}
{{^this.cacheTime}}
    response->addHeader("Cache-Control", "no-cache");
{{/this.cacheTime}}
    response->addHeader("ETag", etag_{{this.dataname}});
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
{{#this.cacheTime}}
    response->addHeader("Cache-Control", "max-age={{value}}");
{{/this.cacheTime}}
{{^this.cacheTime}}
    response->addHeader("Cache-Control", "no-cache");
{{/this.cacheTime}}
    response->addHeader("ETag", etag_{{this.dataname}});
  #endif
{{/case}}
{{/switch}}

    {{../definePrefix}}_onFileServed("{{#if ../basePath}}{{../basePath}}{{else}}/{{/if}}", 200);
    request->send(response);
  });
  {{/if}}

{{/each}}
{{#if spa}}
{{#with spaSource}}
//
// SPA catch-all: unmatched routes serve {{this.filename}}
  server->onNotFound([](AsyncWebServerRequest * request) {
    if (request->method() != HTTP_GET) { request->send(404); return; }
{{#if ../basePath}}
    if (!request->url().startsWith("{{../basePath}}/") && request->url() != "{{../basePath}}") { request->send(404); return; }
{{/if}}

{{#switch ../etag}}
{{#case "always"}}
    const AsyncWebHeader* h = request->getHeader("If-None-Match");
    if (h && h->value().equals(etag_{{this.dataname}})) {
      {{../definePrefix}}_onFileServed("{{../basePath}}/{{this.filename}}", 304);
      request->send(304);
      return;
    }
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
    const AsyncWebHeader* h = request->getHeader("If-None-Match");
    if (h && h->value().equals(etag_{{this.dataname}})) {
      {{../definePrefix}}_onFileServed("{{../basePath}}/{{this.filename}}", 304);
      request->send(304);
      return;
    }
  #endif
{{/case}}
{{/switch}}

{{#switch ../gzip}}
{{#case "always"}}
    AsyncWebServerResponse *response = request->beginResponse(200, "{{this.mime}}", datagzip_{{this.dataname}}, {{this.lengthGzip}});
    {{#if this.isGzip}}
    response->addHeader("Content-Encoding", "gzip");
    {{/if}}
{{/case}}
{{#case "never"}}
    AsyncWebServerResponse *response = request->beginResponse(200, "{{this.mime}}", data_{{this.dataname}}, {{this.length}});
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_GZIP
    AsyncWebServerResponse *response = request->beginResponse(200, "{{this.mime}}", datagzip_{{this.dataname}}, {{this.lengthGzip}});
    {{#if this.isGzip}}
    response->addHeader("Content-Encoding", "gzip");
    {{/if}}
  #else
    AsyncWebServerResponse *response = request->beginResponse(200, "{{this.mime}}", data_{{this.dataname}}, {{this.length}});
  #endif
{{/case}}
{{/switch}}

{{#switch ../etag}}
{{#case "always"}}
{{#this.cacheTime}}
    response->addHeader("Cache-Control", "max-age={{value}}");
{{/this.cacheTime}}
{{^this.cacheTime}}
    response->addHeader("Cache-Control", "no-cache");
{{/this.cacheTime}}
    response->addHeader("ETag", etag_{{this.dataname}});
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
{{#this.cacheTime}}
    response->addHeader("Cache-Control", "max-age={{value}}");
{{/this.cacheTime}}
{{^this.cacheTime}}
    response->addHeader("Cache-Control", "no-cache");
{{/this.cacheTime}}
    response->addHeader("ETag", etag_{{this.dataname}});
  #endif
{{/case}}
{{/switch}}

    {{../definePrefix}}_onFileServed("{{../basePath}}/{{this.filename}}", 200);
    request->send(response);
  });
{{/with}}
{{/if}}
}`;

const webserverTemplate = `
//engine:   Arduino WebServer
//config:   {{{config}}}
{{#if created }}
//created:  {{now}}
{{/if}}
//
${commonHeaderSection}

//
#include <Arduino.h>
#include <WebServer.h>

//
${dataArraysSection(true)}

//
${etagArraysSection}

//
${manifestSection}

//
${hookSection}

//
// Chunked send helper for PROGMEM data
static inline void {{definePrefix}}_sendChunked(WebServer * server, const uint8_t * data, size_t len) {
  const size_t chunkSize = 4096;
  for (size_t offset = 0; offset < len; offset += chunkSize) {
    size_t remaining = len - offset;
    size_t toSend = remaining < chunkSize ? remaining : chunkSize;
    server->sendContent_P((const char *)(data + offset), toSend);
  }
}

//
// Http Handlers
void {{methodName}}(WebServer * server) {
{{#each sources}}
//
// {{this.filename}}
  server->on("{{../basePath}}/{{this.filename}}", HTTP_GET, [server]() {

{{#switch ../etag}}
{{#case "always"}}
    if (server->hasHeader("If-None-Match") && server->header("If-None-Match").equals(etag_{{this.dataname}})) {
      server->send(304);
      {{../definePrefix}}_onFileServed("{{../basePath}}/{{this.filename}}", 304);
      return;
    }
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
    if (server->hasHeader("If-None-Match") && server->header("If-None-Match").equals(etag_{{this.dataname}})) {
      server->send(304);
      {{../definePrefix}}_onFileServed("{{../basePath}}/{{this.filename}}", 304);
      return;
    }
  #endif
{{/case}}
{{/switch}}

{{#switch ../etag}}
{{#case "always"}}
{{#this.cacheTime}}
    server->sendHeader("Cache-Control", "max-age={{value}}");
{{/this.cacheTime}}
{{^this.cacheTime}}
    server->sendHeader("Cache-Control", "no-cache");
{{/this.cacheTime}}
    server->sendHeader("ETag", etag_{{this.dataname}});
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
{{#this.cacheTime}}
    server->sendHeader("Cache-Control", "max-age={{value}}");
{{/this.cacheTime}}
{{^this.cacheTime}}
    server->sendHeader("Cache-Control", "no-cache");
{{/this.cacheTime}}
    server->sendHeader("ETag", etag_{{this.dataname}});
  #endif
{{/case}}
{{/switch}}

{{#switch ../gzip}}
{{#case "always"}}
{{#if this.isGzip}}
    server->sendHeader("Content-Encoding", "gzip");
{{/if}}
    server->setContentLength({{this.lengthGzip}});
    server->send(200, "{{this.mime}}", "");
    {{../definePrefix}}_sendChunked(server, datagzip_{{this.dataname}}, {{this.lengthGzip}});
{{/case}}
{{#case "never"}}
    server->setContentLength({{this.length}});
    server->send(200, "{{this.mime}}", "");
    {{../definePrefix}}_sendChunked(server, data_{{this.dataname}}, {{this.length}});
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_GZIP
{{#if this.isGzip}}
    server->sendHeader("Content-Encoding", "gzip");
{{/if}}
    server->setContentLength({{this.lengthGzip}});
    server->send(200, "{{this.mime}}", "");
    {{../definePrefix}}_sendChunked(server, datagzip_{{this.dataname}}, {{this.lengthGzip}});
  #else
    server->setContentLength({{this.length}});
    server->send(200, "{{this.mime}}", "");
    {{../definePrefix}}_sendChunked(server, data_{{this.dataname}}, {{this.length}});
  #endif
{{/case}}
{{/switch}}

    {{../definePrefix}}_onFileServed("{{../basePath}}/{{this.filename}}", 200);
  });
  {{#if this.isDefault}}
  server->on("{{#if ../basePath}}{{../basePath}}{{else}}/{{/if}}", HTTP_GET, [server]() {

{{#switch ../etag}}
{{#case "always"}}
    if (server->hasHeader("If-None-Match") && server->header("If-None-Match").equals(etag_{{this.dataname}})) {
      server->send(304);
      {{../definePrefix}}_onFileServed("{{#if ../basePath}}{{../basePath}}{{else}}/{{/if}}", 304);
      return;
    }
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
    if (server->hasHeader("If-None-Match") && server->header("If-None-Match").equals(etag_{{this.dataname}})) {
      server->send(304);
      {{../definePrefix}}_onFileServed("{{#if ../basePath}}{{../basePath}}{{else}}/{{/if}}", 304);
      return;
    }
  #endif
{{/case}}
{{/switch}}

{{#switch ../etag}}
{{#case "always"}}
{{#this.cacheTime}}
    server->sendHeader("Cache-Control", "max-age={{value}}");
{{/this.cacheTime}}
{{^this.cacheTime}}
    server->sendHeader("Cache-Control", "no-cache");
{{/this.cacheTime}}
    server->sendHeader("ETag", etag_{{this.dataname}});
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
{{#this.cacheTime}}
    server->sendHeader("Cache-Control", "max-age={{value}}");
{{/this.cacheTime}}
{{^this.cacheTime}}
    server->sendHeader("Cache-Control", "no-cache");
{{/this.cacheTime}}
    server->sendHeader("ETag", etag_{{this.dataname}});
  #endif
{{/case}}
{{/switch}}

{{#switch ../gzip}}
{{#case "always"}}
{{#if this.isGzip}}
    server->sendHeader("Content-Encoding", "gzip");
{{/if}}
    server->setContentLength({{this.lengthGzip}});
    server->send(200, "{{this.mime}}", "");
    {{../definePrefix}}_sendChunked(server, datagzip_{{this.dataname}}, {{this.lengthGzip}});
{{/case}}
{{#case "never"}}
    server->setContentLength({{this.length}});
    server->send(200, "{{this.mime}}", "");
    {{../definePrefix}}_sendChunked(server, data_{{this.dataname}}, {{this.length}});
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_GZIP
{{#if this.isGzip}}
    server->sendHeader("Content-Encoding", "gzip");
{{/if}}
    server->setContentLength({{this.lengthGzip}});
    server->send(200, "{{this.mime}}", "");
    {{../definePrefix}}_sendChunked(server, datagzip_{{this.dataname}}, {{this.lengthGzip}});
  #else
    server->setContentLength({{this.length}});
    server->send(200, "{{this.mime}}", "");
    {{../definePrefix}}_sendChunked(server, data_{{this.dataname}}, {{this.length}});
  #endif
{{/case}}
{{/switch}}

    {{../definePrefix}}_onFileServed("{{#if ../basePath}}{{../basePath}}{{else}}/{{/if}}", 200);
  });
  {{/if}}

{{/each}}
{{#if spa}}
{{#with spaSource}}
//
// SPA catch-all: unmatched routes serve {{this.filename}}
  server->onNotFound([server]() {
    if (server->method() != HTTP_GET) { server->send(404, "text/plain", "Not found"); return; }
{{#if ../basePath}}
    if (!server->uri().startsWith("{{../basePath}}/") && server->uri() != "{{../basePath}}") { server->send(404, "text/plain", "Not found"); return; }
{{/if}}

{{#switch ../etag}}
{{#case "always"}}
    if (server->hasHeader("If-None-Match") && server->header("If-None-Match").equals(etag_{{this.dataname}})) {
      server->send(304);
      {{../definePrefix}}_onFileServed("{{../basePath}}/{{this.filename}}", 304);
      return;
    }
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
    if (server->hasHeader("If-None-Match") && server->header("If-None-Match").equals(etag_{{this.dataname}})) {
      server->send(304);
      {{../definePrefix}}_onFileServed("{{../basePath}}/{{this.filename}}", 304);
      return;
    }
  #endif
{{/case}}
{{/switch}}

{{#switch ../etag}}
{{#case "always"}}
{{#this.cacheTime}}
    server->sendHeader("Cache-Control", "max-age={{value}}");
{{/this.cacheTime}}
{{^this.cacheTime}}
    server->sendHeader("Cache-Control", "no-cache");
{{/this.cacheTime}}
    server->sendHeader("ETag", etag_{{this.dataname}});
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
{{#this.cacheTime}}
    server->sendHeader("Cache-Control", "max-age={{value}}");
{{/this.cacheTime}}
{{^this.cacheTime}}
    server->sendHeader("Cache-Control", "no-cache");
{{/this.cacheTime}}
    server->sendHeader("ETag", etag_{{this.dataname}});
  #endif
{{/case}}
{{/switch}}

{{#switch ../gzip}}
{{#case "always"}}
{{#if this.isGzip}}
    server->sendHeader("Content-Encoding", "gzip");
{{/if}}
    server->setContentLength({{this.lengthGzip}});
    server->send(200, "{{this.mime}}", "");
    {{../definePrefix}}_sendChunked(server, datagzip_{{this.dataname}}, {{this.lengthGzip}});
{{/case}}
{{#case "never"}}
    server->setContentLength({{this.length}});
    server->send(200, "{{this.mime}}", "");
    {{../definePrefix}}_sendChunked(server, data_{{this.dataname}}, {{this.length}});
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_GZIP
{{#if this.isGzip}}
    server->sendHeader("Content-Encoding", "gzip");
{{/if}}
    server->setContentLength({{this.lengthGzip}});
    server->send(200, "{{this.mime}}", "");
    {{../definePrefix}}_sendChunked(server, datagzip_{{this.dataname}}, {{this.lengthGzip}});
  #else
    server->setContentLength({{this.length}});
    server->send(200, "{{this.mime}}", "");
    {{../definePrefix}}_sendChunked(server, data_{{this.dataname}}, {{this.length}});
  #endif
{{/case}}
{{/switch}}

    {{../definePrefix}}_onFileServed("{{../basePath}}/{{this.filename}}", 200);
  });
{{/with}}
{{/if}}
}`;

const getTemplate = (engine: string): string => {
  switch (engine) {
    case 'psychic':
      return psychicTemplate;
    case 'async':
      return asyncTemplate;
    case 'espidf':
      return espidfTemplate;
    case 'webserver':
      return webserverTemplate;
    default:
      throw new Error(`Unknown engine: ${engine}`);
  }
};

/**
 * Transform a source entry into template data with byte arrays
 */
/**
 * Convert a Buffer to a comma-separated byte string without creating an intermediate array
 */
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
  // Manifest-specific fields
  gzipSizeForManifest: s.isGzip ? s.contentGzip.length : 0,
  etagForManifest: etag === 'never' ? 'NULL' : `etag_${s.dataname}`,
  cacheTime: effectiveCacheTime ? { value: effectiveCacheTime } : undefined
});

/**
 * Post-process generated C++ code to clean up formatting
 */
const postProcessCppCode = (code: string): string =>
  code
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => (line === '//' ? '' : line))
    .join('\n')
    .replaceAll(/\n{2,}/g, '\n');

/**
 * Create Handlebars helpers with switch/case support
 */
const createHandlebarsHelpers = () => {
  let switchValue: string;
  return {
    ifeq: function (a: string, b: string, options: HelperOptions) {
      if (a === b) return options.fn(this);
      return options.inverse(this);
    },
    switch: function (value: string, options: HelperOptions) {
      switchValue = value;
      return options.fn(this);
    },
    case: function (value: string, options: HelperOptions) {
      if (value === switchValue) return options.fn(this);
      return options.inverse(this);
    }
  };
};

/**
 * Generate C++ header file code from sources and file extension groups
 */
export const getCppCode = (
  sources: CppCodeSources,
  filesByExtension: ExtensionGroups,
  options: ICopyFilesArguments
): string => {
  const template = handlebarsCompile(getTemplate(options.engine));
  const transformedSources = sources.map((s) => {
    const effectiveCacheTime =
      s.mime === 'text/html'
        ? (options.cachetimeHtml ?? options.cachetime)
        : (options.cachetimeAssets ?? options.cachetime);
    return transformSourceToTemplateData(s, options.etag, effectiveCacheTime);
  });
  const spaSource = options.spa ? transformedSources.find((s) => s.isDefault) : undefined;
  const templateData = {
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

  const rawCode = template(templateData, { helpers: createHandlebarsHelpers() });
  return postProcessCppCode(rawCode);
};
