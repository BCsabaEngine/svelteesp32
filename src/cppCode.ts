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

const esp32Template = `
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

export const getCppCode = (sources: cppCodeSource[]): string =>
  handlebarsCompile(esp32Template)({
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
