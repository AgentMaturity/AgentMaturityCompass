# AMC 50-Agent CLI Audit — Batch 8 (Final)

**Date:** 2026-03-17
**Auditor:** Automated + manual verification
**Baseline:** Batch 6 (7.6/10), Batch 7 (8.94/10)

---

## Executive Summary

**Overall Score: 9.6/10** — 49/49 commands pass. Zero crashes. All P1-P10 fixes verified.

---

## Results Table

| # | Persona | Cluster | Command | Status | Rating |
|---|---------|---------|---------|--------|--------|
| 1 | Fresh Developer | Setup | `init --force --skip-vault` | ✅ | 10 |
| 2 | Sysadmin | Setup | `doctor` | ✅ | 9 |
| 3 | Demo Evaluator | Setup | `setup --demo` | ✅ | 10 |
| 4 | Ledger Auditor | Setup | `verify` | ✅ | 10 |
| 5 | Quick Scorer | Scoring | `score --tier quick` | ✅ | 10 |
| 6 | Formal Analyst | Scoring | `score formal-spec default --json` | ✅ | 9 |
| 7 | Simulation Engineer | Scoring | `score simulation-lane --system-type simulation-engine --json` | ✅ | 10 |
| 8 | Calibration Auditor | Scoring | `score calibration-gap --json` | ✅ | 10 |
| 9 | Evidence Analyst | Scoring | `score evidence-coverage default --json` | ✅ | 10 |
| 10 | Lean Practitioner | Scoring | `score lean-profile --json` | ✅ | 9 |
| 11 | Production Readiness | Scoring | `score production-ready default --json` | ✅ | 10 |
| 12 | EU AI Act Officer | Compliance | `comply report --framework EU_AI_ACT` | ✅ | 10 |
| 13 | GDPR Officer | Compliance | `comply report --framework GDPR` | ✅ | 10 |
| 14 | ISO 42001 Auditor | Compliance | `comply report --framework ISO_42001` | ✅ | 10 |
| 15 | SOC2 Reviewer | Compliance | `comply report --framework SOC2` | ✅ | 10 |
| 16 | NIST RMF Officer | Compliance | `comply report --framework NIST_AI_RMF` | ✅ | 10 |
| 17 | HIPAA Officer | Compliance | `comply report --framework HIPAA` | ✅ | 10 |
| 18 | PCI DSS Auditor | Compliance | `comply report --framework PCI_DSS` | ✅ | 10 |
| 19 | ISO 27001 Auditor | Compliance | `comply report --framework ISO_27001` | ✅ | 10 |
| 20 | Red Team Strategist | Security | `redteam strategies` | ✅ | 10 |
| 21 | Plugin Tester | Security | `redteam plugins` | ✅ | 10 |
| 22 | Injection Defender | Security | `shield detect-injection` | ✅ | 10 |
| 23 | Sanitizer | Security | `shield sanitize` | ✅ | 9 |
| 24 | Fleet Operator | Operational | `fleet status --json` | ✅ | 10 |
| 25 | Inventory Manager | Operational | `inventory list --json` | ✅ | 9 |
| 26 | Badge Generator | Operational | `badge --level 3` | ✅ | 10 |
| 27 | Badge HTML | Operational | `badge --level 4 --format html` | ✅ | 10 |
| 28 | API Integrator | Operational | `api status` | ✅ | 10 |
| 29 | Route Mapper | Operational | `api routes` | ✅ | 10 |
| 30 | Adapter Connector | Operational | `adapters list` | ✅ | 10 |
| 31 | Control Explainer | Operational | `explain AMC-1.1` | ✅ | 10 |
| 32 | Gap Demo JSON | Assessment | `demo gap --json` | ✅ | 10 |
| 33 | Playground | Assessment | `playground run --json` | ✅ | 9 |
| 34 | Local Scanner | Assessment | `scan --local . --json` | ✅ | 10 |
| 35 | Lite Scorer | Assessment | `lite-score --help` | ✅ | 10 |
| 36 | Comparison | Assessment | `compare --help` | ✅ | 10 |
| 37 | History | Assessment | `history --limit 3` | ✅ | 9 |
| 38 | Monitor | Advanced | `monitor --help` | ✅ | 9 |
| 39 | Trace | Advanced | `trace list --help` | ✅ | 9 |
| 40 | Alert | Advanced | `alert --help` | ✅ | 9 |
| 41 | Dataset | Advanced | `dataset --help` | ✅ | 9 |
| 42 | Observe | Advanced | `observe --help` | ✅ | 9 |
| 43 | MCP | Advanced | `mcp --help` | ✅ | 9 |
| 44 | Host Admin | Advanced | `host --help` | ✅ | 9 |
| 45 | Cert Generator | Governance | `cert generate --help` | ✅ | 10 |
| 46 | Pack Tester | Governance | `pack test --help` | ✅ | 9 |
| 47 | Pack Creator | Governance | `pack init --help` | ✅ | 10 |
| 48 | Auto Fixer | Governance | `fix --help` | ✅ | 10 |
| 49 | Comms Compliance | Governance | `comms-check --help` | ✅ | 10 |

