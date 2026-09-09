require('dotenv').config();
const { Kafka } = require('kafkajs');
const { Pool }  = require('pg');
const Redis     = require('ioredis');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const redis = new Redis({ host:process.env.REDIS_HOST||'redis', port:parseInt(process.env.REDIS_PORT||'6379'),
  password:process.env.REDIS_PASSWORD||undefined, retryStrategy:t=>Math.min(t*200,5000) });
const kafka = new Kafka({ clientId:'worker-alerts', brokers:(process.env.KAFKA_BROKERS||'kafka:9092').split(','),
  retry:{initialRetryTime:500,retries:10} });
const consumer = kafka.consumer({ groupId:'worker-alerts-group', sessionTimeout:30000, heartbeatInterval:3000 });

const sensorCache = new Map();
async function getSensorConfig(sensorId) {
  const cached = sensorCache.get(sensorId);
  if (cached && Date.now()-cached.ts < 60000) return cached.data;
  const r = await pool.query(
    `SELECT id,name,unit,type,alert_enabled,alert_min,alert_max,COALESCE(alert_cooldown_minutes,10) AS cooldown_minutes
     FROM sensors WHERE id=$1`, [sensorId]);
  const data = r.rows[0]||null;
  sensorCache.set(sensorId, { data, ts:Date.now() });
  return data;
}

async function checkCooldown(sensorId, minutes) {
  const key = `alert:cooldown:${sensorId}`;
  const inCooldown = await redis.exists(key);
  if (!inCooldown) { await redis.setex(key, minutes*60, '1'); return false; }
  return true;
}

async function processMessage(deviceId, readings) {
  for (const r of readings) {
    const sensor = await getSensorConfig(r.sensor_id);
    if (!sensor || !sensor.alert_enabled) continue;
    let alertMsg = null;
    if (sensor.type==='flame' && Number(r.value)===1) alertMsg = `${sensor.name}: FIRE DETECTED!`;
    else if (sensor.type!=='flame') {
      if (sensor.alert_max!==null && Number(r.value)>Number(sensor.alert_max))
        alertMsg = `${sensor.name}: ${r.value}${sensor.unit} > max ${sensor.alert_max}${sensor.unit}`;
      else if (sensor.alert_min!==null && Number(r.value)<Number(sensor.alert_min))
        alertMsg = `${sensor.name}: ${r.value}${sensor.unit} < min ${sensor.alert_min}${sensor.unit}`;
    }
    if (!alertMsg) continue;
    if (await checkCooldown(r.sensor_id, sensor.cooldown_minutes)) continue;
    await pool.query(
      `INSERT INTO alerts(device_id,sensor_id,value,message) VALUES($1,$2,$3,$4)`,
      [deviceId, r.sensor_id, r.value, alertMsg]);
    console.log(`[Alerts] ${alertMsg}`);
  }
}

async function run() {
  console.log('[Worker Alerts] Starting...');
  await consumer.connect();
  await consumer.subscribe({ topics:['iot.telemetry'], fromBeginning:false });
  console.log('[Worker Alerts] Consuming iot.telemetry...');
  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const { device_id, readings } = JSON.parse(message.value.toString());
        await processMessage(device_id, readings);
      } catch(err) { console.error('[Alerts] Error:', err.message); }
    },
  });
}

run().catch(err => { console.error('[Worker Alerts] Fatal:', err.message); process.exit(1); });
process.on('SIGTERM', async () => { await consumer.disconnect(); await pool.end(); redis.disconnect(); process.exit(0); });
