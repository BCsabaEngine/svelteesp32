import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { cyanLog, yellowLog } from './consoleColor';
import { getInvalidEngineError, getSourcepathNotFoundError } from './errorMessages';

interface ICopyFilesArguments {
  engine: 'psychic' | 'async' | 'espidf';
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
  basePath: string;
  maxSize?: number;
  maxGzipSize?: number;
  noIndexCheck?: boolean;
  dryRun?: boolean;
  help?: boolean;
}

interface IRcFileConfig {
  engine?: 'psychic' | 'async' | 'espidf';
  sourcepath?: string;
  outputfile?: string;
  espmethod?: string;
  define?: string;
  gzip?: 'true' | 'false' | 'compiler';
  etag?: 'true' | 'false' | 'compiler';
  cachetime?: number;
  created?: boolean;
  version?: string;
  exclude?: string[];
  basepath?: string;
  maxsize?: number | string;
  maxgzipsize?: number | string;
  noindexcheck?: boolean;
  dryrun?: boolean;
}

function showHelp(): never {
  console.log(`
svelteesp32 - Svelte JS to ESP32 converter

Configuration:
  --config <path>            Use custom RC file (default: search for .svelteesp32rc.json)

Options:
  -e, --engine <value>       The engine for which the include file is created
                             (psychic|async|espidf) (default: "psychic")
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
  --basepath <path>          URL prefix for all routes (e.g., "/ui") (default: "")
  --maxsize <size>           Maximum total uncompressed size (e.g., 400k, 1.5m, 409600)
  --maxgzipsize <size>       Maximum total gzip size (e.g., 150k, 1m, 153600)
  --dryrun                   Show summary without writing the output file (default: false)
  -h, --help                 Shows this help

RC File:
  The tool searches for .svelteesp32rc.json in:
    1. Current directory (./.svelteesp32rc.json)
    2. User home directory (~/.svelteesp32rc.json)

  Example RC file (all fields optional):
    {
      "engine": "psychic",
      "sourcepath": "./dist",
      "outputfile": "./output.h",
      "etag": "true",
      "gzip": "true",
      "exclude": ["*.map", "*.md"],
      "basepath": "/ui",
      "maxsize": "400k",
      "maxgzipsize": "150k",
      "noindexcheck": false
    }

  CLI arguments override RC file values.
`);
  process.exit(0);
}

function validateEngine(value: string): 'psychic' | 'async' | 'espidf' {
  if (value === 'psychic' || value === 'async' || value === 'espidf') return value;

  console.error(getInvalidEngineError(value));
  process.exit(1);
}

function validateTriState(value: string, name: string): 'true' | 'false' | 'compiler' {
  if (value === 'true' || value === 'false' || value === 'compiler') return value;

  throw new Error(`Invalid ${name}: ${value}`);
}

function validateCppIdentifier(value: string, name: string): string {
  if (!/^[A-Z_a-z]\w*$/.test(value))
    throw new Error(
      `${name} must be a valid C++ identifier (letters, digits, underscores, not starting with a digit): ${value}`
    );
  return value;
}

function validateBasePath(value: string): string {
  if (value === '') return value;
  if (!value.startsWith('/')) throw new Error(`basePath must start with /: ${value}`);
  if (value.endsWith('/')) throw new Error(`basePath must not end with /: ${value}`);
  if (value.includes('//')) throw new Error(`basePath must not contain //: ${value}`);
  return value;
}

function parseSize(value: string, name: string): number {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([KMkm])?$/);

  if (!match || !match[1])
    throw new Error(`${name} must be a positive number with optional k/K (×1024) or m/M (×1024²) suffix: ${value}`);

  const numericPart = Number.parseFloat(match[1]);
  const suffix = match[2]?.toLowerCase();

  let bytes: number;
  if (suffix === 'k') bytes = numericPart * 1024;
  else if (suffix === 'm') bytes = numericPart * 1024 * 1024;
  else bytes = numericPart;

  bytes = Math.round(bytes);

  if (bytes <= 0 || !Number.isFinite(bytes)) throw new Error(`${name} must be a positive integer: ${value}`);

  return bytes;
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

