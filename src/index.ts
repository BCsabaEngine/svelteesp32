/* eslint-disable unicorn/prefer-string-replace-all */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { lookup } from 'mime-types';

import { cmdLine } from './commandLine';
import { CppCodeSources, ExtensionGroups, getCppCode } from './cppCode';
import { getFiles } from './file';

const summary = {
  filecount: 0,
  size: 0,
  gzipsize: 0
};

const sources: CppCodeSources = [];
const filesByExtension: ExtensionGroups = [];
const files = getFiles();
if (files.length === 0) {
  console.error(`Directory ${cmdLine.sourcepath} is empty`);
  process.exit(1);
}

for (const file of files) {
  const mime = lookup(file) || 'text/plain';
  summary.filecount++;

  const filename = file.replace(/\\/g, '/');
  const dataname = filename.replace(/[./-]/g, '_');
  let extension = path.extname(filename).toUpperCase();
  if (extension.startsWith('.')) extension = extension.slice(1);

  const group = filesByExtension.find((fe) => fe.extension === extension);
  if (group) group.count += 1;
  else filesByExtension.push({ extension, count: 1 });

  const content = readFileSync(path.join(cmdLine.sourcepath, file), { flag: 'r' });
  const md5 = createHash('md5').update(content).digest('hex');
  summary.size += content.length;
  const zipContent = gzipSync(content, { level: 9 });
  summary.gzipsize += zipContent.length;
  const zipRatio = Math.round((zipContent.length / content.length) * 100);
  if (content.length > 1024 && zipContent.length < content.length * 0.85) {
    sources.push({
      filename,
      dataname,
      datanameUpperCase: dataname.toUpperCase(),
      content,
      contentGzip: zipContent,
      isGzip: true,
      mime,
      md5
    });
    console.log(`[${file}] ✓ gzip used (${content.length} -> ${zipContent.length} = ${zipRatio}%)`);
  } else {
    sources.push({
      filename,
      dataname,
      datanameUpperCase: dataname.toUpperCase(),
      content,
      contentGzip: content,
      isGzip: false,
      mime,
      md5
    });
    console.log(
      `[${file}] x gzip unused ${content.length <= 1024 ? `(too small)` : ''} (${content.length} -> ${zipContent.length} = ${zipRatio}%)`
    );
  }
}
console.log('');
filesByExtension.sort((left, right) => left.extension.localeCompare(right.extension));

const cppFile = getCppCode(sources, filesByExtension);
mkdirSync(path.normalize(path.dirname(cmdLine.outputfile)), { recursive: true });
writeFileSync(cmdLine.outputfile, cppFile, { flush: true, encoding: 'utf8' });

console.log(
  `${summary.filecount} files, ${Math.round(summary.size / 1024)}kB original size, ${Math.round(summary.gzipsize / 1024)}kB gzip size`
);

console.log(`${cmdLine.outputfile} ${Math.round(cppFile.length / 1024)}kB size`);
