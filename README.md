# `svelteesp32` ![image](https://badges.github.io/stability-badges/dist/stable.svg)

# Convert Svelte (or React/Angular/Vue) JS application to serve it from ESP32 webserver

### Forget SPIFFS and LittleFS now

I often make small to medium-sized microcontroller solutions that run on ESP32. If a web interface is needed, I will create a Svelte application. The Svelte application is practically served by the ESP32.

In order to be able to easily update OTA, it is important - from the users' point of view - that the update file **consists of one file**. I can't use the SPIFFS/LittleFS solution for this. It is necessary that the Svelte files are included inline in the Arduino/PlatformIO code.

This npm package provides a solution for **inserting any JS client application into the ESP32 web server** (PsychicHttp is my favorite, faster than ESPAsyncWebServer). For this, JS, html, css, font, etc. files must be converted to binary. npm is easy to use and easy to **integrate into your CI/CD pipeline**.

### Usage

Install package as devDependency (it is practical if the package is part of the project so that you always receive updates)

```bash
npm install -D svelteesp32
```

After a successful Svelte build create az includeable cpp file

```bash
npx svelteesp32 -s ../svelteapp/dist -o ../esp32project/svelteesp32.h

// compress files and serve as gzip
npx svelteesp32 -s ../svelteapp/dist -o ../esp32project/svelteesp32.h -g
```

Include svelteesp32.h into yout Arduino cpp project (copy it next to the ino file)

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

The content of generated file (do not edit, just use)

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

### Q&A

- **How big a frontend application can be placed?** If you compress the content with gzip, even a 3-4Mb assets directory can be placed. This is a serious enough amount to serve a complete application.

- **How fast is cpp file compilation?** The cpp file can be large, but it can be compiled in a few seconds on any machine. If you don't modify your svelte/react app, it will use the already compiled cpp file (not recompile). This does not increase the speed of ESP32 development.

- **Does the solution use PROGMEM?** No and yes. ESP32 no longer has PROGMEM. (Exists, but does not affect the translation). Instead, if we use a const array in the global namespace, its content will be placed in the code area, i.e. it will not be used from the heap or the stack, so the content of the files to be served will be placed next to the code.

- **Is this safe to use in production?** I suggest you give it a try! If you find it useful and safe in several different situations, feel free to use it, just like any other free library.

- **Will you develop it further?** Since I use it myself, I will do my best to make the solution better and better.
