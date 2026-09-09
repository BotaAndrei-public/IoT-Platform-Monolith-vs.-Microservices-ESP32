
// IoT Platform — Firmware ESP32-C3 Super Mini
// FLUX: 1. BOOT, 2 daca nu are config -> SoftAP setup mode (IoT-Setup-XXXXXX)
// 3.  daca are config -> con. WiFi -> trimite date la serv.

//FACTORY RESET:
//La pornire: tine pe butonul de BOOT (GPIO9) apasat pana porneste. 
//In timpul rularii: tine pe butonul de BOOT 5 secunde (LED clipeste accelerat, led albastru)

//CONFIG RELOAD:
// La tot 30s verifica serv. daca s-au adaugat senz. noi

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include "config.h"
#include "storage.h"
#include "provisioning.h"

//Structura senzor
struct SensorCfg
{
  String id;
  String name;
  String type; // dht11_temp | dht11_humidity | flame | relay
  int pin;
  String unit;
  String relayMode; // onoff | procent (%)
};

//var globale 
DeviceConfig cfg;

SensorCfg sensors[MAX_SENSORS];
int sensorCount = 0;

DHT *dhtObjects[MAX_SENSORS];
int dhtPins[MAX_SENSORS];
int dhtCount = 0;

unsigned long lastTelemetry = 0;
unsigned long lastConfigCheck = 0;
bool configLoaded = false;

Provisioning provisioning;

//LED helper
void blinkLed(int times, int ms = 200)
{
  for (int i = 0; i < times; i++)
  {
    digitalWrite(LED_PIN, LOW); // LOW = aprins pe ESP32-C3
    delay(ms);
    digitalWrite(LED_PIN, HIGH); // HIGH = stins
    delay(ms);
  }
}

//Factory reset la boot
// tine pe butonul de BOOT 5 secunde BOOT  apasat inainte de a da curent, apoi porneste


//TODO
void checkFactoryReset()
{
  pinMode(BOOT_PIN, INPUT_PULLUP);
  if (digitalRead(BOOT_PIN) != LOW)
    return;

  Serial.println("[Reset] BOOT apasat la pornire — tine pentru factory reset...");
  unsigned long t = millis();
  while (digitalRead(BOOT_PIN) == LOW)
  {
    if (millis() - t > 3000)
    {
      Serial.println("[Reset] FACTORY RESET — sterg NVS...");
      blinkLed(8, 100);
      Storage::clear();
      delay(500);
      ESP.restart();
    }
    delay(50);
  }
  Serial.println("[Reset] Buton eliberat — continuare normala.");
}

// factory reset in timpul rularii
// Tine BOOT apasat 5 secunde oricand in timp ce ESP ruleaza
void checkRuntimeReset()
{
  if (digitalRead(BOOT_PIN) != LOW)
    return;

  Serial.println("[Reset] BOOT apasat — tine 5s pentru factory reset...");
  unsigned long held = millis();

  while (digitalRead(BOOT_PIN) == LOW)
  {
    unsigned long elapsed = millis() - held;

    if (elapsed > 5000)
    {
      Serial.println("[Reset] FACTORY RESET — sterg NVS...");
      blinkLed(10, 80);
      Storage::clear();
      delay(500);
      ESP.restart();
    }

    // LED clipeste din ce in ce mai rapid pe masura ce se apropie resetul
    int rate = (int)(600 - (elapsed * 520 / 5000));
    if (rate < 80)
      rate = 80;
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    delay(rate);
  }

  Serial.println("[Reset] Anulat — buton eliberat inainte de 5s.");
  digitalWrite(LED_PIN, HIGH);
}

// WiFi connect 
bool connectWiFi()
{
  Serial.printf("[WiFi] Conectare la '%s'", cfg.wifiSsid.c_str());
  WiFi.mode(WIFI_STA);
  WiFi.begin(cfg.wifiSsid.c_str(), cfg.wifiPassword.c_str());

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED)
  {
    if (millis() - start > WIFI_TIMEOUT_MS)
    {
      Serial.println(" TIMEOUT!");
      return false;
    }
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\n[WiFi] Conectat! IP: %s\n", WiFi.localIP().toString().c_str());
  return true;
}

