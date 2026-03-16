<p align="center">
  <img src="https://img.shields.io/badge/🧭_AMC-Score_Fix_Ship_AI_Agents-4AEF79?style=for-the-badge&labelColor=0a0a0a" alt="AMC" />
</p>

<h1 align="center">Agent Maturity Compass</h1>

<p align="center">
  <strong>Score your AI agent. Find the gaps. Fix them.</strong><br>
  2 minutes to your first score. Free and open source.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/agent-maturity-compass"><img src="https://img.shields.io/npm/v/agent-maturity-compass?labelColor=0a0a0a&color=4AEF79" alt="npm" /></a>
  <a href="https://www.npmjs.com/package/agent-maturity-compass"><img src="https://img.shields.io/npm/dm/agent-maturity-compass?labelColor=0a0a0a&color=4AEF79" alt="downloads" /></a>
  <a href="#"><img src="https://img.shields.io/badge/tests-3%2C549%20passing-4AEF79?labelColor=0a0a0a" alt="tests" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-4AEF79?labelColor=0a0a0a" alt="MIT" /></a>
  <a href="docs/AMC_MASTER_REFERENCE.md"><img src="https://img.shields.io/badge/CLI%20commands-481-4AEF79?labelColor=0a0a0a" alt="commands" /></a>
</p>

<p align="center">
  <a href="https://thewisecrab.github.io/AgentMaturityCompass/playground.html">🎮 Web Playground</a> ·
  <a href="docs/QUICKSTART.md">📖 Docs</a> ·
  <a href="https://github.com/thewisecrab/AgentMaturityCompass/discussions">💬 Community</a> ·
  <a href="#-recipes--copy-paste-examples">📋 Recipes</a> ·
  <a href="CONTRIBUTING.md">🤝 Contribute</a>
</p>

---

## What is this?

AMC scores AI agents from what they **actually do**, not what their docs say they do.

```bash
npx agent-maturity-compass quickscore
```

One command. No account. No API key. You get:

1. **A trust score** — L0 (dangerous) to L5 (production-ready), based on execution evidence
2. **A gap analysis** — exactly what's weak, what's risky, and what's missing
3. **Generated fixes** — guardrails, config patches, CI gates, and compliance artifacts

Then you keep going: add adversarial testing, continuous monitoring, regulatory mapping, and fleet-wide governance — all from the same CLI.
- **Evaluation workflows** — golden datasets, imported evals, lite scoring for non-agent apps
- **Business and compliance outputs** — KPI correlation, leaderboards, audit binders

Works with **LangChain, CrewAI, AutoGen, OpenAI Agents SDK, Claude Code, Gemini, OpenClaw**, and more — with zero or near-zero integration friction.

<details>
<summary><strong>Why should I care?</strong></summary>

Today, many agents are evaluated by what they claim in docs, prompts, or self-reported checklists.
That is structurally weak.

AMC focuses on **execution-verified evidence**.

| How agents are evaluated today | How AMC evaluates |
|---|---|
| Agent says "I'm safe" → Score: 100 ✅ | AMC tests the agent and inspects evidence → Real score may be 16 ❌ |
| Self-reported documentation | Execution-verified evidence |
| Keyword matching | Weighted trust evidence |
| "Trust me, bro" | Cryptographic proof chains |

That is the entire thesis: **trust, but verify — with receipts**.

</details>

---

## Product family

AMC is one trust stack with eight named product surfaces:

| Product | What it does |
|---|---|
| **Score** | Evidence-weighted maturity diagnostics and trust scoring |
| **Shield** | Adversarial assurance packs and attack simulations |
| **Enforce** | Policy controls, approvals, and governance workflows |
| **Vault** | Signatures, keys, and tamper-evident proof infrastructure |
| **Watch** | Traces, anomalies, monitoring, and operational drift detection |
| **Fleet** | Multi-agent oversight, comparison, inventory, and governance |
| **Passport** | Portable identity and credential artifacts for agents |
| **Comply** | Compliance mappings, audit binders, and governance reporting |

These names are intentional. AMC is not a single command with a long README — it is a trust stack you can grow into.

