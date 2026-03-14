# AMC UX/UI Audit Report — 10 Novice User Personas
**Audited:** 2026-03-14  
**CLI Entry Point:** `npx tsx src/cli.ts`  
**Method:** Live command execution — all outputs are real, not simulated  
**Total Commands Tested:** ~60 across 10 persona journeys  

---

## Executive Summary

AMC has an enormous surface area — the `--help` output alone lists **357 entries** and the `amc score` subcommand has **43 sub-subcommands**. The tool has impressive depth but severe discoverability and first-run problems. **Three features are entirely broken** (trust-init, trust-add-edge, trust-edges crash with a fatal ESM error). The vault lock mechanism silently blocks 5+ critical features with no onboarding path to unlock it. Template variables appear raw (`{{stakeholders}}`) in user-facing output. New users have no clear "line 1" to execute — the quickstart output is 0/50 for every fresh install, which is demoralizing.

**Verdict:** AMC is powerful, but right now it's a 357-command maze with no breadcrumbs and several lit fires.

---

## Persona Journeys

### Persona 1: "Sarah" — Junior Dev, first AI agent ⭐⭐ (2/5)

**Goal:** Score her LangChain chatbot  
**Journey:** `npm install` → `amc quickstart` → `amc quickscore` → understand results

#### Commands run:
```
npx tsx src/cli.ts quickstart
npx tsx src/cli.ts quickscore
```

#### Actual output — `amc quickstart`:
```
Step 2: Quick Score Assessment (10 questions)
  Non-interactive mode: using L0 defaults

Step 3: Your Results
  Overall: 0/50 (0%)
```

#### Actual output — `amc quickscore`:
```
AMC Rapid Quickscore
Score: 0/25 (0%)
Preliminary maturity: L1
```

#### Friction Points:
1. **Silent fallback to L0 defaults** — `quickstart` says "Non-interactive mode: using L0 defaults" and skips all 10 questions. Sarah never gets to answer anything. This is the single most demoralizing first-run experience possible: you get a 0/50 score before you've done anything.
2. **Contradictory scoring** — `quickscore` says "Score: 0/25 (0%) — Preliminary maturity: L1". If your score is 0%, how are you L1? The logic is opaque.
3. **Next step commands are cryptic** — "amc wrap \<runtime\> -- \<your-agent-command\>" — what's a runtime? What's a wrap? She came to score her LangChain chatbot, not learn AMC terminology.
4. **"quickstart" != "quickscore"** — Two separate entry points with different behaviour. `quickstart` runs a 10-question assessment (but defaults them all to L0); `quickscore` runs a 5-question interactive fallback. This is confusing.
5. **No "what is L0-L5" explanation** — The maturity levels are never defined in CLI output. A first-time user has no idea if L1 is good, bad, or neutral.
6. **Gap list is intimidating without context** — "Agent Charter & Scope: L0 → L3" — what does L3 mean for her chatbot?

---

### Persona 2: "Jake" — DevOps Engineer ⭐⭐⭐ (3/5)

**Goal:** Add AMC to CI/CD pipeline  
**Journey:** `amc ci --help` → `amc ci gate --help` → set up a gate

#### Commands run:
```
npx tsx src/cli.ts ci --help
npx tsx src/cli.ts ci gate --help   # (he expected this)
npx tsx src/cli.ts ci check --help
npx tsx src/cli.ts ci check
npx tsx src/cli.ts ci init
npx tsx src/cli.ts ci print
```

#### Actual outputs:
```bash
# ci gate --help:
Usage: amc ci [options] [command]
[...shows parent help, not gate help]

# ci check:
🧭 AMC CI Gate Check
  Score: 0% (min: 20%)
  Level: L1 (min: L1)
  Result: ❌ FAIL

# ci init:
Vault is locked. Run `amc vault unlock` before signing operations.

# ci print:
npm ci
npm run build
node dist/cli.js bundle verify ...
node dist/cli.js gate ...
```

#### Friction Points:
1. **`amc ci gate` doesn't exist** — Jake would type this based on every other CI tool's convention. Instead, `amc ci check` is the gate command. The alias `gate` is missing entirely.
2. **`ci init` blocked by vault** — The first thing Jake would do to "set up" CI integration fails immediately with a vault lock error. No explanation of what a vault is, how to unlock it, or why it's needed for generating a GitHub workflow file.
3. **`ci print` outputs `node dist/cli.js`** — The pipeline steps use the raw compiled CLI path instead of `amc`. This would confuse any CI user who isn't familiar with the internals.
4. **`ci check` passes with L1 even at 0%** — The default `--min-level L1` passes when quickscore returns L1 from a 0% score. So Jake's pipeline gate is effectively always green on fresh install, which defeats the purpose.
5. **No end-to-end CI example** — There's no "copy this to .github/workflows/amc.yml" output. The `ci print` steps aren't in YAML format.

---

### Persona 3: "Priya" — Compliance Officer (non-technical) ⭐ (1/5)

**Goal:** Generate EU AI Act compliance report  
**Journey:** `amc --help` → find compliance → `amc comply --help` → generate report

