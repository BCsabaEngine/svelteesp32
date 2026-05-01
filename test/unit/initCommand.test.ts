import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as rl from 'node:readline/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runInit } from '../../src/initCommand.js';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  writeFileSync: vi.fn()
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn()
}));

vi.mock('node:readline/promises', () => ({
  createInterface: vi.fn()
}));

describe('initCommand', () => {
  const originalArgv = process.argv;
  const originalExit = process.exit;

  let mockRl: { question: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    process.exit = vi.fn() as never;
    process.argv = ['node', '/fake/bin/index.js', 'init'];
    mockRl = { question: vi.fn(), close: vi.fn() };
    vi.mocked(rl.createInterface).mockReturnValue(mockRl as unknown as ReturnType<typeof rl.createInterface>);
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
  });

  describe('happy path with defaults', () => {
    it('writes config with default values when user presses Enter for all prompts', async () => {
      mockRl.question
        .mockResolvedValueOnce('') // engine → psychic
        .mockResolvedValueOnce('') // sourcepath → ./dist
        .mockResolvedValueOnce('') // outputfile → ./svelteesp32.h
        .mockResolvedValueOnce('') // etag → always
        .mockResolvedValueOnce('n'); // run now → no

      await runInit();

      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledOnce();
      const written = vi.mocked(fs.writeFileSync).mock.calls[0]?.[1] as string;
      const config = JSON.parse(written) as Record<string, string>;
      expect(config).toStrictEqual({
        engine: 'psychic',
        sourcepath: './dist',
        outputfile: './svelteesp32.h',
        etag: 'always',
        gzip: 'always'
      });
    });
  });

  describe('happy path with custom values', () => {
    it('writes config with user-provided values', async () => {
      mockRl.question
        .mockResolvedValueOnce('async')
        .mockResolvedValueOnce('./build')
        .mockResolvedValueOnce('./out/web.h')
        .mockResolvedValueOnce('never')
        .mockResolvedValueOnce('n');

      await runInit();

      const written = vi.mocked(fs.writeFileSync).mock.calls[0]?.[1] as string;
      const config = JSON.parse(written) as Record<string, string>;
      expect(config).toStrictEqual({
        engine: 'async',
        sourcepath: './build',
        outputfile: './out/web.h',
        etag: 'never',
        gzip: 'always'
      });
    });
  });

  describe('invalid inputs fall back to defaults', () => {
    it('uses psychic when an invalid engine is entered', async () => {
      mockRl.question
        .mockResolvedValueOnce('bogus')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('n');

      await runInit();

      const written = vi.mocked(fs.writeFileSync).mock.calls[0]?.[1] as string;
      expect(JSON.parse(written)).toMatchObject({ engine: 'psychic' });
    });

    it('uses always when an invalid etag is entered', async () => {
      mockRl.question
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('bogus')
        .mockResolvedValueOnce('n');

      await runInit();

      const written = vi.mocked(fs.writeFileSync).mock.calls[0]?.[1] as string;
      expect(JSON.parse(written)).toMatchObject({ etag: 'always' });
    });

    it('trims whitespace from answers', async () => {
      mockRl.question
        .mockResolvedValueOnce('  async  ')
        .mockResolvedValueOnce('  ./build  ')
        .mockResolvedValueOnce('  ./out.h  ')
        .mockResolvedValueOnce('  compiler  ')
        .mockResolvedValueOnce('n');

      await runInit();

      const written = vi.mocked(fs.writeFileSync).mock.calls[0]?.[1] as string;
      const config = JSON.parse(written) as Record<string, string>;
      expect(config).toMatchObject({ engine: 'async', sourcepath: './build', outputfile: './out.h', etag: 'compiler' });
    });
  });

  describe('existing RC file', () => {
    it('does not write when user declines overwrite', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockRl.question.mockResolvedValueOnce('n');

      await runInit();

      expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled();
    });

    it('writes file when user confirms overwrite', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockRl.question
        .mockResolvedValueOnce('y') // overwrite
        .mockResolvedValueOnce('') // engine
        .mockResolvedValueOnce('') // sourcepath
        .mockResolvedValueOnce('') // outputfile
        .mockResolvedValueOnce('') // etag
        .mockResolvedValueOnce('n'); // run now

      await runInit();

      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledOnce();
    });
  });

  describe('run now prompt', () => {
    it('calls spawnSync when user says yes', async () => {
      mockRl.question
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('y');

      await runInit();

      expect(vi.mocked(childProcess.spawnSync)).toHaveBeenCalledWith('node', ['/fake/bin/index.js'], {
        stdio: 'inherit'
      });
    });

    it('calls spawnSync when user presses Enter (default yes)', async () => {
      mockRl.question
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('');

      await runInit();

      expect(vi.mocked(childProcess.spawnSync)).toHaveBeenCalledOnce();
    });

    it('does not call spawnSync when user says no', async () => {
      mockRl.question
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('n');

      await runInit();

      expect(vi.mocked(childProcess.spawnSync)).not.toHaveBeenCalled();
    });
  });

  describe('output file path', () => {
    it('writes to .svelteesp32rc.json in current directory', async () => {
      mockRl.question
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('n');

      await runInit();

      const writePath = vi.mocked(fs.writeFileSync).mock.calls[0]?.[0] as string;
      expect(writePath).toContain('.svelteesp32rc.json');
    });
  });
});
