const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 15, idleTimeoutMillis: 30000 });
pool.on('error', (err) => console.error('[DB] Pool error:', err.message));
const query    = (t, p) => pool.query(t, p);
const queryOne = async (t, p) => { const r = await pool.query(t, p); return r.rows[0] || null; };
const queryAll = async (t, p) => { const r = await pool.query(t, p); return r.rows; };

async function initSchema() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), google_id TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, avatar TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(), last_login TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS devices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, description TEXT DEFAULT '', api_key TEXT UNIQUE NOT NULL,
      last_seen TIMESTAMPTZ, online BOOLEAN DEFAULT FALSE, ip_address TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_devices_user    ON devices(user_id);
    CREATE INDEX IF NOT EXISTS idx_devices_api_key ON devices(api_key);
    CREATE TABLE IF NOT EXISTS sensors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      name TEXT NOT NULL, type TEXT NOT NULL, pin INTEGER NOT NULL, unit TEXT DEFAULT '',
      relay_config JSONB, alert_enabled BOOLEAN DEFAULT FALSE, alert_min NUMERIC, alert_max NUMERIC,
      alert_cooldown_minutes INTEGER DEFAULT 10, missing_data_threshold_minutes INTEGER, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_sensors_device ON sensors(device_id);
    CREATE TABLE IF NOT EXISTS telemetry (
      id BIGSERIAL, device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      sensor_id UUID NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
      value NUMERIC NOT NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (id, recorded_at)
    );
    CREATE TABLE IF NOT EXISTS relay_state (
      sensor_id UUID PRIMARY KEY REFERENCES sensors(id) ON DELETE CASCADE,
      state INTEGER DEFAULT 0, percent INTEGER DEFAULT 0, updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id BIGSERIAL PRIMARY KEY, device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      sensor_id UUID NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
      value NUMERIC NOT NULL, message TEXT NOT NULL, acknowledged BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_device ON alerts(device_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tel_sensor_time ON telemetry(sensor_id, recorded_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tel_device_time ON telemetry(device_id, recorded_at DESC);
  `);
  // face hypertable
  await pool.query(`
    DO $$ BEGIN
      PERFORM create_hypertable('telemetry','recorded_at',chunk_time_interval=>INTERVAL '1 day',if_not_exists=>TRUE);
    EXCEPTION WHEN OTHERS THEN NULL; END $$;
  `);
  await pool.query(`ALTER TABLE sensors ADD COLUMN IF NOT EXISTS alert_cooldown_minutes INTEGER DEFAULT 10;`).catch(()=>{});
  console.log('[DB] TimescaleDB schema initialized');
}

async function connect() {
  const client = await pool.connect();
  await client.query('SELECT 1');
  client.release();
  console.log('[DB] Connected to TimescaleDB');
  await initSchema();
  return { query, queryOne, queryAll, pool };
}
module.exports = { connect, query, queryOne, queryAll, pool };
