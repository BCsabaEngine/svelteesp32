import { randomBytes } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatFindings, runChecks } from '../../src/doctor';
import type { FileData } from '../../src/file';

type Options = Parameters<typeof runChecks>[1];

const makeFiles = (entries: Record<string, string | Buffer>): Map<string, FileData> =>
  new Map(
    Object.entries(entries).map(([name, content]) => [name, { content: Buffer.from(content), hash: name }] as const)
  );

const options = (overrides: Partial<Options> = {}): Options => ({ engine: 'psychic', basePath: '', ...overrides });

const html = (body: string): string => `<html><head>${body}</head><body></body></html>`;
const checksOf = (findings: ReturnType<typeof runChecks>): string[] => findings.map((f) => `${f.severity}:${f.check}`);

describe('doctor runChecks', () => {
  it('reports nothing for a clean build', () => {
    const files = makeFiles({
      'index.html': html('<script src="/assets/app.js"></script><link rel="stylesheet" href="/assets/app.css">'),
      'assets/app.js': 'console.log(1)',
      'assets/app.css': 'body{background:url(/assets/bg.png)}',
      'assets/bg.png': 'png'
    });
    expect(runChecks(files, options())).toEqual([]);
  });

  it('flags an empty directory', () => {
    expect(checksOf(runChecks(new Map(), options()))).toEqual(['error:empty']);
  });

  describe('index', () => {
    it('errors without index.html unless noIndexCheck', () => {
      const files = makeFiles({ 'app.js': 'x' });
      expect(checksOf(runChecks(files, options()))).toEqual(['error:index']);
      expect(runChecks(files, options({ noIndexCheck: true }))).toEqual([]);
    });
  });

  describe('basepath', () => {
    const files = makeFiles({
      'index.html': html('<script src="/assets/app.js"></script>'),
      'assets/app.js': 'x'
    });

    it('errors when absolute refs ignore --basepath and hints the prefix', () => {
      const [finding, ...rest] = runChecks(files, options({ basePath: '/app' }));
      expect(rest).toEqual([]);
      expect(finding).toMatchObject({ severity: 'error', check: 'basepath', items: ['index.html → /assets/app.js'] });
      expect(finding?.hint).toContain("'/'");
      expect(finding?.hint).toContain("'/app'");
    });

    it('errors when the build was made for a prefix but --basepath is unset', () => {
      const prefixed = makeFiles({
        'index.html': html('<script src="/app/assets/app.js"></script>'),
        'assets/app.js': 'x'
      });
      const [finding] = runChecks(prefixed, options());
      expect(finding?.check).toBe('basepath');
      expect(finding?.hint).toContain('--basepath=/app');
    });

    it('passes when the refs carry the base path', () => {
      const prefixed = makeFiles({
        'index.html': html('<script src="/app/assets/app.js"></script>'),
        'assets/app.js': 'x'
      });
      expect(runChecks(prefixed, options({ basePath: '/app' }))).toEqual([]);
    });

    it('ignores anchors, data URIs and query strings', () => {
      const tolerant = makeFiles({
        'index.html':
          html('<link rel="icon" href="data:image/png;base64,AA"><script src="/a.js?v=1"></script>') +
          '<a href="/somewhere-else">x</a>',
        'a.js': 'x'
      });
      expect(runChecks(tolerant, options())).toEqual([]);
    });

    it('warns about relative refs under a base path', () => {
      const relative = makeFiles({
        'index.html': html('<script src="./assets/app.js"></script>'),
        'assets/app.js': 'x'
      });
      expect(checksOf(runChecks(relative, options({ basePath: '/app' })))).toEqual(['warning:basepath']);
    });

    it('resolves css url() relative to the stylesheet and reports dangling ones', () => {
      const css = makeFiles({
        'index.html': html('<link rel="stylesheet" href="/s/a.css">'),
        's/a.css': '@import "b.css"; div{background:url("missing.png")}',
        's/b.css': ''
      });
      const [finding] = runChecks(css, options());
      expect(finding?.items).toEqual(['s/a.css → missing.png']);
    });

    it('resolves directory references to an index file', () => {
      const directory = makeFiles({ 'index.html': html('<meta name="x"><img src="/">') });
      expect(runChecks(directory, options())).toEqual([]);
    });

    it('reports a reference that escapes the root', () => {
      const escape = makeFiles({ 'index.html': html('<script src="../x.js"></script>') });
      expect(checksOf(runChecks(escape, options()))).toEqual(['error:basepath']);
    });

    it('reads srcset candidates', () => {
      const set = makeFiles({ 'index.html': html('<img srcset="/a.png 1x, /b.png 2x">'), 'a.png': 'x' });
      expect(runChecks(set, options())[0]?.items).toEqual(['index.html → /b.png']);
    });
  });

  describe('cdn', () => {
    it('warns for external assets in html and css', () => {
      const files = makeFiles({
        'index.html': html(
          '<link rel="stylesheet" href="https://fonts.googleapis.com/css"><script src="//unpkg.com/x.js"></script>'
        ),
        'a.css': '@import url(https://cdn.example.com/x.css);'
      });
      const cdn = runChecks(files, options()).find((f) => f.check === 'cdn');
      expect(cdn?.severity).toBe('warning');
      expect(cdn?.items).toHaveLength(3);
    });

    it('scans js only for known CDN hosts', () => {
      const files = makeFiles({
        'index.html': html(''),
        'a.js': 'const ns="http://www.w3.org/2000/svg"',
        'b.js': 'import("https://cdn.jsdelivr.net/npm/x")'
      });
      const cdn = runChecks(files, options()).find((f) => f.check === 'cdn');
      expect(cdn?.items).toEqual(['b.js → https://cdn.jsdelivr.net/npm/x']);
    });

    it('does not flag canonical links or plain anchors', () => {
      const files = makeFiles({
        'index.html': html('<link rel="canonical" href="https://example.com/">') + '<a href="https://example.com">x</a>'
      });
      expect(runChecks(files, options())).toEqual([]);
    });
  });

  describe('leftovers and size', () => {
    it('warns about source maps with an exclude hint', () => {
      const files = makeFiles({ 'index.html': html(''), 'a.js.map': '{}', 'x.ts': '' });
      const findings = runChecks(files, options());
      expect(findings.map((f) => f.hint)).toEqual([
        'Add --exclude="**/*.map" (or "exclude" in the RC file).',
        'Add --exclude="**/*.{ts,tsx,scss,sass,less,svelte,vue}" (or "exclude" in the RC file).'
      ]);
    });

    it('warns about a dominant file', () => {
      const big = randomBytes(300_000);
      const files = makeFiles({ 'index.html': html(''), 'big.bin': big });
      const findings = runChecks(files, options());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toContain('big.bin');
    });

    it('does not warn about small builds', () => {
      expect(runChecks(makeFiles({ 'index.html': html(''), 'a.js': 'x'.repeat(5000) }), options())).toEqual([]);
    });

    it('warns when one file eats more than half of --maxsize', () => {
      const files = makeFiles({ 'index.html': html(''), 'a.js': 'x'.repeat(600) });
      const findings = runChecks(files, options({ maxSize: 1000 }));
      expect(checksOf(findings)).toEqual(['warning:size']);
      expect(findings[0]?.message).toContain('--maxsize');
    });
  });

  describe('uri length', () => {
    const longName = 'd/'.repeat(260) + 'a.js';
    const files = makeFiles({ 'index.html': html(''), [longName]: 'x' });

    it.each(['psychic', 'espidf'] as const)('errors for %s', (engine) => {
      expect(checksOf(runChecks(files, options({ engine })))).toEqual(['error:uri']);
    });

    it.each(['async', 'webserver'] as const)('is not enforced for %s', (engine) => {
      expect(runChecks(files, options({ engine }))).toEqual([]);
    });

    it('counts the base path', () => {
      const name = 'a'.repeat(507) + '.js';
      const near = makeFiles({ 'index.html': html(''), [name]: 'x' });
      expect(runChecks(near, options())).toEqual([]);
      expect(checksOf(runChecks(near, options({ basePath: '/ui' })))).toEqual(['error:uri']);
    });
  });

  describe('collisions', () => {
    it('detects names that sanitize to the same identifier, case-insensitively', () => {
      const files = makeFiles({ 'index.html': html(''), 'a-b.js': 'x', 'a_b.js': 'y', 'A_B.js': 'z' });
      const [finding] = runChecks(files, options());
      expect(finding).toMatchObject({ severity: 'error', check: 'collision' });
      expect(finding?.items).toHaveLength(1);
    });
  });
});

