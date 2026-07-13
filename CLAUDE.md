# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TypeScript CLI tool and Vite plugin converting frontend apps (Svelte, React, Angular, Vue) into C++ header files for ESP32/ESP8266 web servers. Gzip compression, ETag support, 4 engines. Requires Node.js >= 22, npm >= 10 (see `engines` in `package.json`).

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
npx tsx src/index.ts -e psychic -s ./demo/svelte/dist -o ./output.h --etag=always --gzip=always

# Dev mode (nodemon, watches src/index.ts, targets demo/esp32)
npm run dev:psychic    # psychic engine, no etag/gzip
npm run dev:async      # async engine, etag+gzip+cachetime
npm run dev:webserver  # webserver engine, etag+gzip+cachetime
npm run dev:init       # run the init wizard via tsx (dev mode)

# PlatformIO integration tests (requires PlatformIO installed)
npm run test:esp32     # ./package.script, then build all 27 demo/esp32 envs
npm run test:esp32idf  # ./package.script, then build all 10 demo/esp32idf envs
npm run test:all       # run both PlatformIO integration tests
./package.script       # regenerate every demo header variant (no build)
```

These are the only tests that compile the generated C++. Unit tests assert on the header as a _string_ — they cannot catch a C++ type error, an overload ambiguity, or a broken `#ifdef` arm. Run `npm run test:esp32` after any change to an engine generator.

## Architecture

### Core Files

- `src/index.ts` — CLI entry point; delegates to `commandLine.ts` for argument parsing and `pipeline.ts` for execution. Also re-exports pipeline utilities (`createSourceEntry`, `formatChangeSummary`, `formatCompressionLog`, `formatAnalyzeTable`, `formatDryRunRoutes`, `formatSize`, `formatSizePrecise`, `shouldUseGzip`, `calculateCompressionRatio`, `updateExtensionGroup`, `PreviousManifestFile`) as the programmatic/test API.
- `src/pipeline.ts` — Core pipeline (`runPipeline()`): compression, MIME types, `--dryrun` mode, `--analyze` mode (per-file size table + budget exit code), `--manifest` (companion JSON file). Also exports `OverBudgetError` (thrown when `--maxsize`/`--maxgzipsize` is exceeded) and `PreviousManifestFile` type.
- `src/commandLine.ts` — CLI parsing (native `process.argv`), RC files, npm variable interpolation, C++ identifier validation. Exports `IRcFileConfig`, `validateBasePath()`, `loadRcFileConfig()`, and `parseArguments()` for use by the Vite plugin and tests.
- `src/initCommand.ts` — Interactive `npx svelteesp32 init` wizard that creates `.svelteesp32rc.json`
- `src/vitePlugin.ts` — Vite plugin with two exclusive modes. Exported via the `./vite` package entry. Runs `runPipeline()` in `closeBundle()`. **RC file mode**: `svelteESP32()` or `svelteESP32('/path/to/rc.json')` — loads all settings from the RC file; `outputfile` in RC file is required. **Plugin options mode**: `svelteESP32({ output, ... })` — uses the options object exclusively; RC file is completely ignored; `output` is required. The two modes do not merge.
- `src/file.ts` — Glob scanning, SHA256 hashing, duplicate detection, index.html validation. Returns `Map<string, FileData>` where `FileData = { content: Buffer; hash: string }`. Pre-compressed files (`.gz`, `.brotli`, `.br`) are skipped when an uncompressed original exists. Symlinks are not followed (`followSymbolicLinks: false`). Files over 50 MB are rejected before read/compress. `--exclude` patterns are passed to `tinyglobby`'s `ignore` option (no separate `picomatch` call).
- `src/cppCode.ts` — Shared C++ code generation utilities: common header, data arrays, ETag arrays, manifest, hook section, `sw()` switch helper, `cacheCtrl()` (renders `max-age=...`/`no-cache`), `computeRouteCount()`; used by all engine modules
- `src/cppCodePsychic.ts` — PsychicHttpServer engine code generation (`genPsychicCpp`)
- `src/cppCodeAsync.ts` — ESPAsyncWebServer engine code generation (`genAsyncCpp`)
- `src/cppCodeWebserver.ts` — Arduino WebServer engine code generation (`genWebserverCpp`)
- `src/cppCodeEspIdf.ts` — ESP-IDF engine code generation (`genEspIdfCpp`)
- `src/errorMessages.ts` — CLI validation error messages with actionable hints (missing index, invalid engine, bad sourcepath, size-budget-exceeded)
- `src/consoleColor.ts` — ANSI terminal color helpers (`greenLog`, `yellowLog`, `redLog`, `cyanLog`) used by pipeline output
- `src/cliInit.mts` — Thin ESM entry point for `npm run dev:init`; calls `runInit()` from `initCommand.ts`

