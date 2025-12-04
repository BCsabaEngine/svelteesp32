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
    it('should validate engine values', async () => {
      process.argv = ['node', 'script.js', '--engine=invalid', '--sourcepath=/test/dist'];

      await expect(import('../../src/commandLine')).rejects.toThrow('Invalid engine: invalid');
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
    it('should exit when source directory does not exist', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/nonexistent/path'];

      const fsModule = await import('node:fs');
      vi.mocked(fsModule.existsSync).mockReturnValue(false);

      await import('../../src/commandLine').catch(() => {});

      expect(console.error).toHaveBeenCalledWith('Directory /nonexistent/path not exists or not a directory');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should exit when source path is not a directory', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/file.txt'];

      const fsModule = await import('node:fs');
      vi.mocked(fsModule.existsSync).mockReturnValue(true);
      vi.mocked(fsModule.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);

      await import('../../src/commandLine').catch(() => {});

      expect(console.error).toHaveBeenCalledWith('Directory /test/file.txt not exists or not a directory');
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

        await expect(import('../../src/commandLine')).rejects.toThrow('Invalid engine: invalid');
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
    });
  });
});
