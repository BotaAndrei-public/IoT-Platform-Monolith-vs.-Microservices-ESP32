require('dotenv').config();
const http = require('http');
const https = require('https');
const os = require('os');
const { Pool } = require('pg');

const SERVER_URL = process.env.SERVER_URL || 'https://onlinespacepc.website';
const UI_PORT = parseInt(process.env.UI_PORT || '3000', 10);
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || '1000', 10);
const WAIT_FOR_RESPONSES = process.env.WAIT_FOR_RESPONSES === '1';
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10);

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'iotuser',
  password: process.env.DB_PASSWORD || 'iotpassword123',
  database: process.env.DB_NAME || 'iotplatform',
};

const USER_EMAIL = process.env.DB_USER_EMAIL || 'andrei.bota01@e-uvt.ro';

const pool = new Pool(DB_CONFIG);

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: Infinity,
  maxFreeSockets: 1024,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: Infinity,
  maxFreeSockets: 1024,
});

const stats = {
  totalOk: 0,
  totalErr: 0,
  started: 0,
  completed: 0,
  inFlight: 0,
  lastLatencyMs: 0,
  lastTickDispatchMs: 0,
};

let startTime = Date.now();
let loadingDevices = false;
let tickRunning = false;
let DEVICES = [];
let startedHistory = [];
let completedHistory = [];

const simState = {
  rangeFrom: 1,
  rangeTo: Infinity,
};

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

function labelRangeValue(v) {
  return v === Infinity || v == null ? '∞' : String(v);
}

function parseBotIndex(name) {
  const m = String(name || '').match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

function isInBounds(dev, from, to) {
  const idx = dev.botIndex;
  if (idx == null || Number.isNaN(idx)) return false;
  return idx >= from && idx <= to;
}

function isInSimRange(dev) {
  return isInBounds(dev, simState.rangeFrom, simState.rangeTo);
}

function getEligibleDevices() {
  return DEVICES.filter(d => d.enabled && isInSimRange(d));
}

function compactStatus(dev) {
  return {
    deviceId: dev.deviceId,
    botIndex: dev.botIndex,
    name: dev.name,
    apiKey: dev.apiKey,
    sensors: dev.sensors.length,
    enabled: dev.enabled,
    lastStatus: dev.lastStatus,
    lastSeen: dev.lastSeen,
    okCount: dev.okCount,
    errCount: dev.errCount,
  };
}

function pushTs(arr) {
  arr.push(Date.now());
  if (arr.length > 50000) {
    arr.splice(0, arr.length - 25000);
  }
}

function countSince(arr, ms) {
  const cutoff = Date.now() - ms;
  let count = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] > cutoff) count++;
    else break;
  }
  return count;
}

function getRates() {
  return {
    startedSec: countSince(startedHistory, 1000),
    startedMin: countSince(startedHistory, 60000),
    completedSec: countSince(completedHistory, 1000),
    completedMin: countSince(completedHistory, 60000),
  };
}

function generateValue(idx) {
  const now = Date.now();
  if (idx === 0) return Math.random() < 0.02 ? 1 : 0;
  if (idx === 1) return parseFloat((22 + Math.sin(now / 60000) * 5).toFixed(1));
  return parseFloat((45 + Math.cos(now / 90000) * 10).toFixed(0));
}

function generateApiKey(name) {
  const safe = String(name || 'bot').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return `iot_key_${safe}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
        reject(new Error('Body prea mare'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function loadDevicesFromDB() {
  const res = await pool.query(`
    SELECT
      d.id AS device_id,
      d.name AS device_name,
      d.api_key,
      s.id AS sensor_id,
      s.name AS sensor_name
    FROM devices d
    JOIN sensors s ON s.device_id = d.id
    WHERE d.name LIKE 'Bot-ESP32-%'
    ORDER BY d.name, s.name;
  `);

  const previousByApiKey = new Map(DEVICES.map(d => [d.apiKey, d]));
  const deviceMap = new Map();

  for (const row of res.rows) {
    const apiKey = row.api_key;
    const botIndex = parseBotIndex(row.device_name);

    if (!deviceMap.has(apiKey)) {
      const prev = previousByApiKey.get(apiKey);

      deviceMap.set(apiKey, {
        deviceId: row.device_id,
        botIndex,
        name: row.device_name,
        apiKey,
        sensors: [],
        enabled: prev?.enabled ?? false,
        lastStatus: prev?.lastStatus || 'Wait...',
        lastSeen: prev?.lastSeen || null,
        okCount: prev?.okCount || 0,
        errCount: prev?.errCount || 0,
      });
    }

    const dev = deviceMap.get(apiKey);

    if (!dev.sensors.some(s => s.id === row.sensor_id)) {
      dev.sensors.push({
        id: row.sensor_id,
        name: row.sensor_name,
      });
    }
  }

  DEVICES = Array.from(deviceMap.values()).sort((a, b) => {
    const ai = a.botIndex ?? Number.MAX_SAFE_INTEGER;
    const bi = b.botIndex ?? Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });

  console.log(`✅ Loaded ${DEVICES.length} devices from DB`);
}

async function refreshDevicesLoop() {
  if (loadingDevices) return;
  loadingDevices = true;
  try {
    await loadDevicesFromDB();
  } catch (err) {
    console.error('❌ DB reload failed:', err.message);
  } finally {
    loadingDevices = false;
  }
}

async function getTargetUserId(client) {
  const byEmail = await client.query(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`,
    [USER_EMAIL]
  );

  if (byEmail.rows[0]?.id) return byEmail.rows[0].id;

  const firstUser = await client.query(
    `SELECT id FROM users ORDER BY 1 LIMIT 1`
  );

  if (firstUser.rows[0]?.id) return firstUser.rows[0].id;

  throw new Error('Nu am gasit niciun user in tabelul users');
}

