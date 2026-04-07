# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TypeScript CLI tool converting frontend apps (Svelte, React, Angular, Vue) into C++ header files for ESP32/ESP8266 web servers. Gzip compression, ETag support, 4 engines.

## Commands

```bash
npm run build          # Build TypeScript (clean + force rebuild)
npm run fix            # Fix formatting and linting (prettier + eslint + prettier)
npm run test           # Run unit tests (vitest run)
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Coverage report
npm run all            # Fix + build + test (full validation)
npx vitest run test/unit/file.test.ts              # Run a single test file
npx vitest run test/unit/file.test.ts -t "test name" # Run a specific test by name
npx tsx src/index.ts -e psychic -s ./demo/svelte/dist -o ./output.h --etag=true --gzip=true

# Dev mode (nodemon, watches src/index.ts, targets demo/esp32)
npm run dev:psychic    # psychic engine, no etag/gzip
npm run dev:async      # async engine, etag+gzip+cachetime
npm run dev:webserver  # webserver engine, etag+gzip+cachetime
```

## Architecture

### Core Files

- `src/index.ts` — Main pipeline (`main()`), compression, MIME types, `--dryrun` mode
- `src/commandLine.ts` — CLI parsing (native `process.argv`), RC files, npm variable interpolation, C++ identifier validation
- `src/file.ts` — Glob scanning, SHA256 hashing, duplicate detection, index.html validation. Returns `Map<string, FileData>` where `FileData = { content: Buffer; hash: string }`. Pre-compressed files (`.gz`, `.brotli`, `.br`) are skipped when an uncompressed original exists. Symlinks are not followed (`followSymbolicLinks: false`). Files over 50 MB are rejected before read/compress.
- `src/cppCode.ts` — Handlebars templates for psychic/async/webserver engines (data arrays, etag arrays, manifest, hook sections)
- `src/cppCodeEspIdf.ts` — ESP-IDF engine code generation
- `src/errorMessages.ts` — Framework-specific error messages

### Engines

- **psychic** — PsychicHttpServer V2 API, ESP32 only
- **async** — ESPAsyncWebServer, ESP32/ESP8266, PROGMEM
- **espidf** — Native ESP-IDF, `unsigned char` data arrays with `(const char *)` casts
- **webserver** — Arduino WebServer, ESP32, PROGMEM, synchronous (requires `handleClient()` in loop)

### Pipeline

File Collection → MIME/SHA256 → Gzip (level 9, >1024B, >15% reduction) → Handlebars templates → C++ header

### CLI Options

`-s` (source), `-e` (engine), `-o` (output), `--etag` (true/false/compiler), `--gzip` (true/false/compiler), `--exclude` (glob patterns, **no defaults** — empty by default), `--basepath` (URL prefix, must start with `/`, no trailing `/`), `--noindexcheck`, `--dryrun`, `--spa` (catch-all for SPA client-side routing), `--cachetime`, `--cachetime-html` (HTML-only max-age, overrides `--cachetime`), `--cachetime-assets` (non-HTML max-age, overrides `--cachetime`), `--define`, `--espmethod`, `--maxsize` (total uncompressed size limit, e.g. `400k`), `--maxgzipsize` (total gzip size limit), `--created` (include creation timestamp), `--version` (embed version string in header)

RC files: `.svelteesp32rc.json` or `.svelteesp32rc` in cwd, home, or `--config=path`. Supports `$npm_package_*` interpolation. Prints a warning when loaded from cwd. `outputfile` in RC files must be a relative path (absolute paths throw).

## Generated C++ Details

- Tri-state `etag`/`gzip`: "true", "false", or "compiler" (C++ `#ifdef` directives)
- ESP-IDF ETag: malloc/free with NULL check (HTTP 500 on failure)
- File manifest: `{{definePrefix}}_FileInfo` struct, `{{definePrefix}}_FILES[]` array, always generated
- `onFileServed` hook: weak function `{{definePrefix}}_onFileServed(path, statusCode)`, called on 200 and 304
- `//config:` comment for traceability
- `isDefault` matching: strict `=== 'index.html' || === 'index.htm'`
- `--spa` catch-all: psychic adds `server->on("{{basePath}}/*", ...)` only when basePath is set (no-basePath case handled by `defaultEndpoint`); async/webserver add `server->onNotFound(...)` with optional basePath prefix guard; espidf uses `httpd_register_err_handler(HTTPD_404_NOT_FOUND, spa_handler_*)`
- Data arrays: `static const uint8_t data_*[]` / `static const uint8_t datagzip_*[]` — `static` prevents multiple-definition linker errors when included in more than one TU
- ETag variables: `static const char etag_*[]` (char array, not pointer) — avoids pointer indirection and keeps `static` linkage
- `{{definePrefix}}_MAX_URI_HANDLERS`: psychic engine only; `#define` set to `sources.length + 5` for use in `server.config.max_uri_handlers`
- Per-source cache time: `cacheTime` is computed per file in `transformSourceToTemplateData` — HTML files use `cachetimeHtml ?? cachetime`, non-HTML use `cachetimeAssets ?? cachetime`; templates reference `{{#this.cacheTime}}` (not `{{#../cacheTime}}`)

## Testing (Vitest)

Test files in `test/unit/`. Fixtures in `test/fixtures/sample-files/`.

**Key patterns:**

- Mock fs with `vi.mock('node:fs')` and memfs
- Dynamic imports for commandLine tests (side effects)
- `test/unit/index.test.ts` uses `makeFileData()` helper at outer scope

## Build Config

- **TypeScript**: Target ES2023, module/moduleResolution Node16, strict mode
- **ESLint**: TypeScript + Prettier + Unicorn (all rules) + simple-import-sort
- **Prettier**: 120 char width, single quotes, no trailing commas
- **ESLint `curly` rule**: `"multi"` — braces required only for multi-statement blocks. Single-statement `if`/`else`/`for` must NOT have braces.