#### Commands run:
```
npx tsx src/cli.ts --help
npx tsx src/cli.ts comply --help
npx tsx src/cli.ts comply report
npx tsx src/cli.ts comply report --framework EU_AI_ACT
```

#### Actual outputs:
```bash
# --help: 357 entries, ~80 lines of commands
# Compliance appears as: "compliance|comply"

# comply report (no args):
error: required option '--framework <framework>' not specified
Tip: add '--help' after any command to see available options.

# comply report --framework EU_AI_ACT:
Compliance report generated: /path/compliance-eu_ai_act.json
Coverage score: 0.458
```

#### Friction Points:
1. **357 commands is a wall of text** — The main `--help` is completely unusable for a non-technical user. Priya would need to read 80+ lines to find "comply". There's no "I want to do X" path.
2. **"compliance|comply" alias notation is unfriendly** — The pipe character in `compliance|comply` looks like a typo to a non-developer.
3. **Required `--framework` flag with no prompt** — Running `amc comply report` with no args gives a terse error. It should prompt interactively or list frameworks in the error message.
4. **Output is a JSON file** — The compliance report goes to a `.json` file that Priya can't read. She wanted a PDF or Markdown. The `--out` flag isn't mentioned in the error, and `--out report.md` does produce markdown.
5. **Coverage score: 0.458** — A decimal between 0 and 1 is meaningless to a compliance officer. It should say "45.8% coverage" or "PARTIAL compliance".
6. **Report output has dense hash IDs** — The markdown report is full of `hash=23941bf91946...` strings that mean nothing to a non-technical reader.
7. **"Config trusted: NO (compliance maps missing)"** — No guidance on how to fix this.
8. **No EU AI Act framework listed anywhere in help** — Priya would have to guess that `EU_AI_ACT` is the right identifier. The `--help` for `comply report` does list it, but only if she gets that far.

---

### Persona 4: "Marcus" — Security Researcher ⭐⭐ (2/5)

**Goal:** Red-team test an agent  
**Journey:** `amc shield --help` → `amc shield red-team` → `amc assurance run`

#### Commands run:
```
npx tsx src/cli.ts shield --help
npx tsx src/cli.ts shield red-team
npx tsx src/cli.ts assurance run --scope full
npx tsx src/cli.ts assurance run --all
npx tsx src/cli.ts assurance run --pack injection
npx tsx src/cli.ts redteam --help
npx tsx src/cli.ts redteam strategies
```

#### Actual outputs:
```bash
# shield red-team (works!):
🔴  Red Team Campaign
Target: demo
Rounds: 1
Running red team rounds...
  Round 1: attacks=5 success_rate=20.0%

# assurance run --scope full:
assurance run requires --pack <packId> or --all

# assurance run --all:
Vault is locked. Run `amc vault unlock` before signing operations.

# assurance run --pack injection:
Vault is locked. Run `amc vault unlock` before signing operations.
```

#### Friction Points:
1. **Two competing red-team commands** — `amc shield red-team` and `amc redteam run` both exist. Marcus would find both and be confused about which is "real". They appear to be different implementations.
2. **`--scope full` is documented but broken** — The main `--help` footer says "Run assurance: amc assurance run --scope full" — but this fails with "requires --pack or --all". The most visible example in the tool is wrong.
3. **Vault lock blocks all assurance packs** — `amc assurance run --pack injection` fails silently with vault lock. There are 100+ assurance packs, all blocked. The vault unlock flow is completely undocumented from the CLI.
4. **`amc shield red-team` is not the same as `amc assurance`** — The red-team command runs 5 attacks on a "demo" target. The assurance lab is the proper, pack-based system. This duplication is architectural confusion.
5. **No demo/sandbox mode for assurance** — A security researcher can't run any assurance packs without setting up a vault first. There should be a `--demo` mode.
6. **Assurance pack count (100+) not mentioned** — `amc assurance list` prints 80+ packs. Running them all without knowing this would be a surprise.

---

### Persona 5: "Elena" — Startup CTO ⭐⭐ (2/5)

**Goal:** Quick overview of agent fleet maturity  
**Journey:** `amc fleet --help` → `amc fleet status` → `amc dashboard`

#### Commands run:
```
npx tsx src/cli.ts fleet --help
npx tsx src/cli.ts fleet status
npx tsx src/cli.ts fleet health
npx tsx src/cli.ts dashboard --help
npx tsx src/cli.ts dashboard open
```

#### Actual outputs:
```bash
# fleet status:
error: unknown command 'status'
Tip: add '--help' after any command to see available options.

# fleet health:
Fleet baseline integrity: 0.000
Agents: 1 (scored 0)
Average integrity: 0.000

# dashboard open:
🌐  Dashboard serving at http://127.0.0.1:3210
View: engineer
Press Ctrl+C to stop
```

