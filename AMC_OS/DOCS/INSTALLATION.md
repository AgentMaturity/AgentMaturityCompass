# AMC Installation Guide

> **AI Maturity Composite (AMC)** — Install, configure, and run your first maturity assessment on any supported platform.

---

## Table of Contents

1. [Overview](#overview)
2. [Scoring Reference](#scoring-reference)
3. [Platform Guides](#platform-guides)
   - [OpenClaw](#1-openclaw)
   - [NanoClaw](#2-nanoclaw)
   - [ZeroClaw](#3-zeroclaw)
   - [TrustClaw](#4-trustclaw)
   - [Nanobot](#5-nanobot)
   - [Moltworker](#6-moltworker)
   - [OpenAI (GPT-4/4o/o1)](#7-openai-gpt-44oo1)
   - [Anthropic (Claude 3.5/3)](#8-anthropic-claude-3535)
   - [Google (Gemini 1.5/2)](#9-google-gemini-152)
   - [General / Custom (REST API)](#10-general--custom-rest-api)
4. [Cross-Platform Troubleshooting](#cross-platform-troubleshooting)

---

## Overview

The AMC scoring system evaluates your AI operations across **7 dimensions** and produces a composite maturity score from 0–100. This guide walks you through installation on every supported platform — from one-command CLI installs to raw REST API integration.

**What you'll get after installation:**
- A composite maturity score (0–100)
- Per-dimension breakdowns across all 7 areas
- A maturity level (L1–L5) with actionable recommendations
- A baseline to track improvement over time

---

## Scoring Reference

### 7 Dimensions

| # | Dimension | What It Measures |
|---|-----------|-----------------|
| 1 | **Governance** | Policies, ownership, decision frameworks for AI |
| 2 | **Security** | Data protection, model security, access controls |
| 3 | **Reliability** | Uptime, fallbacks, error handling, SLAs |
| 4 | **Evaluation** | Testing, benchmarking, quality measurement |
| 5 | **Observability** | Logging, monitoring, tracing, alerting |
| 6 | **Cost Efficiency** | Token/compute spend tracking, optimization |
| 7 | **Operating Model** | Team structure, processes, automation maturity |

### 5 Maturity Levels

| Level | Name | Score Range | Description |
|-------|------|-------------|-------------|
| **L1** | Ad-hoc | 0–29 | No formal processes; reactive, manual, inconsistent |
| **L2** | Defined | 30–54 | Basic processes documented; some consistency |
| **L3** | Managed | 55–79 | Systematic processes; measured and controlled |
| **L4** | Optimized | 80–94 | Data-driven optimization; proactive improvement |
| **L5** | Autonomous & Self-Improving | 95–100 | Self-healing, self-optimizing, continuous evolution |

**Composite score** = average of all 7 dimension scores.

---

## Platform Guides

---

### 1. OpenClaw

#### Prerequisites

- OpenClaw CLI installed and authenticated (`openclaw --version` should return ≥ 1.0)
- An AMC API key (get one at `https://amc.example.com/keys`)
- Active internet connection

#### Installation

```bash
openclaw skill install amc
```

#### Configuration

```bash
# Set your AMC API key
openclaw config set amc.api_key "your-amc-api-key-here"

# (Optional) Set default output format
openclaw config set amc.output_format json   # json | table | markdown
```

Verify the skill is loaded:

```bash
openclaw skill list | grep amc
```

#### Running Your First Assessment

```bash
openclaw amc assess
```

This launches an interactive questionnaire. For a non-interactive run with defaults:

```bash
openclaw amc assess --auto
```

To assess a specific project directory:

```bash
openclaw amc assess --path ./my-ai-project
```

#### Interpreting Results

```
┌─────────────────┬───────┬───────┐
│ Dimension       │ Score │ Level │
├─────────────────┼───────┼───────┤
│ Governance      │  62   │  L3   │
│ Security        │  45   │  L2   │
│ Reliability     │  71   │  L3   │
│ Evaluation      │  38   │  L2   │
│ Observability   │  55   │  L3   │
│ Cost Efficiency │  29   │  L1   │
│ Operating Model │  60   │  L3   │
├─────────────────┼───────┼───────┤
│ COMPOSITE       │  51   │  L2   │
└─────────────────┴───────┴───────┘
```

- **Look at the lowest-scoring dimensions first** — these are your biggest improvement opportunities.
- The composite score determines your overall maturity level.
- Run `openclaw amc report` for detailed recommendations per dimension.

#### Common Issues + Fixes

| Issue | Fix |
|-------|-----|
| `Error: skill 'amc' not found` | Run `openclaw skill install amc` again; check internet connectivity |
| `Error: unauthorized` | Verify API key: `openclaw config get amc.api_key` |
| `Timeout during assessment` | Check network; retry with `--timeout 120` |
| Assessment hangs | Use `--auto` flag for non-interactive mode |

#### ELI5

> **Think of it like a school report card for your AI setup.** You install a new "skill" into OpenClaw (like adding an app to your phone), give it a password (API key), then ask it to grade your AI project. It checks 7 subjects and gives you a score out of 100. Below 30 = you're winging it. Above 95 = your AI basically runs itself.

---

### 2. NanoClaw

#### Prerequisites

- NanoClaw CLI installed (`nanoclaw --version` ≥ 0.5)
- Network access to the AMC registry

#### Installation

```bash
nanoclaw add amc --minimal
```

The `--minimal` flag installs only the core assessment engine without optional visualization plugins.

For full install (includes dashboards):

```bash
nanoclaw add amc
```

#### Configuration

NanoClaw auto-detects configuration from environment variables:

```bash
export AMC_API_KEY="your-amc-api-key-here"
```

Or create `~/.nanoclaw/amc.yml`:

```yaml
amc:
  api_key: "your-amc-api-key-here"
  auto_scan: true
  output: table
```

#### Running Your First Assessment

```bash
nanoclaw run amc
```

For a specific target:

```bash
nanoclaw run amc --target ./my-project
```

#### Interpreting Results

NanoClaw outputs a compact summary by default:

```
AMC Score: 51/100 (L2 — Defined)
  ▓▓▓▓▓▓░░░░ Governance    62
  ▓▓▓▓░░░░░░ Security      45
  ▓▓▓▓▓▓▓░░░ Reliability   71
  ▓▓▓░░░░░░░ Evaluation    38
  ▓▓▓▓▓░░░░░ Observability 55
  ▓▓░░░░░░░░ Cost Eff.     29
  ▓▓▓▓▓▓░░░░ Operating     60
```

Each bar gives you a visual sense of relative strengths and weaknesses.

#### Common Issues + Fixes

| Issue | Fix |
|-------|-----|
| `package 'amc' not in registry` | Update registry: `nanoclaw registry sync` |
| `minimal mode: feature X unavailable` | Reinstall without `--minimal`: `nanoclaw add amc` |
| Config not found | Check `AMC_API_KEY` env var or `~/.nanoclaw/amc.yml` |

#### ELI5

> **NanoClaw is like a tiny toolbox.** The `--minimal` flag means "just give me the basics, no extras." You add the AMC tool, set your password in a file or environment variable, and run it. It draws little bar charts showing how mature your AI operation is. Small bars = room to grow. Full bars = you're crushing it.

---

### 3. ZeroClaw

#### Prerequisites

- ZeroClaw CLI installed (`zeroclaw --version` ≥ 1.0)
- That's it. ZeroClaw is zero-config by design.

#### Installation

```bash
zeroclaw init --with amc
```

This initializes a new ZeroClaw workspace with AMC already wired in. If you have an existing workspace:

```bash
zeroclaw add amc
```

#### Configuration

**No configuration required.** ZeroClaw auto-discovers your environment and applies sensible defaults.

To override defaults (optional):

```bash
zeroclaw set amc.detail_level full    # minimal | standard | full
zeroclaw set amc.schedule weekly      # off | daily | weekly | monthly
```

#### Running Your First Assessment

```bash
zeroclaw amc
```

That's the entire command. ZeroClaw scans your current directory and produces a report.

#### Interpreting Results

ZeroClaw outputs a narrative-style report:

```
🎯 AMC Assessment Complete

Your AI maturity composite score is 51 (Level 2 — Defined).

Strongest: Reliability (71)
Weakest:   Cost Efficiency (29)

Top recommendation: Implement token usage tracking
to move Cost Efficiency from L1 → L2.
```

#### Common Issues + Fixes

| Issue | Fix |
|-------|-----|
| `zeroclaw: command not found` | Install ZeroClaw: see https://zeroclaw.dev/install |
| Empty report | Run from a directory containing AI project files |
| Stale results | Force refresh: `zeroclaw amc --fresh` |

#### ELI5

> **ZeroClaw is the "it just works" option.** One command sets everything up. One command runs the test. No passwords, no config files, no fuss. It looks at your project and tells you in plain English what's good and what needs work. It's like a doctor that doesn't make you fill out paperwork.

---

### 4. TrustClaw

#### Prerequisites

- TrustClaw CLI installed (`trustclaw --version` ≥ 2.0)
- AMC API key
- (Recommended) Organization security policy file at `~/.trustclaw/policy.yml`

#### Installation

```bash
trustclaw integrate amc --security-mode strict
```

Security modes:
- `strict` — all data encrypted in transit + at rest, audit log enabled, no external calls without approval
- `standard` — encrypted in transit, basic logging
- `permissive` — minimal restrictions (not recommended for production)

#### Configuration

```bash
# Set API key (stored in TrustClaw's encrypted vault)
trustclaw secret set AMC_API_KEY "your-amc-api-key-here"

# Verify integration
trustclaw integrations list
```

Configure assessment scope in `trustclaw.yml`:

```yaml
integrations:
  amc:
    security_mode: strict
    audit_log: true
    allowed_dimensions:
      - all    # or list specific: governance, security, reliability...
    data_retention_days: 90
```

#### Running Your First Assessment

```bash
trustclaw run amc --audit
```

The `--audit` flag generates a tamper-evident audit trail alongside the assessment.

```bash
# View audit log
trustclaw audit show --integration amc --last 1
```

#### Interpreting Results

TrustClaw adds a **compliance overlay** to standard AMC output:

```
AMC Assessment (strict mode, audit #a3f7c2)
─────────────────────────────────────────
Dimension         Score  Level  Compliance
Governance          62    L3    ✅ PASS
Security            45    L2    ⚠️ REVIEW
Reliability         71    L3    ✅ PASS
Evaluation          38    L2    ⚠️ REVIEW
Observability       55    L3    ✅ PASS
Cost Efficiency     29    L1    ❌ FAIL
Operating Model     60    L3    ✅ PASS
─────────────────────────────────────────
COMPOSITE           51    L2
Compliance: 5/7 PASS, 2 REVIEW, 1 FAIL
```

Compliance thresholds are configurable in your policy file. By default, any dimension below L2 (score < 30) is flagged FAIL.

#### Common Issues + Fixes

| Issue | Fix |
|-------|-----|
| `security policy violation` | Check `~/.trustclaw/policy.yml` allows AMC integration |
| `vault: key not found` | Re-set key: `trustclaw secret set AMC_API_KEY "..."` |
| Audit log permission denied | Run with appropriate permissions or `sudo` |
| `strict mode: external call blocked` | Add AMC endpoints to allowlist in policy file |

#### ELI5

> **TrustClaw is the security-first option.** It's like getting your AI graded, but by a teacher who locks the exam in a safe, logs every answer, and makes sure nobody cheated. The `strict` mode means everything is encrypted and tracked. You get the same scores as other platforms, plus a "compliance" column that tells you if each score meets your organization's rules.

---

### 5. Nanobot

#### Prerequisites

- Nanobot installed and running (`nanobot --version` ≥ 1.0)
- Existing bot configuration file (`nanobot.yml`)
- AMC API key

#### Installation

Add the AMC plugin to your `nanobot.yml`:

```yaml
# nanobot.yml
plugins:
  - name: amc
    version: "latest"
    config:
      api_key: "${AMC_API_KEY}"
      auto_assess: false
      schedule: "0 0 * * 1"    # Weekly on Monday (cron format)
```

Then reload:

```bash
export AMC_API_KEY="your-amc-api-key-here"
nanobot reload
```

#### Configuration

Full configuration options in `nanobot.yml`:

```yaml
plugins:
  - name: amc
    version: "latest"
    config:
      api_key: "${AMC_API_KEY}"
      auto_assess: false
      output_dir: "./reports/amc"
      dimensions:
        - governance
        - security
        - reliability
        - evaluation
        - observability
        - cost_efficiency
        - operating_model
      notify:
        on_complete: true
        channel: "#ai-ops"          # Slack/Discord channel
        threshold_alert: 30         # Alert if any dimension drops below
```

#### Running Your First Assessment

```bash
nanobot trigger amc
```

Or via the bot's chat interface:

```
@nanobot run amc assessment
```

#### Interpreting Results

Nanobot posts results to your configured notification channel:

```
🤖 AMC Assessment Complete
Composite: 51/100 (L2)
⬆️ Highest: Reliability (71)
⬇️ Lowest: Cost Efficiency (29)
📄 Full report: ./reports/amc/2026-02-19.json
```

The JSON report contains full dimension breakdowns and recommendations.

#### Common Issues + Fixes

| Issue | Fix |
|-------|-----|
| `plugin 'amc' failed to load` | Check YAML indentation; validate with `nanobot config validate` |
| `env var AMC_API_KEY not set` | Export the variable before running `nanobot reload` |
| No notification received | Verify `notify.channel` exists and bot has post permissions |
| Schedule not triggering | Check cron syntax; ensure `auto_assess: true` for scheduled runs |

#### ELI5

> **Nanobot is like a little robot assistant.** You tell it about the AMC plugin by adding a few lines to its instruction file (YAML). Then you tell the robot "go run the AMC test" and it does it, posting the results to your team chat. You can even set it on a schedule so it checks your AI maturity every week automatically, like a recurring doctor's appointment.

---

### 6. Moltworker

#### Prerequisites

- Moltworker runtime installed (`moltworker --version` ≥ 0.8)
- Worker configuration directory (`~/.moltworker/plugins/`)
- AMC API key

#### Installation

```bash
# Install the AMC worker plugin
moltworker plugin install amc

# Verify
moltworker plugin list
```

#### Configuration

Create or edit `~/.moltworker/plugins/amc.toml`:

```toml
[amc]
api_key = "your-amc-api-key-here"
worker_threads = 2
timeout_seconds = 120
output_format = "json"        # json | csv | markdown

[amc.dimensions]
enabled = "all"               # or comma-separated list

[amc.scheduling]
enabled = false
cron = "0 9 * * 1"            # Monday 9 AM
```

Reload the worker:

```bash
moltworker restart
```

#### Running Your First Assessment

```bash
moltworker run amc:assess
```

For a specific workspace:

```bash
moltworker run amc:assess --input ./my-project
```

#### Interpreting Results

Moltworker outputs to stdout and saves to the configured output directory:

```json
{
  "composite": 51,
  "level": "L2",
  "level_name": "Defined",
  "dimensions": {
    "governance": { "score": 62, "level": "L3" },
    "security": { "score": 45, "level": "L2" },
    "reliability": { "score": 71, "level": "L3" },
    "evaluation": { "score": 38, "level": "L2" },
    "observability": { "score": 55, "level": "L3" },
    "cost_efficiency": { "score": 29, "level": "L1" },
    "operating_model": { "score": 60, "level": "L3" }
  },
  "recommendations": [...]
}
```

#### Common Issues + Fixes

| Issue | Fix |
|-------|-----|
| `plugin not found: amc` | Run `moltworker plugin install amc` |
| `TOML parse error` | Validate config: `moltworker config check` |
| Worker timeout | Increase `timeout_seconds` in `amc.toml` |
| Permission denied on plugin dir | Check ownership of `~/.moltworker/plugins/` |

#### ELI5

> **Moltworker is a background task runner.** Think of it as a factory worker that you give jobs to. You install the AMC "job instructions" (plugin), configure it with a settings file, and say "go assess." It does the work, writes the results to a file, and waits for the next job. Good for teams that want AMC running as part of a bigger automated pipeline.

---

### 7. OpenAI (GPT-4/4o/o1)

#### Prerequisites

- Python 3.9+
- `pip` package manager
- OpenAI API key (from https://platform.openai.com/api-keys)
- AMC API key

#### Installation

```bash
pip install amc-sdk
```

Verify:

```bash
python -c "import amc; print(amc.__version__)"
```

#### Configuration

Set environment variables:

```bash
export AMC_API_KEY="your-amc-api-key-here"
export OPENAI_API_KEY="your-openai-api-key-here"
```

Or configure in code:

```python
import amc

client = amc.Client(
    api_key="your-amc-api-key-here",
    provider="openai",
    provider_api_key="your-openai-api-key-here",
    model="gpt-4o"  # or "gpt-4", "o1", "o1-mini"
)
```

#### Running Your First Assessment

```python
import amc

client = amc.Client(provider="openai", model="gpt-4o")

# Run assessment
result = client.assess(
    project_path="./my-ai-project",    # or omit for interactive
    mode="auto"                         # "auto" | "interactive"
)

print(f"Composite Score: {result.composite} (Level {result.level})")

for dim in result.dimensions:
    print(f"  {dim.name}: {dim.score} ({dim.level})")

# Save report
result.save("./amc-report.json")
```

CLI shortcut (after `pip install`):

```bash
amc assess --provider openai --model gpt-4o --path ./my-project
```

#### Interpreting Results

The `result` object contains:

```python
result.composite        # int: 0-100
result.level            # str: "L1" through "L5"
result.level_name       # str: "Ad-hoc", "Defined", etc.
result.dimensions       # list of Dimension objects
result.recommendations  # list of actionable suggestions
result.timestamp        # ISO 8601 assessment time
```

Each dimension:

```python
dim.name        # "Governance", "Security", etc.
dim.score       # int: 0-100
dim.level       # "L1" through "L5"
dim.findings    # list of specific findings
dim.actions     # list of recommended next steps
```

#### Common Issues + Fixes

| Issue | Fix |
|-------|-----|
| `ModuleNotFoundError: No module named 'amc'` | `pip install amc-sdk` (not `pip install amc`) |
| `openai.AuthenticationError` | Check `OPENAI_API_KEY` is valid and not expired |
| `RateLimitError` | Wait and retry, or use a model with higher rate limits |
| `amc.ProviderError: model not available` | Verify model name; ensure your OpenAI plan has access |
| Slow assessment | Use `gpt-4o-mini` for faster (slightly less detailed) results |

#### ELI5

> **You're using ChatGPT's brain to grade your AI project.** You install a Python package (`amc-sdk`), give it two passwords — one for AMC and one for OpenAI — and point it at your project. GPT-4 analyzes your setup across 7 categories and gives you a score. It's like hiring a consultant, except the consultant is an AI and it takes minutes instead of weeks.

---

### 8. Anthropic (Claude 3.5/3)

#### Prerequisites

- Python 3.9+
- `pip` package manager
- Anthropic API key (from https://console.anthropic.com/)
- AMC API key

#### Installation

```bash
pip install amc-sdk
```

#### Configuration

```bash
export AMC_API_KEY="your-amc-api-key-here"
export ANTHROPIC_API_KEY="your-anthropic-api-key-here"
```

Or in code:

```python
import amc

client = amc.Client(
    provider="anthropic",
    provider_api_key="your-anthropic-api-key-here",
    model="claude-sonnet-4-20250514"  # or "claude-3-5-haiku-20241022", "claude-3-opus-20240229"
)
```

#### Running Your First Assessment

```python
import amc

client = amc.Client(provider="anthropic", model="claude-sonnet-4-20250514")

result = client.assess(
    project_path="./my-ai-project",
    mode="auto"
)

print(f"Composite Score: {result.composite} (Level {result.level})")
for dim in result.dimensions:
    print(f"  {dim.name}: {dim.score} ({dim.level})")

result.save("./amc-report.json")
```

CLI shortcut:

```bash
amc assess --provider anthropic --model claude-sonnet-4-20250514 --path ./my-project
```

#### Interpreting Results

Same result object structure as the OpenAI section. All providers return identical `AssessmentResult` objects for cross-platform consistency.

#### Common Issues + Fixes

| Issue | Fix |
|-------|-----|
| `anthropic.AuthenticationError` | Check `ANTHROPIC_API_KEY`; regenerate if needed |
| `anthropic.RateLimitError` | Wait 60s and retry; consider usage tier upgrade |
| `model not found` | Use full model ID (e.g., `claude-sonnet-4-20250514` not just `claude-sonnet`) |
| `overloaded_error` | Anthropic is at capacity; retry with exponential backoff |

#### ELI5

> **Same as the OpenAI version, but using Claude's brain instead.** You install the same Python package, just swap the password and tell it to use Anthropic instead of OpenAI. Claude reads your project, grades it on 7 dimensions, and gives you a maturity score. Pick whichever AI you trust more — the scores are comparable either way.

---

### 9. Google (Gemini 1.5/2)

#### Prerequisites

- Python 3.9+
- `pip` package manager
- Google AI API key (from https://aistudio.google.com/apikey) or Google Cloud project with Vertex AI enabled
- AMC API key

#### Installation

```bash
pip install amc-sdk
```

#### Configuration

**Option A — Google AI Studio (simpler):**

```bash
export AMC_API_KEY="your-amc-api-key-here"
export GOOGLE_API_KEY="your-google-ai-api-key-here"
```

**Option B — Vertex AI (enterprise):**

```bash
export AMC_API_KEY="your-amc-api-key-here"
export GOOGLE_CLOUD_PROJECT="your-project-id"
export GOOGLE_CLOUD_LOCATION="us-central1"
# Authenticate via: gcloud auth application-default login
```

In code:

```python
import amc

# AI Studio
client = amc.Client(
    provider="google",
    provider_api_key="your-google-api-key",
    model="gemini-2.0-flash"  # or "gemini-1.5-pro", "gemini-2.0-pro"
)

# Vertex AI
client = amc.Client(
    provider="google-vertex",
    model="gemini-2.0-flash",
    project="your-project-id",
    location="us-central1"
)
```

#### Running Your First Assessment

```python
import amc

client = amc.Client(provider="google", model="gemini-2.0-flash")

result = client.assess(project_path="./my-ai-project", mode="auto")

print(f"Composite Score: {result.composite} (Level {result.level})")
for dim in result.dimensions:
    print(f"  {dim.name}: {dim.score} ({dim.level})")

result.save("./amc-report.json")
```

CLI shortcut:

```bash
amc assess --provider google --model gemini-2.0-flash --path ./my-project
```

#### Interpreting Results

Identical result structure to OpenAI and Anthropic sections. All providers produce the same `AssessmentResult` format.

#### Common Issues + Fixes

| Issue | Fix |
|-------|-----|
| `google.auth.exceptions.DefaultCredentialsError` | Run `gcloud auth application-default login` for Vertex AI |
| `GOOGLE_API_KEY invalid` | Regenerate at https://aistudio.google.com/apikey |
| `ResourceExhausted: 429` | Rate limited; wait and retry with backoff |
| `model not found` | Check available models at https://ai.google.dev/models |
| Vertex AI permission denied | Ensure Vertex AI API is enabled in your GCP project |

#### ELI5

> **Same Python package, now using Google's Gemini AI.** Three AI companies, one tool. Install `amc-sdk`, tell it to use Google, give it your Google password, and run. Gemini grades your AI project just like GPT-4 or Claude would. Google gives you two ways to connect — a simple API key for personal use, or the full cloud setup for companies.

---

### 10. General / Custom (REST API)

#### Prerequisites

- Any HTTP client (`curl`, `httpie`, Postman, or any programming language)
- AMC API key
- Network access to AMC API endpoint

#### Installation

No installation required. The REST API is available at:

```
Base URL: https://api.amc.example.com/v1
```

#### Configuration

Authentication is via Bearer token in the `Authorization` header:

```bash
export AMC_API_KEY="your-amc-api-key-here"
```

#### Running Your First Assessment

**Using curl:**

```bash
curl -X POST https://api.amc.example.com/v1/assess \
  -H "Authorization: Bearer ${AMC_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "project": {
      "name": "my-ai-project",
      "description": "Production AI chatbot system"
    },
    "mode": "auto",
    "dimensions": ["all"]
  }'
```

**Using Python (requests):**

```python
import requests

response = requests.post(
    "https://api.amc.example.com/v1/assess",
    headers={
        "Authorization": f"Bearer {AMC_API_KEY}",
        "Content-Type": "application/json"
    },
    json={
        "project": {"name": "my-ai-project"},
        "mode": "auto",
        "dimensions": ["all"]
    }
)

result = response.json()
print(f"Composite: {result['composite']} (Level {result['level']})")
```

**Using JavaScript (Node.js):**

```javascript
const response = await fetch("https://api.amc.example.com/v1/assess", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.AMC_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    project: { name: "my-ai-project" },
    mode: "auto",
    dimensions: ["all"],
  }),
});

const result = await response.json();
console.log(`Composite: ${result.composite} (Level ${result.level})`);
```

#### API Endpoints Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/assess` | Run a new assessment |
| `GET`  | `/v1/assessments` | List past assessments |
| `GET`  | `/v1/assessments/:id` | Get a specific assessment |
| `GET`  | `/v1/assessments/:id/report` | Get detailed report (JSON/PDF) |
| `POST` | `/v1/assessments/:id/compare` | Compare two assessments |
| `GET`  | `/v1/dimensions` | List available dimensions |
| `GET`  | `/v1/health` | API health check |

#### Interpreting Results

The JSON response structure:

```json
{
  "id": "asmnt_abc123",
  "timestamp": "2026-02-19T10:00:00Z",
  "composite": 51,
  "level": "L2",
  "level_name": "Defined",
  "dimensions": [
    {
      "name": "Governance",
      "score": 62,
      "level": "L3",
      "findings": ["Policy documentation exists but lacks version control"],
      "actions": ["Implement policy versioning with approval workflows"]
    }
  ],
  "recommendations": [
    {
      "priority": "high",
      "dimension": "Cost Efficiency",
      "action": "Implement token usage tracking per model and endpoint",
      "impact": "Could improve Cost Efficiency score by 15-20 points"
    }
  ]
}
```

#### Common Issues + Fixes

| Issue | Fix |
|-------|-----|
| `401 Unauthorized` | Check API key in `Authorization: Bearer <key>` header |
| `400 Bad Request` | Validate JSON body structure; check required fields |
| `429 Too Many Requests` | Respect `Retry-After` header; implement exponential backoff |
| `500 Internal Server Error` | Retry after 30s; if persistent, check `GET /v1/health` |
| CORS errors (browser) | Use a backend proxy; the API doesn't support browser-direct calls |
| SSL certificate error | Ensure system CA certificates are up to date |

#### ELI5

> **This is the "build it yourself" option.** Instead of using a ready-made tool, you talk to the AMC service directly over the internet. You send it a message (HTTP request) with your project info, and it sends back a JSON response with your scores. It's like ordering food by calling the restaurant directly instead of using a delivery app — more flexible, but you have to know what to ask for.

---

## Cross-Platform Troubleshooting

### Authentication Issues

**Symptom:** `401`, `unauthorized`, or `invalid API key` errors on any platform.

**Fix checklist:**
1. Verify your AMC API key is active at `https://amc.example.com/keys`
2. Check for trailing whitespace or newlines in the key
3. Ensure the key hasn't expired (keys rotate every 90 days by default)
4. Try regenerating the key
5. For SDK platforms, verify the provider API key (OpenAI/Anthropic/Google) separately

### Network / Connectivity

**Symptom:** Timeouts, connection refused, DNS resolution failures.

**Fix checklist:**
1. Test connectivity: `curl -I https://api.amc.example.com/v1/health`
2. Check if you're behind a corporate proxy — configure `HTTP_PROXY` / `HTTPS_PROXY`
3. Verify firewall allows outbound HTTPS (port 443)
4. For air-gapped environments, contact your admin about AMC on-premise deployment

### Inconsistent Scores Across Providers

**Symptom:** Running the same project through OpenAI vs Anthropic vs Google gives different scores.

**Explanation:** Minor variation (±5 points) is expected because different LLMs interpret evidence slightly differently. The assessment framework normalizes results, but some variance remains.

**Mitigation:**
- Use `mode: "auto"` for maximum consistency (less LLM interpretation)
- Run assessments 3x and average the results
- Pin a specific provider/model for longitudinal tracking

### Python SDK Issues

**Symptom:** Import errors, version conflicts, dependency issues.

**Fix checklist:**
```bash
# Ensure you have the right package
pip install --upgrade amc-sdk

# Check Python version (need 3.9+)
python --version

# If using virtual environments
python -m venv amc-env
source amc-env/bin/activate  # Linux/Mac
amc-env\Scripts\activate     # Windows
pip install amc-sdk
```

### Assessment Takes Too Long

**Symptom:** Assessment hangs or takes > 10 minutes.

**Fix checklist:**
1. Use a faster model (`gpt-4o-mini`, `claude-3-5-haiku`, `gemini-2.0-flash`)
2. Reduce scope: assess specific dimensions instead of all 7
3. Use `mode: "auto"` instead of interactive
4. Check your internet speed — large projects upload context to the API

### Scores Seem Wrong

**Symptom:** Scores don't match your self-assessment of maturity.

**Things to check:**
1. AMC scores based on **evidence**, not intentions — do you have documentation, configs, and tooling to prove maturity?
2. A common gap: teams think they're L3+ but lack formal documentation → scores land at L2
3. Run with `detail_level: full` to see exactly what evidence was found (or missing)
4. Review the `findings` and `actions` in each dimension for specifics

### Getting Help

- **Documentation:** `https://docs.amc.example.com`
- **Community:** `https://community.amc.example.com`
- **Support:** `support@amc.example.com`
- **GitHub Issues:** `https://github.com/amc-project/amc-sdk/issues`

---

*Last updated: 2026-02-19 • AMC Scoring System v1.0*
