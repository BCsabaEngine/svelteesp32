import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { cmdLine } from './commandLine';
import { cppCodeSource } from './cppCode';
import { getFiles } from './file';

const summary = {
	filecount: 0,
	size: 0,
	gzipsize: 0
};

const sources: cppCodeSource[] = [];

for (const file of getFiles()) {
	summary.filecount++;
	console.log(`[${file}]`);

	const rawContent = readFileSync(join(cmdLine.sveltePath, file), { flag: 'r' });
	summary.size += rawContent.length;
	if (cmdLine.gzip) {
		const zipContent = gzipSync(rawContent, { level: 9 });
		summary.gzipsize += zipContent.length;
		if (zipContent.length < rawContent.length * 0.85) {
			sources.push({ filename: file, content: zipContent, isGzip: true });
			console.log(`✓ gzip used (${rawContent.length} -> ${zipContent.length})`);
		} else {
			sources.push({ filename: file, content: rawContent, isGzip: false });
			console.log(`x gzip unused (${rawContent.length} -> ${zipContent.length})`);
		}
	} else {
		sources.push({ filename: file, content: rawContent, isGzip: false });
		console.log(`- gzip skipped (${rawContent.length})`);
	}

	console.log('');
}

if (cmdLine.gzip)
	console.log(
		`${summary.filecount} files, ${summary.size} original size, ${summary.gzipsize} gzip size`
	);
else console.log(`${summary.filecount} files, ${summary.size} original size`);
