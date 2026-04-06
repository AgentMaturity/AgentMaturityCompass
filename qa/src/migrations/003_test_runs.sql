CREATE TABLE IF NOT EXISTS test_runs (
  id SERIAL PRIMARY KEY,
  release_id INTEGER REFERENCES releases(id) ON DELETE SET NULL,
  runner VARCHAR(30) NOT NULL,
  platform VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  total_tests INTEGER DEFAULT 0,
  passed INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  report_url TEXT,
  error_summary TEXT,
  metadata JSONB DEFAULT '{}',
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_test_runs_release ON test_runs(release_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_status ON test_runs(status);

CREATE TABLE IF NOT EXISTS test_failures (
  id SERIAL PRIMARY KEY,
  test_run_id INTEGER REFERENCES test_runs(id) ON DELETE CASCADE,
  test_name TEXT NOT NULL,
  error_message TEXT,
  stack_trace TEXT,
  screenshot_url TEXT,
  video_url TEXT,
  triage_status VARCHAR(20) DEFAULT 'untriaged',
  ticket_id VARCHAR(60),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_test_failures_run ON test_failures(test_run_id);
CREATE INDEX IF NOT EXISTS idx_test_failures_triage ON test_failures(triage_status);
