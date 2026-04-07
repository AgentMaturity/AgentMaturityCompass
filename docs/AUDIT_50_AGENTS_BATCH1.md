# AMC 50-Agent Audit — Batch 1 (Personas 1-10)

**Date:** 2026-03-14  
**Method:** Every command executed live with `npx tsx src/cli.ts`. Install paths tested against actual npm/brew registries.  
**Baseline:** This audit starts from the post-Round-3 state (UX_FINAL_AUDIT.md claimed 4.5/5 average).  
**Verdict on that claim:** Overstated. There are still multiple broken install paths, dead commands, and numeric inconsistencies that a real first-time user hits before writing a single CLI command.

---

## Per-Persona Ratings

| # | Persona | Rating (1-10) | Top Issue |
|---|---------|---------------|-----------|
| 1 | Sarah (Junior Dev) | **6/10** | Install is completely broken — npm package doesn't exist |
| 2 | Jake (DevOps) | **7/10** | `ci check` works; vault blocks `ci init`; no `--no-sign` bypass |
| 3 | Priya (Compliance Officer) | **5/10** | Framework names in docs vs CLI differ; iso-42001 silently rejected |
| 4 | Marcus (Security Researcher) | **7/10** | `analyze-mcp` needs clearer arg; `--no-sign` missing from cert/compare |
| 5 | Elena (CTO) | **6/10** | `fleet status` works but shows 1 agent; no path to add 20 agents |
| 6 | Tom (Data Scientist) | **5/10** | `compare` vault-blocks on model names; run-ID comparison broken |
| 7 | Raj (OSS Contributor) | **5/10** | `pack test` in AMC root fails; test count badge disagrees with CONTRIBUTING.md |
| 8 | Lisa (Enterprise Architect) | **4/10** | `cert generate --badge` vault-blocked, no `--no-sign`; API docs link is placeholder |
| 9 | Chen (API Developer) | **4/10** | `amc api start` dead command; npm package doesn't exist so can't install |
| 10 | Maya (Product Manager) | **6/10** | `inventory list` dead; website playground works but CLI confusing |

**Average: 5.5/10** — Not 4.5/5 as prior audit claimed. The install is broken for every persona who follows documented steps.

---

## Critical Gaps Found

### [GAP-001] npm package does not exist — ALL install paths dead
**Severity: P0 BLOCKER**  
Every documented install method for people who don't already have the repo:

```
npm install -g agent-maturity-compass       # 404 Not Found
npx agent-maturity-compass quickscore       # 404 Not Found  
brew install agent-maturity-compass         # "No available formula"
curl .../raw.githubusercontent.com/.../main/install.sh | bash   # 404
```

The package `agent-maturity-compass` does not exist on npm. The brew formula at `Formula/amc.rb` references the npm tarball, so it also fails. The `install.sh` in `website/install.sh` exists locally but is not at the GitHub raw URL documented in `getting-started.html`. **Any user who doesn't already have the repo and follows any install instruction in the docs hits a 404 or "not found" error.**  
*Affected personas: Sarah, Jake, Priya, Marcus, Elena, Tom, Raj, Lisa, Chen, Maya — everyone.*

---

### [GAP-002] `amc inventory list` — dead command (docs say it exists, it doesn't)
**Severity: P1**

```bash
$ amc inventory list
error: unknown command 'list'
```

`inventory` only has `scan`. The AMC Master Reference and executive-facing onboarding paths imply you can list your AI inventory. Maya (PM) would immediately hit this trying to catalog agents for procurement review. Fix: add `list` as alias for `scan`, or document that `scan` is the only subcommand.

---

### [GAP-003] `amc api start` — dead command suggested by the name
**Severity: P1**

```bash
$ amc api start
error: unknown command 'start'
(Did you mean status?)
```

Chen (API Dev) wants to start the API server. "start" is the most natural word. The actual command is `amc up`. `amc api --help` shows only `status`, `routes`, `docs`. Nowhere does `amc api --help` tell you that starting the server is `amc up`, not `amc api start`. This is a discoverability failure — the `api` namespace implies server lifecycle management but has none.

---

### [GAP-004] Framework name format mismatch between docs and CLI
**Severity: P1**

The website compliance docs (`website/docs/compliance.html`) use lowercase-hyphen format:
```
amc compliance report --framework iso-42001
amc compliance report --framework nist-ai-rmf
amc compliance report --framework soc2
```

The CLI only accepts uppercase-underscore:
```bash
$ amc compliance report --framework iso-42001
Unsupported compliance framework: iso-42001   # ← SILENTLY FAILS (no hint)

$ amc compliance report --framework ISO_42001   # Works
```

