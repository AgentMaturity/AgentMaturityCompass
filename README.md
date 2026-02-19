# Agent Maturity Compass (AMC)

**Evidence-gated trust scoring for AI agents.** AMC is a TypeScript CLI + SDK that measures, enforces, and proves the maturity of any AI agent — from solo developer bots to enterprise fleets — using a signed, append-only evidence ledger, 42-question diagnostic across 5 maturity layers, and anti-gaming protections that make scores tamper-evident and verifiable.

## Why AMC

- **Governance** — Know what your AI agents are doing, enforce what they're allowed to do
- **Compliance** — SOC2-mapped evidence, offline-verifiable audit binders, Merkle transparency proofs
- **Anti-gaming** — Scores are evidence-gated (not self-reported), signed by an isolated notary, and hash-chained
- **Zero-key agents** — Provider API keys stay in the vault; agents get short-lived leases
- **Works with everything** — Claude, GPT-4o, Gemini, Grok, OpenRouter, OpenClaw, Ollama, any CLI

## 60-Second Quickstart

```bash
npm i -g agent-maturity-compass
amc setup --demo
amc up                  # Studio at http://localhost:3212
amc adapters run --agent demo-agent --adapter claude-cli -- claude
amc run --agent demo-agent --window 7d
```

→ [Full Quickstart Guide](docs/QUICKSTART.md)

## Install

```bash
# npm
npm i -g agent-maturity-compass

# From source
git clone https://github.com/thewisecrab/AgentMaturityCompass.git
cd AgentMaturityCompass && npm ci && npm run build && npm link

# Docker
cd deploy/compose && cp .env.example .env && docker compose up -d --build

# Kubernetes
helm install amc deploy/helm/amc
```

→ [Full Installation Guide](docs/INSTALL.md)

## Wrap Any AI Agent

```bash
# Claude
amc adapters run --agent my-agent --adapter claude-cli -- claude

# Gemini
amc adapters run --agent my-agent --adapter gemini-cli -- gemini

# OpenClaw
amc adapters run --agent my-agent --adapter openclaw-cli -- openclaw run

# Any CLI
amc adapters run --agent my-agent --adapter generic-cli -- node my-bot.js
```

```typescript
// Node.js SDK — wrap fetch for automatic evidence capture
import { wrapFetch } from "agent-maturity-compass";
const fetch = wrapFetch(globalThis.fetch, {
  agentId: "my-agent",
  gatewayBaseUrl: "http://localhost:3210/openai",
});
```

→ [Adapters Guide](docs/ADAPTERS.md) · [All Provider Integrations](docs/INTEGRATIONS.md)

## Score, Verify, Improve

```bash
amc run --agent my-agent --window 14d        # score
amc verify all --json                         # verify integrity
amc mechanic plan create --scope workspace    # upgrade plan
amc learn --agent my-agent --question AMC-2.5 # learn
```

## Key Features

| Feature | Description | Docs |
|---------|-------------|------|
| **5-Layer Scoring** | 42 questions across Foundation → Excellence | [AMC_MASTER_REFERENCE.md](docs/AMC_MASTER_REFERENCE.md) |
| **Adapters** | One-liner wraps for Claude, Gemini, OpenClaw, any CLI | [ADAPTERS.md](docs/ADAPTERS.md) |
| **Gateway Proxy** | Universal LLM proxy with receipt-signed evidence | [PROVIDERS.md](docs/PROVIDERS.md) |
| **Assurance Lab** | Red-team packs: injection, exfiltration, tool misuse | [ASSURANCE_LAB.md](docs/ASSURANCE_LAB.md) |
| **Governor** | Autonomy enforcement based on maturity level | [GOVERNOR.md](docs/GOVERNOR.md) |
| **Vault** | Encrypted secrets, zero-key agents, lease-based access | [VAULT.md](docs/VAULT.md) |
| **Notary** | Isolated anti-cheat signing boundary | [NOTARY.md](docs/NOTARY.md) |
| **Compliance** | SOC2 maps, audit binders, Merkle proofs | [COMPLIANCE.md](docs/COMPLIANCE.md) |
| **Org Graph** | Comparative scorecards across teams/enterprise | [ECOSYSTEM_COMPARATIVE_VIEW.md](docs/ECOSYSTEM_COMPARATIVE_VIEW.md) |
| **Mechanic Workbench** | Targets, upgrade plans, what-if simulation | [MECHANIC_WORKBENCH.md](docs/MECHANIC_WORKBENCH.md) |
| **Value Realization** | 5 value dimensions with evidence-gated scoring | [VALUE_REALIZATION.md](docs/VALUE_REALIZATION.md) |
| **Agent Passport** | Shareable, privacy-safe maturity credential | [AGENT_PASSPORT.md](docs/AGENT_PASSPORT.md) |
| **Fleet Mode** | Multi-agent management and fleet reporting | [FLEET.md](docs/FLEET.md) |
| **Forecasting** | Evidence-gated maturity forecasts and advisories | [FORECASTING.md](docs/FORECASTING.md) |
| **Experiments** | Baseline vs candidate validation before rollout | [EXPERIMENTS.md](docs/EXPERIMENTS.md) |
| **Plugin Marketplace** | Signed, dual-control extension ecosystem | [PLUGINS.md](docs/PLUGINS.md) |
| **Federation** | Cross-org trust sharing with offline sync | [FEDERATION.md](docs/FEDERATION.md) |

