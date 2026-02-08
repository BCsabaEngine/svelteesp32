# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SvelteESP32 is a TypeScript CLI tool that converts frontend JS applications (Svelte, React, Angular, Vue) into C++ header files embedded in ESP32/ESP8266 microcontroller web servers. Generates optimized C++ code with gzip compression and ETag support for 3 web server engines.

## Quick Commands

```bash
# Build & Quality
npm run build                  # Build TypeScript
npm run clean                  # Clean build artifacts
npm run fix                    # Fix all formatting and linting
npm run test                   # Run unit tests
npm run test:coverage          # Generate coverage report

# Development
npm run dev:psychic            # Live reload (psychic engine)
npx tsx src/index.ts -e psychic -s ./demo/svelte/dist -o ./output.h --etag=true --gzip=true

# CLI Usage
npx svelteesp32 -e psychic -s ./dist -o ./output.h --etag=true --gzip=true --exclude="*.map"
npx svelteesp32 --noindexcheck  # Skip index.html validation (API-only apps)
```

## Architecture

### Core Files

- **`src/index.ts`** - Main entry point (`main()` function), orchestrates file processing pipeline. Supports `--dryrun` mode
- **`src/commandLine.ts`** - CLI parsing using native `process.argv`, supports RC files with npm variable interpolation. Validates C++ identifiers (`--define`, `--espmethod`) and non-negative cachetime
- **`src/file.ts`** - File operations: glob scanning, pre-computed SHA256 hashing, duplicate detection, index.html validation. Returns `Map<string, FileData>` where `FileData = { content: Buffer; hash: string }`
- **`src/cppCode.ts`** - C++ code generation (Handlebars templates) for psychic/async engines
- **`src/cppCodeEspIdf.ts`** - C++ code generation for ESP-IDF native engine
- **`src/errorMessages.ts`** - Framework-specific error messages with actionable hints

### Processing Pipeline

1. **File Collection** (`file.ts`): Glob scan → skip pre-compressed (.gz/.brotli/.br) if original exists → filter exclude patterns → pre-compute SHA256 hash per file → validate index.html (unless `--noindexcheck`)
2. **Content Analysis** (`index.ts`): MIME types → use pre-computed SHA256 for ETags → extension grouping → warn on unknown MIME types
3. **Compression** (`index.ts`): Gzip level 9 if >1024 bytes AND >15% reduction
4. **Code Generation** (`cppCode.ts`): Handlebars templates → engine-specific C++ → byte arrays + route handlers + ETags + file manifest
5. **Output**: Write header with binary data, route handlers, ETag validation, C++ defines, file manifest

### Supported Engines

- **psychic** - PsychicHttpServer (ESP32 only, fastest)
- **async** - ESPAsyncWebServer (ESP32/ESP8266, uses PROGMEM)
- **espidf** - Native ESP-IDF web server

## Key Features

- **Single Binary OTA**: All files embedded in firmware (vs SPIFFS/LittleFS requiring separate partition)
- **Automatic Gzip**: Build-time compression (>1024 bytes, >15% reduction)
- **ETag Support**: HTTP 304 Not Modified responses on all engines (SHA256 hashes, If-None-Match validation)
- **CI/CD Integration**: npm package, RC files, variable interpolation from package.json
- **File Exclusion**: Glob patterns (`--exclude="*.map,*.md"`)
- **Index.html Validation**: Ensures default entry point exists (skip with `--noindexcheck` for APIs)
- **Multi-Engine**: Generates optimized C++ for 3 different web server frameworks
- **C++ Defines**: Build-time validation (`SVELTEESP32_COUNT`, `SVELTEESP32_FILE_INDEX_HTML`, etc.)
- **File Manifest**: Runtime introspection of embedded files (path, size, gzipSize, etag, contentType)
- **onFileServed Hook**: Weak function called on every file serve (path, statusCode) for metrics/logging
- **Base Path Support**: URL prefix for all routes (`--basepath=/ui`), enabling multiple frontends in one firmware

## Configuration

### RC File Support (.svelteesp32rc.json)

All CLI options can be stored in RC files. Searched in: current directory, home directory, or `--config=path`.

### NPM Variable Interpolation

RC files support `$npm_package_*` variables from package.json:

- `"version": "v$npm_package_version"` → `"v2.1.0"`
- `"define": "$npm_package_name"` → `"my-esp32-app"`
- Nested: `$npm_package_repository_type` → `packageJson.repository.type`
- Implementation: `src/commandLine.ts` lines 125-220

### CLI Options

Key flags: `-s` (source), `-e` (engine), `-o` (output), `--etag` (true/false/compiler), `--gzip` (true/false/compiler), `--exclude` (glob patterns), `--basepath` (URL prefix), `--noindexcheck`, `--dryrun`, `--cachetime`, `--version`, `--define`, `--espmethod`

## Generated C++ Code

### ETag Implementation (All Engines)

