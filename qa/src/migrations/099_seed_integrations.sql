INSERT INTO integrations (service, status, config) VALUES
  ('anthropic', 'not_configured', '{}'),
  ('github', 'not_configured', '{"owner": "AgentMaturity"}')
ON CONFLICT (service) DO NOTHING;
