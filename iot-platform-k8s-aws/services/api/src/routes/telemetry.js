const express = require('express');
const { queryOne, queryAll } = require('../lib/database');
const { requireAuth, deviceAuth } = require('../middleware/auth');
const { publishTelemetry }  = require('../lib/kafka');
const { getLatestValue, getRelayCommandsForDevice, cacheSensors, getCachedSensors } = require('../lib/redis');

const router = express.Router();

//POST /api/telemetry — ESP32 trimite date → Kafka → raspuns instant
router.post('/', deviceAuth, async (req, res) => {
  const { readings } = req.body;
  if (!Array.isArray(readings) || !readings.length)
    return res.status(400).json({ error: 'readings[] required' });
  try {
    const device = req.device;

    // Cache sensor list per device  elimina 2 DB queries per request
    let allSensors = await getCachedSensors(device.id);
    if (!allSensors) {
      allSensors = await queryAll(`SELECT id, type FROM sensors WHERE device_id=$1`, [device.id]);
      cacheSensors(device.id, allSensors, 60).catch(() => {});
    }

    const validSet = new Set(allSensors.map(s => s.id));
    const validReadings = readings.filter(r => r.sensor_id && validSet.has(r.sensor_id));
    if (!validReadings.length) return res.status(400).json({ error: 'No valid sensor readings' });

    // Fire-and-forget nu asteptam Kafka raspundem instant
    publishTelemetry(device.id, device.user_id, validReadings).catch(err =>
      console.error('[Kafka] publish error:', err.message)
    );

    const relayIds = allSensors.filter(s => s.type === 'relay').map(s => s.id);
    const commands = await getRelayCommandsForDevice(relayIds);

    res.json({
      success: true,
      commands: commands.map(c => ({
        sensor_id: c.sensor_id,
        command: { state: c.state, percent: c.percent },
      })),
    });
  } catch(err) {
    console.error('[Telemetry POST]', err.message);
    res.status(500).json({ error: err.message });
  }
});

//GET /api/telemetry/:deviceId  date istorice din TimescaleDB
router.get('/:deviceId', requireAuth, async (req, res) => {
  try {
    const device = await queryOne(
      'SELECT id FROM devices WHERE id=$1 AND user_id=$2',
      [req.params.deviceId, req.user.id]);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const { interval='24h', from, to, sensorId, granularity:gran } = req.query;
    let fromDate, toDate;
    if (from && to) { fromDate = new Date(from); toDate = new Date(to); }
    else {
      toDate = new Date(); fromDate = new Date();
      const ms = {'1h':3600000,'6h':21600000,'24h':86400000,'7d':604800000,'30d':2592000000,'1y':31536000000};
      fromDate.setTime(toDate.getTime() - (ms[interval]||ms['24h']));
    }

    const diffH = (toDate - fromDate) / 3600000;
    let trunc = diffH<=2?'minute': diffH<=72?'hour': diffH<=744?'day':'month';
    if (gran && ['minute','hour','day','month'].includes(gran)) trunc = gran;

    const params = [trunc+'s', device.id, fromDate.toISOString(), toDate.toISOString()];
    if (sensorId) params.push(sensorId);

    const rows = await queryAll(
      `SELECT s.id AS sensor_id, s.name AS sensor_name, s.type AS sensor_type,
         s.unit, s.missing_data_threshold_minutes,
         DATE_TRUNC($1, t.recorded_at) AS bucket,
         AVG(t.value)::numeric(10,2) AS avg_value,
         MIN(t.value)::numeric(10,2) AS min_value,
         MAX(t.value)::numeric(10,2) AS max_value,
         COUNT(*) AS reading_count,
         MAX(t.recorded_at) AS last_in_bucket
       FROM telemetry t JOIN sensors s ON s.id=t.sensor_id
       WHERE t.device_id=$2 AND t.recorded_at>=$3::timestamptz AND t.recorded_at<=$4::timestamptz
         ${sensorId ? 'AND t.sensor_id=$5' : ''}
       GROUP BY s.id, s.name, s.type, s.unit, s.missing_data_threshold_minutes, bucket
       ORDER BY s.id, bucket ASC`,
      params);

    const globalThreshold = parseInt(process.env.MISSING_DATA_THRESHOLD_MINUTES||'10');
    const bySensor = {};
    for (const row of rows) {
      if (!bySensor[row.sensor_id]) {
        bySensor[row.sensor_id] = { sensor_id:row.sensor_id, sensor_name:row.sensor_name,
          sensor_type:row.sensor_type, unit:row.unit, data:[] };
      }
      bySensor[row.sensor_id].data.push({
        bucket: row.bucket,
        avg: parseFloat(row.avg_value), min: parseFloat(row.min_value), max: parseFloat(row.max_value),
        count: parseInt(row.reading_count), last_in_bucket: row.last_in_bucket,
      });
    }

    const result = Object.values(bySensor).map(sensor => {
      const threshold = (parseInt(rows.find(r=>r.sensor_id===sensor.sensor_id)?.missing_data_threshold_minutes) || globalThreshold) * 60000;
      const data = [];
      sensor.data.forEach((curr, i) => {
        const prev = sensor.data[i-1];
        if (prev) {
          const gap = new Date(curr.bucket) - new Date(prev.last_in_bucket);
          if (gap > threshold) data.push({ bucket: new Date(new Date(prev.last_in_bucket).getTime()+1000).toISOString(),
            avg:null, min:null, max:null, count:0, is_gap:true, gap_minutes:Math.round(gap/60000) });
        }
        data.push(curr);
      });
      return { ...sensor, data };
    });

    res.json({ device_id:device.id, from:fromDate, to:toDate, interval, granularity:trunc, sensors:result });
  } catch(err) { console.error('[Telemetry GET]', err); res.status(500).json({ error: err.message }); }
});

