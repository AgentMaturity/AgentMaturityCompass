# Getting Started with AMC

**Time to first score: ~2 minutes.**

AMC (Agent Maturity Compass) scores your AI agent's trustworthiness from actual behavior — not self-reported claims. Think of it as a credit score for AI agents.

---

## Install

**Prerequisites:** Node.js ≥ 20. AMC uses `better-sqlite3` which includes prebuilt binaries for most platforms. If prebuilds aren't available for your OS/arch, you'll need Python 3 and a C++ compiler (`build-essential` on Linux, Xcode CLI tools on macOS).

```bash
npm i -g agent-maturity-compass
```

## Your First Score (2 minutes)

```bash
# 1. Create a workspace
mkdir my-agent && cd my-agent

# 2. Set a vault passphrase (protects your evidence chain)
export AMC_VAULT_PASSPHRASE='pick-a-passphrase'

# 3. Initialize and get your first maturity score
amc init

# 4. Get your first maturity score (interactive, 5 questions)
amc quickscore
```

That's it. You now have a baseline maturity level (L0–L5).

> **Why a passphrase?** AMC creates a cryptographic evidence vault (Ed25519 keys) that signs all your scores and evidence. The passphrase encrypts the vault so your signing keys stay protected. Pick something memorable — you'll need it each session.

After scoring, AMC automatically shows what your agent needs to reach the next level.

**Share your score** — generate a README badge and markdown summary:

```bash
amc quickscore --share
# Outputs a markdown snippet + shields.io badge you can paste anywhere
```

**Add a badge to your README:**

```bash
amc badge
# ![AMC L3](https://img.shields.io/badge/AMC-L3%20Defined-blue)
```

**Anonymous telemetry** (off by default — opt-in only):

```bash
amc telemetry on    # help improve AMC — only sends OS, version, command, level
amc telemetry off   # disable at any time
amc telemetry status # see exactly what is and isn't collected
```

---

## Understanding Your Score

AMC scores agents on a 5-level scale:

| Level | What it means | Think of it as... |
|-------|--------------|-------------------|
| L0 | No governance | Running with scissors |
| L1 | Ad-hoc controls | Sticky notes on the monitor |
| L2 | Repeatable processes | Checklists exist |
| L3 | Defined & measured | Dashboards and alerts |
| L4 | Managed & optimized | Continuous improvement |
| L5 | Self-governing | Autopilot with proof |

## What Gets Scored

AMC evaluates 5 dimensions, each with specific questions:

1. **Strategic Agent Operations** (17 questions) — Mission clarity, scope adherence, decision traceability
2. **Skills** (35 questions) — Tool mastery, injection defense, DLP, zero-trust
3. **Resilience** (30 questions) — Graceful degradation, circuit breakers, monitor bypass resistance
4. **Leadership & Autonomy** (21 questions) — Structured logs, traces, cost tracking, SLO monitoring
5. **Culture & Alignment** (23 questions) — Test harnesses, benchmarks, feedback loops, over-compliance detection


---

## Improving Your Agent's Score

### The fastest path: Agent Guide

The Agent Guide generates personalized guardrails from your score and applies them directly to your agent's config file:

```bash
# One command — auto-detect framework, generate guardrails, apply to config
amc guide --go
```

This auto-detects your framework (LangChain, CrewAI, Claude Code, Cursor, etc.), generates severity-tagged guardrails (🔴 Critical / 🟡 High / 🔵 Medium), and applies them to your agent's config file.

After your agent works with the new guardrails, re-score and see what improved:

```bash
amc quickscore
amc guide --diff    # Shows closed gaps, new gaps, level changes
```

> 📖 Full guide system docs: [AGENT_GUIDE.md](AGENT_GUIDE.md)

### Other guide modes

```bash
amc guide --status              # One-line health check
amc guide --interactive         # Cherry-pick which gaps to fix
amc guide --watch --apply       # Continuous monitoring + auto-update
amc guide --ci --target 3       # CI gate — exit non-zero if below threshold
amc guide --compliance EU_AI_ACT  # EU AI Act compliance guardrails
amc guide --compliance          # All 5 frameworks (EU AI Act, ISO 42001, NIST, SOC 2, ISO 27001)
```