---

## Pricing

The full trust stack is **free and MIT licensed**. The only paid surface is Industry Packs.

| Tier | What you get |
|---|---|
| **Free / Open Source** | Everything — Score, Shield, Enforce, Vault, Watch, Fleet, Passport, Comply, all 14 adapters, 481 CLI commands, browser playground, CI gates |
| **Pro** | Everything in Free + selected Industry Packs for your regulated verticals |
| **Enterprise** | Everything in Pro + all 40 Industry Packs + priority support + custom pack development + deployment assistance |

> Industry Packs are 40 sector-specific domain packs (healthcare, finance, education, government, etc.) that require ongoing regulatory research and maintenance. The core trust stack stays free forever.

---

## Choose your path

### 1. Browser — fastest first look
Use the existing browser playground to explore scoring logic, questions, and scenarios.

**[→ Try the Web Playground](https://thewisecrab.github.io/AgentMaturityCompass/playground.html)**

Best for:
- first-touch evaluation
- demos
- lightweight exploration
- understanding how scoring works

### 2. CLI — real evidence workflows
Use the CLI when you want actual execution evidence, traces, datasets, reports, and CI gates.

```bash
npx agent-maturity-compass quickscore
```

Best for:
- real agent scoring
- evidence capture
- local trust workflows
- shareable outputs

### 3. CI — enforce standards continuously
Use AMC in GitHub Actions or CI to prevent trust regressions.

Best for:
- release gates
- score thresholds
- drop detection
- PR comments and artifact generation

### 4. Deployment / enterprise path
If you need self-hosted, managed, or enterprise deployment clarity, start here:

- `docs/DEPLOYMENT_OPTIONS.md`
- `docs/PRODUCT_EDITIONS.md`
- `docs/PRICING.md`
- `docs/ENTERPRISE.md`

## Start by persona

- **Solo builder / OSS maintainer** → `docs/SOLO_DEV_PATH.md`
- **Platform / engineering team** → `docs/PLATFORM_PATH.md`
- **Security / compliance** → `docs/SECURITY_PATH.md`

## Support AMC

Want to support the open project?

- Sponsorship path: `SPONSORING.md`
- Community/support routing: `docs/COMMUNITY_SUPPORT.md`

## Core routing docs

- `docs/INDEX.md`
- `docs/START_HERE.md`
- `docs/WHY_AMC.md`
- `docs/USE_CASES.md`
- `docs/PERSONAS.md`
- `docs/AFTER_QUICKSCORE.md`
- `docs/EXAMPLES_INDEX.md`
- `docs/RECIPES.md`
- `docs/DEPLOYMENT_OPTIONS.md`
- `docs/PRODUCT_EDITIONS.md`
- `docs/PRICING.md`
- `docs/BUYER_PACKAGES.md`
- `docs/SERVICES_AND_SUPPORT.md`
- `docs/COMMUNITY_SHOWCASE.md`
- `docs/RELEASE_HIGHLIGHTS.md`
- `docs/BENCHMARK_GALLERY.md`

---

## ⚡ Quick Start

### Option 1: Terminal (2 minutes)

```bash
# Install
npm i -g agent-maturity-compass

# Score your agent
cd your-agent-project
amc init          # interactive setup
amc quickscore    # get your score
amc fix           # auto-generate fixes
```

### Option 2: Browser (0 minutes)

**[→ Try the Web Playground](https://thewisecrab.github.io/AgentMaturityCompass/playground.html)** — answer questions, explore scenarios and assurance packs, get a score. No install.

This is AMC's **browser try-now path**: great for first-touch scoring and exploration. For execution evidence, traces, datasets, and CI gates, use the CLI.

### Option 3: Docker (0 config)

```bash
docker run -it --rm ghcr.io/thewisecrab/amc-quickstart amc quickscore
```

### Option 4: CI/CD (copy-paste)

```yaml
# .github/workflows/amc.yml
name: AMC Score
on: [push, pull_request]
jobs:
  score:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: thewisecrab/AgentMaturityCompass/amc-action@main
        with:
          target-level: 3        # fail if below L3
          fail-on-drop: true     # fail if score drops
          comment: true          # post results on PR
```

---

## 📋 Recipes — Copy-Paste Examples

### Score any agent in one line

```bash
npx agent-maturity-compass quickscore                    # quick score
npx agent-maturity-compass quickscore --eu-ai-act        # + EU AI Act check
npx agent-maturity-compass quickscore --share            # shareable link
```

### Wrap an existing agent (zero code changes)

```bash
# LangChain
amc wrap langchain -- python my_agent.py

# CrewAI
amc wrap crewai -- python crew.py

# AutoGen
amc wrap autogen -- python autogen_app.py

# OpenClaw
amc wrap openclaw-cli -- openclaw run

# Claude Code
amc wrap claude-code -- claude "analyze this code"

# Any CLI agent
amc wrap generic-cli -- python my_bot.py
```

### Red-team your agent

```bash
amc assurance run --scope full                           # full assurance library
amc assurance run --pack prompt-injection                # specific attack
amc assurance run --pack adversarial-robustness          # TAP/PAIR/Crescendo
amc assurance run --format sarif                         # export for security tools
```

### Inspect traces and operational drift

```bash
amc observe timeline                                     # score history + evidence volume
amc observe anomalies                                    # volatility / regressions / weirdness
amc trace list                                           # recent agent sessions
amc trace inspect <trace-id>                             # inspect tool calls and trust tiers
```

### Build golden datasets and run evals

```bash
amc dataset create support-bot                           # create a reusable eval dataset
amc dataset add-case support-bot --prompt "..." --expected "..."
amc dataset run support-bot                              # run eval cases
amc eval import --format promptfoo --file results.json   # import external eval results
amc lite-score                                           # score a non-agent chatbot / LLM app
```

### Business, inventory, and reporting

```bash
amc business kpi                                         # correlate maturity to outcomes
amc business report                                      # stakeholder-ready business summary
amc leaderboard show                                     # compare agents across a fleet
amc inventory scan --deep                                # discover agents, frameworks, model files
amc comms-check --text "Guaranteed 40% return" --domain wealth
```

### Auto-fix everything

```bash
amc fix                          # generate guardrails + CI gate + governance docs
amc fix --target-level L4        # target a specific level
amc guide --go                   # detect framework → apply guardrails to config
amc guide --watch                # continuous monitoring + auto-update
```

### Compliance in one command

```bash
amc audit binder create --framework eu-ai-act            # EU AI Act evidence binder
amc compliance report --framework iso-42001              # ISO 42001 report
amc domain assess --domain health                        # HIPAA assessment
amc domain assess --domain wealth                        # MiFID II / DORA
```

### GitHub Actions — full CI gate

```yaml
# .github/workflows/amc.yml — copy this entire file
name: AMC Trust Gate
on:
  pull_request:
  push:
    branches: [main]

jobs:
  amc-score:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: thewisecrab/AgentMaturityCompass/amc-action@main
        with:
          agent-id: my-agent
          target-level: 3
          fail-on-drop: true
          comment: true
          upload-artifacts: true
```

### Badge for your README

```markdown
<!-- Add this to your README -->
[![AMC Score](https://img.shields.io/badge/AMC-L3_(72.5)-green?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTEyIDJMMiA3bDEwIDUgMTAtNXptMCA5bC04LjUtNC4yNUwyIDEybDEwIDUgMTAtNXptMCA5bC04LjUtNC4yNUwyIDIxbDEwIDUgMTAtNXoiLz48L3N2Zz4=)](https://github.com/thewisecrab/AgentMaturityCompass)
```

Result: ![AMC Score](https://img.shields.io/badge/AMC-L3_(72.5)-green)

---

## 🧪 What AMC Tests

### 195 Diagnostic Questions × 5 Dimensions

| Dimension | Questions | What It Measures |
|-----------|-----------|------------------|
| Strategic Agent Ops | 18 | Mission clarity, scope adherence, decision traceability |
| Skills | 47 | Tool mastery, injection defense, DLP, scenario traceability, synthetic agent safety |
| Resilience | 53 | Graceful degradation, circuit breakers, bypass resistance, simulation validity, fact/sim boundaries |
| Leadership & Autonomy | 23 | Structured logs, traces, cost tracking, SLOs |
| Culture & Alignment | 54 | Test harnesses, feedback loops, forecast legitimacy, persona governance, UX honesty |

### 119 Assurance Packs

| Category | Examples |
|----------|---------|
| Prompt Injection | System tampering, role hijacking, jailbreaks |
| Exfiltration | Secret leakage, PII exposure, data boundary violations |
| Adversarial | TAP/PAIR, Crescendo, Skeleton Key, best-of-N |
| Context Leakage | EchoLeak, cross-session bleed, memory poisoning |
| Supply Chain | Dependency attacks, MCP server poisoning, SBOM integrity |
| Behavioral | Sycophancy, self-preservation, sabotage, over-compliance |

### 40 Industry Domain Packs

| Sector | Packs | Key Regulations |
|--------|-------|-----------------|
| 🏥 Health | 9 | HIPAA, FDA 21 CFR Part 11, EU MDR, ICH E6(R3) |
| 💰 Wealth | 5 | MiFID II, PSD2, EU DORA, MiCA, FATF |
| 🎓 Education | 5 | FERPA, COPPA, IDEA, EU AI Act Annex III |
| 🚇 Mobility | 5 | UNECE WP.29, ETSI EN 303 645, EU NIS2 |
| 💡 Technology | 5 | EU AI Act Art. 13, EU Data Act, DSA Art. 34 |
| 🌿 Environment | 6 | EU Farm-to-Fork, REACH, IEC 61850 |
| 🏛️ Governance | 5 | EU eIDAS 2.0, UNCAC, UNGPs |

### 74+ Scoring Modules

<details>
<summary>See all modules</summary>

- Calibration gap (confidence vs reality)
- Evidence conflict detection
- Gaming resistance (adversarial score inflation)
- Sleeper agent detection (context-dependent behavior)
- Policy consistency (pass^k reliability)
- Factuality (parametric, retrieval, grounded)
- Memory integrity & poisoning resistance
- Alignment index (safety × honesty × helpfulness)
- Over-compliance detection (H-Neurons, arXiv:2512.01797)
- Monitor bypass resistance (arXiv:2503.09950)
- Trust-authorization synchronization (arXiv:2512.06914)
- MCP compliance scoring
- Identity continuity tracking
- Behavioral transparency index
- And 60+ more...

</details>

---

## 🏗️ Architecture

```
Agent (untrusted)
    │
    ▼
AMC Gateway ──── transparent proxy, agent doesn't know it's being watched
    │
    ▼
Evidence Ledger ──── Ed25519 signatures + Merkle tree proof chains
    │
    ▼
Scoring Engine ──── evidence-weighted diagnostics, 74+ scoring modules, 86 assurance packs
    │
    ▼
AMC Studio ──── dashboard + API + CLI + reports
```

### Evidence Trust Tiers

| Tier | Weight | How |
|------|--------|-----|
| `OBSERVED_HARDENED` | 1.1× | AMC-controlled adversarial scenarios |
| `OBSERVED` | 1.0× | Captured via gateway proxy |
| `ATTESTED` | 0.8× | Cryptographic attestation |
| `SELF_REPORTED` | 0.4× | Agent's own claims (capped) |

### Maturity Scale

| Level | Name | Meaning |
|-------|------|---------|
| **L0** | Absent | No safety controls |
| **L1** | Initial | Some intent, nothing operational |
| **L2** | Developing | Works on happy path, breaks at edges |
| **L3** | Defined | Repeatable, measurable, auditable (EU AI Act minimum) |
| **L4** | Managed | Proactive, risk-calibrated, cryptographic proofs |
| **L5** | Optimizing | Self-correcting, continuously verified |

### The Platform

| Module | What It Does |
|--------|-------------|
| **AMC Score** | Evidence-weighted diagnostics across 5 dimensions, L0–L5 maturity |
| **AMC Shield** | 86 assurance packs: injection, exfiltration, adversarial |
| **AMC Enforce** | Policy engine, approval workflows, scoped leases |
| **AMC Vault** | Ed25519 keys, Merkle chains, HSM/TPM support |
| **AMC Watch** | Dashboard, gateway proxy, Prometheus metrics |
| **AMC Fleet** | Multi-agent trust, delegation graphs |
| **AMC Passport** | Portable agent credential (.amcpass) |
| **AMC Comply** | EU AI Act, ISO 42001, NIST AI RMF, SOC 2, OWASP mapping |

---

## 🔌 14 Framework Adapters

Zero code changes. One environment variable.

```bash
amc wrap <adapter> -- <your command>
```

| Adapter | Command |
|---------|---------|
| LangChain | `amc wrap langchain -- python app.py` |
| LangGraph | `amc wrap langgraph -- python graph.py` |
| CrewAI | `amc wrap crewai -- python crew.py` |
| AutoGen | `amc wrap autogen -- python autogen.py` |
| OpenAI Agents SDK | `amc wrap openai-agents -- python agent.py` |
| LlamaIndex | `amc wrap llamaindex -- python rag.py` |
| Semantic Kernel | `amc wrap semantic-kernel -- dotnet run` |
| Claude Code | `amc wrap claude-code -- claude "task"` |
| Gemini | `amc wrap gemini -- gemini chat` |
| OpenClaw | `amc wrap openclaw-cli -- openclaw run` |
| OpenHands | `amc wrap openhands -- openhands run` |
| Python SDK | `amc wrap python-amc-sdk -- python app.py` |
| Generic CLI | `amc wrap generic-cli -- python bot.py` |
| OpenAI-compatible | `amc wrap openai-compat -- node server.js` |

> 📖 [Full adapter docs](docs/ADAPTERS.md)

---

## 📊 Compliance Mapping

| Framework | Coverage |
|-----------|----------|
| **EU AI Act** | 12 article mappings + audit binder generation |
| **ISO 42001** | Clauses 4-10 mapped to AMC dimensions |
| **NIST AI RMF** | Risk management framework alignment |
| **SOC 2** | Trust service criteria mapping |
| **OWASP LLM Top 10** | Full coverage (10/10) |

---

## 🚀 Install

### npm (recommended)
```bash
npm i -g agent-maturity-compass
```

### npx (no install)
```bash
npx agent-maturity-compass quickscore
```

### Homebrew
```bash
brew tap thewisecrab/amc && brew install agent-maturity-compass
```

### curl
```bash
curl -fsSL https://raw.githubusercontent.com/thewisecrab/AgentMaturityCompass/main/install.sh | bash
```

### Docker
```bash
docker run -it --rm ghcr.io/thewisecrab/amc-quickstart amc quickscore
```

### From source
```bash
git clone https://github.com/thewisecrab/AgentMaturityCompass.git
cd AgentMaturityCompass && npm ci && npm run build && npm link
```

---

## ☁️ Deploy (One-Click)

| Platform | Deploy |
|----------|--------|
| **Docker Compose** | `cd docker && docker compose up` |
| **Vercel** | [![Deploy](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/thewisecrab/AgentMaturityCompass) |
| **Railway** | [![Deploy](https://railway.app/button.svg)](https://railway.app/template?referralCode=amc&repo=https://github.com/thewisecrab/AgentMaturityCompass) |

---

## 📚 Docs

| | |
|--|--|
| [Quickstart (5 min)](docs/QUICKSTART.md) | [Agent Guide](docs/AGENT_GUIDE.md) |
| [Solo Dev Quickstart](docs/SOLO_DEV_QUICKSTART.md) | [Platform Engineer Quickstart](docs/PLATFORM_ENGINEER_QUICKSTART.md) |
| [Security & Compliance Quickstart](docs/SECURITY_COMPLIANCE_QUICKSTART.md) | [Troubleshooting](docs/TROUBLESHOOTING.md) |
| [CLI Reference (481 commands)](docs/AMC_MASTER_REFERENCE.md) | [Architecture](docs/ARCHITECTURE_MAP.md) |
| [Compatibility Matrix](docs/COMPATIBILITY_MATRIX.md) | [Starter Blueprints](docs/STARTER_BLUEPRINTS.md) |
| [Install Packages](docs/INSTALL_PACKAGES.md) | [Support Policy](docs/SUPPORT_POLICY.md) |
| [Release Cadence](docs/RELEASE_CADENCE.md) | [CI Templates](docs/CI_TEMPLATES.md) |
| [Hardening Guide](docs/HARDENING.md) | [Community](docs/COMMUNITY.md) |

### Single-binary install (experimental)

AMC now includes an **experimental Node SEA packaging path** for host-specific single-binary builds:

```bash
npm run build
npm run build:sea
```

The build path is wired in and produces SEA artifacts plus a manifest. Runtime verification is still experimental and host-sensitive. See [docs/SINGLE_BINARY.md](docs/SINGLE_BINARY.md) for the honest status and caveats.

### Nightly compatibility matrix

AMC now includes a scheduled GitHub Actions workflow that validates packaged CLI installs across a small OS/Node matrix and uploads JSON artifacts for inspection:

- workflow: `.github/workflows/nightly-compatibility-matrix.yml`
- current matrix: `ubuntu-latest` + `macos-latest`, Node `20` + `22`
- checks: packed install, `doctor --json`, `quickscore --json`, `lite-score --help`, `comms-check --help`

### Workspace config profiles (MVP)

AMC now supports lightweight workspace config presets for `.amc/amc.config.yaml`:

```bash
amc init --profile dev
amc quickstart --profile ci
amc config profile prod
```

Current MVP behavior:
- `dev` → shared trust boundary, proxy env enabled
- `ci` → isolated trust boundary, proxy env enabled
- `prod` → isolated trust boundary, proxy env disabled
- explicit `--trust-boundary` still overrides the profile when you need it

| [Assurance Lab](docs/ASSURANCE_LAB.md) | [Domain Packs](docs/SECTOR_PACKS.md) |
| [EU AI Act Compliance](docs/EU_AI_ACT_COMPLIANCE.md) | [Multi-Agent Trust](docs/MULTI_AGENT_TRUST.md) |
| [Executive Overview](docs/EXECUTIVE_OVERVIEW.md) | [White Paper](whitepaper/AMC_WHITEPAPER_v1.md) |
| [Example Projects](examples/) | [Community](docs/COMMUNITY.md) |
| [Web Playground](https://thewisecrab.github.io/AgentMaturityCompass/playground.html) | [Compatibility Matrix](docs/COMPATIBILITY_MATRIX.md) |

---

## 🤝 Contributing

AMC is MIT licensed. We welcome contributions — especially new **assurance packs**, **domain packs**, **framework adapters**, and **scoring modules**.

```bash
git clone https://github.com/thewisecrab/AgentMaturityCompass.git
cd AgentMaturityCompass && npm ci && npm test   # 3,549 tests
```

**→ [CONTRIBUTING.md](CONTRIBUTING.md)** — includes guides for writing packs, mapping research papers, and adding adapters.

### Good first contributions

- 🔬 **New assurance pack** — model a new attack scenario ([guide](CONTRIBUTING.md#writing-an-assurance-pack))
- 🏥 **New domain pack** — add industry-specific questions ([guide](CONTRIBUTING.md#writing-a-domain-pack))
- 🔌 **New adapter** — support another agent framework ([guide](CONTRIBUTING.md#writing-an-adapter))
- 📄 **Research paper → module** — turn arXiv findings into scoring logic ([guide](CONTRIBUTING.md#mapping-a-research-paper))

---

## 📄 License

**MIT** — public trust infrastructure for the age of AI agents.

---

<p align="center">
  <strong>195 diagnostic questions · 119 assurance packs · 40 domain packs · 14 adapters · 74+ scoring modules · 3,549 tests</strong><br>
  <em>Stop trusting. Start verifying.</em>
</p>

<p align="center">
  <sub>If your AGENTS.md doesn't have an AMC badge, you're running with scissors. 🏃‍♂️✂️</sub>
</p>
