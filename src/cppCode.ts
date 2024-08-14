import { compile as handlebarsCompile } from 'handlebars';

import { cmdLine } from './commandLine';

export type CppCodeSource = {
  filename: string;
  dataname: string;
  datanameUpperCase: string;
  mime: string;
  content: Buffer;
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
//cmdline:  {{commandLine}}
//created:  {{now}}
//files:    {{fileCount}}
//memory:   {{fileSize}}

#include <Arduino.h>
#include <PsychicHttp.h>
#include <PsychicHttpsServer.h>

{{#ifeq etag "true" }}
#define {{definePrefix}}_ENABLE_ETAG
{{/ifeq}}
{{#ifeq etag "false" }}
#undef {{definePrefix}}_ENABLE_ETAG
{{/ifeq}}

#define {{definePrefix}}_COUNT {{fileCount}}
#define {{definePrefix}}_SIZE {{fileSize}}

{{#each sources}}
#define {{../definePrefix}}_FILE_{{this.datanameUpperCase}}
{{/each}}

{{#each filesByExtension}}
#define {{../definePrefix}}_{{this.extension}}_FILES {{this.count}}
{{/each}}

{{#each sources}}
const uint8_t data_{{this.dataname}}[{{this.length}}] = { {{this.bytes}} };
{{/each}}

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
    {{#if this.isGzip}}
    response.addHeader("Content-Encoding", "gzip");
    {{/if}}
#ifdef {{../definePrefix}}_ENABLE_ETAG
    response.addHeader("ETag", etag_{{this.dataname}});
#endif 
    response.setContent(data_{{this.dataname}}, sizeof(data_{{this.dataname}}));
    return response.send();
  });

{{/each}}
}`;

const asyncTemplate = `
//engine:   ESPAsyncWebServer
//cmdline:  {{commandLine}}
//created:  {{now}}
//files:    {{fileCount}}
//memory:   {{fileSize}}

#include <Arduino.h>
#include <ESPAsyncWebServer.h>

{{#ifeq etag "true" }}
#define {{definePrefix}}_ENABLE_ETAG
{{/ifeq}}
{{#ifeq etag "false" }}
#undef {{definePrefix}}_ENABLE_ETAG
{{/ifeq}}

#define {{definePrefix}}_COUNT {{fileCount}}
#define {{definePrefix}}_SIZE {{fileSize}}

{{#each sources}}
#define {{../definePrefix}}_FILE_{{this.datanameUpperCase}}
{{/each}}

{{#each filesByExtension}}
#define {{../definePrefix}}_{{this.extension}}_FILES {{this.count}}
{{/each}}

{{#each sources}}
const uint8_t data_{{this.dataname}}[{{this.length}}] = { {{this.bytes}} };
{{/each}}

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
    AsyncWebServerResponse *response = request->beginResponse_P(200, "{{this.mime}}", data_{{this.dataname}}, {{this.length}});
    {{#if this.isGzip}}
    response->addHeader("Content-Encoding", "gzip");
    {{/if}}
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
      sources: sources.map((s) => ({
        ...s,
        length: s.content.length,
        bytes: [...s.content].map((v) => `0x${v.toString(16)}`).join(', '),
        isDefault: s.filename.startsWith('index.htm')
      })),
      filesByExtension,
      etag: cmdLine.etag,
      methodName: cmdLine.espmethod,
      definePrefix: cmdLine.define
    },
    {
      helpers: {
        ifeq: function (a, b, options) {
          if (a == b) {
            return options.fn(this);
          }
          return options.inverse(this);
        }
      }
    }
  ).trim();