async function createDeviceInDB({ name, apiKey }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = await getTargetUserId(client);

    const devRes = await client.query(
      `INSERT INTO devices (name, api_key, user_id)
       VALUES ($1, $2, $3)
       RETURNING id, name, api_key`,
      [name, apiKey, userId]
    );

    const device = devRes.rows[0];

    await client.query(
      `INSERT INTO sensors (device_id, name, type, pin, unit) VALUES
       ($1, 'foc', 'flame', 18, 'bool'),
       ($1, 'temp', 'temperature', 4, '°C'),
       ($1, 'um', 'humidity', 5, '%')`,
      [device.id]
    );

    await client.query('COMMIT');
    return device;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function createBulkDevicesInDB(prefix, from, to) {
  const client = await pool.connect();
  let created = 0;
  let skipped = 0;

  try {
    await client.query('BEGIN');

    const userId = await getTargetUserId(client);

    for (let i = from; i <= to; i++) {
      const name = `${prefix}${i}`;

      const exists = await client.query(
        `SELECT id FROM devices WHERE user_id = $1 AND name = $2 LIMIT 1`,
        [userId, name]
      );

      if (exists.rows[0]?.id) {
        skipped++;
        continue;
      }

      const apiKey = generateApiKey(name);

      const devRes = await client.query(
        `INSERT INTO devices (name, api_key, user_id)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [name, apiKey, userId]
      );

      const deviceId = devRes.rows[0].id;

      await client.query(
        `INSERT INTO sensors (device_id, name, type, pin, unit) VALUES
         ($1, 'foc', 'flame', 18, 'bool'),
         ($1, 'temp', 'temperature', 4, '°C'),
         ($1, 'um', 'humidity', 5, '%')`,
        [deviceId]
      );

      created++;
    }

    await client.query('COMMIT');
    return { created, skipped };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deleteDeviceFromDB(deviceId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM sensors WHERE device_id = $1`, [deviceId]);
    const res = await client.query(`DELETE FROM devices WHERE id = $1 RETURNING id`, [deviceId]);
    await client.query('COMMIT');
    return res.rowCount > 0;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function setDeviceEnabled(deviceId, enabled) {
  const dev = DEVICES.find(d => String(d.deviceId) === String(deviceId));
  if (!dev) return false;
  dev.enabled = !!enabled;
  return true;
}

async function setAllEnabled(enabled) {
  let changed = 0;
  for (const dev of DEVICES) {
    if (dev.enabled !== !!enabled) {
      dev.enabled = !!enabled;
      changed++;
    }
  }
  return changed;
}

async function setRangeEnabled(from, to, enabled) {
  let changed = 0;
  for (const dev of DEVICES) {
    if (isInBounds(dev, from, to) && dev.enabled !== !!enabled) {
      dev.enabled = !!enabled;
      changed++;
    }
  }
  return changed;
}

function generateTelemetryBody(dev) {
  const readings = dev.sensors.map((sensor, idx) => ({
    sensor_id: sensor.id,
    value: generateValue(idx),
  }));
  return JSON.stringify({ readings });
}

function sendTelemetry(dev) {
  const url = new URL(`${SERVER_URL}/api/telemetry`);
  const isHttps = url.protocol === 'https:';
  const agent = isHttps ? httpsAgent : httpAgent;
  const body = generateTelemetryBody(dev);
  const startedAt = Date.now();

  stats.started++;
  stats.inFlight++;
  pushTs(startedHistory);

  return new Promise((resolve) => {
    let settled = false;

    const finish = (ok, statusLabel) => {
      if (settled) return;
      settled = true;

      const latency = Date.now() - startedAt;
      stats.lastLatencyMs = latency;
      stats.completed++;
      stats.inFlight = Math.max(0, stats.inFlight - 1);
      pushTs(completedHistory);

      dev.lastSeen = new Date().toISOString();

      if (ok) {
        stats.totalOk++;
        dev.okCount++;
        dev.lastStatus = statusLabel || '✅ OK';
      } else {
        stats.totalErr++;
        dev.errCount++;
        dev.lastStatus = statusLabel || '❌ ERR';
      }

      resolve();
    };

    const req = (isHttps ? https : http).request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': dev.apiKey,
      },
      agent,
    }, (res) => {
      const ok = res.statusCode === 200 || res.statusCode === 201;
      res.resume();
      res.on('end', () => {
        finish(ok, ok ? '✅ OK' : `❌ ${res.statusCode}`);
      });
    });

    req.on('error', () => {
      finish(false, '❌ Conn Err');
    });

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error('timeout'));
    });

    req.end(body);
  });
}