- **async**: `const AsyncWebHeader*`, single `getHeader()` call, inlined lambdas
- **psychic**: `request->header().equals()`, V2 API with response parameter in lambda
- **espidf**: `httpd_req_get_hdr_value_len()` + `httpd_req_get_hdr_value_str()`, malloc/free with NULL check (returns 500 on allocation failure)

### Memory Management

- **ESP32** (psychic/espidf): Const arrays → automatic program memory (flash). ESP-IDF uses `unsigned char` data arrays with `(const char *)` casts at send sites
- **ESP8266** (async): PROGMEM directive → explicit flash storage
- All: Binary data in flash, not RAM

### Configuration Comment

Generated headers include `//config:` comment showing all settings used (engine, sourcepath, etag, gzip, exclude, etc.) for traceability.

### File Manifest

Generated headers include a manifest struct and array for runtime file introspection:

```cpp
struct {{definePrefix}}_FileInfo {
  const char* path;        // URL path (e.g., "/index.html")
  uint32_t size;           // Original file size
  uint32_t gzipSize;       // Compressed size (0 if not gzipped)
  const char* etag;        // ETag variable reference or nullptr
  const char* contentType; // MIME type
};
const {{definePrefix}}_FileInfo {{definePrefix}}_FILES[] = { ... };
const size_t {{definePrefix}}_FILE_COUNT = ...;
```

- **Always generated**: No CLI flag needed
- **gzipSize**: Actual compressed size when `isGzip=true`, otherwise 0
- **etag**: References `etag_<dataname>` when etag enabled, `NULL` when `--etag=false`
- **ESP-IDF**: Uses C-compatible `typedef struct` syntax (inline in `cppCodeEspIdf.ts`)
- **Implementation**: `manifestSection` template in `src/cppCode.ts`, computed fields in `transformSourceToTemplateData()`

### onFileServed Hook

Generated headers include a weak function that's called whenever a file is served. Users can override it for metrics, logging, or telemetry:

```cpp
// C++ engines (psychic, async)
extern "C" void __attribute__((weak)) {{definePrefix}}_onFileServed(const char* path, int statusCode) {}

// C engine (espidf)
__attribute__((weak)) void {{definePrefix}}_onFileServed(const char* path, int statusCode) {}
```

- **Parameters**: `path` (URL being served, e.g., "/index.html"), `statusCode` (200 or 304)
- **Always generated**: No CLI flag needed, zero overhead when unused (weak linkage)
- **Hook uses `--define` prefix**: Default `SVELTEESP32_onFileServed`, custom with `--define=MYAPP` becomes `MYAPP_onFileServed`
- **Called before every send()**: Both 200 (content) and 304 (cache hit) responses
- **Implementation**: `hookSection` template in `src/cppCode.ts`, inline in `src/cppCodeEspIdf.ts`

## Testing (Vitest)

**Coverage**: ~68% overall

- `commandLine.ts`: ~85% - CLI parsing, validation, C++ identifier validation, npm variable interpolation
- `file.ts`: 100% - File ops, SHA256 hashing, duplicate detection, index.html validation
- `cppCode.ts`: ~97% - Template rendering, all 3 engines, etag/gzip combos
- `consoleColor.ts`: 100% - ANSI colors
- `index.ts`: ~40% - Main pipeline, compression helpers, formatting (wrapped in `main()` for testability)

**Test Files**:

- `test/unit/commandLine.test.ts` - Dynamic imports, argument parsing, npm variable interpolation, C++ identifier validation, negative cachetime (20+ tests)
- `test/unit/file.test.ts` - memfs mocking, FileData return type, duplicate detection, index.html validation, exclude warnings
- `test/unit/cppCode.test.ts` - Template selection, code generation, byte arrays, file manifest, onFileServed hook, strict isDefault matching
- `test/unit/index.test.ts` - Compression helpers, formatSize, updateExtensionGroup, main pipeline with FileData
- `test/unit/errorMessages.test.ts` - Error message validation, custom espmethod in hints

**Key Patterns**:

- Mock fs with `vi.mock('node:fs')` and memfs
- Dynamic imports for commandLine tests (avoid side effects)
- Test fixtures in `test/fixtures/sample-files/`

## Important Implementation Details

### File Exclusion

- Default exclusions: `.DS_Store`, `Thumbs.db`, `.git`, `.svn`, `*.swp`, `*~`, `.gitignore`, `.gitattributes`
- Uses `picomatch` (via tinyglobby transitive dependency)
- Filtering after pre-compressed detection, before file reading
- Windows path normalization for cross-platform compatibility

### Index.html Validation (`src/file.ts` lines 117-125)

- Checks for `index.html` or `index.htm` in root or subdirectories
- Shows engine-specific hints on error: `server->defaultEndpoint` (psychic), `server.on("/")` (async), etc.
- Skip with `--noindexcheck` flag for API-only applications

### Template System (`src/cppCode.ts`)

