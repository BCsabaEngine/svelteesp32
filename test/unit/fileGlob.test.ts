import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getFiles } from '../../src/file';

// No fs/tinyglobby mocks here on purpose: file.test.ts mocks globSync, so it cannot see how the real
// glob engine interprets --exclude patterns against a nested directory layout.
const root = mkdtempSync(path.join(tmpdir(), 'svelteesp32-glob-'));
mkdirSync(path.join(root, 'assets'));
mkdirSync(path.join(root, 'docs'));
for (const file of [
  'index.html',
  'app.js.map',
  'assets/app.js',
  'assets/app.js.map',
  'assets/logo.svg',
  'docs/readme.md',
  'docs/page.ts',
  'docs/page.tsx'
])
  writeFileSync(path.join(root, file), file);

const options = (exclude: string[]) => ({
  sourcepath: root,
  engine: 'psychic' as const,
  exclude,
  noIndexCheck: false
});

const names = (exclude: string[]): string[] =>
  getFiles(options(exclude))
    .keys()
    .toArray()
    .toSorted((a, b) => a.localeCompare(b));

afterAll(() => rmSync(root, { recursive: true, force: true }));

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('getFiles with the real glob engine', () => {
  it('excludes a slash-less pattern at every depth', () => {
    expect(names(['*.map'])).toEqual([
      'assets/app.js',
      'assets/logo.svg',
      'docs/page.ts',
      'docs/page.tsx',
      'docs/readme.md',
      'index.html'
    ]);
  });

  it('keeps patterns with a path anchored to the source directory', () => {
    expect(names(['assets/*.map'])).toContain('app.js.map');
    expect(names(['assets/*.map'])).not.toContain('assets/app.js.map');
  });

  it('supports brace patterns', () => {
    expect(names(['**/*.{ts,tsx}'])).toEqual([
      'app.js.map',
      'assets/app.js',
      'assets/app.js.map',
      'assets/logo.svg',
      'docs/readme.md',
      'index.html'
    ]);
  });

  it('supports an explicit directory exclude', () => {
    expect(names(['docs/**'])).not.toContain('docs/readme.md');
  });

  it('requires index.html in the root: a nested one does not count', () => {
    mkdirSync(path.join(root, 'only-nested', 'sub'), { recursive: true });
    writeFileSync(path.join(root, 'only-nested', 'sub', 'index.html'), 'x');

    expect(() => getFiles({ ...options([]), sourcepath: path.join(root, 'only-nested') })).toThrow(
      'No index.html or index.htm found'
    );
  });
});