Every Priya who copy-pastes from the docs page gets a silent rejection with no suggestion of the correct format. The error message says "Unsupported compliance framework" with no list of what IS supported.

---

### [GAP-005] `amc api docs` has placeholder URL that was never updated
**Severity: P1**

```bash
$ amc api docs
Online:    https://github.com/your-org/amc/blob/main/docs/API_REFERENCE.md
```

`your-org` was never replaced with the org name. Chen copies this URL and gets a 404. The correct URL would be `https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/API_REFERENCE.md`.

---

### [GAP-006] Badge test count (3,488) disagrees with CONTRIBUTING.md (3,311)
**Severity: P2**

README badge: `tests-3%2C488%20passing` (3,488)  
README body text: `3,311 tests`  
CONTRIBUTING.md: `npm test  # 3,311 tests, all must pass`  
README body strong text: `3,311 tests`

Raj (contributor) reads the badge, reads CONTRIBUTING.md, they disagree. Which is right? Neither number can be verified without running the full test suite. This makes AMC look sloppy to a contributor doing due diligence.

---

### [GAP-007] `amc cert generate` and `amc compare` are vault-blocked with no escape hatch
**Severity: P2**

```bash
$ amc cert generate --agent default --output /tmp/cert.json
🔐 Vault locked.

$ amc cert generate --agent default --output /tmp/cert.json --no-sign
error: unknown option '--no-sign'

$ amc compare gpt-4 claude-3-opus --no-sign  
error: unknown option '--no-sign'
```

`amc assurance run --pack injection --no-sign` works. But `cert generate` and `compare` (model comparison) have no `--no-sign` bypass. Lisa (Architect) evaluating AMC can't generate a sample cert to demo the format. Tom (Data Scientist) can't compare models without unlocking the vault first. Both users likely give up.

---

### [GAP-008] `amc compare` doesn't distinguish between run-ID comparison and model comparison — vault-blocks both
**Severity: P2**

The help says: "Compare two runs OR multiple models (side-by-side evaluation)" with argument `<items>: run IDs (2) or model names (2+)`.

But:
```bash
$ amc compare run-abc run-def
🔄 Running agent evaluation across 2 models...
Running diagnostic for model: run-abc
🔐 Vault locked.
```

It treats `run-abc` as a model name and tries to run a diagnostic, not compare two existing runs. There is no actual run-ID comparison — the command signature is lying. The help says "Compare two runs" but the implementation doesn't do that.

---

### [GAP-009] Fleet health provides no path to add agents
**Severity: P2**

```bash
$ amc fleet status
Agents: 1 total, 1 scored
Avg score: L1.0 (integrity: 0.000)

$ amc fleet health
Fleet baseline integrity: 0.000
Agents: 1 (scored 1)
Average integrity: 0.000
```

Elena (CTO) wants a dashboard for 20 agents. The commands work, but they only show the 1 default agent with 0.000 integrity. There is no hint of how to add more agents (answer: `amc agent add`). For a CTO evaluating fleet governance, this looks like the tool doesn't work — she doesn't know the tool IS working and she just has 1 unscored agent.

---

### [GAP-010] `amc shield analyze-mcp` gives misleading error when called with no path
**Severity: P3**

```bash
$ amc shield analyze-mcp
error: missing required argument 'path-or-url'
```

OK, fair enough. But:
```bash
$ amc shield analyze-mcp ./docs
Cannot read MCP file at /Users/.../docs: EISDIR: illegal operation on a directory, read
```

Marcus points it at a directory — the error says `EISDIR` which is a raw Node.js error code, not user-friendly. It should say "Please provide a path to an MCP manifest file (e.g., mcp-config.json), not a directory."

Also: there are zero example MCP manifest files anywhere in the repo. Marcus has to know what an MCP manifest looks like to even use this command.

---

### [GAP-011] `amc dashboard open` assumes no port collision
**Severity: P3**

```bash
$ amc dashboard open
listen EADDRINUSE: address already in use 127.0.0.1:3210
```

Raw Node.js EADDRINUSE error. Should say "Port 3210 is already in use. If AMC Studio is running, the dashboard may already be available at http://localhost:3210. Stop it with `amc down` first."

---

## Dead Commands

