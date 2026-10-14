# Current P0-33 qualification — 14 October 2026

P0-33 is **blocked, not Done**. The latest fully measured source is `8fb531d52dcdb9a1ca090540e02b77ca7c2f0f42`. Its actual full gate exits 1: 19 of 20 executed checks pass, the full-suite step fails, and per-file coverage is dependency-skipped. Live health is the separately approved D-03 omission until P2-06.

All 24,360 assertions pass with zero failed, pending or todo assertions. The report still has one failed suite: public-document fixture cleanup exceeded its 10-second hook deadline. The followup at `dfe063a6dab076804cae00a362c57655d2e3dcfb` retains all inputs/assertions and gives that cleanup 120 seconds. Its 50 focused checks pass independently on Node 22.23.3 and Node 24.21.0. No full-suite pass at the followup revision is claimed. The mandatory serial performance profile passes all five tests.

Measured full-run coverage is 68.51% lines, 66.75% statements, 72.89% functions and 61.47% branches. Functions fail the unchanged 75% floor. The independent per-file diagnostic fails with 880 violations across 289 files. These are actual coverage failures, including held A4 source, and remain unresolved. The report, exact per-file debt and preceding failures are preserved. No floor, baseline, include list, test-registration rule, production source file, or freeze policy was changed to obtain green.

The continuation fixes verifier coverage inventory, complete correctness/performance gate profiles, bounded measured integration/cleanup deadlines, required CI release-gate/Playwright jobs, exact step and workflow contracts, and retained coverage diagnostics. The new macOS Node24 release-gate job executes the Darwin native corpus under the original zero-pending predicate. Existing Ubuntu Node22/24 jobs remain intact. All 57 Playwright cases pass locally. Source and actual workflow mutations removing test typecheck, lint or the release job fail as required and restore the original file hashes.

On 14 October, Sid directly approved: **"live-deploy-health skipped: no supported deployment until D-03 names one"**, until P2-06. This approves the health omission only and qualifies no deployment. The historical raw gate retains its original missing-variable message; the approved reason is recorded in the followup runbook, gate and decision artifact.

Freeze still exits 1 against actual `origin/main` at `5ea5e866a42acd5c8228a712e9b8c1d9f18c745c`: P1-65 is absent from the accepted base exception list. The prior direct human approval and separate one-key proposal are preserved; a candidate cannot authorize itself. Do not select a held or nonexistent base to suppress this refusal. P0-33 also requires a fresh merged-source gate and three green main CI pushes. The latest five actual main pushes failed; the latest run is https://github.com/AgentMaturity/AgentMaturityCompass/actions/runs/38132701944. Main, held Claude refs/checkouts, original P0-29 files, reservations and paused groups remain preserved. No publication, deployment, tracker closure or Claude resumption occurred.

The full spec was recovered at `/Users/sid/AgentMaturityCompass-worktrees/s7fccbbfa/specs/P0-33.md`, SHA256 `3480850b3fb2e2a400e3ae910b5e0825f64883520b55f6b84c534c018b6bff4c`. Earlier statements that full acceptance was unavailable are historical and superseded by that recovery. Node24 evidence is scoped to the focused checks; full hosted macOS/Node24 and Ubuntu requalification remain pending.

The next serial issue is P0-29 on a fresh copy of accepted main. After it, follow the current plan priority/dependencies, beginning with P0-47 qualification of the existing implementation. P0-33 remains blocked until coverage and accepted integration/CI requirements are satisfied; no issue closure is implied by moving to the next authorized task.

## Original snapshot, preserved

# P0-33 bounded fixes — 14 October 2026

Status: two local fixes verified; broad P0-33 and release qualification are incomplete.

Code revision: `e3c173766eaf9f73fd35ec43bd90032a5dac948a`, branch `codex/p0-33-current-qualification`, based on preserved Claude candidate `990cb586fb481bb7db75977a4e5d332c6fd1ddb4`.

## Changes and evidence

- `4a60a4f665ce89c1d24ca4ae2c7e851c33ecd821` makes the existing CI source-quality step required. Tests inspect the real workflow and execute its run block with a failing npm shim. Restoring the original workflow produces the expected regression failure; the fixed workflow passes. Existing baseline allowances remain unchanged.
- `e3c173766eaf9f73fd35ec43bd90032a5dac948a` fixes requested-revision API source URLs in linked worktrees. Pinned TypeDoc 0.28.20 does not discover a worktree `.git` file. For an explicit validated revision, the existing build supplies a revision-bound source link template with Git discovery disabled. The public API entry points share `src/`; module namespaces, provider pages, and the opt-in API gate remain covered by the existing artifact tests.

Distinct latest passing Node 22 test files contain 699 tests: 46 quality/release-gate, 615 previous-main-failure compatibility cases, 13 release-engineering, 21 secret-scan, and 4 public-docs tests. Node 24 checks contain 50 tests: the same 46 quality/release-gate and 4 public-docs tests. These are scoped test results, not a full-suite result. Per-file assertion names, counts, source scope, and hashes of the original local JSON reports are in `checks-summary.json`.

Source and test typechecks, lint, build, real duplication/reachability scans, counts, docs drift, and architecture checks passed. Postfix lint/counts/docs/architecture checks passed at the second code revision. The committed-source check at that revision passed a fresh isolated install/build, doctor, keyless signed tool turn, and two-process resume/evidence verification. It used Node 22.23.3 and pnpm 10.33.0. Raw compact command logs are included where useful; other raw logs remain under ignored `tmp/` with their hashes in the summary.

## Failures retained and next action

The full instrumented coverage attempt at the first code commit was interrupted after three failures, exit 130. It produced 505 completed-file progress lines, not a final JSON report or accepted coverage. Release-engineering and secret-scan files pass serially; public-docs exposed the real source-link defect and passes after the fix. The causes of the other two full-run failures are unresolved. A fresh full qualification run is still required; no previous run is active.

The initial counts check failed when tests were added as a new file. Moving them into the existing ratchet test file restored counts without altering published count metadata. The original-CI mutation deliberately fails and proves the regression detects the waiver.

`check:freeze` still rejects the preserved candidate because P1-65 is absent from main's base exception list. Preserve this refusal; a candidate must not authorize its own exception. A separate base change requires the integrator's review of the recorded D-22 decision. No freeze policy, baseline allowance, or production gate was weakened.

Before advancing, complete full P0-33 qualification against an accepted integration base, resolve the coverage failures, and recover any remaining P0-33 acceptance text. Do not mark P0-33 or G0 Done from this receipt. Do not push the 544-commit Claude candidate as one issue. No primary checkout, dirty/historical worktree, authored input document, or Claude reservation was changed.
