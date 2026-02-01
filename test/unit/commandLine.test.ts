import * as fs from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => '{}'),
  statSync: vi.fn(() => ({ isDirectory: () => true }))
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/user')
}));

describe('commandLine', () => {
  const originalArgv = process.argv;
  const originalExit = process.exit;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exit = vi.fn() as never;
    console.log = vi.fn();
    console.error = vi.fn();
    console.warn = vi.fn();
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    vi.resetModules();
  });

  describe('help display', () => {
    it('should show help text with --help flag', async () => {
      process.argv = ['node', 'script.js', '--help'];

      await import('../../src/commandLine').catch(() => {});

      expect(console.log).toHaveBeenCalled();
      // Find the help output among all console.log calls (first call might be RC file message)
      const allLogCalls = vi.mocked(console.log).mock.calls.map((call) => call[0]);
      const helpOutput = allLogCalls.find((call) => call?.includes('--engine'));
      expect(helpOutput).toBeDefined();
      expect(helpOutput).toContain('svelteesp32');
      expect(helpOutput).toContain('--engine');
      expect(helpOutput).toContain('--sourcepath');
      expect(helpOutput).toContain('--outputfile');
      expect(helpOutput).toContain('--etag');
      expect(helpOutput).toContain('--gzip');
      expect(helpOutput).toContain('--exclude');
      expect(helpOutput).toContain('--basepath');
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should show help text with -h flag', async () => {
      process.argv = ['node', 'script.js', '-h'];

      await import('../../src/commandLine').catch(() => {});

      expect(console.log).toHaveBeenCalled();
      const allLogCalls = vi.mocked(console.log).mock.calls.map((call) => call[0]);
      const helpOutput = allLogCalls.find((call) => call?.includes('svelteesp32 -'));
      expect(helpOutput).toBeDefined();
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should show help when --help is combined with other flags', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test', '--help'];

      await import('../../src/commandLine').catch(() => {});

      expect(console.log).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should include RC file documentation in help', async () => {
      process.argv = ['node', 'script.js', '--help'];

      await import('../../src/commandLine').catch(() => {});

      expect(console.log).toHaveBeenCalled();
      const allLogCalls = vi.mocked(console.log).mock.calls.map((call) => call[0]);
      const helpOutput = allLogCalls.find((call) => call?.includes('RC File'));
      expect(helpOutput).toBeDefined();
      expect(helpOutput).toContain('.svelteesp32rc.json');
    });

    it('should include all engine options in help', async () => {
      process.argv = ['node', 'script.js', '--help'];

      await import('../../src/commandLine').catch(() => {});

      expect(console.log).toHaveBeenCalled();
      const allLogCalls = vi.mocked(console.log).mock.calls.map((call) => call[0]);
      const helpOutput = allLogCalls.find((call) => call?.includes('--engine'));
      expect(helpOutput).toBeDefined();
      expect(helpOutput).toContain('psychic');
      expect(helpOutput).toContain('psychic2');
      expect(helpOutput).toContain('async');
      expect(helpOutput).toContain('espidf');
    });
  });

  describe('edge cases', () => {
    it('should throw error for positional arguments without flag', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', 'unexpected_argument'];

      await expect(import('../../src/commandLine')).rejects.toThrow('Unknown argument: unexpected_argument');
    });

    it('should throw error for multiple positional arguments', async () => {
      process.argv = ['node', 'script.js', 'arg1'];

      await expect(import('../../src/commandLine')).rejects.toThrow('Unknown argument: arg1');
    });

    it('should handle unknown short flag', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '-x', 'value'];

      await expect(import('../../src/commandLine')).rejects.toThrow('Unknown flag: -x');
    });

    it('should handle unknown long flag with value', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--unknown-flag', 'value'];

      await expect(import('../../src/commandLine')).rejects.toThrow('Unknown flag: --unknown-flag');
    });
  });

  describe('argument parsing', () => {
    it('should parse arguments with --flag=value format', async () => {
      process.argv = [
        'node',
        'script.js',
        '--engine=async',
        '--sourcepath=/test/dist',
        '--outputfile=/test/output.h',
        '--etag=true',
        '--gzip=false'
      ];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.engine).toBe('async');
      expect(cmdLine.sourcepath).toBe('/test/dist');
      expect(cmdLine.outputfile).toBe('/test/output.h');
      expect(cmdLine.etag).toBe('true');
      expect(cmdLine.gzip).toBe('false');
    });

    it('should parse arguments with -flag value format', async () => {
      process.argv = ['node', 'script.js', '-e', 'psychic2', '-s', '/test/dist', '-o', '/test/output.h'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.engine).toBe('psychic2');
      expect(cmdLine.sourcepath).toBe('/test/dist');
      expect(cmdLine.outputfile).toBe('/test/output.h');
    });

    it('should parse arguments with --flag value format', async () => {
      process.argv = [
        'node',
        'script.js',
        '--engine',
        'espidf',
        '--sourcepath',
        '/test/dist',
        '--outputfile',
        '/test/output.h'
      ];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.engine).toBe('espidf');
      expect(cmdLine.sourcepath).toBe('/test/dist');
      expect(cmdLine.outputfile).toBe('/test/output.h');
    });

    it('should parse --etag with space format', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--etag', 'true'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.etag).toBe('true');
    });

    it('should parse --gzip with space format', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--gzip', 'compiler'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.gzip).toBe('compiler');
    });

    it('should parse --version with space format', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--version', 'v2.0.0'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.version).toBe('v2.0.0');
    });

    it('should parse --espmethod with space format', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--espmethod', 'myMethod'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.espmethod).toBe('myMethod');
    });

    it('should parse --define with space format', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--define', 'MYPREFIX'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.define).toBe('MYPREFIX');
    });

    it('should parse --cachetime with space format', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--cachetime', '3600'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.cachetime).toBe(3600);
    });

    it('should parse --config with space format', async () => {
      const mockRcContent = JSON.stringify({ engine: 'async', sourcepath: '/test/dist' });

      const fsModule = await import('node:fs');
      vi.mocked(fsModule.existsSync).mockImplementation((path) => {
        return path === '/custom/config.json' || path === '/test/dist';
      });
      vi.mocked(fsModule.readFileSync).mockReturnValue(mockRcContent);
      vi.mocked(fsModule.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

      process.argv = ['node', 'script.js', '--config', '/custom/config.json'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.engine).toBe('async');
    });

    it('should use default values when not specified', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.engine).toBe('psychic');
      expect(cmdLine.outputfile).toBe('svelteesp32.h');
      expect(cmdLine.etag).toBe('false');
      expect(cmdLine.gzip).toBe('true');
      expect(cmdLine.created).toBe(false);
      expect(cmdLine.version).toBe('');
      expect(cmdLine.espmethod).toBe('initSvelteStaticFiles');
      expect(cmdLine.define).toBe('SVELTEESP32');
      expect(cmdLine.cachetime).toBe(0);
    });

    it('should parse boolean flags', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--created'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.created).toBe(true);
    });

    it('should parse --noindexcheck flag', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--noindexcheck'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.noIndexCheck).toBe(true);
    });

    it('should have empty basePath by default', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.basePath).toBe('');
    });

    it('should parse --basepath=/ui with equals format', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--basepath=/ui'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.basePath).toBe('/ui');
    });

    it('should parse --basepath /admin with space format', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--basepath', '/admin'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.basePath).toBe('/admin');
    });

    it('should parse version, espmethod, define, and cachetime', async () => {
      process.argv = [
        'node',
        'script.js',
        '--sourcepath=/test/dist',
        '--version=v1.0.0',
        '--espmethod=myMethod',
        '--define=MYPREFIX',
        '--cachetime=86400'
      ];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.version).toBe('v1.0.0');
      expect(cmdLine.espmethod).toBe('myMethod');
      expect(cmdLine.define).toBe('MYPREFIX');
      expect(cmdLine.cachetime).toBe(86_400);
    });

    it('should handle value with equals sign in --flag=value format', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--version=v1.0.0=beta'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.version).toBe('v1.0.0=beta');
    });
  });

  describe('exclude patterns', () => {
    it('should parse single exclude pattern with --exclude=value format', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--exclude=*.map'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.exclude).toContain('*.map');
      expect(cmdLine.exclude).not.toContain('.DS_Store'); // Replace mode: defaults replaced by CLI
    });

    it('should parse multiple exclude patterns with repeated flag', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--exclude=*.map', '--exclude=*.md'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.exclude).toContain('*.map');
      expect(cmdLine.exclude).toContain('*.md');
    });

    it('should parse comma-separated exclude patterns', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--exclude=*.map,*.md,test/**/*.ts'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.exclude).toContain('*.map');
      expect(cmdLine.exclude).toContain('*.md');
      expect(cmdLine.exclude).toContain('test/**/*.ts');
    });

    it('should combine repeated flags and comma-separated patterns', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--exclude=*.map,*.md', '--exclude=test/**/*.ts'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.exclude).toContain('*.map');
      expect(cmdLine.exclude).toContain('*.md');
      expect(cmdLine.exclude).toContain('test/**/*.ts');
    });

    it('should include default exclude patterns by default', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.exclude).toContain('.DS_Store');
      expect(cmdLine.exclude).toContain('Thumbs.db');
      expect(cmdLine.exclude).toContain('.git');
    });

    it('should handle patterns with spaces after comma', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--exclude=*.map, *.md,  test/**/*.ts'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.exclude).toContain('*.map');
      expect(cmdLine.exclude).toContain('*.md');
      expect(cmdLine.exclude).toContain('test/**/*.ts');
    });

    it('should filter empty patterns after split', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--exclude=*.map,,*.md'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.exclude).toContain('*.map');
      expect(cmdLine.exclude).toContain('*.md');
      // Empty string should not be in array
      expect(cmdLine.exclude.filter((p) => p === '').length).toBe(0);
    });

    it('should parse exclude pattern with --flag value format', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--exclude', '*.map,*.md'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.exclude).toContain('*.map');
      expect(cmdLine.exclude).toContain('*.md');
    });
  });

  describe('validation', () => {
    it('should show enhanced error for invalid engine', async () => {
      process.argv = ['node', 'script.js', '--engine=invalid', '--sourcepath=/test/dist'];

      await import('../../src/commandLine').catch(() => {});

      expect(console.error).toHaveBeenCalled();
      const errorMessage = vi.mocked(console.error).mock.calls[0]?.[0];
      expect(errorMessage).toContain('[ERROR]');
      expect(errorMessage).toContain('Invalid engine');
      expect(errorMessage).toContain("'invalid'");
      expect(errorMessage).toContain('psychic');
      expect(errorMessage).toContain('async');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should accept all valid engine values', async () => {
      for (const engine of ['psychic', 'psychic2', 'async', 'espidf']) {
        vi.resetModules();
        process.argv = ['node', 'script.js', `--engine=${engine}`, '--sourcepath=/test/dist'];

        const { cmdLine } = await import('../../src/commandLine');
        expect(cmdLine.engine).toBe(engine);
      }
    });

    it('should validate etag tri-state values', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--etag=invalid'];

      await expect(import('../../src/commandLine')).rejects.toThrow('Invalid etag: invalid');
    });

    it('should accept all valid etag values', async () => {
      for (const etag of ['true', 'false', 'compiler']) {
        vi.resetModules();
        process.argv = ['node', 'script.js', '--sourcepath=/test/dist', `--etag=${etag}`];

        const { cmdLine } = await import('../../src/commandLine');
        expect(cmdLine.etag).toBe(etag);
      }
    });

    it('should validate gzip tri-state values', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--gzip=invalid'];

      await expect(import('../../src/commandLine')).rejects.toThrow('Invalid gzip: invalid');
    });

    it('should validate cachetime is a number', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--cachetime=notanumber'];

      await expect(import('../../src/commandLine')).rejects.toThrow('Invalid cachetime: notanumber');
    });

    it('should throw error for unknown flag', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--unknown=value'];

      await expect(import('../../src/commandLine')).rejects.toThrow('Unknown flag: --unknown');
    });

    it('should throw error for missing value', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--engine'];

      await expect(import('../../src/commandLine')).rejects.toThrow('Missing value for flag: --engine');
    });

    it('should throw error for invalid argument format', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--='];

      await expect(import('../../src/commandLine')).rejects.toThrow('Invalid argument format: --=');
    });

    it('should reject basePath without leading slash', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--basepath=ui'];

      await expect(import('../../src/commandLine')).rejects.toThrow('basePath must start with /: ui');
    });

    it('should reject basePath with trailing slash', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--basepath=/ui/'];

      await expect(import('../../src/commandLine')).rejects.toThrow('basePath must not end with /: /ui/');
    });

    it('should reject basePath with double slash', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--basepath=/ui//admin'];

      await expect(import('../../src/commandLine')).rejects.toThrow('basePath must not contain //: /ui//admin');
    });

    it('should parse --maxsize with equals format', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--maxsize=400000'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.maxSize).toBe(400_000);
    });

    it('should parse --maxsize with space format', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--maxsize', '500000'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.maxSize).toBe(500_000);
    });

    it('should parse --maxgzipsize with equals format', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--maxgzipsize=150000'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.maxGzipSize).toBe(150_000);
    });

    it('should parse --maxgzipsize with space format', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--maxgzipsize', '200000'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.maxGzipSize).toBe(200_000);
    });

    it('should reject non-numeric --maxsize', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--maxsize=abc'];

      await expect(import('../../src/commandLine')).rejects.toThrow(
        '--maxsize must be a positive number with optional k/K (×1024) or m/M (×1024²) suffix: abc'
      );
    });

    it('should reject negative --maxsize', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--maxsize=-100'];

      await expect(import('../../src/commandLine')).rejects.toThrow(
        '--maxsize must be a positive number with optional k/K (×1024) or m/M (×1024²) suffix: -100'
      );
    });

    it('should reject zero --maxsize', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--maxsize=0'];

      await expect(import('../../src/commandLine')).rejects.toThrow('--maxsize must be a positive integer: 0');
    });

    it('should reject non-numeric --maxgzipsize', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--maxgzipsize=xyz'];

      await expect(import('../../src/commandLine')).rejects.toThrow(
        '--maxgzipsize must be a positive number with optional k/K (×1024) or m/M (×1024²) suffix: xyz'
      );
    });

    it('should have undefined maxSize by default', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.maxSize).toBeUndefined();
    });

    it('should have undefined maxGzipSize by default', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.maxGzipSize).toBeUndefined();
    });

    it('should parse --maxsize with k suffix', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--maxsize=400k'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.maxSize).toBe(409_600); // 400 * 1024
    });

    it('should parse --maxsize with K suffix (uppercase)', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--maxsize=400K'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.maxSize).toBe(409_600); // 400 * 1024
    });

    it('should parse --maxsize with m suffix', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--maxsize=1m'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.maxSize).toBe(1_048_576); // 1 * 1024 * 1024
    });

    it('should parse --maxsize with M suffix (uppercase)', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--maxsize=2M'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.maxSize).toBe(2_097_152); // 2 * 1024 * 1024
    });

    it('should parse --maxsize with decimal and k suffix', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--maxsize=1.5k'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.maxSize).toBe(1536); // 1.5 * 1024
    });

    it('should parse --maxsize with decimal and m suffix', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--maxsize=1.5m'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.maxSize).toBe(1_572_864); // 1.5 * 1024 * 1024
    });

    it('should parse --maxgzipsize with k suffix', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--maxgzipsize=150k'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.maxGzipSize).toBe(153_600); // 150 * 1024
    });

    it('should parse --maxgzipsize with m suffix', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--maxgzipsize=1m'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.maxGzipSize).toBe(1_048_576); // 1 * 1024 * 1024
    });

    it('should reject invalid suffix (g)', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--maxsize=400g'];

      await expect(import('../../src/commandLine')).rejects.toThrow(
        '--maxsize must be a positive number with optional k/K (×1024) or m/M (×1024²) suffix: 400g'
      );
    });

    it('should parse --maxsize with space format and k suffix', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--maxsize', '500k'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.maxSize).toBe(512_000); // 500 * 1024
    });
  });

  describe('required arguments', () => {
    it('should exit when sourcepath is missing', async () => {
      process.argv = ['node', 'script.js'];

      await import('../../src/commandLine').catch(() => {});

      expect(console.error).toHaveBeenCalledWith(
        'Error: --sourcepath is required (can be specified in RC file or CLI)'
      );
      expect(process.exit).toHaveBeenCalledWith(0);
    });
  });

  describe('directory validation', () => {
    it('should show enhanced error when source directory does not exist', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/nonexistent/path'];

      const fsModule = await import('node:fs');
      vi.mocked(fsModule.existsSync).mockReturnValue(false);

      await import('../../src/commandLine').catch(() => {});

      expect(console.error).toHaveBeenCalled();
      const errorMessage = vi.mocked(console.error).mock.calls[0]?.[0];
      expect(errorMessage).toContain('[ERROR]');
      expect(errorMessage).toContain('Source directory not found');
      expect(errorMessage).toContain('/nonexistent/path');
      expect(errorMessage).toContain('npm run build');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should show enhanced error when source path is not a directory', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/file.txt'];

      const fsModule = await import('node:fs');
      vi.mocked(fsModule.existsSync).mockReturnValue(true);
      vi.mocked(fsModule.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);

      await import('../../src/commandLine').catch(() => {});

      expect(console.error).toHaveBeenCalled();
      const errorMessage = vi.mocked(console.error).mock.calls[0]?.[0];
      expect(errorMessage).toContain('[ERROR]');
      expect(errorMessage).toContain('not a directory');
      expect(errorMessage).toContain('/test/file.txt');
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('RC file support', () => {
    describe('RC file discovery', () => {
      it('should load RC file from current directory', async () => {
        const mockRcContent = JSON.stringify({
          engine: 'async',
          sourcepath: '/test/dist',
          etag: 'true'
        });

        const fsModule = await import('node:fs');
        vi.mocked(fsModule.existsSync).mockImplementation((path) => {
          if (path === '/test/dist') return true;
          if (path.toString().includes('.svelteesp32rc.json')) return true;
          return false;
        });
        vi.mocked(fsModule.readFileSync).mockReturnValue(mockRcContent);
        vi.mocked(fsModule.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

        process.argv = ['node', 'script.js'];

        const { cmdLine } = await import('../../src/commandLine');

        expect(cmdLine.engine).toBe('async');
        expect(cmdLine.etag).toBe('true');
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Using config from:'));
      });

      it('should prefer .svelteesp32rc.json over .svelteesp32rc', async () => {
        const mockRcContent = JSON.stringify({ engine: 'psychic2', sourcepath: '/test/dist' });

        const fsModule = await import('node:fs');
        vi.mocked(fsModule.existsSync).mockImplementation((path) => {
          const pathString = path.toString();
          if (pathString.includes('.svelteesp32rc.json')) return true;
          if (pathString.includes('.svelteesp32rc')) return true;
          return pathString === '/test/dist';
        });
        vi.mocked(fsModule.readFileSync).mockReturnValue(mockRcContent);
        vi.mocked(fsModule.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

        process.argv = ['node', 'script.js'];

        const { cmdLine } = await import('../../src/commandLine');

        expect(cmdLine.engine).toBe('psychic2');
      });

      it('should load RC file from home directory when not in current directory', async () => {
        const mockRcContent = JSON.stringify({ engine: 'espidf', sourcepath: '/test/dist' });

        const fsModule = await import('node:fs');
        const osModule = await import('node:os');
        vi.mocked(osModule.homedir).mockReturnValue('/home/user');
        vi.mocked(fsModule.existsSync).mockImplementation((path) => {
          const pathString = path.toString();
          if (pathString.includes('/home/user/.svelteesp32rc.json')) return true;
          return pathString === '/test/dist';
        });
        vi.mocked(fsModule.readFileSync).mockReturnValue(mockRcContent);
        vi.mocked(fsModule.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

        process.argv = ['node', 'script.js'];

        const { cmdLine } = await import('../../src/commandLine');

        expect(cmdLine.engine).toBe('espidf');
      });

      it('should use custom config path when --config specified', async () => {
        const mockRcContent = JSON.stringify({ engine: 'async', sourcepath: '/test/dist' });

        const fsModule = await import('node:fs');
        vi.mocked(fsModule.existsSync).mockImplementation((path) => {
          return path === '/custom/config.json' || path === '/test/dist';
        });
        vi.mocked(fsModule.readFileSync).mockReturnValue(mockRcContent);
        vi.mocked(fsModule.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

        process.argv = ['node', 'script.js', '--config=/custom/config.json'];

        const { cmdLine } = await import('../../src/commandLine');

        expect(cmdLine.engine).toBe('async');
      });

      it('should throw error when custom config file not found', async () => {
        const fsModule = await import('node:fs');
        vi.mocked(fsModule.existsSync).mockReturnValue(false);

        process.argv = ['node', 'script.js', '--config=/missing/config.json'];

        await expect(import('../../src/commandLine')).rejects.toThrow('Config file not found: /missing/config.json');
      });
    });

    describe('CLI override', () => {
      it('should override RC file values with CLI arguments', async () => {
        const mockRcContent = JSON.stringify({
          engine: 'async',
          sourcepath: '/test/dist',
          etag: 'false',
          outputfile: 'rc-output.h'
        });

        const fsModule = await import('node:fs');
        vi.mocked(fsModule.existsSync).mockReturnValue(true);
        vi.mocked(fsModule.readFileSync).mockReturnValue(mockRcContent);
        vi.mocked(fsModule.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

        process.argv = ['node', 'script.js', '--etag=true', '--outputfile=cli-output.h'];

        const { cmdLine } = await import('../../src/commandLine');

        expect(cmdLine.engine).toBe('async'); // From RC
        expect(cmdLine.sourcepath).toBe('/test/dist'); // From RC
        expect(cmdLine.etag).toBe('true'); // Overridden by CLI
        expect(cmdLine.outputfile).toBe('cli-output.h'); // Overridden by CLI
      });

      it('should allow sourcepath from RC file only', async () => {
        const mockRcContent = JSON.stringify({ sourcepath: '/test/dist' });

        const fsModule = await import('node:fs');
        vi.mocked(fsModule.existsSync).mockReturnValue(true);
        vi.mocked(fsModule.readFileSync).mockReturnValue(mockRcContent);
        vi.mocked(fsModule.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

        process.argv = ['node', 'script.js'];

        const { cmdLine } = await import('../../src/commandLine');

        expect(cmdLine.sourcepath).toBe('/test/dist');
      });
    });

    describe('Exclude pattern replace mode', () => {
      it('should use default exclude patterns when no RC or CLI exclude', async () => {
        process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];

        const { cmdLine } = await import('../../src/commandLine');

        expect(cmdLine.exclude).toContain('.DS_Store');
        expect(cmdLine.exclude).toContain('Thumbs.db');
        expect(cmdLine.exclude).toContain('.git');
      });

      it('should replace defaults with RC exclude patterns', async () => {
        const mockRcContent = JSON.stringify({
          sourcepath: '/test/dist',
          exclude: ['*.map', '*.md']
        });

        const fsModule = await import('node:fs');
        vi.mocked(fsModule.existsSync).mockReturnValue(true);
        vi.mocked(fsModule.readFileSync).mockReturnValue(mockRcContent);
        vi.mocked(fsModule.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

        process.argv = ['node', 'script.js'];

        const { cmdLine } = await import('../../src/commandLine');

        expect(cmdLine.exclude).toContain('*.map');
        expect(cmdLine.exclude).toContain('*.md');
        expect(cmdLine.exclude).not.toContain('.DS_Store'); // Defaults replaced
      });

      it('should replace RC exclude patterns with CLI exclude', async () => {
        const mockRcContent = JSON.stringify({
          sourcepath: '/test/dist',
          exclude: ['*.map', '*.md']
        });

        const fsModule = await import('node:fs');
        vi.mocked(fsModule.existsSync).mockReturnValue(true);
        vi.mocked(fsModule.readFileSync).mockReturnValue(mockRcContent);
        vi.mocked(fsModule.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

        process.argv = ['node', 'script.js', '--exclude=*.txt'];

        const { cmdLine } = await import('../../src/commandLine');

        expect(cmdLine.exclude).toContain('*.txt'); // From CLI
        expect(cmdLine.exclude).not.toContain('*.map'); // RC replaced
        expect(cmdLine.exclude).not.toContain('.DS_Store'); // Defaults replaced
      });
    });

    describe('RC file validation', () => {
      it('should throw error for invalid JSON', async () => {
        const fsModule = await import('node:fs');
        vi.mocked(fsModule.existsSync).mockReturnValue(true);
        vi.mocked(fsModule.readFileSync).mockReturnValue('{ invalid json }');

        process.argv = ['node', 'script.js'];

        await expect(import('../../src/commandLine')).rejects.toThrow('Invalid JSON in RC file');
      });

      it('should validate engine values from RC file', async () => {
        const mockRcContent = JSON.stringify({
          sourcepath: '/test/dist',
          engine: 'invalid'
        });

        const fsModule = await import('node:fs');
        vi.mocked(fsModule.existsSync).mockReturnValue(true);
        vi.mocked(fsModule.readFileSync).mockReturnValue(mockRcContent);

        process.argv = ['node', 'script.js'];

        await import('../../src/commandLine').catch(() => {});

        expect(console.error).toHaveBeenCalled();
        const errorMessage = vi.mocked(console.error).mock.calls[0]?.[0];
        expect(errorMessage).toContain('[ERROR]');
        expect(errorMessage).toContain('Invalid engine');
        expect(errorMessage).toContain("'invalid'");
        expect(process.exit).toHaveBeenCalledWith(1);
      });

      it('should validate etag tri-state values from RC file', async () => {
        const mockRcContent = JSON.stringify({
          sourcepath: '/test/dist',
          etag: 'invalid'
        });

        const fsModule = await import('node:fs');
        vi.mocked(fsModule.existsSync).mockReturnValue(true);
        vi.mocked(fsModule.readFileSync).mockReturnValue(mockRcContent);

        process.argv = ['node', 'script.js'];

        await expect(import('../../src/commandLine')).rejects.toThrow('Invalid etag: invalid');
      });

      it('should validate cachetime is a number in RC file', async () => {
        const mockRcContent = JSON.stringify({
          sourcepath: '/test/dist',
          cachetime: 'notanumber'
        });

        const fsModule = await import('node:fs');
        vi.mocked(fsModule.existsSync).mockReturnValue(true);
        vi.mocked(fsModule.readFileSync).mockReturnValue(mockRcContent);

        process.argv = ['node', 'script.js'];

        await expect(import('../../src/commandLine')).rejects.toThrow('Invalid cachetime in RC file');
      });

      it('should validate exclude is an array in RC file', async () => {
        const mockRcContent = JSON.stringify({
          sourcepath: '/test/dist',
          exclude: '*.map'
        });

        const fsModule = await import('node:fs');
        vi.mocked(fsModule.existsSync).mockReturnValue(true);
        vi.mocked(fsModule.readFileSync).mockReturnValue(mockRcContent);

        process.argv = ['node', 'script.js'];

        await expect(import('../../src/commandLine')).rejects.toThrow("'exclude' in RC file must be an array");
      });

      it('should warn about unknown properties in RC file', async () => {
        const mockRcContent = JSON.stringify({
          sourcepath: '/test/dist',
          unknownProp: 'value',
          anotherUnknown: 'test'
        });

        const fsModule = await import('node:fs');
        vi.mocked(fsModule.existsSync).mockReturnValue(true);
        vi.mocked(fsModule.readFileSync).mockReturnValue(mockRcContent);
        vi.mocked(fsModule.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

        process.argv = ['node', 'script.js'];

        await import('../../src/commandLine');

        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("Unknown property 'unknownProp'"));
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("Unknown property 'anotherUnknown'"));
      });

      it('should load basePath from RC file', async () => {
        const mockRcContent = JSON.stringify({
          sourcepath: '/test/dist',
          basePath: '/admin'
        });

        const fsModule = await import('node:fs');
        vi.mocked(fsModule.existsSync).mockReturnValue(true);
        vi.mocked(fsModule.readFileSync).mockReturnValue(mockRcContent);
        vi.mocked(fsModule.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

        process.argv = ['node', 'script.js'];

        const { cmdLine } = await import('../../src/commandLine');

        expect(cmdLine.basePath).toBe('/admin');
      });

      it('should validate basePath from RC file', async () => {
        const mockRcContent = JSON.stringify({
          sourcepath: '/test/dist',
          basePath: 'invalid'
        });

        const fsModule = await import('node:fs');
        vi.mocked(fsModule.existsSync).mockReturnValue(true);
        vi.mocked(fsModule.readFileSync).mockReturnValue(mockRcContent);
        vi.mocked(fsModule.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

        process.argv = ['node', 'script.js'];

        await expect(import('../../src/commandLine')).rejects.toThrow('basePath must start with /: invalid');
      });

      it('should load maxSize from RC file', async () => {
        const mockRcContent = JSON.stringify({
          sourcepath: '/test/dist',
          maxSize: 500_000
        });

        const fsModule = await import('node:fs');
        vi.mocked(fsModule.existsSync).mockReturnValue(true);
        vi.mocked(fsModule.readFileSync).mockReturnValue(mockRcContent);
        vi.mocked(fsModule.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

        process.argv = ['node', 'script.js'];

        const { cmdLine } = await import('../../src/commandLine');

        expect(cmdLine.maxSize).toBe(500_000);
      });

      it('should load maxGzipSize from RC file', async () => {
        const mockRcContent = JSON.stringify({
          sourcepath: '/test/dist',
          maxGzipSize: 200_000
        });

        const fsModule = await import('node:fs');
        vi.mocked(fsModule.existsSync).mockReturnValue(true);
        vi.mocked(fsModule.readFileSync).mockReturnValue(mockRcContent);
        vi.mocked(fsModule.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

        process.argv = ['node', 'script.js'];

        const { cmdLine } = await import('../../src/commandLine');

        expect(cmdLine.maxGzipSize).toBe(200_000);
      });

      it('should validate maxSize is a positive number in RC file', async () => {
        const mockRcContent = JSON.stringify({
          sourcepath: '/test/dist',
          maxSize: -100
        });

        const fsModule = await import('node:fs');
        vi.mocked(fsModule.existsSync).mockReturnValue(true);
        vi.mocked(fsModule.readFileSync).mockReturnValue(mockRcContent);

        process.argv = ['node', 'script.js'];

        await expect(import('../../src/commandLine')).rejects.toThrow('Invalid maxSize in RC file');
      });

      it('should validate maxGzipSize is a positive number in RC file', async () => {
        const mockRcContent = JSON.stringify({
          sourcepath: '/test/dist',
          maxGzipSize: 0
        });

        const fsModule = await import('node:fs');
        vi.mocked(fsModule.existsSync).mockReturnValue(true);
        vi.mocked(fsModule.readFileSync).mockReturnValue(mockRcContent);

        process.argv = ['node', 'script.js'];

        await expect(import('../../src/commandLine')).rejects.toThrow('Invalid maxGzipSize in RC file');
      });

      it('should validate maxSize is not an invalid string in RC file', async () => {
        const mockRcContent = JSON.stringify({
          sourcepath: '/test/dist',
          maxSize: 'notanumber'
        });

        const fsModule = await import('node:fs');
        vi.mocked(fsModule.existsSync).mockReturnValue(true);
        vi.mocked(fsModule.readFileSync).mockReturnValue(mockRcContent);

        process.argv = ['node', 'script.js'];

        await expect(import('../../src/commandLine')).rejects.toThrow('Invalid maxSize in RC file');
      });

      it('should load maxSize with k suffix from RC file', async () => {
        const mockRcContent = JSON.stringify({
          sourcepath: '/test/dist',
          maxSize: '400k'
        });

        const fsModule = await import('node:fs');
        vi.mocked(fsModule.existsSync).mockReturnValue(true);
        vi.mocked(fsModule.readFileSync).mockReturnValue(mockRcContent);
        vi.mocked(fsModule.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

        process.argv = ['node', 'script.js'];

        const { cmdLine } = await import('../../src/commandLine');

        expect(cmdLine.maxSize).toBe(409_600); // 400 * 1024
      });

      it('should load maxSize with m suffix from RC file', async () => {
        const mockRcContent = JSON.stringify({
          sourcepath: '/test/dist',
          maxSize: '1.5m'
        });

        const fsModule = await import('node:fs');
        vi.mocked(fsModule.existsSync).mockReturnValue(true);
        vi.mocked(fsModule.readFileSync).mockReturnValue(mockRcContent);
        vi.mocked(fsModule.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

        process.argv = ['node', 'script.js'];

        const { cmdLine } = await import('../../src/commandLine');

        expect(cmdLine.maxSize).toBe(1_572_864); // 1.5 * 1024 * 1024
      });

      it('should load maxGzipSize with k suffix from RC file', async () => {
        const mockRcContent = JSON.stringify({
          sourcepath: '/test/dist',
          maxGzipSize: '150k'
        });

        const fsModule = await import('node:fs');
        vi.mocked(fsModule.existsSync).mockReturnValue(true);
        vi.mocked(fsModule.readFileSync).mockReturnValue(mockRcContent);
        vi.mocked(fsModule.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

        process.argv = ['node', 'script.js'];

        const { cmdLine } = await import('../../src/commandLine');

        expect(cmdLine.maxGzipSize).toBe(153_600); // 150 * 1024
      });

      it('should reject invalid suffix in maxSize from RC file', async () => {
        const mockRcContent = JSON.stringify({
          sourcepath: '/test/dist',
          maxSize: '400g'
        });

        const fsModule = await import('node:fs');
        vi.mocked(fsModule.existsSync).mockReturnValue(true);
        vi.mocked(fsModule.readFileSync).mockReturnValue(mockRcContent);

        process.argv = ['node', 'script.js'];

        await expect(import('../../src/commandLine')).rejects.toThrow(
          'Invalid maxSize in RC file: 400g (must be a positive number with optional k/m suffix)'
        );
      });
    });

    describe('npm variable interpolation', () => {
      describe('getNpmPackageVariable', () => {
        const mockPackageJson = {
          name: 'svelteesp32',
          version: '1.12.1',
          author: 'BCsabaEngine',
          repository: {
            type: 'git',
            url: 'https://github.com/BCsabaEngine/svelteesp32.git'
          },
          keywords: ['svelte', 'esp32'],
          engines: {
            node: '>=20'
          }
        };

        beforeEach(async () => {
          vi.resetModules();
          const fsModule = await import('node:fs');
          vi.mocked(fsModule.existsSync).mockReturnValue(false);
          vi.mocked(fsModule.readFileSync).mockReturnValue('{}');
        });

        it('should extract simple field (version)', async () => {
          process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
          const { getNpmPackageVariable } = await import('../../src/commandLine');
          const result = getNpmPackageVariable(mockPackageJson, '$npm_package_version');
          expect(result).toBe('1.12.1');
        });

        it('should extract simple field (name)', async () => {
          process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
          const { getNpmPackageVariable } = await import('../../src/commandLine');
          const result = getNpmPackageVariable(mockPackageJson, '$npm_package_name');
          expect(result).toBe('svelteesp32');
        });

        it('should extract nested field (repository.type)', async () => {
          process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
          const { getNpmPackageVariable } = await import('../../src/commandLine');
          const result = getNpmPackageVariable(mockPackageJson, '$npm_package_repository_type');
          expect(result).toBe('git');
        });

        it('should extract deep nested field (repository.url)', async () => {
          process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
          const { getNpmPackageVariable } = await import('../../src/commandLine');
          const result = getNpmPackageVariable(mockPackageJson, '$npm_package_repository_url');
          expect(result).toBe('https://github.com/BCsabaEngine/svelteesp32.git');
        });

        it('should return undefined for non-existent field', async () => {
          process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
          const { getNpmPackageVariable } = await import('../../src/commandLine');
          const result = getNpmPackageVariable(mockPackageJson, '$npm_package_nonexistent');
          expect(result).toBeUndefined();
        });

        it('should return undefined for variable without prefix', async () => {
          process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
          const { getNpmPackageVariable } = await import('../../src/commandLine');
          const result = getNpmPackageVariable(mockPackageJson, 'version');
          expect(result).toBeUndefined();
        });

        it('should convert non-string values to strings', async () => {
          process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
          const { getNpmPackageVariable } = await import('../../src/commandLine');
          const packageJsonWithNumber = { count: 42 };
          const result = getNpmPackageVariable(packageJsonWithNumber, '$npm_package_count');
          expect(result).toBe('42');
        });

        it('should handle null values', async () => {
          process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
          const { getNpmPackageVariable } = await import('../../src/commandLine');
          const packageJsonWithNull = { field: undefined };
          const result = getNpmPackageVariable(packageJsonWithNull, '$npm_package_field');
          expect(result).toBeUndefined();
        });

        it('should handle undefined values', async () => {
          process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
          const { getNpmPackageVariable } = await import('../../src/commandLine');
          const result = getNpmPackageVariable(mockPackageJson, '$npm_package_undefined_field');
          expect(result).toBeUndefined();
        });
      });

      describe('hasNpmVariables', () => {
        beforeEach(async () => {
          vi.resetModules();
          const fsModule = await import('node:fs');
          vi.mocked(fsModule.existsSync).mockReturnValue(false);
          vi.mocked(fsModule.readFileSync).mockReturnValue('{}');
        });

        it('should return false when no variables present', async () => {
          process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
          const { hasNpmVariables } = await import('../../src/commandLine');
          const config = {
            engine: 'psychic' as const,
            sourcepath: './dist',
            outputfile: './output.h'
          };
          expect(hasNpmVariables(config)).toBe(false);
        });

        it('should return true when variable in version', async () => {
          process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
          const { hasNpmVariables } = await import('../../src/commandLine');
          const config = {
            version: 'v$npm_package_version'
          };
          expect(hasNpmVariables(config)).toBe(true);
        });

        it('should return true when variable in sourcepath', async () => {
          process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
          const { hasNpmVariables } = await import('../../src/commandLine');
          const config = {
            sourcepath: './$npm_package_name/dist'
          };
          expect(hasNpmVariables(config)).toBe(true);
        });

        it('should return true when variable in define', async () => {
          process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
          const { hasNpmVariables } = await import('../../src/commandLine');
          const config = {
            define: '$npm_package_name_STATIC'
          };
          expect(hasNpmVariables(config)).toBe(true);
        });

        it('should return true when variable in exclude array', async () => {
          process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
          const { hasNpmVariables } = await import('../../src/commandLine');
          const config = {
            exclude: ['*.map', '$npm_package_name.test.js']
          };
          expect(hasNpmVariables(config)).toBe(true);
        });

        it('should return true when variable in basePath', async () => {
          process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
          const { hasNpmVariables } = await import('../../src/commandLine');
          const config = {
            basePath: '/$npm_package_name'
          };
          expect(hasNpmVariables(config)).toBe(true);
        });

        it('should return true for multiple fields with variables', async () => {
          process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
          const { hasNpmVariables } = await import('../../src/commandLine');
          const config = {
            version: 'v$npm_package_version',
            define: '$npm_package_name',
            exclude: ['$npm_package_name/**/*']
          };
          expect(hasNpmVariables(config)).toBe(true);
        });
      });

      describe('interpolateNpmVariables', () => {
        beforeEach(async () => {
          vi.resetModules();
          const fsModule = await import('node:fs');
          vi.mocked(fsModule.existsSync).mockReturnValue(false);
          vi.mocked(fsModule.readFileSync).mockReturnValue('{}');
        });

        it('should return config unchanged when no variables present', async () => {
          const fsModule = await import('node:fs');
          vi.mocked(fsModule.existsSync).mockReturnValue(true);
          vi.mocked(fsModule.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

          process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
          const { interpolateNpmVariables } = await import('../../src/commandLine');
          const config = {
            engine: 'psychic' as const,
            sourcepath: './dist',
            outputfile: './output.h'
          };
          const result = interpolateNpmVariables(config, '/test/.svelteesp32rc.json');
          expect(result).toEqual(config);
        });

        it('should interpolate version field', async () => {
          const fsModule = await import('node:fs');
          vi.mocked(fsModule.existsSync).mockReturnValue(true);
          vi.mocked(fsModule.readFileSync).mockImplementation((path: string) => {
            if (path.includes('package.json')) return JSON.stringify({ name: 'testapp', version: '1.2.3' });
            return '{}';
          });

          const { interpolateNpmVariables } = await import('../../src/commandLine');
          const config = {
            version: 'v$npm_package_version'
          };
          const result = interpolateNpmVariables(config, '/test/.svelteesp32rc.json');
          expect(result.version).toBe('v1.2.3');
        });

        it('should interpolate multiple fields', async () => {
          const fsModule = await import('node:fs');
          vi.mocked(fsModule.existsSync).mockReturnValue(true);
          vi.mocked(fsModule.readFileSync).mockImplementation((path: string) => {
            if (path.includes('package.json')) return JSON.stringify({ name: 'testapp', version: '1.2.3' });

            return '{}';
          });

          const { interpolateNpmVariables } = await import('../../src/commandLine');
          const config = {
            version: 'v$npm_package_version',
            define: '$npm_package_name_STATIC',
            outputfile: './$npm_package_name.h'
          };
          const result = interpolateNpmVariables(config, '/test/.svelteesp32rc.json');
          expect(result.version).toBe('v1.2.3');
          expect(result.define).toBe('testapp_STATIC');
          expect(result.outputfile).toBe('./testapp.h');
        });

        it('should interpolate exclude array patterns', async () => {
          const fsModule = await import('node:fs');
          vi.mocked(fsModule.existsSync).mockReturnValue(true);
          vi.mocked(fsModule.readFileSync).mockImplementation((path: string) => {
            if (path.includes('package.json')) return JSON.stringify({ name: 'testapp', version: '1.2.3' });

            return '{}';
          });

          const { interpolateNpmVariables } = await import('../../src/commandLine');
          const config = {
            exclude: ['*.map', '$npm_package_name/**/*.test.js']
          };
          const result = interpolateNpmVariables(config, '/test/.svelteesp32rc.json');
          expect(result.exclude).toEqual(['*.map', 'testapp/**/*.test.js']);
        });

        it('should interpolate basePath field', async () => {
          const fsModule = await import('node:fs');
          vi.mocked(fsModule.existsSync).mockReturnValue(true);
          vi.mocked(fsModule.readFileSync).mockImplementation((path: string) => {
            if (path.includes('package.json')) return JSON.stringify({ name: 'testapp', version: '1.2.3' });

            return '{}';
          });

          const { interpolateNpmVariables } = await import('../../src/commandLine');
          const config = {
            basePath: '/$npm_package_name'
          };
          const result = interpolateNpmVariables(config, '/test/.svelteesp32rc.json');
          expect(result.basePath).toBe('/testapp');
        });

        it('should handle mixed static and variable content', async () => {
          const fsModule = await import('node:fs');
          vi.mocked(fsModule.existsSync).mockReturnValue(true);
          vi.mocked(fsModule.readFileSync).mockImplementation((path: string) => {
            if (path.includes('package.json')) return JSON.stringify({ name: 'testapp', version: '1.2.3' });

            return '{}';
          });

          const { interpolateNpmVariables } = await import('../../src/commandLine');
          const config = {
            version: '$npm_package_name-v$npm_package_version-release'
          };
          const result = interpolateNpmVariables(config, '/test/.svelteesp32rc.json');
          expect(result.version).toBe('testapp-v1.2.3-release');
        });

        it('should leave unknown variables unchanged', async () => {
          const fsModule = await import('node:fs');
          vi.mocked(fsModule.existsSync).mockReturnValue(true);
          vi.mocked(fsModule.readFileSync).mockImplementation((path: string) => {
            if (path.includes('package.json')) return JSON.stringify({ name: 'testapp', version: '1.2.3' });

            return '{}';
          });

          const { interpolateNpmVariables } = await import('../../src/commandLine');
          const config = {
            version: 'v$npm_package_unknown_field'
          };
          const result = interpolateNpmVariables(config, '/test/.svelteesp32rc.json');
          expect(result.version).toBe('v$npm_package_unknown_field');
        });

        it('should throw error when variables present but package.json not found', async () => {
          process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];

          const fsModule = await import('node:fs');
          vi.mocked(fsModule.existsSync).mockImplementation((path: string) => {
            if (path === '/test/dist') return true; // sourcepath exists
            if (path.includes('package.json')) return false; // package.json does not exist
            return false;
          });
          vi.mocked(fsModule.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

          const { interpolateNpmVariables } = await import('../../src/commandLine');
          const config = {
            version: 'v$npm_package_version'
          };

          expect(() => interpolateNpmVariables(config, '/test/.svelteesp32rc.json')).toThrow(
            'RC file uses npm package variables but package.json not found'
          );
        });

        it('should list affected fields in error message', async () => {
          process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];

          const fsModule = await import('node:fs');
          vi.mocked(fsModule.existsSync).mockImplementation((path: string) => {
            if (path === '/test/dist') return true; // sourcepath exists
            if (path.includes('package.json')) return false; // package.json does not exist
            return false;
          });
          vi.mocked(fsModule.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

          const { interpolateNpmVariables } = await import('../../src/commandLine');
          const config = {
            version: 'v$npm_package_version',
            define: '$npm_package_name'
          };

          expect(() => interpolateNpmVariables(config, '/test/.svelteesp32rc.json')).toThrow('version, define');
        });

        it('should list exclude array fields in error message when package.json not found', async () => {
          process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];

          const fsModule = await import('node:fs');
          vi.mocked(fsModule.existsSync).mockImplementation((path: string) => {
            if (path === '/test/dist') return true;
            if (path.includes('package.json')) return false;
            return false;
          });
          vi.mocked(fsModule.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

          const { interpolateNpmVariables } = await import('../../src/commandLine');
          const config = {
            exclude: ['*.map', '$npm_package_name/**/*.test.js']
          };

          expect(() => interpolateNpmVariables(config, '/test/.svelteesp32rc.json')).toThrow('exclude[1]');
        });

        it('should list espmethod and basePath in error message when package.json not found', async () => {
          process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];

          const fsModule = await import('node:fs');
          vi.mocked(fsModule.existsSync).mockImplementation((path: string) => {
            if (path === '/test/dist') return true;
            if (path.includes('package.json')) return false;
            return false;
          });
          vi.mocked(fsModule.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

          const { interpolateNpmVariables } = await import('../../src/commandLine');
          const config = {
            espmethod: '$npm_package_name_init',
            basePath: '/$npm_package_name'
          };

          expect(() => interpolateNpmVariables(config, '/test/.svelteesp32rc.json')).toThrow('espmethod');
          expect(() => interpolateNpmVariables(config, '/test/.svelteesp32rc.json')).toThrow('basePath');
        });

        it('should handle nested package.json fields', async () => {
          const fsModule = await import('node:fs');
          vi.mocked(fsModule.existsSync).mockReturnValue(true);
          vi.mocked(fsModule.readFileSync).mockImplementation((path: string) => {
            if (path.includes('package.json'))
              return JSON.stringify({
                name: 'testapp',
                repository: { type: 'git', url: 'https://github.com/test/repo.git' }
              });

            return '{}';
          });

          const { interpolateNpmVariables } = await import('../../src/commandLine');
          const config = {
            version: '$npm_package_repository_type'
          };
          const result = interpolateNpmVariables(config, '/test/.svelteesp32rc.json');
          expect(result.version).toBe('git');
        });

        it('should throw error when package.json has invalid JSON', async () => {
          const fsModule = await import('node:fs');
          vi.mocked(fsModule.existsSync).mockReturnValue(true);
          vi.mocked(fsModule.readFileSync).mockImplementation((path: string) => {
            if (path.includes('package.json')) return '{ invalid json }';
            return '{}';
          });

          const { interpolateNpmVariables } = await import('../../src/commandLine');
          const config = {
            version: 'v$npm_package_version'
          };

          expect(() => interpolateNpmVariables(config, '/test/.svelteesp32rc.json')).toThrow(
            'Failed to parse package.json'
          );
        });
      });

      describe('RC file with npm variables integration', () => {
        it('should load RC file with interpolated variables', async () => {
          const mockRcContent = JSON.stringify({
            engine: 'psychic',
            sourcepath: '/test/dist',
            version: 'v$npm_package_version',
            define: '$npm_package_name'
          });

          const mockPackageJson = JSON.stringify({
            name: 'testapp',
            version: '2.0.0'
          });

          const fsModule = await import('node:fs');
          vi.mocked(fsModule.existsSync).mockImplementation((path: string) => {
            if (path.includes('package.json')) return true;
            if (path.includes('.svelteesp32rc')) return true;
            if (path === '/test/dist') return true;
            return false;
          });

          vi.mocked(fsModule.readFileSync).mockImplementation((path: string) => {
            if (path.includes('package.json')) return mockPackageJson;
            if (path.includes('.svelteesp32rc')) return mockRcContent;
            return '{}';
          });

          vi.mocked(fsModule.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

          process.argv = ['node', 'script.js'];

          const module = await import('../../src/commandLine');

          // The module should execute successfully with interpolated values
          expect(module).toBeDefined();
        });

        it('should fail when using variables without package.json', async () => {
          const mockRcContent = JSON.stringify({
            sourcepath: '/test/dist',
            version: 'v$npm_package_version'
          });

          const fsModule = await import('node:fs');
          vi.mocked(fsModule.existsSync).mockImplementation((path: string) => {
            if (path.includes('package.json')) return false; // package.json doesn't exist
            if (path.includes('.svelteesp32rc')) return true;
            return false;
          });

          vi.mocked(fsModule.readFileSync).mockImplementation((path: string) => {
            if (path.includes('.svelteesp32rc')) return mockRcContent;
            return '{}';
          });

          process.argv = ['node', 'script.js'];

          await expect(import('../../src/commandLine')).rejects.toThrow(
            'RC file uses npm package variables but package.json not found'
          );
        });
      });
    });
  });

  describe('parseSize', () => {
    beforeEach(async () => {
      vi.resetModules();
      const fsModule = await import('node:fs');
      vi.mocked(fsModule.existsSync).mockReturnValue(false);
      vi.mocked(fsModule.readFileSync).mockReturnValue('{}');
    });

    it('should parse plain integer', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
      const { parseSize } = await import('../../src/commandLine');
      expect(parseSize('409600', 'test')).toBe(409_600);
    });

    it('should parse k suffix (lowercase)', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
      const { parseSize } = await import('../../src/commandLine');
      expect(parseSize('400k', 'test')).toBe(409_600);
    });

    it('should parse K suffix (uppercase)', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
      const { parseSize } = await import('../../src/commandLine');
      expect(parseSize('400K', 'test')).toBe(409_600);
    });

    it('should parse m suffix (lowercase)', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
      const { parseSize } = await import('../../src/commandLine');
      expect(parseSize('1m', 'test')).toBe(1_048_576);
    });

    it('should parse M suffix (uppercase)', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
      const { parseSize } = await import('../../src/commandLine');
      expect(parseSize('2M', 'test')).toBe(2_097_152);
    });

    it('should parse decimal with k suffix', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
      const { parseSize } = await import('../../src/commandLine');
      expect(parseSize('1.5k', 'test')).toBe(1536);
    });

    it('should parse decimal with m suffix', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
      const { parseSize } = await import('../../src/commandLine');
      expect(parseSize('1.5m', 'test')).toBe(1_572_864);
    });

    it('should round to nearest integer', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
      const { parseSize } = await import('../../src/commandLine');
      // 1.7k = 1.7 * 1024 = 1740.8 → rounds to 1741
      expect(parseSize('1.7k', 'test')).toBe(1741);
    });

    it('should handle whitespace', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
      const { parseSize } = await import('../../src/commandLine');
      expect(parseSize('  400k  ', 'test')).toBe(409_600);
    });

    it('should reject invalid suffix', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
      const { parseSize } = await import('../../src/commandLine');
      expect(() => parseSize('400g', 'test')).toThrow(
        'test must be a positive number with optional k/K (×1024) or m/M (×1024²) suffix: 400g'
      );
    });

    it('should reject non-numeric value', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
      const { parseSize } = await import('../../src/commandLine');
      expect(() => parseSize('abc', 'test')).toThrow(
        'test must be a positive number with optional k/K (×1024) or m/M (×1024²) suffix: abc'
      );
    });

    it('should reject zero', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
      const { parseSize } = await import('../../src/commandLine');
      expect(() => parseSize('0', 'test')).toThrow('test must be a positive integer: 0');
    });

    it('should reject negative numbers', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
      const { parseSize } = await import('../../src/commandLine');
      expect(() => parseSize('-100', 'test')).toThrow(
        'test must be a positive number with optional k/K (×1024) or m/M (×1024²) suffix: -100'
      );
    });

    it('should parse decimal without suffix', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist'];
      const { parseSize } = await import('../../src/commandLine');
      expect(parseSize('1024.5', 'test')).toBe(1025); // Rounds to nearest integer
    });
  });

  describe('formatConfiguration', () => {
    beforeEach(() => {
      vi.resetModules();
      process.argv = [
        'node',
        'script.js',
        '--engine=psychic',
        '--sourcepath=/test/dist',
        '--outputfile=/test/output.h'
      ];
      // Ensure the mocks return expected values
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.existsSync).mockReturnValue(false); // No RC file exists
    });

    it('should format basic configuration', async () => {
      const mockConfig = {
        engine: 'psychic' as const,
        sourcepath: '/test/dist',
        outputfile: '/test/output.h',
        etag: 'true' as const,
        gzip: 'true' as const,
        cachetime: 3600,
        exclude: [],
        noindexcheck: false
      };

      const { formatConfiguration } = await import('../../src/commandLine');
      const result = formatConfiguration(mockConfig);

      expect(result).toContain('engine=psychic');
      expect(result).toContain('sourcepath=/test/dist');
      expect(result).toContain('outputfile=/test/output.h');
      expect(result).toContain('etag=');
      expect(result).toContain('gzip=');
      expect(result).toContain('cachetime=');
    });

    it('should include created when true', async () => {
      vi.resetModules();
      const mockConfig = {
        engine: 'psychic' as const,
        sourcepath: '/test/dist',
        outputfile: '/test/output.h',
        etag: 'true' as const,
        gzip: 'true' as const,
        cachetime: 3600,
        exclude: [],
        noindexcheck: false,
        created: true
      };

      const { formatConfiguration } = await import('../../src/commandLine');
      const result = formatConfiguration(mockConfig);
      expect(result).toContain('created=true');
    });

    it('should omit created when false or undefined', async () => {
      vi.resetModules();
      const mockConfig = {
        engine: 'psychic' as const,
        sourcepath: '/test/dist',
        outputfile: '/test/output.h',
        etag: 'true' as const,
        gzip: 'true' as const,
        cachetime: 3600,
        exclude: [],
        noindexcheck: false
      };

      const { formatConfiguration } = await import('../../src/commandLine');
      const result = formatConfiguration(mockConfig);
      expect(result).not.toContain('created=');
    });

    it('should include version when present', async () => {
      vi.resetModules();
      const mockConfig = {
        engine: 'psychic' as const,
        sourcepath: '/test/dist',
        outputfile: '/test/output.h',
        etag: 'true' as const,
        gzip: 'true' as const,
        cachetime: 3600,
        exclude: [],
        noindexcheck: false,
        version: 'v1.2.3'
      };

      const { formatConfiguration } = await import('../../src/commandLine');
      const result = formatConfiguration(mockConfig);
      expect(result).toContain('version=v1.2.3');
    });

    it('should omit version when empty or undefined', async () => {
      vi.resetModules();
      const mockConfig = {
        engine: 'psychic' as const,
        sourcepath: '/test/dist',
        outputfile: '/test/output.h',
        etag: 'true' as const,
        gzip: 'true' as const,
        cachetime: 3600,
        exclude: [],
        noindexcheck: false
      };

      const { formatConfiguration } = await import('../../src/commandLine');
      const result = formatConfiguration(mockConfig);
      expect(result).not.toContain('version=');
    });

    it('should include espmethod when present', async () => {
      vi.resetModules();
      const mockConfig = {
        engine: 'psychic' as const,
        sourcepath: '/test/dist',
        outputfile: '/test/output.h',
        etag: 'true' as const,
        gzip: 'true' as const,
        cachetime: 3600,
        exclude: [],
        noindexcheck: false,
        espmethod: 'GET'
      };

      const { formatConfiguration } = await import('../../src/commandLine');
      const result = formatConfiguration(mockConfig);
      expect(result).toContain('espmethod=GET');
    });

    it('should include define when present', async () => {
      vi.resetModules();
      const mockConfig = {
        engine: 'psychic' as const,
        sourcepath: '/test/dist',
        outputfile: '/test/output.h',
        etag: 'true' as const,
        gzip: 'true' as const,
        cachetime: 3600,
        exclude: [],
        noindexcheck: false,
        define: 'MY_DEFINE'
      };

      const { formatConfiguration } = await import('../../src/commandLine');
      const result = formatConfiguration(mockConfig);
      expect(result).toContain('define=MY_DEFINE');
    });

    it('should include basePath when present', async () => {
      vi.resetModules();
      const mockConfig = {
        engine: 'psychic' as const,
        sourcepath: '/test/dist',
        outputfile: '/test/output.h',
        etag: 'true' as const,
        gzip: 'true' as const,
        cachetime: 3600,
        exclude: [],
        noindexcheck: false,
        basePath: '/admin'
      };

      const { formatConfiguration } = await import('../../src/commandLine');
      const result = formatConfiguration(mockConfig);
      expect(result).toContain('basePath=/admin');
    });

    it('should omit basePath when empty', async () => {
      vi.resetModules();
      const mockConfig = {
        engine: 'psychic' as const,
        sourcepath: '/test/dist',
        outputfile: '/test/output.h',
        etag: 'true' as const,
        gzip: 'true' as const,
        cachetime: 3600,
        exclude: [],
        noindexcheck: false,
        basePath: ''
      };

      const { formatConfiguration } = await import('../../src/commandLine');
      const result = formatConfiguration(mockConfig);
      expect(result).not.toContain('basePath=');
    });

    it('should format exclude array correctly', async () => {
      vi.resetModules();
      const mockConfig = {
        engine: 'psychic' as const,
        sourcepath: '/test/dist',
        outputfile: '/test/output.h',
        etag: 'true' as const,
        gzip: 'true' as const,
        cachetime: 3600,
        exclude: ['*.map', '*.md'],
        noindexcheck: false
      };

      const { formatConfiguration } = await import('../../src/commandLine');
      const result = formatConfiguration(mockConfig);
      expect(result).toContain('exclude=[*.map, *.md]');
    });

    it('should omit exclude when empty array', async () => {
      vi.resetModules();
      const mockConfig = {
        engine: 'psychic' as const,
        sourcepath: '/test/dist',
        outputfile: '/test/output.h',
        etag: 'true' as const,
        gzip: 'true' as const,
        cachetime: 3600,
        exclude: [],
        noindexcheck: false
      };

      const { formatConfiguration } = await import('../../src/commandLine');
      const result = formatConfiguration(mockConfig);
      expect(result).not.toContain('exclude=');
    });

    it('should include maxSize when present', async () => {
      vi.resetModules();
      const mockConfig = {
        engine: 'psychic' as const,
        sourcepath: '/test/dist',
        outputfile: '/test/output.h',
        etag: 'true' as const,
        gzip: 'true' as const,
        cachetime: 3600,
        exclude: [],
        noindexcheck: false,
        maxSize: 500_000
      };

      const { formatConfiguration } = await import('../../src/commandLine');
      const result = formatConfiguration(mockConfig);
      expect(result).toContain('maxSize=500000');
    });

    it('should include maxGzipSize when present', async () => {
      vi.resetModules();
      const mockConfig = {
        engine: 'psychic' as const,
        sourcepath: '/test/dist',
        outputfile: '/test/output.h',
        etag: 'true' as const,
        gzip: 'true' as const,
        cachetime: 3600,
        exclude: [],
        noindexcheck: false,
        maxGzipSize: 200_000
      };

      const { formatConfiguration } = await import('../../src/commandLine');
      const result = formatConfiguration(mockConfig);
      expect(result).toContain('maxGzipSize=200000');
    });

    it('should omit maxSize when undefined', async () => {
      vi.resetModules();
      const mockConfig = {
        engine: 'psychic' as const,
        sourcepath: '/test/dist',
        outputfile: '/test/output.h',
        etag: 'true' as const,
        gzip: 'true' as const,
        cachetime: 3600,
        exclude: [],
        noindexcheck: false
      };

      const { formatConfiguration } = await import('../../src/commandLine');
      const result = formatConfiguration(mockConfig);
      expect(result).not.toContain('maxSize=');
      expect(result).not.toContain('maxGzipSize=');
    });

    it('should handle all optional fields present', async () => {
      vi.resetModules();
      const mockConfig = {
        engine: 'psychic' as const,
        sourcepath: '/test/dist',
        outputfile: '/test/output.h',
        etag: 'true' as const,
        gzip: 'true' as const,
        cachetime: 3600,
        exclude: ['*.map'],
        noindexcheck: false,
        created: true,
        version: 'v1.0.0',
        espmethod: 'GET',
        define: 'MY_APP'
      };

      const { formatConfiguration } = await import('../../src/commandLine');
      const result = formatConfiguration(mockConfig);
      expect(result).toContain('created=true');
      expect(result).toContain('version=v1.0.0');
      expect(result).toContain('espmethod=GET');
      expect(result).toContain('define=MY_APP');
      expect(result).toContain('exclude=[*.map]');
    });

    it('should handle all optional fields absent', async () => {
      vi.resetModules();
      const mockConfig = {
        engine: 'psychic' as const,
        sourcepath: '/test/dist',
        outputfile: '/test/output.h',
        etag: 'true' as const,
        gzip: 'true' as const,
        cachetime: 3600,
        exclude: [],
        noindexcheck: false
      };

      const { formatConfiguration } = await import('../../src/commandLine');
      const result = formatConfiguration(mockConfig);
      expect(result).not.toContain('created=');
      expect(result).not.toContain('version=');
      expect(result).not.toContain('espmethod=');
      expect(result).not.toContain('define=');
      expect(result).not.toContain('exclude=');
    });
  });
});
