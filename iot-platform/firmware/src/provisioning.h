#pragma once

#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include "config.h"
#include "storage.h"

static const char SETUP_HTML[] PROGMEM = R"HTML(
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>IoT Platform Setup</title>
<style>
:root{--bg:#f4f5f9;--card:#fff;--border:#e2e4ef;--text:#1a1d2e;--text2:#4a5275;--text3:#8a90b0;--primary:#4f63f5;--primary-dim:#dde0fd;--success:#16a34a;--success-bg:#dcfce7;--danger:#dc2626;--inp:#f9fafc}
[data-theme=dark]{--bg:#0f1117;--card:#1a1d27;--border:#2e3248;--text:#e8eaf6;--text2:#9199c4;--text3:#5a6080;--primary:#6c7fff;--primary-dim:#3d4799;--success:#4ade80;--success-bg:#166534;--danger:#f87171;--inp:#22263a}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;transition:background .2s}
.card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:26px;width:100%;max-width:400px;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
.logo{display:flex;align-items:center;gap:10px}
.logo-icon{width:34px;height:34px;background:var(--primary);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:17px}
.logo-title{font-weight:700;font-size:15px}
.logo-sub{font-size:11px;color:var(--text3)}
.ctrls{display:flex;gap:6px;align-items:center}
.tbtn{background:var(--inp);border:1px solid var(--border);border-radius:6px;padding:5px 8px;cursor:pointer;color:var(--text2);font-size:13px;line-height:1}
.tbtn:hover{background:var(--primary);color:#fff;border-color:var(--primary)}
.lgrp{display:flex;background:var(--inp);border:1px solid var(--border);border-radius:6px;overflow:hidden}
.lbtn{padding:5px 9px;border:none;cursor:pointer;background:transparent;color:var(--text3);font-size:11px;font-weight:700;text-transform:uppercase}
.lbtn.on{background:var(--primary);color:#fff}
.slbl{font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin:16px 0 10px}
label{display:block;font-size:12px;font-weight:600;color:var(--text2);margin-bottom:4px;margin-top:10px}
input,select{width:100%;padding:9px 12px;background:var(--inp);border:1px solid var(--border);border-radius:7px;color:var(--text);font-size:14px;outline:none;transition:border .15s}
input:focus,select:focus{border-color:var(--primary)}
select option{background:var(--inp)}
hr{border:none;border-top:1px solid var(--border);margin:16px 0}
.pre{background:var(--success-bg);color:var(--success);border-radius:7px;padding:8px 12px;font-size:12px;display:none;align-items:center;gap:6px;margin-top:8px}
.btn{width:100%;padding:12px;background:var(--primary);color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;margin-top:16px;transition:.15s}
.btn:hover{filter:brightness(1.08)}
.btn:disabled{opacity:.5;cursor:not-allowed}
#st{margin-top:12px;padding:10px 14px;border-radius:8px;font-size:13px;display:none;text-align:center;line-height:1.6}
#st.ok{background:var(--success-bg);color:var(--success)}
#st.err{background:#fee2e2;color:var(--danger)}
[data-theme=dark] #st.err{background:#3f0f0f}
#st.ld{background:var(--inp);color:var(--text2)}
.sp{display:inline-block;width:12px;height:12px;border:2px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:5px}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="card">
  <div class="hdr">
    <div class="logo">
      <div class="logo-icon">📡</div>
      <div>
        <div class="logo-title">IoT Platform</div>
        <div class="logo-sub" id="sub">Device Setup</div>
      </div>
    </div>
    <div class="ctrls">
      <button class="tbtn" id="themeBtn" onclick="toggleTheme()">🌙</button>
      <div class="lgrp">
        <button class="lbtn on" id="bEN" onclick="setLang('en')">EN</button>
        <button class="lbtn"    id="bRO" onclick="setLang('ro')">RO</button>
      </div>
    </div>
  </div>

  <form id="frm" onsubmit="doSave(event)">
    <div class="slbl" id="lWifi">📶 WiFi Network</div>
    <label id="lSsid">Network (SSID)</label>
    <select id="ssid" required></select>
    <label id="lPass">Password</label>
    <input type="password" id="pass" autocomplete="current-password"/>

    <hr/>
    <div class="slbl" id="lSrv">🌐 Server</div>
    <label id="lSrvUrl">Server URL</label>
    <input type="text" id="server" placeholder="http://192.168.1.100:3001" required/>

    <hr/>
    <div class="slbl" id="lCred">🔑 Device Credentials</div>
    <label id="lDid">Device ID</label>
    <input type="text" id="did" placeholder="From Devices page" required/>
    <label id="lKey">API Key</label>
    <input type="password" id="key" placeholder="From Devices page" required/>

    <div class="pre" id="preNote">
      <span>✓</span><span id="preText">Pre-filled from QR code</span>
    </div>

    <button type="submit" class="btn" id="submitBtn">Connect ESP32</button>
  </form>
  <div id="st"></div>
</div>

<script>
const T={
  en:{sub:'Device Setup','lWifi':'📶 WiFi Network','lSsid':'Network (SSID)','lPass':'Password','lSrv':'🌐 Server','lSrvUrl':'Server URL','lCred':'🔑 Device Credentials','lDid':'Device ID','lKey':'API Key',pre:'Pre-filled from QR code',btn:'Connect ESP32',scanning:'Scanning networks...',noScan:'Cannot scan — type SSID manually',saving:'Saving and connecting...',ok:'✓ Saved! ESP32 is connecting to {s}.\nYou can close this page.',err:'Error: ',req:'Please fill in all required fields.'},
  ro:{sub:'Configurare Device','lWifi':'📶 Retea WiFi','lSsid':'Retea (SSID)','lPass':'Parola','lSrv':'🌐 Server','lSrvUrl':'URL Server','lCred':'🔑 Credentiale Device','lDid':'Device ID','lKey':'API Key',pre:'Pre-completate din QR code',btn:'Conecteaza ESP32',scanning:'Se scaneaza...',noScan:'Nu pot scana — scrie SSID manual',saving:'Se salveaza...',ok:'✓ Salvat! ESP32-ul se conecteaza la {s}.\nPoti inchide aceasta pagina.',err:'Eroare: ',req:'Completeaza toate campurile obligatorii.'}
};
let lang='en', theme=localStorage.getItem('esp_t')||'light';

function setLang(l){
  lang=l;
  document.getElementById('bEN').className='lbtn'+(l==='en'?' on':'');
  document.getElementById('bRO').className='lbtn'+(l==='ro'?' on':'');
  const t=T[l];
  ['sub','lWifi','lSsid','lPass','lSrv','lSrvUrl','lCred','lDid','lKey'].forEach(k=>{
    const el=document.getElementById(k); if(el) el.textContent=t[k];
  });
  document.getElementById('preText').textContent=t.pre;
  document.getElementById('submitBtn').textContent=t.btn;
}

function toggleTheme(){
  theme=theme==='light'?'dark':'light';
  localStorage.setItem('esp_t',theme);
  document.documentElement.setAttribute('data-theme',theme);
  document.getElementById('themeBtn').textContent=theme==='dark'?'☀️':'🌙';
}

// Apply saved theme
document.documentElement.setAttribute('data-theme',theme);
document.getElementById('themeBtn').textContent=theme==='dark'?'☀️':'🌙';

// Pre-fill from QR params
(function(){
  const p=new URLSearchParams(window.location.search);
  let pre=false;
  if(p.get('server')){document.getElementById('server').value=p.get('server');pre=true;}
  if(p.get('device_id')){document.getElementById('did').value=p.get('device_id');pre=true;}
  if(p.get('api_key')){document.getElementById('key').value=p.get('api_key');pre=true;}
  if(pre) document.getElementById('preNote').style.display='flex';
})();

// Scan WiFi
const sel=document.getElementById('ssid');
sel.innerHTML='<option value="">'+T[lang].scanning+'</option>';
fetch('/scan').then(r=>r.json()).then(nets=>{
  sel.innerHTML='<option value="">-- Select --</option>';
  nets.forEach(n=>{
    const o=document.createElement('option');
    o.value=n.ssid;o.textContent=n.ssid+' ('+n.rssi+' dBm)';
    sel.appendChild(o);
  });
}).catch(()=>{
  const inp=document.createElement('input');
  inp.type='text';inp.id='ssid_m';inp.placeholder=T[lang].noScan;inp.required=true;
  sel.replaceWith(inp);
});

async function doSave(e){
  e.preventDefault();
  const t=T[lang];
  const st=document.getElementById('st');
  const btn=document.getElementById('submitBtn');
  const ssidEl=document.getElementById('ssid_m')||document.getElementById('ssid');
  const data={ssid:ssidEl.value,pass:document.getElementById('pass').value,
    server:document.getElementById('server').value,
    device_id:document.getElementById('did').value,
    api_key:document.getElementById('key').value};
  if(!data.ssid||!data.server||!data.device_id||!data.api_key){
    st.className='err';st.style.display='block';st.textContent=t.req;return;
  }
  btn.disabled=true;
  st.className='ld';st.style.display='block';
  st.innerHTML='<span class="sp"></span>'+t.saving;
  try{
    const r=await fetch('/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const j=await r.json();
    if(j.ok){st.className='ok';st.style.display='block';st.textContent=t.ok.replace('{s}',data.ssid);}
    else throw new Error(j.error||'Unknown error');
  }catch(err){
    btn.disabled=false;
    st.className='err';st.style.display='block';
    st.textContent=t.err+err.message;
  }
}
</script>
</body>
</html>
)HTML";

class Provisioning {
public:
  WebServer*   server = nullptr;
  bool         saveRequested = false;
  DeviceConfig pendingConfig;
  String       apSsid;

  void begin(const DeviceConfig& existingCfg, const String& serverDefault) {
    uint8_t mac[6];
    WiFi.macAddress(mac);
    char suffix[8];
    snprintf(suffix, sizeof(suffix), "%02X%02X%02X", mac[3], mac[4], mac[5]);
    apSsid = String(AP_SSID_PREFIX) + suffix;

    WiFi.mode(WIFI_AP);
    WiFi.softAP(apSsid.c_str());

    Serial.println("\n╔══════════════════════════════════════╗");
    Serial.println("║      SETUP MODE — SoftAP Active      ║");
    Serial.println("╚══════════════════════════════════════╝");
    Serial.printf("  WiFi: %s  (no password)\n", apSsid.c_str());
    Serial.printf("  URL:  http://%s\n\n", WiFi.softAPIP().toString().c_str());

    server = new WebServer(80);

    server->on("/", HTTP_GET, [this]() {
      server->send(200, "text/html; charset=utf-8", String(SETUP_HTML));
    });

    server->on("/scan", HTTP_GET, [this]() {
      int n = WiFi.scanNetworks();
      String json = "[";
      for (int i = 0; i < n; i++) {
        if (i) json += ",";
        String s = WiFi.SSID(i); s.replace("\"", "\\\"");
        json += "{\"ssid\":\"" + s + "\",\"rssi\":" + WiFi.RSSI(i) + "}";
      }
      json += "]";
      server->send(200, "application/json", json);
      WiFi.scanDelete();
    });

    server->on("/save", HTTP_POST, [this]() {
      if (!server->hasArg("plain")) {
        server->send(400, "application/json", "{\"ok\":false,\"error\":\"No body\"}");
        return;
      }
      JsonDocument doc;
      if (deserializeJson(doc, server->arg("plain")) != DeserializationError::Ok) {
        server->send(400, "application/json", "{\"ok\":false,\"error\":\"Invalid JSON\"}");
        return;
      }
      pendingConfig.wifiSsid     = doc["ssid"]      | "";
      pendingConfig.wifiPassword = doc["pass"]      | "";
      pendingConfig.serverUrl    = doc["server"]    | "";
      pendingConfig.deviceId     = doc["device_id"] | "";
      pendingConfig.apiKey       = doc["api_key"]   | "";
      pendingConfig.configured   = true;

      if (pendingConfig.wifiSsid.isEmpty() || pendingConfig.serverUrl.isEmpty() ||
          pendingConfig.deviceId.isEmpty() || pendingConfig.apiKey.isEmpty()) {
        server->send(400, "application/json", "{\"ok\":false,\"error\":\"Missing fields\"}");
        return;
      }
      server->send(200, "application/json", "{\"ok\":true}");
      saveRequested = true;
      Serial.printf("[Provisioning] Saved: SSID=%s Server=%s\n",
        pendingConfig.wifiSsid.c_str(), pendingConfig.serverUrl.c_str());
    });

    server->onNotFound([this]() {
      server->sendHeader("Location", "/");
      server->send(302, "text/plain", "");
    });

    server->begin();
  }

  void handle() { if (server) server->handleClient(); }
  bool hasPendingSave() { return saveRequested; }
  DeviceConfig getPendingConfig() { return pendingConfig; }
  void stop() {
    if (server) { server->stop(); delete server; server = nullptr; }
    WiFi.softAPdisconnect(true);
  }
};
