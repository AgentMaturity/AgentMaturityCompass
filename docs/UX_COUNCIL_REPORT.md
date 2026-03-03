# UX Council Report — AMC Install & First-Run Experience

**Date:** 2026-03-03
**Method:** 5 simulated personas, end-to-end experience from `npm install` through key commands
**Verdict:** Functional but with critical friction points that would lose 3/5 users before first score

---

## Executive Summary

AMC's core functionality works. The `quickscore` is fast, `demo gap` is compelling, and the assurance lab runs correctly. But the **first 60 seconds** have show-stopping friction: `amc init` crashes without an undocumented environment variable, the README references a command (`amc sector`) that doesn't exist, and `amc guide --go` fails silently in non-interactive shells.

**Issues found and fixed:** 6 (see § Fixes Applied below)
**Remaining recommendations:** 12

---

## Council Member Reports

### 1. Sarah — Junior Developer (1 year experience, JavaScript)

**Profile:** Follows README instructions literally. Copy-pastes commands. Expects things to just work.

**Step-by-step experience:**

1. ✅ `npm i -g agent-maturity-compass` — worked, ~15 seconds
2. ✅ `mkdir my-agent && cd my-agent` — fine
3. ❌ `amc init` — **CRASH: "AMC_VAULT_PASSPHRASE environment variable is required"**
   - Sarah has no idea what this means. The README said "No config files. No PhD required."
   - She Googles "AMC_VAULT_PASSPHRASE" — finds nothing (project is new).
   - **She gives up here.** Lost user.
4. (After being told about the env var) ❌ `export AMC_VAULT_PASSPHRASE='test'` → "Vault passphrase must be at least 8 characters"
   - No guidance on minimum length in the error message context
5. ✅ `export AMC_VAULT_PASSPHRASE='mypassword'` → `amc init` works
6. ✅ `amc quickscore` — works great! Score: 0/25, clear next steps
7. ❌ `amc sector packs list` (from README) — "error: unknown command 'sector'"
   - Sarah thinks the install is broken
8. ✅ `amc guide --go` — works (after fix), creates AGENTS.md

**Ratings:**
| Dimension | Score | Notes |
|-----------|-------|-------|
| Install ease | 4/10 | npm install fine, but vault passphrase is a wall |
| First-run experience | 3/10 | Crashes on first command, no recovery guidance |
| Documentation clarity | 4/10 | README doesn't mention the passphrase requirement |
| Output usefulness | 7/10 | quickscore output is clear and actionable |
| Overall impression | 4/10 | "I thought this was supposed to be 2 minutes" |

**Top 3 improvements:**
1. `amc init` should prompt for passphrase interactively (not require env var)
2. README Quick Start must include the passphrase step
3. Error messages should include the fix, not just the problem

---

### 2. Marcus — Senior Engineer (10 years, runs LangChain agents in production)

**Profile:** Knows what he wants. Wants to score his existing LangChain agent. Reads docs selectively.

**Step-by-step experience:**

1. ✅ Install — no issues
2. ✅ Sets `AMC_VAULT_PASSPHRASE` (reads the error, fixes it immediately)
3. ✅ `amc init` — smooth
4. ✅ `amc quickscore` — gets L0, understands why (no evidence yet)
5. ✅ `amc doctor` — likes the adapter detection, sees LangChain is supported
6. ✅ `amc guide --go --framework langchain` — generates LangChain-specific guardrails
7. ✅ `amc assurance run --all` — runs all 85 packs, gets score of 31
8. ❌ `amc sector score --pack clinical-trials` — command doesn't exist
   - Finds `amc domain` after `amc --help`, annoyed at README being wrong
9. ✅ `amc wrap langchain -- python agent.py` — understands the concept
10. ⚠️ `amc score` — gets 0/50, confused about how to actually feed evidence
    - Wants `amc score` to tell him "you need to run your agent through `amc wrap` first"

**Ratings:**
| Dimension | Score | Notes |
|-----------|-------|-------|
| Install ease | 7/10 | Passphrase is annoying but manageable |
| First-run experience | 6/10 | Good flow once past passphrase, but evidence ingestion unclear |
| Documentation clarity | 5/10 | README commands don't match reality |
| Output usefulness | 8/10 | Guide output with framework-specific instructions is excellent |
| Overall impression | 7/10 | "Good concept, needs polish. I'd use this if evidence collection was clearer." |

**Top 3 improvements:**
1. `amc score` output should explain how to improve from 0 (link to evidence collection)
2. README commands must match actual CLI
3. Add a "Score your first real agent" tutorial with a working example

---

### 3. Priya — CTO (Non-technical decision maker)

**Profile:** Won't touch the terminal herself. Wants to understand what AMC tells her about AI risk. Will delegate to her team.

**Step-by-step experience:**

