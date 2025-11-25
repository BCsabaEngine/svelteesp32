# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SvelteESP32 is a TypeScript CLI tool that converts frontend JS applications (Svelte, React, Angular, Vue) into C++ header files that can be embedded in ESP32/ESP8266 microcontroller web servers. The tool processes web assets and generates optimized C++ code with optional gzip compression and ETag support for different web server engines.

## Key Commands

### Development Commands

```bash
# Build the project
npm run build

# Clean build artifacts
npm run clean

# Development with live reload (async engine)
npm run dev:async

# Development with live reload (psychic engine)
npm run dev:psychic

# Development with live reload (psychic2 engine)
npm run dev:psychic2

# Run TypeScript unit tests
npm run test

# Run tests in watch mode
npm run test:watch

# Generate test coverage report
npm run test:coverage

# Run comprehensive ESP32 tests (requires PlatformIO)
npm run test:all
```

### Code Quality Commands

```bash
# Check formatting
npm run format:check

# Fix formatting
npm run format:fix

# Check linting
npm run lint:check

# Fix linting issues
npm run lint:fix

# Fix all formatting and linting issues
npm run fix
```

### CLI Usage

```bash
# Generate header for PsychicHttpServer
npx svelteesp32 -e psychic -s ./dist -o ./output.h --etag=true --gzip=true

# Generate header for PsychicHttpServer V2
npx svelteesp32 -e psychic2 -s ./dist -o ./output.h --etag=true --gzip=true

# Generate header for ESPAsyncWebServer
npx svelteesp32 -e async -s ./dist -o ./output.h --etag=true --gzip=true

# Generate header for ESP-IDF
npx svelteesp32 -e espidf -s ./dist -o ./output.h --etag=true --gzip=true

# Test the CLI directly using tsx (for development)
npx tsx src/index.ts -e psychic -s ./demo/svelte/dist -o ./output.h --etag=true --gzip=true
```

## Architecture

### Core Components

- **`src/index.ts`**: Main entry point that orchestrates the file processing pipeline
- **`src/commandLine.ts`**: CLI argument parsing and validation using native Node.js `process.argv` implementation
- **`src/file.ts`**: File system operations for reading web assets
- **`src/cppCode.ts`**: C++ code generation engine with Handlebars templates for PsychicHttp and ESPAsyncWebServer
- **`src/cppCodeEspIdf.ts`**: Specialized C++ code generation for native ESP-IDF
- **`src/consoleColor.ts`**: Colored console output utilities

### Processing Pipeline

1. **File Collection** (`src/file.ts`): Scans source directory recursively using glob, skips pre-compressed files (.gz, .br) if originals exist, detects duplicate files via SHA256 hashing
2. **Content Analysis** (`src/index.ts`): Determines MIME types using `mime-types` library, calculates MD5 hashes for ETag generation, groups files by extension for statistics
3. **Compression** (`src/index.ts`): Applies gzip level 9 compression, uses compressed version only when size reduction >15% and original >1024 bytes
4. **Code Generation** (`src/cppCode.ts`, `src/cppCodeEspIdf.ts`): Uses Handlebars templates with custom helpers (switch/case), generates optimized engine-specific C++ code with:
   - Inlined lambda handlers (ESPAsyncWebServer)
   - Optimized header lookups for ETag validation (all engines)
   - Proper const-correctness and modern C++ patterns
   - Conditional compilation support for etag/gzip options
5. **Output**: Writes optimized header with embedded binary data arrays, route handlers with ETag validation, ETag MD5 strings, and C++ defines for build-time validation

### Supported Engines

- **psychic**: PsychicHttpServer (ESP32 only, fastest performance)
- **psychic2**: PsychicHttpServer V2
- **async**: ESPAsyncWebServer (ESP32/ESP8266 compatible)
- **espidf**: Native ESP-IDF web server

### Key Features

- **Automatic Gzip Compression**: Compresses assets when size reduction >15% and >1024 bytes
- **ETag Support**: HTTP cache validation for reduced network traffic with 304 Not Modified responses across all engines (psychic, psychic2, async, espidf)
- **Cache Control**: Configurable browser caching with `--cachetime`
- **Multi-Engine Support**: Generate code for different ESP web server libraries
- **File Type Analysis**: Groups files by extension with count statistics
- **Memory Optimization**: Binary data stored as const arrays in program memory
- **Optimized C++ Code**: Generated code uses modern C++ best practices with minimal overhead

## Development Environment

### Build System

- **TypeScript**: Compiled to CommonJS in `dist/` directory
- **Target**: ES2020 with strict type checking
- **Incremental**: Disabled to ensure clean builds

### Code Quality

- **ESLint**: Comprehensive rules including TypeScript, Prettier, Unicorn plugins
- **Prettier**: 120 character line width, single quotes, no trailing commas
- **Import Sorting**: Automatic import organization with `simple-import-sort`

### Testing

The project uses **Vitest** for unit testing with comprehensive coverage:

**Test Structure:**

```
test/
├── unit/
│   ├── commandLine.test.ts    # CLI argument parsing tests
│   ├── file.test.ts            # File operations tests
│   ├── cppCode.test.ts         # C++ code generation tests
│   └── consoleColor.test.ts    # Console utilities tests
└── fixtures/
    └── sample-files/           # Test fixture files
```

**Test Coverage (68.25% overall):**