| Command | Expected | Actual | Notes |
|---------|----------|--------|-------|
| `npm install -g agent-maturity-compass` | Install globally | 404 Not Found | Package not on npm |
| `npx agent-maturity-compass quickscore` | Run quickscore | 404 Not Found | Package not on npm |
| `brew install agent-maturity-compass` | Install via homebrew | Not found | Formula exists in repo but not tapped |
| `curl .../install.sh \| bash` (github raw URL) | Install script | 404 | Wrong URL in getting-started.html |
| `amc inventory list` | List agents | error: unknown command | Only `inventory scan` exists |
| `amc api start` | Start API server | error: unknown command | The server is started with `amc up` |
| `amc compliance report --framework iso-42001` | Compliance report | Unsupported framework | Needs `ISO_42001` not `iso-42001` |
| `amc compliance report --framework nist-ai-rmf` | Compliance report | Unsupported framework | Needs `NIST_AI_RMF` |
| `amc compliance report --framework soc2` | Compliance report | Unsupported framework | Needs `SOC2` |
| `amc cert generate --agent x --output cert.json` | Generate cert | Vault locked, no escape | `--no-sign` not supported |
| `amc compare <run-id-A> <run-id-B>` | Compare two runs | Treats as model names, vault-blocks | Run comparison not implemented |
| `amc compare gpt-4 claude-3 --no-sign` | Compare models | error: unknown option | No `--no-sign` on compare |
| `amc pack test .` (from repo root) | Test packs | No index.mjs found | Only works from a pack directory |
| `amc dashboard open` (second time) | Open dashboard | EADDRINUSE | No graceful port collision handling |

---

## Missing Documentation

| Gap | Description |
|-----|-------------|
| MCP manifest example | `amc shield analyze-mcp` has no example MCP JSON file in docs or tests |
| How to add agents to fleet | `fleet status` shows 1 agent; docs don't say use `amc agent add` |
| Framework name format table | Nowhere lists the required uppercase-underscore format for framework flags |
| `amc up` = API server start | `amc api --help` doesn't mention that the server lifecycle is `amc up`/`amc down` |
| `--no-sign` availability matrix | Which commands support `--no-sign`? No docs. Users have to try each one. |
| Pack test workflow | CONTRIBUTING.md says `amc pack test .` works from pack dir, but no guidance on where to run it |
| npm package status | README says `npm install -g agent-maturity-compass` but package isn't published |
| Vault-free evaluation path | No clear "kick the tires without setting up a vault" path for evaluators |

---

## Outdated / Wrong References

| Location | What It Says | What's True |
|----------|-------------|-------------|
| README.md badge | `tests-3,488 passing` | Body text and CONTRIBUTING.md say 3,311 |
| README.md badge | `CLI commands-481` | MASTER_REFERENCE has 269 `amc xxx` entries; root help has 232 top-level entries |
| README.md body | `138 diagnostic questions` | `amc score formal-spec` returns "Score: 0/0" which doesn't match 138 questions |
| `amc api docs` output | `https://github.com/your-org/amc/...` | Should be `AgentMaturity/AgentMaturityCompass` |
| `getting-started.html` | `curl .../raw.githubusercontent.com/.../main/install.sh` | 404 — wrong URL |
| `getting-started.html` | `brew install agent-maturity-compass` | Not in homebrew |
| `website/docs/compliance.html` | `--framework iso-42001` | CLI needs `ISO_42001` |
| CONTRIBUTING.md | "3,311 tests, all must pass" | Badge says 3,488 |

---

## Recommended Fixes (Priority Order)

### P0 — Fix Before Any External Sharing

**FIX-01: Publish the npm package OR remove all npm install instructions**  
Either publish `agent-maturity-compass` to npm, OR replace all "install" docs with a dev-only path (`git clone && npm ci && npm link`). Every person who finds AMC through the website and tries to install it hits a 404.  
*Files: README.md, website/docs/getting-started.html, website/install.sh, Formula/amc.rb*

**FIX-02: Fix the install.sh URL in getting-started.html**  
`getting-started.html` documents `curl .../raw.githubusercontent.com/.../main/install.sh` but the script is at `website/install.sh` (i.e., `https://AgentMaturity.github.io/AgentMaturityCompass/install.sh`).  
*File: website/docs/getting-started.html — one line*

---

### P1 — Fix Before Any Demos or Marketing

**FIX-03: Add `amc inventory list` as alias for `amc inventory scan`**  
```typescript
inventoryCmd.command('list').description('List AI assets (alias for scan)').action(...)
```
*File: src/commands/inventory/index.ts — 4 lines*

