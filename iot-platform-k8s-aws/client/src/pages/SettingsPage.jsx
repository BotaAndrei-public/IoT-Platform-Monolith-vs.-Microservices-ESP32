import { useState } from "react";
import {
  Copy,
  Server,
  Cpu,
  CheckCheck,
  Wifi,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "../context/ToastContext";
import { SERVER_URL } from "../lib/config";

export default function SettingsPage() {
  const { toast } = useToast();
  const [copied, setCopied] = useState({});
  const [activeTab, setActiveTab] = useState("auto"); // 'auto' | 'manual'

  const copy = async (key, text) => {
    await navigator.clipboard.writeText(text);
    setCopied((c) => ({ ...c, [key]: true }));
    toast("Copiat!", "success");
    setTimeout(() => setCopied((c) => ({ ...c, [key]: false })), 2000);
  };

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Setari</h1>
      <p className="text-muted text-sm mb-6">
        Configurare server si setup ESP32
      </p>

      {/* URL SERV. info*/}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Server size={18} color="var(--primary)" />
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>Server conectat</h2>
        </div>
        <div className="form-group">
          <label className="label">URL server curent</label>
          <div className="flex gap-2">
            <input
              className="input"
              readOnly
              value={SERVER_URL}
              style={{ fontFamily: "monospace" }}
            />
            <button
              className="btn btn-ghost btn-sm btn-icon"
              onClick={() => copy("url", SERVER_URL)}
            >
              {copied.url ? (
                <CheckCheck size={14} color="var(--success)" />
              ) : (
                <Copy size={14} />
              )}
            </button>
          </div>
          <div className="text-xs text-muted mt-1">
            Configurat din{" "}
            <code
              style={{
                background: "var(--bg3)",
                padding: "1px 5px",
                borderRadius: 3,
              }}
            >
              client/.env.local
            </code>{" "}
            → variabila{" "}
            <code
              style={{
                background: "var(--bg3)",
                padding: "1px 5px",
                borderRadius: 3,
              }}
            >
              VITE_SERVER_URL
            </code>
          </div>
        </div>
      </div>

      {/* ESP32 Setup */}
      <div className="card mb-6" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border)",
          }}
        >
          {[
            { id: "auto", label: "✨ Setup automat", desc: "Recomandat" },
            {
              id: "manual",
              label: "⚙ Setup manual",
              desc: "Pentru developeri",
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                padding: "14px 20px",
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                borderBottom:
                  activeTab === tab.id
                    ? "2px solid var(--primary)"
                    : "2px solid transparent",
                color: activeTab === tab.id ? "var(--text)" : "var(--text2)",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13 }}>{tab.label}</div>
              <div
                style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}
              >
                {tab.desc}
              </div>
            </button>
          ))}
        </div>

        <div style={{ padding: 24 }}>
          {activeTab === "auto" ? (
            <AutoSetupTab copy={copy} copied={copied} />
          ) : (
            <ManualSetupTab copy={copy} copied={copied} />
          )}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Cpu size={18} color="var(--primary)" />
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>
            Pini ESP32-C3 Super Mini
          </h2>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            gap: 8,
          }}
        >
          {[
            { pin: 0, note: "Digital I/O" },
            { pin: 1, note: "Digital I/O" },
            { pin: 2, note: "Digital I/O" },
            { pin: 3, note: "Digital I/O" },
            { pin: 4, note: "Digital I/O" },
            { pin: 5, note: "Digital I/O" },
            { pin: 6, note: "Digital I/O" },
            { pin: 7, note: "Digital I/O" },
            { pin: 8, note: "Digital I/O (LED)" },
            { pin: 9, note: "BOOT button" },
            { pin: 10, note: "Digital I/O" },
            { pin: 20, note: "UART0 RX" },
            { pin: 21, note: "UART0 TX" },
          ].map(({ pin, note }) => (
            <div
              key={pin}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 10px",
                background: "var(--bg3)",
                borderRadius: 6,
                border: "1px solid var(--border)",
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 22,
                  background: "var(--primary-dim)",
                  color: "var(--primary)",
                  borderRadius: 4,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 11,
                }}
              >
                {pin}
              </span>
              <span style={{ fontSize: 11, color: "var(--text2)" }}>
                {note}
              </span>
            </div>
          ))}
        </div>
        <div className="text-xs text-muted mt-3">
          ⚠ Nu folosi GPIO 11-19 — sunt rezervati pentru SPI flash intern.
        </div>
      </div>
    </div>
  );
}

