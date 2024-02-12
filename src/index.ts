import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { lookup } from 'mime-types';

import { cmdLine } from './commandLine';
import { adoptMethodName, cppCodeSource, getCppCode } from './cppCode';
import { getFiles } from './file';

const summary = {
  filecount: 0,
  size: 0,
  gzipsize: 0
};

const sources: cppCodeSource[] = [];

for (const file of getFiles()) {
  const mime = lookup(file) || 'text/plain';
  summary.filecount++;
  console.log(`[${file}]`);

  const rawContent = readFileSync(join(cmdLine.sveltePath, file), { flag: 'r' });
  summary.size += rawContent.length;
  if (cmdLine.gzip) {
    const zipContent = gzipSync(rawContent, { level: 9 });
    summary.gzipsize += zipContent.length;
    if (zipContent.length < rawContent.length * 0.85) {
      sources.push({ filename: file, content: zipContent, isGzip: true, mime });
      console.log(`✓ gzip used (${rawContent.length} -> ${zipContent.length})`);
    } else {
      sources.push({ filename: file, content: rawContent, isGzip: false, mime });
      console.log(`x gzip unused (${rawContent.length} -> ${zipContent.length})`);
    }
  } else {
    sources.push({ filename: file, content: rawContent, isGzip: false, mime });
    console.log(`- gzip skipped (${rawContent.length})`);
  }

  console.log('');
}

let cppFile = '';
for (const source of sources) cppFile += getCppCode(source);
cppFile = adoptMethodName(cppFile);
writeFileSync(cmdLine.espFile, cppFile);

if (cmdLine.gzip)
  console.log(
    `${summary.filecount} files, ${summary.size} original bytes, ${summary.gzipsize} gzip bytes`
  );
else console.log(`${summary.filecount} files, ${summary.size} original bytes`);

console.log(`${cmdLine.espFile} ${cppFile.length} bytes`);
