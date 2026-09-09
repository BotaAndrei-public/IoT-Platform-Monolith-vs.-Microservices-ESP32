const express = require('express');
const { queryOne, queryAll } = require('../lib/database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const { deviceId, unacknowledged, limit=100 } = req.query;
    let sql = `SELECT a.*, s.name AS sensor_name, s.unit, s.type AS sensor_type, d.name AS device_name
      FROM alerts a JOIN sensors s ON s.id=a.sensor_id JOIN devices d ON d.id=a.device_id
      WHERE d.user_id=$1`;
    const params = [req.user.id]; let p = 2;
    if (deviceId) { sql += ` AND a.device_id=$${p++}`; params.push(deviceId); }
    if (unacknowledged==='true') sql += ` AND a.acknowledged=FALSE`;
    sql += ` ORDER BY a.created_at DESC LIMIT $${p}`; params.push(parseInt(limit));
    res.json(await queryAll(sql, params));
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/acknowledge', async (req, res) => {
  try {
    await queryOne(`UPDATE alerts SET acknowledged=TRUE WHERE id=$1
      AND device_id IN(SELECT id FROM devices WHERE user_id=$2)`,
      [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.post('/acknowledge-all', async (req, res) => {
  try {
    const { deviceId } = req.body;
    await queryOne(`UPDATE alerts SET acknowledged=TRUE WHERE acknowledged=FALSE
      AND device_id IN(SELECT id FROM devices WHERE user_id=$1 ${deviceId?'AND id=$2':''})`,
      deviceId?[req.user.id,deviceId]:[req.user.id]);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});
module.exports = router;
