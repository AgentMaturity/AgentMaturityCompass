# Quickstart — 2 Minutes to First Full Score

Get your AI agent's trust score in under 5 minutes. No code changes needed.

---

## Prerequisites

- **Node.js ≥ 20** ([download](https://nodejs.org/))

---

## 1. Install AMC (30 seconds)

```bash
curl -fsSL https://agentmaturity.co/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://agentmaturity.co/install.ps1 | iex
```

The installer pins the GitHub release and verifies SHA-256 before execution. Node.js 20 or 22 LTS is required.

Verify it worked:

```bash
amc --version
```

---

## 2. Run AMC in your agent project

```bash
mkdir my-agent && cd my-agent
amc
```

`amc` is the default path. It creates the `.amc/` workspace if needed, detects what it can score, runs the full maturity score, and prints the next action.

On a clean project, the report can be signed and `VALID` while evidence readiness is `INSUFFICIENT_EVIDENCE`. This is the honest first baseline: the artifact is intact, but AMC has not yet observed enough execution evidence to support external claims.

> **Tip:** For a demo workspace with sample data, run `amc setup --demo` and then `amc`.

For a stripped-down startup setup that skips the vault prompt and immediate full-score prompt:

```bash
amc init --minimal
amc quickscore --rapid
```

For a startup action plan without the full interactive score:

```bash
amc quickstart --startup-plan --role cto --answers-out amc-startup-answers.json
amc quickstart --what-broken
amc quickscore --answers amc-startup-answers.json --json
```

`--startup-plan` detects common agent frameworks, writes optional sample L0-L5 answers for non-interactive scoring, and explains the vault passphrase environment variable before signed evidence capture. `--what-broken` prints only the startup blockers and next commands.

Want to see the live gateway demo before setup?

```bash
amc demo run --no-vault
```

This starts an ephemeral demo workspace and gateway without touching your current vault. Output is labeled `DEMO_ONLY`; use `amc setup` or `amc init` for production audit evidence.

Running a sales or stakeholder walkthrough?

```bash
amc demo prospect
amc demo share --public-base-url https://reports.example.com/amc-demo
```

`amc demo prospect` prints a five-minute flow that includes `amc demo gap --fast`, `amc demo run --no-vault`, `amc compare-models`, and `amc leaderboard show`. `amc demo share` writes a static leave-behind bundle; publish the generated directory to the matching base URL before sending the link.

---

## 3. Read your result

```bash
amc
```

AMC returns a maturity level from **L0** (no governance) to **L5** (self-governing), plus a gap analysis showing what to fix first.

Read the two status lines independently:

| Status | What it answers |
|---|---|
| Artifact status: `VALID`, `INVALID`, or `UNSIGNED` | Is this report intact and verifiable? |
| Evidence readiness: `READY`, `LIMITED`, `INSUFFICIENT_EVIDENCE`, or `UNVERIFIED` | Is the evidence strong enough for external claims? |

Only `READY` is claim-eligible. Signing proves artifact integrity, not evidence sufficiency.

**Optional expanded assessment:**

```bash
amc run --question-set lifecycle    # 244 default questions + 20 lifecycle questions
```

**Optional fast pulse check:**

```bash
amc quickscore --rapid    # lightweight pulse check, not the full score
amc badge                 # README badge after a scored run
```

For CI or other non-interactive runs, pass answer levels as JSON instead of relying on a TTY prompt:

```bash
amc quickscore --answers answers.json --json
amc quickscore --rapid --answers '{"AMC-1.1":3,"AMC-2.1":4}' --json
```

If `amc quickscore` cannot open terminal prompts, its placeholder L0 output includes the hint "Did you mean to run the interactive score?" so first-run users know to rerun in a terminal or pass answer JSON.

If `amc quickscore --auto --json` cannot find captured execution evidence, it returns `scoreStatus: "AUTO_NO_EVIDENCE"` and no measured score fields. Use `amc wrap <runtime> -- <your-agent-command>` to capture evidence first, or use `amc quickscore --answers answers.json --json` when you want CI-safe survey scoring.

For Claude Code or Gemini CLI, observe native tool requests with one reversible project setup:

```bash
amc connect hooks install --provider claude-code --agent my-agent --dry-run
amc connect hooks install --provider claude-code --agent my-agent
amc connect hooks status --provider claude-code
```

Replace `claude-code` with `gemini-cli` for Gemini CLI. The observer sends no tool arguments and makes no allow or deny decision. Run `amc connect hooks remove --provider claude-code` to remove only AMC's owned handler and revoke its lease.

---

## 4. Import eval results from your framework (optional, 1 minute)

Already running evals? Import them directly — AMC signs and stores them as tamper-evident evidence.

### LangSmith

```bash
amc eval import --format langsmith --file langsmith-export.json
```

### DeepEval

```bash
amc eval import --format deepeval --file deepeval-results.json
```

### Promptfoo

```bash
amc eval import --format promptfoo --file promptfoo-output.json
```

### OpenAI Evals

```bash
amc eval import --format openai --file openai-evals.jsonl
```

### Weights & Biases

```bash
amc eval import --format wandb --file wandb-export.json
```

### Langfuse

```bash
amc eval import --format langfuse --file langfuse-traces.json
```

Check coverage after import:

```bash
amc eval status
```

---

## 5. Auto-generate guardrails (1 minute)

```bash
amc guide --go
```

This auto-detects your framework (LangChain, CrewAI, Claude Code, Cursor, OpenClaw, etc.), generates severity-tagged guardrails (🔴 Critical / 🟡 High / 🔵 Medium), and applies them to your agent's config.

Run the full score again to see improvement:

```bash
amc
amc guide --diff    # Shows closed gaps, new gaps, level changes
```

---

## Framework-Specific Examples

### LangChain (Python)

```bash
cd examples/langchain-python
pip install -r requirements.txt

amc up                                          # Start AMC Gateway
amc wrap langchain-python -- python main.py     # Run with evidence capture
```

### CrewAI

```bash
cd examples/crewai
pip install -r requirements.txt

amc up
amc wrap crewai -- python main.py
```

### OpenAI Agents SDK

```bash
cd examples/openai-agents-sdk
pip install -r requirements.txt

amc up
amc wrap openai-agents -- python main.py
```

### LangGraph

```bash
cd examples/langgraph-python
pip install -r requirements.txt

amc up
amc wrap langgraph -- python main.py
```

### OpenClaw

```bash
amc up
amc wrap openclaw-cli -- openclaw run
```

### Generic CLI Agent

```bash
amc up
amc wrap generic -- your-agent-command
```

> All examples live in `examples/` with their own README. The gateway proxy (`amc up`) captures LLM calls transparently — your agent code doesn't change.

---

## What's Next

| Goal | Command |
|------|---------|
| Deep diagnostic (244 default questions) | `amc diagnostic run` |
| Lifecycle-expanded diagnostic (264 questions) | `amc run --question-set lifecycle` |
| EU AI Act compliance check | `amc compliance report --framework EU_AI_ACT` |
| Red-team your agent | `amc assurance run --all` |
| Prove governed resources did not drift | `amc resource snapshot` / `amc resource validate` |
| Protect live traffic | `amc firewall enable --mode block` / `amc firewall events` |
| Inspect effective guardrails | `amc guardrails list` / `amc guardrails enable prompt-injection-detection` |
| Confirm security findings safely | `amc shield confirm scope-write --file security-scope.json` / `amc shield confirm run --task finding-task.json` |
| Import existing run evidence | `amc import ./agent-run --dry-run` / `amc import ./agent-run` |
| Create a board one-pager | `amc executive brief --run latest --out board-brief.html` |
| Compare scored runs with badge output | `amc compare <run-a> <run-b> --output compare.json --badge` |
| Compare model routes | `amc strategy compare --file strategies.json` / `amc strategy compare --file strategies.json --apply --approve` |
| Track connected runs | `amc runtime create --run live-1` / `amc runtime inspect live-1` |
| Coordinate role workspaces | `amc org run --roles REV_PRODUCT_MANAGER,REV_TECH_LEAD,REV_QA_LEAD` |
| Validate fleet topology | `amc fleet graph write --file graph.json` / `amc fleet graph validate` |
| Inspect fleet lifecycle | `amc fleet lifecycle list` / `amc fleet lifecycle show <run>` |
| Inspect org run evidence | `amc org runs` / `amc org inspect <run> --redacted` |
| Inspect lifecycle artifacts | `amc evidence lifecycle list` / `amc evidence lifecycle inspect <run>` |
| Export shareable lifecycle proof | `amc evidence lifecycle export <run> --out lifecycle.json --redacted` |
| Inspect full-score evidence episodes | `amc evidence episodes list` / `amc evidence episodes inspect <id>` |
| Run release gate | `npm run release:gate` |
| Export a shareable episode | `amc evidence episodes export <id> --out episode.json --redacted` |
| Inspect recommendation receipts | `amc evidence decisions list` / `amc evidence decisions inspect <id>` |
| Observe receipt outcomes | `amc evidence decisions observe <run>` |
| Inspect decision observability | `amc evidence observability list` / `amc evidence observability inspect <run>` |
| Write governed reasoning memory | `amc memory writeback <episode>` / `amc memory retrieve --consumer studio` |
| Name a diagnostic run | `amc run-alias set q1-assessment latest` |
| Review uncertainty gates | `amc report <run|alias|latest>` / Studio low-confidence filters |
| Mine recurring trace failures | `amc trace index` / `amc trace failures` |
| Generate governed fix RCA | `amc mechanic rca run <run>` / `amc mechanic rca list` |
| Compare governed fix candidates | `amc experiment optimize --rca latest` / `amc experiment optimizer-list` |
| CI/CD release gate | `amc guide --ci --target 3` |
| Auto-fix gaps | `amc fix` |
| HTML report for stakeholders | `amc report q1-assessment --html report.html` |
| Shareable report URL | `amc report q1-assessment --share --public-base-url https://reports.example.com/amc` |
| Continuous monitoring | `amc guide --watch --apply` |
| Score timeline + anomaly detection | `amc observe timeline` / `amc observe anomalies` |
| Inspect sessions and tool calls | `amc trace list` / `amc trace inspect` |
| Curate golden datasets | `amc dataset create` / `amc dataset add-case` |
| Run business-specific evals | `amc dataset run <name>` |
| Score a non-agent LLM app | `amc lite-score` |
| Correlate maturity to outcomes | `amc business kpi` / `amc business report` |
| Quantify expected annual loss | `amc business risk --maturity 3 --baseline-frequency 4 --incident-cost 50000 --json` |
| Run a calibrated loss scenario | `amc business fair-scenario --scenario claims-ai-data-leak --maturity 3 --frequency-min 2 --frequency-most-likely 5 --frequency-max 9 --loss-min 20000 --loss-most-likely 75000 --loss-max 250000 --out fair-scenario.md` |
| Calculate cost-of-trust-gap ROI | `amc business roi --current-maturity 2 --target-maturity 3 --baseline-frequency 5 --incident-cost 20000 --annual-control-cost 15000 --implementation-cost 5000` |
| Create a portfolio risk heatmap | `amc business heatmap --portfolio risk-portfolio.json --out risk-heatmap.md` |
| Export a GRC treatment plan | `amc business grc-export --portfolio risk-portfolio.json --out grc-treatment-plan.csv` |
| Compare agents internally | `amc leaderboard show` |
| Export anonymized public leaderboard data | `amc leaderboard public-export --output public-leaderboard` |

---

## Troubleshooting

**`amc: command not found`** — Make sure `npm` global bin is in your PATH. Run `npm config get prefix` and add `<prefix>/bin` to your PATH.

**`better-sqlite3` build errors** — Install build tools: `sudo apt install build-essential python3` (Linux) or `xcode-select --install` (macOS).

**Forgot passphrase** — The vault is encrypted. If lost, re-initialize with `amc init` (previous evidence chain is unrecoverable).

---

📖 [Full documentation](./GETTING_STARTED.md) · 🧪 [Assurance Lab](./ASSURANCE_LAB.md) · 🏗️ [Architecture](./ARCHITECTURE_MAP.md)
