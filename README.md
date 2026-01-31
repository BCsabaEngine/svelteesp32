# svelteesp32 ![image](https://badges.github.io/stability-badges/dist/stable.svg)

### Embed Any Web App in Your ESP32 — One Binary, Zero Filesystem Hassle

**Turn your Svelte, React, Angular, or Vue frontend into a single C++ header file.** Serve beautiful web interfaces directly from ESP32/ESP8266 flash memory with automatic gzip compression, ETag caching, and seamless OTA updates.

[Changelog](CHANGELOG.md)

---

## Why SvelteESP32?

**The problem:** Traditional approaches like SPIFFS and LittleFS require separate partition uploads, complex OTA workflows, and manual compression. Your users end up managing multiple files, and your CI/CD pipeline becomes a mess.

**The solution:** SvelteESP32 compiles your entire web application into a single C++ header file. One firmware binary. One OTA update. Done.

### Key Benefits

- **Single Binary OTA** — Everything embedded in firmware. No partition juggling, no separate uploads.
- **Automatic Optimization** — Build-time gzip compression with intelligent thresholds (>1KB, >15% reduction).
- **Smart Caching** — Built-in SHA256 ETags deliver HTTP 304 responses, slashing bandwidth on constrained devices.
- **CI/CD Ready** — Simple npm package that slots into any build pipeline.
- **Zero Runtime Overhead** — Data served directly from flash. No filesystem reads, no RAM allocation.
- **4 Web Server Engines** — PsychicHttp V1/V2, ESPAsyncWebServer, and native ESP-IDF supported.

---

## SvelteESP32 vs Traditional Filesystem

| Feature               | SvelteESP32                       | SPIFFS / LittleFS                        |
| --------------------- | --------------------------------- | ---------------------------------------- |
| **Single Binary OTA** | ✓ Everything in firmware          | ✗ Separate partition upload required     |
| **Gzip Compression**  | ✓ Automatic at build time         | Manual or runtime compression            |
| **ETag Support**      | ✓ Built-in SHA256 + 304 responses | Manual implementation required           |
| **CI/CD Integration** | ✓ One npm command                 | Complex upload_fs tooling                |
| **Memory Efficiency** | Flash only (PROGMEM/const arrays) | Filesystem partition + overhead          |
| **Performance**       | Direct byte array serving         | Filesystem read latency                  |
| **Setup Complexity**  | Include header, call one function | Partition tables, upload tools, handlers |

**Best for:** Single-binary OTA, CI/CD pipelines, static web UIs that ship with firmware.

**Consider SPIFFS/LittleFS for:** User-uploadable files, runtime-editable configs, dynamic content.

---

## Quick Start

```bash
npm install -D svelteesp32
```

After building your frontend (Vite/Rollup/Webpack):

```bash
npx svelteesp32 -e psychic -s ./dist -o ./esp32/svelteesp32.h --etag=true
```

Include in your ESP32 project:

```c
#include <PsychicHttp.h>
#include "svelteesp32.h"

PsychicHttpServer server;

void setup() {
    server.listen(80);
    initSvelteStaticFiles(&server);
}
```

**That's it.** Your entire web app is now embedded and ready to serve.

---

## What's New

- **v1.15.0** — `--base-path` for multiple frontends (e.g., `/admin`, `/app`)
- **v1.13.0** — npm package variable interpolation in RC files
- **v1.12.0** — RC file configuration support
- **v1.11.0** — File exclusion patterns
- **v1.9.0** — Native ESP-IDF engine
- **v1.5.0** — PsychicHttp V2 support

---

## Requirements

- Node.js >= 20
- npm >= 9

---

## Installation & Usage

### Install

```bash
npm install -D svelteesp32
```

### Generate Header File

Choose your web server engine:

```bash
# PsychicHttpServer (recommended for ESP32)
npx svelteesp32 -e psychic -s ./dist -o ./esp32/svelteesp32.h --etag=true

# PsychicHttpServer V2
npx svelteesp32 -e psychic2 -s ./dist -o ./esp32/svelteesp32.h --etag=true

# ESPAsyncWebServer (ESP32 + ESP8266)
npx svelteesp32 -e async -s ./dist -o ./esp32/svelteesp32.h --etag=true

# Native ESP-IDF
npx svelteesp32 -e espidf -s ./dist -o ./esp32/svelteesp32.h --etag=true
```

