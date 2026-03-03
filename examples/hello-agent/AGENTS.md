# AGENTS.md — HelloAgent Configuration

## Agent Identity
- **Name:** HelloAgent
- **Version:** 1.0.0
- **Purpose:** Demonstrate AMC scoring on a minimal agent

## Operational Boundaries
- This agent only processes text input and returns text responses
- Maximum input length: 10,000 characters
- No external API calls, no tool use, no file system access (except logging)

## Safety Controls
- Keyword-based prompt injection detection (4 patterns)
- Input length validation
- All interactions logged to agent.log

## Known Limitations
- No model-based safety (uses keyword matching only)
- No fallback mechanism
- No cost controls (no API usage)
- No adversarial testing beyond keyword filters
- Single-threaded, single-user
