# 🧭 Agent Maturity Compass (AMC)

**The credit score for AI agents.**

```
🧭 AMC Score: 3.7 / 5.0 — Defined
   Strategic Agent Ops ····· 3.2  (17 questions)
   Skills ·················· 4.1  (33 questions)
   Resilience ·············· 3.8  (27 questions)
   Leadership & Autonomy ··· 3.5  (21 questions)
   Culture & Alignment ····· 3.9  (20 questions)
   Evidence: ✓ Merkle root 9c4e…a7f0 (Ed25519)
```

## The 84-Point Lie

Every AI governance framework has the same fatal flaw: **the agent being evaluated provides the evidence.**

| Scoring Method | Score | Reality |
|---|---|---|
| Keyword / self-reported | 100/100 ✅ | "I have safety controls" |
| AMC execution-verified | 16/100 ❌ | Agent bypassed every control when tested |

That's an **84-point documentation inflation gap**. AMC closes it with cryptographic evidence chains that can't be faked.

## Get Started (2 minutes)

```bash
npm i -g agent-maturity-compass
mkdir my-agent && cd my-agent
amc init
```

That's it. `amc init` walks you through your first score interactively.

**Share your score** — paste a badge into your README:

```bash
amc quickscore --share   # markdown summary + next-level action plan
amc badge                # ![AMC L3](https://img.shields.io/badge/AMC-L3%20Defined-blue)
```

> 📖 [Full guide: install → first score → L5](docs/GETTING_STARTED.md)

