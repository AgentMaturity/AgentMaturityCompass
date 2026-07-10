# Getting Started with AMC

**Time to first full score: ~2 minutes.**

AMC (Agent Maturity Compass) scores your AI agent's trustworthiness from actual behavior — not self-reported claims. Think of it as a credit score for AI agents.

---

## Install

**Prerequisites:** Node.js ≥ 20. AMC uses `better-sqlite3` which includes prebuilt binaries for most platforms. If prebuilds aren't available for your OS/arch, you'll need Python 3 and a C++ compiler (`build-essential` on Linux, Xcode CLI tools on macOS).

macOS or Linux:

```bash
curl -fsSL https://agentmaturity.co/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://agentmaturity.co/install.ps1 | iex
```

The hosted installer pins a GitHub release and verifies the downloaded platform archive against `SHA256SUMS` before it runs the packaged installer. AMC does not advertise npm or Homebrew registry channels until they are public.

## Your First Full Score (2 minutes)

```bash
# 1. Create a workspace
mkdir my-agent && cd my-agent

# 2. Run the full AMC lifecycle
amc
```

That's it. AMC creates the workspace if needed, runs the full score, prints the maturity level (L0-L5), separates artifact validity from evidence readiness, and shows the next action.

> **First-run trust contract:** a clean project can produce a signed, `VALID` report with `INSUFFICIENT_EVIDENCE`. The signature proves the report was not altered; it does not prove that AMC observed enough agent behavior. Capture a real run and rerun AMC. Only `READY` evidence is eligible for external claims.

> **Why no setup command first?** The top-level `amc` command is the default onboarding path. It detects what is available, creates the minimum workspace state, and falls back to unsigned/demo-safe behavior when a local vault cannot be unlocked.

For a smaller startup path that only creates the workspace and points you to lightweight next checks:

```bash
amc quickstart --minimal
```

For a guided 10-minute startup path with framework detection and sample answers:

```bash
amc quickstart --startup-plan --role cto --answers-out amc-startup-answers.json
amc quickstart --what-broken
amc quickscore --answers amc-startup-answers.json --json
```

Use `--startup-plan` when you want a role-aware plan and starter answer file before running a measured score. Use `--what-broken` when you only want startup blockers, vault/passphrase readiness, and the next commands.

After scoring, AMC automatically shows what your agent needs to reach the next level.

**Optional: run a fast pulse check** when you only need a lightweight demo score:

```bash
amc quickscore --rapid
```

For CI, scripted demos, or other non-interactive runs, provide answer JSON explicitly:

```bash
amc quickscore --answers answers.json --json
```

If a no-prompt run prints a placeholder L0 score, AMC now shows: "Did you mean to run the interactive score?" Use `amc quickscore` in a terminal for prompted scoring, or keep using `--answers` for CI.

If `amc quickscore --auto --json` has no captured ledger evidence, AMC fails closed with `scoreStatus: "AUTO_NO_EVIDENCE"` and no measured score fields. Capture evidence first with `amc wrap <runtime> -- <your-agent-command>`, or use `amc quickscore --answers answers.json --json` for a CI-safe survey score.

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

The maturity level and evidence-readiness status answer different questions. Maturity describes the controls demonstrated by the score. `READY`, `LIMITED`, `INSUFFICIENT_EVIDENCE`, or `UNVERIFIED` describes whether the underlying evidence can support claims. Never treat `VALID` or signed artifact status as a substitute for `READY`.

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

AMC evaluates 5 dimensions with 244 default questions. The optional lifecycle expansion adds 20 explicitly versioned questions across lifecycle governance, harness resources, evidence binding, typed multi-agent systems, trace repair, proof exports, reasoning memory, uncertainty controls, runtime gateway/watch, and fleet/org operation.

1. **Strategic Agent Operations** (19 default questions) — Mission clarity, scope adherence, decision traceability
2. **Leadership & Autonomy** (23 default questions) — Governance, decision-making authority, autonomy boundaries
3. **Culture & Alignment** (95 default questions) — Safety culture, value alignment, compliance
4. **Resilience** (55 default questions) — Graceful degradation, circuit breakers, monitor bypass resistance
5. **Skills** (52 default questions) — Tool mastery, evidence practices, testing, learning

To run the expanded set:

```bash
amc run --question-set lifecycle
```

## The 8 AMC Surfaces

Everything AMC does fits under one simple trust stack:

