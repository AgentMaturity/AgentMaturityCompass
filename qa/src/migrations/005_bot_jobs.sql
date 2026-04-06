CREATE TABLE IF NOT EXISTS bot_jobs (
  id SERIAL PRIMARY KEY,
  job_type VARCHAR(50) NOT NULL,
  release_id INTEGER REFERENCES releases(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  input JSONB DEFAULT '{}',
  output JSONB,
  error TEXT,
  scheduled_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  finished_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bot_jobs_status ON bot_jobs(status);
CREATE INDEX IF NOT EXISTS idx_bot_jobs_scheduled ON bot_jobs(scheduled_at);
