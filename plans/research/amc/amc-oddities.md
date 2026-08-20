# AMC Repo-Root Oddities — Investigation Report

## 1. STRUCTURE

**Ships in npm tarball** (`package.json` `files`): only `dist/**` (minus `dist/sea`, `dist/installers`), `scripts/postinstall.js`, `scripts/run-policy-fixtures-ci.mjs`, `fixtures/policy/amc-ci-policy-fixtures.yaml`, `README.md`, `LICENSE`. **None of the oddities below ship to npm.** The exposure surface is the public GitHub repo (4,783 tracked files) and local clutter.

**Git-tracked oddities** (publicly visible):
- `internal/debug/` — 6 tracked debug scripts (`debug_hipaa*.js`, `test-model-scanner.{cjs,mjs}`, `test-compare-models.js`); `internal/archive/` (untracked, gitignored by name: `HANDOFF.md`, `qualification.md`, `sales_playbook.md` — sales material).
- `qa/` — 30 tracked files: a **complete second npm project** `amc-qa` ("QA RelOps System") with its own `package.json`, lockfile, untracked `node_modules/` + `dist/`.
- `research/reproduce.sh` — whitepaper reproducibility script ("84-point documentation inflation gap").
- `mirofish-simulation/` — 4 tracked files: Chinese-language simulated-market report (`mirofish-report.md`, `-100agents.md`) + `index.html`/`data.js` viz. Output of the real product feature `src/mirofish/`.
- `test_model.pkl` — root-level "malicious pickle" fixture; actually ASCII text: `import pickle; pickle.loads(b'malicious_code')`. Committed in a "Sprint checkpoint" bulk commit; **zero references** from src/tests/docs.
- `.tmp-{a2a,distributed,memory-depth}-events.json`, `.tmp-gap-report.json` — Apr 6 event fixtures + 41KB readiness gap report vs competitor "G0DM0D3"; no code references.
- `COMPETITIVE_ANALYSIS_G0DM0D3.md`, `COMPETITIVE_GAP_REPORT_G0DM0D3.md` — tracked competitive intel at root (`.gitignore` only lists `COMPETITIVE_ANALYSIS.md`, wrong name).
- `compliance-*.json` (5 files) — generated compliance-export outputs committed at root.
- `.amc/` — 78 tracked files (deliberate) + gitignored runtime state.

**Untracked/gitignored** (local-only clutter): `AMC_OS/` (agent operating archive: `00_DASHBOARD.md`, `INBOX/` role handoffs, `ROLEBOOKS/`, `PROMPTS/`, `RESEARCH/`, `LOGS/` knowledge manifest, `TOOLS/generate_knowledge_manifest.mjs`); `amc_ai_army/` (GTM workspace: `GOAL.md` "$5,000 Compass Sprint", `LEADS.csv`, `OUTREACH.md`, `OFFERS.md`); `memory/` (OpenClaw agent memory: daily logs from 2026-02-17, `amc-reference.md`, Moltbook/Reddit research); `ASSETS/landing_page_copy.md`; `security-audit/` (3 **empty** dirs: `awesome-agent-skills`, `awesome-openclaw-skills`, `voltagent` — audit clones deleted, husks remain); `tmp/` (QA screenshots, debug .mjs scripts, `amc-cloud-snap.tgz`, `release-gate/` outputs); `logs/` (empty); `.amc_cache/` (empty); `.openclaw/workspace-state.json`; the 11 persona files; `--json`/`--verbose`; `..bfg-report/`; `test-results/` (Playwright brand screenshots); 3 packed `agent-maturity-compass-*.tgz` (4.6–4.9MB each).

## 2. HOW IT ACTUALLY WORKS

**OpenClaw persona stack**: `IDENTITY.md`/`SOUL.md`/`NOW.md`/`USER.md`/`BOOTSTRAP.md`/`CONTINUATION.md`/`HEARTBEAT.md`/`MEMORY.md` define a persistent agent persona ("Satanic Pope 😈⛪", born 2026-02-17 per `.openclaw/workspace-state.json` `bootstrapSeededAt`) that treats the repo root as its home directory. `HEARTBEAT.md` is a cron-style pulse: check a **crypto trading bot** (`ps aux | grep bot.py`, `~/crypto-bot/`), review `AMC_OS/HQ/SCOREBOARD.md`, spawn `REV_*`/`INNO_*` subagents. `AGENTS.md` defines a 70-role org (50 revenue + 20 innovation) writing deliverables into `AMC_OS/`; `AMC_ARMY_ROLES.md` defines a separate 5-wave engineering army; `TOOLS.md` is the guardrail file. `memory/` is the persona's long-term memory. Data flow: heartbeat → spawn role agent → role reads `AMC_OS/ROLEBOOKS/` → writes deliverable + `AMC_OS/INBOX/<ROLE_ID>.md` handoff. `AMC_OS/README.md` documents an authority-routing hierarchy ending at an **external Obsidian vault** (`/Users/sid/Documents/AMC/Agent/AMC Source of Truth Map.md`).

