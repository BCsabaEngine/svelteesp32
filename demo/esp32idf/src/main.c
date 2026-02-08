/* ESP-IDF example with LED API */

#include <stdio.h>
#include <string.h>
#include <stdbool.h>

#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "nvs_flash.h"
#include "driver/gpio.h"
#include <esp_http_server.h>

#include "credentials.h"
#include "svelteesp32espidf.h"

#define LED_PIN GPIO_NUM_2

static const char *TAG = "main";
static bool led_state = false;

static void build_status_json(char *buf, size_t len)
{
  int64_t uptime = esp_timer_get_time() / 1000000;
  snprintf(buf, len, "{\"uptime\":%lld,\"led\":%s}", uptime, led_state ? "true" : "false");
}

static esp_err_t api_status_handler(httpd_req_t *req)
{
  char json[64];
  build_status_json(json, sizeof(json));
  httpd_resp_set_type(req, "application/json");
  httpd_resp_send(req, json, HTTPD_RESP_USE_STRLEN);
  return ESP_OK;
}

static esp_err_t api_toggle_handler(httpd_req_t *req)
{
  led_state = !led_state;
  gpio_set_level(LED_PIN, led_state ? 1 : 0);

  char json[64];
  build_status_json(json, sizeof(json));
  httpd_resp_set_type(req, "application/json");
  httpd_resp_send(req, json, HTTPD_RESP_USE_STRLEN);
  return ESP_OK;
}

static const httpd_uri_t uri_api_status = {
  .uri = "/api/status",
  .method = HTTP_GET,
  .handler = api_status_handler,
};

static const httpd_uri_t uri_api_toggle = {
  .uri = "/api/toggle",
  .method = HTTP_POST,
  .handler = api_toggle_handler,
};

static void wifi_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
  if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START)
  {
    esp_wifi_connect();
  }
  else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED)
  {
    ESP_LOGI(TAG, "Reconnecting to WiFi...");
    esp_wifi_connect();
  }
  else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP)
  {
    ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
    ESP_LOGI(TAG, "Got IP: " IPSTR, IP2STR(&event->ip_info.ip));
  }
}

static void wifi_init(void)
{
  ESP_ERROR_CHECK(nvs_flash_init());
  ESP_ERROR_CHECK(esp_netif_init());
  ESP_ERROR_CHECK(esp_event_loop_create_default());
  esp_netif_create_default_wifi_sta();

  wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
  ESP_ERROR_CHECK(esp_wifi_init(&cfg));

  ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL, NULL));
  ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL, NULL));

  wifi_config_t wifi_config = {
    .sta = {
      .threshold.authmode = WIFI_AUTH_WPA2_PSK,
    },
  };
  strncpy((char *)wifi_config.sta.ssid, ssid, sizeof(wifi_config.sta.ssid));
  strncpy((char *)wifi_config.sta.password, pass, sizeof(wifi_config.sta.password));

  ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
  ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
  ESP_ERROR_CHECK(esp_wifi_start());

  ESP_LOGI(TAG, "Connecting to %s...", ssid);
}

static httpd_handle_t start_http_server(void)
{
  httpd_handle_t httpd = NULL;
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.max_uri_handlers = SVELTEESP32_COUNT + 10;

  ESP_LOGI(TAG, "Starting server on port %d", config.server_port);
  ESP_ERROR_CHECK(httpd_start(&httpd, &config));

  initSvelteStaticFiles(httpd);
  httpd_register_uri_handler(httpd, &uri_api_status);
  httpd_register_uri_handler(httpd, &uri_api_toggle);

  return httpd;
}

void app_main(void)
{
  gpio_reset_pin(LED_PIN);
  gpio_set_direction(LED_PIN, GPIO_MODE_OUTPUT);
  gpio_set_level(LED_PIN, 0);

  wifi_init();

  vTaskDelay(3000 / portTICK_PERIOD_MS);

  start_http_server();

  while (1)
  {
    vTaskDelay(1000 / portTICK_PERIOD_MS);
  }
}
