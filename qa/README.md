# AMC QA RelOps System

AI-powered release operations for **Agent Maturity Compass** — orchestrates testing, triage, release gates, and CI monitoring via an intelligent bot engine.

## Architecture

```
Layer 1: Express + WebSocket (real-time updates)
Layer 2: RESTful API (bot, releases, integrations, webhooks, test runs)
Layer 3: Bot Engine (Anthropic Claude tool-calling loop)
Layer 4: GitHub Integration (PRs, releases, CI workflows)
Layer 5: Vitest Runner (5031 AMC tests, 336 test files)
Layer 6: PostgreSQL (releases, test runs, job queue, audit trail)
```

## Features

- **AI Bot Engine** — Chat-based QA assistant with tool-calling (Anthropic Claude)
- **GitHub Integration** — PRs, releases, CI workflow monitoring for AgentMaturity/AgentMaturityCompass
- **Vitest Runner** — Run full 5031-test suite or filtered subsets
- **AI Triage** — Auto-classify failures as real_bug / flaky / env_issue
- **Release Gates** — Automated go/no-go checks (bugs zero, tests green, all triaged)
- **Job Queue** — PostgreSQL-backed background task processing
- **Cron Scheduler** — Nightly full test runs, periodic CI checks
- **Webhooks** — GitHub push/PR events trigger test runs

## Setup

```bash
cd qa
cp .env.example .env     # Fill in ANTHROPIC_API_KEY
createdb amc_qa          # Or your preferred database name
npm install
npm run migrate
npm run dev
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/bot/chat` | Chat with QA bot |
| GET | `/api/bot/history` | Conversation history |
| POST | `/api/bot/start` | Start bot engine |
| POST | `/api/bot/stop` | Stop bot engine |
| GET | `/api/bot/log` | Bot activity log |
| GET | `/api/releases` | List releases |
| POST | `/api/releases` | Create release |
| GET | `/api/test-runs` | List test runs |
| POST | `/api/test-runs/:id/triage` | AI-triage failures |
| GET | `/api/integrations` | Integration status |
| POST | `/api/webhooks/github` | GitHub webhook endpoint |

## Extension

For architecture patterns and guides: see the `openclaw-qa-guide` skill.
