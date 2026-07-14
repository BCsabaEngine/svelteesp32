# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Project Overview

TypeScript CLI tool and Vite plugin converting frontend apps (Svelte, React, Angular, Vue) into C++ header files for ESP32/ESP8266 web servers. Gzip compression, ETag support, 4 engines. Node.js >= 22, npm >= 10.

## Commands

```bash
npm run all            # fix + build + typecheck + test (full validation)
npm run typecheck      # tsc -p tsconfig.test.json — the only thing that type-checks test/
npm run test           # vitest run (also test:watch, test:coverage)
npx vitest run test/unit/file.test.ts -t "test name"   # single file / single test
npx tsx src/index.ts -e psychic -s ./demo/svelte/dist -o ./out.h --etag=always --gzip=always

npm run dev:psychic | dev:async | dev:webserver   # nodemon → demo/esp32/include/svelteesp32.h
./package.script       # regenerate every demo header variant (no build)
npm run test:esp32     # package.script, then build all 27 demo/esp32 envs
npm run test:esp32idf  # package.script, then build all 10 demo/esp32idf envs
```

The PlatformIO builds are the **only** tests that compile the generated C++ — unit tests assert on the header as a _string_ and cannot catch a type error, an overload ambiguity, or a broken `#ifdef` arm. Run `npm run test:esp32` after any change to an engine generator; the user runs these manually, so suggest the command rather than launching it.

## Architecture

- `src/index.ts` — CLI entry; delegates to `commandLine.ts` (parsing) and `pipeline.ts` (execution). Re-exports pipeline utilities as the programmatic/test API.
- `src/pipeline.ts` — `runPipeline()`: compression, MIME types, `--dryrun`, `--analyze`, `--manifest`. Exports `OverBudgetError` (`--maxsize`/`--maxgzipsize`).
- `src/commandLine.ts` — parsing (native `process.argv`), RC files, `$npm_package_*` interpolation, C++ identifier validation.
- `src/vitePlugin.ts` — Vite plugin (`./vite` entry), runs `runPipeline()` in `closeBundle()`. Two **exclusive** modes that never merge: `svelteESP32()` / `svelteESP32('/path/rc.json')` loads everything from the RC file (`outputfile` required); `svelteESP32({ output, … })` uses the options object and ignores the RC file entirely.
- `src/file.ts` — glob scan, SHA256, duplicate detection, index.html check. Returns `Map<string, FileData>` (`{ content: Buffer; hash: string }`). Skips pre-compressed `.gz`/`.br` when the original exists; no symlinks; rejects files > 50 MB; `--exclude` goes to tinyglobby's `ignore`.
- `src/cppCode.ts` — shared C++ generation: data/ETag arrays, manifest, hook, `sw()`, `cacheCtrl()`, `genCacheHeaders()`, `computeRouteCount()`. Per-engine modules `cppCode{Psychic,Async,Webserver,EspIdf}.ts` export `gen*Cpp`.
- Also `initCommand.ts`, `errorMessages.ts`, `consoleColor.ts`, `cliInit.mts`.

Pipeline: file collection → MIME/SHA256 → gzip (level 9, > 1024 B, > 15 % reduction) → per-engine codegen → C++ header.

CLI options: see README / `--help`. RC files (`.svelteesp32rc[.json]` in cwd, home, or `--config=path`) need a **relative** `outputfile` (absolute throws) and take booleans as booleans or `"true"`/`"false"`.

### Engines

- **psychic** — PsychicHttpServer V2-style API, ESP32 only. GET+HEAD.
- **async** — ESPAsyncWebServer, ESP32/ESP8266, PROGMEM. GET+HEAD.
- **espidf** — native ESP-IDF, `unsigned char` arrays with `(const char *)` casts. GET only.
- **webserver** — Arduino WebServer, ESP32, PROGMEM, synchronous (needs `handleClient()`). GET only.

### Verifying engine behaviour against the real libraries

Do not reason from memory about what these libraries do — the sources are on disk after a PlatformIO build and routinely contradict the obvious assumption (psychic does _not_ put endpoints in the esp-idf handler table; no library suppresses a HEAD body for you):

- `demo/esp32/.pio/libdeps/<env>/{PsychicHttp,ESPAsyncWebServer}/src/` — pinned in `lib_deps` to 3.1.2 / v3.11.2
- `~/.platformio/packages/framework-arduinoespressif32/libraries/WebServer/src/`
- `~/.platformio/packages/framework-espidf/components/esp_http_server/src/`

