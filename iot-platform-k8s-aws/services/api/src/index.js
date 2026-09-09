require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const http    = require('http');
const { connect, query } = require('./lib/database');
const { getRedis }       = require('./lib/redis');

const app    = express();
const server = http.createServer(app);
app.set('trust proxy', 1); 
const allowedOrigins = process.env.ALLOWED_ORIGINS === 'all' ? true
  : (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim());

app.use(cors({
  origin: allowedOrigins === true ? true : (origin, cb) => {
    if (!origin || (Array.isArray(allowedOrigins) && allowedOrigins.includes(origin))) return cb(null, true);
    cb(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    if (req.path !== '/health' && req.path !== '/ready')
      console.log(`[${new Date().toISOString().slice(11,19)}] ${req.method} ${req.path}`);
    next();
  });
}

app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));
app.get('/ready', async (req, res) => {
  try { await getRedis().ping(); res.json({ status: 'ready' }); }
  catch { res.status(503).json({ status: 'not ready' }); }
});

const PORT = process.env.PORT || 3001;

async function start() {
  await connect();

  try { await getRedis().connect(); } catch {}

  app.use('/api/auth',      require('./routes/auth'));
  app.use('/api/devices',   require('./routes/devices'));
  app.use('/api/telemetry', require('./routes/telemetry'));
  app.use('/api/relay',     require('./routes/relay'));
  app.use('/api/alerts',    require('./routes/alerts'));
  app.post('/api/benchmark/echo', (req, res) => res.json({ ok: true, received: req.body }));

  app.use((req, res) => res.status(404).json({ error: `${req.method} ${req.path} not found` }));
  app.use((err, req, res, next) => {
    console.error('[ERROR]', err.message);
    res.status(err.status || 500).json({ error: err.message });
  });

  server.listen(PORT, () => {
    console.log(`\n[API] :${PORT} | env:${process.env.NODE_ENV||'development'}`);
    console.log('  Stack: TimescaleDB + Redis + Kafka\n');
  });

  // Mark devices offline (fallback daca Redis TTL nu e suficient)
  setInterval(() => {
    query(`UPDATE devices SET online=FALSE WHERE online=TRUE AND last_seen < NOW()-INTERVAL '30 seconds'`)
      .catch(() => {});
  }, 15000);
}

start().catch(err => { console.error('[Boot] Fatal:', err.message); process.exit(1); });

process.on('SIGTERM', () => {
  console.log('[API] SIGTERM — shutting down...');
  server.close(() => process.exit(0));
});