## Enterprise

```bash
amc host init                    # multi-workspace host mode
amc user init                    # RBAC (OWNER, AUDITOR, APPROVER, OPERATOR)
amc identity init                # SSO/OIDC/SAML
amc scim token create            # SCIM provisioning
amc compliance report --framework SOC2
amc audit binder create --scope workspace
```

→ [Enterprise Guide](docs/ENTERPRISE.md) · [Deployment Checklist](docs/DEPLOYMENT_CHECKLIST.md)

## Deploy

| Method | Command |
|--------|---------|
| **Docker Compose** | `cd deploy/compose && docker compose up -d --build` |
| **Docker + TLS** | `docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d` |
| **Helm/K8s** | `helm install amc deploy/helm/amc` |
| **Foreground** | `amc studio start` |

→ [Deployment Guide](docs/DEPLOYMENT.md) · [Operations](docs/OPERATIONS.md)

## Verify & Release

```bash
npm ci && npm test && npm run build
amc e2e smoke --mode local --json
amc verify all --json
amc release pack --out ./amc.amcrelease
amc release verify ./amc.amcrelease
```

## Documentation

### Getting Started
- [Quickstart](docs/QUICKSTART.md) — zero to first score in 5 minutes
- [Installation](docs/INSTALL.md) — npm, Docker, Helm, all platforms
- [Solo User Guide](docs/SOLO_USER.md) — individual developer workflow

### Integration
- [Adapters](docs/ADAPTERS.md) — wrap any AI agent
- [Integrations](docs/INTEGRATIONS.md) — all provider guides
- [Runtime SDK](docs/RUNTIME_SDK.md) — Node.js embed helpers
- [Bridge](docs/BRIDGE.md) — connect remote agents

### Enterprise
- [Enterprise Guide](docs/ENTERPRISE.md) — multi-workspace, RBAC, SSO, compliance
- [Deployment Checklist](docs/DEPLOYMENT_CHECKLIST.md) — production go-live gate

### Reference
- [Master CLI Reference](docs/AMC_MASTER_REFERENCE.md) — every `amc` command
- [Shield/Enforce/Watch Reference](docs/SHIELD_ENFORCE_REFERENCE.md) — security module commands
- [Architecture](docs/ARCHITECTURE_MAP.md)

### Operations
- [Deployment](docs/DEPLOYMENT.md) · [Operations](docs/OPERATIONS.md) · [Security](docs/SECURITY_DEPLOYMENT.md)
- [Backups](docs/BACKUPS.md) · [Retention](docs/OPS_HARDENING.md) · [Metrics](docs/METRICS.md)
- [Release Runbook](docs/RELEASE_RUNBOOK.md) · [Supply Chain](docs/SUPPLY_CHAIN.md)

## Trust Model

| Boundary | Trust Level |
|----------|-------------|
| AI Agent | **Untrusted** — claims only, evidence-gated |
| AMC Gateway/Monitor | **Trusted** — writes observed evidence |
| Owner/Auditor | **Trusted** — signs targets, runs, configs |
| Notary (optional) | **Trusted** — isolated signing, fail-closed |

## Runtime

- **npm:** `agent-maturity-compass`
- **CLI:** `amc`
- **Node.js:** `≥ 20`
- **License:** See [LICENSE](LICENSE)
- **Security:** See [SECURITY.md](SECURITY.md)
