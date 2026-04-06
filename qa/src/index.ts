import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { onBroadcast } from './events.js';
import { startBot } from './bot/scheduler.js';

import botRoutes from './routes/bot.js';
import releasesRoutes from './routes/releases.js';
import testRunsRoutes from './routes/test-runs.js';
import integrationsRoutes from './routes/integrations.js';
import webhooksRoutes from './routes/webhooks.js';

dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use('/api', rateLimit({ windowMs: 60_000, max: 120 }));

// API routes
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'amc-qa' }));
app.use('/api/bot', botRoutes);
app.use('/api/releases', releasesRoutes);
app.use('/api/test-runs', testRunsRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/webhooks', webhooksRoutes);

// WebSocket broadcast
onBroadcast((type, data) => {
  const msg = JSON.stringify({ type, data, ts: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
});

// Start server
const port = parseInt(process.env.PORT || '3100');
server.listen(port, () => {
  console.log(`AMC QA RelOps listening on http://localhost:${port}`);
  startBot();
  console.log('Bot engine started (job poller + cron scheduler)');
});