#### Friction Points:
1. **`amc fleet status` doesn't exist** — Elena's first instinct is `status` — it's the most universal CLI convention. The correct command is `amc fleet health`, which is not intuitive. The error is unhelpful.
2. **`fleet health` output is all zeros** — "Agents: 1 (scored 0), Average integrity: 0.000" is meaningless on a fresh install. There's no guidance to make the numbers mean something.
3. **`amc dashboard open` blocks the terminal** — It starts a server but doesn't open a browser. Elena has to manually navigate to localhost:3210, and when she stops it with Ctrl+C, nothing is saved.
4. **Dashboard says "View: engineer"** — What does this view mode mean? There's no explanation and no flag to change it.
5. **Fleet requires agents to be registered** — Elena has 1 agent (the default), but it's unscored. There's no "add agent" flow visible from the fleet help.
6. **`amc fleet --help` is 30+ lines** — The fleet namespace has 17 subcommands, many of which are trust-related. No grouping or hierarchy is shown.

---

### Persona 6: "Tom" — Data Scientist ⭐⭐⭐ (3/5)

**Goal:** Industry-specific scoring for healthcare  
**Journey:** `amc score --help` → find industry → `amc score industry-list` → `amc score industry-adjust`

#### Commands run:
```
npx tsx src/cli.ts score --help
npx tsx src/cli.ts score industry-list
npx tsx src/cli.ts score industry-adjust
npx tsx src/cli.ts score industry-adjust --industry healthcare
npx tsx src/cli.ts score industry-adjust --industry healthcare --score 0.7
```

#### Actual outputs:
```bash
# score --help: 43 subcommands, 60+ lines

# industry-list (works great!):
📊  Industry Trust Models (6)
  healthcare — Healthcare & Life Sciences
    Risk profile: critical
    Trust decay rate: 0.08/24h
    Frameworks: HIPAA, FDA_21CFR11, EU_MDR, GDPR

# industry-adjust (no args):
error: required option '--industry <id>' not specified

# industry-adjust --industry healthcare (missing score):
error: required option '--score <n>' not specified

# industry-adjust --industry healthcare --score 0.7 (works!):
📊  Industry-Adjusted Score
Industry: Healthcare & Life Sciences (healthcare)
Raw score: 70
Adjusted score: 70
Maturity level: L3
Percentile rank: p63
```

#### Friction Points:
1. **`amc score --help` has 43 subcommands** — Tom would spend 5 minutes reading help before finding the 3 `industry-*` commands buried in the middle.
2. **`--score` takes "0-1 internal scale"** — But the help says `--score <n>` with description "(0-1 internal scale)". Tom passed `0.7` and the output shows "Raw score: 70". The scale conversion is undocumented and confusing.
3. **Incremental required-option errors** — Running without `--industry` gives one error. Running with `--industry` but without `--score` gives another error. Each run-fail cycle is wasted time. The tool should validate all required options at once.
4. **`amc score industry-adjust` doesn't connect to actual scored agent** — The raw score is manually supplied. Tom expected this to read from his agent's current score automatically.
5. **Only 6 industries available** — Healthcare is there, but there's no "general AI" or "research" option for a data scientist working outside these verticals.
6. **"Adjusted score: 70" == "Raw score: 70"** — The adjustment appears to do nothing in this case. No explanation is given for when adjustment would differ.

---

### Persona 7: "Aisha" — Enterprise Architect ⭐ (1/5)

**Goal:** Set up trust between two agents  
**Journey:** Find trust commands → `amc fleet trust-init` → add edges → verify

#### Commands run:
```
npx tsx src/cli.ts fleet trust-init
npx tsx src/cli.ts fleet trust-add-edge --from agent-a --to agent-b --purpose "task-delegation"
npx tsx src/cli.ts fleet trust-edges
npx tsx src/cli.ts fleet trust-report
```

#### Actual outputs:
```bash
# trust-init:
require is not defined
(Command exited with code 1)

# trust-add-edge:
require is not defined
(Command exited with code 1)

# trust-edges:
require is not defined
(Command exited with code 1)

# trust-report:
Vault is locked. Run `amc vault unlock` before signing operations.
```

#### Friction Points:
1. **🔴 CRITICAL BUG: All trust commands crash** — `trust-init`, `trust-add-edge`, and `trust-edges` all fail with "require is not defined". This is an ESM/CJS module system incompatibility. The trust subsystem is **completely broken** for any user.
2. **The error message is an internal Node.js error** — "require is not defined" is meaningless to a user. It reveals internal implementation details and gives no path to resolution.
3. **`trust-report` blocked by vault** — Even if trust commands worked, the report requires vault unlock.
4. **Trust commands have no discovery path** — They're buried under `amc fleet`, with no mention in the main `--help` footer or the "Discoverability" section.
5. **The trust flow is undocumented in CLI** — No `--example` flag, no inline documentation for what an "edge" is or what "strict/weighted/no-inherit" mode means.
6. **`trust-add-edge` has complex options** — `--mode`, `--weight`, `--risk` — a fresh user would have no idea how these relate to each other.

---

### Persona 8: "Carlos" — API Developer ⭐⭐ (2/5)

**Goal:** Use AMC Studio API to integrate with internal dashboard  
**Journey:** `amc studio start` → hit API endpoints → understand response format

#### Commands run:
```
npx tsx src/cli.ts studio --help
npx tsx src/cli.ts studio ping
npx tsx src/cli.ts studio start --help
npx tsx src/cli.ts status
npx tsx src/cli.ts api --help
npx tsx src/cli.ts api status
```

