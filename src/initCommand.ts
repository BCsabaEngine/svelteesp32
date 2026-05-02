import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';

const RC_FILENAME = '.svelteesp32rc.json';
const ENGINES = ['psychic', 'async', 'espidf', 'webserver'] as const;
const TRISTATES = ['always', 'never', 'compiler'] as const;

type Engine = (typeof ENGINES)[number];
type TriState = (typeof TRISTATES)[number];

function isEngine(value: string): value is Engine {
  return (ENGINES as readonly string[]).includes(value);
}

function isTriState(value: string): value is TriState {
  return (TRISTATES as readonly string[]).includes(value);
}

export async function runInit(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log('svelteesp32 init - Create a configuration file\n');

    const rcPath = path.join(process.cwd(), RC_FILENAME);

    if (existsSync(rcPath)) {
      const overwriteAnswerRaw = await rl.question(`${RC_FILENAME} already exists. Overwrite? (y/N): `);
      if (overwriteAnswerRaw.trim().toLowerCase() !== 'y') {
        console.log('Aborted.');
        return;
      }
    }

    const engineAnswerRaw = await rl.question(`Engine (${ENGINES.join('|')}) [psychic]: `);
    const engineAnswer = engineAnswerRaw.trim();
    const engine: Engine = isEngine(engineAnswer) ? engineAnswer : 'psychic';

    const sourcepathAnswerRaw = await rl.question('Source path (compiled web app dist folder) [./dist]: ');
    const sourcepath = sourcepathAnswerRaw.trim() || './dist';

    const outputfileAnswerRaw = await rl.question('Output file (C++ header path) [./svelteesp32.h]: ');
    const outputfile = outputfileAnswerRaw.trim() || './svelteesp32.h';

    const etagAnswerRaw = await rl.question(`ETag (${TRISTATES.join('|')}) [always]: `);
    const etagAnswer = etagAnswerRaw.trim();
    const etag: TriState = isTriState(etagAnswer) ? etagAnswer : 'always';

    const config = { engine, sourcepath, outputfile, etag, gzip: 'always' };

    writeFileSync(rcPath, JSON.stringify(config, undefined, 2) + '\n', 'utf8');
    console.log(`\nCreated ${RC_FILENAME}`);

    const runAnswerRaw = await rl.question('\nWould you like to run svelteesp32 now? (Y/n): ');
    if (runAnswerRaw.trim().toLowerCase() !== 'n') {
      const binaryPath = process.argv[1];
      if (binaryPath) spawnSync('node', [binaryPath], { stdio: 'inherit' });
    }
  } finally {
    rl.close();
  }
}
