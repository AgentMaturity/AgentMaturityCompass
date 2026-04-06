import { Router } from 'express';
import { query } from '../db.js';
import { processWebhookTrigger } from '../bot/scheduler.js';

const router = Router();

// GitHub webhook
router.post('/github', async (req, res) => {
  const eventType = req.headers['x-github-event'] as string;
  const payload = req.body;

  await query(
    'INSERT INTO webhook_events (source, event_type, payload) VALUES ($1, $2, $3::jsonb)',
    ['github', eventType, JSON.stringify(payload)]
  );

  const triggered = await processWebhookTrigger('github', eventType, payload);
  res.json({ received: true, triggered });
});

export default router;
