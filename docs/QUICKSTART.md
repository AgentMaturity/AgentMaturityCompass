# AMC Quickstart

Get from zero to your first agent maturity score in under 5 minutes.

## Prerequisites

- **Node.js ≥ 20** — [install](https://nodejs.org)
- **macOS, Linux, or Windows (WSL2)**

## 1. Install & Setup

```bash
git clone https://github.com/thewisecrab/AgentMaturityCompass.git
cd AgentMaturityCompass
npm ci && npm run build && npm link
```

## 2. Initialize Demo Workspace

```bash
amc setup --demo
```

This creates a `.amc/` workspace with demo agents, sample evidence, and default targets. You'll see:

```
✔ Workspace initialized
✔ Demo agent "demo-agent" created
✔ Sample evidence ingested
✔ Gateway config written
✔ Vault initialized (dev mode)
```

## 3. Start AMC Studio

```bash
amc up
```

Studio starts the full local control plane:
- **Studio API** — `http://localhost:3212`
- **Gateway proxy** — `http://localhost:3210`
- **Compass Console** — `http://localhost:3212/console`

## 4. Score Your First Agent

```bash
amc run --agent demo-agent --window 14d --target default
```

Output includes the 5-layer maturity score (L1–L5), per-question breakdown, integrity index, and evidence coverage.

## 5. View in Console

Open `http://localhost:3212/console` in your browser. You'll see:
- **Maturity radar** — 67 questions across 5 layers
- **Evidence timeline** — what was observed vs self-reported
- **Trust tier badges** — OBSERVED, ATTESTED, SELF_REPORTED
- **Integrity index** — anti-gaming confidence score

## 6. Wrap a Real Agent

Score your actual Claude CLI usage:

```bash
amc adapters run --agent my-claude --adapter claude-cli -- claude --model claude-sonnet-4-6
```

After the session, re-run scoring:

```bash
amc run --agent my-claude --window 7d
```

## 7. Verify Everything

```bash
amc verify all --json
```

Confirms ledger integrity, signature chains, policy compliance, and artifact hashes.

## Next Steps

| Goal | Guide |
|------|-------|
| Install on your OS/infra | [INSTALL.md](INSTALL.md) |
| Wrap any AI agent | [ADAPTERS.md](ADAPTERS.md) |
| Enterprise deployment | [ENTERPRISE.md](ENTERPRISE.md) |
| All provider integrations | [INTEGRATIONS.md](INTEGRATIONS.md) |
| Solo developer workflow | [SOLO_USER.md](SOLO_USER.md) |
| Full CLI reference | [AMC_MASTER_REFERENCE.md](AMC_MASTER_REFERENCE.md) |
| Production checklist | [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) |

## Troubleshooting

**`amc: command not found`** — Run `npm link` from the repo root, or use `npx agent-maturity-compass`.

**`amc doctor` reports issues** — Run `amc doctor-fix` to auto-repair common problems.

**Port 3212 in use** — Set `AMC_STUDIO_PORT=3213` before `amc up`.

**Node.js version too old** — AMC requires Node.js ≥ 20. Check with `node --version`.

**Vault locked** — Run `amc vault unlock` before operations that need secrets.
