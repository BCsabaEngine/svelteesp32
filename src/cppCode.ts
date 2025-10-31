import { compile as handlebarsCompile, HelperOptions } from 'handlebars';

import { cmdLine } from './commandLine';
import { espidfTemplate } from './cppCodeEspIdf';

export type CppCodeSource = {
  filename: string;
  dataname: string;
  datanameUpperCase: string;
  mime: string;
  content: Buffer;
  contentGzip: Buffer;
  isGzip: boolean;
  md5: string;
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
`;

/**
 * Common data arrays section for gzip/non-gzip variants
 */
const dataArraysSection = (progmem = false) => {
  const memDirective = progmem ? ' PROGMEM' : '';
  return `
{{#switch gzip}}
{{#case "true"}}
  {{#each sources}}
const uint8_t datagzip_{{this.dataname}}[{{this.lengthGzip}}]${memDirective} = { {{this.bytesGzip}} };
  {{/each}}
{{/case}}
{{#case "false"}}
  {{#each sources}}
const uint8_t data_{{this.dataname}}[{{this.length}}]${memDirective} = { {{this.bytes}} };
  {{/each}}
{{/case}}
{{#case "compiler"}}
#ifdef {{definePrefix}}_ENABLE_GZIP
  {{#each sources}}
const uint8_t datagzip_{{this.dataname}}[{{this.lengthGzip}}]${memDirective} = { {{this.bytesGzip}} };
  {{/each}}
#else
  {{#each sources}}
const uint8_t data_{{this.dataname}}[{{this.length}}]${memDirective} = { {{this.bytes}} };
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
`;

const psychicTemplate = `
//engine:   PsychicHttpServer
//cmdline:  {{{commandLine}}}
//You should use server.config.max_uri_handlers = {{fileCount}}; or higher value to proper handles all files
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
// Http Handlers
void {{methodName}}(PsychicHttpServer * server) {
{{#each sources}}
//
// {{this.filename}}
  {{#if this.isDefault}}server->defaultEndpoint = {{/if}}server->on("/{{this.filename}}", HTTP_GET, [](PsychicRequest * request) {

{{#switch ../etag}}
{{#case "true"}}
    if (request->hasHeader("If-None-Match") && request->header("If-None-Match").equals(etag_{{this.dataname}})) {
      PsychicResponse response304(request);
      response304.setCode(304);
      return response304.send();
    }
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
    if (request->hasHeader("If-None-Match") && request->header("If-None-Match").equals(etag_{{this.dataname}})) {
      PsychicResponse response304(request);
      response304.setCode(304);
      return response304.send();
    }
  #endif
{{/case}}
{{/switch}}

    PsychicResponse response(request);
    response.setContentType("{{this.mime}}");

{{#switch ../gzip}}
{{#case "true"}}
{{#if this.isGzip}}
    response.addHeader("Content-Encoding", "gzip");
{{/if}}
{{/case}}
{{#case "compiler"}}
  {{#if this.isGzip}}
  #ifdef {{../definePrefix}}_ENABLE_GZIP
    response.addHeader("Content-Encoding", "gzip");
  #endif 
  {{/if}}
{{/case}}
{{/switch}}

{{#switch ../etag}}
{{#case "true"}}
{{#../cacheTime}}
    response.addHeader("Cache-Control", "max-age={{value}}");
{{/../cacheTime}}
{{^../cacheTime}}
    response.addHeader("Cache-Control", "no-cache");
{{/../cacheTime}}
    response.addHeader("ETag", etag_{{this.dataname}});
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
{{#../cacheTime}}
    response.addHeader("Cache-Control", "max-age={{value}}");
{{/../cacheTime}}
{{^../cacheTime}}
    response.addHeader("Cache-Control", "no-cache");
{{/../cacheTime}}
    response.addHeader("ETag", etag_{{this.dataname}});
  #endif 
{{/case}}
{{/switch}}

{{#switch ../gzip}}
{{#case "true"}}
    response.setContent(datagzip_{{this.dataname}}, {{this.lengthGzip}});
{{/case}}
{{#case "false"}}
    response.setContent(data_{{this.dataname}}, {{this.length}});
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_GZIP
    response.setContent(datagzip_{{this.dataname}}, {{this.lengthGzip}});
  #else
    response.setContent(data_{{this.dataname}}, {{this.length}});
  #endif 
{{/case}}
{{/switch}}

    return response.send();
  });

{{/each}}
}`;

const psychic2Template = `
//engine:   PsychicHttpServerV2
//cmdline:  {{{commandLine}}}
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
// Http Handlers
void {{methodName}}(PsychicHttpServer * server) {
{{#each sources}}
//
// {{this.filename}}
  {{#if this.isDefault}}server->defaultEndpoint = {{/if}}server->on("/{{this.filename}}", HTTP_GET, [](PsychicRequest * request, PsychicResponse * response) {

{{#switch ../etag}}
{{#case "true"}}
    if (request->hasHeader("If-None-Match") && request->header("If-None-Match").equals(etag_{{this.dataname}})) {
      response->setCode(304);
      return response->send();
    }
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
    if (request->hasHeader("If-None-Match") && request->header("If-None-Match").equals(etag_{{this.dataname}})) {
      response->setCode(304);
      return response->send();
    }
  #endif
{{/case}}
{{/switch}}

    response->setContentType("{{this.mime}}");

{{#switch ../gzip}}
{{#case "true"}}
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
{{#case "true"}}
{{#../cacheTime}}
    response->addHeader("Cache-Control", "max-age={{value}}");
{{/../cacheTime}}
{{^../cacheTime}}
    response->addHeader("Cache-Control", "no-cache");
{{/../cacheTime}}
    response->addHeader("ETag", etag_{{this.dataname}});
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
{{#../cacheTime}}
    response->addHeader("Cache-Control", "max-age={{value}}");
{{/../cacheTime}}
{{^../cacheTime}}
    response->addHeader("Cache-Control", "no-cache");
{{/../cacheTime}}
    response->addHeader("ETag", etag_{{this.dataname}});
  #endif 
{{/case}}
{{/switch}}

{{#switch ../gzip}}
{{#case "true"}}
    response->setContent(datagzip_{{this.dataname}}, {{this.lengthGzip}});
{{/case}}
{{#case "false"}}
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

    return response->send();
  });

{{/each}}
}`;

const asyncTemplate = `
//engine:   ESPAsyncWebServer
//cmdline:  {{{commandLine}}}
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
// Http Handlers
void {{methodName}}(AsyncWebServer * server) {
{{#each sources}}
//
// {{this.filename}}
  server->on("/{{this.filename}}", HTTP_GET, [](AsyncWebServerRequest * request) {

{{#switch ../etag}}
{{#case "true"}}
    const AsyncWebHeader* h = request->getHeader("If-None-Match");
    if (h && h->value().equals(etag_{{this.dataname}})) {
      request->send(304);
      return;
    }
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
    const AsyncWebHeader* h = request->getHeader("If-None-Match");
    if (h && h->value().equals(etag_{{this.dataname}})) {
      request->send(304);
      return;
    }
  #endif
{{/case}}
{{/switch}}

{{#switch ../gzip}}
{{#case "true"}}
    AsyncWebServerResponse *response = request->beginResponse(200, "{{this.mime}}", datagzip_{{this.dataname}}, {{this.lengthGzip}});
    {{#if this.isGzip}}
    response->addHeader("Content-Encoding", "gzip");
    {{/if}}
{{/case}}
{{#case "false"}}
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
{{#case "true"}}
{{#../cacheTime}}
    response->addHeader("Cache-Control", "max-age={{value}}");
{{/../cacheTime}}
{{^../cacheTime}}
    response->addHeader("Cache-Control", "no-cache");
{{/../cacheTime}}
    response->addHeader("ETag", etag_{{this.dataname}});
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
{{#../cacheTime}}
    response->addHeader("Cache-Control", "max-age={{value}}");
{{/../cacheTime}}
{{^../cacheTime}}
    response->addHeader("Cache-Control", "no-cache");
{{/../cacheTime}}
    response->addHeader("ETag", etag_{{this.dataname}});
  #endif
{{/case}}
{{/switch}}

    request->send(response);
  });
  {{#if this.isDefault}}
  server->on("/", HTTP_GET, [](AsyncWebServerRequest * request) {

{{#switch ../etag}}
{{#case "true"}}
    const AsyncWebHeader* h = request->getHeader("If-None-Match");
    if (h && h->value().equals(etag_{{this.dataname}})) {
      request->send(304);
      return;
    }
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
    const AsyncWebHeader* h = request->getHeader("If-None-Match");
    if (h && h->value().equals(etag_{{this.dataname}})) {
      request->send(304);
      return;
    }
  #endif
{{/case}}
{{/switch}}

{{#switch ../gzip}}
{{#case "true"}}
    AsyncWebServerResponse *response = request->beginResponse(200, "{{this.mime}}", datagzip_{{this.dataname}}, {{this.lengthGzip}});
    {{#if this.isGzip}}
    response->addHeader("Content-Encoding", "gzip");
    {{/if}}
{{/case}}
{{#case "false"}}
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
{{#case "true"}}
{{#../cacheTime}}
    response->addHeader("Cache-Control", "max-age={{value}}");
{{/../cacheTime}}
{{^../cacheTime}}
    response->addHeader("Cache-Control", "no-cache");
{{/../cacheTime}}
    response->addHeader("ETag", etag_{{this.dataname}});
{{/case}}
{{#case "compiler"}}
  #ifdef {{../definePrefix}}_ENABLE_ETAG
{{#../cacheTime}}
    response->addHeader("Cache-Control", "max-age={{value}}");
{{/../cacheTime}}
{{^../cacheTime}}
    response->addHeader("Cache-Control", "no-cache");
{{/../cacheTime}}
    response->addHeader("ETag", etag_{{this.dataname}});
  #endif
{{/case}}
{{/switch}}

    request->send(response);
  });
  {{/if}}

{{/each}}
}`;

const getTemplate = (engine: string): string => {
  switch (engine) {
    case 'psychic':
      return psychicTemplate;
    case 'psychic2':
      return psychic2Template;
    case 'espidf':
      return espidfTemplate;
    default:
      return asyncTemplate;
  }
};

/**
 * Transform a source entry into template data with byte arrays
 */
const transformSourceToTemplateData = (s: CppCodeSource) => ({
  ...s,
  length: s.content.length,
  bytes: [...s.content].map((v) => `${v.toString(10)}`).join(','),
  lengthGzip: s.contentGzip.length,
  bytesGzip: [...s.contentGzip].map((v) => `${v.toString(10)}`).join(','),
  isDefault: s.filename.startsWith('index.htm')
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
    .replace(/\\n{2}/, '\n');

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
export const getCppCode = (sources: CppCodeSources, filesByExtension: ExtensionGroups): string => {
  const template = handlebarsCompile(getTemplate(cmdLine.engine));
  const templateData = {
    commandLine: process.argv.slice(2).join(' '),
    now: `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
    fileCount: sources.length.toString(),
    fileSize: sources.reduce((previous, current) => previous + current.content.length, 0).toString(),
    fileGzipSize: sources.reduce((previous, current) => previous + current.contentGzip.length, 0).toString(),
    sources: sources.map((s) => transformSourceToTemplateData(s)),
    filesByExtension,
    etag: cmdLine.etag,
    gzip: cmdLine.gzip,
    created: cmdLine.created,
    version: cmdLine.version,
    methodName: cmdLine.espmethod,
    cacheTime: cmdLine.cachetime ? { value: cmdLine.cachetime } : undefined,
    definePrefix: cmdLine.define
  };

  const rawCode = template(templateData, { helpers: createHandlebarsHelpers() });
  return postProcessCppCode(rawCode);
};