**`qa/`**: Express+WebSocket server (`qa/src/index.ts`) → REST routes (`routes/{bot,releases,integrations,webhooks,test-runs}.ts`) → Anthropic Claude tool-calling bot engine (`src/bot/engine.ts`, `anthropic.ts`, `scheduler.ts`) → GitHub integration (`src/integrations/github.ts`) → vitest runner (`src/runners.ts`, runs the parent repo's suite via `test:amc: cd .. && npx vitest run`) → PostgreSQL (7 migrations). It's an AI release-operations bot bolted into the repo as a subdirectory.

**`.amc/`**: the repo dogfoods its own CLI. Tracked seed = signed policy YAMLs (`*.yaml` + `*.yaml.sig`), ed25519 **public** keys + rotation history (`.amc/keys/`), `evidence/demo-evidence.json`, `agents/default/quality/ratings.json`. Load-bearing: referenced by `tests/orgCompass.test.ts`, `tests/consoleApprovalsWhatifBenchmarks.test.ts`, `tests/studioVaultModeLoop.test.ts`, `scripts/incident-readiness-check.mjs`. Runtime state (sqlite ledgers, receipts, runs, `.sig` of json) is carefully gitignored.

**`--json` / `--verbose`**: AMC supply-chain scan JSON reports (status **FAIL**, 18 findings, 8 HIGH, incl. `ANTHROPIC_TOKEN_HINT` in `src/adapters/builtins/claudeCli.ts`) written to files literally named after CLI flags — an argument-parsing/`--out` mishap on 2026-02-23. Same day: **three BFG Repo-Cleaner runs** (`..bfg-report/2026-02-23/{20-12,20-46,20-51}/`) — a git-history scrub, almost certainly a secrets purge following that FAIL scan.

**`tmp/`** is live infrastructure, not just junk: `prepack` writes `tmp/release-gate/prepack.json` and `accessibility:release-evidence` reads `tmp/accessibility-playwright.json` (`package.json` scripts). Deleting the dir is fine; scripts recreate it, but cleanup must not gitignore-break those paths (already gitignored).

**`mirofish-simulation/`**: rendered output of `src/mirofish/` (scenario files like `src/mirofish/scenarios/compliance-heavy.yml`) — a 100-persona synthetic social simulation of AMC's market reception (488 nodes, 360 edges, 323 "facts"), written in Chinese, with fabricated quotes praising `amc quickscore`.

## 3. CAPABILITY INVENTORY

- `qa/` RelOps: REST API (bot jobs, releases, test-runs, webhooks, integrations), WebSocket live updates, Claude tool-loop with GitHub PR/release/CI tools, Postgres job queue + audit trail, auth (bcrypt, rate-limit), vitest orchestration of parent repo.
- `AMC_OS/TOOLS/generate_knowledge_manifest.mjs`: deterministic CSV retrieval index over the archive (`LOGS/AMC_OS_KNOWLEDGE_MANIFEST.csv`).
- Persona stack: bootstrap ritual (`BOOTSTRAP.md`), session continuity (`CONTINUATION.md`, `NOW.md`), heartbeat automation (`HEARTBEAT.md`), 70-role org spawning (`AGENTS.md` + `AMC_OS/ROLEBOOKS/`), engineering waves (`AMC_ARMY_ROLES.md`), guardrails (`TOOLS.md`).
- `memory/`: ~50KB AI-agents knowledge base, AMC architecture reference (~750 lines), gap analyses (Reddit 34 gaps, Moltbook 15), self-improvement plans.
- `.amc/` seed: signed policy fixtures for audit/assurance/bench/forecast/fleet/gateway/canon/cgx/diagnostic-bank/mechanic subsystems; key-rotation histories; demo evidence.
- `internal/debug/`: ad-hoc HIPAA-scoring and model-scanner reproduction scripts (paired with `test_model.pkl`).
- `research/reproduce.sh`: end-to-end whitepaper claim reproduction (Node 20+ gate, installs package, runs scoring).
- `amc_ai_army/`: ICP, offers, outreach sequences, messaging house, sprint plan, scoreboard — a complete GTM playbook.
- `mirofish` root output: HTML/JS report viewer + two synthetic market-reception reports.

## 4. REUSE VERDICTS

- **`qa/` RelOps bot — REFACTOR**: genuinely capable service (Claude loop + GitHub + PG) but an embedded sub-repo with its own lockfile/`node_modules`; extract to its own repo/package before wrapping as a plugin service.
- **`.amc/` tracked seed — KEEP-AS-SERVICE**: deliberate dogfood workspace and test fixture; document the load-bearing subset, keep runtime state gitignored.
- **`research/reproduce.sh` — KEEP-AS-SERVICE**: legitimate public reproducibility artifact; move under `docs/` or link it (currently referenced nowhere).
- **`AMC_OS/` manifest generator — KEEP-AS-SERVICE** (locally); the archive itself stays out of git.
- **OpenClaw persona stack + `memory/` — REPLACE**: superseded by harness-native memory/persona; relocate to `~/.openclaw`-style home, not a product repo root.
- **`internal/debug/` — REPLACE**: convert the useful reproductions into real vitest tests; delete the rest and untrack.
- **`mirofish-simulation/` (root output) — REPLACE**: keep the `src/mirofish/` engine; untrack the generated reports (synthetic-quote risk, see below).
- **`amc_ai_army/`, `ASSETS/`, `internal/archive/` — REPLACE**: business material; belongs in the Obsidian vault/CRM.
- **Pure deletions**: `--json`, `--verbose`, `.tmp-*.json` (untrack + delete), `test_model.pkl` (untrack; recreate under `fixtures/` only if a scanner test consumes it), `*.tgz`, `..bfg-report/`, `test-results/`, `logs/`, `.amc_cache/`, `security-audit/` empty husks, `tmp/` contents (dir regenerates).

## 5. SURPRISES & DEBT

- **Tracked competitive intel & temp files in a public repo**: `COMPETITIVE_ANALYSIS_G0DM0D3.md`, `COMPETITIVE_GAP_REPORT_G0DM0D3.md`, `.tmp-gap-report.json` (readiness gaps vs a named competitor) are all public; `.gitignore` guards the wrong filename (`COMPETITIVE_ANALYSIS.md`).
- **BFG × 3 on 2026-02-23** right after a FAIL secret-hint scan (`--json`/`--verbose`) — history was rewritten; no evidence in-repo that flagged keys were rotated. Follow up.
- **`test_model.pkl` at root of a security-branded repo** is an orphaned fake-malware fixture — bad optics for scanners and users cloning a "tamper-evident compliance toolkit".
- **Synthetic testimony**: `mirofish-simulation/` contains fabricated practitioner quotes praising AMC ("发现一…"). Tracked and public; if ever cited as user feedback it contradicts the repo's evidence-integrity claims.
- **`HEARTBEAT.md` monitors a personal crypto trading bot** from inside a product repo — persona files were only gitignored, never relocated; `.gitignore`'s own comment says "NEVER commit these", yet they still sit in the worktree of the published project.
- **Duplicated knowledge planes**: repo docs, `AMC_OS/`, `memory/`, Obsidian vault, and Linear are all declared authorities (`AMC_OS/README.md` routing table) — drift is structural.
- **`qa/` claims "5031 AMC tests, 336 test files"** — hardcoded in its README, guaranteed stale.
- **`.gitignore` is the cleanup map**: it already names nearly every oddity; debt is that tracked leftovers (`internal/debug`, `.tmp-*`, `test_model.pkl`, mirofish output, G0DM0D3 docs) predate the rules — `git rm --cached` never happened. `internal/` and `AMC_OS/` also have `700` perms, which will break any future CI checkout that expects them.
- **Empty scaffolds**: `logs/`, `.amc_cache/`, `security-audit/*` are zero-content directories kept alive only by `.DS_Store`-era habits.

**Cleanup summary**: npm tarball is already clean; the real work is (1) `git rm --cached` the tracked strays listed above, (2) delete local clutter (flag files, tgz, bfg-report, husk dirs), (3) relocate persona/GTM/memory material out of the repo, (4) extract `qa/` to its own repo, (5) verify post-BFG key rotation.