**FIX-04: Add framework name validation with helpful error**  
When `--framework iso-42001` fails, show:
```
Unsupported framework: iso-42001
Valid frameworks: EU_AI_ACT | ISO_42001 | NIST_AI_RMF | SOC2 | OWASP_LLM
```
Also fix website docs to use uppercase-underscore, or add case-insensitive normalization in the CLI.  
*File: src/commands/comply/report.ts and website/docs/compliance.html*

**FIX-05: Replace `your-org` placeholder in `amc api docs` output**  
```typescript
// Change:
'Online:    https://github.com/your-org/amc/blob/main/docs/API_REFERENCE.md'
// To:
'Online:    https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/API_REFERENCE.md'
```
*File: src/commands/api/docs.ts — 1 line*

**FIX-06: Add `--no-sign` flag to `cert generate` and `compare-models`**  
These are the two main "evaluate AMC" commands for Lisa and Tom. Without `--no-sign`, vault setup is mandatory before you can even see what output looks like.  
*Files: src/commands/cert/generate.ts, src/commands/compare-models/index.ts*

**FIX-07: Add "how to add agents" hint to `fleet status` and `fleet health`**  
When fleet shows 1 agent:
```
Tip: Add agents with `amc agent add` to build your fleet.
```
*File: src/commands/fleet/status.ts, fleet/health.ts — 3 lines*

---

### P2 — Fix Before v1.0 or Any Enterprise Sales

**FIX-08: Reconcile test count (badge says 3,488, docs say 3,311)**  
Pick one number and make all references consistent. Raj (contributor) notices immediately.

**FIX-09: Fix EADDRINUSE error in `dashboard open` to be human-readable**  
*File: src/commands/dashboard/open.ts*

**FIX-10: Fix `amc compare` to actually compare run IDs OR remove from help text**  
Either implement run-ID comparison (look up existing run artifacts) or remove "run IDs (2)" from the help text and rename the command to `compare-models`.

**FIX-11: Add example MCP manifest file for `shield analyze-mcp`**  
Create `examples/mcp-server-example.json` and reference it in help:
```
Example: amc shield analyze-mcp examples/mcp-server-example.json
```

**FIX-12: Add `amc api start` → `amc up` redirect**  
```bash
$ amc api start
error: unknown command 'start'
Tip: To start the AMC Studio server (API + dashboard), run: amc up
```
*File: src/commands/api/index.ts — 3 lines, register a 'start' alias that prints the hint*

---

### P3 — Polish

**FIX-13: Normalize compliance framework names case-insensitively**  
Accept `iso-42001`, `ISO_42001`, `ISO 42001`, etc. and normalize internally.

**FIX-14: Add `--no-sign` availability section to docs**  
Document which commands support `--no-sign` and which require vault setup.

**FIX-15: Reconcile CLI command count (badge says 481, MASTER_REFERENCE has 269, root help has 232)**  
The 481 number is misleading — it likely counts every leaf subcommand including hidden/internal ones. Either document how you count, or correct the badge.

---

## Summary: What Actually Works vs What's Broken

### Works (no issues)
- `amc quickscore` — clean, L-scale defined, good "what now" section ✅
- `amc ci check` / `amc ci gate` — both work, good error messages ✅
- `amc comply report --framework EU_AI_ACT` — works ✅
- `amc comply report --framework ISO_42001` (uppercase) — works ✅
- `amc redteam run` — works, generates real vulnerability report ✅
- `amc assurance run --pack injection --no-sign` — works ✅
- `amc fleet status` — works ✅
- `amc shield analyze-mcp <file>` — works ✅
- `amc score industry-adjust --industry healthcare --score 75` — works ✅
- `amc guide --compliance EU_AI_ACT` — works ✅
- `amc doctor` — works, clear fix hints ✅
- `amc inventory scan` — works ✅
- `amc compare-models gpt-4 claude-3` — hits vault (expected), good error ✅

### Broken / Misleading
- All documented install methods (npm, brew, install.sh) — **404** ❌
- `amc inventory list` — dead command ❌
- `amc api start` — dead command ❌
- `amc comply report --framework iso-42001` (lowercase) — silent reject ❌
- `amc api docs` — shows placeholder URL `your-org` ❌
- `amc cert generate` — no `--no-sign` bypass ❌
- `amc compare` with run IDs — broken (treats as models) ❌
- `amc dashboard open` (when port taken) — raw EADDRINUSE ❌
- `amc pack test .` from repo root — no index.mjs ❌
- Test count badge vs CONTRIBUTING.md — inconsistent ❌
- CLI command count badge vs reality — inconsistent ❌

---

*This audit was conducted by automated persona simulation with live command execution on 2026-03-14. All commands were run against the current repo state.*
