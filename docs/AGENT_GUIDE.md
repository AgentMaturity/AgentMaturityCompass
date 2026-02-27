# Agent Guide System

The Agent Guide generates personalized improvement plans, operational guardrails, and agent instructions from your actual AMC scores. It doesn't suggest — it prescribes. Guardrails are rules your agent must follow. Violating them lowers your trust score.

## Quick Start

```bash
# One command — auto-detect framework, generate everything, apply guardrails
amc guide --go
```

That's it. AMC detects your framework from project files, generates severity-tagged guardrails, and applies them to your agent's config file with idempotent markers.

## How It Works

```
AMC Score → Gap Analysis → Severity Tagging → Guardrails + Agent Instructions → Apply to Config
                                                        ↓
                                              Re-score → Diff → Repeat
```

1. **Score** — AMC scores your agent from execution evidence (126 questions, 5 dimensions)
2. **Analyze** — Guide identifies every gap between current and target level
3. **Tag** — Each gap gets a severity: 🔴 Critical (gap ≥ 3), 🟡 High (gap ≥ 2), 🔵 Medium (gap = 1)
4. **Generate** — Produces guardrails (rules), agent instructions (what to do), and human guide (what to fix)
5. **Apply** — Writes guardrails directly to your agent's config file
6. **Verify** — Re-score to confirm improvement. `amc guide --diff` shows what changed.

## Modes

### Zero Friction (`--go`)

```bash
amc guide --go
```

Combines `--quick` + `--auto-detect` + `--export` + `--apply`. One command from zero to guardrails-applied agent.

### Interactive (`--interactive`)

```bash
amc guide --interactive
```

Cherry-pick which gaps to fix. Pre-selects highest-impact items. Generates custom guardrails for your selection.

### Status (`--status`)

```bash
amc guide --status
# Output: 🧭 default: L1 → L3 | 42 gaps (8 critical, 15 high, 19 medium)
```

One-line health check. Zero prompts. Perfect for scripts and dashboards.

### Quick (`--quick`)

```bash
amc guide --quick
```

Skips interactive questions. Uses defaults (all L0) for instant guide generation. Ideal for CI and non-TTY environments.

### CI Gate (`--ci`)

```bash
amc guide --ci --target 3
# Exit code 1 if below target level
```

Blocks deploys below your trust threshold. JSON output for pipeline integration. Severity-tagged gaps in output.

### Continuous Watch (`--watch`)

```bash
amc guide --watch --apply
```

Background monitoring. Re-scores on interval. Auto-updates guardrails on drift. Graceful SIGINT shutdown.

### Diff (`--diff`)

```bash
amc guide --diff
```

Compares current guide against previous run. Shows closed gaps, new gaps, improved questions, and regressed questions with L-level tracking.

### Dry Run (`--dry-run`)

```bash
amc guide --apply --dry-run
```

Preview what `--apply` would write without touching any files.

## Framework Auto-Detection (`--auto-detect`)

AMC scans your project files to detect the framework:

| Source | Frameworks Detected |
|--------|-------------------|
| `pyproject.toml` | LangChain, CrewAI, AutoGen/AG2, LlamaIndex, OpenAI |
| `requirements.txt` | LangChain, CrewAI, AutoGen/AG2, LlamaIndex |
| `package.json` | LangChain |
| `*.csproj` | Semantic Kernel |
| `CLAUDE.md` / `AGENTS.md` | Claude Code |
| `.cursorrules` / `.cursor/rules` | Cursor |
| `.kiro/steering/guide.md` | Kiro |
| `.gemini/style.md` | Gemini |

Each detection includes a confidence level (high/medium/low) and the source file.

## 15 Config Targets

Guardrails can be applied to any of these agent config files:

| Target | Agent |
|--------|-------|
| `AGENTS.md` | Claude Code, generic |
| `CLAUDE.md` | Claude Code |
| `.cursorrules` | Cursor |
| `.cursor/rules` | Cursor (new format) |
| `.clinerules` | Cline |
| `.windsurfrules` | Windsurf |
| `.kiro/steering/guide.md` | Kiro |
| `.aider.conf.yml` | Aider |
| `.amazonq/rules` | Amazon Q |
| `.gemini/style.md` | Gemini |
| `.openhands/instructions.md` | OpenHands |
| `.devin/guidelines.md` | Devin |
| `.roo/rules.md` | Roo |
| `CONVENTIONS.md` | Generic |
| `.github/copilot-instructions.md` | GitHub Copilot |

### Idempotent Apply

Guardrails are wrapped in markers:

```markdown
<!-- AMC-GUARDRAILS-START -->
... guardrails content ...
<!-- AMC-GUARDRAILS-END -->
```

Re-running `--apply` replaces only the content between markers. Everything else in your config file is preserved.

## Output Formats

### Human Guide (`--export`)

Markdown for developers. Priority-sorted fixes with CLI commands, severity indicators, and getting-started tutorial for L0-L1 agents.

### Agent Instructions (`--agent-instructions`)