### Build Output

Watch your files get optimized in real-time:

```
[assets/index-KwubEIf-.js]  ✓ gzip used (38850 -> 12547 = 32%)
[assets/index-Soe6cpLA.css] ✓ gzip used (32494 -> 5368 = 17%)
[favicon.png]               x gzip unused (33249 -> 33282 = 100%)
[index.html]                x gzip unused (too small) (472 -> 308 = 65%)
[roboto_regular.json]       ✓ gzip used (363757 -> 93567 = 26%)

5 files, 458kB original size, 142kB gzip size
../../../Arduino/EspSvelte/svelteesp32.h 842kB size
```

**Automatic optimizations:**

- Gzip level 9 compression when beneficial (>1KB, >15% size reduction)
- Duplicate file detection via SHA256 hashing
- Smart skip of pre-compressed files (.gz, .br) when originals exist

### ESP32 Integration

**PsychicHttpServer (Recommended)**

```c
#include <PsychicHttp.h>
#include "svelteesp32.h"

PsychicHttpServer server;

void setup() {
    server.listen(80);
    initSvelteStaticFiles(&server);  // One line. Done.
}
```

**ESPAsyncWebServer**

```c
#include <ESPAsyncWebServer.h>
#include "svelteesp32.h"

AsyncWebServer server(80);

void setup() {
    initSvelteStaticFiles(&server);
    server.begin();
}
```

**Native ESP-IDF**

```c
#include <esp_http_server.h>
#include "svelteesp32.h"

httpd_handle_t server = NULL;

void app_main() {
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    httpd_start(&server, &config);
    initSvelteStaticFiles(server);
}
```

Working examples: [Arduino/PlatformIO](demo/esp32) | [ESP-IDF](demo/esp32idf)

### What Gets Generated

The generated header file includes everything your ESP needs:

```c
//engine:   PsychicHttpServer
//config:   engine=psychic sourcepath=./dist outputfile=./output.h etag=true gzip=true cachetime=0 espmethod=initSvelteStaticFiles define=SVELTEESP32
//
#define SVELTEESP32_COUNT 5
#define SVELTEESP32_SIZE 468822
#define SVELTEESP32_SIZE_GZIP 145633
#define SVELTEESP32_FILE_INDEX_HTML
#define SVELTEESP32_HTML_FILES 1
#define SVELTEESP32_CSS_FILES 1
#define SVELTEESP32_JS_FILES 1
...

#include <Arduino.h>
#include <PsychicHttp.h>
#include <PsychicHttpsServer.h>

const uint8_t datagzip_assets_index_KwubEIf__js[12547] = {0x1f, 0x8b, 0x8, 0x0, ...
const uint8_t datagzip_assets_index_Soe6cpLA_css[5368] = {0x1f, 0x8b, 0x8, 0x0, 0x0, ...
const char * etag_assets_index_KwubEIf__js = "387b88e345cc56ef9091...";
const char * etag_assets_index_Soe6cpLA_css = "d4f23bc45ef67890ab12...";

// File manifest for runtime introspection
struct SVELTEESP32_FileInfo {
  const char* path;
  uint32_t size;
  uint32_t gzipSize;
  const char* etag;
  const char* contentType;
};
const SVELTEESP32_FileInfo SVELTEESP32_FILES[] = {
  { "/assets/index-KwubEIf-.js", 38850, 12547, etag_assets_index_KwubEIf__js, "text/javascript" },
  { "/assets/index-Soe6cpLA.css", 32494, 5368, etag_assets_index_Soe6cpLA_css, "text/css" },
  ...
};
const size_t SVELTEESP32_FILE_COUNT = sizeof(SVELTEESP32_FILES) / sizeof(SVELTEESP32_FILES[0]);
...

// File served hook - override with your own implementation for metrics/logging
extern "C" void __attribute__((weak)) SVELTEESP32_onFileServed(const char* path, int statusCode) {}

void initSvelteStaticFiles(PsychicHttpServer * server) {
  server->on("/assets/index-KwubEIf-.js", HTTP_GET, [](PsychicRequest * request) {
    if (request->hasHeader("If-None-Match") &&
        request->header("If-None-Match").equals(etag_assets_index_KwubEIf__js)) {
      PsychicResponse response304(request);
      response304.setCode(304);
      SVELTEESP32_onFileServed("/assets/index-KwubEIf-.js", 304);
      return response304.send();
    }

    PsychicResponse response(request);
    response.setContentType("text/javascript");
    response.addHeader("Content-Encoding", "gzip");
    response.addHeader("Cache-Control", "no-cache");
    response.addHeader("ETag", etag_assets_index_KwubEIf__js);
    response.setContent(datagzip_assets_index_KwubEIf__js, 12547);
    SVELTEESP32_onFileServed("/assets/index-KwubEIf-.js", 200);
    return response.send();
  });

  // ... more routes
}
```

