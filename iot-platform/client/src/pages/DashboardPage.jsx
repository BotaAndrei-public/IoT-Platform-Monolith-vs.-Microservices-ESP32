import { useState, useEffect, useCallback, useRef } from "react";
import { Cpu, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { useRealtimeData } from "../hooks/useRealtimeData";
import { SensorCard } from "../components/SensorCard";
import { SensorChart } from "../components/SensorChart";

const CHART_COLORS = [
  "#6c7fff",
  "#f87171",
  "#4ade80",
  "#fbbf24",
  "#fb923c",
  "#a78bfa",
  "#60a5fa",
  "#34d399",
];

export default function DashboardPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [interval_, setInterval_] = useState("24h");
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const alertsShown = useRef(new Set());

  //callback-ul  cand  vin datele noi din polling
  const onNewReadings = useCallback((readings) => {
    setTelemetry((prev) => {
      if (!prev) return prev;
      const now = new Date().toISOString();
      const sensors = prev.sensors.map((s) => {
        const r = readings.find((x) => x.sensor_id === s.sensor_id);
        if (!r) return s;
        const newPoint = {
          bucket: now,
          avg: parseFloat(r.value).toFixed(2),
          min: parseFloat(r.value).toFixed(2),
          max: parseFloat(r.value).toFixed(2),
          count: 1,
        };
        return { ...s, data: [...(s.data || []).slice(-300), newPoint] };
      });
      return { ...prev, sensors };
    });
  }, []);

  const onAlert = useCallback(
    (alert) => {
      if (alertsShown.current.has(alert.id)) return;
      alertsShown.current.add(alert.id);
      toast(`🔴 ${alert.message}`, "danger", 8000);
    },
    [toast],
  );

  const { latestValues, setLatestValues } = useRealtimeData({
    user,
    selectedDeviceId,
    onNewReadings,
    onAlert,
  });

  // incarac dispozitivele
  useEffect(() => {
    api
      .getDevices()
      .then((devs) => {
        setDevices(devs);
        if (devs.length > 0) setSelectedDeviceId(devs[0].id);
      })
      .catch((e) => toast("Eroare: " + e.message, "danger"))
      .finally(() => setLoading(false));
  }, []);

  //Pimeste datele sitorice pt. graf.
  useEffect(() => {
    if (!selectedDeviceId) return;
    loadChartData(selectedDeviceId, interval_);
  }, [selectedDeviceId, interval_]);

  const loadChartData = async (deviceId, iv) => {
    setChartLoading(true);
    try {
      const [latest, tel] = await Promise.all([
        api.getLatest(deviceId),
        api.getTelemetry(deviceId, { interval: iv }),
      ]);
      const lv = {};
      latest.forEach((r) => {
        lv[r.sensor_id] = r;
      });
      setLatestValues(lv);
      setTelemetry(tel);
    } catch (e) {
      toast("Eroare date: " + e.message, "danger");
    } finally {
      setChartLoading(false);
    }
  };

  const handleRelayToggle = async (sensorId, body) => {
    try {
      await api.setRelay(sensorId, body);
    } catch (e) {
      toast("Eroare relay: " + e.message, "danger");
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center" style={{ height: 300 }}>
        <span className="spinner" style={{ width: 36, height: 36 }} />
      </div>
    );

  if (devices.length === 0)
    return (
      <div
        style={{
          textAlign: "center",
          padding: "80px 20px",
          color: "var(--text3)",
        }}
      >
        <Cpu size={52} style={{ margin: "0 auto 16px", opacity: 0.2 }} />
        <div style={{ fontSize: 16, color: "var(--text2)", marginBottom: 8 }}>
          Niciun device
        </div>
        <div style={{ fontSize: 13 }}>Adauga un ESP32 din pagina Devices</div>
      </div>
    );

  const device = devices.find((d) => d.id === selectedDeviceId);
  const sensors = device?.sensors || [];
  const nonRelays = sensors.filter((s) => s.type !== "relay");

  return (
    <div>
      {/* Tiltu */}
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: 24 }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Dashboard</h1>
          <p className="text-muted text-sm" style={{ marginTop: 2 }}>
            Bun venit, {user?.name?.split(" ")[0]} 👋
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            style={{
              padding: "4px 10px",
              borderRadius: 20,
              fontSize: 11,
              background: "var(--bg3)",
              border: "1px solid var(--border)",
              color: "var(--text3)",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <span className="dot dot-online" style={{ width: 6, height: 6 }} />
            Live · 3s
          </div>

          {devices.length > 1 && (
            <select
              className="select"
              style={{ width: "auto", minWidth: 180 }}
              value={selectedDeviceId || ""}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
            >
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.online ? "●" : "○"}
                </option>
              ))}
            </select>
          )}
          <button
            className="btn btn-ghost btn-sm btn-icon"
            onClick={() => loadChartData(selectedDeviceId, interval_)}
            title="Refresh manual"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/*status dispozitiv*/}
      {device && (
        <div
          className="card"
          style={{
            padding: "10px 18px",
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div className={`dot dot-${device.online ? "online" : "offline"}`} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>{device.name}</span>
          {device.description && (
            <span className="text-sm text-muted">{device.description}</span>
          )}
          {device.ip_address && (
            <span
              className="badge badge-primary"
              style={{ marginLeft: "auto" }}
            >
              IP: {device.ip_address}
            </span>
          )}
          {device.last_seen && (
            <span className="text-xs text-muted">
              Ultima data:{" "}
              {new Date(device.last_seen).toLocaleTimeString("ro-RO")}
            </span>
          )}
        </div>
      )}

      {sensors.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: 40,
            color: "var(--text3)",
            fontSize: 13,
          }}
        >
          Device-ul nu are senzori. Adauga din pagina Devices.
        </div>
      ) : (
        <>
          {/* senzor */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
              gap: 14,
              marginBottom: 32,
            }}
          >
            {sensors.map((sensor) => (
              <SensorCard
                key={sensor.id}
                sensor={sensor}
                latestValue={latestValues[sensor.id]}
                onRelayToggle={handleRelayToggle}
              />
            ))}
          </div>

          {/* grafuri */}
          {nonRelays.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(480px, 1fr))",
                gap: 20,
              }}
            >
              {(
                telemetry?.sensors ||
                nonRelays.map((s) => ({
                  sensor_id: s.id,
                  sensor_name: s.name,
                  sensor_type: s.type,
                  unit: s.unit,
                  data: [],
                }))
              )
                .filter((s) => s.sensor_type !== "relay")
                .map((sData, i) => (
                  <SensorChart
                    key={sData.sensor_id}
                    sensorData={{
                      ...sData,
                      granularity: telemetry?.granularity,
                    }}
                    color={CHART_COLORS[i % CHART_COLORS.length]}
                    interval={interval_}
                    loading={chartLoading}
                    onIntervalChange={(iv) => setInterval_(iv)}
                  />
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