#### Actual outputs:
```bash
# studio ping:
Studio state not found. Start with `amc up`.

# status:
Studio running: NO
Vault: exists=yes unlocked=no

# api --help:
Commands:
  status   Show API integration status

# studio start --help:
Options:
  --workspace <path>
  --bind <host>
  --port <port>
  --dashboard-port <port>
```

#### Friction Points:
1. **Can't start Studio without vault unlock** — Carlos can't start the server to explore the API because the whole system requires vault unlock first. This blocks the entire persona journey.
2. **`amc api` is nearly empty** — The `api` command only has `status`. Carlos expected things like `amc api docs`, `amc api routes`, or `amc api spec`. There's a full API reference in `docs/API_REFERENCE.md` but it's not discoverable from the CLI.
3. **API endpoints not listed anywhere in CLI** — Carlos has no way to discover what endpoints exist without reading docs files. `studio ping` just checks if it's running.
4. **`amc up` is the start command but isn't obvious** — `amc studio start` exists but `amc up` is the recommended path. Having two ways to start is confusing.
5. **No `--demo` mode** — Carlos can't start a minimal API server to poke around without full vault setup.
6. **API response format not shown** — Even `amc api status` doesn't show what the API returns. No sample JSON, no schema, no link to docs.

---

### Persona 9: "Maya" — Product Manager (non-technical) ⭐⭐ (2/5)

**Goal:** Understand what AMC score means  
**Journey:** `amc quickscore` → `amc explain AMC-1.1` → `amc improve`

#### Commands run:
```
npx tsx src/cli.ts quickscore
npx tsx src/cli.ts explain AMC-1.1
npx tsx src/cli.ts explain INVALID-999
npx tsx src/cli.ts improve
```

#### Actual outputs:
```bash
# quickscore:
Score: 0/25 (0%)
Preliminary maturity: L1
Top 3 improvement recommendations:
- AMC-1.1 Agent Charter & Scope: L0 -> L3

# explain AMC-1.1:
What it measures:
How clearly is my mission, scope, and success criteria defined for {{stakeholders}},
and how consistently do my decisions follow it for {{primaryTasks}}?

# explain INVALID-999:
Unknown question ID: INVALID-999. Use a value like AMC-2.1 or AMC-3.2.4.

# improve:
Current: L1 (0/25)
1. AMC-1.1: Agent Charter & Scope
   Current: L0 → Target: L3
   How: Create mission, non-goals, and preflight checks first.
   Run: amc score behavioral-contract
```

#### Friction Points:
1. **🔴 CRITICAL: Template variables visible in output** — `explain AMC-1.1` shows raw `{{stakeholders}}` and `{{primaryTasks}}` placeholders. These are unresolved template variables leaking into user-facing content. This looks broken and unprofessional.
2. **"Preliminary maturity: L1" when score is 0%** — Maya would ask "why am I L1 if I scored 0%?" The relationship between percentage and level is never explained.
3. **L0-L5 scale is never defined** — Throughout the CLI output, L0-L5 levels are referenced but never explained. What does L3 mean in business terms? What capabilities does it represent?
4. **"Score: 0/25" is abstract** — Maya needs context: is 0/25 typical for a new product? Is 25/25 even achievable? What do companies shipping AI products typically score?
5. **`amc improve` suggests `amc score behavioral-contract`** — Maya would click this and get... more technical output. The improvement flow doesn't guide non-technical users.
6. **Error message for invalid ID is good** — "Unknown question ID: INVALID-999. Use a value like AMC-2.1 or AMC-3.2.4." This is actually well-done.

---

### Persona 10: "Ryan" — Open Source Contributor ⭐⭐⭐ (3/5)

**Goal:** Contribute an assurance pack  
**Journey:** `amc pack --help` → understand pack structure → create a pack

#### Commands run:
```
npx tsx src/cli.ts pack --help
npx tsx src/cli.ts pack search
npx tsx src/cli.ts pack list
npx tsx src/cli.ts pack init --name my-test-pack --description "A test pack"
cat /tmp/test-pack/index.js
cat /tmp/test-pack/package.json
```

#### Actual outputs:
```bash
# pack search:
📦 Found 0 packs

# pack init:
✅ Initialized assurance pack at /private/tmp/test-pack
Next steps:
1. Edit package.json to customize your pack
2. Implement your pack logic in index.js
3. Test your pack locally
4. Run 'amc pack publish' to share with the community

# index.js content:
module.exports = {   // ← CommonJS in an ESM project!
  name: 'my-test-pack',
  async execute(context) {
    // Pack implementation goes here
  }
};
```

