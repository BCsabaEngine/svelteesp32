# `svelteesp32` ![image](https://badges.github.io/stability-badges/dist/stable.svg)

# Convert Svelte (or React/Angular/Vue) JS application to serve it from ESP32/ESP8266 webserver

### Forget SPIFFS and LittleFS now

I often make small to medium-sized microcontroller solutions that run on ESP32 or ESP8266. If a web interface is needed, I create a Svelte application. The Svelte application is practically served by the ESP32/ESP8266.

In order to be able to easily update OTA, it is important - from the users' point of view - that the update file **consists of one file**. I can't use the SPIFFS/LittleFS solution for this. It is necessary that the WebUI files are included inline in the Arduino or PlatformIO c++ code.

This npm package provides a solution for **inserting any JS client application into the ESP web server** (PsychicHttp and also ESPAsyncWebServer available, PsychicHttp is the default). For this, JS, html, css, font, assets, etc. files must be converted to binary byte array. Npm mode is easy to use and easy to **integrate into your CI/CD pipeline**.

> Starting with version v1.1.0, the ETag header is also supported.

> Starting with version v1.2.0, ESP8266/ESP8285 is also supported.

> Starting with version v1.3.0, c++ defines can be used.

### Usage

**Install package** as devDependency (it is practical if the package is part of the project so that you always receive updates)

```bash
npm install -D svelteesp32
```

After a successful Svelte build (rollup/webpack/vite) **create an includeable c++ header** file

```bash
// for PsychicHttpServer
npx svelteesp32 -e psychic -s ../svelteapp/dist -o ../esp32project/svelteesp32.h --etag

// for ESPAsyncWebServer
npx svelteesp32 -e async -s ../svelteapp/dist -o ../esp32project/svelteesp32.h --etag
```

During the **translation process**, the processed file details are visible, and at the end, the result shows the ESP's memory allocation (gzip size)

```
[assets/index-KwubEIf-.js]
✓ gzip used (38850 -> 12547)

[assets/index-Soe6cpLA.css]
✓ gzip used (32494 -> 5368)

[favicon.png]
x gzip unused (33249 -> 33282)

[index.html]
✓ gzip used (472 -> 308)

[roboto_regular.json]
✓ gzip used (363757 -> 93567)

5 files, 458kB original size, 142kB gzip size
../../../Arduino/EspSvelte/svelteesp32.h 842kB size
```

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

You can find a minimal buildable example platformio project in [demo/esp32](demo/esp32) folder.

The content of **generated file** (do not edit, just use)

```c
#define SVELTEESP32_COUNT 5
#define SVELTEESP32_SIZE 145633
#define SVELTEESP32_FILE_index_html
...

const uint8_t data0[12547] = {0x1f, 0x8b, 0x8, 0x0, ...
const uint8_t data1[5368] = {0x1f, 0x8b, 0x8, 0x0, 0x0, ...
const char * etag0 = "387b88e345cc56ef9091...";

void initSvelteStaticFiles(PsychicHttpServer * server) {
  server->on("/assets/index-KwubEIf-.js", HTTP_GET, [](PsychicRequest * request)
  {
    if (request->hasHeader("If-None-Match") && ...) {
      PsychicResponse response304(request);
      response304.setCode(304);
      return response304.send();
    }

    PsychicResponse response(request);
    response.setContentType("application/javascript");
    response.addHeader("Content-Encoding", "gzip");
    response.setContent(data0, sizeof(data0));
    return response.send();
  });

  server->on("/assets/index-Soe6cpLA.css", HTTP_GET, [](PsychicRequest * request)
  {
    if (request->hasHeader("If-None-Match") && ...) {
      ...
    }

    PsychicResponse response(request);
    response.setContentType("text/css");
    response.addHeader("Content-Encoding", "gzip");
    response.setContent(data1, sizeof(data1));
    return response.send();
  });

    ...
}
```

### Engines and ESP variants

ESPAsyncWebServer is a popular web server that can be used on **both ESP32 and ESP8266 microcontrollers**. When you want to generate a file for this, use the `-e async` switch.

If you **only work on ESP32**, I recommend using PsychicHttpServer, which uses the native mode ESP-IDF web server inside. This way, its operation is significantly faster and more continuous. You can access this mode with the `-e psychic` switch.

### Gzip

All modern browsers have been able to handle gzip-compressed content for years. For this reason, there is no question that the easily compressed JS and CSS files are stored compressed in the ESP32/ESP8266 and sent to the browser.

During the translation process, data in gzip format is generated and will be used if the **size is greater than 100 bytes** and we experience a **reduction of at least 15%**. In such a case, the compressed data is unconditionally sent to the browser with the appropriate **Content-Encoding** header information.

Automatic compression can be turned off with the `--no-gzip` option.

### ETag

The ETag HTTP header can be used to significantly reduce network traffic. If the server sends ETag information, the client can check the integrity of the file by sending back this ETag (in `If-None-Match` header) without sending the data back again. All browsers use this function, the 304 HTTP response code is clearly visible in the network traffic.

Since microcontroller data traffic is moderately expensive, it is an individual decision whether to use the ETag or not. We **recommend using ETag**, which adds a bit more code (about 1-3%) but results in a much cleaner operation.

The use of ETag is **not enabled by default**, this can be achieved with the `--etag` switch.

### Main entry point - index.html

Typically, the entry point for web applications is the **index.htm or index.html** file. This does not need to be listed in the browser's address bar because web servers know that this file should be served by default. Svelteesp32 also does this: if there is an index.htm or index.html file, it sets it as the main file to be served. So using `http://esp_xxx.local` or just entering the `http://x.y.w.z/` IP address will serve this main file.

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

You can include a warning if a named file accidentally missing from the build:

```c
...
#include "svelteesp32.h"

#ifndef SVELTEESP32_FILE_index_html
  #error Missing index file
#endif
...
```

### Command line options

| Option        | Required | Description                                                      | default                 |
| ------------- | :------: | ---------------------------------------------------------------- | ----------------------- |
| `-e`          |    x     | The engine for which the include file is created (psychic/async) | psychic                 |
| `-s`          |    x     | Source dist folder contains compiled web files                   |                         |
| `-o`          |    x     | Generated output file with path                                  | `svelteesp32.h`         |
| `--etag`      |          | Use ETag header for cache                                        | false                   |
| `--no-gzip`   |          | Do not compress content with gzip                                | false -> gzip used      |
| `--espmethod` |    x     | Name of generated method                                         | `initSvelteStaticFiles` |
| `--define`    |    x     | Prefix of c++ defines                                            | `SVELTEESP32`           |
| `-h`          |          | Show help                                                        |                         |

### Q&A

- **How big a frontend application can be placed?** If you compress the content with gzip, even a 3-4Mb assets directory can be placed. This is a serious enough amount to serve a complete application.

- **How fast is cpp file compilation?** The cpp file can be large, but it can be compiled in a few seconds on any machine. If you don't modify your svelte/react app, it will use the already compiled cpp file (not recompile). This does not increase the speed of ESP32/ESP8266 development.

- **Does the solution use PROGMEM?** No and yes. ESP32 no longer has PROGMEM. (Exists, but does not affect the translation). Instead, if we use a const array in the global namespace, its content will be placed in the code area, i.e. it will not be used from the heap or the stack, so the content of the files to be served will be placed next to the code. When working on ESP8266, PROGMEM will actually be used.

- **Is this safe to use in production?** I suggest you give it a try! If you find it useful and safe in several different situations, feel free to use it, just like any other free library.

- **Will you develop it further?** Since I use it myself, I will do my best to make the solution better and better.
