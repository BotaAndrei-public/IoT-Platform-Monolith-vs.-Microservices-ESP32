const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Pool error:', err.message);
});


async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 500) {
    console.warn(`[DB] Slow query (${duration}ms):`, text.slice(0, 80));
  }
  return res;
}

//un singur rand
async function queryOne(text, params) {
  const res = await pool.query(text, params);
  return res.rows[0] || null;
}

// Helper oate randurile
async function queryAll(text, params) {
  const res = await pool.query(text, params);
  return res.rows;
}

//Schema
async function initSchema() {
  await pool.query(`
    -- Extensie UUID
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    -- Users (autentificati cu Google)
    CREATE TABLE IF NOT EXISTS users (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      google_id   TEXT UNIQUE NOT NULL,
      email       TEXT UNIQUE NOT NULL,
      name        TEXT NOT NULL,
      avatar      TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      last_login  TIMESTAMPTZ DEFAULT NOW()
    );

    -- Devices (apartin unui user)
    CREATE TABLE IF NOT EXISTS devices (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      description  TEXT DEFAULT '',
      api_key      TEXT UNIQUE NOT NULL,
      last_seen    TIMESTAMPTZ,
      online       BOOLEAN DEFAULT FALSE,
      ip_address   TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
    CREATE INDEX IF NOT EXISTS idx_devices_api_key ON devices(api_key);

    -- Sensors
    CREATE TABLE IF NOT EXISTS sensors (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      device_id     UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      type          TEXT NOT NULL,
      pin           INTEGER NOT NULL,
      unit          TEXT DEFAULT '',
      relay_config  JSONB,
      alert_enabled BOOLEAN DEFAULT FALSE,
      alert_min     NUMERIC,
      alert_max     NUMERIC,
      -- Threshold custom per senzor pt gap detection (minute)
      -- NULL = foloseste valoarea globala din .env
      missing_data_threshold_minutes INTEGER,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_sensors_device ON sensors(device_id);

    -- Telemetry - toate datele citite de la senzori
    CREATE TABLE IF NOT EXISTS telemetry (
      id          BIGSERIAL PRIMARY KEY,
      device_id   UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      sensor_id   UUID NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
      value       NUMERIC NOT NULL,
      recorded_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_tel_sensor_time   ON telemetry(sensor_id, recorded_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tel_device_time   ON telemetry(device_id, recorded_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tel_recorded_at   ON telemetry(recorded_at DESC);

    -- Relay state
    CREATE TABLE IF NOT EXISTS relay_state (
      sensor_id   UUID PRIMARY KEY REFERENCES sensors(id) ON DELETE CASCADE,
      state       INTEGER DEFAULT 0,
      percent     INTEGER DEFAULT 0,
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );

    -- Alerts
    CREATE TABLE IF NOT EXISTS alerts (
      id             BIGSERIAL PRIMARY KEY,
      device_id      UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      sensor_id      UUID NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
      value          NUMERIC NOT NULL,
      message        TEXT NOT NULL,
      acknowledged   BOOLEAN DEFAULT FALSE,
      created_at     TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_device ON alerts(device_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_alerts_ack    ON alerts(acknowledged, created_at DESC);
  `);

  console.log('[DB] Schema PostgreSQL initializata');
}

async function connect() {
  const client = await pool.connect();
  await client.query('SELECT 1'); // test conn.
  client.release();
  console.log('[DB] Conectat la PostgreSQL');
  await initSchema();
  return { query, queryOne, queryAll, pool };
}

module.exports = { connect, query, queryOne, queryAll, pool };
