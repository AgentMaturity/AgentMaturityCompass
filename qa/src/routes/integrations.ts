import { Router } from 'express';
import { query } from '../db.js';
import { github } from '../integrations/github.js';

const router = Router();

router.get('/', async (_req, res) => {
  const { rows } = await query('SELECT service, status FROM integrations ORDER BY service');
  res.json(rows);
});

router.post('/:service/test', async (req, res) => {
  const { service } = req.params;
  if (service === 'github') {
    const ok = await github.testConnection();
    return res.json({ service, connected: ok });
  }
  res.status(404).json({ error: `Unknown service: ${service}` });
});

router.put('/:service/config', async (req, res) => {
  const { service } = req.params;
  await query(
    'UPDATE integrations SET config = $1, status = $2 WHERE service = $3',
    [JSON.stringify(req.body), 'pending', service]
  );
  res.json({ updated: true });
});

export default router;
