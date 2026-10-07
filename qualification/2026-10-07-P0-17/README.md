# P0-17: compliance fails closed

Branch `rtd/p0-17-compliance-fail-closed`, built on `6b899a60` (main `0b818f4f` plus #55, used as `origin/main`). The checks ran on 2026-10-07 at `68b51edf0a7c3990987e46dfd20d29027e88e942`, the last code commit (the public-count regeneration), in the issue's own clone on macOS 26.6.2 arm64 with Node v25.5.0 and pnpm 10.33.0.

## What was checked

`amc compliance report` now evaluates each requirement as pass, fail or not evaluated. Evidence counts only when it is bound to the control (`meta.controlIds`, or a declared `auditTypes` entry), belongs to the subject (exact `meta.agentId`; workspace `system` events are positive only for `binding: { scope: workspace }` and violation-only otherwise), comes from AMC runtime (`src/claims/evidenceProvenance.ts`) and falls in the window. Assurance reports count only when sealed and measured. An empty ledger yields NOT_EVALUATED everywhere with `coverage.score: null`.

## Files

- `commands.tsv`: every command run on the receipt commit with its exit code and duration; `receipt.json` repeats them and adds `check:qualification`, run with this receipt in place.
- `affected-tests.txt`: `tests/compliance`, the federation test and every test file that imports a changed compliance, unified or API module or reads the compliance CLI output (found with `git grep`), run as one vitest invocation (29 files, 506 tests).
- `red-run.log`: the final new and changed tests run against the `src/` of `6b899a60` (`git checkout 6b899a60 -- src`, then restored): 19 failed, 36 passed. The empty-ledger case (PARTIAL), the system-session case (SATISFIED) and the coincidental-event case (`nist_map` SATISFIED from an event bound to `soc2_availability`) fail there. `tests/compliance/evidenceBinding.test.ts` passed in that run only because the two new modules stay on disk as untracked files; on `6b899a60` itself it cannot import them.
- `mutations.log`: the issue's four mutation checks (M1 system-session positive credit, M2 `requires_no_audit` passing without activity, M3 `isBoundToControl` returning true, M4 admitting the `import` producer), the tests each one fails, and the byte-identical restore hash.
- `coverage.txt`: focused in-process coverage for every `src/*.ts` file this issue changes or adds, against `scripts/quality/coverage-baseline.json` (existing files) and `newFileMinimum` (new files). None is below its floor in this focused set. `src/cli.ts` and `src/console/assets/app.js` are not measured here (CLI subprocess and browser asset).
- `acceptance-hipaa-report.json`: `amc compliance report --framework HIPAA --window 14d --out r.json` in a fresh `amc init` workspace: 10 categories, all NOT_EVALUATED, `"score": null`. That workspace has no signed compliance maps, so evidence is `untrusted`; after `amc compliance init` the same command gives NOT_EVALUATED with evidence `incomplete`.

## Not run here

The full `npm test`, whole-suite coverage, per-file floors, performance, `check:clean-source`, `check:packed-install` and the release gate are run by the orchestrator on this branch.

## Reproduce

Run the commands in `commands.tsv` from the repository root at the receipt commit.