function findRcFile(customConfigPath?: string): string | undefined {
  // If --config specified, use that exclusively
  if (customConfigPath) {
    if (existsSync(customConfigPath)) return customConfigPath;
    throw new Error(`Config file not found: ${customConfigPath}`);
  }

  // Check current directory
  for (const filename of ['.svelteesp32rc.json', '.svelteesp32rc']) {
    const cwdPath = path.join(process.cwd(), filename);
    if (existsSync(cwdPath)) return cwdPath;
  }

  // Check home directory
  const homeDirectory = homedir();
  for (const filename of ['.svelteesp32rc.json', '.svelteesp32rc']) {
    const homePath = path.join(homeDirectory, filename);
    if (existsSync(homePath)) return homePath;
  }

  return undefined;
}

function findPackageJson(rcFilePath: string): string | undefined {
  const rcDirectory = path.dirname(rcFilePath);
  const packageJsonPath = path.join(rcDirectory, 'package.json');
  return existsSync(packageJsonPath) ? packageJsonPath : undefined;
}

function parsePackageJson(packageJsonPath: string): Record<string, unknown> {
  try {
    const content = readFileSync(packageJsonPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse package.json at ${packageJsonPath}: ${(error as Error).message}`);
  }
}

function getNpmPackageVariable(packageJson: Record<string, unknown>, variableName: string): string | undefined {
  const prefix = '$npm_package_';
  if (!variableName.startsWith(prefix)) return undefined;

  const pathString = variableName.slice(prefix.length);
  const pathSegments = pathString.split('_');

  let current: unknown = packageJson;
  for (const segment of pathSegments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  if (current === null || current === undefined) return undefined;
  return String(current);
}

function checkStringForNpmVariable(value: string | undefined): boolean {
  return value?.includes('$npm_package_') ?? false;
}

function hasNpmVariables(config: IRcFileConfig): boolean {
  return (
    checkStringForNpmVariable(config.sourcepath) ||
    checkStringForNpmVariable(config.outputfile) ||
    checkStringForNpmVariable(config.espmethod) ||
    checkStringForNpmVariable(config.define) ||
    checkStringForNpmVariable(config.version) ||
    checkStringForNpmVariable(config.basepath) ||
    (Array.isArray(config.exclude) && config.exclude.some((pattern) => checkStringForNpmVariable(pattern))) ||
    false
  );
}

function interpolateNpmVariables(config: IRcFileConfig, rcFilePath: string): IRcFileConfig {
  // Quick check - return unchanged if no variables
  if (!hasNpmVariables(config)) return config;

  // Find package.json
  const packageJsonPath = findPackageJson(rcFilePath);
  if (!packageJsonPath) {
    const affectedFields: string[] = [];
    if (config.sourcepath?.includes('$npm_package_')) affectedFields.push('sourcepath');
    if (config.outputfile?.includes('$npm_package_')) affectedFields.push('outputfile');
    if (config.version?.includes('$npm_package_')) affectedFields.push('version');
    if (config.espmethod?.includes('$npm_package_')) affectedFields.push('espmethod');
    if (config.define?.includes('$npm_package_')) affectedFields.push('define');
    if (config.basepath?.includes('$npm_package_')) affectedFields.push('basepath');
    if (config.exclude)
      for (const [index, pattern] of config.exclude.entries())
        if (pattern.includes('$npm_package_')) affectedFields.push(`exclude[${index}]`);

    throw new Error(
      `RC file uses npm package variables but package.json not found in ${path.dirname(rcFilePath)}\n` +
        `Variables found in fields: ${affectedFields.join(', ')}\n` +
        `Please ensure package.json exists in the same directory as your RC file.`
    );
  }

  // Parse package.json
  const packageJson = parsePackageJson(packageJsonPath);

  // Interpolation function
  const interpolateString = (value: string): string => {
    // Match $npm_package_ followed by field name (stops at _ + uppercase)
    // This allows: version, repository_type, but stops at _STATIC
    const regex = /\$npm_package_[\dA-Za-z]+(?:_[a-z][\dA-Za-z]*)*/g;
    // eslint-disable-next-line unicorn/prefer-string-replace-all -- replaceAll not available in ES2020
    return value.replace(regex, (match: string) => getNpmPackageVariable(packageJson, match) ?? match);
  };

  // Create new config with interpolated values
  const result: IRcFileConfig = { ...config };

  if (result.sourcepath) result.sourcepath = interpolateString(result.sourcepath);
  if (result.outputfile) result.outputfile = interpolateString(result.outputfile);
  if (result.espmethod) result.espmethod = interpolateString(result.espmethod);
  if (result.define) result.define = interpolateString(result.define);
  if (result.version) result.version = interpolateString(result.version);
  if (result.basepath) result.basepath = interpolateString(result.basepath);
  if (result.exclude) result.exclude = result.exclude.map((pattern) => interpolateString(pattern));

  return result;
}

function loadRcFile(rcPath: string): IRcFileConfig {
  try {
    const content = readFileSync(rcPath, 'utf8');
    const config = JSON.parse(content);

    // Interpolate npm package variables before validation
    const interpolatedConfig = interpolateNpmVariables(config, rcPath);

    return validateRcConfig(interpolatedConfig, rcPath);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`Invalid JSON in RC file ${rcPath}: ${error.message}`);

    throw error;
  }
}

function validateRcConfig(config: unknown, rcPath: string): IRcFileConfig {
  if (typeof config !== 'object' || config === null) throw new Error(`RC file ${rcPath} must contain a JSON object`);

  // Type assertion after runtime check
  const configObject = config as Record<string, unknown>;

  const validKeys = new Set([
    'engine',
    'sourcepath',
    'outputfile',
    'espmethod',
    'define',
    'gzip',
    'etag',
    'cachetime',
    'created',
    'version',
    'exclude',
    'basepath',
    'maxsize',
    'maxgzipsize',
    'noindexcheck',
    'dryrun'
  ]);

  // Warn about unknown keys
  for (const key of Object.keys(configObject))
    if (!validKeys.has(key)) console.warn(yellowLog(`Warning: Unknown property '${key}' in RC file ${rcPath}`));

  // Validate individual properties
  if (configObject['engine'] !== undefined) configObject['engine'] = validateEngine(configObject['engine'] as string);

  if (configObject['etag'] !== undefined)
    configObject['etag'] = validateTriState(configObject['etag'] as string, 'etag');

  if (configObject['gzip'] !== undefined)
    configObject['gzip'] = validateTriState(configObject['gzip'] as string, 'gzip');

  if (configObject['espmethod'] !== undefined) validateCppIdentifier(configObject['espmethod'] as string, 'espmethod');

  if (configObject['define'] !== undefined) validateCppIdentifier(configObject['define'] as string, 'define');

  if (configObject['cachetime'] !== undefined) {
    if (typeof configObject['cachetime'] !== 'number' || Number.isNaN(configObject['cachetime']))
      throw new TypeError(`Invalid cachetime in RC file: ${configObject['cachetime']}`);
    if ((configObject['cachetime'] as number) < 0)
      throw new TypeError(`Invalid cachetime in RC file: ${configObject['cachetime']} (must be non-negative)`);
  }

  if (configObject['exclude'] !== undefined) {
    if (!Array.isArray(configObject['exclude'])) throw new TypeError("'exclude' in RC file must be an array");

    // Validate each exclude pattern is a string
    for (const pattern of configObject['exclude'])
      if (typeof pattern !== 'string') throw new TypeError('All exclude patterns must be strings');
  }

  if (configObject['maxsize'] !== undefined) {
    const value = configObject['maxsize'];
    if (typeof value === 'string')
      try {
        configObject['maxsize'] = parseSize(value, 'maxsize');
      } catch {
        throw new TypeError(
          `Invalid maxsize in RC file: ${value} (must be a positive number with optional k/m suffix)`
        );
      }
    else if (typeof value !== 'number' || Number.isNaN(value) || value <= 0)
      throw new TypeError(`Invalid maxsize in RC file: ${value} (must be a positive number)`);
  }

  if (configObject['maxgzipsize'] !== undefined) {
    const value = configObject['maxgzipsize'];
    if (typeof value === 'string')
      try {
        configObject['maxgzipsize'] = parseSize(value, 'maxgzipsize');
      } catch {
        throw new TypeError(
          `Invalid maxgzipsize in RC file: ${value} (must be a positive number with optional k/m suffix)`
        );
      }
    else if (typeof value !== 'number' || Number.isNaN(value) || value <= 0)
      throw new TypeError(`Invalid maxgzipsize in RC file: ${value} (must be a positive number)`);
  }

  if (configObject['noindexcheck'] !== undefined && typeof configObject['noindexcheck'] !== 'boolean')
    throw new TypeError(`Invalid noindexcheck in RC file: ${configObject['noindexcheck']} (must be boolean)`);

  if (configObject['dryrun'] !== undefined && typeof configObject['dryrun'] !== 'boolean')
    throw new TypeError(`Invalid dryrun in RC file: ${configObject['dryrun']} (must be boolean)`);

  return configObject as IRcFileConfig;
}

function parseArguments(): ICopyFilesArguments {
  const arguments_ = process.argv.slice(2);

  // STEP 1: Check for --config flag first
  let customConfigPath: string | undefined;
  for (let index = 0; index < arguments_.length; index++) {
    const argument = arguments_[index];
    if (!argument) continue;

    if (argument === '--config' && arguments_[index + 1]) {
      customConfigPath = arguments_[index + 1];
      break;
    }
    if (argument.startsWith('--config=')) {
      customConfigPath = argument.slice('--config='.length);
      break;
    }
  }

  // STEP 2: Find and load RC file
  const rcPath = findRcFile(customConfigPath);
  const rcConfig = rcPath ? loadRcFile(rcPath) : {};

  if (rcPath) console.log(cyanLog(`[SvelteESP32] Using config from: ${rcPath}`));

  // STEP 3: Initialize with defaults
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
    exclude: [...DEFAULT_EXCLUDE_PATTERNS],
    basePath: ''
  };

  // STEP 4: Merge RC file values
  if (rcConfig.engine) result.engine = rcConfig.engine;
  if (rcConfig.sourcepath) result.sourcepath = rcConfig.sourcepath;
  if (rcConfig.outputfile) result.outputfile = rcConfig.outputfile;
  if (rcConfig.etag) result.etag = rcConfig.etag;
  if (rcConfig.gzip) result.gzip = rcConfig.gzip;
  if (rcConfig.cachetime !== undefined) result.cachetime = rcConfig.cachetime;
  if (rcConfig.created !== undefined) result.created = rcConfig.created;
  if (rcConfig.version) result.version = rcConfig.version;
  if (rcConfig.espmethod) result.espmethod = rcConfig.espmethod;
  if (rcConfig.define) result.define = rcConfig.define;
  if (rcConfig.basepath !== undefined) result.basePath = validateBasePath(rcConfig.basepath);
  if (rcConfig.maxsize !== undefined) result.maxSize = rcConfig.maxsize as number;
  if (rcConfig.maxgzipsize !== undefined) result.maxGzipSize = rcConfig.maxgzipsize as number;
  if (rcConfig.noindexcheck !== undefined) result.noIndexCheck = rcConfig.noindexcheck;
  if (rcConfig.dryrun !== undefined) result.dryRun = rcConfig.dryrun;

  // Replace defaults with RC exclude if provided
  if (rcConfig.exclude && rcConfig.exclude.length > 0) result.exclude = [...rcConfig.exclude];

  // STEP 5: Parse CLI arguments
  const cliExclude: string[] = [];

  function applyFlag(flagName: string, value: string): void {
    switch (flagName) {
      case 'config':
        // Already processed, skip
        break;
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
        result.espmethod = validateCppIdentifier(value, 'espmethod');
        break;
      case 'define':
        result.define = validateCppIdentifier(value, 'define');
        break;
      case 'cachetime':
        result.cachetime = Number.parseInt(value, 10);
        if (Number.isNaN(result.cachetime)) throw new TypeError(`Invalid cachetime: ${value}`);
        if (result.cachetime < 0) throw new TypeError(`Invalid cachetime: ${value} (must be non-negative)`);
        break;
      case 'exclude': {
        const patterns = value
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean);
        cliExclude.push(...patterns);
        break;
      }
      case 'basepath':
        result.basePath = validateBasePath(value);
        break;
      case 'maxsize':
        result.maxSize = parseSize(value, '--maxsize');
        break;
      case 'maxgzipsize':
        result.maxGzipSize = parseSize(value, '--maxgzipsize');
        break;
      default:
        throw new Error(`Unknown flag: --${flagName}`);
    }
  }

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

      applyFlag(flag.slice(2), value);
      continue;
    }

    // Handle boolean flags without values
    if (argument === '--created') {
      result.created = true;
      continue;
    }

    if (argument === '--noindexcheck') {
      result.noIndexCheck = true;
      continue;
    }

    if (argument === '--dryrun' || argument === '--dry-run') {
      result.dryRun = true;
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

      applyFlag(flag, nextArgument);
      index++;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  // STEP 6: Apply CLI exclude (replaces RC/defaults)
  if (cliExclude.length > 0) result.exclude = [...cliExclude];

  // STEP 7: Validate required arguments
  if (!result.sourcepath) {
    console.error('Error: --sourcepath is required (can be specified in RC file or CLI)');
    showHelp();
  }

  return result as ICopyFilesArguments;
}

// Export functions for testing
export { getNpmPackageVariable, hasNpmVariables, interpolateNpmVariables, parseSize, validateCppIdentifier };

export function formatConfiguration(cmdLine: ICopyFilesArguments): string {
  const parts: string[] = [
    `engine=${cmdLine.engine}`,
    `sourcepath=${cmdLine.sourcepath}`,
    `outputfile=${cmdLine.outputfile}`,
    `etag=${cmdLine.etag}`,
    `gzip=${cmdLine.gzip}`,
    `cachetime=${cmdLine.cachetime}`
  ];

  if (cmdLine.created) parts.push(`created=${cmdLine.created}`);

  if (cmdLine.version) parts.push(`version=${cmdLine.version}`);

  if (cmdLine.espmethod) parts.push(`espmethod=${cmdLine.espmethod}`);

  if (cmdLine.define) parts.push(`define=${cmdLine.define}`);

  if (cmdLine.basePath) parts.push(`basePath=${cmdLine.basePath}`);

  if (cmdLine.maxSize !== undefined) parts.push(`maxSize=${cmdLine.maxSize}`);

  if (cmdLine.maxGzipSize !== undefined) parts.push(`maxGzipSize=${cmdLine.maxGzipSize}`);

  if (cmdLine.exclude.length > 0) parts.push(`exclude=[${cmdLine.exclude.join(', ')}]`);

  return parts.join(' ');
}

export const cmdLine = parseArguments();

if (!existsSync(cmdLine.sourcepath)) {
  console.error(getSourcepathNotFoundError(cmdLine.sourcepath, 'not_found'));
  process.exit(1);
}

if (!statSync(cmdLine.sourcepath).isDirectory()) {
  console.error(getSourcepathNotFoundError(cmdLine.sourcepath, 'not_directory'));
  process.exit(1);
}

console.log(`[SvelteESP32] Generate code for ${cmdLine.engine} engine`);
