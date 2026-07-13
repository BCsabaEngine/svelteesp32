# Example platformio project

This folder contains a buildable minimalistic project demonstrating how to use the generated header file in a PlatformIO / Arduino project. Three web server libraries are covered: **ESPAsyncWebServer** (`async`), **PsychicHttp** (`psychic`), and **Arduino WebServer** (`webserver`).

Each engine has its own sketch — `src/main_async.cpp`, `src/main_psychic.cpp`, `src/main_webserver.cpp` — selected per environment with `build_src_filter`, so only one is compiled at a time. Every sketch calls `initSvelteStaticFiles(&server)` to register the embedded static files and then adds its own `GET /api/status` and `POST /api/toggle` handlers (LED + uptime), showing that the generated header coexists with hand-written API routes on the same server.

The `async` and `psychic` environments pin their library via `lib_deps` (ESPAsyncWebServer `v3.11.2`, PsychicHttp `3.1.2`); `webserver` uses the `WebServer` library bundled with the Arduino ESP32 core.

## Setup

1. Copy `src/credentials.h.example` to `src/credentials.h` and fill in your WiFi SSID and password.
2. Run `./package.script` from the repo root to generate all header variants into `include/`. These headers are gitignored — regenerate them, never hand-edit.

## Environments

There are 27 environments: three engines × nine ETag/gzip variants. Every environment builds the same sketch against a different generated header, which is how all engine × ETag × gzip combinations get compiled. Each one `-I`s a single variant dir under `include/`, whose name encodes the generator flags: `e` = `--etag=always`, `g` = `--gzip=always`, a trailing `c` = that feature is `compiler`-controlled (wrapped in `#ifdef SVELTEESP32_ENABLE_*`), `_` = neither.

The suffix table below applies identically to all three engines (`async`, `psychic`, `webserver`) — e.g. `async_ECG`, `psychic_ECG`, `webserver_ECG`.

| Suffix    | Header generated with             | Build defines                                        |
| --------- | --------------------------------- | ---------------------------------------------------- |
| _(none)_  | –                                 | –                                                    |
| `_E`      | `--etag=always`                   | –                                                    |
| `_G`      | `--gzip=always`                   | –                                                    |
| `_EG`     | `--etag=always --gzip=always`     | –                                                    |
| `_EC`     | `--etag=compiler`                 | `SVELTEESP32_ENABLE_ETAG`                            |
| `_GC`     | `--gzip=compiler`                 | `SVELTEESP32_ENABLE_GZIP`                            |
| `_ECG`    | `--etag=compiler --gzip=always`   | `SVELTEESP32_ENABLE_ETAG`                            |
| `_EGC`    | `--etag=always --gzip=compiler`   | `SVELTEESP32_ENABLE_GZIP`                            |
| `_ECGC`   | `--etag=compiler --gzip=compiler` | `SVELTEESP32_ENABLE_ETAG`, `SVELTEESP32_ENABLE_GZIP` |

All variants are additionally generated with `--cachetime=86400`. For `compiler`-controlled variants, the feature only becomes active if the matching `-D SVELTEESP32_ENABLE_*` flag is passed — that is what the "Build defines" column does.

Note that `--spa` and `--basepath` are not exercised here; the only environment that compiles those code paths is `idf_SPA` in [`demo/esp32idf`](../esp32idf/README.md).

## Building

From the repo root, regenerate the headers and build all 27 environments:

```bash
npm run test:esp32
```

That is the only test in this repo that feeds the generated Arduino code to a real compiler — the unit tests assert on the header as a string and cannot catch a C++ type error, an overload ambiguity, or a broken `#ifdef` arm. Run it after any change to `src/cppCodePsychic.ts`, `src/cppCodeAsync.ts`, or `src/cppCodeWebserver.ts`.

To build without regenerating, or to build a single environment:

```bash
~/.platformio/penv/bin/pio run -d ./demo/esp32
~/.platformio/penv/bin/pio run -d ./demo/esp32 -e async_ECG
```