- Handlebars with custom `switch`/`case` helpers
- Tri-state options: `etag`/`gzip` can be "true", "false", or "compiler" (C++ directives)
- Engine-specific templates inline in source file
- Binary data converted via `bufferToByteString()` (loop-based, avoids intermediate array allocation)
- Template sections: `commonHeaderSection`, `dataArraysSection`, `etagArraysSection`, `manifestSection`, `hookSection`
- `transformSourceToTemplateData()` computes derived fields: `gzipSizeForManifest`, `etagForManifest`
- `getTemplate()` throws on unknown engine (explicit `case 'async'` added)
- `isDefault` matching uses strict equality (`=== 'index.html' || === 'index.htm'`), no false positives

### Compression Thresholds (`src/index.ts`)

```typescript
const GZIP_MIN_SIZE = 1024;
const GZIP_MIN_REDUCTION_RATIO = 0.85; // Use gzip if <85% of original
```

### Demo Projects

- `demo/svelte/` - Example Svelte app (Vite + TailwindCSS)
- `demo/esp32/` - PlatformIO Arduino project
- `demo/esp32idf/` - ESP-IDF native project
- `package.script` generates 27 test headers (9 etag/gzip combos × 3 engines)

## Recent Updates

### Code Quality & Correctness Pass (20 items)

Bug fixes, correctness improvements, code quality refactors, and usability enhancements:

**Bug Fixes:**

- Fixed `.brottli` typo → `.brotli` in compressed file detection (`src/file.ts`)
- Fixed `postProcessCppCode` regex: was matching literal `\nn`, now correctly collapses multiple newlines (`src/cppCode.ts`)
- Added malloc NULL check in ESP-IDF ETag handler — returns HTTP 500 on allocation failure (`src/cppCodeEspIdf.ts`)
- Single `Date` instance in code generation timestamp (was creating two separate instances)

**Correctness:**

- Dataname sanitization: `\W` → `[^a-zA-Z0-9_]` with leading-digit guard (`src/index.ts`)
- Gzip summary now reflects actual sizes used (gzip vs original) — was always counting gzip size
- `isDefault` uses strict equality (no false positives like `index.html.bak`)
- ESP-IDF uses `unsigned char` for binary data arrays with `(const char *)` casts
- `getMaxUriHandlersHint` uses actual `--espmethod` value instead of hardcoded name
- Validates cachetime is non-negative; validates `--define`/`--espmethod` as C++ identifiers

**Code Quality:**

- SHA256 computed once per file in `getFiles()` — `FileData = { content, hash }` type
- `bufferToByteString()` loop replaces `[...buffer].map().join()` (avoids large intermediate array)
- Pipeline wrapped in `main()` function for testability
- CLI parsing deduplicated via `applyFlag()` helper
- `getTemplate()` throws on unknown engine (was silently falling through to async)

**Usability:**

- `--dryrun` / `--dry-run` flag — shows summary without writing output file
- Warns on unknown MIME types (falls back to `text/plain`)
- `formatSize()` shows `B` for <1024 bytes, `kB` otherwise
- Warns when `--exclude` patterns match no files

### Psychic2 Engine Removal

Removed the `psychic2` engine. The PsychicHttpServer V2 API (response passed as lambda parameter) is now the default `psychic` engine. Only 3 engines remain: `psychic`, `async`, `espidf`.

- **Old V1 psychic template removed** from `src/cppCode.ts` (~210 lines)
- **`psychic` engine now uses V2 API**: `[](PsychicRequest * request, PsychicResponse * response)` lambda signature
- **CLI, RC file, and error messages** updated to remove `psychic2` references
- **`package.script`** reduced from 36 to 27 test headers (9 combos × 3 engines)

### Base Path Support

Added `--basepath` option to prefix all generated routes with a URL path:

- **Usage**: `--basepath=/ui` or `--basepath=/admin`
- **Effect**: All routes prefixed (e.g., `/index.html` becomes `/ui/index.html`)
- **Manifest**: Paths in file manifest include basePath
- **Default route**: When basePath is set, creates explicit `basePath` route instead of using `defaultEndpoint`
- **Validation**: Must start with `/`, must not end with `/`, no double slashes
- **RC file support**: Can be set via `basepath` property
- **npm interpolation**: Supports `$npm_package_*` variables

### Comparison Table (README)

README includes comparison table: SvelteESP32 vs Traditional Filesystem (SPIFFS/LittleFS/AsyncStaticWebHandler)

- Highlights: Single Binary OTA, Automatic Gzip, Built-in ETag, CI/CD integration
- Location: README lines 15-29, after "Forget SPIFFS and LittleFS" intro

### Error Messages (v1.13.1)

Enhanced error messages with framework-specific hints:

- **Missing index.html**: Engine-specific routing examples, `--noindexcheck` flag
- **Invalid engine**: Lists all 3 engines with descriptions
- **Sourcepath not found**: Build tool hints (Vite, Webpack, Rollup)
- **max_uri_handlers**: Console hints after generation (psychic, espidf)

## Build Configuration

- **TypeScript**: Target ES2020, CommonJS output, strict mode
- **Build**: `--clean` and `--force` flags ensure clean builds (no incremental)
- **ESLint**: TypeScript, Prettier, Unicorn plugins
- **Prettier**: 120 char width, single quotes, no trailing commas
