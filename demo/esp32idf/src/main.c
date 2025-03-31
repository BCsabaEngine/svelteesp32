#include <esp_http_server.h>
#include "svelteesp32espidf.h"

void start_http_server(void)
{
  httpd_handle_t httpd;
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.max_uri_handlers = SVELTEESP32_COUNT + 99;

  printf("Starting server on port: '%d'\n", config.server_port);

  ESP_ERROR_CHECK(httpd_start(&httpd, &config));
  initSvelteStaticFiles(httpd);
}

void app_main(void)
{
  printf("Hello from ESP-IDF!\n");
  start_http_server();
  while (1)
  {
    vTaskDelay(1000 / portTICK_PERIOD_MS);
  }
}