import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as IndexModule from '../../src/index';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn()
}));

vi.mock('node:zlib', () => ({
  gzipSync: vi.fn(() => Buffer.from('gzipped'))
}));

vi.mock('mime-types', () => ({
  lookup: vi.fn(() => 'text/html')
}));

vi.mock('../../src/file', () => ({
  getFiles: vi.fn(() => new Map([['index.html', { content: Buffer.from('<html></html>'), hash: 'abc123' }]]))
}));

vi.mock('../../src/cppCode', () => ({
  getCppCode: vi.fn(() => 'mock-cpp-code')
}));

vi.mock('../../src/commandLine', () => ({
  cmdLine: {
    engine: 'psychic',
    sourcepath: '/test/dist',
    outputfile: '/test/output.h',
    etag: 'never',
    gzip: 'always',
    exclude: [],
    espmethod: 'initSvelteStaticFiles'
  }
}));

const previousFile = (path: string, size: number, sha256?: string): IndexModule['PreviousManifestFile'] => ({
  path,
  size,
  sha256
});

describe('formatChangeSummary', () => {
  let createSourceEntry: IndexModule['createSourceEntry'];
  let formatChangeSummary: IndexModule['formatChangeSummary'];

  beforeEach(async () => {
    vi.resetModules();
    const module_ = await import('../../src/index');
    createSourceEntry = module_.createSourceEntry;
    formatChangeSummary = module_.formatChangeSummary;
  });

  const makeSource = (filename: string, contentString: string, sha256 = 'hash-' + filename, isGzip = false) => {
    const content = Buffer.from(contentString);
    const contentGzip = Buffer.from('gzip-' + contentString);
    return createSourceEntry(
      filename,
      filename.replaceAll(/\W/g, '_'),
      content,
      contentGzip,
      'text/html',
      sha256,
      isGzip
    );
  };

  it('should return "(no changes)" when all files are identical by sha256', () => {
    const sources = [makeSource('index.html', 'hello', 'sha-a'), makeSource('app.js', 'code', 'sha-b')];
    const previous = [previousFile('index.html', 5, 'sha-a'), previousFile('app.js', 4, 'sha-b')];
    const result = formatChangeSummary(sources, previous);
    expect(result).toBe('Change summary: (no changes)');
  });

  it('should show added files with "+" prefix', () => {
    const sources = [makeSource('index.html', 'hello', 'sha-a'), makeSource('new.js', 'newcode', 'sha-new')];
    const previous = [previousFile('index.html', 5, 'sha-a')];
    const result = formatChangeSummary(sources, previous);
    expect(result).toContain('Change summary:');
    expect(result).toContain('+ new.js');
    expect(result).not.toContain('+ index.html');
  });

  it('should show removed files with "-" prefix', () => {
    const sources = [makeSource('index.html', 'hello', 'sha-a')];
    const previous = [previousFile('index.html', 5, 'sha-a'), previousFile('old.js', 1000, 'sha-old')];
    const result = formatChangeSummary(sources, previous);
    expect(result).toContain('Change summary:');
    expect(result).toContain('- old.js');
    expect(result).not.toContain('- index.html');
  });

  it('should show modified files with "~" prefix when sha256 changes', () => {
    const sources = [makeSource('app.js', 'new content here', 'sha-new')];
    const previous = [previousFile('app.js', 5, 'sha-old')];
    const result = formatChangeSummary(sources, previous);
    expect(result).toContain('Change summary:');
    expect(result).toContain('~ app.js');
  });

  it('should show modified files by size diff when previous has no sha256', () => {
    const sources = [makeSource('app.js', 'longer content now', 'sha-any')];
    const previous = [previousFile('app.js', 5)]; // no sha256
    const result = formatChangeSummary(sources, previous);
    expect(result).toContain('~ app.js');
  });

  it('should not mark as modified when size unchanged and no sha256 in previous', () => {
    const content = 'hello';
    const sources = [makeSource('index.html', content, 'sha-new')];
    const previous = [previousFile('index.html', Buffer.from(content).length)]; // same size, no sha256
    const result = formatChangeSummary(sources, previous);
    expect(result).toBe('Change summary: (no changes)');
  });

  it('should show size change for modified files in "old → new" format', () => {
    const sources = [makeSource('app.js', 'a longer version of the file', 'sha-new')];
    const previous = [previousFile('app.js', 5, 'sha-old')];
    const result = formatChangeSummary(sources, previous);
    expect(result).toContain('→');
    expect(result).toContain('5B');
  });

  it('should handle all three change types together', () => {
    const sources = [
      makeSource('index.html', 'hello', 'sha-unchanged'),
      makeSource('changed.js', 'new content', 'sha-new'),
      makeSource('added.css', 'body{}', 'sha-added')
    ];
    const previous = [
      previousFile('index.html', 5, 'sha-unchanged'),
      previousFile('changed.js', 5, 'sha-old'),
      previousFile('removed.js', 100, 'sha-removed')
    ];
    const result = formatChangeSummary(sources, previous);
    expect(result).toContain('+ added.css');
    expect(result).toContain('~ changed.js');
    expect(result).toContain('- removed.js');
    expect(result).not.toContain('index.html');
  });

  it('should handle empty previous list', () => {
    const sources = [makeSource('index.html', 'hello', 'sha-a')];
    const result = formatChangeSummary(sources, []);
    expect(result).toContain('+ index.html');
  });

  it('should handle empty current sources', () => {
    const previous = [previousFile('index.html', 100, 'sha-a')];
    const result = formatChangeSummary([], previous);
    expect(result).toContain('- index.html');
  });
});
