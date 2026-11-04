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