### Verifying engine behaviour against the real libraries

Do not reason from memory about what PsychicHttp / ESPAsyncWebServer / Arduino `WebServer` / `esp_http_server` do — the sources are on disk after a PlatformIO build, and they routinely contradict what you'd assume:

- `demo/esp32/.pio/libdeps/<env>/PsychicHttp/src/` (pinned 3.1.2) and `.../ESPAsyncWebServer/src/` (pinned v3.11.2) — versions come from `lib_deps` in `demo/esp32/platformio.ini`
- `~/.platformio/packages/framework-arduinoespressif32/libraries/WebServer/src/` — Arduino `WebServer`
- `~/.platformio/packages/framework-espidf/components/esp_http_server/src/` — `httpd_resp_send()` et al.

The HEAD notes below were all derived this way, and several overturned the obvious assumption (e.g. psychic does _not_ put endpoints in the esp-idf handler table; no library suppresses a HEAD body for you).

### Engines

- **psychic** — PsychicHttpServer V2-style API; pinned to PsychicHttp 3.x in the demo. ESP32 only. Serves GET+HEAD.
- **async** — ESPAsyncWebServer, ESP32/ESP8266, PROGMEM. Serves GET+HEAD.
- **espidf** — Native ESP-IDF, `unsigned char` data arrays with `(const char *)` casts. GET only.
- **webserver** — Arduino WebServer, ESP32, PROGMEM, synchronous (requires `handleClient()` in loop). GET only.

### HTTP HEAD (psychic + async only, always on, no CLI flag)

- **psychic**: file routes registered as `HTTP_ANY` — psychic matches `HTTP_ANY` against every method, so GET and HEAD share one `PsychicEndpoint`. The handler returns `405` + `Allow: GET, HEAD` for anything else, and skips `setContent()` on HEAD. The `--spa` catch-all is deliberately **not** `HTTP_ANY` (a wildcard would shadow API routes the user registers under `basePath` after `initSvelteStaticFiles()`, since psychic matches endpoints in registration order) — it gets one `HTTP_GET` and one `HTTP_HEAD` registration, which is why `computeRouteCount()` adds 2 for the psychic SPA case.
- **async**: routes registered as `HTTP_GET | HTTP_HEAD` (the method is a bitmask, `HTTP_HEAD = 1u << 2`), so one handler covers both. The body is skipped via a ternary on `beginResponse()`.
- **`Content-Length: 0` on HEAD is unavoidable**: `httpd_resp_send()` bakes Content-Length into a hardcoded format string from `buf_len`, and a custom header would duplicate it. Async matches this for consistency (a truthful length there would stall the response — `AsyncWebServerResponse` only completes once `_sentLength == _contentLength`).
- No library suppresses the HEAD body for us — `esp_http_server`, ESPAsyncWebServer and Arduino `WebServer` all have zero HEAD handling in their response paths. The generated handler must skip the body itself.
- **webserver ETag depends on `collectAllHeaders()`**: Arduino `WebServer` only retains headers it is told to collect (`_collectAllHeaders = false` by default), so `hasHeader("If-None-Match")` is false and the 304 branch is dead code without it. Use `collectAllHeaders()`, not `collectHeaders(keys, n)` — the latter re-initialises the list on every call and would clobber the user's own.

