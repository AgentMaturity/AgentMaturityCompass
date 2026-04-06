import { Router } from 'express';
import { processMessage, clearConversation, getHistory } from '../bot/engine.js';
import { enqueueJob, startBot, stopBot } from '../bot/scheduler.js';
import { query } from '../db.js';

const router = Router();

// Chat with the bot
router.post('/chat', async (req, res) => {
  const { message, context } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  const result = await processMessage(message, context || 'global');
  res.json(result);
});

// Get conversation history
router.get('/history', (req, res) => {
  const context = (req.query.context as string) || 'global';
  res.json(getHistory(context));
});

// Clear conversation
router.delete('/history', (req, res) => {
  const context = (req.query.context as string) || 'global';
  clearConversation(context);
  res.json({ cleared: true });
});

// Bot status
router.get('/status', async (_req, res) => {
  const { rows: [state] } = await query('SELECT * FROM bot_state WHERE id = 1');
  res.json(state);
});

// Start/stop bot
router.post('/start', async (_req, res) => {
  startBot();
  await query("UPDATE bot_state SET status = 'running' WHERE id = 1");
  res.json({ status: 'running' });
});

router.post('/stop', async (_req, res) => {
  stopBot();
  await query("UPDATE bot_state SET status = 'stopped' WHERE id = 1");
  res.json({ status: 'stopped' });
});

// Enqueue a job
router.post('/jobs', async (req, res) => {
  const { jobType, input, releaseId } = req.body;
  const jobId = await enqueueJob(jobType, input || {}, releaseId);
  res.json({ jobId });
});

// Get bot log
router.get('/log', async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const { rows } = await query('SELECT * FROM bot_log ORDER BY id DESC LIMIT $1', [limit]);
  res.json(rows);
});

export default router;
