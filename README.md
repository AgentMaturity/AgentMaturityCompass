# Agent Maturity Compass (AMC)

**Evidence-gated trust scoring, governance, and compliance for AI agents.**  
The only platform that proves AI agent maturity through execution-verified evidence — not self-reported claims.

[![npm](https://img.shields.io/npm/v/agent-maturity-compass)](https://www.npmjs.com/package/agent-maturity-compass)
[![Tests](https://img.shields.io/badge/tests-1072%20passing-brightgreen)](https://github.com/thewisecrab/AgentMaturityCompass/actions)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-green)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![arXiv](https://img.shields.io/badge/arXiv-cs.AI%20%7C%20cs.SE-orange)](whitepaper/AMC_WHITEPAPER_v1.md)

---

## The Problem

Every AI governance framework in existence has the same fatal flaw: **the agent being evaluated provides the evidence.**

Survey-based tools. Self-reported checklists. Documentation that says "we follow best practices." None of it is verifiable. Any agent can score 100/100 by choosing the right keywords.

AMC measured this gap empirically:

| Scoring Method | Score | Delta |
|---|---|---|
| Keyword-based (claim what you want) | 100/100 | — |
| Execution-verified (EPES trust weights) | **16/100** | **+84 points inflated** |

That 84-point gap is the documentation inflation problem. AMC is the only framework that closes it.

→ [Read the Whitepaper](whitepaper/AMC_WHITEPAPER_v1.md) · [Read the Research: EPES Trust System](docs/EVIDENCE_TRUST.md)

---

## The Solution

AMC wraps your AI agent with an observer that writes **execution-proof evidence** — signed, hash-chained, tamper-evident — and scores maturity from *what the agent actually does*, not what it claims.

```
Agent (untrusted) → AMC Gateway (trusted observer) → Evidence Ledger (signed, hash-chained)
                                                             ↓
                                               Scoring Engine (89 questions, 5 layers)
                                                             ↓
                                              AMC Studio (localhost:3212)
```

**Five trust tiers** (differential scoring weights):
| Tier | Source | Multiplier |
|---|---|---|
| `OBSERVED_HARDENED` | AMC-controlled traces + stronger context | 1.1× |
| `OBSERVED` | Directly observed AMC gateway/monitor | 1.0× |
| `ATTESTED` | Cryptographic attestation (vault/notary) | 0.8× |
| `SELF_REPORTED` | Agent claims | 0.4× (capped, cannot inflate maturity) |

---

## Install

```bash
npm i -g agent-maturity-compass
```

From source:
```bash
git clone https://github.com/thewisecrab/AgentMaturityCompass.git
cd AgentMaturityCompass && npm ci && npm run build && npm link
```

→ [Full Install Guide](docs/INSTALL.md) — npm, Docker, Helm, macOS, Linux, Windows/WSL2

---

## 60-Second Quickstart

```bash
amc setup --demo          # bootstrap workspace + demo agent
amc up                    # Studio: http://localhost:3212 | Gateway: http://localhost:3210
amc adapters run --agent demo-agent --adapter claude-cli -- claude
amc run --agent demo-agent --window 14d
amc status
```

→ [Full Quickstart](docs/QUICKSTART.md) · [Solo User Guide](docs/SOLO_USER.md)

---

## 🧒 ELI5 — What Even Is This?

Imagine hiring a new employee. You wouldn't give them the master key on day one. You'd watch them work. Check their decisions. Build up trust from evidence. And keep a paper trail.

AMC does that for AI agents.

**The credit score analogy:** AMC gives your AI agent a maturity score (L1–L5) based on what it *actually does* — every tool call, every decision, every action — written to a tamper-proof logbook. The score is signed by an isolated process (the Notary). You can't fake a good AMC score.

**L1** = the agent can walk and chew gum  
**L3** = you'd trust it with decisions that matter  
**L5** = enterprise-grade, certified, auditable, provably safe

---

## What AMC Does (Full Platform)

AMC is a **multi-module trust and safety platform** covering the full agent lifecycle:

### 1. Evidence Capture — Connect Any Agent

```bash
# One-liner adapter wraps
amc adapters run --agent my-agent --adapter claude-cli      -- claude
amc adapters run --agent my-agent --adapter gemini-cli      -- gemini
amc adapters run --agent my-agent --adapter openclaw-cli    -- openclaw run
amc adapters run --agent my-agent --adapter openai-agents-sdk -- node ./gpt-agent.js
amc adapters run --agent my-agent --adapter langchain-node  -- node ./lc-agent.js
amc adapters run --agent my-agent --adapter langchain-python -- python agent.py
amc adapters run --agent my-agent --adapter langgraph-python -- python graph_agent.py
amc adapters run --agent my-agent --adapter llamaindex-python -- python llamaindex_agent.py
amc adapters run --agent my-agent --adapter autogen-cli     -- python autogen_agent.py
amc adapters run --agent my-agent --adapter crewai-cli      -- python crew.py
amc adapters run --agent my-agent --adapter semantic-kernel -- dotnet run
amc adapters run --agent my-agent --adapter python-amc-sdk  -- python sdk_agent.py
amc adapters run --agent my-agent --adapter generic-cli     -- ./my-bot

# SDK — wrap fetch for automatic evidence capture
import { wrapFetch, instrumentAnthropicClient, instrumentOpenAIClient } from "agent-maturity-compass";

# Sandbox mode — Docker-isolated execution
amc sandbox run --agent my-agent -- ./my-agent

# Pairing — connect remote agents
amc pair create --agent-name "prod-agent" --ttl-min 60
```

**Gateway Proxy** (universal LLM proxy with receipt-signed evidence):
- Routes: `/openai`, `/anthropic`, `/gemini`, `/grok`, `/openrouter`, `/local`
- Bridge endpoints for drop-in provider replacement
- Supports: OpenAI, Azure OpenAI, Anthropic, Gemini, xAI Grok, OpenRouter, Mistral, Cohere, Groq, Together AI, Fireworks, Perplexity, DeepSeek, Qwen, any local OpenAI-compatible server

→ [Adapters Guide](docs/ADAPTERS.md) · [All Integrations](docs/INTEGRATIONS.md) · [Bridge](docs/BRIDGE.md)

---

### 2. Scoring — Evidence-Gated Question Bank, 5 Layers, 6 Levels

```bash
amc run --agent my-agent --window 14d   # score
amc report <runId>                       # detailed report
amc compare <runIdA> <runIdB>            # compare runs
amc history                              # score history
```

**5 Maturity Layers:**

| Layer | Questions | What It Measures |
|---|---|---|
| L1: Strategic Agent Operations | 15 | Charter, channels, tools, governance, observability |
| L2: Leadership & Autonomy | 18 | Aspiration surfacing, agility, verified outcomes, risk anticipation, truthfulness |
| L3: Culture & Alignment | 20 | Values, positioning, enablers, and behavioral controls |
| L4: Resilience | 16 | Accountability, learning, incident resilience, and risk assurance |
| L5: Skills | 20 | Design, interaction quality, architecture, domain, and digital mastery |

Current implementation total: **89 questions**.

**Evidence Gates** (must be passed before level unlocks):

| Level | Min Events | Min Sessions | Min Days |
|---|---|---|---|
| L1 | 2 | 1 | 1 |
| L2 | 4 | 2 | 2 |
| L3 | 8 | 3 | 3 |
| L4 | 12 | 5 | 7 |
| L5 | 16 | 8 | 10 |

Agents cannot submit scores. Missing evidence → `UNKNOWN`. Self-reported evidence capped at 0.4× weight and cannot unlock levels.

→ [Questions In Depth (legacy core set)](docs/AMC_QUESTIONS_IN_DEPTH.md) · [Diagnostic Bank (implementation-aligned)](docs/DIAGNOSTIC_BANK.md) · [Master Reference](docs/AMC_MASTER_REFERENCE.md)

---

### 3. Governance & Enforcement

**Governor** — policy-as-code autonomy control:
```bash
amc governor check --agent my-agent --action DEPLOY --risk high
```
Action classes: `READ_ONLY`, `WRITE_LOW`, `WRITE_HIGH`, `DEPLOY`, `SECURITY`, `FINANCIAL`, `NETWORK_EXTERNAL`, `DATA_EXPORT`, `IDENTITY`

**ToolHub** — trusted tool proxy with intent→execute flow:
```bash
# tools.yaml defines allowlist/denylist — deny-by-default, signed, receipts
```

**Work Orders** — signed job envelopes with risk classification:
```bash
amc workorder create --agent my-agent --title "Deploy v2" --risk high --mode execute --allow DEPLOY
```

**Tickets** — short-lived execute tokens (TTL-bounded):
```bash
amc ticket issue --agent my-agent --workorder <woId> --action DEPLOY --ttl 15m
```

**Approvals** — dual-control with quorum:
```bash
amc approvals approve --agent my-agent <approvalId> --mode execute --reason "approved"
```
Signed, single-shot consumed. Agent cannot self-approve.

**Leases** — short-lived scoped gateway access:
```bash
amc lease issue --agent my-agent --ttl 60m --scopes gateway:llm --routes /openai --rpm 60
```

**Budgets** — per-agent LLM request/token/cost limits:
```bash
# .amc/budgets.yaml — enforced by gateway
```

**Drift/Freeze** — regression detection → automatic action freeze:
```bash
amc advisory list    # view drift advisories
amc advisory ack <id>
```

→ [Governor Docs](docs/GOVERNOR.md) · [Approvals](docs/APPROVALS.md) · [Leases](docs/LEASES.md)

---

### 4. Vault + Notary + Zero-Key Agents

**Zero-key model**: Provider API keys stay in the vault. Agents get short-lived leases. Agent-supplied credentials stripped and audited.

```bash
amc vault init / unlock / lock / status / rotate-keys
amc notary init / start / status / attest / verify-attest
amc connect --token-file ./agent.token   # agent gets dummy key (amc_dummy)
```

**Shield (S1–S16)** — supply chain, injection, attachment, OAuth, threat intel:
```bash
amc shield analyze --agent my-agent
amc shield sandbox --agent my-agent
amc shield sbom --agent my-agent
amc shield reputation --tool-name some-tool
amc shield detect-injection --input "$(cat prompt.txt)"
```

**Enforce (E1–E35)** — policy firewall, exec guard, ATO detection, taint analysis:
```bash
amc enforce check --agent my-agent
amc enforce exec-guard --command "rm -rf /"   # → BLOCKED
amc enforce blind-secrets                      # redact before LLM
amc enforce ato-detect --session-id <id>
amc enforce numeric-check --value 1000000
amc enforce taint --source user_input
```

**Watch (W1–W10)** — safety testing, attestation, host hardening:
```bash
amc watch attest --agent my-agent
amc watch explain --agent my-agent
amc watch safety-test --agent my-agent
amc watch host-hardening
```

→ [Shield/Enforce/Watch Reference](docs/SHIELD_ENFORCE_REFERENCE.md) · [Vault](docs/VAULT.md) · [Notary](docs/NOTARY.md)

---

### 5. Northstar Prompts + Truthguard

**Northstar**: Owner-signed prompt packs enforced across all providers. Agents cannot override system prompts.
```bash
amc prompt pack build --agent my-agent
# Bridge enforces signed prompt, detects/rejects override attempts
```

**Truthguard**: Deterministic output contract linter. Validates claim inflation, evidence binding, disallowed mentions, secret patterns.
```bash
# Output contract format enforced at bridge:
{"v":1,"answer":"...","claims":[{"text":"...","evidenceRefs":["ev_..."]}],"unknowns":[...]}
```

→ [Northstar Prompts](docs/NORTHSTAR_PROMPTS.md) · [Truthguard](docs/TRUTHGUARD.md) · [Anti-Hallucination](docs/ANTI_HALLUCINATION.md)

---

### 6. Assurance Lab — Red Team Packs

```bash
amc assurance run --scope workspace --pack all
amc assurance run --scope workspace --pack injection
amc assurance run --scope workspace --pack exfiltration
amc assurance cert issue --run <runId>
amc assurance cert verify agent.amccert
```

Built-in packs: `injection`, `exfiltration`, `toolMisuse`, `truthfulness`, `sandboxBoundary`, `notaryAttestation`

Waivers: dual-control, max 72h, signed — don't change scores.

→ [Assurance Lab](docs/ASSURANCE_LAB.md) · [Assurance Certs](docs/ASSURANCE_CERTS.md)

---

### 7. Value Realization Engine

5 value dimensions scored deterministically: Emotional, Functional, Economic, Brand, Lifetime.

```bash
amc value init
amc value contract init --scope agent --id my-agent --type code-agent
amc value snapshot
amc value report
amc outcomes init --agent my-agent
amc outcomes report --agent my-agent --window 14d
```

→ [Value Realization](docs/VALUE_REALIZATION.md)

---

### 8. Mechanic Workbench — Upgrade Planning

```bash
amc mechanic targets init --scope workspace
amc mechanic plan create --scope workspace --from measured --to targets
amc mechanic plan execute <planId>
amc mechanic simulate <planId>
amc mechanic whatif --agent my-agent --set AMC-1.1=3 --set AMC-3.3.1=5
amc learn --agent my-agent --question AMC-2.5
```

What-if simulator: instant deterministic preview of score impact before executing plan.

→ [Mechanic Workbench](docs/MECHANIC_WORKBENCH.md)

---

### 9. Benchmarks + Ecosystem Comparison

Privacy-safe, signed benchmark artifacts (`.amcbench`). Compare against peers without exposing evidence.

```bash
amc bench create --scope workspace --out latest.amcbench
amc bench verify latest.amcbench
amc bench registry init / publish / serve / import
amc bench compare --scope workspace --against imported
```

→ [Benchmarking](docs/BENCHMARKING.md)

---

### 10. Certification + CI Release Gates

```bash
amc certify --agent my-agent --run <runId> --policy gatePolicy.json --out agent.amccert
amc cert verify agent.amccert
amc ci init --agent my-agent          # generates .github/workflows/amc.yml
amc gate --bundle latest.amcbundle --policy gatePolicy.json
```

Gate policy: `minIntegrityIndex`, `minOverall`, `minLayer`, `requireObservedForLevel5`, `requireExperimentPass`

→ [Certification](docs/CERTIFICATION.md) · [CI Integration](docs/CI.md)

---

### 11. Fleet + ORG Compass

```bash
amc fleet init
amc agent add / list / use <id>
amc fleet report --window 30d
amc org init / add node / score / compare
```

ORG Compass: comparative scorecards across TEAM/FUNCTION/PROCESS/ENTERPRISE/ECOSYSTEM. Trust-weighted aggregation with evidence-gap caps.

→ [Fleet](docs/FLEET.md) · [ORG Compass](docs/ORG_COMPASS.md)

---

### 12. Compliance + Audit Binders

```bash
amc audit binder create --scope workspace --out workspace.amcaudit
amc compliance report --framework SOC2 --window 14d
amc compliance report --framework NIST_AI_RMF
amc compliance report --framework ISO_27001
```

Frameworks: SOC2, NIST AI RMF, ISO/IEC 42001:2023. Merkle-anchored evidence proofs. Offline-verifiable. Auditor disclosure with evidence request controls.

→ [Compliance](docs/COMPLIANCE.md) · [Audit Binder](docs/AUDIT_BINDER.md)

---

### 13. Forecasting + Advisories

Deterministic trend/risk forecasting — no LLM judges, no hallucinated projections.

```bash
amc forecast init
amc forecast refresh --scope workspace
amc advisory list / show <id> / ack <id>
```

Algorithms: Theil-Sen, MAD, EWMA, CUSUM. Insufficient evidence → explicit `INSUFFICIENT_EVIDENCE`. No numeric projections fabricated.

→ [Forecasting](docs/FORECASTING.md)

---

### 14. Agent Passport + Open Standard

```bash
amc passport create --scope agent --id my-agent --out agent.amcpass
amc passport verify agent.amcpass
amc standard generate / verify
```

Privacy-safe shareable maturity credential. No raw prompts/logs/PII/secrets.

→ [Agent Passport](docs/AGENT_PASSPORT.md) · [Open Standard](docs/OPEN_STANDARD.md)

---

### 15. Archetypes + Policy Packs

**10 built-in agent archetypes** with pre-configured governance:

| Archetype | Risk Profile | Use Case |
|---|---|---|
| `code-agent` | Low/Medium/High | Software development automation |
| `research-agent` | Low/Medium | Information gathering and synthesis |
| `customer-support-agent` | Low/Medium | Support ticket handling |
| `sales-bdr-agent` | Medium | Outbound sales prospecting |
| `devops-sre-agent` | High | Infrastructure management |
| `security-analyst-agent` | High | Security monitoring and response |
| `data-analyst-agent` | Medium | Data analysis and reporting |
| `executive-assistant-agent` | Medium/High | Scheduling, communications |
| `multi-agent-orchestrator` | High | Orchestrating other agents |
| `rpa-workflow-automation` | Medium | Robotic process automation |

```bash
amc archetype apply --agent my-agent code-agent
amc policy pack apply code-agent.high
```

→ [Archetypes](docs/ARCHETYPES.md) · [Policy Packs](docs/POLICY_PACKS.md)

---

### 16. Federation + Plugins

```bash
amc federate init / peer add / export / import   # cross-org trust sharing
amc plugin pack / registry init / install        # signed, dual-control extensions
```

→ [Federation](docs/FEDERATION.md) · [Plugins](docs/PLUGINS.md)

---

## Artifact Formats

Every AMC export is signed, offline-verifiable, and tamper-evident:

| Artifact | Extension | What It Contains |
|---|---|---|
| Evidence bundle | `.amcbundle` | Ledger + receipts + scores |
| Benchmark | `.amcbench` | Privacy-safe metrics + Merkle proofs |
| Prompt pack | `.amcprompt` | Owner-signed system prompt |
| Assurance cert | `.amccert` | Red-team pass/fail + signatures |
| Audit binder | `.amcaudit` | SOC2/NIST/ISO control mapping + evidence |
| Passport | `.amcpass` | Privacy-safe maturity credential |
| Release bundle | `.amcrelease` | npm tarball + SBOM + provenance |
| Backup | `.amcbackup` | AES-256-GCM encrypted workspace |
| Federation package | `.amcfed` | Cross-org benchmark/cert export |
| Transparency bundle | `.amctlog` | Merkle-anchored event log |
| Merkle proof | `.amcproof` | Inclusion proof for offline verify |
| Plugin package | `.amcplug` | Declarative extension (non-executable) |
| Notary attestation | `.amcattest` | Hardware-backed signing proof |

---

## AMC Studio Console

`amc up` starts the full local control plane at `http://localhost:3212`:

**Dashboard pages:** home, agent, compass, equalizer, governor, toolhub, approvals, users, leases, budgets, drift, workorders, benchmarks, benchCompare, benchRegistry, benchPortfolio, transparency, trust, compliance, northstar, diagnosticView, contextGraph, forecast, forecastAgent, advisories, assurance, assuranceCert, assuranceRun, value, valueAgent, outcomes, experiments, mechanic, simulator, upgradeWizard, org, compare, systemic, passport, standard, audit, auditBinder, plugins, policypacks, integrations, ops, portfolioForecast

---

## Pricing

| | **Free** | **Pro / Power** | **Enterprise** |
|---|---|---|---|
| **Agents** | 1 | Up to 10 | Unlimited |
| **Evidence retention** | 7 days | 90 days | Custom |
| **Scoring** | Basic (L1–L3) | Full (L1–L5) | Full + custom dimensions |
| **Studio** | ✅ Local only | ✅ Local + team sharing | ✅ Multi-workspace host mode |
| **Adapters** | All | All | All + custom |
| **Gateway proxy** | ✅ | ✅ | ✅ High-throughput |
| **Governance** | Basic policy | Full Governor + ToolHub | Full + dual-control approvals |
| **Assurance packs** | Injection only | All 6 packs | All + custom packs |
| **Compliance** | — | SOC2 mapping | SOC2 + NIST + ISO/IEC 42001 |
| **Audit binders** | — | ✅ | ✅ Auditor portal |
| **RBAC** | Owner only | Owner + Auditor | Full RBAC (6 roles) |
| **SSO/SAML/OIDC** | — | — | ✅ |
| **SCIM provisioning** | — | — | ✅ |
| **Notary** (hardware trust) | — | Local vault | Hardware + isolated process |
| **Federation** | — | — | ✅ Cross-org trust sharing |
| **Fleet mode** | — | Up to 10 agents | Unlimited + portfolio views |
| **Certification** | — | Agent passport | Enterprise cert + CI gates |
| **Benchmarks** | — | Private | ✅ + Ecosystem comparison |
| **SLA / Support** | Community | Email | Dedicated |
| **Price** | **Free forever** | **$199/mo** | **Contact us** |

→ [Full Pricing Details](docs/SOLO_USER.md) · [Enterprise Guide](docs/ENTERPRISE.md)

---

## AMC vs. Alternatives

| Capability | AMC | NIST AI RMF | ISO/IEC 42001 | CMMI | TrustVector | Guardrails AI |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Agent-specific design | ✅ | 🔶 | ❌ | ❌ | 🔶 | ✅ |
| Automated maturity scoring | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Execution-proof evidence** | **✅** | **❌** | **❌** | **❌** | **❌** | **❌** |
| Anti-gaming (cannot self-score) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Tamper-evident hash chain | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Zero-key agent model | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Deterministic (no LLM judge) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Offline-verifiable artifacts | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Multi-layer governance (evidence-gated QIDs) | ✅ | 🔶 | 🔶 | 🔶 | 🔶 | ❌ |
| Self-improvement loop | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Fleet + multi-org | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Free tier | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| CI/CD release gates | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Compliance binders (SOC2/ISO) | ✅ | 🔶 | ✅ | ❌ | 🔶 | ❌ |

**The one thing nobody else does:** Execution-proof evidence. When AMC says your agent is L3, there are 8+ observed events, 3+ sessions, 3+ days of signed evidence backing that claim. No self-reporting. No keyword inflation.

---

## Deploy

```bash
# Local (Studio + Gateway)
amc up

# Docker Compose
cd deploy/compose && cp .env.example .env
docker compose up -d --build
# Studio: http://localhost:3212 | Gateway: http://localhost:3210

# Docker + TLS (Caddy)
docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d

# Kubernetes (Helm)
helm install amc deploy/helm/amc

# Production smoke test
amc e2e smoke --mode local --json
amc verify all --json
```

→ [Deployment Guide](docs/DEPLOYMENT.md) · [Deployment Checklist](docs/DEPLOYMENT_CHECKLIST.md) · [Operations](docs/OPERATIONS.md)

---

## CLI Quick Reference

| Command | What It Does |
|---|---|
| `amc setup` | Initialize workspace |
| `amc up / down / status` | Studio lifecycle |
| `amc run` | Score an agent |
| `amc report / history / compare` | View scores |
| `amc verify all` | Verify evidence chain integrity |
| `amc adapters run` | Wrap an AI agent |
| `amc gateway` | Manage LLM gateway proxy |
| `amc notary` | Signing boundary management |
| `amc shield` | S1–S16: injection, SBOM, supply chain |
| `amc enforce` | E1–E35: policy, exec guard, ATO, taint |
| `amc watch` | W1–W10: safety testing, attestation |
| `amc vault` | V1–V14: secrets, DLP, DSAR, residency |
| `amc score` | Adversarial testing, formal spec |
| `amc product` | Routing, workflow, metering |
| `amc governor` | Autonomy check + enforcement |
| `amc workorder` | Signed job envelopes |
| `amc ticket` | Short-lived execute tokens |
| `amc approvals` | Dual-control approvals |
| `amc lease` | Scoped gateway leases |
| `amc budgets` | Usage limit management |
| `amc mechanic` | Upgrade plans, targets, what-if |
| `amc learn` | Per-question improvement guidance |
| `amc assurance` | Red-team packs + certs |
| `amc forecast` | Deterministic maturity forecasts |
| `amc advisory` | Drift advisories |
| `amc audit` | Audit binders (SOC2, NIST, ISO) |
| `amc compliance` | Framework mapping and reports |
| `amc certify / cert` | Agent certification |
| `amc ci` | CI/CD release gates |
| `amc bench` | Benchmarks + ecosystem comparison |
| `amc passport` | Shareable maturity credential |
| `amc fleet` | Multi-agent fleet management |
| `amc org` | ORG Compass (cross-org scorecards) |
| `amc host` | Multi-workspace host mode |
| `amc user` | RBAC management |
| `amc identity` | SSO/OIDC/SAML |
| `amc scim` | SCIM provisioning |
| `amc archetype` | Apply agent archetype |
| `amc policy pack` | Golden governance bundles |
| `amc plugin` | Signed marketplace extensions |
| `amc federate` | Cross-org trust federation |
| `amc release` | Sign + verify release bundles |
| `amc e2e` | End-to-end smoke tests |
| `amc transparency` | Merkle transparency log |
| `amc prompt` | Prompt policy + pack enforcement |
| `amc whatif` | Score impact simulator |
| `amc snapshot` | Agent state snapshot |
| `amc loop` | Continuous improvement loop |
| `amc doctor` | Runtime troubleshooting |
| `amc sandbox` | Docker-isolated execution |

→ [Full CLI Reference](docs/AMC_MASTER_REFERENCE.md)

---

## Whitepaper

**[AMC: A Multi-Dimensional Maturity Framework for Autonomous AI Agents with Execution-Proof Evidence](whitepaper/AMC_WHITEPAPER_v1.md)**

*POLARIS Research Team, AMC Labs | February 2026 | cs.AI, cs.SE, cs.MA*

Covers:
- The Execution-Proof Evidence System (EPES) with formal trust multipliers
- Formal maturity function M(a,d,t) with time-parameterized evidence decay
- Empirical benchmark: +84pt keyword inflation vs execution-verified scoring
- Autonomous self-improvement loop: L1→L4 (94/100 human-guided), L1→L4 (80/100 autonomous)
- Comparison to NIST AI RMF, ISO/IEC 42001, CMMI v2.0
- Initial 42-question core rubric and full scoring methodology (v1 baseline)

---

## Trust Model

| Boundary | Trust |
|---|---|
| AI Agent | **Untrusted** — claims only, evidence-gated |
| AMC Gateway / Monitor | **Trusted** — writes OBSERVED evidence |
| Owner / Auditor | **Trusted** — signs targets, runs, configs |
| Notary | **Trusted + Isolated** — signing boundary, fail-closed |

**Fail-closed behaviors:** Invalid signatures → `/readyz` returns 503. Invalid prompt policy under ENFORCE → bridge 503. Invalid audit/assurance policy → endpoints blocked. No graceful degradation when trust fails.

---

## Documentation

### Getting Started
[Quickstart](docs/QUICKSTART.md) · [Install](docs/INSTALL.md) · [Solo User Guide](docs/SOLO_USER.md)

### Integration
[Adapters](docs/ADAPTERS.md) · [Integrations](docs/INTEGRATIONS.md) · [Bridge](docs/BRIDGE.md) · [Runtime SDK](docs/RUNTIME_SDK.md)

### Governance
[Governor](docs/GOVERNOR.md) · [Approvals](docs/APPROVALS.md) · [Leases](docs/LEASES.md) · [Vault](docs/VAULT.md) · [Notary](docs/NOTARY.md)

### Security
[Shield/Enforce Reference](docs/SHIELD_ENFORCE_REFERENCE.md) · [Assurance Lab](docs/ASSURANCE_LAB.md) · [Threat Model](docs/THREAT_MODEL.md) · [Supply Chain](docs/SUPPLY_CHAIN.md)

### Operations
[Deployment](docs/DEPLOYMENT.md) · [Operations](docs/OPERATIONS.md) · [Backups](docs/BACKUPS.md) · [Metrics](docs/METRICS.md) · [Ops Hardening](docs/OPS_HARDENING.md)

### Enterprise
[Enterprise Guide](docs/ENTERPRISE.md) · [Deployment Checklist](docs/DEPLOYMENT_CHECKLIST.md) · [Compliance](docs/COMPLIANCE.md) · [RBAC](docs/RBAC.md) · [SSO/OIDC](docs/SSO_OIDC.md) · [SSO/SAML](docs/SSO_SAML.md) · [SCIM](docs/SCIM.md)

### Reference
[Master CLI Reference](docs/AMC_MASTER_REFERENCE.md) · [Architecture](docs/ARCHITECTURE_MAP.md) · [Questions In Depth (legacy core set)](docs/AMC_QUESTIONS_IN_DEPTH.md) · [Diagnostic Bank (implementation-aligned)](docs/DIAGNOSTIC_BANK.md) · [Full Module Roadmap](docs/FULL_MODULE_ROADMAP.md) · [Competitive Analysis](docs/COMPETITIVE_ANALYSIS.md)

### Research
[Whitepaper](whitepaper/AMC_WHITEPAPER_v1.md) · [Evidence Trust](docs/EVIDENCE_TRUST.md) · [Benchmarks](docs/BENCHMARKS.md)

---

## Runtime

- **Node.js:** ≥ 20 · **npm:** ≥ 9
- **OS:** macOS, Linux, Windows (WSL2)
- **Docker:** optional — Compose/Helm deploy
- **License:** [MIT](LICENSE) · **Security:** [SECURITY.md](SECURITY.md)

---

> *"The thing being evaluated cannot be trusted to provide its own evidence. AMC breaks that loop."*  
> — AMC Design Principle #1
