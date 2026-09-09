function deviceAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'Missing X-API-Key header' });

  const db = req.app.get('db');
  const device = db.prepare('SELECT * FROM devices WHERE api_key = ?').get(apiKey);
  if (!device) return res.status(401).json({ error: 'Invalid API key' });

  db.prepare(
    "UPDATE devices SET last_seen=strftime('%s','now'), online=1, ip_address=? WHERE id=?"
  ).run(req.ip || req.socket.remoteAddress, device.id);

  req.device = device;
  next();
}
module.exports = { deviceAuth };
