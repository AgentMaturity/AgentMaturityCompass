import { Router } from 'express';
import { query } from '../db.js';
import { triageRun } from '../bot/decisions.js';

const router = Router();

router.get('/', async (req, res) => {
  const releaseId = req.query.releaseId;
  const where = releaseId ? 'WHERE release_id = $1' : '';
  const params = releaseId ? [releaseId] : [];
  const { rows } = await query(`SELECT * FROM test_runs ${where} ORDER BY id DESC LIMIT 50`, params);
  res.json(rows);
});

router.get('/:id/failures', async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM test_failures WHERE test_run_id = $1 ORDER BY id',
    [req.params.id]
  );
  res.json(rows);
});

router.post('/:id/triage', async (req, res) => {
  const results = await triageRun(parseInt(req.params.id));
  res.json(results);
});

export default router;