// DHT —> un obiect per pin fizic
DHT *getDht(int pin)
{
  for (int i = 0; i < dhtCount; i++)
  {
    if (dhtPins[i] == pin)
      return dhtObjects[i];
  }
  if (dhtCount >= MAX_SENSORS)
    return nullptr;
  DHT *d = new DHT(pin, DHT11);
  d->begin();
  dhtObjects[dhtCount] = d;
  dhtPins[dhtCount] = pin;
  dhtCount++;
  Serial.printf("[HW] DHT11 initializat GPIO%d\n", pin);
  return d;
}

//initializare pinii hardware
void setupHardware()
{
  //Elibereaza DHT-urile existente
  for (int i = 0; i < dhtCount; i++)
  {
    delete dhtObjects[i];
    dhtObjects[i] = nullptr;
  }
  dhtCount = 0;

  for (int i = 0; i < sensorCount; i++)
  {
    int pin = sensors[i].pin;
    if (sensors[i].type == "dht11_temp" || sensors[i].type == "dht11_humidity")
    {
      getDht(pin);
    }
    else if (sensors[i].type == "flame")
    {
      pinMode(pin, INPUT);
      Serial.printf("[HW] Flame INPUT GPIO%d\n", pin);
    }
    else if (sensors[i].type == "relay")
    {
      pinMode(pin, OUTPUT);
      digitalWrite(pin, LOW);
      Serial.printf("[HW] Relay OUTPUT GPIO%d\n", pin);
    }
  }
}

//fetch config de la server
// retur: 1=actualizat, 0=nicio schimbare, -1=eroare
int fetchConfig(bool silent = false)
{
  String url = cfg.serverUrl + "/api/devices/" + cfg.deviceId + "/config";
  if (!silent)
    Serial.printf("[Config] GET %s\n", url.c_str());

  HTTPClient http;
  http.begin(url);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("X-API-Key", cfg.apiKey);

  int code = http.GET();
  if (code != 200)
  {
    if (!silent)
      Serial.printf("[Config] HTTP %d\n", code);
    if (code == 401)
      Serial.println("[Config] API Key invalid!");
    if (code == 404)
      Serial.println("[Config] Device ID invalid!");
    http.end();
    return -1;
  }

  String body = http.getString();
  http.end();

  JsonDocument doc;
  if (deserializeJson(doc, body) != DeserializationError::Ok)
  {
    Serial.println("[Config] JSON parse error");
    return -1;
  }

  JsonArrayConst arr = doc["sensors"].as<JsonArrayConst>();

  // detect schimbari: numar diferit sau IDs diferite
  int newCount = 0;
  for (JsonObjectConst s : arr)
    newCount++;

  bool changed = (newCount != sensorCount);
  if (!changed)
  {
    int i = 0;
    for (JsonObjectConst s : arr)
    {
      if (sensors[i].id != s["id"].as<String>())
      {
        changed = true;
        break;
      }
      i++;
    }
  }
  if (!changed)
    return 0; // nicio schimbare

  // aplica noua config.
  sensorCount = 0;
  for (JsonObjectConst s : arr)
  {
    if (sensorCount >= MAX_SENSORS)
      break;
    sensors[sensorCount].id = s["id"].as<String>();
    sensors[sensorCount].name = s["name"].as<String>();
    sensors[sensorCount].type = s["type"].as<String>();
    sensors[sensorCount].pin = s["pin"].as<int>();
    sensors[sensorCount].unit = s["unit"] | "";
    sensors[sensorCount].relayMode = !s["relay_config"].isNull()
                                         ? (s["relay_config"]["mode"] | "onoff")
                                         : "onoff";
    Serial.printf("[Config] Senzor: %s (%s) GPIO%d\n",
                  sensors[sensorCount].name.c_str(),
                  sensors[sensorCount].type.c_str(),
                  sensors[sensorCount].pin);
    sensorCount++;
  }
  Serial.printf("[Config] %d senzori incarcati\n", sensorCount);
  setupHardware();
  return 1;
}