---

## Supported Web Server Engines

| Engine                | Flag          | Best For                     | Platform        |
| --------------------- | ------------- | ---------------------------- | --------------- |
| **PsychicHttp V1**    | `-e psychic`  | Maximum performance          | ESP32 only      |
| **PsychicHttp V2**    | `-e psychic2` | Modern API + performance     | ESP32 only      |
| **ESPAsyncWebServer** | `-e async`    | Cross-platform compatibility | ESP32 + ESP8266 |
| **Native ESP-IDF**    | `-e espidf`   | Pure ESP-IDF projects        | ESP32 only      |

**Recommendation:** For ESP32-only projects, use PsychicHttpServer for the fastest, most stable experience.

**Note:** For PsychicHttp, configure `server.config.max_uri_handlers` to match your file count.

---

## Features

### Automatic Gzip Compression

Your JS, CSS, and HTML files are automatically compressed at build time — not on the ESP32. Files are gzipped when they're >1KB and achieve >15% size reduction.

- **Enabled by default** — disable with `--gzip=false`
- **Compiler mode** — use `--gzip=compiler` and control via `-D SVELTEESP32_ENABLE_GZIP` in PlatformIO

### Smart ETag Caching

Reduce bandwidth dramatically with HTTP 304 "Not Modified" responses. When a browser has a cached file, the ESP32 sends just a status code instead of the entire file — perfect for bandwidth-constrained IoT devices.

- **Enable with** `--etag=true` (recommended)
- **Minimal overhead** — adds ~1-3% code size for significant bandwidth savings
- **Compiler mode** — use `--etag=compiler` and control via `-D SVELTEESP32_ENABLE_ETAG`

All four engines support full ETag validation.

### Browser Cache Control

Fine-tune how browsers cache your content:

- **Default:** `no-cache` — browsers always validate with server (ETag check)
- **Long-term caching:** `--cachetime=86400` — cache for 24 hours without any server requests

### Automatic Index Handling

Your `index.html` is automatically served at the root URL — just like any web server. Visit `http://esp32.local/` and your app loads.

**API-only projects?** Skip index validation with `--no-index-check`:

```bash
npx svelteesp32 -e psychic -s ./dist -o ./output.h --no-index-check
```

### File Exclusion

Keep source maps, docs, and test files out of your firmware:

```bash
# Single pattern
npx svelteesp32 -s ./dist -o ./output.h --exclude="*.map"

# Multiple patterns
npx svelteesp32 -s ./dist -o ./output.h --exclude="*.map,*.md,test/**/*"
```

**Default exclusions:** `.DS_Store`, `Thumbs.db`, `.git`, `.svn`, `*.swp`, `*~`, `.gitignore`, `.gitattributes`

Build output shows exactly what's excluded:

```
Excluded 3 file(s):
  - assets/index.js.map
  - assets/vendor.js.map
  - README.md
```

### Multiple Frontends (Base Path)

Serve multiple web apps from one ESP32 using URL prefixes:

```bash
npx svelteesp32 -s ./admin-dist -o ./admin.h --base-path=/admin
npx svelteesp32 -s ./user-dist -o ./user.h --base-path=/app
```

```c
#include "admin.h"  // Serves at /admin/*
#include "user.h"   // Serves at /app/*

void setup() {
    server.listen(80);
    initSvelteStaticFiles_admin(&server);
    initSvelteStaticFiles_user(&server);
    server.on("/api/data", HTTP_GET, handleApiData);
}
```

**Rules:** Must start with `/`, no trailing slash, no double slashes.

### C++ Build-Time Validation

Catch configuration issues at compile time with generated defines:

