const jwt = require('jsonwebtoken');
const { queryOne }        = require('../lib/database');
const { getDeviceByApiKey, cacheDeviceApiKey, setDeviceOnline, getRedis } = require('../lib/redis');

function requireAuth(req, res, next) {
  const h = req.headers['authorization'];
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token lipsa' });
  try { req.user = jwt.verify(h.slice(7), process.env.JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'Token invalid sau expirat' }); }
}

async function deviceAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'Header X-API-Key lipsa' });
  try {
    let device = await getDeviceByApiKey(apiKey);
    if (!device) {
      device = await queryOne(
        `SELECT d.*, u.id as user_id FROM devices d JOIN users u ON u.id=d.user_id WHERE d.api_key=$1`, [apiKey]);
      if (!device) return res.status(401).json({ error: 'API key invalid' });
      await cacheDeviceApiKey(apiKey, device, 300);
    }
    // actualizeaza last_seen maxim o data pe minut per device — elimina UPDATE la fiecare request
    getRedis().set(`device:lastseen:${device.id}`, '1', 'EX', 60, 'NX').then(res => {
      if (res === 'OK') {
        queryOne(`UPDATE devices SET last_seen=NOW(), online=TRUE, ip_address=$1 WHERE id=$2`,
          [req.ip||'unknown', device.id]).catch(()=>{});
      }
    }).catch(()=>{});
    setDeviceOnline(device.id, true).catch(()=>{});
    req.device = device; next();
  } catch(err) { res.status(500).json({ error: 'Server error' }); }
}
module.exports = { requireAuth, deviceAuth };