- `commandLine.ts`: 84.56% - CLI argument parsing, validation, engine/tri-state validation
- `file.ts`: 100% - File collection, duplicate detection (SHA256), pre-compressed file skipping
- `cppCode.ts`: 96.62% - Template rendering for all 4 engines, etag/gzip combinations, Handlebars helpers
- `cppCodeEspIdf.ts`: 100% - ESP-IDF template (tested via `cppCode.ts`)
- `consoleColor.ts`: 100% - ANSI color code wrapping
- `index.ts`: 0% - Main entry point (has side effects, tested via integration)

**Key Testing Features:**

- **Vitest Configuration**: `vitest.config.ts` with TypeScript support, 60% coverage thresholds
- **Mocking Strategy**: Uses `vi.mock()` for file system (`node:fs`), glob (`tinyglobby`), and module dependencies
- **Dynamic Imports**: Tests use dynamic imports for `commandLine.ts` to test different CLI arguments without side effects
- **Test Fixtures**: Small sample files (HTML/CSS/JS) for testing file processing pipeline
- **Coverage Reports**: Generated in `coverage/` directory (ignored by git), viewable HTML reports at `coverage/index.html`

**Testing Approach:**

- **commandLine.test.ts**: Tests argument parsing (`--flag=value`, `-f value`, `--flag value`), validation errors, required arguments, directory validation. Uses dynamic imports to avoid module side effects.
- **file.test.ts**: Mocks file system with `memfs`, tests duplicate detection, compressed file skipping, path handling
- **cppCode.test.ts**: Tests template selection by engine, code generation for all etag/gzip combinations, byte array conversion, ETag/cache headers, default route detection
- **consoleColor.test.ts**: Simple tests for ANSI escape code wrapping (quick coverage wins)

**Running Tests:**

- `npm run test` - Run all tests once (CI/CD)
- `npm run test:watch` - Watch mode for development
- `npm run test:coverage` - Generate coverage reports

### Demo Projects

- **`demo/svelte/`**: Example Svelte application with Vite, TailwindCSS, gallery images
- **`demo/esp32/`**: PlatformIO Arduino framework project with WiFi credentials example
- **`demo/esp32idf/`**: ESP-IDF native project using native web server

The `package.script` executable generates 36 test header files (9 combinations of etag/gzip × 4 engines) for comprehensive validation.

## Important Notes

- The tool processes entire directories recursively and embeds all files as binary data
- Generated header files can be large but compile efficiently
- Memory usage is optimized through const array placement in program memory (ESP32) or PROGMEM (ESP8266)
- The CLI is designed for CI/CD integration with npm packaging workflows
- `index.html` or `index.htm` files are automatically set as the default route for "/"
- Pre-compressed files (.gz, .br, .brottli) in the source directory are skipped if the original file exists
- The build uses `--clean` and `--force` flags to ensure clean builds without incremental compilation
- ESP-IDF engine includes required headers (`string.h`, `stdlib.h`) for ETag validation support
- All engines now fully support HTTP 304 Not Modified responses for efficient caching

## Template System

The code generation uses Handlebars with custom helpers:

- **switch/case helpers**: Enable conditional C++ code generation based on etag/gzip settings
- **Three-state options**: `etag` and `gzip` can be "true", "false", or "compiler" (for C++ directive control)
- **Engine-specific templates**: Each engine (psychic, psychic2, async, espidf) has its own template in `src/cppCode.ts` or `src/cppCodeEspIdf.ts`
- **Data transformation**: Binary content is converted to comma-separated byte arrays in the template data

## Generated C++ Code Quality

The generated C++ code follows modern best practices and is optimized for performance and maintainability:

### ETag Validation Implementation

All four engines support ETag validation with HTTP 304 Not Modified responses:

- **ESPAsyncWebServer (`async`)**: Uses `const AsyncWebHeader*` for proper const-correctness, single `getHeader()` call instead of `hasHeader()` + `getHeader()`, inlined lambda handlers
- **PsychicHttpServer (`psychic`, `psychic2`)**: Uses `request->header().equals()` for direct string comparison without temporary objects
- **ESP-IDF (`espidf`)**: Uses `httpd_req_get_hdr_value_len()` and `httpd_req_get_hdr_value_str()` for header validation with proper memory management (malloc/free)

### Code Optimizations

- **No intermediate variables**: Lambda handlers are inlined directly in route registration (ESPAsyncWebServer)
- **Optimized header lookups**: Single API call instead of redundant checks
- **No temporary String objects**: Uses `.equals()` method directly instead of `== String()` wrapper
- **Proper const-correctness**: All pointer declarations use `const` where appropriate
- **Minimal overhead**: Generated code has minimal runtime performance impact

### Memory Management

- **ESP32 (psychic, psychic2, espidf)**: Const arrays automatically placed in program memory (flash)
- **ESP8266 (async)**: PROGMEM directive explicitly used for flash storage
- **ESP-IDF ETag validation**: Temporary header value buffers are properly allocated and freed

## Generated C++ Defines

The generated header file includes C++ defines for build-time validation:

- `{PREFIX}_COUNT`: Total number of files
- `{PREFIX}_SIZE`: Total uncompressed size in bytes
- `{PREFIX}_SIZE_GZIP`: Total gzip compressed size in bytes
- `{PREFIX}_FILE_{FILENAME}`: Define for each file (e.g., `SVELTEESP32_FILE_INDEX_HTML`)
- `{PREFIX}_{EXT}_FILES`: Count of files by extension (e.g., `SVELTEESP32_CSS_FILES`)

These allow C++ code to verify expected files are present using `#ifndef` and `#error` directives.
