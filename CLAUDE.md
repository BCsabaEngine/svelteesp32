# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TypeScript CLI tool converting frontend apps (Svelte, React, Angular, Vue) into C++ header files for ESP32/ESP8266 web servers. Gzip compression, ETag support, 3 engines.

## Commands

```bash
npm run build          # Build TypeScript (clean + force rebuild)
npm run fix            # Fix formatting and linting (prettier + eslint + prettier)
npm run test           # Run unit tests (vitest run)
npm run test:coverage  # Coverage report
npm run all            # Fix + build + test (full validation)
npx vitest run test/unit/file.test.ts              # Run a single test file
npx vitest run test/unit/file.test.ts -t "test name" # Run a specific test by name
npx tsx src/index.ts -e psychic -s ./demo/svelte/dist -o ./output.h --etag=true --gzip=true
```

## Architecture

### Core Files

- `src/index.ts` — Main pipeline (`main()`), compression, MIME types, `--dryrun` mode
- `src/commandLine.ts` — CLI parsing (native `process.argv`), RC files, npm variable interpolation, C++ identifier validation
- `src/file.ts` — Glob scanning, SHA256 hashing, duplicate detection, index.html validation. Returns `Map<string, FileData>` where `FileData = { content: Buffer; hash: string }`
- `src/cppCode.ts` — Handlebars templates for psychic/async engines (data arrays, etag arrays, manifest, hook sections)
- `src/cppCodeEspIdf.ts` — ESP-IDF engine code generation
- `src/errorMessages.ts` — Framework-specific error messages

### Engines

- **psychic** — PsychicHttpServer V2 API, ESP32 only
- **async** — ESPAsyncWebServer, ESP32/ESP8266, PROGMEM
- **espidf** — Native ESP-IDF, `unsigned char` data arrays with `(const char *)` casts

### Pipeline

File Collection → MIME/SHA256 → Gzip (level 9, >1024B, >15% reduction) → Handlebars templates → C++ header

### CLI Options

`-s` (source), `-e` (engine), `-o` (output), `--etag` (true/false/compiler), `--gzip` (true/false/compiler), `--exclude` (glob patterns), `--basepath` (URL prefix, must start with `/`, no trailing `/`), `--noindexcheck`, `--dryrun`, `--cachetime`, `--define`, `--espmethod`

RC files: `.svelteesp32rc.json` in cwd, home, or `--config=path`. Supports `$npm_package_*` interpolation.

## Generated C++ Details

- Tri-state `etag`/`gzip`: "true", "false", or "compiler" (C++ `#ifdef` directives)
- ESP-IDF ETag: malloc/free with NULL check (HTTP 500 on failure)
- File manifest: `{{definePrefix}}_FileInfo` struct, `{{definePrefix}}_FILES[]` array, always generated
- `onFileServed` hook: weak function `{{definePrefix}}_onFileServed(path, statusCode)`, called on 200 and 304
- `//config:` comment for traceability
- `isDefault` matching: strict `=== 'index.html' || === 'index.htm'`

## Testing (Vitest)

Test files in `test/unit/`. Fixtures in `test/fixtures/sample-files/`.

**Key patterns:**

- Mock fs with `vi.mock('node:fs')` and memfs
- Dynamic imports for commandLine tests (side effects)
- `test/unit/index.test.ts` uses `makeFileData()` helper at outer scope

## Build Config

- **TypeScript**: Target ES2020, CommonJS, strict mode
- **ESLint**: TypeScript + Prettier + Unicorn (all rules) + simple-import-sort
- **Prettier**: 120 char width, single quotes, no trailing commas
- **ESLint `curly` rule**: `"multi"` — braces required only for multi-statement blocks. Single-statement `if`/`else`/`for` must NOT have braces.
- **ES2020 constraint**: No `replaceAll` with regex — use `.replace(/regex/g, ...)` with `// eslint-disable-next-line unicorn/prefer-string-replace-all`
