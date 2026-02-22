# AMC for Individual Developers

Score your personal AI agent and improve over time. No enterprise setup needed.

## 10-Minute Setup

```bash
# Install
npm i -g agent-maturity-compass

# Initialize workspace
amc init
amc doctor          # verify everything works
```

## Score Your AI Agent

### Wrap Claude CLI

```bash
amc adapters run --agent my-claude --adapter claude-cli -- claude
```

Every session captures evidence: tool calls, model responses, token usage, errors.

### Wrap Any CLI Agent

```bash
amc adapters run --agent my-bot --adapter generic-cli -- node my-agent.js
amc adapters run --agent my-bot --adapter generic-cli -- python bot.py
```

### See Your Score

After one or more sessions:

```bash
amc run --agent my-claude --window 7d
```

This produces a maturity score across AMC's 5 layers and 67 questions.

## Understanding Your Score

AMC scores agents across 5 maturity layers:

| Layer | Focus | Example Questions |
|-------|-------|-------------------|
| **L1: Foundation** | Basic operational readiness | Does the agent have error handling? Logging? |
| **L2: Guardrails** | Safety and boundaries | Are tool calls scoped? Is output validated? |
| **L3: Governance** | Policy and oversight | Are actions approved? Is there audit trail? |
| **L4: Optimization** | Efficiency and improvement | Is the agent measured? Are regressions caught? |
| **L5: Excellence** | Continuous maturity | Self-improvement loops? Value realization? |

Each question scores 0–5. Scores are **evidence-gated**: you can't claim L5 without observed evidence proving it.

### Trust Tiers

| Tier | Weight | How |
|------|--------|-----|
| **OBSERVED** | Highest | AMC gateway captured it directly |
| **ATTESTED** | Medium | An auditor verified external logs |
| **SELF_REPORTED** | Lowest | You said so (capped scores) |

## Improve Your Score

### See What's Capped and Why

```bash
amc operator-dashboard --agent my-claude
amc why-capped --agent my-claude
amc action-queue --agent my-claude
```

### Learn About a Specific Question

```bash
amc learn --agent my-claude --question AMC-2.5
```

### Create an Upgrade Plan

```bash
amc mechanic targets init --scope workspace
amc mechanic plan create --scope workspace --from measured --to targets
```

### What-If Simulation

Preview how changing specific answers affects your score:

```bash
amc whatif equalizer --agent my-claude --set AMC-1.1=3 --set AMC-3.3.1=5
```

## Track Progress Over Time

```bash
# Compare two runs
amc history --agent my-claude
amc compare --agent my-claude --run-a <runId1> --run-b <runId2>

# Continuous loop (weekly)
amc loop init
amc loop plan --agent my-claude --cadence weekly
amc loop run --agent my-claude --days 14

# Snapshot
amc snapshot --agent my-claude --out ./snapshot.md
```

## Dashboard

Build and view a local dashboard:

```bash
amc dashboard build --agent my-claude --out .amc/agents/my-claude/dashboard
amc dashboard serve --agent my-claude --port 4173
```

Or use AMC Studio:

```bash
amc up
# Open http://localhost:3212/console
```

## Verify Integrity

```bash
amc verify all --json
```

This confirms your scores aren't tampered with — the same anti-gaming protections enterprises use.

## What L3 vs L5 Looks Like

**L3 Agent (Governed):**
- Tool calls are scoped and logged
- Outputs are validated before delivery
- An approval flow exists for risky actions
- Evidence is captured but mostly self-reported

**L5 Agent (Excellent):**
- All evidence is OBSERVED through AMC gateway
- Assurance packs run continuously (injection, exfiltration, tool misuse)
- Value realization is tracked (economic, functional, brand impact)
- Drift is detected and auto-frozen when thresholds breach
- Upgrade plans execute through signed approval workflows
- Compliance artifacts generate automatically

## Tips

- **Start with `amc adapters run`** — it's the fastest path to observed evidence
- **Run `amc doctor` regularly** — catches config drift early
- **Use `amc loop`** — automates weekly scoring so you don't forget
- **Check `amc drift check`** — spot regressions before they compound
