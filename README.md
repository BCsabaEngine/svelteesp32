# `svelteesp32` ![image](https://badges.github.io/stability-badges/dist/stable.svg)

[Changelog](CHANGELOG.md)

# Convert Svelte (or React/Angular/Vue) JS application to serve it from ESP32/ESP8266 webserver

### Forget SPIFFS and LittleFS now

I often make small to medium-sized microcontroller solutions that run on ESP32 or ESP8266. If a web interface is needed, I create a Svelte application. The Svelte application is practically served by the ESP32/ESP8266.

In order to be able to easily update OTA, it is important - from the users' point of view - that the update file **consists of one file**. I can't use the SPIFFS/LittleFS solution for this. It is necessary that the WebUI files are included inline in the Arduino or PlatformIO c++ code.

This npm package provides a solution for **inserting any JS client application into the ESP web server** (PsychicHttp and also ESPAsyncWebServer (https://github.com/ESP32Async/ESPAsyncWebServer) and ESP-IDF available, PsychicHttp is the default). For this, JS, html, css, font, assets, etc. files must be converted to binary byte array. Npm mode is easy to use and easy to **integrate into your CI/CD pipeline**.

**Quick Comparison:**

| Feature               | SvelteESP32                                | Traditional Filesystem (SPIFFS/LittleFS) |
| --------------------- | ------------------------------------------ | ---------------------------------------- |
| **Single Binary OTA** | ✓ Everything embedded in firmware          | ✗ Requires separate partition upload     |
| **Gzip Compression**  | ✓ Automatic build-time (>15% reduction)    | Manual or runtime compression            |
| **ETag Support**      | ✓ Built-in SHA256 ETags with 304 responses | Manual implementation required           |
| **CI/CD Integration** | ✓ npm package, simple build step           | Complex with upload_fs tools             |
| **Memory Efficiency** | Flash only (PROGMEM/const arrays)          | Flash partition + filesystem overhead    |
| **Performance**       | Direct byte array serving                  | Filesystem read overhead                 |
| **Setup Complexity**  | Include header, call init function         | Partition setup, upload tools, handlers  |

**When to use:**

- **SvelteESP32**: Single-binary OTA updates, CI/CD pipelines, static web content that doesn't change at runtime
- **SPIFFS/LittleFS**: Dynamic content, user-uploadable files, configuration that changes at runtime

> Starting with version v1.13.0, RC files support npm package variable interpolation

> Starting with version v1.12.0, you can use RC file for configuration

> Starting with version v1.11.0, you can exclude files by pattern

> Starting with version v1.10.0, we reduced npm dependencies

> Starting with version v1.9.0, code generator for esp-idf is available

> Starting with version v1.8.0, use the new and maintained ESPAsyncWebserver available at https://github.com/ESP32Async/ESPAsyncWebServer

> Starting with version v1.7.0, with the cachetime command line option, you can set whether the browser can cache pages

> Starting with version v1.6.0, mime-types package properly handles MIME types (application/javascript -> text/javascript)

> Starting with version v1.5.0, PsychicHttp v2 is also supported.

> Version v1.4.0 has a breaking change! --no-gzip changed to --gzip. Starting with this version c++ compiler directives are available to setup operation in project level.

> Starting with version v1.3.0, c++ defines can be used.

> Starting with version v1.2.0, ESP8266/ESP8285 is also supported.

> Starting with version v1.1.0, the ETag header is also supported.

### Requirements

- Node.js >= 20
- npm >= 9

### Development

#### Testing

The project includes comprehensive unit tests using Vitest:

```bash
# Run tests once
npm run test

# Run tests in watch mode (for development)
npm run test:watch

# Generate coverage report
npm run test:coverage
```

**Test Coverage:** ~68% overall with focus on core functionality:

- `commandLine.ts`: 84.56% - CLI argument parsing and validation
- `file.ts`: 100% - File operations and duplicate detection
- `cppCode.ts`: 96.62% - C++ code generation and templates
- `consoleColor.ts`: 100% - Console output utilities

Coverage reports are generated in the `coverage/` directory and can be viewed by opening `coverage/index.html` in a browser.

#### Code Quality

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

### Usage

**Install package** as dev dependency (it is practical if the package is part of the project so that you always receive updates)

```bash
npm install -D svelteesp32
```

After a successful Svelte build (rollup/webpack/vite) **create an includable c++ header** file

```bash
// for PsychicHttpServer
npx svelteesp32 -e psychic -s ../svelteapp/dist -o ../esp32project/svelteesp32.h --etag=true

// for PsychicHttpServer V2
npx svelteesp32 -e psychic2 -s ../svelteapp/dist -o ../esp32project/svelteesp32.h --etag=true

// for ESPAsyncWebServer
npx svelteesp32 -e async -s ../svelteapp/dist -o ../esp32project/svelteesp32.h --etag=true

// for native esp-idf
npx svelteesp32 -e espidf -s ../svelteapp/dist -o ../esp32project/svelteesp32.h --etag=true
```

During the **translation process**, the processed file details are visible with compression ratios, and at the end, the result shows the ESP's memory allocation (gzip size)

```
[assets/index-KwubEIf-.js]  ✓ gzip used (38850 -> 12547 = 32%)
[assets/index-Soe6cpLA.css] ✓ gzip used (32494 -> 5368 = 17%)
[favicon.png]               x gzip unused (33249 -> 33282 = 100%)
[index.html]                x gzip unused (too small) (472 -> 308 = 65%)
[roboto_regular.json]       ✓ gzip used (363757 -> 93567 = 26%)

5 files, 458kB original size, 142kB gzip size
../../../Arduino/EspSvelte/svelteesp32.h 842kB size
```

The tool automatically:

- Compresses files with gzip level 9 when beneficial (>1024 bytes and >15% reduction)
- Detects and reports duplicate files using SHA256 hashing
- Skips pre-compressed files (.gz, .br, .brottli) if the original exists

**Include svelteesp32.h** into your Arduino or PlatformIO c++ project (copy it next to the main c++ file)

```c
...

#include <PsychicHttp.h>
#include "svelteesp32.h"

PsychicHttpServer server;

...

void setup()
{
    ...

    server.listen(80);

    initSvelteStaticFiles(&server);
}
```

or

```c
...

#include <ESPAsyncWebServer.h>
#include "svelteesp32.h"

AsyncWebServer server(80);

...

void setup()
{
    ...

    initSvelteStaticFiles(&server);

    server.begin();
}
```

or for ESP-IDF native:

```c
...

#include <esp_http_server.h>
#include "svelteesp32.h"

httpd_handle_t server = NULL;

...

void app_main()
{
    ...

    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    httpd_start(&server, &config);

    initSvelteStaticFiles(server);
}
```

You can find minimal buildable example projects in [demo/esp32](demo/esp32) (Arduino/PlatformIO) and [demo/esp32idf](demo/esp32idf) (ESP-IDF native) folders.

The content of **generated file** (do not edit, just use):

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

### Engines and ESP variants

Four web server engines are supported:

- **`-e psychic`** (default): PsychicHttpServer V1 - Fast ESP32-only server using ESP-IDF internally. Recommended for ESP32 projects.
- **`-e psychic2`**: PsychicHttpServer V2 - Updated version with improved API
- **`-e async`**: ESPAsyncWebServer (https://github.com/ESP32Async/ESPAsyncWebServer) - Popular async server supporting both ESP32 and ESP8266/ESP8285
- **`-e espidf`**: Native ESP-IDF web server - For projects using ESP-IDF framework directly (not Arduino)

If you **only work on ESP32**, we recommend using PsychicHttpServer (`-e psychic` or `-e psychic2`), which uses the native ESP-IDF web server internally for significantly faster and more stable operation.

**Note for PsychicHttpServer users:** The generated header includes a comment suggesting to configure `server.config.max_uri_handlers` to match or exceed your file count to ensure all routes are properly registered.

### Gzip

All modern browsers have been able to handle gzip-compressed content for years. For this reason, there is no question that the easily compressed JS and CSS files are stored compressed in the ESP32/ESP8266 and sent to the browser.

During the translation process, data in gzip format is generated and will be used if the **size is greater than 1024 bytes** and we experience a **reduction of at least 15%**. In such a case, the compressed data is unconditionally sent to the browser with the appropriate **Content-Encoding** header information.

Automatic compression can be turned off with the `--gzip=false` option.

> This setting has three states: yes, no, and compiler mode is available. In compiler mode, you can disable/enable Gzip by setting the `SVELTEESP32_ENABLE_GZIP` c++ compiler directive. For example, if using platformio, just write `-D SVELTEESP32_ENABLE_GZIP`.

### ETag

The ETag HTTP header can be used to significantly reduce network traffic. If the server sends ETag information, the client can check the integrity of the file by sending back this ETag (in `If-None-Match` header) without sending the data back again. All browsers use this function, the 304 HTTP response code is clearly visible in the network traffic.

Since microcontroller data traffic is moderately expensive, it is an individual decision whether to use the ETag or not. We **recommend using ETag**, which adds a bit more code (about 1-3%) but results in a much cleaner operation.

The use of ETag is **not enabled by default**, this can be achieved with the `--etag=true` switch.

All four engines (psychic, psychic2, async, espidf) fully support ETag validation with HTTP 304 Not Modified responses, reducing bandwidth usage when clients have valid cached content.

> This setting has three states: yes, no, and compiler mode is available. In compiler mode, you can disable/enable ETag by setting the `SVELTEESP32_ENABLE_ETAG` c++ compiler directive. For example, if using platformio, just type `-D SVELTEESP32_ENABLE_ETAG`.

### Cache-control

By default (when using the ETag), we send no-cache in the cache-control header of the HTTP response. Pages, subpages and other elements are downloaded every time. This is perfectly acceptable when serving small pages with ESP.

At the same time, it can be an advantage that the content is cached by the browser and not even the ETag check is performed. For this, you can specify how many seconds the max-age value sent instead of no-cache should be. In the case of `--cachetime=86400` (max-age=86400), the page (and other elements) will not be downloaded by the browser **for one day**.

### Main entry point - index.html

Typically, the entry point for web applications is the **index.htm or index.html** file. This does not need to be listed in the browser's address bar because web servers know that this file should be served by default. Svelteesp32 also does this: if there is an index.htm or index.html file, it sets it as the main file to be served. So using `http://esp_xxx.local` or just entering the `http://x.y.w.z/` IP address will serve this main file.

**Validation**: By default, svelteesp32 validates that an `index.html` or `index.htm` file exists in your source directory (in the root or any subdirectory). This ensures users won't get a 404 error when visiting your ESP32's root URL.

**Skipping Validation**: If you're building an API-only application (REST endpoints without a web UI) or using a different entry point (e.g., `main.html`), you can skip this validation with the `--no-index-check` flag:

```bash
# API-only application (no web UI)
npx svelteesp32 -e psychic -s ./dist -o ./output.h --no-index-check

# Custom entry point (users must visit /main.html explicitly)
npx svelteesp32 -e psychic -s ./dist -o ./output.h --no-index-check
```

### File Exclusion

The `--exclude` option allows you to exclude files from being embedded in the ESP32 firmware using glob patterns. This is useful for excluding source maps, documentation, and test files that shouldn't be part of the deployed application.

#### Basic Usage

```bash
# Exclude source maps
npx svelteesp32 -e psychic -s ./dist -o ./output.h --exclude="*.map"

# Exclude documentation files
npx svelteesp32 -e psychic -s ./dist -o ./output.h --exclude="*.md"

# Exclude multiple file types (comma-separated)
npx svelteesp32 -e psychic -s ./dist -o ./output.h --exclude="*.map,*.md,*.txt"

# Exclude using multiple flags
npx svelteesp32 -e psychic -s ./dist -o ./output.h --exclude="*.map" --exclude="*.md"

# Exclude entire directories
npx svelteesp32 -e psychic -s ./dist -o ./output.h --exclude="test/**/*"

# Combine multiple approaches
npx svelteesp32 -e psychic -s ./dist -o ./output.h --exclude="*.map,*.md" --exclude="docs/**/*"
```

#### Pattern Syntax

The exclude patterns use standard glob syntax:

- `*.map` - Match all files ending with `.map`
- `**/*.test.js` - Match all `.test.js` files in any directory
- `test/**/*` - Match all files in the `test` directory and subdirectories
- `.DS_Store` - Match specific filename

#### Default Exclusions

By default, the following system and development files are automatically excluded:

- `.DS_Store` (macOS system file)
- `Thumbs.db` (Windows thumbnail cache)
- `.git` (Git directory)
- `.svn` (SVN directory)
- `*.swp` (Vim swap files)
- `*~` (Backup files)
- `.gitignore` (Git ignore file)
- `.gitattributes` (Git attributes file)

Custom exclude patterns are added to these defaults.

#### Exclusion Output

When files are excluded, you'll see a summary in the build output:

```
Excluded 5 file(s):
  - assets/index.js.map
  - assets/vendor.js.map
  - README.md
  - docs/guide.md
  - test/unit.test.js
```

This helps you verify that the correct files are being excluded from your build.

### C++ defines

To make it easy to integrate into a larger c++ project, we have made a couple of variables available as c++ defines.

You can use the COUNT and SIZE constants:

```c
...
#include "svelteesp32.h"

#if SVELTEESP32_COUNT != 5
  #error Invalid file count
#endif
...
```

You can include a blocker error if a named file accidentally missing from the build:

```c
...
#include "svelteesp32.h"

#ifndef SVELTEESP32_FILE_INDEX_HTML
  #error Missing index file
#endif
...
```

...or if there are too many of a file type:

```c
...
#include "svelteesp32.h"

#if SVELTEESP32_CSS_FILES > 1
  #error Too many CSS files
#endif
...
```

You can use the following c++ directives at the project level if you want to configure the usage there: `SVELTEESP32_ENABLE_ETAG` and `SVELTEESP32_ENABLE_GZIP`. (Do not forget `--etag=compiler` or `--gzip=compiler` command line arg!)

### File Manifest

The generated header includes a file manifest struct and array that allows runtime introspection of all embedded static assets. This is useful for logging, runtime diagnostics, or building a JSON endpoint that lists all served files.

**Generated Structure:**

```c
// File manifest struct
struct SVELTEESP32_FileInfo {
  const char* path;       // URL path (e.g., "/index.html")
  uint32_t size;          // Original file size in bytes
  uint32_t gzipSize;      // Compressed size (0 if not gzipped)
  const char* etag;       // ETag pointer (nullptr if etag disabled)
  const char* contentType; // MIME type (e.g., "text/html")
};

// File manifest array
const SVELTEESP32_FileInfo SVELTEESP32_FILES[] = { ... };
const size_t SVELTEESP32_FILE_COUNT = sizeof(SVELTEESP32_FILES) / sizeof(SVELTEESP32_FILES[0]);
```

**Usage Example - List All Files:**

```c
#include "svelteesp32.h"

void listFiles() {
  Serial.printf("Embedded files (%d):\n", SVELTEESP32_FILE_COUNT);
  for (size_t i = 0; i < SVELTEESP32_FILE_COUNT; i++) {
    const auto& f = SVELTEESP32_FILES[i];
    Serial.printf("  %s (%d bytes", f.path, f.size);
    if (f.gzipSize > 0) {
      Serial.printf(", gzip: %d bytes", f.gzipSize);
    }
    Serial.printf(", type: %s)\n", f.contentType);
  }
}
```

**Usage Example - JSON Endpoint:**

```c
server->on("/api/files", HTTP_GET, [](PsychicRequest* request) {
  String json = "[";
  for (size_t i = 0; i < SVELTEESP32_FILE_COUNT; i++) {
    const auto& f = SVELTEESP32_FILES[i];
    if (i > 0) json += ",";
    json += "{\"path\":\"" + String(f.path) + "\",";
    json += "\"size\":" + String(f.size) + ",";
    json += "\"gzipSize\":" + String(f.gzipSize) + ",";
    json += "\"contentType\":\"" + String(f.contentType) + "\"}";
  }
  json += "]";
  PsychicResponse response(request);
  response.setContentType("application/json");
  response.setContent(json.c_str(), json.length());
  return response.send();
});
```

**Notes:**

- The manifest is always generated (no CLI flag needed)
- `gzipSize` is 0 when the file is not gzipped (either too small, poor compression ratio, or gzip disabled)
- `etag` is `NULL` when etag is disabled (`--etag=false`)
- The struct and array names use the `--define` prefix (default: `SVELTEESP32`)
- For ESP-IDF engine, C-compatible `typedef struct` syntax is used instead of C++ `struct`

### onFileServed Hook

The generated header includes a weak callback function that is invoked every time a file is served. This allows you to implement custom metrics, logging, or telemetry without modifying the generated code.

**Generated Function (weak linkage - zero overhead when not overridden):**

```c
// For psychic, psychic2, async engines (C++)
extern "C" void __attribute__((weak)) SVELTEESP32_onFileServed(const char* path, int statusCode) {}

// For espidf engine (C)
__attribute__((weak)) void SVELTEESP32_onFileServed(const char* path, int statusCode) {}
```

**Parameters:**

- `path`: The URL path being served (e.g., `"/index.html"`, `"/assets/app.js"`)
- `statusCode`: HTTP status code - `200` for content served, `304` for cache hit (Not Modified)

**Override Example - Serial Logging:**

```c
#include "svelteesp32.h"

// Override the weak function with your implementation
extern "C" void SVELTEESP32_onFileServed(const char* path, int statusCode) {
    Serial.printf("[HTTP] %s -> %d\n", path, statusCode);
}
```

**Override Example - Request Counter:**

```c
#include "svelteesp32.h"

static uint32_t totalRequests = 0;
static uint32_t cacheHits = 0;

extern "C" void SVELTEESP32_onFileServed(const char* path, int statusCode) {
    totalRequests++;
    if (statusCode == 304) {
        cacheHits++;
    }
}

void printStats() {
    float hitRate = totalRequests > 0 ? (100.0f * cacheHits / totalRequests) : 0;
    Serial.printf("Requests: %lu, Cache hits: %lu (%.1f%%)\n",
                  totalRequests, cacheHits, hitRate);
}
```

**Override Example - Per-File Metrics:**

```c
#include "svelteesp32.h"
#include <map>
#include <string>

std::map<std::string, uint32_t> fileHits;

extern "C" void SVELTEESP32_onFileServed(const char* path, int statusCode) {
    fileHits[path]++;
}

// Expose via JSON endpoint
server->on("/api/metrics", HTTP_GET, [](PsychicRequest* request) {
    String json = "{";
    bool first = true;
    for (const auto& [path, count] : fileHits) {
        if (!first) json += ",";
        json += "\"" + String(path.c_str()) + "\":" + String(count);
        first = false;
    }
    json += "}";
    PsychicResponse response(request);
    response.setContentType("application/json");
    response.setContent(json.c_str(), json.length());
    return response.send();
});
```

**Notes:**

- The hook is always generated (no CLI flag needed)
- Uses weak linkage - if you don't override it, the empty default has zero runtime overhead
- The function name uses your `--define` prefix (default: `SVELTEESP32_onFileServed`)
- With `--define=MYAPP`, the function becomes `MYAPP_onFileServed`
- Called before every response is sent (both 200 and 304 when ETag is enabled)

### Command line options

| Option             | Description                                                                          | default                 |
| ------------------ | ------------------------------------------------------------------------------------ | ----------------------- |
| `-s`               | **Source dist folder contains compiled web files**                                   | (required)              |
| `-e`               | The engine for which the include file is created (psychic/psychic2/async/espidf)     | psychic                 |
| `-o`               | Generated output file with path                                                      | `svelteesp32.h`         |
| `--exclude`        | Exclude files matching glob pattern (repeatable or comma-separated)                  | Default system files    |
| `--etag`           | Use ETag header for cache (true/false/compiler)                                      | false                   |
| `--cachetime`      | Override no-cache response with a max-age=\<cachetime\> response (seconds)           | 0                       |
| `--gzip`           | Compress content with gzip (true/false/compiler)                                     | true                    |
| `--created`        | Include creation time in generated header                                            | false                   |
| `--version`        | Include a version string in generated header, e.g. `--version=v$npm_package_version` | ''                      |
| `--espmethod`      | Name of generated initialization method                                              | `initSvelteStaticFiles` |
| `--define`         | Prefix of c++ defines (e.g., SVELTEESP32_COUNT)                                      | `SVELTEESP32`           |
| `--config`         | Use custom RC file path                                                              | `.svelteesp32rc.json`   |
| `--no-index-check` | Skip validation for index.html/index.htm (for API-only or custom entry points)       | false                   |
| `-h`               | Show help                                                                            |                         |

### Configuration File

You can store frequently-used options in a configuration file to avoid repeating command line arguments. This is especially useful for CI/CD pipelines and team collaboration.

#### Quick Start

Create `.svelteesp32rc.json` in your project directory:

```json
{
  "engine": "psychic",
  "sourcepath": "./dist",
  "outputfile": "./esp32/include/svelteesp32.h",
  "etag": "true",
  "gzip": "true",
  "cachetime": 86400,
  "exclude": ["*.map", "*.md"]
}
```

Then simply run:

```bash
npx svelteesp32
```

No command line arguments needed!

#### Search Locations

The tool automatically searches for `.svelteesp32rc.json` in:

1. Current working directory
2. User home directory

Or specify a custom location:

```bash
npx svelteesp32 --config=.svelteesp32rc.prod.json
```

#### Configuration Reference

All CLI options can be specified in the RC file using long-form property names:

| RC Property    | CLI Flag           | Type    | Example                                          |
| -------------- | ------------------ | ------- | ------------------------------------------------ |
| `engine`       | `-e`               | string  | `"psychic"`, `"psychic2"`, `"async"`, `"espidf"` |
| `sourcepath`   | `-s`               | string  | `"./dist"`                                       |
| `outputfile`   | `-o`               | string  | `"./output.h"`                                   |
| `etag`         | `--etag`           | string  | `"true"`, `"false"`, `"compiler"`                |
| `gzip`         | `--gzip`           | string  | `"true"`, `"false"`, `"compiler"`                |
| `cachetime`    | `--cachetime`      | number  | `86400`                                          |
| `created`      | `--created`        | boolean | `true`, `false`                                  |
| `version`      | `--version`        | string  | `"v1.0.0"`                                       |
| `espmethod`    | `--espmethod`      | string  | `"initSvelteStaticFiles"`                        |
| `define`       | `--define`         | string  | `"SVELTEESP32"`                                  |
| `exclude`      | `--exclude`        | array   | `["*.map", "*.md"]`                              |
| `noIndexCheck` | `--no-index-check` | boolean | `true`, `false`                                  |

#### CLI Override

Command line arguments always take precedence over RC file values:

```bash
# Use RC settings but override etag
npx svelteesp32 --etag=false

# Use RC settings but add different exclude pattern
npx svelteesp32 --exclude="*.txt"
```

#### Multiple Environments

Create different config files for different environments:

```bash
# Development build
npx svelteesp32 --config=.svelteesp32rc.dev.json

# Production build
npx svelteesp32 --config=.svelteesp32rc.prod.json
```

#### Exclude Pattern Behavior

**Replace mode**: When you specify `exclude` patterns in RC file or CLI, they completely replace the defaults.

- **No exclude specified**: Uses default system exclusions (`.DS_Store`, `Thumbs.db`, `.git`, etc.)
- **RC file has exclude**: Replaces defaults with RC patterns
- **CLI has --exclude**: Replaces RC patterns (or defaults if no RC)

Example:

```json
// .svelteesp32rc.json
{ "exclude": ["*.map"] }
```

Result: Only `*.map` is excluded (default patterns are replaced)

To keep defaults, explicitly list them in your RC file:

```json
{
  "exclude": [".DS_Store", "Thumbs.db", ".git", "*.map", "*.md"]
}
```

#### NPM Package Variable Interpolation

RC files support automatic variable interpolation from your `package.json`. This allows you to reference package.json fields in your RC configuration using npm-style variable syntax.

**Syntax:** `$npm_package_<field_name>`

**Supported in:** All string fields (`version`, `define`, `sourcepath`, `outputfile`, `espmethod`, `exclude` patterns)

**Example:**

```json
// .svelteesp32rc.json
{
  "engine": "psychic",
  "version": "v$npm_package_version",
  "define": "$npm_package_name",
  "sourcepath": "./dist",
  "outputfile": "./output.h"
}
```

With `package.json` containing:

```json
{
  "name": "my-esp32-app",
  "version": "2.1.0"
}
```

The variables are automatically interpolated to:

```json
{
  "version": "v2.1.0",
  "define": "my_esp32_app"
}
```

**Nested Fields:**

You can access nested package.json fields using underscores:

```json
// package.json
{
  "name": "myapp",
  "repository": {
    "type": "git",
    "url": "https://github.com/user/repo.git"
  }
}

// .svelteesp32rc.json
{
  "version": "$npm_package_repository_type"
}
// Results in: "version": "git"
```

**Multiple Variables:**

Combine multiple variables in a single field:

```json
{
  "version": "$npm_package_name-v$npm_package_version-release"
}
// Results in: "my-esp32-app-v2.1.0-release"
```

**Requirements:**

- `package.json` must exist in the same directory as the RC file
- If variables are used but `package.json` is not found, an error is thrown with details about which fields contain variables
- Unknown variables are left unchanged (e.g., `$npm_package_nonexistent` stays as-is)

**Use Cases:**

- **Version Synchronization:** Keep header version in sync with npm package version
- **Dynamic Naming:** Use package name for C++ defines automatically
- **CI/CD Integration:** Reusable RC files across projects with different package names

### Q&A

- **How big a frontend application can be placed?** If you compress the content with gzip, even a 3-4Mb assets directory can be placed. This is a serious enough amount to serve a complete application.

- **How fast is cpp file compilation?** The cpp (.h) file can be large, but it can be compiled in a few seconds on any machine. If you don't modify your svelte/react app, it will use the already compiled cpp file (not recompile). This does not increase the speed of ESP32/ESP8266 development.

- **Does the solution use PROGMEM?** It depends on the engine. For PsychicHttpServer (`psychic`, `psychic2`) and ESP-IDF (`espidf`) engines, const arrays are used which are automatically placed in program memory on ESP32. For ESPAsyncWebServer (`async`), PROGMEM directive is explicitly used to support ESP8266/ESP8285. In both cases, the file data is stored in flash memory, not RAM, so your heap and stack remain available for your application.

- **Why is the .h file so big?** The source files are always larger than the binary compiled from them. The .h file contains byte arrays in text format (comma-separated decimal numbers), which takes more space than the binary data itself. The actual memory allocation is shown in the header file defines (SVELTEESP32_SIZE for uncompressed, SVELTEESP32_SIZE_GZIP for compressed).

- **Is collaboration between groups supported?** Yes, the Frontend team produces the application, the use of svelteesp32 is part of the build process. Then, provided with a version number, the .h file is placed in git, which the ESP team translates into the platformio application.

- **Will you develop it further?** Since I use it myself, I will do my best to make the solution better and better.

- **Is this safe to use in production?** I suggest you give it a try! If you find it useful and safe in several different situations, feel free to use it, just like any other free library.