function AutoSetupTab() {
  return (
    <div>
      <div
        style={{
          background: "var(--primary-dim)",
          border: "1px solid var(--primary)",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 20,
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
        }}
      >
        <Wifi
          size={18}
          color="var(--primary)"
          style={{ flexShrink: 0, marginTop: 2 }}
        />
        <div>
          <div
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: "var(--primary)",
              marginBottom: 4,
            }}
          >
            Cum functioneaza setup-ul automat
          </div>
          <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.7 }}>
            ESP32-ul cu firmware IoT Platform porneste un Access Point WiFi
            propriu. Te conectezi la el, introduci datele WiFi-ului casei, iar
            ESP-ul se configureaza singur. Nu trebuie sa modifici sau sa
            uploadezi nimic.
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[
          {
            step: 1,
            title: "Alimenteaza ESP32-ul",
            desc: "Conecteaza ESP32-ul la curent (USB sau sursa). LED-ul va clipi rapid — asta inseamna ca e in modul Setup.",
          },
          {
            step: 2,
            title: "Conecteaza-te la WiFi-ul ESP-ului",
            desc: 'Pe telefon sau PC, cauta reteaua WiFi numita "IoT-Setup-XXXXXX" si conecteaza-te. Nu are parola.',
          },
          {
            step: 3,
            title: "Deschide pagina de configurare",
            desc: "Deschide browser-ul si mergi la http://192.168.4.1 — va aparea automat pagina de setup.",
          },
          {
            step: 4,
            title: "Introdu datele WiFi-ului casei",
            desc: "Selecteaza reteaua WiFi a casei tale, introdu parola. Server URL-ul este deja completat automat.",
          },
          {
            step: 5,
            title: "Salveaza si asteapta",
            desc: 'Dupa ce apesi "Conecteaza", ESP32-ul se reconecteaza la WiFi-ul casei si apare automat in lista de Devices.',
          },
        ].map(({ step, title, desc }) => (
          <div
            key={step}
            style={{
              display: "flex",
              gap: 14,
              alignItems: "flex-start",
              padding: "12px 14px",
              background: "var(--bg3)",
              borderRadius: 8,
              border: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                flexShrink: 0,
                background: "var(--primary)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              {step}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>
                {title}
              </div>
              <div
                style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.6 }}
              >
                {desc}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 16,
          padding: "10px 14px",
          borderRadius: 8,
          background: "var(--warning-dim)",
          border: "1px solid var(--warning)",
          fontSize: 12,
          color: "var(--warning)",
        }}
      >
        ⚠ Firmware-ul trebuie sa fie versiunea cu SoftAP Provisioning. Daca ai
        firmware vechi, urmeaza instructiunile din tab-ul Manual pentru primul
        upload.
      </div>
    </div>
  );
}

//TODO :: 1

function ManualSetupTab({ copy, copied }) {
  return (
    <div>
      <div
        style={{
          background: "#1f1f2e",
          border: "1px solid var(--border2)",
          borderRadius: 8,
          padding: "10px 14px",
          marginBottom: 20,
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
        }}
      >
        <AlertTriangle
          size={16}
          color="var(--text3)"
          style={{ flexShrink: 0, marginTop: 2 }}
        />
        <div style={{ fontSize: 12, color: "var(--text3)" }}>
          Setup manual este pentru developeri care inteleg ce face aplicatia si
          vor sa configureze firmware-ul direct din cod.
        </div>
      </div>

      <ol
        style={{
          paddingLeft: 20,
          lineHeight: 2.4,
          fontSize: 13,
          color: "var(--text2)",
        }}
      >
        <li>
          Adauga un device nou in pagina{" "}
          <strong style={{ color: "var(--text)" }}>Devices</strong>
        </li>
        <li>Adauga senzorii cu pinii corecti</li>
        <li>
          Copiaza <strong style={{ color: "var(--text)" }}>Device ID</strong> si{" "}
          <strong style={{ color: "var(--text)" }}>API Key</strong>
        </li>
        <li>
          Deschide{" "}
          <code
            style={{
              background: "var(--bg3)",
              padding: "1px 5px",
              borderRadius: 3,
            }}
          >
            firmware/src/config.h
          </code>{" "}
          in PlatformIO
        </li>
        <li>
          Completeaza{" "}
          <code
            style={{
              background: "var(--bg3)",
              padding: "1px 5px",
              borderRadius: 3,
            }}
          >
            WIFI_SSID
          </code>
          ,{" "}
          <code
            style={{
              background: "var(--bg3)",
              padding: "1px 5px",
              borderRadius: 3,
            }}
          >
            WIFI_PASSWORD
          </code>
          ,{" "}
          <code
            style={{
              background: "var(--bg3)",
              padding: "1px 5px",
              borderRadius: 3,
            }}
          >
            SERVER_URL
          </code>
          ,{" "}
          <code
            style={{
              background: "var(--bg3)",
              padding: "1px 5px",
              borderRadius: 3,
            }}
          >
            DEVICE_ID
          </code>
          ,{" "}
          <code
            style={{
              background: "var(--bg3)",
              padding: "1px 5px",
              borderRadius: 3,
            }}
          >
            API_KEY
          </code>
        </li>
        <li>
          Click <strong style={{ color: "var(--text)" }}>Upload</strong> in
          PlatformIO
        </li>
        <li>Deschide Serial Monitor (115200 baud) pentru debug</li>
      </ol>

      <div style={{ marginTop: 16 }}>
        <div className="label">SERVER_URL pentru firmware</div>
        <div className="flex gap-2">
          <input
            className="input"
            readOnly
            value={SERVER_URL}
            style={{ fontFamily: "monospace", fontSize: 12 }}
          />
          <button
            className="btn btn-ghost btn-sm btn-icon"
            onClick={() => copy("fw_url", SERVER_URL)}
          >
            {copied.fw_url ? (
              <CheckCheck size={14} color="var(--success)" />
            ) : (
              <Copy size={14} />
            )}
          </button>
        </div>
        <div className="text-xs text-muted mt-1">
          Pune acest URL in{" "}
          <code
            style={{
              background: "var(--bg3)",
              padding: "1px 5px",
              borderRadius: 3,
            }}
          >
            #define SERVER_URL
          </code>{" "}
          din config.h
        </div>
      </div>
    </div>
  );
}
