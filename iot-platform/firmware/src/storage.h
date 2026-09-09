#pragma once

// Storage.h salveaza configuratia in NVS (flash non-volatil)
// Supravietuieste la restart si power off

#include <Preferences.h>
#include <Arduino.h>

struct DeviceConfig {
  String wifiSsid;
  String wifiPassword;
  String serverUrl;
  String deviceId;
  String apiKey;
  bool   configured;
};

class Storage {
public:
  static DeviceConfig load() {
    Preferences p;
    p.begin("iot", true);
    DeviceConfig c;
    c.wifiSsid     = p.getString("ssid",      "");
    c.wifiPassword = p.getString("pass",      "");
    c.serverUrl    = p.getString("server",    "");
    c.deviceId     = p.getString("device_id", "");
    c.apiKey       = p.getString("api_key",   "");
    c.configured   = p.getBool("configured",  false);
    p.end();
    return c;
  }

  static void save(const DeviceConfig& c) {
    Preferences p;
    p.begin("iot", false);
    p.putString("ssid",       c.wifiSsid);
    p.putString("pass",       c.wifiPassword);
    p.putString("server",     c.serverUrl);
    p.putString("device_id",  c.deviceId);
    p.putString("api_key",    c.apiKey);
    p.putBool("configured",   c.configured);
    p.end();
    Serial.println("[NVS] Config salvata");
  }

  static void clear() {
    Preferences p;
    p.begin("iot", false);
    p.clear();
    p.end();
    Serial.println("[NVS] Config stearsa (factory reset)");
  }

  static bool isValid(const DeviceConfig& c) {
    return c.configured
      && c.wifiSsid.length()   > 0
      && c.serverUrl.length()  > 0
      && c.deviceId.length()   > 0
      && c.apiKey.length()     > 0;
  }
};