### Pipeline

File Collection → MIME/SHA256 → Gzip (level 9, >1024B, >15% reduction) → TypeScript code generation (per-engine modules) → C++ header

### Demo Apps

`demo/svelte` is a small Svelte app (LED toggle + uptime card) whose `dist` output is embedded via `dev:psychic`/`dev:async`/`dev:webserver`. `demo/esp32` (PlatformIO, all three Arduino-based engines) and `demo/esp32idf` implement `GET /api/status` / `POST /api/toggle` handlers alongside the generated static-file routes — demonstrating the generated header coexisting with hand-written API routes on the same server. Useful reference when changing route-registration code (e.g. `computeRouteCount`, `--spa`).

**Header variants.** `./package.script` regenerates one header per etag/gzip combination into `demo/{esp32,esp32idf}/include/<variant>/`, where the variant dir encodes the flags: `_` (neither), `e` (etag=always), `g` (gzip=always), `c` (…=compiler) — so `ecgc` is `--etag=compiler --gzip=compiler`, `eg` is `--etag=always --gzip=always`. Each PlatformIO env `-I`s one variant dir, which is how all etag × gzip × engine combinations get compiled. The one exception is `demo/esp32idf/include/spa/` (env `idf_SPA`), whose name encodes CLI flags rather than etag/gzip state: it is generated with `--spa --basepath=/ui` (on top of `--etag=always --gzip=always`) and is the **only** env that compiles the SPA catch-all (`httpd_register_err_handler`) and the basePath prefix guard — nothing else in either demo passes `--spa` or `--basepath`. **These headers are gitignored** (`include/**/*.h`), so they never show up in `git diff` — regenerate, don't hand-edit. `demo/esp32/include/svelteesp32.h` (top level, not a variant dir) is the `dev:*` output target.

`demo/esp32/src/credentials.h` is also gitignored but required for the PlatformIO builds to compile — it must define `ssid` / `pass`.

### CLI Options

`init` (interactive RC file wizard), `-s` (source), `-e` (engine), `-o` (output), `--etag` (always/never/compiler), `--gzip` (always/never/compiler), `--exclude` (glob patterns, **no defaults** — empty by default), `--basepath` (URL prefix, must start with `/`, no trailing `/`), `--noindexcheck`, `--dryrun`, `--analyze` (per-file size table + budget pass/fail, exits 1 on over-budget, mutually exclusive with `--dryrun`), `--spa` (catch-all for SPA client-side routing), `--manifest` (write companion `.manifest.json` alongside header), `--cachetime`, `--cachetimehtml` (HTML-only max-age, overrides `--cachetime`), `--cachetimeassets` (non-HTML max-age, overrides `--cachetime`), `--define`, `--espmethod`, `--maxsize` (total uncompressed size limit, e.g. `400k`), `--maxgzipsize` (total gzip size limit), `--created` (include creation timestamp), `--version` (embed version string in header)

RC files: `.svelteesp32rc.json` or `.svelteesp32rc` in cwd, home, or `--config=path`. Supports `$npm_package_*` interpolation. Prints a warning when loaded from cwd. `outputfile` in RC files must be a relative path (absolute paths throw). Boolean fields (`noindexcheck`, `dryrun`, `analyze`, `spa`, `manifest`, `created`) accept native booleans or string `"true"`/`"false"` (matching `etag`/`gzip` string behaviour).

## Generated C++ Details

