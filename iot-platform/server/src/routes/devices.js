const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { queryOne, queryAll } = require("../db/database");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

//GET /api/devices/:id/config FARA JWT doar X-API-Key (ESP32)
// aceasta ruta trebuie definita PRIMA inainte de router.use(requireAuth)
router.get("/:id/config", async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"];

    let device;
    if (apiKey) {
      // ESP32 trimite X-API-Key
      device = await queryOne("SELECT * FROM devices WHERE api_key = $1", [
        apiKey,
      ]);
      if (!device) return res.status(401).json({ error: "API key invalid" });
    } else {
      // Browser/client trimite JWT
      const authHeader = req.headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res
          .status(401)
          .json({ error: "Auth required: X-API-Key sau Bearer token" });
      }
      const jwt = require("jsonwebtoken");
      const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
      device = await queryOne(
        "SELECT * FROM devices WHERE id = $1 AND user_id = $2",
        [req.params.id, decoded.id],
      );
      if (!device) return res.status(404).json({ error: "Device not found" });
    }

    const sensors = await queryAll(
      "SELECT * FROM sensors WHERE device_id = $1 ORDER BY created_at ASC",
      [device.id],
    );

    res.json({
      device_id: device.id,
      device_name: device.name,
      server_url: `http://${process.env.SERVER_HOST || "localhost"}:${process.env.PORT || 3001}`,
      telemetry_interval_ms: 5000,
      sensors: sensors.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        pin: s.pin,
        unit: s.unit,
        relay_config: s.relay_config || null,
      })),
    });
  } catch (err) {
    console.error("[Config]", err.message);
    res.status(500).json({ error: err.message });
  }
});

//Toate rutele de mai jos cer JWT
router.use(requireAuth);

