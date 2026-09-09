const express = require('express');
const { queryOne } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

//GET /api/relay/:sensorId
router.get('/:sensorId', async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT rs.*, s.name, s.relay_config
       FROM relay_state rs
       JOIN sensors s ON s.id = rs.sensor_id
       JOIN devices d ON d.id = s.device_id
       WHERE rs.sensor_id = $1 AND d.user_id = $2`,
      [req.params.sensorId, req.user.id]
    );
    if (!row) return res.status(404).json({ error: 'Relay not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//POST /api/relay/:sensorId — trimite comanda rela
router.post('/:sensorId', async (req, res) => {
  const { state, percent } = req.body;
  try {
    // Verifica ownership
    const sensor = await queryOne(
      `SELECT s.id FROM sensors s
       JOIN devices d ON d.id = s.device_id
       WHERE s.id = $1 AND d.user_id = $2 AND s.type = 'relay'`,
      [req.params.sensorId, req.user.id]
    );
    if (!sensor) return res.status(404).json({ error: 'Relay sensor not found' });

    const updated = await queryOne(
      `INSERT INTO relay_state (sensor_id, state, percent, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (sensor_id) DO UPDATE
         SET state=$2, percent=$3, updated_at=NOW()
       RETURNING *`,
      [req.params.sensorId, state ?? 0, percent ?? 0]
    );

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
