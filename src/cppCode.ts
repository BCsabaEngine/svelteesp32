import { cmdLine } from './commandLine';

export type cppCodeSource = {
  filename: string;
  mime: string;
  content: Buffer;
  isGzip: boolean;
};

const headerTemplate = `
void $method(PsychicHttpServer * server) {
`;

const footerTemplate = `
}`;

const codeTemplate = `
	server->on("$filename", HTTP_GET, [](PsychicRequest * request)
	{
		const uint8_t data[] = {$numbers};

		PsychicStreamResponse response(request, "$mime");
		$encoding
		response.beginSend();
		for (int i = 0; i < sizeof(data); i++) response.write(data[i]);
		return response.endSend();
	});
`;

export const getCppCode = (source: cppCodeSource): string =>
  codeTemplate
    .replace('$filename', source.filename)
    .replace('$mime', source.mime)
    .replace('$encoding', source.isGzip ? 'response.addHeader("Content-Encoding", "gzip");' : '')
    .replace('$numbers', [...source.content].map((v) => `0x${v.toString(16)}`).join(', '));

export const adoptMethodName = (content: string) =>
  headerTemplate.replace('$method', cmdLine.espMethodName) + content + footerTemplate;
