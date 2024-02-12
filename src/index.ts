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

  const rawContent = readFileSync(join(cmdLine.sourcePath, file), { flag: 'r' });
  summary.size += rawContent.length;
  if (cmdLine.gzip) {
    const zipContent = gzipSync(rawContent, { level: 9 });
    summary.gzipsize += zipContent.length;
    if (rawContent.length > 100 && zipContent.length < rawContent.length * 0.85) {
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
writeFileSync(cmdLine.outputFile, cppFile);

if (cmdLine.gzip)
  console.log(
    `${summary.filecount} files, ${Math.round(summary.size / 1024)}kB original size, ${Math.round(summary.gzipsize / 1024)}kB gzip size`
  );
else console.log(`${summary.filecount} files, ${Math.round(summary.size / 1024)}kB original size`);

console.log(`${cmdLine.outputFile} ${Math.round(cppFile.length / 1024)}kB size`);