```c
#include "svelteesp32.h"

#if SVELTEESP32_COUNT != 5
  #error Unexpected file count - check your build
#endif

#ifndef SVELTEESP32_FILE_INDEX_HTML
  #error Missing index.html - frontend build failed?
#endif
```

**Available defines:** `SVELTEESP32_COUNT`, `SVELTEESP32_SIZE`, `SVELTEESP32_SIZE_GZIP`, `SVELTEESP32_FILE_*`, `SVELTEESP32_*_FILES`

### Runtime File Manifest

Query embedded files at runtime for logging, diagnostics, or API endpoints:

```c
// List all embedded files
for (size_t i = 0; i < SVELTEESP32_FILE_COUNT; i++) {
    const auto& f = SVELTEESP32_FILES[i];
    Serial.printf("%s (%d bytes, gzip: %d)\n", f.path, f.size, f.gzipSize);
}
```

Each file entry includes: `path`, `size`, `gzipSize`, `etag`, `contentType`

### Request Hook (Metrics & Logging)

Track every request with zero overhead when unused (weak linkage):

```c
extern "C" void SVELTEESP32_onFileServed(const char* path, int statusCode) {
    Serial.printf("[HTTP] %s -> %d\n", path, statusCode);
    if (statusCode == 304) cacheHits++;
}
```

Called for every response (200 = content served, 304 = cache hit).

---

## CLI Reference

| Option             | Description                                       | Default                 |
| ------------------ | ------------------------------------------------- | ----------------------- |
| `-s`               | Source folder with compiled web files             | (required)              |
| `-e`               | Web server engine (psychic/psychic2/async/espidf) | `psychic`               |
| `-o`               | Output header file path                           | `svelteesp32.h`         |
| `--etag`           | ETag caching (true/false/compiler)                | `false`                 |
| `--gzip`           | Gzip compression (true/false/compiler)            | `true`                  |
| `--exclude`        | Exclude files by glob pattern                     | System files            |
| `--base-path`      | URL prefix for all routes                         | (none)                  |
| `--cachetime`      | Cache-Control max-age in seconds                  | `0`                     |
| `--version`        | Version string in header                          | (none)                  |
| `--define`         | C++ define prefix                                 | `SVELTEESP32`           |
| `--espmethod`      | Init function name                                | `initSvelteStaticFiles` |
| `--config`         | Custom RC file path                               | `.svelteesp32rc.json`   |
| `--no-index-check` | Skip index.html validation                        | `false`                 |
| `-h`               | Show help                                         |                         |

---

## Configuration File

Store your settings in `.svelteesp32rc.json` for zero-argument builds:

```json
{
  "engine": "psychic",
  "sourcepath": "./dist",
  "outputfile": "./esp32/svelteesp32.h",
  "etag": "true",
  "gzip": "true",
  "exclude": ["*.map", "*.md"]
}
```

Then just run:

```bash
npx svelteesp32
```

### npm Variable Interpolation

Sync versions and names automatically from your `package.json`:

```json
{
  "version": "v$npm_package_version",
  "define": "$npm_package_name"
}
```

With `package.json` containing `"version": "2.1.0"`, this becomes `"version": "v2.1.0"`.

### Multiple Environments

```bash
npx svelteesp32 --config=.svelteesp32rc.prod.json
```

CLI arguments always override RC file values.

---

## FAQ

**How large can my web app be?**
With gzip compression, 3-4MB asset directories work comfortably. That's enough for a full-featured SPA.

**Does this use RAM or Flash?**
Flash only. Data is stored in program memory (PROGMEM on ESP8266, const arrays on ESP32), leaving your heap and stack free for application logic.

**Why is the .h file so large?**
The text representation (comma-separated bytes) is larger than binary. Check `SVELTEESP32_SIZE_GZIP` for actual flash usage.

**Does compilation take forever?**
No. Large headers compile in seconds, and incremental builds skip recompilation if your frontend hasn't changed.

**Can frontend and firmware teams work separately?**
Absolutely. Frontend builds the app, runs svelteesp32, commits the header. Firmware team includes it and ships. Version sync via npm variables keeps everyone aligned.

---

## Development

```bash
npm run build        # Build TypeScript
npm run test         # Run unit tests
npm run test:watch   # Watch mode
npm run fix          # Fix formatting & linting
```

---

**Ready to ship your web UI in a single binary?**

```bash
npm install -D svelteesp32
```