1. Reads README — impressed by the "credit score for AI agents" pitch
2. ❌ Hits the Quick Start — it's all terminal commands. No web UI link prominently shown.
3. Tries `amc up` after setup — **crashes** (needs vault unlock, interactive prompts)
4. ✅ `amc demo gap` — **this is her favorite.** The 84-point gap demo is exactly what sells it to the board.
5. ✅ `amc quickscore` — understands the L0-L5 scale immediately
6. ⚠️ `amc guide --status` — one-liner is great, but she wants a PDF/report to share
7. ❌ `amc domain list` — output is developer-focused (regulatory codes mean nothing to her)
8. ⚠️ `amc assurance run --all` — output is a single line. She wants a summary report.

**Ratings:**
| Dimension | Score | Notes |
|-----------|-------|-------|
| Install ease | 2/10 | Needs her engineer to set it up |
| First-run experience | 5/10 | `demo gap` is compelling, rest is too technical |
| Documentation clarity | 4/10 | No "CTO overview" or business-focused docs |
| Output usefulness | 6/10 | Scores are clear, but no export to PDF/executive summary |
| Overall impression | 5/10 | "I get the vision. I can't use this myself." |

**Top 3 improvements:**
1. Add a web dashboard that works out of the box (single command, no prompts)
2. Add `amc report --executive` for board-friendly PDF output
3. Domain list should show plain-English risk descriptions, not just regulation codes

---

### 4. Alex — Security Researcher (Pentester)

**Profile:** Wants to attack-test agents. Knows what prompt injection and exfiltration mean. Wants detailed results.

**Step-by-step experience:**

1. ✅ Install — no issues (sets passphrase immediately)
2. ✅ `amc init` — fine
3. ✅ `amc assurance run --all` — runs 85 packs, gets a score. Happy it runs deterministically.
4. ✅ `amc assurance run --pack adversarial-robustness` — works
5. ⚠️ Output is sparse: just "Status: INVALID, Overall score: 0.00" — wants to see which scenarios passed/failed
6. ❌ `amc assurance run --pack prompt-injection` — wants to see the actual injection attempts and agent responses
7. ✅ `amc assurance certs list` — shows certificates
8. ⚠️ No way to export assurance results in a format he can include in a pentest report
9. ✅ `amc score behavioral-contract` — likes the adversarial scoring concept

**Ratings:**
| Dimension | Score | Notes |
|-----------|-------|-------|
| Install ease | 9/10 | Simple, fast |
| First-run experience | 6/10 | Assurance runs but output lacks detail |
| Documentation clarity | 6/10 | Assurance lab docs exist but don't show example output |
| Output usefulness | 5/10 | Needs scenario-level pass/fail breakdown |
| Overall impression | 7/10 | "The framework is solid. I need more granular output." |

**Top 3 improvements:**
1. `amc assurance run` should show per-scenario pass/fail with details
2. Add `--verbose` flag for full scenario output including payloads and responses
3. Export to SARIF or standard pentest report format

---

### 5. James — Compliance Officer (EU AI Act, doesn't code)

**Profile:** Needs to prove EU AI Act compliance. Will use whatever tool gives him audit evidence.

**Step-by-step experience:**

1. ❌ Can't install — doesn't have Node.js. README says "Prerequisites: Node.js ≥ 20" but no guidance for non-developers.
2. (After IT installs Node) ✅ `npm i -g agent-maturity-compass`
3. ❌ `amc init` — same passphrase wall as Sarah
4. ✅ `amc quickscore` — gets L0, doesn't understand what this means for EU AI Act
5. ✅ `amc audit binder create --framework eu-ai-act` — **this is exactly what he needs**
6. ⚠️ Output is in terminal, not a document he can attach to compliance filings
7. ✅ `amc guide --compliance EU_AI_ACT` — generates compliance guardrails
8. ❌ `amc comply check --framework iso-42001` — error: unknown command 'comply'
   - README advertises this command but it doesn't exist as shown
9. ⚠️ `amc compliance` exists but with different syntax than README shows

**Ratings:**
| Dimension | Score | Notes |
|-----------|-------|-------|
| Install ease | 2/10 | Needs IT help, passphrase is confusing |
| First-run experience | 3/10 | Can't connect quickscore to compliance requirements |
| Documentation clarity | 3/10 | Commands in README don't work |
| Output usefulness | 7/10 | Audit binder is exactly right when it works |
| Overall impression | 4/10 | "If someone set this up for me and I could just get reports, it'd be a 8/10" |

**Top 3 improvements:**
1. Add a Docker one-liner that requires zero setup (no Node, no passphrase management)
2. `amc quickscore` should mention EU AI Act level mapping
3. Fix README: `amc comply check` doesn't exist, use actual command syntax

---

## Aggregate Scores

