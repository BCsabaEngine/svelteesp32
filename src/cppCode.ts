import { compile as handlebarsCompile, HelperOptions } from 'handlebars';

import { cmdLine } from './commandLine';

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

const psychicTemplate = `
//engine:   PsychicHttpServer
//cmdline:  {{{commandLine}}}
{{#if created }}
//created:  {{now}}
{{/if}}

{{#ifeq etag "true" }}
#define {{definePrefix}}_ENABLE_ETAG
{{/ifeq}}
{{#ifeq etag "false" }}
#undef {{definePrefix}}_ENABLE_ETAG
{{/ifeq}}
{{#ifeq gzip "true" }}
#define {{definePrefix}}_ENABLE_GZIP
{{/ifeq}}
{{#ifeq gzip "false" }}
#undef {{definePrefix}}_ENABLE_GZIP
{{/ifeq}}

{{#if version }}
#define {{definePrefix}}_VERSION "{{version}}"
{{/if}}
#define {{definePrefix}}_COUNT {{fileCount}}
#define {{definePrefix}}_SIZE {{fileSize}}
#define {{definePrefix}}_SIZE_GZIP {{fileGzipSize}}

{{#each sources}}
#define {{../definePrefix}}_FILE_{{this.datanameUpperCase}}
{{/each}}

{{#each filesByExtension}}
#define {{../definePrefix}}_{{this.extension}}_FILES {{this.count}}
{{/each}}

#include <Arduino.h>
#include <PsychicHttp.h>
#include <PsychicHttpsServer.h>

#ifdef {{definePrefix}}_ENABLE_GZIP
{{#each sources}}
const uint8_t datagz_{{this.dataname}}[{{this.lengthGzip}}] = { {{this.bytesGzip}} };
{{/each}}
#else
{{#each sources}}
const uint8_t data_{{this.dataname}}[{{this.length}}] = { {{this.bytes}} };
{{/each}}
#endif 

#ifdef {{definePrefix}}_ENABLE_ETAG
{{#each sources}}
const char * etag_{{this.dataname}} = "{{this.md5}}";
{{/each}}
#endif 

void {{methodName}}(PsychicHttpServer * server) {
{{#each sources}}
  {{#if this.isDefault}}server->defaultEndpoint = {{/if}}server->on("/{{this.filename}}", HTTP_GET, [](PsychicRequest * request) {
#ifdef {{../definePrefix}}_ENABLE_ETAG
    if (request->hasHeader("If-None-Match") && request->header("If-None-Match") == String(etag_{{this.dataname}})) {
      PsychicResponse response304(request);
      response304.setCode(304);
      return response304.send();
    }
#endif 
    PsychicResponse response(request);
    response.setContentType("{{this.mime}}");
#ifdef {{../definePrefix}}_ENABLE_GZIP
    {{#if this.isGzip}}
    response.addHeader("Content-Encoding", "gzip");
    {{/if}}
#endif 
#ifdef {{../definePrefix}}_ENABLE_ETAG
    response.addHeader("ETag", etag_{{this.dataname}});
#endif 
#ifdef {{../definePrefix}}_ENABLE_GZIP
    response.setContent(datagz_{{this.dataname}}, {{this.lengthGzip}});
#else
    response.setContent(data_{{this.dataname}}, {{this.length}});
#endif 
    return response.send();
  });

{{/each}}
}`;

