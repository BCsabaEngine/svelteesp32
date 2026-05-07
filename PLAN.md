# Plan: Drop Handlebars Runtime Dependency (Issue #112)

## Context

Handlebars is the only non-trivial runtime dependency (~200KB). All templates are already embedded as TypeScript string constants, so replacing the template engine with direct TypeScript generator functions eliminates the dependency with no architectural risk and no public API changes.

## Files to Change

- `src/cppCode.ts` — Remove Handlebars, add TypeScript generators
- `src/cppCodeEspIdf.ts` — Convert template string to generator function
- `package.json` — Remove `"handlebars": "^4.7.9"` from `dependencies`

No test file changes needed — all tests call `getCppCode()` which keeps the same signature.

## Implementation

### 1. Shared `sw()` helper

Add a private helper for the `{{#switch}}{{#case}}` pattern (used ~42 times):

```typescript
const sw = (value: string, cases: Partial<Record<'always' | 'never' | 'compiler', string>>): string =>
  cases[value as 'always' | 'never' | 'compiler'] ?? '';
```

Define this privately in both `cppCode.ts` and `cppCodeEspIdf.ts` (one-liner, no shared file needed).

### 2. `TemplateData` type

Add a named `TemplateData` type (and `TransformedSource = ReturnType<typeof transformSourceToTemplateData>`) to `cppCode.ts` and export it so `cppCodeEspIdf.ts` can import it via `import type`.

### 3. Replace shared section template strings with generator functions (in `cppCode.ts`)

| Old                                            | New                                                        |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `commonHeaderSection` (string)                 | `genCommonHeader(d: TemplateData): string`                 |
| `dataArraysSection(progmem)` (function→string) | `genDataArrays(d: TemplateData, progmem: boolean): string` |
| `etagArraysSection` (string)                   | `genEtagArrays(d: TemplateData): string`                   |
| `manifestSection` (string)                     | `genManifest(d: TemplateData): string`                     |
| `hookSection` (string)                         | `genHook(d: TemplateData): string`                         |

Pattern mapping:

| Handlebars                                            | TypeScript                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------- |
| `{{variable}}` / `{{{variable}}}`                     | `${variable}`                                                       |
| `{{#if cond}}...{{/if}}`                              | `` `${cond ? '...' : ''}` ``                                        |
| `{{#unless cond}}...{{/unless}}`                      | `` `${!cond ? '...' : ''}` ``                                       |
| `{{^cond}}...{{/cond}}`                               | `` `${!cond ? '...' : ''}` ``                                       |
| `{{#each arr}}...{{this.x}}...{{../parent}}{{/each}}` | `arr.map(s => \`...${s.x}...${parent}\`).join('')`                  |
| `{{#switch val}}{{#case "x"}}...{{/case}}{{/switch}}` | `sw(val, { x: '...' })`                                             |
| `{{#this.cacheTime}}{{value}}{{/this.cacheTime}}`     | `` src.cacheTime ? `max-age=${src.cacheTime.value}` : `no-cache` `` |
| `{{#if ../basePath}}{{../basePath}}{{else}}/{{/if}}`  | `d.basePath \|\| '/'`                                               |

### 4. Replace engine template strings with generator functions

| Old constant                           | New function                                       |
| -------------------------------------- | -------------------------------------------------- |
| `psychicTemplate` (string)             | `genPsychicCpp(d: TemplateData): string`           |
| `asyncTemplate` (string)               | `genAsyncCpp(d: TemplateData): string`             |
| `webserverTemplate` (string)           | `genWebserverCpp(d: TemplateData): string`         |
| `espidfTemplate` in `cppCodeEspIdf.ts` | `genEspIdfCpp(d: TemplateData): string` (exported) |

Each engine generator composes the shared section generators + its own per-file handler loop. The `isDefault` special cases (base path route, `server->defaultEndpoint`) map to TypeScript conditionals.

Note for espidf: it uses `unsigned char` (not `uint8_t`), C-style `typedef struct`, no `extern "C"` on hook, so its data arrays and manifest are inlined within `genEspIdfCpp` rather than calling the shared generators.

### 5. Change `getTemplate()` to `getGenerator()`

```typescript
// Old:
const getTemplate = (engine: string): string => { ... };
const rawCode = handlebarsCompile(getTemplate(options.engine))(templateData, { helpers: createHandlebarsHelpers() });

// New:
const getGenerator = (engine: ICopyFilesArguments['engine']): ((d: TemplateData) => string) => {
  switch (engine) {
    case 'psychic':   return genPsychicCpp;
    case 'async':     return genAsyncCpp;
    case 'espidf':    return genEspIdfCpp;
    case 'webserver': return genWebserverCpp;
  }
};
const rawCode = getGenerator(options.engine)(templateData);
```

Using the literal union type ensures switch exhaustiveness — no `default` branch needed.

### 6. `cppCodeEspIdf.ts` changes

```typescript
// Old:
export const espidfTemplate = `...handlebars template string...`;

// New:
import type { TemplateData, TransformedSource } from './cppCode';

const sw = (...) => ...; // same one-liner as in cppCode.ts

export const genEspIdfCpp = (d: TemplateData): string => `...typescript template literal...`;
```

The `import type` from `cppCode.ts` is erased at runtime, so there is no circular value dependency (only `cppCode.ts` imports a value from `cppCodeEspIdf.ts`).

### 7. Remove from `cppCode.ts`

- `import { compile as handlebarsCompile, type HelperOptions } from 'handlebars'`
- `createHandlebarsHelpers()` function
- Change `import { espidfTemplate } from './cppCodeEspIdf'` → `import { genEspIdfCpp } from './cppCodeEspIdf'`

### 8. `package.json`

Remove from `"dependencies"`:

```json
"handlebars": "^4.7.9",
```

## ESLint Notes

- `curly: "multi"` — single-statement `if` bodies must NOT have braces
- Switch on `engine` union must be exhaustive (no `default` needed)
- `consistent-type-imports` — use `import type` for `TemplateData` in `cppCodeEspIdf.ts`

## Verification

```bash
npm run all          # fix + build + test (full validation)
npm test             # just tests if build is already done
```

Spot-check: the generated C++ should contain the same key strings (engine comment, `#define` section, data arrays, handler function, etag/gzip conditionals) as before. The `postProcessCppCode` normalizer handles whitespace differences between old Handlebars output and new generator output.
