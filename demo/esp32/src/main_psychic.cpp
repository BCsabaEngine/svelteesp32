/* PsychicHttp example with LED API */

#include "credentials.h"
#include <WiFi.h>
#include <PsychicHttp.h>
#include "svelteesp32psychic.h"

#ifndef SVELTEESP32_FILE_INDEX_HTML
#error Missing index file
#endif

#define LED_PIN 2

bool ledState = false;
PsychicHttpServer server(80);

String getStatusJson() {
  return "{\"uptime\":" + String(millis() / 1000) + ",\"led\":" + (ledState ? "true" : "false") + "}";
}

void setup() {
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, pass);
  if (WiFi.waitForConnectResult() != WL_CONNECTED)
    while (true)
      ;

  server.config.max_uri_handlers = 20;
  server.begin();
  initSvelteStaticFiles(&server);

  server.on("/api/status", HTTP_GET, [](PsychicRequest *request, PsychicResponse *response) {
    String json = getStatusJson();
    response->setContentType("application/json");
    response->setContent((const uint8_t*)json.c_str(), json.length());
    return response->send();
  });

  server.on("/api/toggle", HTTP_POST, [](PsychicRequest *request, PsychicResponse *response) {
    ledState = !ledState;
    digitalWrite(LED_PIN, ledState ? HIGH : LOW);
    String json = getStatusJson();
    response->setContentType("application/json");
    response->setContent((const uint8_t*)json.c_str(), json.length());
    return response->send();
  });
}

void loop() {}
