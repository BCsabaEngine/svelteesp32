/* ESPAsyncWebServer example with LED API */

#include "credentials.h"
#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include "svelteesp32async.h"

#ifndef SVELTEESP32_FILE_INDEX_HTML
#error Missing index file
#endif

#define LED_PIN 2

bool ledState = false;
AsyncWebServer server(80);

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

  initSvelteStaticFiles(&server);

  server.on("/api/status", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send(200, "application/json", getStatusJson());
  });

  server.on("/api/toggle", HTTP_POST, [](AsyncWebServerRequest *request) {
    ledState = !ledState;
    digitalWrite(LED_PIN, ledState ? HIGH : LOW);
    request->send(200, "application/json", getStatusJson());
  });

  server.begin();
}

void loop() {}
