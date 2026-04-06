import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  const status = (req.query.status as string) || 'active';
  const { rows } = await query('SELECT * FROM releases WHERE status = $1 ORDER BY id DESC LIMIT 50', [status]);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { tag, app, phase } = req.body;
  if (!tag) return res.status(400).json({ error: 'tag required' });
  const { rows: [release] } = await query(
    'INSERT INTO releases (tag, app, phase) VALUES ($1, $2, $3) RETURNING *',
    [tag, app || 'amc', phase || 'Plan']
  );
  res.json(release);
});

router.patch('/:id', async (req, res) => {
  const { phase, status, bugs } = req.body;
  const sets: string[] = [];
  const vals: any[] = [];
  let i = 1;

  if (phase) { sets.push(`phase = $${i++}`); vals.push(phase); }
  if (status) { sets.push(`status = $${i++}`); vals.push(status); }
  if (bugs !== undefined) { sets.push(`bugs = $${i++}`); vals.push(bugs); }
  sets.push(`updated_at = NOW()`);

  vals.push(req.params.id);
  const { rows: [release] } = await query(
    `UPDATE releases SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals
  );
  res.json(release);
});

export default router;