function getFilteredDevices({
  search = '',
  page = 1,
  limit = 50,
  showRangeOnly = false,
  showEnabledOnly = false,
} = {}) {
  const q = search.trim().toLowerCase();

  let filtered = DEVICES;

  if (showRangeOnly) {
    filtered = filtered.filter(d => isInSimRange(d));
  }

  if (showEnabledOnly) {
    filtered = filtered.filter(d => d.enabled);
  }

  if (q) {
    filtered = filtered.filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.apiKey.toLowerCase().includes(q) ||
      d.lastStatus.toLowerCase().includes(q) ||
      String(d.botIndex ?? '').includes(q)
    );
  }

  const total = filtered.length;
  const start = (page - 1) * limit;
  const items = filtered.slice(start, start + limit).map(compactStatus);

  return {
    total,
    page,
    limit,
    items,
  };
}

const dashboardHtml = `
<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>IoT Simulator Dashboard</title>
  <style>
    :root {
      color-scheme: dark;
      --panel: #111a2e;
      --text: #e5e7eb;
      --muted: #9ca3af;
      --line: #253047;
      --good: #22c55e;
      --bad: #ef4444;
      --warn: #f59e0b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: linear-gradient(180deg, #08101d, #0b1220);
      color: var(--text);
    }
    .wrap { max-width: 1700px; margin: 0 auto; padding: 20px; }
    h1 { margin: 0 0 6px; font-size: 26px; }
    .sub { color: var(--muted); margin-bottom: 18px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .card {
      background: rgba(17,26,46,0.9);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 14px;
      box-shadow: 0 10px 30px rgba(0,0,0,.22);
    }
    .label { color: var(--muted); font-size: 12px; margin-bottom: 8px; }
    .value { font-size: 24px; font-weight: 700; }
    .toolbar {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin: 16px 0;
      align-items: center;
    }
    input, select, button {
      background: var(--panel);
      color: var(--text);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 10px 12px;
      font-size: 14px;
    }
    input { min-width: 180px; flex: 1; }
    button { cursor: pointer; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: rgba(17,26,46,0.9);
      border: 1px solid var(--line);
      border-radius: 16px;
      overflow: hidden;
    }
    th, td {
      text-align: left;
      padding: 12px 10px;
      border-bottom: 1px solid var(--line);
      font-size: 14px;
      vertical-align: top;
    }
    th {
      color: #cbd5e1;
      font-size: 12px;
      letter-spacing: .04em;
      text-transform: uppercase;
      background: rgba(15,23,41,0.95);
    }
    tr:hover td { background: rgba(255,255,255,0.02); }
    .ok { color: var(--good); }
    .err { color: var(--bad); }
    .warn { color: var(--warn); }
    .small { font-size: 13px; color: var(--muted); }
    code { color: #93c5fd; }
    .admin-grid {
      display: grid;
      grid-template-columns: 2fr 2fr 1fr 1fr 1fr;
      gap: 10px;
      margin-top: 10px;
    }
    .admin-grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 1fr 1fr;
      gap: 10px;
      margin-top: 10px;
    }
    .action-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .danger { border-color: #7f1d1d; background: #2a1010; }
    .goodBtn { border-color: #14532d; background: #10281a; }
    .badBtn { border-color: #7f1d1d; background: #2a1010; }
    .mutedBtn { background: #172033; }
    @media (max-width: 1300px) { .grid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
    @media (max-width: 900px) {
      .admin-grid, .admin-grid-2 { grid-template-columns: 1fr; }
    }
    @media (max-width: 700px) {
      .grid { grid-template-columns: 1fr; }
      input { min-width: 0; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>IoT Simulator Dashboard</h1>
    <div class="sub">Server: <code id="serverUrl"></code> · UI refresh automat la 1 sec</div>

    <div class="grid">
      <div class="card"><div class="label">Started / sec</div><div class="value" id="startedSec">0</div></div>
      <div class="card"><div class="label">Completed / sec</div><div class="value" id="completedSec">0</div></div>
      <div class="card"><div class="label">In flight</div><div class="value" id="inFlight">0</div></div>
      <div class="card"><div class="label">Total OK</div><div class="value ok" id="totalOk">0</div></div>
      <div class="card"><div class="label">Total erori</div><div class="value err" id="totalErr">0</div></div>
    </div>

    <div class="grid">
      <div class="card"><div class="label">Started / min</div><div class="value" id="startedMin">0</div></div>
      <div class="card"><div class="label">Completed / min</div><div class="value" id="completedMin">0</div></div>
      <div class="card"><div class="label">Last latency</div><div class="value" id="lastLatencyMs">0 ms</div></div>
      <div class="card"><div class="label">Dispatch tick</div><div class="value" id="lastTickDispatchMs">0 ms</div></div>
      <div class="card"><div class="label">Boti încărcați</div><div class="value" id="deviceCount">0</div></div>
    </div>

    <div class="card" style="margin-bottom:16px;">
      <div class="label">Administrare DB + simulator</div>

      <div class="admin-grid">
        <input id="singleName" placeholder="Nume bot, ex: Bot-ESP32-1001" />
        <input id="singleApiKey" placeholder="API Key (opțional)" />
        <button id="addSingleBtn">Adaugă bot</button>
        <button id="reloadBtn">Reload DB</button>
        <button id="refreshBtn">Refresh UI</button>
      </div>

      <div class="admin-grid-2">
        <input id="bulkPrefix" placeholder="Prefix" value="Bot-ESP32-" />
        <input id="bulkFrom" type="number" value="101" />
        <input id="bulkTo" type="number" value="1000" />
        <button id="bulkBtn">Adaugă interval</button>
        <button id="allOnBtn" class="goodBtn">Toți ON</button>
        <button id="allOffBtn" class="badBtn">Toți OFF</button>
      </div>

      <div class="admin-grid-2">
        <input id="rangeFrom" type="number" value="1" />
        <input id="rangeTo" type="number" placeholder="∞" />
        <button id="applyRangeBtn" class="mutedBtn">Aplică interval simulator</button>
        <button id="rangeOnBtn" class="goodBtn">ON pe interval</button>
        <button id="rangeOffBtn" class="badBtn">OFF pe interval</button>
      </div>

      <div class="small" id="actionMsg" style="margin-top:10px;"></div>
    </div>

    <div class="toolbar">
      <input id="search" placeholder="Caută după nume, apiKey, status sau index..." />
      <select id="limit">
        <option value="25">25 / pagină</option>
        <option value="50" selected>50 / pagină</option>
        <option value="100">100 / pagină</option>
        <option value="200">200 / pagină</option>
      </select>
      <label class="small"><input type="checkbox" id="showRangeOnly" /> doar interval</label>
      <label class="small"><input type="checkbox" id="showEnabledOnly" /> doar ON</label>
      <button id="prevBtn">Prev</button>
      <button id="nextBtn">Next</button>
      <div class="small" id="pageInfo">-</div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Index</th>
          <th>Device</th>
          <th>API Key</th>
          <th>Senzori</th>
          <th>ON/OFF</th>
          <th>Status</th>
          <th>OK</th>
          <th>Erori</th>
          <th>Ultimul seen</th>
          <th>Acțiuni</th>
        </tr>
      </thead>
      <tbody id="rows"></tbody>
    </table>

    <div class="small" style="margin-top:12px;">
      Se afișează doar pagina curentă. Intervalul simulat controlează ce trimite generatorul.
    </div>
  </div>

<script>
  const state = {
    page: 1,
    limit: 50,
    search: '',
    showRangeOnly: false,
    showEnabledOnly: false
  };

  const el = id => document.getElementById(id);

  function shortKey(key) {
    if (!key) return '';
    if (key.length <= 18) return key;
    return key.slice(0, 8) + '...' + key.slice(-8);
  }

  async function apiJson(path, options) {
    const res = await fetch(path, options || {});
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }

  async function addSingleDevice() {
    try {
      const name = el('singleName').value.trim();
      const apiKey = el('singleApiKey').value.trim();

      if (!name) {
        el('actionMsg').textContent = 'Numele este obligatoriu.';
        return;
      }

      const data = await apiJson('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, apiKey }),
      });

      el('actionMsg').textContent = 'Bot adăugat: ' + data.device.name;
      el('singleName').value = '';
      el('singleApiKey').value = '';
      state.page = 1;
      await load();
    } catch (err) {
      el('actionMsg').textContent = 'Eroare: ' + err.message;
    }
  }

  async function addBulkDevices() {
    try {
      const prefix = el('bulkPrefix').value.trim() || 'Bot-ESP32-';
      const from = parseInt(el('bulkFrom').value, 10);
      const to = parseInt(el('bulkTo').value, 10);

      if (Number.isNaN(from) || Number.isNaN(to)) {
        el('actionMsg').textContent = 'Interval invalid.';
        return;
      }

      const data = await apiJson('/api/devices/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix, from, to }),
      });

      el('actionMsg').textContent = 'Gata: create=' + data.created + ', skipped=' + data.skipped;
      state.page = 1;
      await load();
    } catch (err) {
      el('actionMsg').textContent = 'Eroare: ' + err.message;
    }
  }

  async function reloadDb() {
    try {
      el('actionMsg').textContent = 'Se reîncarcă din DB...';
      await apiJson('/api/reload', { method: 'POST' });
      el('actionMsg').textContent = 'Lista a fost reîncărcată.';
      await load();
    } catch (err) {
      el('actionMsg').textContent = 'Eroare: ' + err.message;
    }
  }

  async function refreshUiOnly() {
    await load();
  }

  async function deleteDevice(deviceId, deviceName) {
    if (!confirm('Ștergi botul ' + deviceName + '?')) return;
    try {
      await apiJson('/api/devices/' + encodeURIComponent(deviceId), { method: 'DELETE' });
      el('actionMsg').textContent = 'Șters: ' + deviceName;
      await load();
    } catch (err) {
      el('actionMsg').textContent = 'Eroare la ștergere: ' + err.message;
    }
  }

  async function toggleDevice(deviceId, enabled) {
    try {
      await apiJson('/api/devices/' + encodeURIComponent(deviceId) + '/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !!enabled }),
      });
      await load();
    } catch (err) {
      el('actionMsg').textContent = 'Eroare toggle: ' + err.message;
    }
  }

  async function applyRange() {
    try {
      const from = parseInt(el('rangeFrom').value, 10);
      const toRaw = el('rangeTo').value.trim();
      const to = toRaw === '' ? null : parseInt(toRaw, 10);

      if (Number.isNaN(from)) {
        el('actionMsg').textContent = 'Range start invalid.';
        return;
      }

      if (toRaw !== '' && Number.isNaN(to)) {
        el('actionMsg').textContent = 'Range end invalid.';
        return;
      }

      const data = await apiJson('/api/sim/range', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      });

      el('actionMsg').textContent = 'Interval aplicat: ' + data.from + ' .. ' + data.toLabel;
      await load();
    } catch (err) {
      el('actionMsg').textContent = 'Eroare interval: ' + err.message;
    }
  }

  async function rangeEnable(enable) {
    try {
      const from = parseInt(el('rangeFrom').value, 10);
      const toRaw = el('rangeTo').value.trim();
      const to = toRaw === '' ? null : parseInt(toRaw, 10);

      if (Number.isNaN(from)) {
        el('actionMsg').textContent = 'Range start invalid.';
        return;
      }

      if (toRaw !== '' && Number.isNaN(to)) {
        el('actionMsg').textContent = 'Range end invalid.';
        return;
      }

      const data = await apiJson('/api/devices/range/' + (enable ? 'enable' : 'disable'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      });

      el('actionMsg').textContent = (enable ? 'ON' : 'OFF') + ' aplicat pe ' + data.changed + ' boti.';
      await load();
    } catch (err) {
      el('actionMsg').textContent = 'Eroare: ' + err.message;
    }
  }

  async function setAllEnabled(enable) {
    try {
      const data = await apiJson('/api/devices/all/' + (enable ? 'enable' : 'disable'), {
        method: 'POST',
      });
      el('actionMsg').textContent = (enable ? 'Toți ON.' : 'Toți OFF.') + ' Schimbați: ' + data.changed;
      await load();
    } catch (err) {
      el('actionMsg').textContent = 'Eroare: ' + err.message;
    }
  }

  async function load() {
    const params = new URLSearchParams({
      page: String(state.page),
      limit: String(state.limit),
      search: state.search,
      showRangeOnly: state.showRangeOnly ? '1' : '0',
      showEnabledOnly: state.showEnabledOnly ? '1' : '0',
    });

    const res = await fetch('/api/state?' + params.toString());
    const data = await res.json();

    el('serverUrl').textContent = data.serverUrl;
    el('startedSec').textContent = data.startedSec;
    el('startedMin').textContent = data.startedMin;
    el('completedSec').textContent = data.completedSec;
    el('completedMin').textContent = data.completedMin;
    el('inFlight').textContent = data.inFlight;
    el('totalOk').textContent = data.totalOk;
    el('totalErr').textContent = data.totalErr;
    el('deviceCount').textContent = data.deviceCount;
    el('lastLatencyMs').textContent = data.lastLatencyMs + ' ms';
    el('lastTickDispatchMs').textContent = data.lastTickDispatchMs + ' ms';
    el('pageInfo').textContent =
      'Pagina ' + data.page + ' din ' + Math.max(1, Math.ceil(data.totalFiltered / data.limit)) +
      ' | Range simulator: ' + data.rangeFromLabel + ' .. ' + data.rangeToLabel +
      ' | Active în range: ' + data.activeInRange;

    const tbody = el('rows');
    tbody.innerHTML = '';

    for (const d of data.items) {
      const tr = document.createElement('tr');

      const cells = [
        String(d.botIndex ?? '-'),
        d.name,
        shortKey(d.apiKey),
        String(d.sensors),
        d.enabled ? 'ON' : 'OFF',
        d.lastStatus,
        String(d.okCount),
        String(d.errCount),
        d.lastSeen || '-'
      ];

      cells.forEach((value, idx) => {
        const td = document.createElement('td');
        td.textContent = value;

        if (idx === 4) td.className = d.enabled ? 'ok' : 'err';
        if (idx === 5) {
          if (String(value).includes('OK')) td.className = 'ok';
          else if (String(value).includes('Err') || String(value).includes('❌')) td.className = 'err';
          else td.className = 'warn';
        }

        tr.appendChild(td);
      });

      const actionTd = document.createElement('td');
      const rowBtns = document.createElement('div');
      rowBtns.className = 'action-row';

      const toggleBtn = document.createElement('button');
      toggleBtn.textContent = d.enabled ? 'OFF' : 'ON';
      toggleBtn.className = d.enabled ? 'badBtn' : 'goodBtn';
      toggleBtn.onclick = () => toggleDevice(d.deviceId, !d.enabled);

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Șterge';
      delBtn.className = 'danger';
      delBtn.onclick = () => deleteDevice(d.deviceId, d.name);

      rowBtns.appendChild(toggleBtn);
      rowBtns.appendChild(delBtn);
      actionTd.appendChild(rowBtns);
      tr.appendChild(actionTd);

      tbody.appendChild(tr);
    }

    const totalPages = Math.max(1, Math.ceil(data.totalFiltered / data.limit));
    if (state.page > totalPages) {
      state.page = totalPages;
      if (data.totalFiltered > 0) await load();
    }
  }

  el('search').addEventListener('input', () => {
    state.search = el('search').value;
    state.page = 1;
    load();
  });

  el('limit').addEventListener('change', () => {
    state.limit = parseInt(el('limit').value, 10);
    state.page = 1;
    load();
  });

  el('showRangeOnly').addEventListener('change', () => {
    state.showRangeOnly = el('showRangeOnly').checked;
    state.page = 1;
    load();
  });

  el('showEnabledOnly').addEventListener('change', () => {
    state.showEnabledOnly = el('showEnabledOnly').checked;
    state.page = 1;
    load();
  });

  el('prevBtn').addEventListener('click', () => {
    state.page = Math.max(1, state.page - 1);
    load();
  });

  el('nextBtn').addEventListener('click', () => {
    state.page += 1;
    load();
  });

  el('addSingleBtn').addEventListener('click', addSingleDevice);
  el('bulkBtn').addEventListener('click', addBulkDevices);
  el('reloadBtn').addEventListener('click', reloadDb);
  el('refreshBtn').addEventListener('click', refreshUiOnly);
  el('applyRangeBtn').addEventListener('click', applyRange);
  el('rangeOnBtn').addEventListener('click', () => rangeEnable(true));
  el('rangeOffBtn').addEventListener('click', () => rangeEnable(false));
  el('allOnBtn').addEventListener('click', () => setAllEnabled(true));
  el('allOffBtn').addEventListener('click', () => setAllEnabled(false));

  load();
  setInterval(load, 1000);
</script>
</body>
</html>
`;

