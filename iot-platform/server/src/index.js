require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const http    = require('http');
const { connect } = require('./db/database');

const app    = express();
const server = http.createServer(app);

// CORS — accepta orice origine in dev, sau lista din .env in prod
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173']

app.use(cors({
  origin: (origin, cb) => {
    // Permite requesturi fara origin (ESP32, curl, etc.)
    if (!origin) return cb(null, true)
    if (allowedOrigins.includes(origin)) return cb(null, true)
    console.warn(`[CORS] Blocat: ${origin}`)
    cb(new Error(`CORS: ${origin} nu e permis`))
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  if (req.path !== '/health')
    console.log(`[${new Date().toISOString().slice(11,19)}] ${req.method} ${req.path}`);
  next();
});

app.get('/health', (req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

app.post('/api/benchmark/echo', (req, res) =>
  res.json({ ok: true, received: req.body })
);

const PORT = process.env.PORT || 3001;

connect().then(() => {
  const { queryOne, queryAll } = require('./db/database');

  //RUTA PUBLICA — ESP32 cu X-API-Key fara JWT 
  app.get('/api/devices/:id/config', async (req, res) => {
    try {
      const apiKey     = req.headers['x-api-key'];
      const authHeader = req.headers['authorization'];
      let device;

      if (apiKey) {
        device = await queryOne('SELECT * FROM devices WHERE api_key = $1', [apiKey]);
        if (!device) return res.status(401).json({ error: 'API key invalid' });
      } else if (authHeader?.startsWith('Bearer ')) {
        const jwt     = require('jsonwebtoken');
        const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
        device = await queryOne(
          'SELECT * FROM devices WHERE id = $1 AND user_id = $2',
          [req.params.id, decoded.id]
        );
        if (!device) return res.status(404).json({ error: 'Device not found' });
      } else {
        return res.status(401).json({ error: 'X-API-Key sau Bearer token necesar' });
      }

      await queryOne(
        'UPDATE devices SET last_seen=NOW(), online=TRUE, ip_address=$1 WHERE id=$2',
        [req.ip || 'unknown', device.id]
      );

      const sensors = await queryAll(
        'SELECT * FROM sensors WHERE device_id = $1 ORDER BY created_at ASC',
        [device.id]
      );

      // SERVER_URL pentru ESP32 — din .env sau auto-detectat
      const serverUrl = process.env.ESP_SERVER_URL
        || `http://${process.env.SERVER_HOST || 'localhost'}:${PORT}`

      res.json({
        device_id:             device.id,
        device_name:           device.name,
        server_url:            serverUrl,
        telemetry_interval_ms: 5000,
        sensors: sensors.map(s => ({
          id: s.id, name: s.name, type: s.type,
          pin: s.pin, unit: s.unit,
          relay_config: s.relay_config || null,
        })),
      });
    } catch (err) {
      console.error('[Config]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.use('/api/auth',      require('./routes/auth'));
  app.use('/api/devices',   require('./routes/devices'));
  app.use('/api/telemetry', require('./routes/telemetry'));
  app.use('/api/relay',     require('./routes/relay'));
  app.use('/api/alerts',    require('./routes/alerts'));

  app.use((req, res) =>
    res.status(404).json({ error: `${req.method} ${req.path} not found` })
  );
  app.use((err, req, res, next) => {
    console.error('[ERROR]', err.message);
    res.status(err.status || 500).json({ error: err.message });
  });

  server.listen(PORT, () => {
    console.log(`\n[Server] :${PORT} | Origini permise: ${allowedOrigins.join(', ')}\n`);
  });

  setInterval(async () => {
    await require('./db/database').query(
      `UPDATE devices SET online=FALSE
       WHERE online=TRUE AND (last_seen IS NULL OR last_seen < NOW() - INTERVAL '30 seconds')`
    );
  }, 15000);

}).catch(err => {
  console.error('[Boot] DB failed:', err.message);
  process.exit(1);
});
