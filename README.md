# `svelteesp32` ![image](https://badges.github.io/stability-badges/dist/stable.svg)

# Convert Svelte (or React/Angular/Vue) JS application to serve it from ESP32 webserver

### Forget SPIFFS and LittleFS now

I often make small to medium-sized microcontroller solutions that run on ESP32. If a web interface is needed, I create a Svelte application. The Svelte application is practically served by the ESP32.

In order to be able to easily update OTA, it is important - from the users' point of view - that the update file **consists of one file**. I can't use the SPIFFS/LittleFS solution for this. It is necessary that the WebUI files are included inline in the Arduino or PlatformIO c++ code.

This npm package provides a solution for **inserting any JS client application into the ESP32 web server** (PsychicHttp is my favorite, faster than ESPAsyncWebServer). For this, JS, html, css, font, assets, etc. files must be converted to binary byte array. Npm mode is easy to use and easy to **integrate into your CI/CD pipeline**.

### Usage

**Install package** as devDependency (it is practical if the package is part of the project so that you always receive updates)

```bash
npm install -D svelteesp32
```

After a successful Svelte build (rollup/webpack/vite) **create an includeable c++ header** file

```bash
npx svelteesp32 -s ../svelteapp/dist -o ../esp32project/svelteesp32.h
```

During the **translation process**, the processed file details are visible, and at the end, the result shows the ESP32's memory allocation (gzip size)

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

The content of **generated file** (do not edit, just use)

```c
const uint8_t data0[12547] = {0x1f, 0x8b, 0x8, 0x0, ...
const uint8_t data1[5368] = {0x1f, 0x8b, 0x8, 0x0, 0x0, ...

void initSvelteStaticFiles(PsychicHttpServer * server) {
  server->on("/assets/index-KwubEIf-.js", HTTP_GET, [](PsychicRequest * request)
  {
    PsychicResponse response(request);
    response.setContentType("application/javascript");
    response.addHeader("Content-Encoding", "gzip");
    response.setContent(data0, sizeof(data0));
    return response.send();
  });

  server->on("/assets/index-Soe6cpLA.css", HTTP_GET, [](PsychicRequest * request)
  {
    PsychicResponse response(request);
    response.setContentType("text/css");
    response.addHeader("Content-Encoding", "gzip");
    response.setContent(data1, sizeof(data1));
    return response.send();
  });

    ...
}
```

### Gzip

All modern browsers have been able to handle gzip-compressed content for years. For this reason, there is no question that the easily compressed JS and CSS files are stored compressed in the ESP32 and sent to the browser.

During the translation process, data in gzip format is generated and will be used if the **size is greater than 100 bytes** and we experience a **reduction of at least 15%**. In such a case, the compressed data is unconditionally sent to the browser with the appropriate **Content-Encoding** header information.

Automatic compression can be turned off with the `--no-gzip` option.

### Main entry point - index.html

Typically, the entry point for web applications is the **index.htm or index.html** file. This does not need to be listed in the browser's address bar because web servers know that this file should be served by default. Svelteesp32 also does this: if there is an index.htm or index.html file, it sets it as the main file to be served. So using `http://esp32_xxx.local` or just entering the `http://x.y.w.z/` IP address will serve this main file.

### Command line options

| Option        | Required | Description                                    | default                 |
| ------------- | :------: | ---------------------------------------------- | ----------------------- |
| `-s`          |    x     | Source dist folder contains compiled web files |                         |
| `-o`          |    x     | Generated output file with path                | `svelteesp32.h`         |
| `--no-gzip`   |          | Do not compress content with gzip              |                         |
| `--espmethod` |    x     | Name of generated method                       | `initSvelteStaticFiles` |
| `-h`          |          | Show help                                      |                         |

### Q&A

- **How big a frontend application can be placed?** If you compress the content with gzip, even a 3-4Mb assets directory can be placed. This is a serious enough amount to serve a complete application.

- **How fast is cpp file compilation?** The cpp file can be large, but it can be compiled in a few seconds on any machine. If you don't modify your svelte/react app, it will use the already compiled cpp file (not recompile). This does not increase the speed of ESP32 development.

- **Does the solution use PROGMEM?** No and yes. ESP32 no longer has PROGMEM. (Exists, but does not affect the translation). Instead, if we use a const array in the global namespace, its content will be placed in the code area, i.e. it will not be used from the heap or the stack, so the content of the files to be served will be placed next to the code.

- **Is this safe to use in production?** I suggest you give it a try! If you find it useful and safe in several different situations, feel free to use it, just like any other free library.

- **Will you develop it further?** Since I use it myself, I will do my best to make the solution better and better.
