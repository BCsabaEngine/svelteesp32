import { existsSync, statSync } from 'node:fs';

interface ICopyFilesArguments {
  engine: 'psychic' | 'psychic2' | 'async' | 'espidf';
  sourcepath: string;
  outputfile: string;
  espmethod: string;
  define: string;
  gzip: 'true' | 'false' | 'compiler';
  etag: 'true' | 'false' | 'compiler';
  cachetime: number;
  created: boolean;
  version: string;
  exclude: string[];
  help?: boolean;
}

function showHelp(): never {
  console.log(`
svelteesp32 - Svelte JS to ESP32 converter

Options:
  -e, --engine <value>       The engine for which the include file is created
                             (psychic|psychic2|async|espidf) (default: "psychic")
  -s, --sourcepath <path>    Source dist folder contains compiled web files (required)
  -o, --outputfile <path>    Generated output file with path (default: "svelteesp32.h")
  --etag <value>             Use ETAG header for cache (true|false|compiler) (default: "false")
  --gzip <value>             Compress content with gzip (true|false|compiler) (default: "true")
  --created                  Include creation time in the output file (default: false)
  --version <value>          Include version info in the output file (default: "")
  --espmethod <name>         Name of generated method (default: "initSvelteStaticFiles")
  --define <prefix>          Prefix of c++ defines (default: "SVELTEESP32")
  --cachetime <seconds>      max-age cache time in seconds (default: 0)
  --exclude <pattern>        Exclude files matching glob pattern (repeatable or comma-separated)
                             Examples: --exclude="*.map" --exclude="test/**/*.ts"
  -h, --help                 Shows this help
`);
  process.exit(0);
}

function validateEngine(value: string): 'psychic' | 'psychic2' | 'async' | 'espidf' {
  if (value === 'psychic' || value === 'psychic2' || value === 'async' || value === 'espidf') return value;

  throw new Error(`Invalid engine: ${value}`);
}

function validateTriState(value: string, name: string): 'true' | 'false' | 'compiler' {
  if (value === 'true' || value === 'false' || value === 'compiler') return value;

  throw new Error(`Invalid ${name}: ${value}`);
}

const DEFAULT_EXCLUDE_PATTERNS = [
  '.DS_Store', // macOS system file
  'Thumbs.db', // Windows thumbnail cache
  '.git', // Git directory
  '.svn', // SVN directory
  '*.swp', // Vim swap files
  '*~', // Backup files
  '.gitignore', // Git ignore file
  '.gitattributes' // Git attributes file
];

function parseArguments(): ICopyFilesArguments {
  const arguments_ = process.argv.slice(2);
  const result: Partial<ICopyFilesArguments> = {
    engine: 'psychic',
    outputfile: 'svelteesp32.h',
    etag: 'false',
    gzip: 'true',
    created: false,
    version: '',
    espmethod: 'initSvelteStaticFiles',
    define: 'SVELTEESP32',
    cachetime: 0,
    exclude: [...DEFAULT_EXCLUDE_PATTERNS]
  };

  for (let index = 0; index < arguments_.length; index++) {
    const argument = arguments_[index];

    if (!argument) continue;

    // Handle --help or -h
    if (argument === '--help' || argument === '-h') showHelp();

    // Handle --flag=value format
    if (argument.startsWith('--') && argument.includes('=')) {
      const parts = argument.split('=');
      const flag = parts[0];
      const value = parts.slice(1).join('=');

      if (!flag || !value) throw new Error(`Invalid argument format: ${argument}`);

      const flagName = flag.slice(2);

      switch (flagName) {
        case 'engine':
          result.engine = validateEngine(value);
          break;
        case 'sourcepath':
          result.sourcepath = value;
          break;
        case 'outputfile':
          result.outputfile = value;
          break;
        case 'etag':
          result.etag = validateTriState(value, 'etag');
          break;
        case 'gzip':
          result.gzip = validateTriState(value, 'gzip');
          break;
        case 'version':
          result.version = value;
          break;
        case 'espmethod':
          result.espmethod = value;
          break;
        case 'define':
          result.define = value;
          break;
        case 'cachetime':
          result.cachetime = Number.parseInt(value, 10);
          if (Number.isNaN(result.cachetime)) throw new TypeError(`Invalid cachetime: ${value}`);

          break;
        case 'exclude': {
          const patterns = value
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);
          result.exclude = result.exclude || [...DEFAULT_EXCLUDE_PATTERNS];
          result.exclude.push(...patterns);
          break;
        }
        default:
          throw new Error(`Unknown flag: ${flag}`);
      }
      continue;
    }

    // Handle boolean flags without values
    if (argument === '--created') {
      result.created = true;
      continue;
    }

    // Handle -flag value format
    if (argument.startsWith('-') && !argument.startsWith('--')) {
      const flag = argument.slice(1);
      const nextArgument = arguments_[index + 1];

      if (!nextArgument || nextArgument.startsWith('-')) throw new Error(`Missing value for flag: ${argument}`);

      switch (flag) {
        case 'e':
          result.engine = validateEngine(nextArgument);
          index++;
          break;
        case 's':
          result.sourcepath = nextArgument;
          index++;
          break;
        case 'o':
          result.outputfile = nextArgument;
          index++;
          break;
        default:
          throw new Error(`Unknown flag: ${argument}`);
      }
      continue;
    }

    // Handle --flag value format
    if (argument.startsWith('--')) {
      const flag = argument.slice(2);
      const nextArgument = arguments_[index + 1];

      if (!nextArgument || nextArgument.startsWith('-')) throw new Error(`Missing value for flag: ${argument}`);

      switch (flag) {
        case 'engine':
          result.engine = validateEngine(nextArgument);
          index++;
          break;
        case 'sourcepath':
          result.sourcepath = nextArgument;
          index++;
          break;
        case 'outputfile':
          result.outputfile = nextArgument;
          index++;
          break;
        case 'etag':
          result.etag = validateTriState(nextArgument, 'etag');
          index++;
          break;
        case 'gzip':
          result.gzip = validateTriState(nextArgument, 'gzip');
          index++;
          break;
        case 'version':
          result.version = nextArgument;
          index++;
          break;
        case 'espmethod':
          result.espmethod = nextArgument;
          index++;
          break;
        case 'define':
          result.define = nextArgument;
          index++;
          break;
        case 'cachetime':
          result.cachetime = Number.parseInt(nextArgument, 10);
          if (Number.isNaN(result.cachetime)) throw new TypeError(`Invalid cachetime: ${nextArgument}`);

          index++;
          break;
        case 'exclude': {
          const patterns = nextArgument
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);
          result.exclude = result.exclude || [...DEFAULT_EXCLUDE_PATTERNS];
          result.exclude.push(...patterns);
          index++;
          break;
        }
        default:
          throw new Error(`Unknown flag: --${flag}`);
      }
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  // Validate required arguments
  if (!result.sourcepath) {
    console.error('Error: --sourcepath is required');
    showHelp();
  }

  return result as ICopyFilesArguments;
}

export const cmdLine = parseArguments();

if (!existsSync(cmdLine.sourcepath) || !statSync(cmdLine.sourcepath).isDirectory()) {
  console.error(`Directory ${cmdLine.sourcepath} not exists or not a directory`);
  process.exit(1);
}

console.log(`[SvelteESP32] Generate code for ${cmdLine.engine} engine`);
