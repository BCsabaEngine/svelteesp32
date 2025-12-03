import * as fs from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  statSync: vi.fn(() => ({ isDirectory: () => true }))
}));

describe('commandLine', () => {
  const originalArgv = process.argv;
  const originalExit = process.exit;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exit = vi.fn() as never;
    console.log = vi.fn();
    console.error = vi.fn();
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
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
      expect(cmdLine.exclude).toContain('.DS_Store'); // Default patterns still present
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

      expect(console.error).toHaveBeenCalledWith('Error: --sourcepath is required');
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
});
