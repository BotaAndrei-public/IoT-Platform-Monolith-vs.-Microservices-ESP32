const express = require('express');
const { queryOne, queryAll } = require('../lib/database');
const { requireAuth }       = require('../middleware/auth');
const { setRelayCommand, getRelayCommand } = require('../lib/redis');
const router = express.Router();
router.use(requireAuth);

router.get('/:sensorId', async (req, res) => {
  try {
    const s = await queryOne(
      `SELECT s.*, rs.state, rs.percent FROM sensors s LEFT JOIN relay_state rs ON rs.sensor_id=s.id
       JOIN devices d ON d.id=s.device_id WHERE s.id=$1 AND d.user_id=$2`,
      [req.params.sensorId, req.user.id]);
    if (!s) return res.status(404).json({ error: 'Relay not found' });
    const cmd = await getRelayCommand(req.params.sensorId);
    res.json({ ...s, ...cmd });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.post('/:sensorId', async (req, res) => {
  const { state=0, percent=0 } = req.body;
  try {
    const s = await queryOne(
      `SELECT s.id FROM sensors s JOIN devices d ON d.id=s.device_id
       WHERE s.id=$1 AND d.user_id=$2 AND s.type='relay'`,
      [req.params.sensorId, req.user.id]);
    if (!s) return res.status(404).json({ error: 'Relay not found' });
    await setRelayCommand(req.params.sensorId, state, percent);
    queryOne(`INSERT INTO relay_state(sensor_id,state,percent,updated_at) VALUES($1,$2,$3,NOW())
      ON CONFLICT(sensor_id) DO UPDATE SET state=$2,percent=$3,updated_at=NOW()`,
      [req.params.sensorId, state, percent]).catch(()=>{});
    res.json({ sensor_id: req.params.sensorId, state, percent, updated_at: new Date() });
  } catch(err) { res.status(500).json({ error: err.message }); }
});
module.exports = router;
