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

{{#each sources}}
const uint8_t data{{this.index}}[{{this.length}}] = { {{this.bytes}} };
{{#if ../isEtag}}
const char * etag{{this.index}} = "{{this.md5}}";
{{/if}}
{{/each}}

void {{methodName}}(PsychicHttpServer * server) {
{{#each sources}}

  {{#if this.isDefault}}server->defaultEndpoint = {{/if}}server->on("/{{this.filename}}", HTTP_GET, [](PsychicRequest * request)
  {
  {{#if ../isEtag}}
    if (request->hasHeader("If-None-Match") && request->header("If-None-Match") == String(etag{{this.index}})) {
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
    response.addHeader("ETag", etag{{this.index}});
  {{/if}}
    response.setContent(data{{this.index}}, sizeof(data{{this.index}}));
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

{{#each sources}}
const uint8_t data{{this.index}}[{{this.length}}] PROGMEM = { {{this.bytes}} };
{{#if ../isEtag}}
const char * etag{{this.index}} = "{{this.md5}}";
{{/if}}
{{/each}}

void {{methodName}}(AsyncWebServer * server) {
{{#each sources}}

  ArRequestHandlerFunction func{{this.index}} = [](AsyncWebServerRequest * request)
  {
  {{#if ../isEtag}}
    if (request->hasHeader("If-None-Match") && request->getHeader("If-None-Match")->value() == String(etag{{this.index}})) {
      request->send(304);
      return;
    }
  {{/if}}
    AsyncWebServerResponse *response = request->beginResponse_P(200, "{{this.mime}}", data{{this.index}}, {{this.length}});
  {{#if this.isGzip}}
    response->addHeader("Content-Encoding", "gzip");
  {{/if}}
  {{#if ../isEtag}}
    response->addHeader("ETag", etag{{this.index}});
  {{/if}}
    request->send(response);
  };
  server->on("/{{this.filename}}", HTTP_GET, func{{this.index}});
{{#if this.isDefault}}
  server->on("/", HTTP_GET, func{{this.index}});
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
