#ifdef ASYNC
/* ESPAsyncWebServer example */

#include <ESPAsyncWebServer.h>
#ifdef COMPILER
#include "svelteesp32async_compiler.h"
#else
#include "svelteesp32async.h"
#endif

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
#ifdef COMPILER
#include "svelteesp32psychic_compiler.h"
#else
#include "svelteesp32psychic.h"
#endif

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