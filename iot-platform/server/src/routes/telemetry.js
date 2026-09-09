const express = require('express');
const { queryOne, queryAll, query } = require('../db/database');
const { requireAuth, deviceAuth } = require('../middleware/auth');

const router = express.Router();

//POST /api/telemetry — ESP32 trimite date
router.post('/', deviceAuth, async (req, res) => {
  const { readings } = req.body;
  if (!Array.isArray(readings) || readings.length === 0) {
    return res.status(400).json({ error: 'readings[] required' });
  }

  try {
    const device = req.device;
    const now = new Date();

    // Un singur query pentru toti senzorii din request
    const incomingSensorIds = readings
      .filter(r => r.sensor_id !== undefined && r.value !== undefined)
      .map(r => r.sensor_id);

    if (!incomingSensorIds.length) return res.status(400).json({ error: 'no valid readings' });

    const sensorRows = await queryAll(
      'SELECT id, alert_enabled, alert_min, alert_max, name, unit FROM sensors WHERE id = ANY($1) AND device_id = $2',
      [incomingSensorIds, device.id]
    );
    const sensorMap = new Map(sensorRows.map(s => [s.id, s]));

    const values = [];
    const placeholders = [];
    let idx = 1;
    const alertInserts = [];

    for (const r of readings) {
      if (r.sensor_id === undefined || r.value === undefined) continue;
      const sensor = sensorMap.get(r.sensor_id);
      if (!sensor) continue;

      placeholders.push(`($${idx}, $${idx+1}, $${idx+2}, NOW())`);
      values.push(device.id, r.sensor_id, r.value);
      idx += 3;

      if (sensor.alert_enabled) {
        let alertMsg = null;
        if (sensor.alert_max !== null && r.value > sensor.alert_max) {
          alertMsg = `${sensor.name}: ${r.value}${sensor.unit} > max ${sensor.alert_max}${sensor.unit}`;
        } else if (sensor.alert_min !== null && r.value < sensor.alert_min) {
          alertMsg = `${sensor.name}: ${r.value}${sensor.unit} < min ${sensor.alert_min}${sensor.unit}`;
        }
        if (alertMsg) alertInserts.push([device.id, r.sensor_id, r.value, alertMsg]);
      }
    }

    // Alerte in paralel cu insert-ul principal
    await Promise.all([
      placeholders.length > 0
        ? query(`INSERT INTO telemetry (device_id, sensor_id, value, recorded_at) VALUES ${placeholders.join(',')}`, values)
        : Promise.resolve(),
      ...alertInserts.map(([did, sid, val, msg]) =>
        queryOne('INSERT INTO alerts (device_id, sensor_id, value, message) VALUES ($1,$2,$3,$4)', [did, sid, val, msg])
      ),
    ]);

    // Returneaza comenzi relay curente (ESP32 le aplica)
    const relayCommands = await queryAll(
      `SELECT s.id as sensor_id, rs.state, rs.percent
       FROM sensors s
       JOIN relay_state rs ON rs.sensor_id = s.id
       WHERE s.device_id = $1 AND s.type = 'relay'`,
      [device.id]
    );

    res.json({
      success: true,
      commands: relayCommands.map(r => ({
        sensor_id: r.sensor_id,
        command: { state: r.state, percent: r.percent },
      })),
    });
  } catch (err) {
    console.error('[Telemetry] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/telemetry/:deviceId — date istorice cu agregari si gap detection ─
// Query params:
//   interval = 1h | 6h | 24h | 7d | 30d | 1y | custom
//   from, to  = ISO timestamps (pentru custom)
//   sensorId  = filtreaza un senzor
//   granularity = auto | minute | hour | day | month
router.get('/:deviceId', requireAuth, async (req, res) => {
  try {
    // Verifica ownership
    const device = await queryOne(
      'SELECT id FROM devices WHERE id=$1 AND user_id=$2',
      [req.params.deviceId, req.user.id]
    );
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const { interval = '24h', from, to, sensorId, granularity: gran } = req.query;

    // Calculeaza intervalul de timp
    let fromDate, toDate;
    if (from && to) {
      fromDate = new Date(from);
      toDate   = new Date(to);
    } else {
      toDate   = new Date();
      fromDate = new Date();
      const intervalMap = {
        '1h':  1  * 60 * 60 * 1000,
        '6h':  6  * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d':  7  * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
        '1y':  365* 24 * 60 * 60 * 1000,
      };
      fromDate.setTime(toDate.getTime() - (intervalMap[interval] || intervalMap['24h']));
    }

    // Alege granularitatea in functie de interval
    const diffHours = (toDate - fromDate) / (1000 * 60 * 60);
    let truncUnit;
    if      (gran === 'minute' || diffHours <= 2)    truncUnit = 'minute';
    else if (gran === 'hour'   || diffHours <= 72)   truncUnit = 'hour';
    else if (gran === 'day'    || diffHours <= 744)  truncUnit = 'day';
    else                                              truncUnit = 'month';

    const sensorFilter = sensorId ? 'AND t.sensor_id = $4' : '';
    const params = [device.id, fromDate.toISOString(), toDate.toISOString()];
    if (sensorId) params.push(sensorId);

    // Agregare cu AVG/MIN/MAX per bucket de timp
    const rows = await queryAll(
      `SELECT
         s.id         AS sensor_id,
         s.name       AS sensor_name,
         s.type       AS sensor_type,
         s.unit       AS unit,
         s.missing_data_threshold_minutes,
         DATE_TRUNC($1, t.recorded_at) AS bucket,
         AVG(t.value)   AS avg_value,
         MIN(t.value)   AS min_value,
         MAX(t.value)   AS max_value,
         COUNT(*)       AS reading_count,
         MIN(t.recorded_at) AS first_in_bucket,
         MAX(t.recorded_at) AS last_in_bucket
       FROM telemetry t
       JOIN sensors s ON s.id = t.sensor_id
       WHERE t.device_id = $2
         AND t.recorded_at >= $3::timestamptz
         AND t.recorded_at <= $4::timestamptz
         ${sensorId ? 'AND t.sensor_id = $5' : ''}
       GROUP BY s.id, s.name, s.type, s.unit, s.missing_data_threshold_minutes, bucket
       ORDER BY s.id, bucket ASC`,
      [truncUnit, device.id, fromDate.toISOString(), toDate.toISOString(), ...(sensorId ? [sensorId] : [])]
    );

    // Obtine threshold-ul global
    const globalThresholdMin = parseInt(process.env.MISSING_DATA_THRESHOLD_MINUTES || '10');

    // Grupeaza pe sensor si injecteaza gap-uri
    const bySensor = {};
    for (const row of rows) {
      if (!bySensor[row.sensor_id]) {
        bySensor[row.sensor_id] = {
          sensor_id:   row.sensor_id,
          sensor_name: row.sensor_name,
          sensor_type: row.sensor_type,
          unit:        row.unit,
          data:        [],
        };
      }
      bySensor[row.sensor_id].data.push({
        bucket:        row.bucket,
        avg:           parseFloat(row.avg_value).toFixed(2),
        min:           parseFloat(row.min_value).toFixed(2),
        max:           parseFloat(row.max_value).toFixed(2),
        count:         parseInt(row.reading_count),
        last_in_bucket: row.last_in_bucket,
      });
    }

    // Injecteaza null-uri pentru gap-uri (missing data)
    const result = Object.values(bySensor).map(sensor => {
      const threshold = parseInt(
        rows.find(r => r.sensor_id === sensor.sensor_id)?.missing_data_threshold_minutes
        || globalThresholdMin
      );
      const thresholdMs = threshold * 60 * 1000;
      const dataWithGaps = [];

      for (let i = 0; i < sensor.data.length; i++) {
        const curr = sensor.data[i];
        const prev = sensor.data[i - 1];

        if (prev) {
          const gap = new Date(curr.bucket) - new Date(prev.last_in_bucket);
          if (gap > thresholdMs) {
            // Injecteaza un punct null - graficul va rupe linia
            dataWithGaps.push({
              bucket:     new Date(new Date(prev.last_in_bucket).getTime() + 1000).toISOString(),
              avg:        null,
              min:        null,
              max:        null,
              count:      0,
              is_gap:     true,
              gap_minutes: Math.round(gap / 60000),
            });
          }
        }
        dataWithGaps.push(curr);
      }

      return { ...sensor, data: dataWithGaps };
    });

    res.json({
      device_id:   device.id,
      from:        fromDate.toISOString(),
      to:          toDate.toISOString(),
      interval,
      granularity: truncUnit,
      sensors:     result,
    });
  } catch (err) {
    console.error('[Telemetry GET] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

//GET /api/telemetry/:deviceId/latest — ultima valoare per senzor
router.get('/:deviceId/latest', requireAuth, async (req, res) => {
  try {
    const device = await queryOne(
      'SELECT id FROM devices WHERE id=$1 AND user_id=$2',
      [req.params.deviceId, req.user.id]
    );
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const rows = await queryAll(
      `SELECT DISTINCT ON (t.sensor_id)
         t.sensor_id, t.value, t.recorded_at,
         s.name, s.unit, s.type
       FROM telemetry t
       JOIN sensors s ON s.id = t.sensor_id
       WHERE t.device_id = $1
       ORDER BY t.sensor_id, t.recorded_at DESC`,
      [device.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//GET /api/telemetry/:deviceId/stats — statistici generale
// Avg/min/max per ora, zi, luna, an pentru un senzor
router.get('/:deviceId/stats/:sensorId', requireAuth, async (req, res) => {
  try {
    const device = await queryOne(
      'SELECT id FROM devices WHERE id=$1 AND user_id=$2',
      [req.params.deviceId, req.user.id]
    );
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const stats = await queryAll(
      `SELECT
         'hour'  AS period,
         DATE_TRUNC('hour',  recorded_at) AS bucket,
         ROUND(AVG(value)::numeric, 2)    AS avg,
         ROUND(MIN(value)::numeric, 2)    AS min,
         ROUND(MAX(value)::numeric, 2)    AS max,
         COUNT(*)                         AS count
       FROM telemetry
       WHERE sensor_id = $1
         AND device_id = $2
         AND recorded_at >= NOW() - INTERVAL '7 days'
       GROUP BY bucket
       UNION ALL
       SELECT
         'day',
         DATE_TRUNC('day',   recorded_at),
         ROUND(AVG(value)::numeric, 2),
         ROUND(MIN(value)::numeric, 2),
         ROUND(MAX(value)::numeric, 2),
         COUNT(*)
       FROM telemetry
       WHERE sensor_id = $1
         AND device_id = $2
         AND recorded_at >= NOW() - INTERVAL '1 year'
       GROUP BY bucket
       UNION ALL
       SELECT
         'month',
         DATE_TRUNC('month', recorded_at),
         ROUND(AVG(value)::numeric, 2),
         ROUND(MIN(value)::numeric, 2),
         ROUND(MAX(value)::numeric, 2),
         COUNT(*)
       FROM telemetry
       WHERE sensor_id = $1 AND device_id = $2
       GROUP BY bucket
       UNION ALL
       SELECT
         'year',
         DATE_TRUNC('year',  recorded_at),
         ROUND(AVG(value)::numeric, 2),
         ROUND(MIN(value)::numeric, 2),
         ROUND(MAX(value)::numeric, 2),
         COUNT(*)
       FROM telemetry
       WHERE sensor_id = $1 AND device_id = $2
       GROUP BY bucket
       ORDER BY period, bucket DESC`,
      [req.params.sensorId, device.id]
    );

    // Grupeaza pe period
    const grouped = { hour: [], day: [], month: [], year: [] };
    for (const row of stats) grouped[row.period]?.push(row);

    res.json(grouped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
