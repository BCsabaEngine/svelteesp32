# `svelteesp32` ![image](https://badges.github.io/stability-badges/dist/stable.svg)

[Changelog](CHANGELOG.md)

# Convert Svelte (or React/Angular/Vue) JS application to serve it from ESP32/ESP8266 webserver

### Forget SPIFFS and LittleFS now

I often make small to medium-sized microcontroller solutions that run on ESP32 or ESP8266. If a web interface is needed, I create a Svelte application. The Svelte application is practically served by the ESP32/ESP8266.

In order to be able to easily update OTA, it is important - from the users' point of view - that the update file **consists of one file**. I can't use the SPIFFS/LittleFS solution for this. It is necessary that the WebUI files are included inline in the Arduino or PlatformIO c++ code.

This npm package provides a solution for **inserting any JS client application into the ESP web server** (PsychicHttp and also ESPAsyncWebServer (https://github.com/ESP32Async/ESPAsyncWebServer) and ESP-IDF available, PsychicHttp is the default). For this, JS, html, css, font, assets, etc. files must be converted to binary byte array. Npm mode is easy to use and easy to **integrate into your CI/CD pipeline**.

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

**Install package** as devDependency (it is practical if the package is part of the project so that you always receive updates)

```bash
npm install -D svelteesp32
```

After a successful Svelte build (rollup/webpack/vite) **create an includeable c++ header** file

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
//cmdline:  -e psychic -s ./dist -o ./output.h --etag=true --gzip=true
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
...

void initSvelteStaticFiles(PsychicHttpServer * server) {
  server->on("/assets/index-KwubEIf-.js", HTTP_GET, [](PsychicRequest * request) {
    if (request->hasHeader("If-None-Match") &&
        request->header("If-None-Match").equals(etag_assets_index_KwubEIf__js)) {
      PsychicResponse response304(request);
      response304.setCode(304);
      return response304.send();
    }

    PsychicResponse response(request);
    response.setContentType("text/javascript");
    response.addHeader("Content-Encoding", "gzip");
    response.addHeader("Cache-Control", "no-cache");
    response.addHeader("ETag", etag_assets_index_KwubEIf__js);
    response.setContent(datagzip_assets_index_KwubEIf__js, 12547);
    return response.send();
  });

  server->on("/assets/index-Soe6cpLA.css", HTTP_GET, [](PsychicRequest * request) {
    if (request->hasHeader("If-None-Match") &&
        request->header("If-None-Match").equals(etag_assets_index_Soe6cpLA_css)) {
      PsychicResponse response304(request);
      response304.setCode(304);
      return response304.send();
    }

    PsychicResponse response(request);
    response.setContentType("text/css");
    response.addHeader("Content-Encoding", "gzip");
    response.addHeader("Cache-Control", "no-cache");
    response.addHeader("ETag", etag_assets_index_Soe6cpLA_css);
    response.setContent(datagzip_assets_index_Soe6cpLA_css, 5368);
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

### Command line options

| Option        | Description                                                                          | default                 |
| ------------- | ------------------------------------------------------------------------------------ | ----------------------- |
| `-s`          | **Source dist folder contains compiled web files**                                   | (required)              |
| `-e`          | The engine for which the include file is created (psychic/psychic2/async/espidf)     | psychic                 |
| `-o`          | Generated output file with path                                                      | `svelteesp32.h`         |
| `--exclude`   | Exclude files matching glob pattern (repeatable or comma-separated)                  | Default system files    |
| `--etag`      | Use ETag header for cache (true/false/compiler)                                      | false                   |
| `--cachetime` | Override no-cache response with a max-age=\<cachetime\> response (seconds)           | 0                       |
| `--gzip`      | Compress content with gzip (true/false/compiler)                                     | true                    |
| `--created`   | Include creation time in generated header                                            | false                   |
| `--version`   | Include a version string in generated header, e.g. `--version=v$npm_package_version` | ''                      |
| `--espmethod` | Name of generated initialization method                                              | `initSvelteStaticFiles` |
| `--define`    | Prefix of c++ defines (e.g., SVELTEESP32_COUNT)                                      | `SVELTEESP32`           |
| `-h`          | Show help                                                                            |                         |

### Q&A

- **How big a frontend application can be placed?** If you compress the content with gzip, even a 3-4Mb assets directory can be placed. This is a serious enough amount to serve a complete application.

- **How fast is cpp file compilation?** The cpp (.h) file can be large, but it can be compiled in a few seconds on any machine. If you don't modify your svelte/react app, it will use the already compiled cpp file (not recompile). This does not increase the speed of ESP32/ESP8266 development.

- **Does the solution use PROGMEM?** It depends on the engine. For PsychicHttpServer (`psychic`, `psychic2`) and ESP-IDF (`espidf`) engines, const arrays are used which are automatically placed in program memory on ESP32. For ESPAsyncWebServer (`async`), PROGMEM directive is explicitly used to support ESP8266/ESP8285. In both cases, the file data is stored in flash memory, not RAM, so your heap and stack remain available for your application.

- **Why is the .h file so big?** The source files are always larger than the binary compiled from them. The .h file contains byte arrays in text format (comma-separated decimal numbers), which takes more space than the binary data itself. The actual memory allocation is shown in the header file defines (SVELTEESP32_SIZE for uncompressed, SVELTEESP32_SIZE_GZIP for compressed).

- **Is collaboration between groups supported?** Yes, the Frontend team produces the application, the use of svelteesp32 is part of the build process. Then, provided with a version number, the .h file is placed in git, which the ESP team translates into the platformio application.

- **Will you develop it further?** Since I use it myself, I will do my best to make the solution better and better.

- **Is this safe to use in production?** I suggest you give it a try! If you find it useful and safe in several different situations, feel free to use it, just like any other free library.