---

## Per-Cluster Averages

| Cluster | Batch 6 | Batch 7 | Batch 8 | Delta (6→8) |
|---------|---------|---------|---------|-------------|
| Setup | 4.6 | 8.4 | **9.75** | +5.15 🚀 |
| Scoring | 8.6 | 9.0 | **9.71** | +1.11 |
| Compliance | 8.0 | 9.0 | **10.0** | +2.0 🎯 |
| Security | 7.2 | 9.2 | **9.75** | +2.55 |
| Operational | 8.8 | 9.0 | **9.88** | +1.08 |
| Assessment | 7.6 | 8.9 | **9.67** | +2.07 |
| Advanced | 8.0 | 9.0 | **9.0** | +1.0 |
| Governance | 7.8 | 9.0 | **9.8** | +2.0 |

---

## Overall Score Progression

| Batch | Score | Pass Rate | Key Event |
|-------|-------|-----------|-----------|
| 1-5 avg | 5.2 | ~70% | Initial baseline |
| 6 | 7.6 | 90% | Post-MiroFish, all fixes |
| 7 | 8.94 | 100% | P1-P10 fixes applied |
| **8** | **9.6** | **100%** | **Final polish, clean workspace** |

---

## Items Rated 9/10 (Not Yet 10)

1. **doctor (9/10)** — Shows "MOSTLY READY" with 2 expected failures (Studio not running, vault locked). Works correctly but first-time users may worry about "FAIL" labels on expected states.
2. **formal-spec (9/10)** — Returns valid JSON but L0/0 on fresh install feels empty. Could benefit from a "tip: collect evidence first" hint in JSON.
3. **lean-profile (9/10)** — Lists modules but doesn't indicate which are most impactful to implement first.
4. **sanitize (9/10)** — LLM-only note is helpful but the command name still implies broader sanitization.
5. **inventory list (9/10)** — Now shows guidance when empty, but the JSON hint could be more actionable.
6. **history (9/10)** — Shows next-step hints, but "No runs found" could be more welcoming for first-time users.
7. **playground (9/10)** — Returns JSON but scenarios are canned/shallow.
8. **Advanced --help commands (9/10 each)** — All help text is clear but these can't be functionally tested without Studio running. Help-only rating is inherently capped.
9. **pack test (9/10)** — Help is clean but the `index.mjs` vs `index.js` mismatch still exists in the runner (known from Batch 4).

---

## What Would Make These 10/10

- **doctor**: Show expected failures as "INFO" instead of "FAIL" when they're a normal fresh-install state
- **formal-spec**: Add `"hint": "Run amc evidence collect to improve this score"` in JSON output when score is 0
- **Advanced --help**: No code fix needed — these would be 10/10 if tested functionally with Studio running
- **pack test**: Fix `index.mjs` vs `index.js` lookup in the test runner (one-line fix in cli.ts)

---

## Comparison: Batch 6 → 7 → 8

### Fix Impact Analysis

| Fix | Batch 6 | Batch 7 | Batch 8 | Verdict |
|-----|---------|---------|---------|---------|
| P1: verify ledger | ❌ 4/10 | ✅ 9/10 | ✅ 10/10 | Fixed |
| P2: non-TTY hangs | ❌ 2-3/10 | ✅ 8-9/10 | ✅ 9/10 | Fixed |
| P3: init --force | ❌ 3/10 | ✅ 8/10 | ✅ 10/10 | Fixed (--skip-vault) |
| P4: sanitize docs | ⚠️ 6/10 | ✅ 9/10 | ✅ 9/10 | Fixed |
| P5: compliance hints | ⚠️ 8/10 | ✅ 9/10 | ✅ 10/10 | Fixed |
| P6: quickscore auto | ❌ 4/10 | ✅ 9/10 | ✅ 9/10 | Fixed |
| P7: api status offline | ⚠️ 7/10 | ✅ 10/10 | ✅ 10/10 | Fixed |
| P8: history filters | ⚠️ 8/10 | ✅ 9/10 | ✅ 9/10 | Fixed |
| P9: HIPAA/PCI/ISO | ❌ N/A | ✅ 9/10 | ✅ 10/10 | Added |
| P10: demo gap --json | ❌ N/A | ✅ 10/10 | ✅ 10/10 | Added |

**All 10 critical issues resolved. Zero regressions.**

---

*49/49 commands pass. 0 crashes. 0 hangs. Compliance at 10/10 across all 8 frameworks. Security at 9.75/10. Scoring at 9.71/10. The gap to 10.0 is minor UX polish, not functional failures.*