Both demos pin `platform` to a **pioarduino** `platform-espressif32` release zip (`55.03.39`), not the bare `espressif32` — that resolves from the PlatformIO registry to Espressif's _official_ platform (6.x, IDF 5.1.x), a different toolchain. The release fixes every package version `pio run` prints; they move as a set. To bump: edit the URL in **both** inis, then `pio pkg update -d demo/esp32 -d demo/esp32idf`.

### HTTP HEAD (psychic + async only, always on, no CLI flag)

- **psychic**: file routes are `HTTP_ANY`, so one endpoint covers GET and HEAD; the handler returns `405` + `Allow: GET, HEAD` otherwise and skips `setContent()` on HEAD. The `--spa` catch-all is deliberately **not** `HTTP_ANY` — a wildcard would shadow API routes registered under `basePath` after `initSvelteStaticFiles()` (psychic matches in registration order) — so it takes one `HTTP_GET` plus one `HTTP_HEAD` registration, hence `computeRouteCount()` adds 2 there.
- **async**: bitmask `HTTP_GET | HTTP_HEAD`, one handler; body skipped by a ternary on `beginResponse()`.
- No library suppresses the HEAD body for us — the generated handler must skip it itself.
- `Content-Length: 0` on HEAD is unavoidable: `httpd_resp_send()` bakes the length into a hardcoded format string from `buf_len`. Async matches this for consistency (a truthful length stalls the response — `AsyncWebServerResponse` completes only once `_sentLength == _contentLength`).
- **webserver ETag needs `collectAllHeaders()`**: Arduino `WebServer` retains only headers it was told to collect, so without it `hasHeader("If-None-Match")` is always false and the 304 branch is dead code. Not `collectHeaders(keys, n)` — it re-inits the list and clobbers the user's.

## Generated C++

- **Identifier collisions are a hard error** (`findIdentifierCollisions()` in `pipeline.ts`, before the compression loop). `toDataName()` maps every non-`[A-Za-z0-9_]` character to `_`, so `app-v1.js` and `app_v1.js` both yield `app_v1_js` — two `static const uint8_t data_app_v1_js[]` at file scope, i.e. a redefinition error deep in the user's firmware build. Compared **case-insensitively**, because `{{definePrefix}}_FILE_<NAME>` and espidf's `file_handler_`/`route_`/`spa_handler_` symbols use `datanameUpperCase`. Never auto-suffix instead: `_FILE_<NAME>` is a documented define users reference, and a suffix would make it depend on glob iteration order.
- Tri-state `etag`/`gzip` → `always` / `never` / `compiler` (`#ifdef` arms). Data arrays `static const uint8_t data_*[]` / `datagzip_*[]`, ETags `static const char etag_*[]` — `static` avoids multiple-definition errors across TUs; a char array (not a pointer) avoids indirection.
- **ETag value**: SHA256 truncated to 16 hex chars and **quoted** — `etagLiteral()` in `cppCode.ts` (RFC 9110 `DQUOTE *etagc DQUOTE`; some proxies mishandle unquoted). Truncate **only at this emission seam**: `file.ts` must keep the full hash, which also feeds duplicate detection, the `--manifest` JSON, and the change-summary diff against the previous manifest — a stored 64-char hash never equals a truncated one, so every file would read "modified" forever.
- **`If-None-Match` uses `strstr(header, etag_*)`**, not `strcmp`/`.equals()` — browsers send comma-separated lists and weak `W/"…"` validators, which exact equality misses. Safe because `etagc` excludes `"`, so a quoted tag only matches a complete entity-tag; matching through `W/` is the weak comparison RFC 9110 mandates here. Compare to `nullptr` (C++ engines) / `NULL` (espidf — its header is C).
- **`Cache-Control` is not gated on the etag mode.** On the 200 path all four engines go through `genCacheHeaders()`, which emits `Cache-Control` unconditionally and wraps **only** the `ETag` line in `sw(d.etag, …)`. Do not fold it back into that switch: the switch has no `never` arm, so `--etag=never` would silently emit no `Cache-Control` at all, voiding `--cachetime*`. It is a freshness lifetime, not a validator.
- **The 304 branch repeats `ETag` and `Cache-Control`** (RFC 9110 §15.4.5 — a 304 must generate what a 200 would have carried; without them the client cannot freshen the stored lifetime and revalidates every load, voiding `--cachetime`). `Content-Encoding`/`Content-Type` are deliberately omitted: representation headers, and there is no body. Each engine builds its 304 **once** into an `etagBody` const that `sw()` wraps for the `compiler` arm — do not duplicate it across the `always`/`compiler` arms; drift between them is how the 304 lost its headers once already.
- 304 constraints per engine: **async** must use `request->beginResponse(304)` (the `send(304)` overload sends immediately, leaving no handle for headers); **webserver**'s `send()` flushes the header block, so both `sendHeader()` calls must precede it; **espidf**'s `httpd_resp_set_hdr()` does not copy key/value — safe only because `etag_*` is a `static const char[]` and the cache value is a literal.
- **`{{definePrefix}}_URI_HANDLERS` / `_MAX_URI_HANDLERS`** (psychic + espidf): `computeRouteCount()` counts real registrations — files, plus the default `/` route when `index.html`/`index.htm` exists, plus the `--spa` catch-all. Psychic counts the default-route/SPA extras only when `basePath` is set (it otherwise aliases the default via `defaultEndpoint`) and counts the SPA catch-all twice (once per method). `_MAX_` adds `+5` headroom. **Load-bearing for espidf only** (`httpd_config_t.max_uri_handlers`); psychic overwrites `server.config.max_uri_handlers` in `start()`, so there it is informational.
- `--spa` catch-all: psychic `server->on("{{basePath}}/*", …)` only when basePath is set (otherwise handled by `defaultEndpoint`); async/webserver `onNotFound()` with an optional basePath prefix guard; espidf `httpd_register_err_handler(HTTPD_404_NOT_FOUND, …)`.
- Per-file `cacheTime` in `transformSourceToTemplateData`: HTML → `cachetimeHtml ?? cachetime`, non-HTML → `cachetimeAssets ?? cachetime`.
- Always emitted: `_FileInfo` / `_FILES[]` manifest, weak `_onFileServed(path, statusCode)` hook (fires on 200 and 304), `//config:` comment. `isDefault` is strict `=== 'index.html' || === 'index.htm'`. ESP-IDF ETag mallocs with a NULL check (HTTP 500 on failure).

