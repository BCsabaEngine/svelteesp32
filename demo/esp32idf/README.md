# Example platformio ESP-IDF project

This folder contains a buildable minimalistic project demonstrating how to use the generated header file in a PlatformIO / native ESP-IDF project (`framework = espidf`).

`src/main.c` starts an `esp_http_server`, calls `initSvelteStaticFiles(httpd)` to register the embedded static files, and adds its own `GET /api/status` and `POST /api/toggle` handlers (LED + uptime) — showing that the generated header coexists with hand-written API routes on the same server.

## Setup

1. Copy `src/credentials.h.example` to `src/credentials.h` and fill in your WiFi SSID and password.
2. Run `./package.script` from the repo root to generate all header variants into `include/`. These headers are gitignored — regenerate them, never hand-edit.

## Sizing `max_uri_handlers`

ESP-IDF fixes the URI handler table size at `httpd_start()`, and registering more routes than it has slots fails at runtime. The generated header does the counting for you, so `src/main.c` uses it directly:

```c
config.max_uri_handlers = SVELTEESP32_MAX_URI_HANDLERS;
```

`SVELTEESP32_URI_HANDLERS` is the exact number of routes `initSvelteStaticFiles()` registers (files + the default `/` route + the `--spa` catch-all); `SVELTEESP32_MAX_URI_HANDLERS` is that plus a margin of 5 for your own routes. Do not compute this from `SVELTEESP32_COUNT` — that is the *file* count, and it excludes the default and SPA routes.

## Environments

Every environment builds the same `src/main.c` against a different generated header, which is how all ETag × gzip combinations get compiled. Each one `-I`s a single variant dir under `include/`, whose name encodes the generator flags: `e` = `--etag=always`, `g` = `--gzip=always`, a trailing `c` = that feature is `compiler`-controlled (wrapped in `#ifdef SVELTEESP32_ENABLE_*`), `_` = neither.

| Environment | Header generated with              | Build defines                                     |
| ----------- | ---------------------------------- | ------------------------------------------------- |
| `idf`       | –                                  | –                                                 |
| `idf_E`     | `--etag=always`                    | –                                                 |
| `idf_G`     | `--gzip=always`                    | –                                                 |
| `idf_EG`    | `--etag=always --gzip=always`      | –                                                 |
| `idf_EC`    | `--etag=compiler`                  | `SVELTEESP32_ENABLE_ETAG`                         |
| `idf_GC`    | `--gzip=compiler`                  | `SVELTEESP32_ENABLE_GZIP`                         |
| `idf_ECG`   | `--etag=compiler --gzip=always`    | `SVELTEESP32_ENABLE_ETAG`                         |
| `idf_EGC`   | `--etag=always --gzip=compiler`    | `SVELTEESP32_ENABLE_GZIP`                         |
| `idf_ECGC`  | `--etag=compiler --gzip=compiler`  | `SVELTEESP32_ENABLE_ETAG`, `SVELTEESP32_ENABLE_GZIP` |
| `idf_SPA`   | `--etag=always --gzip=always --spa --basepath=/ui` | –                                 |

All variants are additionally generated with `--cachetime=86400`. For `compiler`-controlled variants, the feature only becomes active if the matching `-D SVELTEESP32_ENABLE_*` flag is passed — that is what the "Build defines" column does.

`idf_SPA` is the odd one out: its suffix encodes CLI flags rather than ETag/gzip state. It is the only environment that compiles the SPA catch-all (`httpd_register_err_handler(HTTPD_404_NOT_FOUND, ...)`) and the `--basepath` prefix guard, so its static routes live under `/ui` instead of `/`.

## Building

From the repo root, regenerate the headers and build all 10 environments:

```bash
npm run test:esp32idf
```

That is the only test in this repo that feeds the generated ESP-IDF code to a real compiler — the unit tests assert on the header as a string and cannot catch a C type error or a broken `#ifdef` arm. Run it after any change to `src/cppCodeEspIdf.ts`.

To build without regenerating, or to build a single environment:

```bash
~/.platformio/penv/bin/pio run -d ./demo/esp32idf
~/.platformio/penv/bin/pio run -d ./demo/esp32idf -e idf_SPA
```
