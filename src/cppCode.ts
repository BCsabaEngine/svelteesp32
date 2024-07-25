import { compile as handlebarsCompile } from 'handlebars';

import { cmdLine } from './commandLine';

export type cppCodeSource = {
  index: number;
  filename: string;
  mime: string;
  content: Buffer;
  isGzip: boolean;
  md5: string;
};

const psychicTemplate = `
//engine:   PsychicHttpServer
//cmdline:  {{commandLine}}
//created:  {{now}}
//files:    {{fileCount}}
//memory:   {{fileSize}}

#include <Arduino.h>
#include <PsychicHttp.h>
#include <PsychicHttpsServer.h>

{{#each sources}}
{{#if this.isDefault}}
const uint8_t dataDefaultDocument[{{this.length}}] = { {{this.bytes}} };
{{#if ../isEtag}}
const char * etagDefaultDocument = "{{this.md5}}";
{{/if}}
{{else}}
const uint8_t data{{this.index}}[{{this.length}}] = { {{this.bytes}} };
{{#if ../isEtag}}
const char * etag{{this.index}} = "{{this.md5}}";
{{/if}}
{{/if}}
{{/each}}

void {{methodName}}(PsychicHttpServer * server) {
{{#each sources}}
  {{#if this.isDefault}}server->defaultEndpoint = {{/if}}server->on("/{{this.filename}}", HTTP_GET, [](PsychicRequest * request) {
    {{#if ../isEtag}}
    if (request->hasHeader("If-None-Match") && request->header("If-None-Match") == String({{#if this.isDefault}}etagDefaultDocument{{else}}etag{{this.index}}{{/if}})) {
      PsychicResponse response304(request);
      response304.setCode(304);
      return response304.send();
    }
    {{/if}}
    PsychicResponse response(request);
    response.setContentType("{{this.mime}}");
    {{#if this.isGzip}}
    response.addHeader("Content-Encoding", "gzip");
    {{/if}}
    {{#if ../isEtag}}
    response.addHeader("ETag", {{#if this.isDefault}}etagDefaultDocument{{else}}etag{{this.index}}{{/if}});
    {{/if}}
    response.setContent({{#if this.isDefault}}dataDefaultDocument{{else}}data{{this.index}}{{/if}}, sizeof({{#if this.isDefault}}dataDefaultDocument{{else}}data{{this.index}}{{/if}}));
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

{{#each sources}}
{{#if this.isDefault}}
const uint8_t dataDefaultDocument[{{this.length}}] = { {{this.bytes}} };
{{#if ../isEtag}}
const char * etagDefaultDocument = "{{this.md5}}";
{{/if}}
{{else}}
const uint8_t data{{this.index}}[{{this.length}}] PROGMEM = { {{this.bytes}} };
{{#if ../isEtag}}
const char * etag{{this.index}} = "{{this.md5}}";
{{/if}}
{{/if}}
{{/each}}

void {{methodName}}(AsyncWebServer * server) {
{{#each sources}}
  ArRequestHandlerFunction {{#if this.isDefault}}funcDefaultDocument{{else}}func{{this.index}}{{/if}} = [](AsyncWebServerRequest * request) {
    {{#if ../isEtag}}
    if (request->hasHeader("If-None-Match") && request->getHeader("If-None-Match")->value() == String({{#if this.isDefault}}etagDefaultDocument{{else}}etag{{this.index}}{{/if}})) {
      request->send(304);
      return;
    }
    {{/if}}
    AsyncWebServerResponse *response = request->beginResponse_P(200, "{{this.mime}}", {{#if this.isDefault}}dataDefaultDocument{{else}}data{{this.index}}{{/if}}, {{this.length}});
    {{#if this.isGzip}}
    response->addHeader("Content-Encoding", "gzip");
    {{/if}}
    {{#if ../isEtag}}
    response->addHeader("ETag", {{#if this.isDefault}}etagDefaultDocument{{else}}etag{{this.index}}{{/if}});
    {{/if}}
    request->send(response);
  };
  {{#if this.isDefault}}
  server->on("/{{this.filename}}", HTTP_GET, funcDefaultDocument);
  server->on("/", HTTP_GET, funcDefaultDocument);
  {{else}}
  server->on("/{{this.filename}}", HTTP_GET, func{{this.index}});
  {{/if}}
{{/each}}
}`;

export const getCppCode = (sources: cppCodeSource[]): string =>
  handlebarsCompile(cmdLine.engine === 'psychic' ? psychicTemplate : asyncTemplate)({
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
    isEtag: cmdLine.etag,
    methodName: cmdLine.espmethod
  }).trim();
