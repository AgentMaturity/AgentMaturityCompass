# Quickstart — 2 Minutes to First Full Score

Get your AI agent's trust score in under 5 minutes. No code changes needed.

---

## Prerequisites

- **Node.js ≥ 20** ([download](https://nodejs.org/))

---

## 1. Install AMC (30 seconds)

```bash
npm i -g agent-maturity-compass
```

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

> **Tip:** For a demo workspace with sample data, run `amc setup --demo` and then `amc`.

---

## 3. Read your result

```bash
amc
```

AMC returns a maturity level from **L0** (no governance) to **L5** (self-governing), plus a gap analysis showing what to fix first.

**Optional expanded assessment:**

```bash
amc run --question-set lifecycle    # 240 default questions + 20 lifecycle questions
```

**Optional fast pulse check:**

```bash
amc quickscore --rapid    # lightweight pulse check, not the full score
amc badge                 # README badge after a scored run
```

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
| Deep diagnostic (240 default questions) | `amc diagnostic run` |
| Lifecycle-expanded diagnostic (260 questions) | `amc run --question-set lifecycle` |
| EU AI Act compliance check | `amc compliance report --framework EU_AI_ACT` |
| Red-team your agent | `amc assurance run --all` |
| Prove governed resources did not drift | `amc resource snapshot` / `amc resource validate` |
| Protect live traffic | `amc firewall enable --mode block` / `amc firewall events` |
| Confirm security findings safely | `amc shield confirm scope-write --file security-scope.json` / `amc shield confirm run --task finding-task.json` |
| Import existing run evidence | `amc import ./agent-run --dry-run` / `amc import ./agent-run` |
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
| Review uncertainty gates | `amc report <run>` / Studio low-confidence filters |
| Mine recurring trace failures | `amc trace index` / `amc trace failures` |
| Generate governed fix RCA | `amc mechanic rca run <run>` / `amc mechanic rca list` |
| Compare governed fix candidates | `amc experiment optimize --rca latest` / `amc experiment optimizer-list` |
| CI/CD release gate | `amc guide --ci --target 3` |
| Auto-fix gaps | `amc fix` |
| HTML report for stakeholders | `amc report <id> --html report.html` |
| Continuous monitoring | `amc guide --watch --apply` |
| Score timeline + anomaly detection | `amc observe timeline` / `amc observe anomalies` |
| Inspect sessions and tool calls | `amc trace list` / `amc trace inspect` |
| Curate golden datasets | `amc dataset create` / `amc dataset add-case` |
| Run business-specific evals | `amc dataset run <name>` |
| Score a non-agent LLM app | `amc lite-score` |
| Correlate maturity to outcomes | `amc business kpi` / `amc business report` |
| Compare agents publicly or internally | `amc leaderboard show` |

---

## Troubleshooting

**`amc: command not found`** — Make sure `npm` global bin is in your PATH. Run `npm config get prefix` and add `<prefix>/bin` to your PATH.

**`better-sqlite3` build errors** — Install build tools: `sudo apt install build-essential python3` (Linux) or `xcode-select --install` (macOS).

**Forgot passphrase** — The vault is encrypted. If lost, re-initialize with `amc init` (previous evidence chain is unrecoverable).

---

📖 [Full documentation](./GETTING_STARTED.md) · 🧪 [Assurance Lab](./ASSURANCE_LAB.md) · 🏗️ [Architecture](./ARCHITECTURE_MAP.md)
