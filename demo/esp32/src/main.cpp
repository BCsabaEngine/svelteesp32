#ifdef ASYNC
/* ESPAsyncWebServer example */

#include <ESPAsyncWebServer.h>
#include "svelteesp32async.h"

#if SVELTEESP32_COUNT != 5
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
  initSvelteStaticFiles(&server);
  server.begin();
}
void loop() {}

#elif PSYCHIC
/* PsychicHttp example */

#include <PsychicHttp.h>
#include "svelteesp32psychic.h"

#if SVELTEESP32_COUNT != 5
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
  server.listen(80);
  initSvelteStaticFiles(&server);
}
void loop() {}

#else
#error Unknown platform
#endif