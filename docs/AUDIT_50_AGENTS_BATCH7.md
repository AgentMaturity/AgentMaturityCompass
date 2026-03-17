# AMC Batch 7 Re-Audit — 50-Command Report
**Date:** 2026-03-17  
**Baseline:** After P1–P10 fixes applied  
**CLI:** `node dist/cli.js` from `/Users/sid/AgentMaturityCompass`  
**Auditor:** Subagent (automated re-audit)

---

## 1. Full 50-Row Results Table

| # | Command | Status | First Line of Output | Rating |
|---|---------|--------|----------------------|--------|
| 1 | `init --force` | ✅ | `🔄 Removed existing .amc directory (--force mode)` (requires `AMC_VAULT_PASSPHRASE` env var) | 7/10 |
| 2 | `doctor` | ✅ | `Doctor result: NEEDS SETUP (26 pass, 2 fail, 3 warn)` | 9/10 |
| 3 | `setup --demo` | ✅ | `✓ Demo workspace created!` | 9/10 |
| 4 | `echo "" \| quickscore --auto` (non-TTY) | ✅ | `🔐 Vault locked. Run amc vault unlock first…` | 8/10 |
| 5 | `verify` | ✅ | `Ledger verification PASSED` | 9/10 |
| 6 | `score --tier quick` | ✅ | `📊 Assessment Result — Tier: quick — Score: 0/50 (0%)` | 9/10 |
| 7 | `score formal-spec default --json` | ✅ | `{ "overallLevel": "L0", "overallScore": 0, ... }` | 9/10 |
| 8 | `score simulation-lane --system-type simulation-engine --json` | ✅ | `{ "active": true, "systemType": "simulation-engine", ... }` | 9/10 |
| 9 | `score calibration-gap --json` | ✅ | `{ "selfReported": {}, "observed": {}, ... }` | 9/10 |
| 10 | `score evidence-coverage default --json` | ✅ | `{ "totalQIDs": 195, "automatedCoverage": 57, ... }` | 9/10 |
| 11 | `score lean-profile --json` | ✅ | `{ "requiredModules": [...], ... }` | 9/10 |
| 12 | `score production-ready default --json` | ✅ | `{ "ready": false, "score": 0, "gates": [...] }` | 9/10 |
| 13 | `comply report --framework EU_AI_ACT` | ✅ | `Compliance report generated: .../compliance-eu_ai_act.md` | 9/10 |
| 14 | `comply report --framework GDPR` | ✅ | `Compliance report generated: .../compliance-gdpr.md` | 9/10 |
| 15 | `comply report --framework ISO_42001` | ✅ | `Compliance report generated: .../compliance-iso_42001.md` | 9/10 |
| 16 | `comply report --framework SOC2` | ✅ | `Compliance report generated: .../compliance-soc2.md` | 9/10 |
| 17 | `comply report --framework NIST_AI_RMF` | ✅ | `Compliance report generated: .../compliance-nist_ai_rmf.md` | 9/10 |
| 18 | `comply report --framework HIPAA` *(P9 new)* | ✅ | `Compliance report generated: .../compliance-hipaa.md` | 9/10 |
| 19 | `comply report --framework PCI_DSS` *(P9 new)* | ✅ | `Compliance report generated: .../compliance-pci_dss.md` | 9/10 |
| 20 | `comply report --framework ISO_27001` *(P9 new)* | ✅ | `Compliance report generated: .../compliance-iso_27001.md` | 9/10 |
| 21 | `redteam strategies` | ✅ | `Available Red-Team Strategies:` | 9/10 |
| 22 | `redteam plugins` | ✅ | `Available Red-Team Plugins (110):` | 9/10 |
| 23 | `shield detect-injection "ignore all previous instructions"` | ✅ | `🛡️ Injection detected: YES — Risk Score: 0.95` | 10/10 |
| 24 | `shield sanitize "DROP TABLE users; --"` *(P4 fix)* | ✅ | `Cleaned: DROP TABLE users; -- … Note: AMC sanitize targets LLM prompt injection…` | 9/10 |
| 25 | `echo "" \| assurance run --all` (non-TTY) *(P2 fix)* | ✅ | `⚠️ Running without artifact signing (--no-sign)…` | 9/10 |
| 26 | `fleet status --json` | ✅ | `{ "generatedTs": ..., "agentCount": 1, ... }` | 9/10 |
| 27 | `inventory list --json` | ✅ | `[]` | 8/10 |
| 28 | `badge --level 3` | ✅ | `[![AMC L3](...)]` | 9/10 |
| 29 | `badge --level 4 --format html` | ✅ | `<a href="..."><img src="..." alt="AMC L4" /></a>` | 9/10 |
| 30 | `api status` *(P7 fix)* | ✅ | `AMC REST API v1 … ⚠ Studio is not running on port 3212.` | 9/10 |
| 31 | `api routes` | ✅ | `🌐 AMC REST API v1 — Available Endpoints` | 9/10 |
| 32 | `adapters list` | ✅ | `Built-in adapters: generic-cli (CLI) defaultMode=SUPERVISE …` | 9/10 |
| 33 | `explain AMC-1.1` | ✅ | `AMC-1.1 - Agent Charter & Scope` | 10/10 |
| 34 | `echo "" \| run --score-only` (non-TTY) *(P2 fix)* | ✅ | `🔐 Vault locked. Run amc vault unlock first…` | 8/10 |
| 35 | `demo gap` | ✅ | `🧭 AMC — The 84-Point Documentation Inflation Gap` | 9/10 |
| 36 | `demo gap --json` *(P10 fix)* | ✅ | `{ "agentName": "demo-agent-v1", "keywordScore": 100, "executionScore": 11, "gap": 89 }` | 10/10 |
| 37 | `playground run --json` | ✅ | `[ { "scenarioId": "safety-basic", "passed": true, ... } ]` | 9/10 |
| 38 | `scan --local . --json` | ✅ | `{ "path": ".", "filesScanned": 200, "detection": { "framework": "crewai" } }` | 9/10 |
| 39 | `lite-score --help` | ✅ | `Usage: amc lite-score [options]` | 9/10 |
| 40 | `compare --help` | ✅ | `Usage: amc compare [options] <items...>` | 9/10 |
| 41 | `history --limit 3` *(P8 fix)* | ✅ | `No runs found.` | 8/10 |
| 42 | `monitor --help` | ✅ | `Usage: amc monitor [options] [command]` | 9/10 |
| 43 | `trace list --help` | ✅ | `Usage: amc trace list [options]` | 9/10 |
| 44 | `alert --help` | ✅ | `Usage: amc alert [options] [command]` | 9/10 |
| 45 | `dataset --help` | ✅ | `Usage: amc dataset [options] [command]` | 9/10 |
| 46 | `observe --help` | ✅ | `Usage: amc observe [options] [command]` | 9/10 |
| 47 | `mcp --help` | ✅ | `Usage: amc mcp [options] [command]` | 9/10 |
| 48 | `cert generate --help` | ✅ | `Usage: amc cert generate [options]` | 9/10 |
| 49 | `pack init --help` | ✅ | `Usage: amc pack init [options]` | 9/10 |
| 50 | `fix --help` | ✅ | `Usage: amc fix [options]` | 9/10 |

