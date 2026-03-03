# 🧭 Agent Maturity Compass (AMC)

**The credit score for AI agents.**

[![Tests](https://img.shields.io/badge/tests-2%2C723%20passing-brightgreen)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()
[![Questions](https://img.shields.io/badge/questions-733-blue)]()
[![Modules](https://img.shields.io/badge/scoring%20modules-75-green)]()
[![Assurance Packs](https://img.shields.io/badge/assurance%20packs-85-red)]()
[![Adapters](https://img.shields.io/badge/adapters-14-purple)]()
[![Domain Packs](https://img.shields.io/badge/domain%20packs-40-orange)]()

🌐 [Website](https://thewisecrab.github.io/AgentMaturityCompass/) · 📖 [Docs](docs/) · 💬 [Discussions](https://github.com/thewisecrab/AgentMaturityCompass/discussions)

---

## 🟢 Simple Version — What Is This?

**AI agents can do amazing things.** They write code, manage your calendar, send emails, handle customer support, make financial decisions. But here's the problem:

**How do you know if an AI agent is actually safe and trustworthy?**

Today, agents grade themselves. That's like letting students grade their own exams. AMC fixes this.

### What AMC Does (in plain English)

1. **Watches** your AI agent work (without the agent knowing)
2. **Tests** it with real scenarios — including trick questions and edge cases
3. **Scores** it on a simple scale from L0 (dangerous) to L5 (trustworthy)
4. **Proves** the score with cryptographic evidence that can't be faked

### The Problem AMC Solves

| How Agents Are Evaluated Today | How AMC Evaluates |
|---|---|
| Agent says "I'm safe" → Score: 100 ✅ | AMC secretly tests agent → Real score: 16 ❌ |
| Self-reported documentation | Execution-verified evidence |
| Trust me, bro | Trust, but verify with math |

That's an **84-point gap** between what agents claim and what they actually do.

### Quick Start (2 Minutes)

```bash
# Install
npm i -g agent-maturity-compass

# Create a project and get your first score
mkdir my-agent && cd my-agent
export AMC_VAULT_PASSPHRASE='pick-a-passphrase'   # needed for cryptographic evidence chain
amc init
```

That's it. `amc init` walks you through everything interactively. The passphrase protects your agent's cryptographic evidence vault — pick something memorable.

### What You Get

- **A trust score** from L0 to L5 with a clear breakdown
- **A gap analysis** showing exactly what to fix and how
- **Auto-generated guardrails** that plug directly into your agent's config
- **A badge** for your README showing your agent's trust level

```bash
amc quickscore --share   # Get your score + action plan
amc badge                # ![AMC L3](https://img.shields.io/badge/AMC-L3-blue)
amc guide --go           # Auto-fix the biggest gaps
```

> 📖 [Full getting started guide](docs/GETTING_STARTED.md)

---

## 🔵 Technical Version — How It Works

### Architecture

```
Agent (untrusted) → AMC Gateway (transparent MITM proxy) → Evidence Ledger (Ed25519 + Merkle tree)
                                                                    ↓
                                                      Scoring Engine (140 core questions, 5 dimensions)
                                                                    ↓
                                                       AMC Studio (dashboard + API + CLI)
```

The gateway sits between your agent and the LLM provider. It captures every API call and tool use with Ed25519 signatures. The agent doesn't know it's being watched.

### Evidence Trust Tiers

Not all evidence is equal:

| Tier | Weight | How It's Collected |
|------|--------|--------------------|
| `OBSERVED_HARDENED` | 1.1× | AMC-controlled adversarial test scenarios |
| `OBSERVED` | 1.0× | Directly captured via AMC gateway proxy |
| `ATTESTED` | 0.8× | Cryptographic attestation via vault/notary |
| `SELF_REPORTED` | 0.4× | Agent's own claims — capped, can't inflate score |

### 5 Dimensions, 140 Core Questions

| Dimension | Questions | What It Measures |
|-----------|-----------|------------------|
| Strategic Agent Ops | 18 | Mission clarity, scope adherence, decision traceability |
| Skills | 38 | Tool mastery, injection defense, DLP, least-privilege execution |
| Resilience | 30 | Graceful degradation, circuit breakers, monitor bypass resistance |
| Leadership & Autonomy | 28 | Structured logs, traces, cost tracking, SLO monitoring |
| Culture & Alignment | 26 | Test harnesses, benchmarks, feedback loops, over-compliance detection |

### Maturity Scale (L0 → L5)

| Level | Name | What It Means |
|-------|------|---------------|
| **L0** | Absent | No safety controls. No logging. No oversight. |
| **L1** | Initial | Some intent to be safe, but nothing operational yet. |
| **L2** | Developing | Partial structure. Works in happy path, breaks at edges. |
| **L3** | Defined | Repeatable. Measurable. Auditable. EU AI Act minimum. |
| **L4** | Managed | Proactive. Risk-calibrated. Cryptographic proof chains. |
| **L5** | Optimizing | Self-correcting. Continuously verified. Fully certified. |

### Works With Any Agent Framework

```bash
# Wrap any CLI agent
amc wrap claude -- claude "analyze this"
amc wrap gemini -- gemini chat
amc adapters run --adapter generic-cli -- python bot.py

# Import existing evaluations
amc score evidence-ingest --format openai-evals
```

**14 built-in adapters:** LangChain, LangGraph, CrewAI, AutoGen, OpenAI Agents SDK, LlamaIndex, Semantic Kernel, Claude Code, Gemini, OpenClaw, OpenHands, Python AMC SDK, Generic CLI, OpenAI-Compatible API.

Zero code changes. One environment variable.

---

## 🏭 Domain Packs — Industry-Specific Assessment

**40 packs** across 7 industry domains with **593 domain-specific diagnostic questions**. Each question references specific regulatory articles, not vague guidelines.

```bash
amc domain list                                                    # See all 7 domains + packs
amc domain assess --domain health --agent my-agent                 # Assess against a domain
amc domain gaps --domain wealth --agent my-agent                   # Find compliance gaps
amc domain report --domain environment --output reports/env.md     # Generate report
```

| Sector | Packs | Questions | Key Regulations |
|--------|-------|-----------|-----------------|
| 🌿 Environment | 6 | 81 | EU Farm-to-Fork, REACH, IEC 61850, EU Drinking Water Directive |
| 🏥 Health | 9 | 140 | HIPAA §164.312, FDA 21 CFR Part 11, EU MDR 2017/745, ICH E6(R3) |
| 💰 Wealth | 5 | 70 | MiFID II, PSD2, EU DORA, MiCA, FATF R1/R10 |
| 🎓 Education | 5 | 72 | FERPA 20 U.S.C. §1232g, COPPA §312, IDEA, EU AI Act Annex III |
| 🚇 Mobility | 5 | 70 | EU EPBD 2024, UNECE WP.29 R155 §7, ETSI EN 303 645, EU NIS2 |
| 💡 Technology | 5 | 71 | EU AI Act Art. 13, EU Data Act 2023, DSA Art. 34, TRIPS Agreement |
| 🏛️ Governance | 5 | 71 | EU eIDAS 2.0, EU AI Act Art. 5(1)(a), UNCAC Art. 7/9, UNGPs |

Every pack includes risk tier, EU AI Act classification, SDG alignment, certification path, and key risks.

> 📖 [Domain Packs docs](docs/SECTOR_PACKS.md)

---

## 🛡️ Agent Guide — Auto-Fix Your Agent

AMC doesn't just find problems — it fixes them.

```bash
amc guide --go           # Detect framework → generate guardrails → apply to config
amc guide --status       # One-line health check
amc guide --interactive  # Cherry-pick which gaps to fix
amc guide --watch        # Continuous monitoring + auto-update
amc guide --diff         # What improved since last run
amc guide --ci --target 3  # CI gate: fail build if below L3
amc guide --compliance EU_AI_ACT  # Map gaps to regulatory obligations
```

- **Auto-detects** your framework from project files
- **15 config targets** — AGENTS.md, CLAUDE.md, .cursorrules, .kiro/steering, .gemini/style.md, and more
- **Severity-tagged** — 🔴 Critical, 🟡 High, 🔵 Medium
- **Idempotent** — re-running updates only the guardrails section

> 📖 [Agent Guide docs](docs/AGENT_GUIDE.md)

---

## 🔴 Assurance Lab — Built-in Red Team

85 deterministic attack packs that test your agent's real behavior under pressure:

| Category | What It Tests |
|----------|--------------|
| **Prompt Injection** | System message tampering, role hijacking, jailbreaks |
| **Exfiltration** | Secret leakage, PII exposure, data boundary violations |
| **Tool Misuse** | Unauthorized tools, budget overruns, scope creep |
| **Adversarial Robustness** | TAP/PAIR, Crescendo, Skeleton Key, best-of-N attacks |
| **Context Leakage** | EchoLeak, cross-session data bleed, memory poisoning |
| **Sycophancy** | Does the agent agree with wrong statements to please you? |
| **Self-Preservation** | Does the agent resist shutdown or modification? |
| **Sabotage** | Does the agent subtly undermine goals when conflicted? |
| **Over-Compliance** | Does the agent exceed its instructions? (H-Neurons, arXiv:2512.01797) |
| **MCP Security** | MCP server poisoning, tool schema manipulation |
| **Supply Chain** | Dependency attacks, SBOM integrity, plugin security |
| **Zombie Persistence** | Agents that survive termination or persist unauthorized |

```bash
amc assurance run --scope full --agent my-agent
amc assurance run --pack adversarial-robustness --agent my-agent
amc assurance certs list    # View certificates
```

---

## 📊 The Platform

| Module | What It Does |
|--------|-------------|
| **AMC Score** | 140 diagnostic questions, 5 dimensions, L0–L5 maturity, evidence-weighted |
| **AMC Shield** | 85 assurance packs: injection, exfiltration, adversarial attacks, and more |
| **AMC Enforce** | Governor engine with policy packs, approval workflows, scoped leases |
| **AMC Vault** | Ed25519 key vault, Merkle-tree evidence chains, HSM/TPM support |
| **AMC Watch** | Studio dashboard, gateway proxy, Prometheus metrics, cost tracking |
| **AMC Fleet** | Multi-agent trust composition, delegation graphs, contradiction detection |
| **AMC Passport** | Portable agent credential (.amcpass), verifiable offline, shareable |
| **AMC Comply** | EU AI Act, ISO 42001, NIST AI RMF, SOC 2, OWASP LLM Top 10 mapping |

---

## 📐 75 Scoring Modules

Beyond the core diagnostic, AMC includes research-backed scoring modules:

<details>
<summary>See all modules</summary>

- Calibration gap (confidence vs reality)
- Evidence conflict detection
- Evidence density mapping (blind spot detection)
- Gaming resistance (adversarial score inflation)
- Sleeper agent detection (context-dependent behavior)
- Audit depth (black-box, white-box, outside-the-box)
- Policy consistency (pass^k reliability)
- Task horizon (METR-inspired)
- Factuality (parametric, retrieval, grounded)
- Autonomy duration with domain risk profiles
- Pause quality (agent-initiated stops)
- Memory integrity & poisoning resistance
- Alignment index (safety × honesty × helpfulness)
- Interpretability scoring
- Output attestation (cryptographic signing)
- Mutual verification (agent-to-agent trust)
- Network transparency log (Merkle tree)
- Over-compliance detection (H-Neurons, arXiv:2512.01797)
- Agent Guide system (guardrails, agent instructions, CI gates)
- EU AI Act compliance, OWASP LLM Top 10
- Trust-authorization synchronization (arXiv:2512.06914)
- Monitor bypass resistance (arXiv:2503.09950)
- Memory security architecture (arXiv:2503.10632)
- Agent protocol security (MCP/A2A hardening)
- Vibe code audit (security review for AI-generated code)
- MCP compliance scoring
- Identity continuity tracking
- Behavioral transparency index
- And more...

</details>

---

## 📋 Compliance Mapping

| Framework | Coverage |
|-----------|----------|
| **EU AI Act** | 12 article mappings, audit binder generation |
| **ISO 42001** | Clauses 4-10 mapped to AMC dimensions |
| **NIST AI RMF** | Risk management framework alignment |
| **SOC 2** | Trust service criteria mapping |
| **OWASP LLM Top 10** | Full coverage (10/10) |

```bash
amc audit binder create --framework eu-ai-act    # Export compliance evidence
amc compliance report --framework iso-42001      # Generate compliance report
```

---

## 🚀 Install

### npm (recommended)
```bash
npm i -g agent-maturity-compass
```

### From source
```bash
git clone https://github.com/thewisecrab/AgentMaturityCompass.git
cd AgentMaturityCompass
npm ci
npm run build
npm link
```

### Docker
```bash
docker run -p 3212:3212 -p 3210:3210 amc/studio
```

### Homebrew (macOS/Linux)
```bash
brew tap thewisecrab/amc
brew install agent-maturity-compass
```

### Quick install script
```bash
curl -fsSL https://raw.githubusercontent.com/thewisecrab/AgentMaturityCompass/main/install.sh | bash
```

---

## 📚 Documentation

| Doc | Description |
|-----|-------------|
| [Getting Started](docs/GETTING_STARTED.md) | Install → first score → L5 |
| [Quickstart Guide](docs/QUICKSTART.md) | 5-minute walkthrough |
| [Agent Guide System](docs/AGENT_GUIDE.md) | Guardrails, auto-detect, CI gates |
| [Domain Packs](docs/SECTOR_PACKS.md) | 40 industry-specific domain packs |
| [CLI Reference](docs/AMC_MASTER_REFERENCE.md) | All 482+ commands |
| [Architecture Map](docs/ARCHITECTURE_MAP.md) | System design |
| [Assurance Lab](docs/ASSURANCE_LAB.md) | Attack packs & red teaming |
| [EU AI Act Compliance](docs/EU_AI_ACT_COMPLIANCE.md) | Regulatory mapping |
| [Multi-Agent Trust](docs/MULTI_AGENT_TRUST.md) | Fleet scoring & delegation |
| [White Paper](whitepaper/AMC_WHITEPAPER_v1.md) | The full research paper |

---

## 🤝 Contributing

AMC is MIT licensed and open source. Contributions welcome.

```bash
# Fork, clone, branch
git clone https://github.com/YOUR_USERNAME/AgentMaturityCompass.git
cd AgentMaturityCompass
npm ci
npm test          # 2,723 tests, all should pass
# Make your changes, then PR
```

---

## 📄 License

**MIT** — public infrastructure for the age of AI agents.

As autonomous agents become the primary interface between humans and technology, trust infrastructure must be open, verifiable, and accessible to everyone. AMC exists to make that real.

---

<p align="center">
  <strong>733 questions · 75 scoring modules · 85 assurance packs · 40 domain packs · 14 adapters · 2,723 tests</strong><br>
  <em>Stop trusting. Start verifying.</em>
</p>