//GET /api/devices
router.get("/", async (req, res) => {
  try {
    const devices = await queryAll(
      `SELECT d.*, COUNT(s.id) AS sensor_count
       FROM devices d
       LEFT JOIN sensors s ON s.device_id = d.id
       WHERE d.user_id = $1
       GROUP BY d.id
       ORDER BY d.created_at DESC`,
      [req.user.id],
    );

    const result = await Promise.all(
      devices.map(async (device) => {
        const sensors = await queryAll(
          `SELECT s.*, rs.state, rs.percent, rs.updated_at AS relay_updated_at
         FROM sensors s
         LEFT JOIN relay_state rs ON rs.sensor_id = s.id
         WHERE s.device_id = $1
         ORDER BY s.created_at ASC`,
          [device.id],
        );
        return { ...device, sensors };
      }),
    );

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

//GET /api/devices/:id
router.get("/:id", async (req, res) => {
  try {
    const device = await queryOne(
      "SELECT * FROM devices WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id],
    );
    if (!device) return res.status(404).json({ error: "Device not found" });

    const sensors = await queryAll(
      `SELECT s.*, rs.state, rs.percent
       FROM sensors s
       LEFT JOIN relay_state rs ON rs.sensor_id = s.id
       WHERE s.device_id = $1 ORDER BY s.created_at ASC`,
      [device.id],
    );
    res.json({ ...device, sensors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//POST /api/devices
router.post("/", async (req, res) => {
  const { name, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Name is required" });

  try {
    const apiKey = "iot_" + uuidv4().replace(/-/g, "");
    const device = await queryOne(
      `INSERT INTO devices (user_id, name, description, api_key)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, name.trim(), description || "", apiKey],
    );
    res.status(201).json(device);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//PUT /api/devices/:id 
router.put("/:id", async (req, res) => {
  const { name, description } = req.body;
  try {
    const device = await queryOne(
      `UPDATE devices SET name=$1, description=$2
       WHERE id=$3 AND user_id=$4 RETURNING *`,
      [name, description || "", req.params.id, req.user.id],
    );
    if (!device) return res.status(404).json({ error: "Device not found" });
    res.json(device);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//DELETE /api/devices/:id 
router.delete("/:id", async (req, res) => {
  try {
    const result = await queryOne(
      "DELETE FROM devices WHERE id=$1 AND user_id=$2 RETURNING id",
      [req.params.id, req.user.id],
    );
    if (!result) return res.status(404).json({ error: "Device not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//POST /api/devices/:id/sensors 
router.post("/:id/sensors", async (req, res) => {
  try {
    const device = await queryOne(
      "SELECT id FROM devices WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id],
    );
    if (!device) return res.status(404).json({ error: "Device not found" });

    const {
      name,
      type,
      pin,
      unit,
      relay_config,
      alert_enabled,
      alert_min,
      alert_max,
      missing_data_threshold_minutes,
    } = req.body;

    if (!name || !type || pin === undefined) {
      return res
        .status(400)
        .json({ error: "name, type si pin sunt obligatorii" });
    }

    const VALID = ["dht11_temp", "dht11_humidity", "flame", "relay"];
    if (!VALID.includes(type)) {
      return res
        .status(400)
        .json({ error: `Tip invalid. Valori: ${VALID.join(", ")}` });
    }

    const sensor = await queryOne(
      `INSERT INTO sensors
         (device_id, name, type, pin, unit, relay_config,
          alert_enabled, alert_min, alert_max, missing_data_threshold_minutes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        req.params.id,
        name,
        type,
        pin,
        unit || getDefaultUnit(type),
        relay_config ? JSON.stringify(relay_config) : null,
        alert_enabled || false,
        alert_min ?? null,
        alert_max ?? null,
        missing_data_threshold_minutes ?? null,
      ],
    );

    if (type === "relay") {
      await queryOne(
        "INSERT INTO relay_state (sensor_id, state, percent) VALUES ($1, 0, 0)",
        [sensor.id],
      );
    }

    res.status(201).json(sensor);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//PUT /api/devices/:id/sensors/:sensorId
router.put("/:id/sensors/:sensorId", async (req, res) => {
  try {
    const sensor = await queryOne(
      `SELECT s.* FROM sensors s
       JOIN devices d ON d.id = s.device_id
       WHERE s.id = $1 AND d.id = $2 AND d.user_id = $3`,
      [req.params.sensorId, req.params.id, req.user.id],
    );
    if (!sensor) return res.status(404).json({ error: "Sensor not found" });

    const {
      name,
      pin,
      unit,
      relay_config,
      alert_enabled,
      alert_min,
      alert_max,
      missing_data_threshold_minutes,
    } = req.body;

    const updated = await queryOne(
      `UPDATE sensors SET
         name=$1, pin=$2, unit=$3, relay_config=$4,
         alert_enabled=$5, alert_min=$6, alert_max=$7,
         missing_data_threshold_minutes=$8
       WHERE id=$9 RETURNING *`,
      [
        name ?? sensor.name,
        pin ?? sensor.pin,
        unit ?? sensor.unit,
        relay_config ? JSON.stringify(relay_config) : sensor.relay_config,
        alert_enabled !== undefined ? alert_enabled : sensor.alert_enabled,
        alert_min ?? sensor.alert_min,
        alert_max ?? sensor.alert_max,
        missing_data_threshold_minutes ?? sensor.missing_data_threshold_minutes,
        req.params.sensorId,
      ],
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//DELETE /api/devices/:id/sensors/:sensorId
router.delete("/:id/sensors/:sensorId", async (req, res) => {
  try {
    await queryOne(
      `DELETE FROM sensors USING devices
       WHERE sensors.id = $1
         AND sensors.device_id = devices.id
         AND devices.id = $2
         AND devices.user_id = $3`,
      [req.params.sensorId, req.params.id, req.user.id],
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function getDefaultUnit(type) {
  return (
    { dht11_temp: "°C", dht11_humidity: "%", flame: "bool", relay: "bool" }[
      type
    ] || ""
  );
}

module.exports = router;