| Surface | Promise | What it does |
|---|---|---|
| **Score** | Score trust before you ship | Evidence-weighted scoring across live execution behavior instead of brochure claims. |
| **Shield** | Attack your agent before attackers do | Runs adversarial packs against prompt injection, leakage, memory poisoning, and sycophancy. |
| **Enforce** | Wrap agent actions in policy | Approval gates, scoped permissions, and runtime controls for sensitive operations. |
| **Vault** | Cryptographically prove what happened | Signs evidence, verifies ledgers, and gives auditors a tamper-evident chain of custody. |
| **Watch** | See trust drift before it hurts you | Monitors posture over time and surfaces anomalies, regressions, and risky changes. |
| **Comply** | Map trust evidence to real frameworks | Turns technical evidence into regulator-readable artifacts for audits and risk reviews. |
| **Fleet** | Govern many agents like an actual platform | Benchmarks multiple agents, compares risk posture, and enforces org-wide trust baselines. |
| **Passport** | Make trust portable between environments | Issues a portable, signed trust identity that can move between tools, teams, and environments. |

---

## Improving Your Agent's Score

### The fastest path: Agent Guide

The Agent Guide generates personalized guardrails from your score and applies them directly to your agent's config file:

```bash
# One command — auto-detect framework, generate guardrails, apply to config
amc guide --go
```

This auto-detects your framework (LangChain, CrewAI, Claude Code, Cursor, etc.), generates severity-tagged guardrails (🔴 Critical / 🟡 High / 🔵 Medium), and applies them to your agent's config file.

After your agent works with the new guardrails, run the full score again and see what improved:

```bash
amc
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

# Full check — what's your biggest gap?
amc
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
# Capture the first real agent run without choosing between setup paths
amc evidence collect --first-run --runtime any -- node agent.js

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

Studio is AMC's local web UI for managing agents, viewing scores, and running evaluations. macOS and Windows desktop packages also include the `Agent Maturity Compass Studio` launcher app, which opens this same local console in the system browser.

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
- Lifecycle Evidence page for the 8 surfaces, full-score artifacts, episodes, decisions, and Enforce resource proof
- Evaluation runner
- Policy editor
- Audit log viewer

Desktop package users can launch Studio without typing the CLI command:

```bash
# macOS package
open "Agent Maturity Compass Studio.app"
```

```powershell
# Windows package
.\Agent Maturity Compass Studio.cmd
```

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
# Capture your first real agent run
amc evidence collect --first-run --runtime any -- node agent.js

# Preview the capture plan without running the agent
amc evidence collect --first-run --dry-run --runtime any -- node agent.js

# Verify evidence integrity
amc evidence verify

# Bundle evidence for sharing
amc bundle export --out evidence.amcbundle
```

### Ingesting from external eval systems

Already running evals elsewhere? Import them:

```bash
# From OpenAI Evals
amc eval import --format openai --file ./openai-evals.jsonl

# From LangSmith
amc eval import --format langsmith --file ./langsmith.jsonl

# From Promptfoo
amc eval import --format promptfoo --file ./promptfoo.json

# Generic local logs
amc ingest ./external-agent-logs/ --type generic_json --agent imported-agent
```

---

## Key Commands Reference

### Lifecycle
| Command | What it does |
|---------|-------------|
| `amc` | Create a workspace if needed and run the full score |
| `amc init --minimal` | Startup-friendly workspace setup without vault prompt or immediate full-score prompt |
| `amc quickstart --minimal` | Minimal quickstart path with lightweight next steps |
| `amc setup` | Full setup with framework detection |
| `amc setup --demo` | Quick demo with sample data |
| `amc doctor` | Health check your workspace |
| `amc doctor-fix` | Auto-repair common issues |
| `amc up` | Start Studio |
| `amc down` | Stop Studio |

