import { query } from '../db.js';
import { processMessage } from './engine.js';

// --- Job Queue ---

interface BotJob {
  id: number;
  job_type: string;
  release_id: number | null;
  status: string;
  input: Record<string, any>;
}

let polling = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function claimNextJob(): Promise<BotJob | null> {
  const { rows } = await query(
    `UPDATE bot_jobs SET status = 'running', started_at = NOW()
     WHERE id = (
       SELECT id FROM bot_jobs
       WHERE status = 'queued' AND scheduled_at <= NOW()
       ORDER BY scheduled_at ASC LIMIT 1
       FOR UPDATE SKIP LOCKED
     ) RETURNING *`
  );
  return rows[0] || null;
}

async function completeJob(jobId: number, output: any): Promise<void> {
  await query(
    `UPDATE bot_jobs SET status = 'completed', output = $1::jsonb, finished_at = NOW() WHERE id = $2`,
    [JSON.stringify(output), jobId]
  );
}

async function failJob(jobId: number, error: string): Promise<void> {
  await query(
    `UPDATE bot_jobs SET status = 'failed', error = $1, finished_at = NOW() WHERE id = $2`,
    [error, jobId]
  );
}

async function executeJob(job: BotJob): Promise<void> {
  try {
    let output: any;

    switch (job.job_type) {
      case 'chat': {
        const context = job.input.context || 'global';
        const { reply, toolsUsed } = await processMessage(job.input.message, context);
        output = { reply, toolsUsed };
        break;
      }
      case 'run_tests': {
        const { runAmcTests } = await import('../runners.js');
        output = await runAmcTests(job.input.pattern);
        break;
      }
      default: {
        const { reply, toolsUsed } = await processMessage(
          `Execute job: ${job.job_type} with params: ${JSON.stringify(job.input)}`
        );
        output = { reply, toolsUsed };
      }
    }

    await completeJob(job.id, output);
    await query('INSERT INTO bot_log (msg) VALUES ($1)', [
      `Job ${job.id} (${job.job_type}) completed`,
    ]);
  } catch (err: any) {
    await failJob(job.id, err.message);
    await query('INSERT INTO bot_log (msg) VALUES ($1)', [
      `Job ${job.id} (${job.job_type}) failed: ${err.message}`,
    ]);
  }
}

async function pollOnce(): Promise<void> {
  const job = await claimNextJob();
  if (job) await executeJob(job);
}

export function startJobPoller(intervalMs: number = 5000): void {
  if (polling) return;
  polling = true;
  pollTimer = setInterval(async () => {
    try { await pollOnce(); } catch (err: any) { console.error('Job poller error:', err.message); }
  }, intervalMs);
}

export function stopJobPoller(): void {
  polling = false;
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// --- Cron Scheduler ---

interface CronTask {
  name: string;
  cronExpr: string;
  jobType: string;
  input: Record<string, any>;
}

const cronTasks: CronTask[] = [
  {
    name: 'nightly-full-suite',
    cronExpr: 'every:24h',
    jobType: 'run_tests',
    input: { full: true },
  },
  {
    name: 'check-ci-status',
    cronExpr: 'every:30m',
    jobType: 'chat',
    input: { message: 'Check the latest GitHub CI workflow runs for any failures', context: 'global' },
  },
];

const cronTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

function parseCronInterval(expr: string): number {
  const match = expr.match(/^every:(\d+)(m|h)$/);
  if (!match) return 15 * 60_000;
  const val = parseInt(match[1]);
  return match[2] === 'h' ? val * 3600_000 : val * 60_000;
}

async function enqueueCronJob(task: CronTask): Promise<void> {
  await query(
    `INSERT INTO bot_jobs (job_type, input, scheduled_at) VALUES ($1, $2::jsonb, NOW())`,
    [task.jobType, JSON.stringify(task.input)]
  );
}

export function startCronScheduler(): void {
  for (const task of cronTasks) {
    const interval = parseCronInterval(task.cronExpr);
    const timer = setInterval(() => enqueueCronJob(task).catch(console.error), interval);
    cronTimers.set(task.name, timer);
  }
}

export function stopCronScheduler(): void {
  for (const [, timer] of cronTimers) clearInterval(timer);
  cronTimers.clear();
}

// --- Webhook Triggers ---

export async function processWebhookTrigger(source: string, eventType: string, payload: any): Promise<boolean> {
  if (source === 'github') {
    if (eventType === 'push' && payload.ref === 'refs/heads/main') {
      await query(
        `INSERT INTO bot_jobs (job_type, input, scheduled_at) VALUES ('run_tests', $1::jsonb, NOW())`,
        [JSON.stringify({ full: true, trigger: 'github_push' })]
      );
      return true;
    }
    if (eventType === 'pull_request') {
      await query(
        `INSERT INTO bot_jobs (job_type, input, scheduled_at) VALUES ('chat', $1::jsonb, NOW())`,
        [JSON.stringify({
          message: `PR ${payload.action}: "${payload.pull_request?.title}" on ${payload.repository?.name}`,
          context: 'global',
        })]
      );
      return true;
    }
  }
  return false;
}

// --- Master start/stop ---

export function startBot(): void {
  startJobPoller();
  startCronScheduler();
}

export function stopBot(): void {
  stopJobPoller();
  stopCronScheduler();
}

export async function enqueueJob(jobType: string, input: Record<string, any>, releaseId?: number): Promise<number> {
  const { rows: [job] } = await query(
    `INSERT INTO bot_jobs (job_type, release_id, input, scheduled_at) VALUES ($1, $2, $3::jsonb, NOW()) RETURNING id`,
    [jobType, releaseId || null, JSON.stringify(input)]
  );
  return job.id;
}
