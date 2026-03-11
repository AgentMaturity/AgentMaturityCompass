<p align="center">
  <img src="https://img.shields.io/badge/🧭_AMC-Trust_Score_for_AI_Agents-blue?style=for-the-badge&labelColor=1a1a2e" alt="AMC" />
</p>

<h1 align="center">Agent Maturity Compass</h1>

<p align="center">
  <strong>Is your AI agent running with scissors?</strong><br>
  Find out in 2 minutes. Fix it in 5. Free forever.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/agent-maturity-compass"><img src="https://img.shields.io/npm/v/agent-maturity-compass" alt="npm" /></a>
  <a href="https://www.npmjs.com/package/agent-maturity-compass"><img src="https://img.shields.io/npm/dm/agent-maturity-compass" alt="downloads" /></a>
  <a href="#"><img src="https://img.shields.io/badge/tests-3%2C311%20passing-brightgreen" alt="tests" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT" /></a>
  <a href="docs/AMC_MASTER_REFERENCE.md"><img src="https://img.shields.io/badge/CLI%20commands-357-blue" alt="commands" /></a>
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

AMC is like **ESLint for AI agents** — it scores your agent's trustworthiness, finds the gaps, and auto-generates the fixes.

```bash
npx agent-maturity-compass quickscore
```

That's it. One command. No account. No API key. You get:

- **A trust score** from L0 (dangerous) to L5 (production-ready)
- **A gap analysis** showing exactly what's wrong
- **Auto-generated fixes** — guardrails, CI gates, compliance docs

Works with **LangChain, CrewAI, AutoGen, OpenAI Agents SDK, Claude Code, OpenClaw** — zero code changes.

<details>
<summary><strong>Why should I care?</strong></summary>

Today, AI agents grade themselves. That's like letting students grade their own exams.

AMC tested real agents and found an **84-point gap** between what agents claim and what they actually do:

| How agents are evaluated today | How AMC evaluates |
|---|---|
| Agent says "I'm safe" → Score: 100 ✅ | AMC secretly tests agent → Real score: 16 ❌ |
| Self-reported documentation | Execution-verified evidence |
| "Trust me, bro" | Cryptographic proof chains |

</details>

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

**[→ Try the Web Playground](https://thewisecrab.github.io/AgentMaturityCompass/playground.html)** — answer 15 questions, get a score. No install.

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
amc assurance run --scope full                           # all 85 attack packs
amc assurance run --pack prompt-injection                # specific attack
amc assurance run --pack adversarial-robustness          # TAP/PAIR/Crescendo
amc assurance run --format sarif                         # export for security tools
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

### 730 Diagnostic Questions × 5 Dimensions

| Dimension | Questions | What It Measures |
|-----------|-----------|------------------|
| Strategic Agent Ops | 18 | Mission clarity, scope adherence, decision traceability |
| Skills | 38 | Tool mastery, injection defense, DLP, least-privilege |
| Resilience | 30 | Graceful degradation, circuit breakers, bypass resistance |
| Leadership & Autonomy | 28 | Structured logs, traces, cost tracking, SLOs |
| Culture & Alignment | 26 | Test harnesses, feedback loops, over-compliance detection |

### 85 Red-Team Attack Packs

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

### 75 Scoring Modules

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
Scoring Engine ──── 730 questions, 75 modules, 85 attack packs
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
| **AMC Score** | 730 questions, 5 dimensions, L0–L5 maturity |
| **AMC Shield** | 85 attack packs: injection, exfiltration, adversarial |
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
| [CLI Reference (357 commands)](docs/AMC_MASTER_REFERENCE.md) | [Architecture](docs/ARCHITECTURE_MAP.md) |
| [Assurance Lab](docs/ASSURANCE_LAB.md) | [Domain Packs](docs/SECTOR_PACKS.md) |
| [EU AI Act Compliance](docs/EU_AI_ACT_COMPLIANCE.md) | [Multi-Agent Trust](docs/MULTI_AGENT_TRUST.md) |
| [Executive Overview](docs/EXECUTIVE_OVERVIEW.md) | [White Paper](whitepaper/AMC_WHITEPAPER_v1.md) |
| [Example Projects](examples/) | [Web Playground](https://thewisecrab.github.io/AgentMaturityCompass/playground.html) |

---

## 🤝 Contributing

AMC is MIT licensed. We welcome contributions — especially new **assurance packs**, **domain packs**, **framework adapters**, and **scoring modules**.

```bash
git clone https://github.com/thewisecrab/AgentMaturityCompass.git
cd AgentMaturityCompass && npm ci && npm test   # 3,311 tests
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
  <strong>730 questions · 85 attack packs · 40 domain packs · 14 adapters · 75 scoring modules · 3,311 tests</strong><br>
  <em>Stop trusting. Start verifying.</em>
</p>

<p align="center">
  <sub>If your AGENTS.md doesn't have an AMC badge, you're running with scissors. 🏃‍♂️✂️</sub>
</p>
