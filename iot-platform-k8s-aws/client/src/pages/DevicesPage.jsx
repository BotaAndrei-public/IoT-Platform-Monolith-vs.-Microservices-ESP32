import { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Copy,
  ChevronDown,
  ChevronUp,
  Cpu,
  CheckCheck,
  Eye,
  EyeOff,
  Bell,
  BellOff,
} from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { AddDeviceModal } from "../components/AddDeviceModal";
import { AddSensorModal } from "../components/AddSensorModal";
import { DeviceSetupModal } from "../components/DeviceSetupModal";
import { AlertSettingsModal } from "../components/AlertSettingsModal";

const TYPE_LABELS = {
  dht11_temp: "DHT11 Temp",
  dht11_humidity: "DHT11 Umid.",
  flame: "Flacara",
  relay: "Relay",
};

export default function DevicesPage() {
  const { toast } = useToast();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addSensorFor, setAddSensorFor] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [provisioningDevice, setProvisioningDevice] = useState(null);
  const [alertSensor, setAlertSensor] = useState(null); // { device, sensor }

  const load = async () => {
    try {
      const data = await api.getDevices();
      setDevices(data);
    } catch (err) {
      toast("Eroare la incarcare devices: " + err.message, "danger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = (id) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  const deleteDevice = async (id, name) => {
    if (
      !confirm(
        `Stergi device-ul "${name}"? Se vor sterge si toti senzorii si datele.`,
      )
    )
      return;
    try {
      await api.deleteDevice(id);
      setDevices((d) => d.filter((x) => x.id !== id));
      toast("Device sters", "success");
    } catch (err) {
      toast(err.message, "danger");
    }
  };

  const deleteSensor = async (deviceId, sensorId, name) => {
    if (!confirm(`Stergi senzorul "${name}"?`)) return;
    try {
      await api.deleteSensor(deviceId, sensorId);
      setDevices((d) =>
        d.map((dev) =>
          dev.id === deviceId
            ? { ...dev, sensors: dev.sensors.filter((s) => s.id !== sensorId) }
            : dev,
        ),
      );
      toast("Senzor sters", "success");
    } catch (err) {
      toast(err.message, "danger");
    }
  };

  const updateSensorInState = (deviceId, updated) => {
    setDevices((d) =>
      d.map((dev) =>
        dev.id === deviceId
          ? {
              ...dev,
              sensors: dev.sensors.map((s) =>
                s.id === updated.id ? { ...s, ...updated } : s,
              ),
            }
          : dev,
      ),
    );
  };

  if (loading)
    return (
      <div className="flex items-center justify-center" style={{ height: 200 }}>
        <span className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Devices</h1>
          <p className="text-muted text-sm mt-1">
            Gestioneaza ESP32-urile si senzorii lor
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={16} /> Device nou
        </button>
      </div>

      {devices.length === 0 ? (
        <EmptyState onAdd={() => setShowAdd(true)} />
      ) : (
        <div className="flex-col gap-4" style={{ display: "flex" }}>
          {devices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              expanded={!!expanded[device.id]}
              onToggle={() => toggle(device.id)}
              onDelete={() => deleteDevice(device.id, device.name)}
              onAddSensor={() => setAddSensorFor(device)}
              onDeleteSensor={(sId, sName) =>
                deleteSensor(device.id, sId, sName)
              }
              onAlertSettings={(sensor) => setAlertSensor({ device, sensor })}
            />
          ))}
        </div>
      )}

      {/* adauga dispozitiv*/}
      {showAdd && (
        <AddDeviceModal
          onClose={() => setShowAdd(false)}
          onCreated={(dev) => {
            setDevices((d) => [dev, ...d]);
            setShowAdd(false);
            setExpanded((e) => ({ ...e, [dev.id]: true }));
            setProvisioningDevice(dev);
          }}
        />
      )}

      {/* QR  */}
      {provisioningDevice && (
        <DeviceSetupModal
          device={provisioningDevice}
          onClose={() => setProvisioningDevice(null)}
        />
      )}

      {/* Aletele */}
      {alertSensor && (
        <AlertSettingsModal
          device={alertSensor.device}
          sensor={alertSensor.sensor}
          onClose={() => setAlertSensor(null)}
          onUpdated={(updated) => {
            updateSensorInState(alertSensor.device.id, updated);
            setAlertSensor(null);
          }}
        />
      )}

      {/* + senzor */}
      {addSensorFor && (
        <AddSensorModal
          deviceId={addSensorFor.id}
          existingSensors={addSensorFor.sensors || []}
          onClose={() => setAddSensorFor(null)}
          onCreated={(sensor) => {
            setDevices((d) =>
              d.map((dev) =>
                dev.id === addSensorFor.id
                  ? { ...dev, sensors: [...(dev.sensors || []), sensor] }
                  : dev,
              ),
            );
            setAddSensorFor(null);
          }}
        />
      )}
    </div>
  );
}

