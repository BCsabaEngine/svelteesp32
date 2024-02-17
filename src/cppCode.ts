import { cmdLine } from './commandLine';

export type cppCodeSource = {
  index: number;
  filename: string;
  mime: string;
  content: Buffer;
  isGzip: boolean;
  md5: string;
};

const replaceAll = (s: string, from: string, to: string) => {
  while (s.includes(from)) s = s.replace(from, to);
  return s;
};

const blockTemplateETag = `if (request->hasHeader("If-None-Match") && request->header("If-None-Match") == String(etag$index$)) {
      PsychicResponse response304(request);
      response304.setCode(304);
      return response304.send();
    }
`;
const blockTemplate = `
  $default$server->on("/$filename$", HTTP_GET, [](PsychicRequest * request)
  {
    ${cmdLine.etag ? blockTemplateETag : ''}
    PsychicResponse response(request);
    response.setContentType("$mime$");
    response.addHeader("Content-Encoding", "$encoding$");
    ${cmdLine.etag ? `response.addHeader("ETag", etag$index$);` : ''}
    response.setContent(data$index$, sizeof(data$index$));
    return response.send();
  });
`;

const getCppBlock = (source: cppCodeSource): string => {
  let result = blockTemplate;

  result = replaceAll(result, '$default$', source.filename.startsWith('index.htm') ? 'server->defaultEndpoint = ' : '');
  result = replaceAll(result, '$index$', source.index.toString());
  result = replaceAll(result, '$filename$', source.filename);
  result = replaceAll(result, '$size$', source.content.length.toString());
  result = replaceAll(result, '$mime$', source.mime);
  result = replaceAll(result, '$encoding$', source.isGzip ? 'gzip' : 'identity');
  return result;
};

const fileTemplate = `//cmdline:  $commandline$
//created:  $now$
//files:    $filecount$
//memory:   $filesize$

$filedataarrays$
$hashaarrays$

void $method$(PsychicHttpServer * server) {
$code$
}`;

export const getCppCode = (sources: cppCodeSource[]) => {
  const fileDataArrays: string[] = [];
  const hashArrays: string[] = [];
  const blocks: string[] = [];
  for (const source of sources) {
    const bytesString = [...source.content].map((v) => `0x${v.toString(16)}`).join(', ');
    fileDataArrays.push(`const uint8_t data${source.index}[${source.content.length}] = {${bytesString}};`);
    hashArrays.push(`const char * etag${source.index} = "${source.md5}";`);
    blocks.push(getCppBlock(source));
  }

  let result = fileTemplate;
  result = replaceAll(result, '$commandline$', process.argv.slice(2).join(' '));
  result = replaceAll(result, '$now$', `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`);
  result = replaceAll(result, '$filecount$', sources.length.toString());
  result = replaceAll(
    result,
    '$filesize$',
    sources.reduce((previous, current) => previous + current.content.length, 0).toString()
  );

  result = replaceAll(result, '$filedataarrays$', fileDataArrays.join('\n'));
  result = replaceAll(result, '$hashaarrays$', cmdLine.etag ? hashArrays.join('\n') : '');
  result = replaceAll(result, '$method$', cmdLine.espmethod);
  result = replaceAll(result, '$code$', blocks.join(''));
  return result;
};
