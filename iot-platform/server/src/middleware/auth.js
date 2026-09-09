const jwt = require('jsonwebtoken');

// midd pt route-uri protejate (dashboard, devices, etc.)
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token lipsa. Logheaza-te mai intai.' });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, name, avatar }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirat. Relogheaza-te.' });
    }
    return res.status(401).json({ error: 'Token invalid.' });
  }
}

// midd pt. ESP32 -> valideaza X-API-Key + device + user
async function deviceAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ error: 'Header X-API-Key lipsa' });
  }

  const { queryOne } = require('../db/database');

  const device = await queryOne(
    `SELECT d.*, u.id as user_id
     FROM devices d
     JOIN users u ON u.id = d.user_id
     WHERE d.api_key = $1`,
    [apiKey]
  );

  if (!device) {
    return res.status(401).json({ error: 'API key invalid' });
  }

  queryOne(
    `UPDATE devices SET last_seen = NOW(), online = TRUE, ip_address = $1
     WHERE id = $2`,
    [req.ip || req.socket?.remoteAddress || 'unknown', device.id]
  );

  req.device = device;
  next();
}

module.exports = { requireAuth, deviceAuth };