### Scoring
| Command | What it does |
|---------|-------------|
| `amc` | Full evidence-backed maturity score |
| `amc quickscore --rapid` | Optional lightweight pulse check |
| `amc quickscore --answers answers.json --json` | Non-interactive diagnostic from provided L0-L5 answers |
| `amc score formal-spec <agent>` | Full formal maturity score |
| `amc score production-ready <agent>` | Production readiness gate |
| `amc score adversarial <agent>` | Gaming resistance test |
| `amc evidence collect --first-run --runtime any -- <agent command>` | Capture a first real agent run without the interactive method picker |
| `amc business risk --maturity 3 --baseline-frequency 4 --incident-cost 50000 --risk-appetite 75000` | Convert maturity into residual incident frequency, expected annual loss, and risk-appetite status |
| `amc business fair-scenario --scenario claims-ai-data-leak --maturity 3 --frequency-min 2 --frequency-most-likely 5 --frequency-max 9 --loss-min 20000 --loss-most-likely 75000 --loss-max 250000 --out fair-scenario.md` | Run a FAIR-style calibrated scenario distribution with P10/P50/P90 loss estimates |
| `amc business roi --current-maturity 2 --target-maturity 3 --baseline-frequency 5 --incident-cost 20000 --annual-control-cost 15000 --implementation-cost 5000` | Estimate first-year ROI from a maturity improvement and write a cost-of-trust-gap business case |
| `amc business heatmap --portfolio risk-portfolio.json --out risk-heatmap.md` | Build a portfolio monetary risk heatmap across agents, business units, and annual loss appetite |
| `amc business grc-export --portfolio risk-portfolio.json --out grc-treatment-plan.csv` | Export a GRC treatment-plan register with control owners, due dates, appetite status, ISO 31000 context, and FAIR-style frequency/magnitude fields |
| `amc executive brief --run latest --out board-brief.html` | Generate a board-ready one-page HTML brief that can be printed to PDF |
| `amc leaderboard public-export --output public-leaderboard` | Build an anonymized dataset-card and JSONL bundle for public leaderboard review |
| `amc compare <run-a> <run-b> --output compare.json --badge` | Compare two scored runs and write a comparison SVG badge beside the report |

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