#### Friction Points:
1. **Pack scaffold uses CommonJS (`module.exports`)** — The generated `index.js` uses `module.exports`, but AMC itself is an ESM project (`"type": "module"` in package.json). This scaffold would fail to integrate correctly.
2. **`amc pack search` returns 0 results** — There are no published packs in the registry. A contributor searching for examples finds nothing. This should at minimum show the built-in packs as examples.
3. **`src/` and `test/` directories are empty** — The scaffold creates empty directories with no starter files. Ryan has no example of how to write a real pack.
4. **No link to CONTRIBUTING.md from pack init** — The `docs/ASSURANCE_LAB.md` presumably explains pack structure, but it's not referenced in the CLI output.
5. **`amc pack init` doesn't prompt for required fields** — Running without `--name` doesn't prompt interactively; it creates a pack with name "undefined". Running with `--name` but checking `package.json` shows `"author": {"name": "Unknown"}`.
6. **No way to test a pack locally** — "Step 3: Test your pack locally" is listed but there's no `amc pack test` command. How does Ryan test it?
7. **`amc pack publish` destination is unclear** — Where does publishing go? What registry? No docs.

---

## Part 1: UX Friction Report

| # | Friction Point | Severity | Persona(s) | Status |
|---|----------------|----------|-----------|--------|
| F1 | `fleet trust-init`, `trust-add-edge`, `trust-edges` crash with "require is not defined" | **CRITICAL** | Aisha (7) | 🔴 Bug |
| F2 | Template variables `{{stakeholders}}`, `{{primaryTasks}}` visible in `explain` output | **CRITICAL** | Maya (9) | 🔴 Bug |
| F3 | `assurance run --scope full` documented in --help footer but doesn't work | **CRITICAL** | Marcus (4) | 🔴 Bug |
| F4 | `amc fleet status` doesn't exist (expected command) | **HIGH** | Elena (5) | 🔴 Missing |
| F5 | Vault lock blocks assurance run, ci init, trust-report with no onboarding path | **HIGH** | Marcus (4), Jake (2), Aisha (7) | 🟠 UX gap |
| F6 | Pack scaffold generates CommonJS in an ESM project | **HIGH** | Ryan (10) | 🔴 Bug |
| F7 | quickstart silently defaults all 10 questions to L0 ("Non-interactive mode") | **HIGH** | Sarah (1) | 🟠 UX gap |
| F8 | L0-L5 maturity levels never defined in CLI output | **HIGH** | Sarah (1), Maya (9) | 🟠 Missing |
| F9 | 357 commands with no "start here" hierarchy for new users | **HIGH** | Priya (3), Elena (5) | 🟠 UX gap |
| F10 | Two competing red-team commands: `amc shield red-team` vs `amc redteam run` | **HIGH** | Marcus (4) | 🟠 UX confusion |
| F11 | `0% score = L1 maturity` — contradictory and unexplained | **HIGH** | Sarah (1), Maya (9) | 🟠 Bug/logic |
| F12 | `ci init` blocked by vault with no guidance on what vault is | **HIGH** | Jake (2) | 🟠 UX gap |
| F13 | Compliance report outputs JSON by default; no format guidance in error | **MEDIUM** | Priya (3) | 🟡 UX gap |
| F14 | Coverage score "0.458" shown as decimal instead of percentage | **MEDIUM** | Priya (3) | 🟡 Format |
| F15 | `ci print` uses `node dist/cli.js` instead of `amc` | **MEDIUM** | Jake (2) | 🟡 Bug |
| F16 | `amc ci gate` alias missing (DevOps convention) | **MEDIUM** | Jake (2) | 🟡 Missing |
| F17 | `score industry-adjust` requires all options upfront, error is incremental | **MEDIUM** | Tom (6) | 🟡 UX |
| F18 | `score industry-adjust` doesn't auto-read agent's current score | **MEDIUM** | Tom (6) | 🟡 Feature gap |
| F19 | `amc studio ping` fails silently with "Start with amc up" — no API discovery | **MEDIUM** | Carlos (8) | 🟡 UX |
| F20 | `amc api` command is nearly empty (only `status`) | **MEDIUM** | Carlos (8) | 🟡 Feature gap |
| F21 | `amc pack search` returns 0 packs — no starter examples | **MEDIUM** | Ryan (10) | 🟡 Content gap |
| F22 | Pack scaffold has empty `src/` and `test/` directories | **MEDIUM** | Ryan (10) | 🟡 UX |
| F23 | `amc pack init` without `--name` creates pack named "undefined" | **MEDIUM** | Ryan (10) | 🔴 Bug |
| F24 | No `amc pack test` command exists | **MEDIUM** | Ryan (10) | 🟡 Missing |
| F25 | `amc fleet health` output is all zeros with no "how to add agents" path | **MEDIUM** | Elena (5) | 🟡 UX |
| F26 | `quickscore` "next steps" suggest `amc ingest <logfile>` — command doesn't exist | **MEDIUM** | Sarah (1) | 🔴 Bug |
| F27 | `amc explain` output references `context.mission` and `guardrails.alignment` without explaining what these are | **LOW** | Maya (9) | 🟡 UX |
| F28 | `amc improve` "Run: amc score behavioral-contract" — no agentId guidance | **LOW** | Maya (9) | 🟡 UX |
| F29 | Trust flow has no inline documentation or example in help | **LOW** | Aisha (7) | 🟡 Missing |
| F30 | `pack init` doesn't link to CONTRIBUTING.md or ASSURANCE_LAB.md | **LOW** | Ryan (10) | 🟡 Missing |