Markdown for agents. Each gap includes:
- What AMC is evaluating (from the prompt template)
- What the agent must do (observable signals)
- Evidence the agent must produce (types, counts, sessions)
- Per-question verification commands (`amc explain <id>`, `amc score formal-spec --question <id>`)

### Guardrails (`--guardrails`)

Operational rules with severity indicators (🔴🟡🔵), Quick Start (top 3 priorities), prohibited behaviors, and framework-specific setup code.

### JSON (`--json`)

Machine-readable output with full guide structure, severity fields, and CI schema.

## Framework-Specific Tailoring

Each of 10 frameworks gets native code snippets:

- **Python frameworks** (LangChain, CrewAI, AutoGen, LlamaIndex, OpenAI): Python setup code
- **C# frameworks** (Semantic Kernel): C# setup code
- **Markdown-config agents** (Claude Code, Gemini, Cursor, Kiro): Markdown instruction blocks

## CLI Reference

```bash
amc guide                          # Interactive assessment + guide
amc guide --go                     # Zero friction: detect + generate + apply
amc guide --quick                  # Skip questions, use defaults
amc guide --status                 # One-line status
amc guide --interactive            # Cherry-pick gaps to fix
amc guide --guardrails             # Generate guardrails only
amc guide --agent-instructions     # Generate agent instructions only
amc guide --export                 # Generate human guide
amc guide --compliance             # Compliance guardrails (all 5 frameworks)
amc guide --compliance EU_AI_ACT   # EU AI Act compliance guardrails only
amc guide --compliance EU_AI_ACT,ISO_42001  # Multiple frameworks
amc guide --apply                  # Apply guardrails to config file
amc guide --apply --dry-run        # Preview apply without writing
amc guide --ci --target 3          # CI gate mode
amc guide --diff                   # Compare with previous run
amc guide --watch --apply          # Continuous monitoring
amc guide --auto-detect            # Auto-detect framework
amc guide --frameworks             # List supported frameworks
amc guide --framework langchain    # Specify framework manually
amc guide --target 4               # Set target level (default: 3)
amc guide --agent my-agent         # Specify agent ID
amc guide --json                   # JSON output
```

## Compliance Guardrails

AMC maps your maturity gaps to 5 regulatory frameworks:

| Framework | Standard | Key Articles/Clauses |
|-----------|----------|---------------------|
| `EU_AI_ACT` | EU AI Act (Regulation 2024/1689) | Art. 9 (Risk), 10 (Data), 11 (Docs), 12 (Logging), 13 (Transparency), 14 (Oversight), 15 (Robustness), 17 (QMS), 27 (FRIA), 72 (Monitoring), 73 (Incidents), 86 (Explanation) |
| `ISO_42001` | ISO/IEC 42001:2023 | Clauses 4-10 (AI Management System) |
| `NIST_AI_RMF` | NIST AI RMF 1.0 | GOVERN, MAP, MEASURE, MANAGE functions |
| `SOC2` | SOC 2 Type II | Security, Availability, Processing Integrity, Confidentiality, Privacy |
| `ISO_27001` | ISO/IEC 27001:2022 | Information Security Management |

### Usage

```bash
# All frameworks
amc guide --compliance

# EU AI Act only (deadline: August 2, 2026)
amc guide --compliance EU_AI_ACT

# Multiple frameworks
amc guide --compliance EU_AI_ACT,ISO_42001,SOC2

# Combined with other flags
amc guide --go --compliance EU_AI_ACT
```

### What You Get

Compliance guardrails include:
- **Per-framework obligation mapping** — which articles/clauses your gaps violate
- **Severity-tagged rules** — 🔴 Critical / 🟡 High / 🔵 Medium
- **Required assurance packs** — which packs to run for each obligation
- **Required evidence types** — what AMC needs to observe
- **Verification commands** — `amc compliance report --framework <fw>`
- **Agent-readable rules** — your agent can follow these to become compliant

### EU AI Act Deadline

The EU AI Act's high-risk obligations (Articles 9-15, 17) become fully applicable on **August 2, 2026**. Running `amc guide --compliance EU_AI_ACT` shows exactly which obligations your agent doesn't yet satisfy and what to fix.

## Integration with AMC Ecosystem

- **Mechanic Workbench**: Guide complements Mechanic by providing agent-readable rules. Mechanic handles target-setting and simulation; Guide handles agent instruction generation.
- **Assurance Lab**: Guide references specific assurance packs for each gap. Running `amc assurance run` after applying guardrails validates improvement.
- **CI/CD Gates**: `amc guide --ci --target 3` integrates with `amc gate` for release blocking.
- **Dashboard**: Guide status is available via `amc guide --status --json` for dashboard integration.
- **Evidence Collection**: Agent instructions include specific evidence types and counts needed per level.

## Example Workflow

```bash
# 1. Score your agent
amc quickscore

# 2. Generate and apply guardrails (one command)
amc guide --go

# 3. Let your agent work with the new guardrails...

# 4. Re-score and see improvement
amc quickscore
amc guide --diff

# 5. Repeat until target level reached
```
