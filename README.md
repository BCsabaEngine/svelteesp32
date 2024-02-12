# [svelteesp32] Convert Svelte (or any frontend) JS application to serve it from ESP32 webserver (PsychicHttp)

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
void initSvelteStaticFiles(PsychicHttpServer * server) {
    server->on("assets/index-KwubEIf-.js", HTTP_GET, [](PsychicRequest * request)
    {
        const uint8_t data[] = {0x1f, 0x8b, 0x8, 0x0, 0x0, ...}

        PsychicStreamResponse response(request, "application/javascript");
        response.addHeader("Content-Encoding", "gzip");
        response.beginSend();
        for (int i = 0; i < sizeof(data); i++) response.write(data[i]);
        return response.endSend();
    });

    server->on("assets/index-Soe6cpLA.css", HTTP_GET, [](PsychicRequest * request)
    {
        const uint8_t data[] = {0x1f, 0x8b, 0x8, 0x0, 0x0, ...}

        PsychicStreamResponse response(request, "text/css");
        response.addHeader("Content-Encoding", "gzip");
        response.beginSend();
        for (int i = 0; i < sizeof(data); i++) response.write(data[i]);
        return response.endSend();
    });

    ...
}
```