## Demos

`demo/svelte` is the embedded frontend. `demo/esp32` (the three Arduino engines) and `demo/esp32idf` register hand-written `GET /api/status` / `POST /api/toggle` handlers alongside the generated routes — the reference for anything touching route registration (`computeRouteCount`, `--spa`).

**Header variants.** `./package.script` regenerates one header per etag/gzip combination into `demo/{esp32,esp32idf}/include/<variant>/`, the dir name encoding the flags: `_` neither, `e` etag=always, `g` gzip=always, `c` …=compiler — so `eg` is `--etag=always --gzip=always`, `ecgc` is both `=compiler`. Each PlatformIO env `-I`s one variant dir; that is how every etag × gzip × engine combination gets compiled. Exception: `demo/esp32idf/include/spa/` (env `idf_SPA`) encodes CLI flags instead — `--spa --basepath=/ui` on top of `--etag=always --gzip=always` — and is the **only** env compiling the SPA catch-all and the basePath guard.

These headers are gitignored (`include/**/*.h`) and never appear in `git diff` — regenerate, don't hand-edit. `demo/esp32/include/svelteesp32.h` (top level) is the `dev:*` target. `demo/esp32/src/credentials.h` is gitignored too but must exist (`ssid` / `pass`) or the builds won't compile.

## Testing (Vitest)

Tests in `test/unit/`, fixtures in `test/fixtures/sample-files/`.

- Mock fs with `vi.mock('node:fs')` + memfs. Dynamic imports for commandLine tests (side effects), with `vi.resetModules()` in `beforeEach`.
- `cppCodeEspIdf.ts` and `cppCodeWebserver.ts` have dedicated test files; **psychic and async do not** — assert their output in `test/unit/cppCode.test.ts`, which drives every engine through the public `getCppCode(sources, filesByExtension, options)` rather than `gen*Cpp` directly.
- No `pipeline.test.ts` — `runPipeline()` is covered indirectly via `index.test.ts` and `changesummary.test.ts`.
- **Vitest does not type-check** (esbuild strips types). `tsconfig.json` excludes `test/`, so `tsconfig.test.json` covers it — `bundler` resolution, because the tests import extensionlessly. Run `npm run typecheck`; it is in `npm run all` and in CI.
- Coverage thresholds are 90/90/80/90 (lines/functions/branches/statements) vs actual ~96/98/88/95. Enforced in CI — both workflows run `npm run test:coverage`, not `npm run test`, because vitest only checks thresholds under `--coverage`.

## Conventions

- **TypeScript**: ES2025, module/moduleResolution nodenext, strict + `isolatedModules`, `noUncheckedIndexedAccess`.
- **ESLint**: TypeScript + Prettier + Unicorn (all rules) + simple-import-sort. **`curly: "multi"`** — braces only for multi-statement blocks; single-statement `if`/`else`/`for` must **not** have braces.
- **Prettier**: 120 char width, single quotes, no trailing commas.
- **README "What's New"**: minor and major versions only — no patch versions; fold them into the parent minor entry.
