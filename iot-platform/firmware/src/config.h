#pragma once

// Definire timipi utilizati
#define TELEMETRY_INTERVAL_MS     5000UL   // cat de des trimite date (ms)
#define CONFIG_CHECK_INTERVAL_MS  30000UL  // cat de des se verifica senzori noi (ms)
#define HTTP_TIMEOUT_MS           8000     // timeout HTTP request
#define WIFI_TIMEOUT_MS           15000UL  // timeout conectare WiFi
#define AP_TIMEOUT_MS             300000UL // timeout modul setup (5 minute)

// Hardware
#define MAX_SENSORS   16   // nr max senz / device
#define LED_PIN       8    // LED built-in ESP32-C3 Super Mini
#define BOOT_PIN      9    // adica butonul de BOOT (factory reset), daca se tine apasat

//SoftAP pornite acces poit pt esp, isi creaza propriul wifi
#define AP_SSID_PREFIX  "IoT-Setup-"  // Ex de nume wifi: IoT-Setup-AABBCC