describe('doctor formatFindings', () => {
  it('summarises a clean run', () => {
    expect(formatFindings([], 3)).toContain('3 file(s) checked, no problems found');
  });

  it('truncates long item lists and prints hints', () => {
    const items = Array.from({ length: 10 }, (_, index) => `item${index}`);
    const output = formatFindings([{ severity: 'error', check: 'x', message: 'm', items, hint: 'fix it' }], 1);
    expect(output).toContain('… and 2 more');
    expect(output).toContain('fix it');
    expect(output).toContain('1 error(s), 0 warning(s)');
  });
});

describe('doctor main', () => {
  const originalArgv = process.argv;
  const originalExit = process.exit;

  beforeEach(() => {
    vi.resetModules();
    process.exit = vi.fn(() => {
      throw new Error('exit');
    }) as never;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
    vi.restoreAllMocks();
    vi.doUnmock('../../src/commandLine');
    vi.doUnmock('../../src/file');
  });

  const runMain = async (files: Map<string, FileData>, argv: string[] = []): Promise<void> => {
    process.argv = ['node', 'doctor', ...argv];
    vi.doMock('../../src/commandLine', () => ({
      parseArguments: () => ({ engine: 'psychic', sourcepath: '.', basePath: '', exclude: [] })
    }));
    vi.doMock('../../src/file', () => ({ getFiles: () => files }));
    const { main } = await import('../../src/doctor');
    main();
  };

  it('exits 0 on a clean build', async () => {
    await runMain(makeFiles({ 'index.html': html('') }));
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('exits 1 on errors', async () => {
    await expect(runMain(makeFiles({ 'a.js': 'x' }))).rejects.toThrow('exit');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('lets warnings pass unless --strict', async () => {
    const files = makeFiles({ 'index.html': html(''), 'a.map': '{}' });
    await runMain(files);
    expect(process.exit).not.toHaveBeenCalled();
    await expect(runMain(files, ['--strict'])).rejects.toThrow('exit');
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
