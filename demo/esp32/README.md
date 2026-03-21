# Example platformio project

This folder contains a buildable minimalistic project demonstrating how to use the generated header file in a PlatformIO / Arduino project. Three web server libraries are covered: **ESPAsyncWebServer** (`async`), **PsychicHttp** (`psychic`), and **Arduino WebServer** (`webserver`).

## Setup

1. Copy `src/credentials.h.example` to `src/credentials.h` and fill in your WiFi SSID and password.
2. Run `package.script` (or `npm run generate`) from the repo root to generate all header variants into `include/`.

## Environment naming convention

Each PlatformIO environment is named `<engine>[_<flags>]` where the suffix encodes the compile-time options baked into the header:

| Suffix part | Meaning |
|-------------|---------|
| _(none)_    | No ETag, no gzip |
| `_E`        | ETag enabled (hardcoded `true`) |
| `_G`        | Gzip enabled (hardcoded `true`) |
| `_C`        | Compiler-controlled (via `#ifdef SVELTEESP32_ENABLE_*`) |
| `_EC`       | ETag compiler-controlled |
| `_EG`       | ETag `true`, gzip `true` |
| `_ECG`      | ETag compiler-controlled, gzip `true` |
| `_EGC`      | ETag `true`, gzip compiler-controlled |
| `_ECGC`     | Both ETag and gzip compiler-controlled |
| `_GC`       | Gzip compiler-controlled |

For `_C` / compiler-controlled variants, pass `-D SVELTEESP32_ENABLE_ETAG` or `-D SVELTEESP32_ENABLE_GZIP` in your build flags to activate the feature at compile time.

## Building

Build all 27 environments:

```bash
~/.platformio/penv/bin/pio run -d ./demo/esp32
```

Build a single environment:

```bash
~/.platformio/penv/bin/pio run -d ./demo/esp32 -e async_ECG
```

Available environments: `webserver`, `webserver_E`, `webserver_EC`, `webserver_ECG`, `webserver_ECGC`, `webserver_EG`, `webserver_EGC`, `webserver_G`, `webserver_GC`, `async` (same suffixes), `psychic` (same suffixes).