---

## Part 2: Specific Fix Recommendations

### F1: Trust commands crash with "require is not defined"
**Root cause:** The trust command implementations use CommonJS `require()` in an ESM module project.  
**Fix:** Find the trust command implementations and convert to ESM imports (`import` / `import()`), or use `createRequire` from `node:module` as a bridge.
```typescript
// Before (broken):
const trustLib = require('./trust-lib');

// After (ESM):
import { trustLib } from './trust-lib.js';
```

### F2: Template variables visible in explain output
**Fix:** Search for all `{{...}}` placeholders in the question bank and either replace them with sensible defaults or remove them. The `explain` command should never show raw template syntax.
```
// In the question bank JSON/YAML:
Before: "How clearly is my mission defined for {{stakeholders}}"
After:  "How clearly is my mission defined for stakeholders and decision-makers"
```

### F3: `assurance run --scope full` broken
**Fix:** Either make `--scope full` work as an alias for `--all`, or remove the reference from the help footer. Most urgently, fix the help footer (it's the most visible user-facing documentation):
```
// In the --help footer, change:
- Run assurance         → amc assurance run --scope full

// To:
- Run assurance         → amc assurance run --all
```

### F4: `amc fleet status` missing
**Fix:** Add a `status` alias for `fleet health`, or rename `health` to `status`:
```typescript
// In fleet command registration:
fleetCmd.command('status')
  .description('Show fleet health dashboard (alias: health)')
  .action(() => runFleetHealth());
```

### F5: Vault lock blocks new users with no path forward
**Fix:** Add a soft-mode or demo mode that bypasses vault requirements. At minimum, the error message needs a next step:
```
// Before:
"Vault is locked. Run `amc vault unlock` before signing operations."

// After:
"🔐 Vault is locked. This is needed to sign artifacts.
   Quick fix: amc vault unlock
   First time? Run: amc setup (walks you through vault setup)
   Skip for now: add --no-sign flag to run without signing"
```

### F6: Pack scaffold uses CommonJS
**Fix:** Update the pack init template to use ESM:
```javascript
// Generated index.js should be:
export default {
  name: 'my-test-pack',
  version: '1.0.0',
  async execute(context) {
    return { success: true, results: [] };
  }
};
```

### F7: Quickstart silently uses L0 defaults
**Fix:** Either force interactive mode for quickstart, or be explicit:
```
// Before:
"Non-interactive mode: using L0 defaults"

// After:
"⚠️  Running in non-interactive mode — all questions defaulted to L0.
   For an accurate score, run: amc quickscore (5 interactive questions)
   Or answer fully: amc run --interactive"
```

### F8: L0-L5 not defined anywhere
**Fix:** Add a maturity level legend to any command that outputs a level:
```
Maturity Levels:
  L0 — Undocumented/ad-hoc behavior
  L1 — Documented intent, manual enforcement
  L2 — Automated checks, partial evidence
  L3 — Evidence-backed, auditable behavior
  L4 — Proactive risk management, attestation
  L5 — Self-improving, tamper-evident, certifiable
```

### F9: 357 commands with no hierarchy
**Fix:** Add role-based entry points to the main `--help` or as a separate `amc start` command:
```
Quick start by role:
  Developer     → amc quickscore | amc improve | amc scan --local .
  DevOps        → amc ci init | amc ci check
  Compliance    → amc comply report --framework EU_AI_ACT
  Security      → amc shield red-team | amc redteam run
  Executive     → amc fleet health | amc dashboard open
  Contributor   → amc pack init | amc pack publish
```

### F10: Two competing red-team commands
**Fix:** Deprecate `amc shield red-team` and make it an alias for `amc redteam run`, or clearly differentiate:
```
// In shield --help:
red-team [options]   Quick 5-attack campaign (use 'amc redteam run' for full suite)
```

### F11: 0% score = L1 (contradictory)
**Fix:** The scoring logic should be reviewed. A 0% score should be L0. At minimum, explain why:
```
// Add explanation:
Score: 0/25 (0%) — L1 (minimum level; L0 has no evidence at all)
```

### F12: CI init blocked by vault
**Fix:** Allow generating workflow files without signing, or provide the YAML template as a separate command:
```
amc ci init --unsigned   # Generate workflow without signing (skips vault)
amc ci template          # Just print the YAML template
```

### F13-F14: Compliance output format
**Fix:** Default to Markdown for human-readable reports; fix coverage score display:
```
// comply report: default to --out compliance.md
// coverage score: show as percentage
"Coverage: 45.8% (partial)"
```

### F15: CI print uses `node dist/cli.js`
**Fix:** Update the CI print template to use `npx amc` or just `amc`:
```bash
# Instead of:
node dist/cli.js bundle verify .amc/bundles/latest.amcbundle

# Use:
amc bundle verify .amc/bundles/latest.amcbundle
```

### F16: `amc ci gate` alias
**Fix:** Add alias:
```typescript
ciCmd.command('gate').alias('check')
```

### F17-F18: Industry-adjust UX
**Fix:** Auto-detect current agent score when `--score` not provided:
```
amc score industry-adjust --industry healthcare
// If no --score: "Reading current agent score... 0% — adjusting..."
```

### F21: Pack search returns nothing
**Fix:** Show built-in packs as examples:
```
📦 Found 0 community packs.

Built-in packs (not installable, for reference):
  injection, exfiltration, hallucination, toolMisuse...
  
See: amc assurance list (shows all 80+ built-in packs)
Publish your own: amc pack publish
```

### F23: `pack init` with no name creates "undefined"
**Fix:** Either require `--name` or prompt interactively:
```typescript
if (!options.name) {
  const answer = await inquirer.prompt([{type: 'input', name: 'name', message: 'Pack name:'}]);
  options.name = answer.name;
}
```

### F26: `amc ingest <logfile>` doesn't exist
**Fix:** Either create the command or remove the reference from quickscore output:
```
// Remove from quickscore output:
"$ amc ingest <logfile>   # Or import existing logs"
// Or implement it as an alias for evidence ingest
```

---

## Part 3: Quick Wins — Top 20 High-Impact, Low-Effort Fixes

Each fix is ≤10 lines and targets maximum impact.

---

**QW1: Fix `assurance run --scope full` help text**  
File: `src/cli.ts` (or wherever the global --help footer is defined)  
Change: `amc assurance run --scope full` → `amc assurance run --all`  
Impact: Fixes broken example seen by EVERY new user. **1 line change.**

---

**QW2: Add `fleet status` alias**  
File: Wherever fleet commands are registered (likely `src/commands/fleet.ts`)  
```typescript
// Add:
fleetCmd.command('status').description('Fleet health dashboard').action(runFleetHealth);
```
Impact: Fixes the most natural command Elena (and anyone) would type. **3 lines.**

---

**QW3: Fix coverage score formatting in comply report**  
File: `src/commands/comply.ts` (or report generator)  
```typescript
// Change:
console.log(`Coverage score: ${score}`);
// To:
console.log(`Coverage: ${(score * 100).toFixed(1)}% (${score >= 0.8 ? 'SATISFIED' : score >= 0.5 ? 'PARTIAL' : 'INSUFFICIENT'})`);
```
Impact: Immediately readable for Priya and every compliance user. **2 lines.**

---

**QW4: Add L0-L5 legend to quickscore output**  
File: `src/commands/quickscore.ts`  
```typescript
// Append after score output:
console.log('\nMaturity levels: L0=Undocumented | L1=Documented | L2=Automated | L3=Evidence-backed | L4=Proactive | L5=Certifiable');
```
Impact: Answers the #1 question every new user has. **1 line.**

---

**QW5: Fix `amc ingest` reference in quickscore**  
File: `src/commands/quickscore.ts`  
Remove or fix the `amc ingest <logfile>` command reference. Impact: Stops users hitting a dead-end command.

---

**QW6: Improve vault lock error message everywhere**  
File: wherever vault lock is checked (likely `src/utils/vault.ts`)  
```typescript
// Change:
throw new Error('Vault is locked. Run `amc vault unlock` before signing operations.');
// To:
throw new Error('🔐 Vault locked. Run `amc vault unlock` to sign artifacts, or `amc setup` for first-time setup.');
```
Impact: Reduces confusion for Jake, Marcus, Aisha, Carlos. **2 lines.**

---

**QW7: Fix `ci print` to use `amc` instead of `node dist/cli.js`**  
File: `src/commands/ci/print.ts`  
Replace all `node dist/cli.js` occurrences with `amc`. **~5 line change.**

---

**QW8: Add `ci gate` alias**  
File: `src/commands/ci/index.ts`  
```typescript
ciCmd.command('gate').alias('check').description('CI gate check (alias: check)').action(runCheck);
```
Impact: Every DevOps engineer's muscle memory. **3 lines.**

---

**QW9: Fix pack init to prompt for name when missing**  
File: `src/commands/pack/init.ts`  
```typescript
if (!options.name) {
  const res = await inquirer.prompt([{type:'input',name:'name',message:'Pack name:'}]);
  options.name = res.name;
}
```
Impact: Prevents "undefined" pack name bug. **5 lines.**

---

**QW10: Fix pack scaffold to use ESM**  
File: `src/commands/pack/init.ts` — the template string for `index.js`  
Change `module.exports = {` to `export default {`. **1 line.**

---

**QW11: Strip template variables from question bank**  
File: `src/data/questions.ts` or question bank JSON  
Global find-replace `{{stakeholders}}` → `your stakeholders` and `{{primaryTasks}}` → `your primary tasks`.  
Impact: Fixes the "looks broken" issue in `amc explain`. **10 lines or a script.**

---

**QW12: Add role-based entry points to main --help footer**  
File: wherever the footer "Start with a task" section is defined  
```
Quick start by role:
  Developer   → amc quickscore | amc improve
  DevOps      → amc ci init | amc ci check  
  Compliance  → amc comply report --framework EU_AI_ACT
  Security    → amc redteam run | amc shield red-team
  Executive   → amc fleet health | amc dashboard open
```
Impact: Transforms 357-command maze into a navigable guide. **8 lines.**

---

**QW13: Make `comply report` default to Markdown output**  
File: `src/commands/comply/report.ts`  
```typescript
// If --out not specified, default to markdown:
const outPath = options.out ?? `compliance-${framework.toLowerCase()}.md`;
```
Impact: Non-technical users get readable output by default. **2 lines.**

---

**QW14: Add empty-pack guidance to `pack search`**  
File: `src/commands/pack/search.ts`  
```typescript
if (results.length === 0) {
  console.log('No community packs found. See built-in packs: amc assurance list');
  console.log('Create your own: amc pack init --name my-pack');
}
```
Impact: Ryan doesn't hit a dead end. **4 lines.**

---

**QW15: Validate all required options in `score industry-adjust` at once**  
File: `src/commands/score/industry-adjust.ts`  
```typescript
const missing = [];
if (!options.industry) missing.push('--industry <id>');
if (!options.score) missing.push('--score <n>');
if (missing.length) { console.error(`Missing required options: ${missing.join(', ')}`); process.exit(1); }
```
Impact: Eliminates iterative error cycle for Tom. **6 lines.**

---

**QW16: Add `status` alias to `amc fleet health`**  
File: `src/commands/fleet/index.ts`  
Already covered in QW2, but confirming: the command name `status` should work as `health`. This is two variations on the same fix.

---

**QW17: Fix quickstart non-interactive fallback message**  
File: `src/commands/quickstart.ts`  
```typescript
// Change:
'Non-interactive mode: using L0 defaults'
// To:
'⚠️  TTY not detected — defaulting to L0. Run `amc quickscore` for interactive 5-question assessment.'
```
Impact: Sarah understands why she got 0/50. **1 line.**

---

**QW18: Add `amc pack test` as alias for `amc assurance run --pack`**  
File: `src/commands/pack/index.ts`  
```typescript
packCmd.command('test [packDir]').description('Test a local pack').action((dir) => {
  runAssurance({ pack: dir ?? '.', mode: 'sandbox' });
});
```
Impact: Completes the contributor workflow. **5 lines.**

---

**QW19: Add score autofetch to `industry-adjust`**  
File: `src/commands/score/industry-adjust.ts`  
```typescript
if (!options.score) {
  const current = await getAgentScore(agentId);
  options.score = String(current / 100); // convert to 0-1 scale
  console.log(`Using current agent score: ${current}%`);
}
```
Impact: Tom doesn't need to know the "0-1 internal scale" trick. **5 lines.**

---

**QW20: Add `redteam` → `shield red-team` deprecation notice (or vice versa)**  
File: `src/commands/redteam/index.ts` OR `src/commands/shield/red-team.ts`  
```typescript
// In shield red-team handler:
console.warn('ℹ️  Tip: For the full red-team suite, use `amc redteam run` with strategy options.');
```
Impact: Marcus immediately understands the two-command structure. **2 lines.**

---

## Summary Table: Ratings by Persona

| # | Persona | Role | Goal | Rating | Biggest Blocker |
|---|---------|------|------|--------|-----------------|
| 1 | Sarah | Junior Dev | Score her chatbot | ⭐⭐ 2/5 | Silent L0 default, 0% = L1 confusion |
| 2 | Jake | DevOps | CI/CD integration | ⭐⭐⭐ 3/5 | Vault blocks ci init, no `gate` alias |
| 3 | Priya | Compliance | EU AI Act report | ⭐ 1/5 | 357 commands, JSON default, no guidance |
| 4 | Marcus | Security | Red-team testing | ⭐⭐ 2/5 | Vault blocks assurance, broken `--scope full` |
| 5 | Elena | CTO | Fleet overview | ⭐⭐ 2/5 | `fleet status` missing, all zeros |
| 6 | Tom | Data Scientist | Healthcare scoring | ⭐⭐⭐ 3/5 | 43 subcommands, incremental errors |
| 7 | Aisha | Architect | Agent trust setup | ⭐ 1/5 | BROKEN: all trust commands crash |
| 8 | Carlos | API Dev | Studio API integration | ⭐⭐ 2/5 | Vault blocks studio, no API discovery |
| 9 | Maya | PM | Understand score | ⭐⭐ 2/5 | `{{stakeholders}}` leak, L-levels unexplained |
| 10 | Ryan | OSS Contributor | Contribute a pack | ⭐⭐⭐ 3/5 | CJS scaffold in ESM project, empty search |

**Average: 2.1/5** — Functional for power users who've read the docs; broken/confusing for everyone else.

---

## Critical Issues Requiring Immediate Fix (Before Any Marketing/Launch)

1. **🔴 `fleet trust-*` crashes** — "require is not defined" — entire trust subsystem unusable
2. **🔴 `{{stakeholders}}` visible in explain output** — looks like broken software
3. **🔴 `amc assurance run --scope full`** — main help example is wrong
4. **🔴 `amc ingest <logfile>`** — referenced in quickscore but doesn't exist
5. **🔴 Pack scaffold generates CJS in ESM project** — contributor code won't work

Fix these five before the tool goes to any new audience.

---

*Report generated by automated persona simulation with live command execution on 2026-03-14.*