// dispozitiv 
function DeviceCard({
  device,
  expanded,
  onToggle,
  onDelete,
  onAddSensor,
  onDeleteSensor,
  onAlertSettings,
}) {
  const { toast } = useToast();
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState({});

  const copy = async (key, value) => {
    await navigator.clipboard.writeText(value);
    setCopied((c) => ({ ...c, [key]: true }));
    toast("Copiat!", "success");
    setTimeout(() => setCopied((c) => ({ ...c, [key]: false })), 2000);
  };

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Titlu*/}
      <div
        className="flex items-center gap-3"
        style={{ padding: "16px 20px", cursor: "pointer" }}
        onClick={onToggle}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            flexShrink: 0,
            background: "var(--bg3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Cpu size={18} color="var(--primary)" />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2">
            <span style={{ fontWeight: 600, fontSize: 15 }}>{device.name}</span>
            <span
              className={`badge badge-${device.online ? "online" : "offline"}`}
            >
              <span
                className={`dot dot-${device.online ? "online" : "offline"}`}
                style={{ width: 6, height: 6 }}
              />
              {device.online ? "Online" : "Offline"}
            </span>
          </div>
          <div className="text-xs text-muted mt-0.5">
            {device.sensors?.length || 0} senzori
            {device.description ? ` · ${device.description}` : ""}
            {device.ip_address ? ` · IP: ${device.ip_address}` : ""}
          </div>
        </div>

        <div
          className="flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="btn btn-danger btn-sm btn-icon"
            onClick={onDelete}
            title="Sterge device"
          >
            <Trash2 size={14} />
          </button>
          {expanded ? (
            <ChevronUp size={18} color="var(--text3)" />
          ) : (
            <ChevronDown size={18} color="var(--text3)" />
          )}
        </div>
      </div>

      
      {expanded && (
        <div
          style={{ borderTop: "1px solid var(--border)", padding: "16px 20px" }}
        >
      
          <div
            className="card card-sm mb-4"
            style={{ background: "var(--bg3)" }}
          >
            <div
              className="text-sm font-medium mb-3"
              style={{ color: "var(--text2)" }}
            >
              Credentiale ESP32 — copiaza in firmware
            </div>
            <div className="form-group mb-2">
              <label className="label">Device ID</label>
              <div className="flex gap-2">
                <input
                  className="input"
                  readOnly
                  value={device.id}
                  style={{ fontFamily: "monospace", fontSize: 12 }}
                />
                <button
                  className="btn btn-ghost btn-sm btn-icon"
                  onClick={() => copy("id", device.id)}
                >
                  {copied.id ? (
                    <CheckCheck size={14} color="var(--success)" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="label">API Key</label>
              <div className="flex gap-2">
                <input
                  className="input"
                  readOnly
                  type={showKey ? "text" : "password"}
                  value={device.api_key}
                  style={{ fontFamily: "monospace", fontSize: 12 }}
                />
                <button
                  className="btn btn-ghost btn-sm btn-icon"
                  onClick={() => setShowKey((v) => !v)}
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  className="btn btn-ghost btn-sm btn-icon"
                  onClick={() => copy("key", device.api_key)}
                >
                  {copied.key ? (
                    <CheckCheck size={14} color="var(--success)" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* senzori configurati */}
          <div className="flex items-center justify-between mb-3">
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              Senzori configurati ({device.sensors?.length || 0})
            </span>
            <button className="btn btn-ghost btn-sm" onClick={onAddSensor}>
              <Plus size={14} /> Adauga senzor
            </button>
          </div>

          {!device.sensors || device.sensors.length === 0 ? (
            <div
              style={{
                padding: 20,
                textAlign: "center",
                color: "var(--text3)",
                fontSize: 13,
                border: "1px dashed var(--border)",
                borderRadius: 8,
              }}
            >
              Niciun senzor. Adauga unul pentru a incepe.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {device.sensors.map((sensor) => (
                <SensorRow
                  key={sensor.id}
                  sensor={sensor}
                  onDelete={() => onDeleteSensor(sensor.id, sensor.name)}
                  onAlertSettings={() => onAlertSettings(sensor)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// data ne-preucarte
function SensorRow({ sensor, onDelete, onAlertSettings }) {
  const relayConfig = sensor.relay_config
    ? typeof sensor.relay_config === "string"
      ? JSON.parse(sensor.relay_config)
      : sensor.relay_config
    : null;

  // PostgreSQL da boolean 
  const alertOn = !!sensor.alert_enabled;

  return (
    <div
      className="flex items-center gap-3"
      style={{
        padding: "10px 14px",
        background: "var(--bg3)",
        borderRadius: 8,
        border: "1px solid var(--border)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-center gap-2">
          <span style={{ fontWeight: 500, fontSize: 13 }}>{sensor.name}</span>
          <span className="badge badge-primary" style={{ fontSize: 10 }}>
            {TYPE_LABELS[sensor.type] || sensor.type}
          </span>
          {alertOn && (
            <span className="badge badge-warning" style={{ fontSize: 10 }}>
              Alert ON
            </span>
          )}
        </div>
        <div className="text-xs text-muted mt-0.5">
          GPIO {sensor.pin}
          {relayConfig ? ` · ${relayConfig.mode} · "${relayConfig.label}"` : ""}
          {alertOn && sensor.alert_min != null
            ? ` · min: ${sensor.alert_min}${sensor.unit}`
            : ""}
          {alertOn && sensor.alert_max != null
            ? ` · max: ${sensor.alert_max}${sensor.unit}`
            : ""}
        </div>
      </div>

      
      {sensor.type !== "relay" && (
        <button
          className="btn btn-ghost btn-sm btn-icon"
          onClick={onAlertSettings}
          title={
            alertOn
              ? "Alert ON — click to configure"
              : "Alert OFF — click to enable"
          }
          style={{ color: alertOn ? "var(--warning)" : "var(--text3)" }}
        >
          {alertOn ? <Bell size={13} /> : <BellOff size={13} />}
        </button>
      )}

      <button className="btn btn-danger btn-sm btn-icon" onClick={onDelete}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}


function EmptyState({ onAdd }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "60px 20px",
        color: "var(--text3)",
      }}
    >
      <Cpu size={48} style={{ margin: "0 auto 16px", opacity: 0.3 }} />
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: "var(--text2)",
          marginBottom: 8,
        }}
      >
        Niciun device
      </div>
      <div style={{ fontSize: 13, marginBottom: 20 }}>
        Adauga primul tau ESP32 pentru a incepe
      </div>
      <button className="btn btn-primary" onClick={onAdd}>
        <Plus size={16} /> Adauga device
      </button>
    </div>
  );
}