### Check what needs work

```bash
# Full diagnostic — shows every dimension and where you're weak
amc score formal-spec my-agent

# Quick check — what's your biggest gap?
amc quickscore
```

### Common improvements by level

**L0 → L1** (the basics):
```bash
# Define what your agent is allowed to do
amc score behavioral-contract    # Shows if you have an alignment card

# Check if you have basic safety controls
amc score owasp-llm              # OWASP LLM Top 10 coverage
```

**L1 → L2** (add structure):
```bash
# Set up evidence collection
amc score collect-evidence my-agent

# Check your audit trail
amc score audit-depth

# Verify policy enforcement
amc score policy-consistency
```

**L2 → L3** (measure everything):
```bash
# Score factuality and truthfulness
amc score factuality

# Check alignment across safety, honesty, helpfulness
amc score alignment-index

# Monitor behavioral drift
amc score sleeper-detection
```

**L3 → L4** (optimize):
```bash
# Calibration — does the agent know what it doesn't know?
amc score calibration-gap

# Evidence density — are there blind spots?
amc score density-map

# Gaming resistance — can someone cheat the scores?
amc score gaming-resistance
```

**L4 → L5** (prove it):
```bash
# Cryptographic evidence chains
amc score output-attestation

# Agent-to-agent trust verification
amc score mutual-verification

# Transparency log with Merkle proofs
amc score transparency-log
```

---

## Studio (Local Control Plane)

Studio is AMC's local web UI for managing agents, viewing scores, and running evaluations.

```bash
# Start Studio
amc up

# Check status
amc status

# Stop Studio
amc down
```

Studio gives you:
- Live dashboard with agent scores
- Evidence browser
- Evaluation runner
- Policy editor
- Audit log viewer

---

## Connecting Your Agent Framework

AMC auto-detects your framework during setup:

```bash
amc setup --demo    # Quick start with demo data
amc setup           # Full setup with framework detection
```

Supported frameworks (auto-detected):
- **LangChain** (Python & Node)
- **LangGraph**
- **CrewAI**
- **AutoGen**
- **OpenAI Agents SDK**
- **LlamaIndex**
- **Semantic Kernel**
- **Claude Code**
- **Gemini CLI**
- **OpenClaw**
- **OpenHands**
- **Generic CLI** (any agent via shell wrapper)

### Manual adapter setup

```bash
# List available adapters
amc adapters list

# Run an evaluation with a specific adapter
amc adapters run langchain-python --agent my-agent
```

---

## Evidence Collection

AMC's power comes from evidence — not questionnaires. Evidence is collected automatically during agent runs.

```bash
# Collect evidence from a run
amc score collect-evidence my-agent

# Verify evidence integrity
amc evidence verify

# Bundle evidence for sharing
amc evidence bundle create
```

### Ingesting from external eval systems

Already running evals elsewhere? Import them:

```bash
# From OpenAI Evals
amc score evidence-ingest --format openai-evals

# From LangSmith
amc score evidence-ingest --format langsmith

# From MLflow
amc score evidence-ingest --format mlflow

# From Weights & Biases
amc score evidence-ingest --format weights-biases
```

---

## Key Commands Reference

### Lifecycle
| Command | What it does |
|---------|-------------|
| `amc init` | Create a new workspace |
| `amc setup` | Full setup with framework detection |
| `amc setup --demo` | Quick demo with sample data |
| `amc doctor` | Health check your workspace |
| `amc doctor-fix` | Auto-repair common issues |
| `amc up` | Start Studio |
| `amc down` | Stop Studio |

### Scoring
| Command | What it does |
|---------|-------------|
| `amc quickscore` | 2-minute rapid assessment |
| `amc score formal-spec <agent>` | Full formal maturity score |
| `amc score production-ready <agent>` | Production readiness gate |
| `amc score adversarial <agent>` | Gaming resistance test |
| `amc score collect-evidence <agent>` | Collect evidence from runs |