- Tri-state `etag`/`gzip`: "always", "never", or "compiler" (C++ `#ifdef` directives)
- ESP-IDF ETag: malloc/free with NULL check (HTTP 500 on failure)
- File manifest: `{{definePrefix}}_FileInfo` struct, `{{definePrefix}}_FILES[]` array, always generated
- `onFileServed` hook: weak function `{{definePrefix}}_onFileServed(path, statusCode)`, called on 200 and 304
- `//config:` comment for traceability
- `isDefault` matching: strict `=== 'index.html' || === 'index.htm'`
- `--spa` catch-all: psychic adds `server->on("{{basePath}}/*", ...)` only when basePath is set, once for `HTTP_GET` and once for `HTTP_HEAD` (no-basePath case handled by `defaultEndpoint`); async/webserver add `server->onNotFound(...)` with optional basePath prefix guard; espidf uses `httpd_register_err_handler(HTTPD_404_NOT_FOUND, spa_handler_*)`
- Data arrays: `static const uint8_t data_*[]` / `static const uint8_t datagzip_*[]` — `static` prevents multiple-definition linker errors when included in more than one TU
- ETag variables: `static const char etag_*[]` (char array, not pointer) — avoids pointer indirection and keeps `static` linkage
- `{{definePrefix}}_URI_HANDLERS` / `{{definePrefix}}_MAX_URI_HANDLERS`: emitted for psychic and espidf. `computeRouteCount()` in `src/cppCode.ts` computes the real number of registered handlers (file count, plus one for the default `/` route when `index.html`/`index.htm` is present, plus the `--spa` catch-all — psychic only counts the default-route/SPA extras when `basePath` is set, since it aliases the default route via `defaultEndpoint` otherwise, and counts the SPA catch-all twice because it is registered once per method). `_URI_HANDLERS` is that exact count; `_MAX_URI_HANDLERS` is `_URI_HANDLERS + 5` (safety margin for the user's own custom routes). **Load-bearing for espidf only** (`httpd_config_t.max_uri_handlers`). For psychic they are informational: PsychicHttp 3.x registers one wildcard esp-idf handler per HTTP method and routes endpoints internally, overwriting `server.config.max_uri_handlers` in `start()` — assigning the define does nothing.
- Per-source cache time: `cacheTime` is computed per file in `transformSourceToTemplateData` — HTML files use `cachetimeHtml ?? cachetime`, non-HTML use `cachetimeAssets ?? cachetime`

## Testing (Vitest)

Test files in `test/unit/`. Fixtures in `test/fixtures/sample-files/`.

**Key patterns:**

- Mock fs with `vi.mock('node:fs')` and memfs
- Dynamic imports for commandLine tests (side effects)
- `test/unit/index.test.ts` uses `makeFileData()` helper at outer scope
- `test/unit/changesummary.test.ts` tests `formatChangeSummary` and `createSourceEntry` via dynamic import of `src/index.ts` (uses `vi.resetModules()` in `beforeEach`)
- `cppCodeEspIdf.ts` and `cppCodeWebserver.ts` have dedicated unit test files; `cppCodePsychic.ts` and `cppCodeAsync.ts` do not — their output is asserted in `test/unit/cppCode.test.ts` instead, which drives every engine through the public `getCppCode(sources, filesByExtension, options)` rather than calling `gen*Cpp` directly. Add psychic/async assertions there, and still confirm with `npm run test:esp32` (string assertions cannot catch a compile error)
- No dedicated `pipeline.test.ts` — `runPipeline()` is exercised indirectly through `index.test.ts` and `changesummary.test.ts`

## Documentation Conventions

- **README.md "What's New" section**: List only minor and major versions (e.g., v3.0.0, v2.4.0). Patch versions (e.g., v3.0.1, v3.0.2) must not appear — fold their content into the parent minor version entry or omit it.

## Build Config

- **TypeScript**: Target ES2023, module/moduleResolution Node16, strict mode
- **ESLint**: TypeScript + Prettier + Unicorn (all rules) + simple-import-sort
- **Prettier**: 120 char width, single quotes, no trailing commas
- **ESLint `curly` rule**: `"multi"` — braces required only for multi-statement blocks. Single-statement `if`/`else`/`for` must NOT have braces.
