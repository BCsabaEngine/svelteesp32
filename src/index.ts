/* eslint-disable unicorn/prefer-string-replace-all */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { lookup } from 'mime-types';

import { cmdLine } from './commandLine';
import { cppCodeSource, getCppCode } from './cppCode';
import { getFiles } from './file';

const summary = {
  filecount: 0,
  size: 0,
  gzipsize: 0
};

const sources: cppCodeSource[] = [];
let sourceIndex = 0;
for (const file of getFiles()) {
  const mime = lookup(file) || 'text/plain';
  summary.filecount++;
  console.log(`[${file}]`);

  const rawContent = readFileSync(join(cmdLine.sourcepath, file), { flag: 'r' });
  const md5 = createHash('md5').update(rawContent).digest('hex');
  summary.size += rawContent.length;
  if (cmdLine['no-gzip']) {
    sources.push({
      index: sourceIndex++,
      filename: file.replace(/\\/g, '/'),
      content: rawContent,
      isGzip: false,
      mime,
      md5
    });
    console.log(`- gzip skipped (${rawContent.length})`);
  } else {
    const zipContent = gzipSync(rawContent, { level: 9 });
    summary.gzipsize += zipContent.length;
    if (rawContent.length > 100 && zipContent.length < rawContent.length * 0.85) {
      sources.push({
        index: sourceIndex++,
        filename: file.replace(/\\/g, '/'),
        content: zipContent,
        isGzip: true,
        mime,
        md5
      });
      console.log(`✓ gzip used (${rawContent.length} -> ${zipContent.length})`);
    } else {
      sources.push({
        index: sourceIndex++,
        filename: file.replace(/\\/g, '/'),
        content: rawContent,
        isGzip: false,
        mime,
        md5
      });
      console.log(`x gzip unused (${rawContent.length} -> ${zipContent.length})`);
    }
  }

  console.log('');
}

const cppFile = getCppCode(sources);
writeFileSync(cmdLine.outputfile, cppFile);

if (cmdLine['no-gzip']) {
  console.log(`${summary.filecount} files, ${Math.round(summary.size / 1024)}kB original size`);
} else {
  console.log(
    `${summary.filecount} files, ${Math.round(summary.size / 1024)}kB original size, ${Math.round(summary.gzipsize / 1024)}kB gzip size`
  );
}

console.log(`${cmdLine.outputfile} ${Math.round(cppFile.length / 1024)}kB size`);
