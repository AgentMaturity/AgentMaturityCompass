# P0-33 freeze and acceptance audit — 14 October 2026

Scope: read-only audit of current plan evidence, freeze authority, Claude reservations, and source revisions. No source, ref, baseline, check configuration, tracker, session, or other worktree was changed. This uniquely named audit note is the only authored artifact.

## Current source and drift

- Primary `/Users/sid/AgentMaturityCompass`: HEAD and origin/main are `5ea5e866a42acd5c8228a712e9b8c1d9f18c745c`; `git status --short` was empty.
- Primary held `pending-main-442cd919`: `3b4a673c8f6fc11a947279054979e977f95b34d1`.
- Durable `/Users/sid/AgentMaturityCompass-worktrees/s7fccbbfa/clone`: HEAD/int `990cb586fb481bb7db75977a4e5d332c6fd1ddb4`; origin/main `5ea5e866a`; its local main ref is older `ebfa106dc45a853fc15f36e8d5312b499fc01806`.
- P0-33 checkout: `3becc0330db851a6b7aecc0e55ac3718122b817c`; initial status was clean. Its two code fixes affect seven files relative to int, plus eight tracked qualification files. Neither freeze file is part of that P0-33 diff.
- The main handoff documents a root-only P0-57 comment merge absent from int. Do not overlay the two integration candidates or claim that either is main.

## Freeze result and authority

Primary main baseline: CLI/inventory `1236/1236`, station packs/questions `41/632`, freeze active, no P1-65 allowance. Candidate baseline: `1255/1255`, `41/632`, freeze active, P1-65 included.

`scripts/check-freeze.mjs:63-97` requires exact measured counts and checks every changeset exception against the base's allowed keys when counts rise. Line 89 explicitly refuses an unallowed key: “a PR cannot authorize itself.” `:134-137` selects origin/main locally; `:120-131` selects the pre-push commit for push checks. `docs/program/READY_TO_DEPLOY.md:46-50` requires Sid approval for a separate allowance PR.

The parent agent independently reran current candidate check:freeze and retained its exit-1 P1-65 refusal in `tmp/p0-33-continuation/freeze.log`. This audit did not rerun qualification checks.

Direct human D-22 evidence survives in `/Users/sid/.claude/projects/-Users-sid-AgentMaturityCompass--claude-worktrees-loving-germain-ac9c7f/7fccbbfa-7f5d-4ff0-b679-dcef42f87812.jsonl`:

- Line 1471, AskUserQuestion `toolu_01HXg9ofC6wABvKqUGHMWLRP`, asks about D-18/D-20/D-22 and specifically adding the amc a4 CLI exception key. The accepted option describes Claude adding the key in its own commit.
- Line 1473, tool_result at `2026-10-10T19:09:56.161Z` (11 October in Asia/Kolkata), records “Accept all; you add the key (Recommended)”. This is a direct answer record, rather than the later Claude summary or Done label.

The approved change exists as `dc82f87e37ed2faa00517346ef2b42cd22064b9b`, parent `7acd6362db23738355b9f068f97dafe4a73eb314`. Its entire diff adds only P1-65 to allowedExceptionKeys; counts and policy remain unchanged:

```diff
@@ -27,6 +27,7 @@
     "P1-43",
     "P1-44",
     "P1-45",
-    "P1-46"
+    "P1-46",
+    "P1-65"
```

It was separately merged at `31199a9aadd088a6e46400d1ee7f5c15e3536b64` before the A4 CLI change. It remains on the held integration line, absent current main. Historical success with `--base-ref 31199a9aa` proves only that held-line comparison. It does not establish an accepted main qualification base.

Safe path: retain origin/main refusal; prepare/review the existing allowance as a separate base change; have the authorized integrator land that allowance before a count-raising integration. A single push containing allowance and CLI would still compare with the old pre-push baseline. Do not change refs, use a fabricated/missing base, choose the held candidate as accepted base, waive the check, alter counts by hand, or amend the guard to obtain green. Continue independent P0-33 checks and fixes while the base integration is unresolved.

## Recovered P0-33 acceptance and limits

The exact surviving issue title is “Make the release gate and CI green on main, with every check executed”, `/Users/sid/Downloads/Issues.md:43`; blockers there are D-03, P0-02, P0-07, P0-16, P1-52.

`/Users/sid/Downloads/Workstreams.md:380` provides this P0-33-associated G0 exit criterion:

> All 14 release:gate checks execute and pass in a fresh clone of main (live-deploy-health per D-03 or a written skip), and every CI job is green (P0-33).

The current repo contract requires the full test suite and applicable PR commands, regression/mutation evidence, Node 22/24 build-test CI with freeze and qualification guards, committed receipts, docs/changeset, reviewed merge, and recorded merged SHA (`docs/program/READY_TO_DEPLOY.md:60-99`). Passing selected files or receipt validation cannot satisfy the whole issue.

The complete P0-33 issue writeup was not recovered. Search covered the five supplied Downloads documents and evidence index; the known root scratchpad plan and durable backup (issue-P0-33.md absent); both exact Claude session transcripts (334 P0-33-containing lines combined, no complete P0-33 issue section); and the connected AMC wiki index. Cached g0-latest content ends before the P0-33 heading. Portal's five resources are general Xirp/Portal docs. Its only RTD wiki entries point to the same five supplied files, with matching source hash suffixes; there is no indexed P0-33 issue page. The original private document remains the complete-plan pointer: `https://claude.ai/code/artifact/153157e0-0d2f-4374-934b-5f6f360a46e1`.

Do not invent or silently replace missing acceptance. Continue evidenced CI/release failures; retain incomplete acceptance recovery as a distinct qualification limitation. D-03 topology choice is outside this audit's approval determination.

## Ownership preserved

Both live Claude session metadata files still report idle. Dated reservations preserve src/a4/** and src/console/assets/a4*.js for Claude; CLI composition/result registry/REPL changes require coordination. Latest P2-02 slice 2 reservation retains src/dataflow/**, src/vault/dlp.ts, privacyRedaction.ts, gateway/bridge redaction, CLI agent-run composition, kernel agentLoopRunner, and SECURITY_ARCHITECTURE_OVERVIEW. An idle session does not release ownership.

- `/private/tmp/claude-501/-Users-sid-AgentMaturityCompass/442cd919-61e6-4923-8fc9-c2ffc9937ca1/scratchpad/RESERVATIONS.md`: SHA-256 `9ac6ae7493c2bf579218c5bd075042f423e52727950090bb1e3f39dbadb133ca`; mtime `2026-10-12T01:46:34.237552+00:00`.
- `/private/tmp/claude-501/-Users-sid-AgentMaturityCompass/442cd919-61e6-4923-8fc9-c2ffc9937ca1/scratchpad/pending-checks.md`: SHA-256 `6339ea6398fddcfbe18ea96a40b839241745ec138378772c77a581ede1b57870`; mtime `2026-10-12T03:13:11.499268+00:00`.

Existing Graphify was queried first with vocabulary `freeze baseline exception changeset quality acceptance workflow`. Graph built_at_commit is `4247e610e214a5b07de631c394acdaf0f5ed679e`; no relevant freeze/READY_TO_DEPLOY source nodes were found. It is navigation only, not current evidence. No refresh, watcher, or server was launched.

No P0-29 work was started in this audit.
