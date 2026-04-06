CREATE TABLE IF NOT EXISTS validation_results (
  id SERIAL PRIMARY KEY,
  release_id INTEGER REFERENCES releases(id) ON DELETE CASCADE,
  gate_name VARCHAR(50) NOT NULL,
  passed BOOLEAN NOT NULL,
  checks JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_validation_release ON validation_results(release_id);