function updateConsole() {
  const rates = getRates();
  const uptimeSec = Math.floor((Date.now() - startTime) / 1000);
  const localIP = getLocalIP();
  const eligible = getEligibleDevices();

  console.clear();
  console.log(`🌐 UI: http://localhost:${UI_PORT}`);
  console.log(`🌐 UI Network: http://${localIP}:${UI_PORT}`);
  console.log('--------------------------------------------------');
  console.log(`🚀 SIMULATOR IOT | Server: ${SERVER_URL}`);
  console.log(`⏱️  Uptime: ${uptimeSec}s | Interval: ${INTERVAL_MS}ms | WAIT_FOR_RESPONSES=${WAIT_FOR_RESPONSES ? '1' : '0'}`);
  console.log(`📤 Started: ${rates.startedSec} req/sec | ${rates.startedMin} req/min`);
  console.log(`✅ Completed: ${rates.completedSec} req/sec | ${rates.completedMin} req/min`);
  console.log(`🟡 In flight: ${stats.inFlight}`);
  console.log(`🧾 Last dispatch: ${stats.lastTickDispatchMs} ms | Last latency: ${stats.lastLatencyMs} ms`);
  console.log(`📊 TOTAL: ${stats.totalOk} Succes | ${stats.totalErr} Erori`);
  console.log(`🤖 Boti total: ${DEVICES.length} | Activi acum: ${eligible.length}`);
  console.log(`📍 Range: ${simState.rangeFrom} .. ${labelRangeValue(simState.rangeTo)}`);
  console.log('--------------------------------------------------');

  const preview = DEVICES.slice(0, 12).map(d => ({
    name: d.name,
    enabled: d.enabled ? 'ON' : 'OFF',
    apiKey: d.apiKey,
    sensors: d.sensors.length,
    lastStatus: d.lastStatus,
    lastSeen: d.lastSeen,
    okCount: d.okCount,
    errCount: d.errCount,
  }));

  console.table(preview);

  if (DEVICES.length > preview.length) {
    console.log(`... și încă ${DEVICES.length - preview.length} boti`);
  }

  console.log('--------------------------------------------------');
}