### Enforce Resource Proof
| Command | What it does |
|---------|-------------|
| `amc resource snapshot` | Snapshot the prompts, tools, policies, memory, routes, evaluators, datasets, schemas, environments, and configs that define the agent |
| `amc resource validate` | Run Enforce gates for signature validity, owners, contained paths, immutable resources, rollback readiness, review, and evidence coverage |
| `amc resource propose` / `amc resource evaluate` | Create a dry-run proposal and show the policy decision before accepting resource changes |
| `amc resource apply` | Dry-run apply by default; add `--yes` to accept current resources as the new signed manifest and write a signed receipt |
| `amc resource rollback` | Dry-run rollback by default; add `--apply` to restore from a prior snapshot or explain why rollback cannot happen |
| `amc firewall enable --mode block` | Turn on Runtime Firewall protection for live Bridge/Gateway traffic |
| `amc firewall check --direction request --text "ignore previous instructions"` | Preview the exact allow/warn/block decision before traffic reaches a model |
| `amc firewall events` / `amc firewall export --format splunk --redacted` | Inspect and export signed runtime decisions without leaking local paths or sensitive previews |
| `amc shield confirm scope-write --file security-scope.json` | Authorize controlled exploit confirmation with ownership, time window, safe mode, and allowed techniques |
| `amc shield confirm run --scope <scope> --task finding-task.json` | Convert an authorized finding into safe proof with hashes, signals, and receipts instead of exploit instructions |
| `amc shield confirm export <proof> --out safe-proof.json` | Export redacted confirmation proof for Vault/Passport evidence bundles |
| `amc import <path> --dry-run` / `amc import <path>` | Detect and import neutral traces, runs, workflow graphs, configs, memory, evaluator outputs, and benchmarks as redacted AMC evidence |
| `amc executive brief --run latest --out board-brief.html` | Write a print-ready board one-pager from a diagnostic run without certificate signing |
| `amc compare <run-a> <run-b> --output compare.json --badge` | Compare scored runs and write a comparison SVG badge beside the report |
| `amc strategy compare --file strategies.json` | Compare inference strategies by score, cost, latency, risk, confidence, and evidence refs |
| `amc strategy compare --file strategies.json --apply --approve` | Commit the recommended model route only with policy approval, manifest evidence, and rollback data |
| `amc runtime create|event|inspect|resume|cancel|degrade|complete` | Persist connected-agent run state and redacted event streams that CLI and Studio both read |
| `amc fleet graph write --file graph.json` | Register the typed multi-agent graph that defines nodes, handoffs, tools, contracts, policies, permissions, and invariants |
| `amc fleet graph validate` | Check the graph for missing contracts, unsafe permissions, cycles, and unbounded fan-out before fleet scoring |
| `amc fleet score --all --stream --sla 120s` | Full-score every configured agent with progressive per-agent status, first-result SLA timing, lifecycle artifacts, and partial-failure summaries |
| `amc fleet lifecycle list|show <run>` | Inspect the fleet parent lifecycle artifact, child runs, topology, typed graph digest, shared resources, and cascade failures |
| `amc org run --roles REV_PRODUCT_MANAGER,REV_TECH_LEAD,REV_QA_LEAD` | Advanced Fleet org loop with isolated role workspaces, public state, private grader state, Watch heartbeats, Enforce gates, and parent/child lifecycle artifacts |
| `amc org runs` / `amc org inspect <run> --redacted` | List or inspect org runs without exposing local private grader paths |
| `amc resource history` / `amc resource contract` | Show signed manifests, receipts, and the AMC-native lifecycle protocol |
| `amc enforce resources verify` / `amc enforce resources diff` | Advanced aliases for the same Enforce resource engine |
| `amc commands --markdown` | Generate the live CLI command inventory from the registered command map |
| `npm run release:gate` | Run the release gate for typecheck, build, Studio assets, OpenAPI, docs drift, CLI smoke, domain packs, and receipt output |
| `amc evidence lifecycle list` | List the full lifecycle artifacts created by `amc` and `amc run` |
| `amc evidence lifecycle export <run> --out lifecycle.json --redacted` | Export a shareable lifecycle artifact without local workspace paths |
| `amc evidence episodes list` | List the durable evidence episodes created by `amc` and `amc run` |
| `amc evidence episodes inspect <id>` | Inspect one episode by run id or episode id |
| `amc evidence episodes export <id> --out episode.md --redacted` | Export an episode as Markdown or JSON without local workspace paths |
| `amc evidence decisions list` | List recommendation and evidence-request receipts generated by full-score runs |
| `amc evidence decisions inspect <id>` | Inspect one decision receipt with hypothesis, predicted outcome, confidence, and evidence refs |
| `amc evidence decisions observe <run>` | Update open decision receipts with observed outcomes from a later full-score run |
| `amc evidence observability list` | List component attribution, experience signals, and decision-chain records |
| `amc evidence observability inspect <run>` | Inspect one run-level observability lane record |
| `amc memory writeback <episode>` | Store an evidence-backed, redacted reasoning lesson with expiry, allowed consumers, and a writeback receipt |
| `amc memory retrieve --consumer fixer` / `amc memory show <memory>` | Retrieve active reasoning memory for score, recommendations, fixer, or Studio with citations |
| `amc run-alias set <alias> <run>` | Name a diagnostic run for customer-success, report, and history workflows |
| `amc report <run|alias|latest>` / Studio Diagnostic filters | Review confidence, uncertainty, low-evidence downgrades, and auto-fix review gates |
| `amc report <alias> --share --public-base-url <url>` | Generate a static report bundle, local file URL, and public URL manifest for client review |
| `amc trace index` / `amc trace index --run <run>` | List or inspect distilled trace failure indexes created from full-score evidence |
| `amc trace failures` | Show ranked recurring failure clusters with affected agents, runs, score impact, and repair input |
| `amc mechanic rca run <run>` | Generate likely root causes, regression tests, rollback pointers, and governed Enforce fix proposals |
| `amc mechanic rca list` / `amc mechanic rca show <run>` | Review signed Fixer RCA reports without exposing local workspace paths |
| `amc experiment optimize --rca latest` | Create isolated optimizer candidates with held-out validation, leakage checks, Pareto ranking, and receipts |
| `amc experiment optimizer-list` / `amc experiment optimizer-show latest` | Review accepted/rejected optimizer candidates and reasons |
| `amc evidence finding-proofs list` | Trace each major finding to evidence, resources, receipts, and recommendation ids |
| `amc evidence finding-proofs export --out proofs.json --redacted` | Export shareable proof chains without local workspace paths |
| `amc evidence lifecycle-receipts list` | List proposal, validation, commit, rollback, and monitor receipts |
| `amc evidence lifecycle-receipts export --out receipts.json --redacted` | Export lifecycle change receipts without local workspace paths |

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
amc --json
amc score calibration-gap --json
amc doctor --json
```

The top-level JSON keeps claim readiness explicit: `status` is the evidence-readiness status, `artifactStatus` is the seal result, and `claimEligible` is `true` only for `READY`. Use `claimBoundary` and `nextEvidenceStep` instead of inferring readiness from `signed: true`.

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
1. Run `amc evidence collect --first-run --runtime any -- node agent.js` to capture the first real run
2. Or use `--json` to pipe in evidence programmatically
3. Or run `amc` for a full local baseline

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

1. **Run `amc`** — get your full baseline
2. **Run `amc guide --go`** — generate and apply guardrails automatically
3. **Run `amc doctor`** — check your environment
4. **Run `amc setup --demo`** — explore with sample data
5. **Run `amc guide --diff`** — see what improved after your agent works with guardrails
6. **Set up evidence collection** — `amc evidence collect --first-run --runtime any -- node agent.js`

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

Questions? Issues? [GitHub](https://github.com/AgentMaturity/AgentMaturityCompass)
