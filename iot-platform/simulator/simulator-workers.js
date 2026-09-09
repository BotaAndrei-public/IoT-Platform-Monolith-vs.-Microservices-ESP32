'use strict';

const fs = require('fs');
const path = require('path');
const autocannon = require('autocannon');

const DEVICES_FILE = process.env.DEVICES_FILE || path.resolve(process.cwd(), 'lista_boti.txt');
const TARGET_ORIGIN = process.env.TARGET_ORIGIN || 'http://localhost:3001';
const TARGET_PATH = process.env.TARGET_PATH || '/api/benchmark/echo'; // /api/telemetry  /api/benchmark/echo

const CONNECTIONS = parseInt(process.env.CONNECTIONS || '500', 10);
const WORKERS = parseInt(process.env.WORKERS || '2', 10);
const DURATION = process.env.DURATION || '60s';
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || '30', 10);

const DEVICE_FROM = parseInt(process.env.DEVICE_FROM || '1', 10);
const DEVICE_TO_RAW = process.env.DEVICE_TO || '';
const DEVICE_TO = DEVICE_TO_RAW === '' ? Infinity : parseInt(DEVICE_TO_RAW, 10);
const DEVICE_LIMIT = parseInt(process.env.DEVICE_LIMIT || '500', 10);

function extractBotIndex(name) {
  const m = String(name || '').match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

function loadDevices(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const map = new Map();

  for (const line of lines) {
    if (!line.includes('|')) continue;
    const lower = line.toLowerCase();
    if (lower.includes('device_id') || lower.includes('---')) continue;

    const parts = line.split('|').map(s => s.trim());
    if (parts.length < 5) continue;

    const [deviceId, deviceName, apiKey, sensorId, sensorName] = parts;
    if (!deviceId || !deviceName || !apiKey || !sensorId || !sensorName) continue;

    if (!map.has(deviceId)) {
      map.set(deviceId, { deviceId, deviceName, apiKey, botIndex: extractBotIndex(deviceName), sensors: [] });
    }

    const dev = map.get(deviceId);
    if (!dev.sensors.some(s => s.sensorId === sensorId)) {
      dev.sensors.push({ sensorId, sensorName });
    }
  }

  const devices = Array.from(map.values())
    .filter(d => Number.isFinite(d.botIndex))
    .sort((a, b) => a.botIndex - b.botIndex)
    .filter(d => d.botIndex >= DEVICE_FROM && d.botIndex <= DEVICE_TO)
    .slice(0, DEVICE_LIMIT);

  return devices;
}

function valueForSensor(sensorName, idx) {
  const now = Date.now();
  const s = String(sensorName || '').toLowerCase();
  if (s.includes('foc')) return Math.random() < 0.02 ? 1 : 0;
  if (s.includes('temp')) return Number((22 + Math.sin(now / 60000) * 5 + (Math.random() - 0.5)).toFixed(1));
  if (s.includes('um')) return Number((45 + Math.cos(now / 90000) * 10).toFixed(0));
  return Number((20 + Math.sin((now + idx * 1000) / 15000) * 10 + Math.random()).toFixed(2));
}

const devices = loadDevices(DEVICES_FILE);

if (!devices.length) {
  console.error(`Nu am găsit device-uri valide în: ${DEVICES_FILE}`);
  process.exit(1);
}

// Pre-genereaza requests pentru fiecare device — compatibil cu workers
const requests = devices.map(device => ({
  method: 'POST',
  path: TARGET_PATH,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': device.apiKey,
  },
  body: JSON.stringify({
    readings: device.sensors.map((sensor, idx) => ({
      sensor_id: sensor.sensorId,
      value: valueForSensor(sensor.sensorName, idx),
    })),
  }),
}));

console.log(`✅ Device-uri încărcate: ${devices.length}`);
console.log(`✅ Target: ${TARGET_ORIGIN}${TARGET_PATH}`);
console.log(`✅ Conexiuni: ${CONNECTIONS} | Workers: ${WORKERS} | Durată: ${DURATION}`);
console.log('--------------------------------------------------');

const instance = autocannon({
  url: TARGET_ORIGIN,
  connections: CONNECTIONS,
  workers: WORKERS,
  duration: DURATION,
  timeout: REQUEST_TIMEOUT,
  requests,
}, (err, result) => {
  if (err) { console.error('Autocannon error:', err); return; }
  console.log('\n===== REZULTATE =====');
  console.log(autocannon.printResult(result, {
    renderResultsTable: true,
    renderLatencyTable: true,
  }));
});

autocannon.track(instance, {
  renderProgressBar: true,
  renderResultsTable: true,
  renderLatencyTable: true,
});

process.once('SIGINT', () => { instance.stop(); });