### Agent Guide
| Command | What it does |
|---------|-------------|
| `amc guide --go` | Zero-friction: detect + generate + apply |
| `amc guide --status` | One-line health check |
| `amc guide --interactive` | Cherry-pick gaps to fix |
| `amc guide --ci --target 3` | CI gate mode |
| `amc guide --watch --apply` | Continuous monitoring |
| `amc guide --diff` | Compare with previous run |
| `amc guide --compliance EU_AI_ACT` | EU AI Act compliance guardrails |
| `amc guide --compliance` | All 5 regulatory frameworks |
| `amc guide --frameworks` | List supported frameworks |

### Research-Backed Modules
| Command | What it scores |
|---------|---------------|
| `amc score calibration-gap` | Confidence vs reality |
| `amc score evidence-conflict` | Internal evidence consistency |
| `amc score density-map` | Evidence blind spots |
| `amc score gaming-resistance` | Score manipulation resistance |
| `amc score sleeper-detection` | Hidden behavioral triggers |
| `amc score audit-depth` | Audit trail completeness |
| `amc score policy-consistency` | Policy enforcement reliability |
| `amc score factuality` | Truthfulness across dimensions |
| `amc score alignment-index` | Safety/honesty/helpfulness |
| `amc score interpretability` | Explainability |
| `amc score memory-integrity` | Memory poisoning resistance |
| `amc score output-attestation` | Cryptographic output signing |
| `amc score mutual-verification` | Agent-to-agent trust |
| `amc score transparency-log` | Merkle tree audit log |

### Compliance
| Command | What it checks |
|---------|---------------|
| `amc score eu-ai-act` | EU AI Act compliance |
| `amc score owasp-llm` | OWASP LLM Top 10 |
| `amc score regulatory-readiness` | Combined regulatory score |

### All commands
```bash
amc --help              # Top-level commands
amc score --help        # All scoring commands
amc evidence --help     # Evidence management
amc audit --help        # Audit tools
amc admin --help        # Administration
```

---

## JSON Output

Every command supports `--json` for automation:

```bash
amc quickscore --json
amc score calibration-gap --json
amc doctor --json
```

Pipe into `jq` for scripting:

```bash
amc score formal-spec my-agent --json | jq '.overallScore'
```

---

## Troubleshooting

### "Doctor result: FAIL"
This is normal on first run. The doctor checks for optional components:
- **Studio not running** → Run `amc up`
- **Vault locked** → Run `amc vault unlock`
- **Gateway config missing** → Run `amc gateway init`
- **Signature issues** → Run `amc doctor-fix`

### "Score is 0"
Zero scores mean no data was provided. AMC scores from evidence, not defaults:
1. Run `amc score collect-evidence <agentId>` to gather data
2. Or use `--json` to pipe in evidence programmatically
3. Or run `amc quickscore` for a questionnaire-based baseline

### Python tests
```bash
# From repo root
python3 -m pytest platform/python/tests/ -q

# From platform directory
cd platform/python && python3 -m pytest tests/ -q
```

---

## Architecture (for the curious)

```
.amc/                    # Workspace (created by amc init)
├── agent.config.yaml    # Agent configuration
├── action-policy.yaml   # What the agent can/can't do
├── tools.yaml           # Tool permissions
├── trust.yaml           # Trust boundaries
├── evidence.sqlite      # Evidence database
├── keys/                # Cryptographic keys
├── vault.amcvault       # Encrypted secrets
├── transparency/        # Merkle tree audit log
├── assurance/           # Assurance pack results
├── audit/               # Audit reports
└── runs/                # Evaluation run data
```

---

## Next Steps

1. **Run `amc quickscore`** — get your baseline
2. **Run `amc guide --go`** — generate and apply guardrails automatically
3. **Run `amc doctor`** — check your environment
4. **Run `amc setup --demo`** — explore with sample data
5. **Run `amc guide --diff`** — see what improved after your agent works with guardrails
6. **Set up evidence collection** — move from questionnaires to proof

## New: Transparency Reports & MCP Server

**Generate an Agent Transparency Report (SBOM for agents):**
```bash
amc transparency report --agent default
amc transparency report --format json > agent-report.json
```

**Connect to IDE via MCP:**
```bash
amc mcp serve --workspace .
# Then add to Claude Code / Cursor / Windsurf config
amc mcp install-config --ide claude-code
```

Questions? Issues? [GitHub](https://github.com/thewisecrab/AgentMaturityCompass)