async function tick() {
  const eligible = getEligibleDevices();
  const startedAt = Date.now();

  if (WAIT_FOR_RESPONSES) {
    await Promise.allSettled(eligible.map(dev => sendTelemetry(dev)));
  } else {
    for (const dev of eligible) {
      sendTelemetry(dev).catch(() => {});
    }
  }

  stats.lastTickDispatchMs = Date.now() - startedAt;
  updateConsole();
}

async function loop() {
  if (tickRunning) return;
  tickRunning = true;

  try {
    await tick();
  } catch (err) {
    console.error('Tick error:', err);
  } finally {
    tickRunning = false;
    setTimeout(loop, INTERVAL_MS).unref();
  }
}

function startDashboard() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);

      if (url.pathname === '/' || url.pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(dashboardHtml);
        return;
      }

      if (url.pathname === '/api/state' && req.method === 'GET') {
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
        const limit = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit') || '50', 10)));
        const search = url.searchParams.get('search') || '';
        const showRangeOnly = url.searchParams.get('showRangeOnly') === '1';
        const showEnabledOnly = url.searchParams.get('showEnabledOnly') === '1';

        const rates = getRates();
        const paged = getFilteredDevices({ search, page, limit, showRangeOnly, showEnabledOnly });
        const activeInRange = DEVICES.filter(d => d.enabled && isInSimRange(d)).length;

        sendJson(res, 200, {
          serverUrl: SERVER_URL,
          totalOk: stats.totalOk,
          totalErr: stats.totalErr,
          startedSec: rates.startedSec,
          startedMin: rates.startedMin,
          completedSec: rates.completedSec,
          completedMin: rates.completedMin,
          inFlight: stats.inFlight,
          lastLatencyMs: stats.lastLatencyMs,
          lastTickDispatchMs: stats.lastTickDispatchMs,
          totalFiltered: paged.total,
          page: paged.page,
          limit: paged.limit,
          items: paged.items,
          deviceCount: DEVICES.length,
          activeInRange,
          rangeFrom: simState.rangeFrom,
          rangeTo: simState.rangeTo,
          rangeFromLabel: labelRangeValue(simState.rangeFrom),
          rangeToLabel: labelRangeValue(simState.rangeTo),
        });
        return;
      }

      if (url.pathname === '/api/reload' && req.method === 'POST') {
        await refreshDevicesLoop();
        sendJson(res, 200, { ok: true, count: DEVICES.length });
        return;
      }

      if (url.pathname === '/api/sim/range' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req) || '{}');
        const from = parseInt(body.from, 10);
        const to = body.to == null || body.to === '' ? Infinity : parseInt(body.to, 10);

        if (Number.isNaN(from) || Number.isNaN(to)) {
          sendJson(res, 400, { ok: false, error: 'Interval invalid' });
          return;
        }
        if (from > to) {
          sendJson(res, 400, { ok: false, error: 'from trebuie sa fie <= to' });
          return;
        }

        simState.rangeFrom = from;
        simState.rangeTo = to;
        sendJson(res, 200, { ok: true, from: simState.rangeFrom, to: simState.rangeTo, toLabel: labelRangeValue(simState.rangeTo) });
        return;
      }

      if (url.pathname === '/api/devices' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req) || '{}');
        const name = String(body.name || '').trim();
        const apiKey = String(body.apiKey || '').trim() || generateApiKey(name || 'bot');

        if (!name) {
          sendJson(res, 400, { ok: false, error: 'Numele este obligatoriu' });
          return;
        }

        const device = await createDeviceInDB({ name, apiKey });
        await refreshDevicesLoop();
        sendJson(res, 200, { ok: true, device });
        return;
      }

      if (url.pathname === '/api/devices/bulk' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req) || '{}');
        const prefix = String(body.prefix || 'Bot-ESP32-').trim() || 'Bot-ESP32-';
        const from = parseInt(body.from, 10);
        const to = parseInt(body.to, 10);

        if (Number.isNaN(from) || Number.isNaN(to)) {
          sendJson(res, 400, { ok: false, error: 'Interval invalid' });
          return;
        }
        if (from > to) {
          sendJson(res, 400, { ok: false, error: 'from trebuie sa fie <= to' });
          return;
        }

        const result = await createBulkDevicesInDB(prefix, from, to);
        await refreshDevicesLoop();
        sendJson(res, 200, { ok: true, ...result });
        return;
      }

      if (url.pathname === '/api/devices/all/enable' && req.method === 'POST') {
        const changed = await setAllEnabled(true);
        sendJson(res, 200, { ok: true, changed });
        return;
      }

      if (url.pathname === '/api/devices/all/disable' && req.method === 'POST') {
        const changed = await setAllEnabled(false);
        sendJson(res, 200, { ok: true, changed });
        return;
      }

      if (url.pathname === '/api/devices/range/enable' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req) || '{}');
        const from = parseInt(body.from, 10);
        const to = body.to == null || body.to === '' ? Infinity : parseInt(body.to, 10);

        if (Number.isNaN(from) || Number.isNaN(to)) {
          sendJson(res, 400, { ok: false, error: 'Interval invalid' });
          return;
        }

        const changed = await setRangeEnabled(from, to, true);
        sendJson(res, 200, { ok: true, changed });
        return;
      }

      if (url.pathname === '/api/devices/range/disable' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req) || '{}');
        const from = parseInt(body.from, 10);
        const to = body.to == null || body.to === '' ? Infinity : parseInt(body.to, 10);

        if (Number.isNaN(from) || Number.isNaN(to)) {
          sendJson(res, 400, { ok: false, error: 'Interval invalid' });
          return;
        }

        const changed = await setRangeEnabled(from, to, false);
        sendJson(res, 200, { ok: true, changed });
        return;
      }

      if (url.pathname.startsWith('/api/devices/') && req.method === 'POST' && url.pathname.endsWith('/toggle')) {
        const parts = url.pathname.split('/');
        const deviceId = parts[3];
        const body = JSON.parse(await readBody(req) || '{}');
        const enabled = !!body.enabled;

        const ok = await setDeviceEnabled(deviceId, enabled);
        if (!ok) {
          sendJson(res, 404, { ok: false, error: 'Device not found' });
          return;
        }

        sendJson(res, 200, { ok: true, deviceId, enabled });
        return;
      }

      if (url.pathname.startsWith('/api/devices/') && req.method === 'DELETE') {
        const deviceId = url.pathname.split('/')[3];
        const deleted = await deleteDeviceFromDB(deviceId);
        await refreshDevicesLoop();
        sendJson(res, 200, { ok: deleted });
        return;
      }

      sendJson(res, 404, { ok: false, error: 'Not found' });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  server.listen(UI_PORT, () => {
    const localIP = getLocalIP();
    console.log('\n🌐 ===== DASHBOARD UI =====');
    console.log(`👉 Local:   http://localhost:${UI_PORT}`);
    console.log(`👉 Network: http://${localIP}:${UI_PORT}`);
    console.log('==========================\n');
  });
}

async function main() {
  await refreshDevicesLoop();

  const maxIndex = DEVICES.reduce((m, d) => Math.max(m, d.botIndex || 0), 1);
  simState.rangeFrom = 1;
  simState.rangeTo = maxIndex || 1;

  startDashboard();
  loop();

  setInterval(refreshDevicesLoop, 30000).unref();
}

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  try {
    await pool.end();
  } catch {}
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
