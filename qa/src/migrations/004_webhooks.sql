CREATE TABLE IF NOT EXISTS webhook_events (
  id SERIAL PRIMARY KEY,
  source VARCHAR(30) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_source ON webhook_events(source);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON webhook_events(created_at);
