# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SvelteESP32 is a TypeScript CLI tool that converts frontend JS applications (Svelte, React, Angular, Vue) into C++ header files embedded in ESP32/ESP8266 microcontroller web servers. Generates optimized C++ code with gzip compression and ETag support for 4 web server engines.

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
npx svelteesp32 --no-index-check  # Skip index.html validation (API-only apps)
```

## Architecture

### Core Files

- **`src/index.ts`** - Main entry point, orchestrates file processing pipeline
- **`src/commandLine.ts`** - CLI parsing using native `process.argv`, supports RC files with npm variable interpolation
- **`src/file.ts`** - File operations: glob scanning, duplicate detection (SHA256), index.html validation
- **`src/cppCode.ts`** - C++ code generation (Handlebars templates) for psychic/psychic2/async engines
- **`src/cppCodeEspIdf.ts`** - C++ code generation for ESP-IDF native engine
- **`src/errorMessages.ts`** - Framework-specific error messages with actionable hints

### Processing Pipeline

1. **File Collection** (`file.ts`): Glob scan → skip pre-compressed (.gz/.br) if original exists → filter exclude patterns → validate index.html (unless `--no-index-check`)
2. **Content Analysis** (`index.ts`): MIME types → SHA256 ETags → extension grouping
3. **Compression** (`index.ts`): Gzip level 9 if >1024 bytes AND >15% reduction
4. **Code Generation** (`cppCode.ts`): Handlebars templates → engine-specific C++ → byte arrays + route handlers + ETags + file manifest
5. **Output**: Write header with binary data, route handlers, ETag validation, C++ defines, file manifest

### Supported Engines

- **psychic** - PsychicHttpServer V1 (ESP32 only, fastest)
- **psychic2** - PsychicHttpServer V2 (ESP32 only, modern API)
- **async** - ESPAsyncWebServer (ESP32/ESP8266, uses PROGMEM)
- **espidf** - Native ESP-IDF web server

## Key Features

- **Single Binary OTA**: All files embedded in firmware (vs SPIFFS/LittleFS requiring separate partition)
- **Automatic Gzip**: Build-time compression (>1024 bytes, >15% reduction)
- **ETag Support**: HTTP 304 Not Modified responses on all engines (SHA256 hashes, If-None-Match validation)
- **CI/CD Integration**: npm package, RC files, variable interpolation from package.json
- **File Exclusion**: Glob patterns (`--exclude="*.map,*.md"`)
- **Index.html Validation**: Ensures default entry point exists (skip with `--no-index-check` for APIs)
- **Multi-Engine**: Generates optimized C++ for 4 different web server frameworks
- **C++ Defines**: Build-time validation (`SVELTEESP32_COUNT`, `SVELTEESP32_FILE_INDEX_HTML`, etc.)
- **File Manifest**: Runtime introspection of embedded files (path, size, gzipSize, etag, contentType)
- **onFileServed Hook**: Weak function called on every file serve (path, statusCode) for metrics/logging
- **Base Path Support**: URL prefix for all routes (`--base-path=/ui`), enabling multiple frontends in one firmware

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

Key flags: `-s` (source), `-e` (engine), `-o` (output), `--etag` (true/false/compiler), `--gzip` (true/false/compiler), `--exclude` (glob patterns), `--base-path` (URL prefix), `--no-index-check`, `--cachetime`, `--version`, `--define`, `--espmethod`

## Generated C++ Code

### ETag Implementation (All Engines)

- **async**: `const AsyncWebHeader*`, single `getHeader()` call, inlined lambdas
- **psychic/psychic2**: `request->header().equals()`, no temporary String objects
- **espidf**: `httpd_req_get_hdr_value_len()` + `httpd_req_get_hdr_value_str()`, malloc/free

### Memory Management

- **ESP32** (psychic/psychic2/espidf): Const arrays → automatic program memory (flash)
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
// C++ engines (psychic, psychic2, async)
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

- `commandLine.ts`: 84.56% - CLI parsing, validation, npm variable interpolation
- `file.ts`: 100% - File ops, duplicate detection, index.html validation
- `cppCode.ts`: 96.62% - Template rendering, all 4 engines, etag/gzip combos
- `consoleColor.ts`: 100% - ANSI colors
- `index.ts`: 0% - Main entry (side effects, tested via integration)

**Test Files**:

- `test/unit/commandLine.test.ts` - Dynamic imports, argument parsing, npm variable interpolation (20+ tests)
- `test/unit/file.test.ts` - memfs mocking, duplicate detection, index.html validation
- `test/unit/cppCode.test.ts` - Template selection, code generation, byte arrays, file manifest, onFileServed hook
- `test/unit/errorMessages.test.ts` - Error message validation

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
- Skip with `--no-index-check` flag for API-only applications

### Template System (`src/cppCode.ts`)

- Handlebars with custom `switch`/`case` helpers
- Tri-state options: `etag`/`gzip` can be "true", "false", or "compiler" (C++ directives)
- Engine-specific templates inline in source file
- Binary data converted to comma-separated byte arrays
- Template sections: `commonHeaderSection`, `dataArraysSection`, `etagArraysSection`, `manifestSection`, `hookSection`
- `transformSourceToTemplateData()` computes derived fields: `gzipSizeForManifest`, `etagForManifest`

### Compression Thresholds (`src/index.ts`)

```typescript
const GZIP_MIN_SIZE = 1024;
const GZIP_MIN_REDUCTION_RATIO = 0.85; // Use gzip if <85% of original
```

### Demo Projects

- `demo/svelte/` - Example Svelte app (Vite + TailwindCSS)
- `demo/esp32/` - PlatformIO Arduino project
- `demo/esp32idf/` - ESP-IDF native project
- `package.script` generates 36 test headers (9 etag/gzip combos × 4 engines)

## Recent Updates

### Base Path Support

Added `--base-path` option to prefix all generated routes with a URL path:

- **Usage**: `--base-path=/ui` or `--base-path=/admin`
- **Effect**: All routes prefixed (e.g., `/index.html` becomes `/ui/index.html`)
- **Manifest**: Paths in file manifest include basePath
- **Default route**: When basePath is set, creates explicit `basePath` route instead of using `defaultEndpoint`
- **Validation**: Must start with `/`, must not end with `/`, no double slashes
- **RC file support**: Can be set via `basePath` property
- **npm interpolation**: Supports `$npm_package_*` variables

### Comparison Table (README)

README includes comparison table: SvelteESP32 vs Traditional Filesystem (SPIFFS/LittleFS/AsyncStaticWebHandler)

- Highlights: Single Binary OTA, Automatic Gzip, Built-in ETag, CI/CD integration
- Location: README lines 15-29, after "Forget SPIFFS and LittleFS" intro

### Error Messages (v1.13.1)

Enhanced error messages with framework-specific hints:

- **Missing index.html**: Engine-specific routing examples, `--no-index-check` flag
- **Invalid engine**: Lists all 4 engines with descriptions
- **Sourcepath not found**: Build tool hints (Vite, Webpack, Rollup)
- **max_uri_handlers**: Console hints after generation (psychic, psychic2, espidf)

## Build Configuration

- **TypeScript**: Target ES2020, CommonJS output, strict mode
- **Build**: `--clean` and `--force` flags ensure clean builds (no incremental)
- **ESLint**: TypeScript, Prettier, Unicorn plugins
- **Prettier**: 120 char width, single quotes, no trailing commas
