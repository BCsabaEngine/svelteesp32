import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { RC_VALID_KEYS } from '../../src/commandLine';

const schema = JSON.parse(readFileSync(path.join(__dirname, '../../svelteesp32.schema.json'), 'utf8')) as {
  additionalProperties: boolean;
  properties: Record<string, { enum?: string[] }>;
};

describe('svelteesp32.schema.json', () => {
  it('describes exactly the keys the RC validator accepts', () => {
    expect(new Set(Object.keys(schema.properties))).toStrictEqual(RC_VALID_KEYS);
  });

  it('rejects unknown properties, like the validator warns on them', () => {
    expect(schema.additionalProperties).toBe(false);
  });

  it('lists all engines and tri-state values', () => {
    expect(schema.properties['engine']?.enum).toStrictEqual(['psychic', 'async', 'espidf', 'webserver']);
    expect(schema.properties['etag']?.enum).toStrictEqual(['always', 'never', 'compiler']);
    expect(schema.properties['gzip']?.enum).toStrictEqual(['always', 'never', 'compiler']);
  });
});