//GET /api/telemetry/:deviceId/latest  din Redis (fara DB)
router.get('/:deviceId/latest', requireAuth, async (req, res) => {
  try {
    const device = await queryOne(
      'SELECT id FROM devices WHERE id=$1 AND user_id=$2',
      [req.params.deviceId, req.user.id]);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    const sensors = await queryAll(
      'SELECT id, name, unit, type FROM sensors WHERE device_id=$1', [device.id]);
    const result = await Promise.all(sensors.map(async s => {
      const latest = await getLatestValue(s.id);
      return { sensor_id:s.id, name:s.name, unit:s.unit, type:s.type,
        value:latest?.value??null, recorded_at:latest?.recorded_at??null };
    }));
    res.json(result.filter(r => r.value !== null));
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// GET /api/telemetry/:deviceId/stats/:sensorId
router.get('/:deviceId/stats/:sensorId', requireAuth, async (req, res) => {
  try {
    const device = await queryOne(
      'SELECT id FROM devices WHERE id=$1 AND user_id=$2',
      [req.params.deviceId, req.user.id]);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    const stats = await queryAll(
      `SELECT 'hour' AS period, DATE_TRUNC('hour',recorded_at) AS bucket,
         ROUND(AVG(value)::numeric,2) avg, ROUND(MIN(value)::numeric,2) min,
         ROUND(MAX(value)::numeric,2) max, COUNT(*) count
       FROM telemetry WHERE sensor_id=$1 AND device_id=$2 AND recorded_at>=NOW()-INTERVAL '7 days' GROUP BY bucket
       UNION ALL
       SELECT 'day', DATE_TRUNC('day',recorded_at),
         ROUND(AVG(value)::numeric,2), ROUND(MIN(value)::numeric,2), ROUND(MAX(value)::numeric,2), COUNT(*)
       FROM telemetry WHERE sensor_id=$1 AND device_id=$2 AND recorded_at>=NOW()-INTERVAL '1 year' GROUP BY bucket
       UNION ALL
       SELECT 'month', DATE_TRUNC('month',recorded_at),
         ROUND(AVG(value)::numeric,2), ROUND(MIN(value)::numeric,2), ROUND(MAX(value)::numeric,2), COUNT(*)
       FROM telemetry WHERE sensor_id=$1 AND device_id=$2 GROUP BY bucket
       ORDER BY period, bucket DESC`,
      [req.params.sensorId, device.id]);
    const grouped = { hour:[], day:[], month:[] };
    for (const row of stats) grouped[row.period]?.push(row);
    res.json(grouped);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
