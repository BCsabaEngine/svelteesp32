import { extname, join } from 'node:path';

import { globSync } from 'glob';

import { cmdLine } from './commandLine';

export const getFiles = () =>
	globSync(join('**/*'), { cwd: cmdLine.sveltePath, nodir: true })
		.filter((filename) => !['.gz', '.brottli'].includes(extname(filename)))
		.sort();