//aplica com. relay de de la serv
void applyRelayCommands(JsonArray commands)
{
  for (JsonObject cmd : commands)
  {
    String sid = cmd["sensor_id"].as<String>();
    int state = cmd["command"]["state"] | 0;
    int percent = cmd["command"]["percent"] | 0;

    for (int i = 0; i < sensorCount; i++)
    {
      if (sensors[i].id != sid || sensors[i].type != "relay")
        continue;

      int pin = sensors[i].pin;
      if (sensors[i].relayMode == "percent")
      {
        uint8_t canal = (uint8_t)(i % 8);
        ledcSetup(canal, 1000, 8);
        ledcAttachPin(pin, canal);
        ledcWrite(canal, map(percent, 0, 100, 0, 255));
        Serial.printf("[Relay] %s GPIO%d -> %d%%\n", sensors[i].name.c_str(), pin, percent);
      }
      else
      {
        ledcDetachPin(pin);
        pinMode(pin, OUTPUT);
        digitalWrite(pin, state ? HIGH : LOW);
        Serial.printf("[Relay] %s GPIO%d -> %s\n", sensors[i].name.c_str(), pin, state ? "ON" : "OFF");
      }
      break;
    }
  }
}

//Citeste un senzor
float readSensor(const SensorCfg &s)
{
  if (s.type == "dht11_temp")
  {
    DHT *dht = getDht(s.pin);
    return dht ? dht->readTemperature() : NAN;
  }
  if (s.type == "dht11_humidity")
  {
    DHT *dht = getDht(s.pin);
    return dht ? dht->readHumidity() : NAN;
  }
  if (s.type == "flame")
  {
    // HIGH = foc detectat  HIGH)
    // daca senz. e invers (LOW)-> schimba HIGH cu LOW
    return (digitalRead(s.pin) == HIGH) ? 1.0f : 0.0f;
  }
  return NAN; // relay nu se citeste
}

//trimite telemetrie la serve
void sendTelemetry()
{
  if (WiFi.status() != WL_CONNECTED)
  {
    connectWiFi();
    return;
  }

  JsonDocument doc;
  JsonArray readings = doc["readings"].to<JsonArray>();
  int count = 0;

  for (int i = 0; i < sensorCount; i++)
  {
    float val = readSensor(sensors[i]);
    if (isnan(val))
      continue;
    JsonObject r = readings.add<JsonObject>();
    r["sensor_id"] = sensors[i].id;
    r["value"] = val;
    Serial.printf("[Tele] %s = %.1f%s\n",
                  sensors[i].name.c_str(), val, sensors[i].unit.c_str());
    count++;
  }

  if (count == 0)
  {
    Serial.println("[Tele] Nicio citire valida");
    return;
  }

  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.begin(cfg.serverUrl + "/api/telemetry");
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", cfg.apiKey);

  int code = http.POST(body);
  if (code == 200)
  {
    Serial.printf("[Tele] OK (%d citiri)\n", count);
    JsonDocument resp;
    if (deserializeJson(resp, http.getString()) == DeserializationError::Ok)
    {
      applyRelayCommands(resp["commands"].as<JsonArray>());
    }
  }
  else
  {
    Serial.printf("[Tele] HTTP %d\n", code);
  }
  http.end();
}