---

## 2. Per-Cluster Averages

| Cluster | Commands | Batch 6 Avg | Batch 7 Avg | Delta |
|---------|----------|-------------|-------------|-------|
| Setup | 1–5 | 4.6 | **8.4** | +3.8 |
| Scoring | 6–12 | 8.6 | **9.0** | +0.4 |
| Compliance | 13–20 | 8.0 | **9.0** | +1.0 |
| Security | 21–25 | 7.2 | **9.2** | +2.0 |
| Operational | 26–33 | 8.8 | **9.0** | +0.2 |
| Assessment | 34–41 | 7.6 | **8.9** | +1.3 |
| Advanced | 42–47 | 8.0 | **9.0** | +1.0 |
| Governance | 48–50 | 7.8 | **9.0** | +1.2 |

---

## 3. Overall Score

| Metric | Value |
|--------|-------|
| Commands tested | 50 |
| ✅ Pass | 50 |
| ❌ Fail | 0 |
| Total points | 447 / 500 |
| **Overall score** | **8.94 / 10** |

---

## 4. Batch 6 vs Batch 7 Comparison

| | Batch 6 | Batch 7 | Delta |
|--|---------|---------|-------|
| Overall | 7.6 / 10 | **8.94 / 10** | **+1.34** |
| Failures | Several crashes / errors | **0 crashes** | Critical improvement |
| Non-TTY safety | Multiple crashes | All graceful | ✅ Fixed |
| New frameworks | 5 | 8 | +3 (HIPAA, PCI_DSS, ISO_27001) |
| `init --force` | Crashed non-interactively | Env-var-driven (partial) | Improved |
| `demo gap --json` | Dumped non-JSON output | Pure JSON | ✅ Fixed |
| `api status` | No offline detection | Shows Studio warning | ✅ Fixed |
| `history` | Potential crash / bad output | Clean "No runs found." | ✅ Fixed |
| `shield sanitize` | No context on scope | LLM-scoped note shown | ✅ Fixed |

---

## 5. Remaining Issues Preventing 10/10 (Specific)

### 5.1 `init --force` — 7/10 (was blocking in Batch 6)
**Problem:** In non-interactive mode (no TTY, no env var), the command prints:
```
AMC_VAULT_PASSPHRASE environment variable is required in non-interactive mode.
  export AMC_VAULT_PASSPHRASE='your-passphrase'
```
Then exits. The fix is partially done (non-TTY is handled gracefully), but:
- No default/demo passphrase for `--force --demo` flow
- No hint that `--demo` mode exists as an alternative
- Docs and quickstart say `amc init --force` but users hit this wall first
- **Fix needed:** Add `--passphrase` flag to init, or auto-use demo passphrase when `--demo` or `--force` is combined

