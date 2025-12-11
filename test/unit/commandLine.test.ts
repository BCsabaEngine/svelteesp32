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

    it('should parse --no-index-check flag', async () => {
      process.argv = ['node', 'script.js', '--sourcepath=/test/dist', '--no-index-check'];

      const { cmdLine } = await import('../../src/commandLine');

      expect(cmdLine.noIndexCheck).toBe(true);
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

        it('should extract simple field (version)', async () => {
          const { getNpmPackageVariable } = await import('../../src/commandLine');
          const result = getNpmPackageVariable(mockPackageJson, '$npm_package_version');
          expect(result).toBe('1.12.1');
        });

        it('should extract simple field (name)', async () => {
          const { getNpmPackageVariable } = await import('../../src/commandLine');
          const result = getNpmPackageVariable(mockPackageJson, '$npm_package_name');
          expect(result).toBe('svelteesp32');
        });

        it('should extract nested field (repository.type)', async () => {
          const { getNpmPackageVariable } = await import('../../src/commandLine');
          const result = getNpmPackageVariable(mockPackageJson, '$npm_package_repository_type');
          expect(result).toBe('git');
        });

        it('should extract deep nested field (repository.url)', async () => {
          const { getNpmPackageVariable } = await import('../../src/commandLine');
          const result = getNpmPackageVariable(mockPackageJson, '$npm_package_repository_url');
          expect(result).toBe('https://github.com/BCsabaEngine/svelteesp32.git');
        });

        it('should return undefined for non-existent field', async () => {
          const { getNpmPackageVariable } = await import('../../src/commandLine');
          const result = getNpmPackageVariable(mockPackageJson, '$npm_package_nonexistent');
          expect(result).toBeUndefined();
        });

        it('should return undefined for variable without prefix', async () => {
          const { getNpmPackageVariable } = await import('../../src/commandLine');
          const result = getNpmPackageVariable(mockPackageJson, 'version');
          expect(result).toBeUndefined();
        });

        it('should convert non-string values to strings', async () => {
          const { getNpmPackageVariable } = await import('../../src/commandLine');
          const packageJsonWithNumber = { count: 42 };
          const result = getNpmPackageVariable(packageJsonWithNumber, '$npm_package_count');
          expect(result).toBe('42');
        });

        it('should handle null values', async () => {
          const { getNpmPackageVariable } = await import('../../src/commandLine');
          const packageJsonWithNull = { field: undefined };
          const result = getNpmPackageVariable(packageJsonWithNull, '$npm_package_field');
          expect(result).toBeUndefined();
        });

        it('should handle undefined values', async () => {
          const { getNpmPackageVariable } = await import('../../src/commandLine');
          const result = getNpmPackageVariable(mockPackageJson, '$npm_package_undefined_field');
          expect(result).toBeUndefined();
        });
      });

      describe('hasNpmVariables', () => {
        it('should return false when no variables present', async () => {
          const { hasNpmVariables } = await import('../../src/commandLine');
          const config = {
            engine: 'psychic' as const,
            sourcepath: './dist',
            outputfile: './output.h'
          };
          expect(hasNpmVariables(config)).toBe(false);
        });

        it('should return true when variable in version', async () => {
          const { hasNpmVariables } = await import('../../src/commandLine');
          const config = {
            version: 'v$npm_package_version'
          };
          expect(hasNpmVariables(config)).toBe(true);
        });

        it('should return true when variable in sourcepath', async () => {
          const { hasNpmVariables } = await import('../../src/commandLine');
          const config = {
            sourcepath: './$npm_package_name/dist'
          };
          expect(hasNpmVariables(config)).toBe(true);
        });

        it('should return true when variable in define', async () => {
          const { hasNpmVariables } = await import('../../src/commandLine');
          const config = {
            define: '$npm_package_name_STATIC'
          };
          expect(hasNpmVariables(config)).toBe(true);
        });

        it('should return true when variable in exclude array', async () => {
          const { hasNpmVariables } = await import('../../src/commandLine');
          const config = {
            exclude: ['*.map', '$npm_package_name.test.js']
          };
          expect(hasNpmVariables(config)).toBe(true);
        });

        it('should return true for multiple fields with variables', async () => {
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
        it('should return config unchanged when no variables present', async () => {
          const fsModule = await import('node:fs');
          vi.mocked(fsModule.existsSync).mockReturnValue(true);

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
});
