# Getting Started with AMC

**Time to first full score: ~2 minutes.**

AMC (Agent Maturity Compass) records what your AI agent actually does and scores how far you can trust it from that record, not from what the agent claims about itself.

The shortest path: install from source (below), go to your project folder, type `amc`, and pick from the menu. [Your first five minutes](FIRST_FIVE_MINUTES.md) walks through every screen for a first-time user, and [Troubleshooting](TROUBLESHOOTING.md#first-run-problems) has the fix for each message new users meet most often.

---

## Install

**Prerequisites:** Node.js 22 or 24 for production qualification; Node 20 is only the package compatibility floor. AMC uses `better-sqlite3` which includes prebuilt binaries for most platforms. If prebuilds aren't available for your OS/arch, you'll need Python 3 and a C++ compiler (`build-essential` on Linux, Xcode CLI tools on macOS).

This guide describes the current **1.2.0 source**. The published npm package and GitHub release are **1.1.1**, which predates the native agent workflow. For current behavior or development on a new device, follow [the source installation](INSTALL.md#option-b-from-github-development):

```bash
corepack enable
git clone https://github.com/AgentMaturity/AgentMaturityCompass.git
cd AgentMaturityCompass
pnpm install --frozen-lockfile
pnpm run build
npm link
```

If Corepack is unavailable, install pnpm with `npm install --global pnpm@10.33.0`. After installation, change to the agent project you want to assess. Provider credentials and private runtime state are configured separately; they are not part of a Git clone.

To install the older published **1.1.1** release instead:

macOS or Linux:

```bash
curl -fsSL https://agentmaturity.co/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://agentmaturity.co/install.ps1 | iex
```

The hosted installer pins the published 1.1.1 GitHub release and verifies the downloaded platform archive against `SHA256SUMS` before it runs the packaged installer. npm also publishes 1.1.1; the Homebrew tap is not publicly available. See [publication evidence](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/website/publication-status.json).

## Start: type `amc`

```bash
cd my-agent-project
amc
```

In a terminal, `amc` with no arguments sets up the folder the first time (a hidden `.amc/` workspace) and shows one menu. On a computer where Claude Code and Codex are installed and signed in, it looks like this:

```text
AMC set up this folder (.amc/).
? What do you want to do?
❯ Watch Claude Code as it works (signed in)
  Watch Codex as it works (signed in)
  Try a demo chat (no account or key needed)
  Build an agent for my industry (A4 Forge preview)
  Open the console in my browser
  Just show my score (empty for now)
```

The menu shows only what can work now:

- **Watch Claude Code as it works** / **Watch Codex as it works**: starts AMC (`amc up`), asks before it adds an observe-mode watch hook to this project's settings (`amc connect hooks install --provider claude-code --mode observe --agent default`, or `--provider codex`), then offers to start the agent in this folder. A signed-out agent shows "Sign in to … first" instead, which runs the vendor's own sign-in (`amc login claude` or `amc login codex`). An agent that is not installed is not listed.
- **Chat with a model**: listed when an API key such as `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is set in your shell. It runs `amc agent-loop chat` for that provider and passes the key's name, never its value.
- **Try a demo chat**: `amc agent-loop chat --provider stub`, a built-in demo model with canned replies. No account or key; every turn is recorded.
- **Open the console in my browser**: starts AMC if needed and opens the Compass Console.
- **Just show my score**: prints the full score (below).

AMC preselects your last choice next time, unless that choice starts services or opens a browser. In a pipe, in CI or in an agent's shell, `amc` prints the full score (in a folder AMC has not set up yet, add `--yes`: `amc --yes` lets it create `.amc/` without a terminal to ask); `amc --no-menu` or `AMC_NO_MENU=1` does the same in a terminal. `amc --help` is a short task list; `amc --help --all` lists every command.

Watching Claude Code from the menu takes three answers on a first run: the menu line, `Add AMC's watch hook to this project's Claude Code settings? It sends what Claude Code does to AMC on this Mac (http://127.0.0.1:<port>).`, and `Start Claude Code here now?`. Codex is the same. The hook points at this folder's own AMC; `amc connect hooks status` reports when AMC has since moved to another port and prints the command that points the hook there again.

In a folder that `amc` set up, the vault passphrase is kept in `.amc/local-vault-passphrase`, and the menu hands it to the AMC it starts, so starting asks nothing about the vault. If another AMC folder already holds AMC's default gateway and proxy ports on this computer, the menu asks `Start AMC for this folder on its own ports?` and, on yes, starts this folder on free ports and names its gateway port.

`amc up` on its own, in a folder with no vault yet, asks for a vault passphrase with two choices: "Let AMC create and remember one (recommended)" or "Enter my own". The first creates a passphrase, remembers it on this computer (the macOS Keychain, service `amc-vault`, or `~/.config/amc/vault-credentials.json`), and does not print it; it says where it is kept. `amc vault passphrase` sets one you know, and `amc vault forget` removes the remembered copy. `amc init` asks the same question, and `amc init --minimal` creates and remembers one without asking. Where nothing keeps it, the passphrase is printed once instead, and you must save it then, because the vault cannot be opened without it. That happens with `AMC_VAULT_REMEMBER=0` (the `amc up` choice then reads "Let AMC create one (shown once; remembering is off)"), in CI, in an agent's shell, and for `amc init --minimal` without a terminal.

## Your First Full Score (2 minutes)

```bash
# 1. Create a workspace
mkdir my-agent && cd my-agent

# 2. Run the full AMC lifecycle (in a terminal, choose "Just show my score")
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

Without a terminal, `amc quickscore` generates no placeholder score: it exits 1 with the hint "Did you mean to run the interactive score?" Use `amc quickscore` in a terminal for prompted scoring, or keep using `--answers` for CI.

If `amc quickscore --auto --json` has no captured ledger evidence, AMC fails closed with `scoreStatus: "AUTO_NO_EVIDENCE"` and no measured score fields. Capture evidence first with `amc adapters run --agent <id> --adapter generic-cli -- <your-agent-command>`, or use `amc quickscore --answers answers.json --json` for a CI-safe survey score.

### Observe Claude Code or Gemini CLI actions

The shortest path for Claude Code is the start menu: run `amc` and choose "Watch Claude Code as it works". It installs the same observe-mode hook as the commands below. For Codex, see [Sign in with Claude or ChatGPT](SIGN_IN_WITH_CLAUDE_OR_CHATGPT.md) and [codex.md](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/adapters/codex.md); Codex is observe only.

To do it by hand, use a dry run to inspect the exact project files, then install the reversible observer:

```bash
amc connect hooks install --provider claude-code --agent my-agent --dry-run
amc connect hooks install --provider claude-code --agent my-agent
amc connect hooks status --provider claude-code
amc connect hooks health --provider claude-code
amc connect hooks lifecycle --agent my-agent --action <action-id>
```

Use `--provider gemini-cli` for Gemini CLI. `hooks health` shows `awaiting_first_event` until the signed installation delivers a receipt-verified event, then reports only its privacy-safe event/action/receipt references. Drift, expiry, malformed matching metadata, evidence tamper, or a locked Vault that cannot authenticate encrypted bodies fails closed. Export `AMC_VAULT_PASSPHRASE` in the shell that runs `hooks health` (`amc vault unlock` lasts only for its own command). Last-observed time does not prove that a provider is live now. AMC keeps a narrow observation lease out of provider config and retains no raw tool input, output, error message, cwd, transcript path, or session ID. Requested, completed, and failed receipts share one stable action ID; missing or ambiguous terminal correlation fails closed. Observation does not approve or deny provider actions. Remove it with `amc connect hooks remove --provider claude-code`.

For explicit signed control, run the local Studio/Bridge and opt in:

```bash
amc up
amc connect hooks install --provider claude-code --mode control --agent my-agent
```

Control is loopback-only. It evaluates raw tool input in memory, retains no raw args, and returns a receipt-bound native decision from AMC's existing signed policies. Claude Code receives `allow` or `deny`; an ask is denied, because a provider-local ask is not AMC approval. Gemini CLI has no native `ask`, so AMC returns `deny` for that outcome. Provider-local ask is not proof of AMC quorum, and multi-user policies remain denied. Claude Code control also registers each session (SessionStart) and admits each prompt (UserPromptSubmit); see [adapters/claude-code-hooks.md](adapters/claude-code-hooks.md) for the claim per hook.

Control needs Claude Code settings with no enabled plugin and no other hook that can change a tool call. With either present, AMC refuses to register the session and denies every tool call (`This Claude Code session has no AMC registration, so it is not governed; AMC denied the call.`); the install prints a warning that names the setting. Use observe mode in that case ([Troubleshooting](TROUBLESHOOTING.md#claude-code-every-tool-call-is-denied)).

For Claude Code, control is enforced at the `PreToolUse` hook only while Claude Code runs it. Claude Code still runs the tool when the hook cannot start, times out, or is switched off by `disableAllHooks` or managed `allowManagedHooksOnly`, so verify it:

```bash
amc connect hooks status --provider claude-code
```

`status` runs the installed hook with a probe payload and prints `Control: verified (probe denied in <n> ms)` only when the hook exits 2 with a deny; otherwise it prints `Control: NOT VERIFIED (<reason>)` and exits 1. The hook runs your Node binary and AMC's `dist/adapters/hookForwarder.js` by absolute path, so re-install after upgrading AMC or Claude Code, or switching Node. See [ADAPTERS.md](ADAPTERS.md#claude-cli-anthropic) for the deadline, exit codes and limits.

### Verify first-run activation outcomes

After connecting an agent, inspect the same read-only activation projection used by Studio:

```bash
amc connect --status --agent my-agent
amc connect --status --agent my-agent --json
```

AMC tracks four outcomes: connected agent, first observed action, first control decision, and first signed proof. A valid signed adapter or hook configuration can make the connection `READY`, but it cannot make activation `COMPLETE`. Completion requires receipt-backed runtime evidence for that exact agent. Metadata-only events, missing receipts, malformed metadata, cross-agent evidence, invalid hook ownership, and ledger or configuration tampering fail closed.

The status command is pure inspection. It does not mint a lease, call a provider, run a sample task, generate traffic, append evidence, or create a second onboarding record. Run your own agent action through AMC, then refresh the command or the Studio Activation path.

**Passport badge line:**

```bash
amc badge    # one line from the agent's passport; the claim line goes to stderr
```

`amc badge` shows only what AMC recorded for the agent: it takes no level or score. It is not a certification mark; badges for a README will only come from a public registry (Gate G3).

**Telemetry: there is none.**

AMC collects no usage data and has no telemetry commands. Nothing is sent
anywhere unless you ask for it explicitly, and every outbound call has a
command behind it:

| Destination | Reached only when |
|---|---|
| Your LLM provider | You route calls through the gateway or run a scored agent |
| Langfuse / Helicone / Lunary | You ran `amc watch connect` for that provider |
| The pack registry | You ran `amc pack search`, `install`, or `publish` |

Scores, evidence and the ledger stay in your workspace under `.amc/`. Keep `.amc/` out of version control by default (add it to `.gitignore`): it holds the signing keys, the Studio admin token (`.amc/studio/`), the evidence ledger and, when `amc` generated one, `.amc/local-vault-passphrase`. A new workspace also gets `.amc/.gitignore`, which keeps those secrets and per-machine runtime state out of git. If you deliberately commit a workspace for CI (the `amc-action` GitHub Action), never commit `.amc/local-vault-passphrase` or `.amc/studio/`, supply `AMC_VAULT_PASSPHRASE` from a CI secret, and keep that repository private: the encrypted vault is offline brute-force material.

---

## Understanding Your Score

The maturity level and evidence-readiness status answer different questions. Maturity describes the controls demonstrated by the score. `READY`, `LIMITED`, `INSUFFICIENT_EVIDENCE`, or `UNVERIFIED` describes whether the underlying evidence can support claims. Never treat `VALID` or signed artifact status as a substitute for `READY`.

AMC scores agents on a 5-level scale:

| Level | Name | What a question needs |
|-------|------|---------------|
| L0 | Absent | Not evidenced |
| L1 | Initial | Self-declared: rows tagged to the question from a registered source |
| L2 | Developing | Configuration evidence AMC observed (4 of the 244 questions can reach it today) |
| L3 | Defined | Runtime evidence AMC observed (no question can reach it yet) |
| L4 | Managed | Continuity, anchoring and sampling (not evaluated yet) |
| L5 | Optimizing | Independently attested (not evaluated yet) |

Today 240 of the 244 questions cannot rise above L1. Each score shows a range next to the overall level. It shows how much the question levels differ inside each layer, not how far the score could move as AMC sees more evidence. When AMC has no evidence yet, or every question sits at the same level, it says "no range" instead.

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

# Lists the OWASP LLM Top 10; reports not evaluated (file presence is not evidence)
amc score owasp-llm
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

# Score-control source inventory — behavioral gaming resistance is unmeasured
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

Studio is AMC's local web UI for managing agents, viewing scores, and running evaluations. macOS and Windows desktop packages also include the `Agent Maturity Compass Studio` launcher app, which opens this same local console (in a native WebKit window on macOS, in the system browser on Windows).

```bash
# Start Studio
amc up

# Check status
amc status

# Stop Studio
amc down
```

The Compass Console asks you to sign in. Create the first login, an OWNER:

```bash
amc user init --username <you>    # asks for a password; signs .amc/users.yaml
```

It signs with the workspace vault. When a passphrase is remembered, it first asks `Use the vault passphrase saved in <location> to sign amc user init?` (the default is No; answer `y`). When none is, it asks you to type the vault passphrase; for a folder that `amc` set up, it is in `.amc/local-vault-passphrase`. Without a terminal, set `AMC_VAULT_PASSPHRASE` in that shell and run it again.
`amc user init` refuses when `.amc/users.yaml` already exists, so on a workspace that already has
logins (for example after `amc init --coding`) use `amc user add` instead (`--force` replaces every login). Add more logins with `amc user add --username <name> --role <roles>`
(see [RBAC](RBAC.md)).

After you sign in, Home shows one plain status line (with Details), one card ("See what your AI agent really does.") with **Run a task** and **Connect my agent**, a progress line that names the next step, and everything else under **More**. **Run a task** opens Native Tasks with a sample prompt; in the demo workspace the button reads **Try a demo task**. "How AMC works" at the top opens a three-step guide; it does not open by itself.

Studio gives you:
- Live dashboard with agent scores
- Lifecycle Evidence page for the 8 surfaces, full-score artifacts, episodes, decisions, and Enforce resource proof
- Evaluation runner
- Policy editor
- Audit log viewer

The dashboard port is `AMC_DASHBOARD_PORT`, default 4173; when that port is busy, `amc up` falls back to a free port and prints the dashboard URL.

Desktop package users can launch Studio without typing the CLI command:

```bash
# macOS package
open "Agent Maturity Compass Studio.app"
```

```powershell
# Windows package: double-click the .cmd file, or from PowerShell
& ".\Agent Maturity Compass Studio.cmd"
```

The macOS app is not notarized (the current source build ad-hoc signs it): if macOS says it cannot verify it, open
System Settings > Privacy & Security and choose Open Anyway. Studio keeps running after you close the app window or browser tab;
[Desktop Packages](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/DESKTOP_PACKAGES.md) has the command that stops it.

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
amc bundle export --run latest --out evidence.amcbundle
```

Without `AMC_VAULT_PASSPHRASE` (or with `AMC_NO_SIGN=1`) the first-run capture is unsigned and goes to `.amc/unsigned/evidence.sqlite`, never to the signed `.amc/evidence.sqlite`; score it with `AMC_NO_SIGN=1 amc quickscore --auto`, and capture again with the vault unlocked when you need verifier-ready evidence.

### Ingesting from external eval systems

Already running evals elsewhere? Import them:

Imported results are SELF_REPORTED and recorded at import time; an export with cases more than 24 hours old (or more than 5 minutes in the future) is refused unless you pass `--historical`. See [EVIDENCE_TRUST.md](EVIDENCE_TRUST.md).

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
| `amc` | Create a workspace if needed; in a terminal, show the start menu, elsewhere run the full score |
| `amc --no-menu` | Run the full score in a terminal without the menu (also `AMC_NO_MENU=1`) |
| `amc login status` | Show whether Claude Code and Codex are installed and signed in |
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
| `amc resource status` | Show the signed active and previous versions, verified rollback target, pending drift, integrity reasons, and next action without exposing local absolute paths |
| `amc resource validate` | Run Enforce gates for signature validity, owners, contained paths, immutable resources, rollback readiness, review, and evidence coverage |
| `amc resource propose` / `amc resource evaluate` | Create a dry-run proposal and show the policy decision before accepting resource changes |
| `amc resource apply` / `amc resource activate` | Dry-run by default; add `--yes` to activate the reviewed state and write a signed receipt. Force never bypasses signature, scope, path, manifest, snapshot, digest, or race integrity |
| `amc resource rollback --manifest <status-ref>` | Dry-run by default; add `--apply` to activate a canonical signed snapshot after all resources pass preflight and post-write verification |
| `amc firewall enable --mode block` | Turn on Runtime Firewall protection for live Bridge/Gateway traffic |
| `amc firewall check --direction request --text "ignore previous instructions"` | Preview the exact allow/warn/block decision before traffic reaches a model |
| `amc firewall events` / `amc firewall export --format splunk --redacted` | Inspect and export signed runtime decisions without leaking local paths or sensitive previews |
| `amc firewall migrate-signature --approve-legacy-kind` | Verify and preserve the exact semantics of a legacy policy in the signed control journal |
| `amc guardrails list` | Compare signed requested controls with verified effective Runtime Firewall bindings |
| `amc guardrails enable prompt-injection-detection` | Add a signed, additive request for a runtime-bound control |
| `amc guardrails disable prompt-injection-detection` | Remove the request without weakening a separately signed Runtime Firewall policy |
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
| `amc evidence export --agent <id> --format json --out evidence.json` | Export verifier-ready evidence for one agent: rows whose metadata names the agent plus every row of the native sessions it opened, never the shared `system` session. Prints `events=`, `sessions=` and `excluded=`; the JSON (`schemaVersion` 2) records the same in `agentFilter`, with `systemSession: "excluded"` and `insufficientFor: ["requires_no_audit"]`: system rows can count against an agent, so recompute those controls from an unfiltered export |
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
| `amc score gaming-resistance` | Source-control inventory; behavioral resistance is unmeasured |
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
| `amc score eu-ai-act` | EU AI Act obligations; not evaluated (file presence is not evidence) |
| `amc score owasp-llm` | OWASP LLM Top 10; not evaluated (file presence is not evidence) |
| `amc score regulatory-readiness` | Combined regulatory readiness; not evaluated (file presence is not evidence) |

### All commands
```bash
amc --help              # The short task list
amc --help --all        # Every top-level command and option
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

The top-level JSON keeps claim readiness explicit: `status` and `artifactStatus` are the seal result (`VALID`, `INVALID` or `UNSIGNED`), `evidenceStatus` is the evidence-readiness status, and `claimEligible` is `true` only for `READY`. Use `claimBoundary` and `nextEvidenceStep` instead of inferring readiness from `signed: true`.

Pipe into `jq` for scripting:

```bash
amc score formal-spec my-agent --json | jq '.overallScore'
```

---

## Troubleshooting

[Troubleshooting](TROUBLESHOOTING.md#first-run-problems) has the exact message and the fix for the first-run failures new users meet most often: a vault passphrase that does not open the vault, "This workspace already has a vault", Claude Code control mode denying every call, a Codex hook that records nothing, a busy port, the database engine rebuild, `ROLLBACK_DETECTED`, a console stuck on "Starting AMC…", and "Authentication required" in the console.

### "Doctor result: FAIL"
This is normal on first run. The doctor checks for optional components:
- **Studio not running** → Run `amc up`
- **Vault locked** → Export `AMC_VAULT_PASSPHRASE` (or set `AMC_VAULT_PASSPHRASE_FILE`) in the shell that runs the signing command. `amc vault unlock` only checks the passphrase: the vault stays unlocked while that one command runs.
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

1. **Run `amc`** — pick "Watch Claude Code as it works" (or Codex), or "Just show my score" for your full baseline
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
amc mcp config --ide claude-code
```

Questions? Issues? [GitHub](https://github.com/AgentMaturity/AgentMaturityCompass)