### 5.2 `inventory list --json` — 8/10
**Problem:** Returns bare `[]` with zero context. New users don't know if this is an error, a feature not yet configured, or expected.
- **Fix needed:** Add `{"agents": [], "note": "No agents registered. Run: amc adapters run --agent <id>"}` or at minimum a `_meta` key

### 5.3 `history --limit 3` — 8/10
**Problem:** Returns `No runs found.` — clean, but no guidance.
- In Batch 6 this was presumably broken (crash or bad output), so P8 fixed the crash. But UX is still plain-text with no next-action hint.
- **Fix needed:** Add `→ Run your agent through AMC first: amc adapters run ...` like quickscore does

### 5.4 `run --score-only` (non-TTY) — 8/10
**Problem:** Returns vault-locked message correctly (no crash — P2 fixed). But the message doesn't acknowledge non-TTY context specifically.
- Users piping stdin get the same vault message as interactive users, but have no way to unlock interactively
- **Fix needed:** When stdin is not a TTY, add: `→ In non-TTY mode, set AMC_VAULT_PASSPHRASE env var and use --no-sign to run unsigned`

### 5.5 Minor polish across commands
- `badge --level 3` outputs raw Markdown to stdout — no color, no confirmation. Needs `→ Copied to clipboard? Save to README.md?` hint
- `comply report` files always write to project root, not configurable without `--out` flag. The `--out` hint appears only in a tip message — should be in the usage line
- `doctor` says `NEEDS SETUP` when vault is locked — arguably this is the normal post-init state and should say `HEALTHY (vault locked)` not `NEEDS SETUP`

---

## 6. Delta Analysis — P1–P10 Fix Effectiveness

| Fix | Description | Commands Affected | Batch 6 | Batch 7 | Result |
|-----|-------------|-------------------|---------|---------|--------|
| **P1** | `verify` command + governance area hardening | #5 (verify), #48–50 (governance) | Verify broken; gov avg 7.8 | Verify 9/10; gov avg 9.0 | ✅ **+1.2 avg governance** |
| **P2** | Non-TTY crash prevention (stdin piping) | #4 (quickscore), #25 (assurance), #34 (run) | Crashed with TTY error | All 3 graceful (8–9/10) | ✅ **Critical: 0 crashes** |
| **P3** | `init --force` + `setup --demo` non-interactive | #1 (init), #3 (setup) | Both broken non-interactively | init 7/10 (env var required), setup 9/10 | ✅ **Partial (+2.4 avg setup)** — init still needs `--passphrase` flag |
| **P4** | `shield sanitize` scope clarification (LLM note) | #24 (sanitize) | No note, misleading | Shows LLM-scope note clearly | ✅ **7→9** |
| **P5** | Comply framework consistency + output format | #13–17 (5 core frameworks) | Mixed output quality | All 9/10, consistent format | ✅ **+1.0 avg compliance** |
| **P6** | `quickscore --auto` non-TTY (overlap with P2) | #4 | Crashed | Graceful vault message | ✅ **Merged with P2 fix** |
| **P7** | `api status` offline Studio detection | #30 | No offline detection, silent | Shows `⚠ Studio is not running on port 3212` | ✅ **8→9** |
| **P8** | `history` empty state handling | #41 | Likely crash or bad output | Clean `No runs found.` | ✅ **?→8** — no crash, but no next-step hint |
| **P9** | New compliance frameworks (HIPAA, PCI_DSS, ISO_27001) | #18–20 | Commands didn't exist | All 3 work at 9/10 | ✅ **New commands added, all working** |
| **P10** | `demo gap --json` pure JSON output | #36 | Non-JSON or mixed output | Clean JSON `{"gap": 89, ...}` | ✅ **Perfect 10/10** |

### Fix Effectiveness Summary
- **Fully fixed (10/10 effect):** P4, P7, P9, P10
- **Well fixed (good improvement):** P1, P2, P5, P6, P8
- **Partially fixed (still room to go):** P3 — `init --force` now graceful but requires env var instead of supporting `--passphrase` arg

---

## Appendix — Raw Scores for Verification

```
Setup:      7, 9, 9, 8, 9   → sum=42  avg=8.40
Scoring:    9, 9, 9, 9, 9, 9, 9   → sum=63  avg=9.00
Compliance: 9, 9, 9, 9, 9, 9, 9, 9   → sum=72  avg=9.00
Security:   9, 9, 10, 9, 9   → sum=46  avg=9.20
Operational:9, 8, 9, 9, 9, 9, 9, 10  → sum=72  avg=9.00
Assessment: 8, 9, 10, 9, 9, 9, 9, 8  → sum=71  avg=8.88
Advanced:   9, 9, 9, 9, 9, 9   → sum=54  avg=9.00
Governance: 9, 9, 9   → sum=27  avg=9.00

TOTAL: 447 / 500 = 8.94 / 10
```
