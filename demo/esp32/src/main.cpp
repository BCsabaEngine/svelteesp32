#ifdef ASYNC
/* ESPAsyncWebServer example */

#include <ESPAsyncWebServer.h>
#include "svelteesp32async.h"

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