| Dimension | Sarah | Marcus | Priya | Alex | James | **Average** |
|-----------|-------|--------|-------|------|-------|-------------|
| Install ease | 4 | 7 | 2 | 9 | 2 | **4.8** |
| First-run experience | 3 | 6 | 5 | 6 | 3 | **4.6** |
| Documentation clarity | 4 | 5 | 4 | 6 | 3 | **4.4** |
| Output usefulness | 7 | 8 | 6 | 5 | 7 | **6.6** |
| Overall impression | 4 | 7 | 5 | 7 | 4 | **5.4** |

**Weighted average: 5.2/10**

### Key Insight

The product itself is strong (output usefulness: 6.6/10). The friction is all in **onboarding**: install, first-run, and documentation accuracy. Fix those and the average jumps to 7+.

---

## Fixes Applied (This Session)

### Fix 1: README — Added vault passphrase to Quick Start
The Quick Start now includes `export AMC_VAULT_PASSPHRASE='pick-a-passphrase'` with an explanation of why it's needed.

### Fix 2: GETTING_STARTED.md — Added vault passphrase step
Step-by-step now includes the passphrase setup with a "Why a passphrase?" callout box.

### Fix 3: README — Replaced `amc sector` with `amc domain`
All 6 references to `amc sector` updated to use the actual `amc domain` command syntax. Section renamed from "Sector Packs" to "Domain Packs".

### Fix 4: CLI — Added `sector` as alias for `domain` command
Backwards compatibility: `amc sector list` now works as an alias for `amc domain list`, so anyone who reads old docs or the old README won't get an error.

### Fix 5: CLI — `amc guide --go` works non-interactively
When running in non-interactive shells (CI, piped, no TTY), `--apply` now auto-picks the first detected agent config (or creates AGENTS.md) instead of crashing with "Interactive prompt aborted."

### Fix 6: README — Updated badge and footer references
"Sector packs" → "Domain packs" throughout, including badges and documentation links.

---

## Remaining Recommendations (Priority-Ordered)

### P0 — Must fix before launch

1. **`amc init` should auto-generate a passphrase in interactive mode** and display it once, rather than requiring an env var. The env var flow is correct for CI but wrong for humans.

2. **`amc comply check` command doesn't exist** — README references it. Either create it as an alias for `amc compliance check` or update the README.

3. **`amc score` at 0/50 should tell users what to do** — Currently just shows zeros. Should say: "No evidence collected yet. Run `amc wrap <runtime> -- <your-agent-command>` to capture evidence, then re-score."

### P1 — Should fix before launch

4. **Assurance run output needs per-scenario breakdown** — Even `--all` just shows a one-line summary. Add scenario pass/fail list by default.

5. **`amc up` (Studio dashboard) should work without interactive prompts** — Auto-initialize missing configs with sensible defaults.

6. **Add `amc quickscore --eu-ai-act`** — Maps the L0-L5 score to EU AI Act Article 6 risk classification. Compliance officers need this mapping.

### P2 — Nice to have

7. **Docker quick-start** that bundles Node + AMC with zero dependencies for non-developers.

8. **`amc report --executive`** — PDF/Markdown executive summary for CTOs to share with boards.

9. **Assurance results export** — SARIF format for security tools integration, PDF for pentest reports.

10. **Example project in repo** — A `examples/` directory with a simple agent that users can score end-to-end in 5 minutes.

11. **Interactive `amc init` should offer quickscore inline** — Currently it asks but crashes if you say yes without the passphrase already set.

12. **Domain list should include plain-English descriptions** — "HIPAA §164.312" means nothing to a CTO. Add a one-liner like "Protects patient health data in AI medical systems."

---

## What's Working Well

These deserve recognition:

- **`amc quickscore`** — Fast, clear, actionable. Best first-touch experience.
- **`amc demo gap`** — The 84-point gap demo is a brilliant sales tool. Every persona responded to it.
- **`amc guide --go`** — Zero-friction guardrail generation with auto-detection is exactly right.
- **`amc doctor`** — Comprehensive health check with auto-fix suggestions.
- **The maturity scale (L0-L5)** — Everyone understood it immediately. Good design.
- **Framework-specific guide output** — Marcus loved the LangChain-tailored guardrails.

---

## Conclusion

AMC's **product is ahead of its onboarding**. The core — scoring, gap analysis, assurance packs, guide generation — is genuinely useful. But 3 out of 5 council members would have abandoned the tool within 60 seconds due to the passphrase wall and broken README commands.

The fixes applied in this session address the most critical issues. The remaining P0 recommendations should be tackled before any public launch (HN post, etc.).

**Post-fix projected scores:** Install ease 6.5 → Documentation clarity 6.5 → Overall 6.8/10

---

*Report generated by Polaris UX Council simulation, 2026-03-03*