const asyncTemplate = `
//engine:   ESPAsyncWebServer
//cmdline:  {{{commandLine}}}
{{#if created }}
//created:  {{now}}
{{/if}}

{{#ifeq etag "true" }}
#define {{definePrefix}}_ENABLE_ETAG
{{/ifeq}}
{{#ifeq etag "false" }}
#undef {{definePrefix}}_ENABLE_ETAG
{{/ifeq}}
{{#ifeq gzip "true" }}
#define {{definePrefix}}_ENABLE_GZIP
{{/ifeq}}
{{#ifeq gzip "false" }}
#undef {{definePrefix}}_ENABLE_GZIP
{{/ifeq}}

{{#if version }}
#define {{definePrefix}}_VERSION "{{version}}"
{{/if}}
#define {{definePrefix}}_COUNT {{fileCount}}
#define {{definePrefix}}_SIZE {{fileSize}}
#define {{definePrefix}}_SIZE_GZIP {{fileGzipSize}}

{{#each sources}}
#define {{../definePrefix}}_FILE_{{this.datanameUpperCase}}
{{/each}}

{{#each filesByExtension}}
#define {{../definePrefix}}_{{this.extension}}_FILES {{this.count}}
{{/each}}

#include <Arduino.h>
#include <ESPAsyncWebServer.h>

#ifdef {{definePrefix}}_ENABLE_GZIP
{{#each sources}}
const uint8_t datagz_{{this.dataname}}[{{this.lengthGzip}}] PROGMEM = { {{this.bytesGzip}} };
{{/each}}
#else
{{#each sources}}
const uint8_t data_{{this.dataname}}[{{this.length}}] PROGMEM = { {{this.bytes}} };
{{/each}}
#endif 

#ifdef {{definePrefix}}_ENABLE_ETAG
{{#each sources}}
const char * etag_{{this.dataname}} = "{{this.md5}}";
{{/each}}
#endif 

void {{methodName}}(AsyncWebServer * server) {
{{#each sources}}
  ArRequestHandlerFunction func_{{this.dataname}} = [](AsyncWebServerRequest * request) {
#ifdef {{../definePrefix}}_ENABLE_ETAG
    if (request->hasHeader("If-None-Match") && request->getHeader("If-None-Match")->value() == String(etag_{{this.dataname}})) {
      request->send(304);
      return;
    }
#endif
#ifdef {{../definePrefix}}_ENABLE_GZIP
    AsyncWebServerResponse *response = request->beginResponse_P(200, "{{this.mime}}", datagz_{{this.dataname}}, {{this.lengthGzip}});
    {{#if this.isGzip}}
    response->addHeader("Content-Encoding", "gzip");
    {{/if}}
#else
    AsyncWebServerResponse *response = request->beginResponse_P(200, "{{this.mime}}", data_{{this.dataname}}, {{this.length}});
#endif
#ifdef {{../definePrefix}}_ENABLE_ETAG
    response->addHeader("ETag", etag_{{this.dataname}});
#endif 
    request->send(response);
  };
  server->on("/{{this.filename}}", HTTP_GET, func_{{this.dataname}});
  {{#if this.isDefault}}
  server->on("/", HTTP_GET, func_{{this.dataname}});
  {{/if}}

{{/each}}
}`;

export const getCppCode = (sources: CppCodeSources, filesByExtension: ExtensionGroups): string =>
  handlebarsCompile(cmdLine.engine === 'psychic' ? psychicTemplate : asyncTemplate)(
    {
      commandLine: process.argv.slice(2).join(' '),
      now: `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
      fileCount: sources.length.toString(),
      fileSize: sources.reduce((previous, current) => previous + current.content.length, 0).toString(),
      fileGzipSize: sources.reduce((previous, current) => previous + current.contentGzip.length, 0).toString(),
      sources: sources.map((s) => ({
        ...s,
        length: s.content.length,
        bytes: [...s.content].map((v) => `0x${v.toString(16)}`).join(', '),
        lengthGzip: s.contentGzip.length,
        bytesGzip: [...s.contentGzip].map((v) => `0x${v.toString(16)}`).join(', '),
        isDefault: s.filename.startsWith('index.htm')
      })),
      filesByExtension,
      etag: cmdLine.etag,
      gzip: cmdLine.gzip,
      created: cmdLine.created,
      version: cmdLine.version,
      methodName: cmdLine.espmethod,
      definePrefix: cmdLine.define
    },
    {
      helpers: {
        ifeq: function (a: string, b: string, options: HelperOptions) {
          if (a == b) {
            return options.fn(this);
          }
          return options.inverse(this);
        }
      }
    }
  ).trim();