//Mod SoftAP
void runProvisioningMode()
{
  // foloseste servURL din NVS (de la Non-Volatile Storage) daca exista, altfel placeholder
  String defaultServer = Storage::isValid(cfg) ? cfg.serverUrl : "http://192.168.1.100:3001";
  provisioning.begin(cfg, defaultServer);

  unsigned long start = millis();
  while (true)
  {
    provisioning.handle();

    if (provisioning.hasPendingSave())
    {
      DeviceConfig newCfg = provisioning.getPendingConfig();
      Storage::save(newCfg);
      Serial.println("[AP] Config salvata! Restart in 2s...");
      blinkLed(5, 150);
      delay(2000);
      ESP.restart();
    }

    if (millis() - start > AP_TIMEOUT_MS)
    {
      Serial.println("[AP] Timeout — restart...");
      ESP.restart();
    }

    // LED clipeste lent cat timp e in modul AP
    static unsigned long lastBlink = 0;
    if (millis() - lastBlink > 1000)
    {
      lastBlink = millis();
      digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    }
    delay(10);
  }
}

//SETUP
void setup()
{
  Serial.begin(115200);
  delay(1000);

  pinMode(LED_PIN, OUTPUT);
  pinMode(BOOT_PIN, INPUT_PULLUP);
  digitalWrite(LED_PIN, HIGH); // stins

  Serial.println();
  Serial.println("╔════════════════════════════════╗");
  Serial.println("║   IoT Platform — ESP32-C3      ║");
  Serial.println("╚════════════════════════════════╝");

  // Factory reset la boot (tine BOOT la pornire)
  checkFactoryReset();

  // Incarca config din NVS
  cfg = Storage::load();

  if (!Storage::isValid(cfg))
  {
    Serial.println("[Boot] Nicio configuratie → Modul Setup");
    blinkLed(3, 300);
    runProvisioningMode(); // nu se intoarce niciodata
  }

  Serial.printf("[Boot] Config: SSID=%s | Server=%s\n",
                cfg.wifiSsid.c_str(), cfg.serverUrl.c_str());

  // Conectare WiFi — 3 incercari, dupa care intra in setup
  for (int attempt = 1; attempt <= 3; attempt++)
  {
    if (connectWiFi())
      break;
    if (attempt == 3)
    {
      Serial.println("[Boot] WiFi esuat 3x → Modul Setup");
      blinkLed(5, 200);
      runProvisioningMode();
    }
    Serial.printf("[Boot] Retry WiFi %d/3 in 3s...\n", attempt);
    delay(3000);
  }

  // Ia config senzori de la server — 3 incercari
  for (int attempt = 1; attempt <= 3; attempt++)
  {
    int result = fetchConfig();
    if (result >= 0)
    {
      configLoaded = true;
      break;
    }
    Serial.printf("[Boot] Config retry %d/3...\n", attempt);
    delay(3000);
  }

  if (!configLoaded)
  {
    Serial.println("[Boot] Nu pot lua config de la server!");
    Serial.println("[Boot] Verifica serverul si credentialele.");
    Serial.println("[Boot] Restart in 30s...");
    delay(30000);
    ESP.restart();
  }

  blinkLed(2, 200);
  Serial.println("\n[Boot] Gata! Trimit date...\n");
}

// LOOP
void loop()
{
  //factory reset in timp ce ruleaza (tine BOOT 5s)
  checkRuntimeReset();

  // recon. WiFi daca s-a pierdut
  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println("[Loop] WiFi pierdut, reconectez...");
    connectWiFi();
    delay(1000);
    return;
  }

  unsigned long now = millis();

  // verif. periodic daca s-au adaugat/sters senz (fara restart)
  if (now - lastConfigCheck >= CONFIG_CHECK_INTERVAL_MS)
  {
    lastConfigCheck = now;
    int result = fetchConfig(true); // silent
    if (result == 1)
    {
      Serial.println("[Config] Senzori actualizati — hardware reinitialized");
      blinkLed(1, 100);
    }
  }

  //trimite telemetrie
  if (now - lastTelemetry >= TELEMETRY_INTERVAL_MS)
  {
    lastTelemetry = now;
    sendTelemetry();
  }

  delay(10);
}