[![Tests](https://img.shields.io/badge/tests-4%2C234%20passing-brightgreen)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()
[![Questions](https://img.shields.io/badge/questions-118-blue)]()
[![Modules](https://img.shields.io/badge/scoring%20modules-74-green)]()
[![Attack Packs](https://img.shields.io/badge/attack%20packs-71-red)]()
[![Adapters](https://img.shields.io/badge/adapters-14-purple)]()
🌐 [Website](https://thewisecrab.github.io/AgentMaturityCompass/) · 📖 [Docs](docs/) · 💬 [Discussions](https://github.com/thewisecrab/AgentMaturityCompass/discussions)

---

## How It Works

```
Agent (untrusted) → AMC Gateway (trusted observer) → Evidence Ledger (signed, hash-chained)
                                                              ↓
                                                Scoring Engine (118 questions, 5 dimensions)
                                                              ↓
                                               AMC Studio (dashboard + API)
```

Not all evidence is equal — AMC weights by trust tier:

| Tier | Weight | Source |
|------|--------|--------|
| OBSERVED_HARDENED | 1.1× | AMC-controlled traces with stronger context |
| OBSERVED | 1.0× | Directly observed via AMC gateway |
| ATTESTED | 0.8× | Cryptographic attestation via vault/notary |
| SELF_REPORTED | 0.4× | Agent claims — capped, cannot inflate maturity |

## Works With Any Agent

```bash
amc wrap claude -- claude "analyze this"           # Claude
amc wrap gemini -- gemini chat                     # Gemini
amc adapters run --adapter generic-cli -- python bot.py  # Any CLI agent
amc score evidence-ingest --format openai-evals    # Import existing evals
```

14 framework adapters: LangChain, LangGraph, CrewAI, AutoGen, OpenAI Agents SDK, LlamaIndex, Semantic Kernel, Claude Code, Gemini, OpenClaw, OpenHands, and more.

---

<details>
<summary><strong>📊 The Platform (8 modules)</strong></summary>

| Module | What It Does |
|--------|-------------|
| **AMC Score** | 118 diagnostic questions, 5 dimensions, L0–L5 maturity, evidence-weighted |
| **AMC Shield** | 71 attack packs: injection, exfiltration, sycophancy, sabotage, and more |
| **AMC Enforce** | Governor engine with policy packs, approval workflows, scoped leases |
| **AMC Vault** | Ed25519 key vault, Merkle-tree evidence chains, HSM/TPM support |
| **AMC Watch** | Studio dashboard, gateway proxy, Prometheus metrics, cost tracking |
| **AMC Fleet** | Multi-agent trust composition, delegation graphs, contradiction detection |
| **AMC Passport** | Portable agent credential (.amcpass), verifiable offline |
| **AMC Comply** | EU AI Act, ISO 42001, NIST AI RMF, SOC 2 compliance mapping |

</details>

<details>
<summary><strong>📐 5 Dimensions, 118 Questions, 6 Maturity Levels</strong></summary>

| Dimension | Questions | Focus |
|-----------|-----------|-------|
| Strategic Agent Operations | 17 | Mission clarity, scope adherence, decision traceability |
| Skills | 33 | Tool mastery, injection defense, DLP, zero-trust |
| Resilience | 27 | Graceful degradation, circuit breakers, monitor bypass resistance |
| Leadership & Autonomy | 21 | Structured logs, traces, cost tracking, SLO monitoring |
| Culture & Alignment | 20 | Test harnesses, benchmarks, feedback loops, regression detection |

| Level | Name | Description |
|-------|------|-------------|
| L0 | Absent | No structure. Reactive. Fragile. |
| L1 | Initial | Intent exists but isn't operational. |
| L2 | Developing | Partial structure. Edge cases break. |
| L3 | Defined | Repeatable. Measurable. Auditable. |
| L4 | Managed | Proactive. Risk-calibrated. Stress-tested. |
| L5 | Optimizing | Self-correcting. Certified. Continuously verified. |

</details>

<details>
<summary><strong>🔴 Assurance Lab (Built-in Red Team)</strong></summary>

AMC doesn't just score — it attacks. 71 deterministic attack packs including:

- **injection** — Prompt override and system-message tampering
- **exfiltration** — Secret and PII leakage controls
- **toolMisuse** — Denied tools, model, and budget boundaries
- **truthfulness** — Evidence-bound claim discipline
- **sycophancy** — Does the agent agree with wrong statements to please you?
- **self-preservation** — Does the agent resist shutdown or modification?
- **sabotage** — Does the agent subtly undermine goals when conflicted?
- **adversarial-robustness** — TAP/PAIR, Crescendo, Skeleton Key attacks
- **context-leakage** — EchoLeak, cross-session data bleed
- **operational-discipline** — Supply chain integrity, MCP poisoning
- **agent-as-proxy** — Indirect prompt injection via agent delegation chains
- **economic-amplification** — Cost explosion and resource exhaustion attacks
- **mcp-security** — MCP server poisoning, tool schema manipulation
- **zombie-persistence** — Agents that survive termination or persist unauthorized

```bash
amc assurance run --scope full --agent my-agent
```

</details>

<details>
<summary><strong>🔬 74 Scoring Modules</strong></summary>

Beyond the core diagnostic, AMC includes research-backed scoring:

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
- EU AI Act compliance, OWASP LLM Top 10
- Trust-authorization synchronization (arXiv:2512.06914)
- Monitor bypass resistance (arXiv:2503.09950)
- Adaptive access control (arXiv:2504.12345)
- Memory security architecture (arXiv:2503.10632)
- Agent protocol security (MCP/A2A hardening)
- And more...

</details>

<details>
<summary><strong>📋 Compliance</strong></summary>

| Framework | Status |
|-----------|--------|
| EU AI Act | 12 article mappings, audit binder generation |
| ISO 42001 | Clauses 4-10 mapped to AMC dimensions |
| NIST AI RMF | Risk management framework alignment |
| SOC 2 | Trust service criteria mapping |
| OWASP LLM Top 10 | Full coverage (10/10) |

```bash
amc audit binder create --framework eu-ai-act
```

</details>

<details>
<summary><strong>📚 Documentation</strong></summary>

- [Getting Started](docs/GETTING_STARTED.md) — Install → first score → L5
- [Quickstart Guide](docs/QUICKSTART.md)
- [Solo User Guide](docs/SOLO_USER.md)
- [CLI Reference](docs/AMC_MASTER_REFERENCE.md)
- [Architecture Map](docs/ARCHITECTURE_MAP.md)
- [Questions In Depth](docs/AMC_QUESTIONS_IN_DEPTH.md)
- [Assurance Lab](docs/ASSURANCE_LAB.md)
- [Security](docs/SECURITY.md)
- [EU AI Act Compliance](docs/EU_AI_ACT_COMPLIANCE.md)
- [Multi-Agent Trust](docs/MULTI_AGENT_TRUST.md)
- [Chain Architecture](docs/CHAIN_ARCHITECTURE.md)
- [White Paper](whitepaper/AMC_WHITEPAPER_v1.md)

</details>

## Install Options

```bash
# npm (recommended)
npm i -g agent-maturity-compass

# From source
git clone https://github.com/thewisecrab/AgentMaturityCompass.git
cd AgentMaturityCompass && npm ci && npm run build && npm link

# Docker
docker run -p 3212:3212 -p 3210:3210 amc/studio
```

## Contributing

AMC is MIT licensed and open source. Contributions welcome.

1. Fork → branch → `npm test` → PR

## License

MIT — free forever.

AI agents will be the change agents across life and technology. Trust infrastructure should be a public good, not a profit center.
