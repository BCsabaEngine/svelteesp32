#ifdef ASYNC
/* ESPAsyncWebServer example */

#include "credentials.h"
#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include "svelteesp32async.h"

#if SVELTEESP32_COUNT != 11
#error Invalid file count
#endif

#ifndef SVELTEESP32_FILE_INDEX_HTML
#error Missing index file
#endif

#if SVELTEESP32_CSS_FILES > 1
#error Too many CSS files
#endif

AsyncWebServer server(80);
void setup()
{
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, pass);
  if (WiFi.waitForConnectResult() != WL_CONNECTED)
    while (true)
      ;

  initSvelteStaticFiles(&server);
  server.begin();
}
void loop() {}

#elif PSYCHIC
/* PsychicHttp example */

#include "credentials.h"
#include <WiFi.h>
#include <PsychicHttp.h>
#include "svelteesp32psychic.h"

#if SVELTEESP32_COUNT != 11
#error Invalid file count
#endif

#ifndef SVELTEESP32_FILE_INDEX_HTML
#error Missing index file
#endif

#if SVELTEESP32_CSS_FILES > 1
#error Too many CSS files
#endif

PsychicHttpServer server;
void setup()
{
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, pass);
  if (WiFi.waitForConnectResult() != WL_CONNECTED)
    while (true)
      ;

  server.listen(80);
  initSvelteStaticFiles(&server);
}
void loop() {}

#else
#error Unknown platform
#endif