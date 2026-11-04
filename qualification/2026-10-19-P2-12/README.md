# P2-12 qualification folder: red-first run only (2026-10-19)

P2-12 fences native session writers by signed epoch and lease and adds resume rules for interrupted calls. This folder holds one artefact, `red.txt`: the transcribed summary of the red-first vitest run on base `dc8c34d04` plus the new P2-12 tests, before any source change (local macOS arm64, Node 22, not CI). Four test files failed: three could not load because `src/session/resumeRules.ts` and `src/session/writerFence.ts` did not exist yet, and `tests/sessionMigrationReceipt.test.ts` failed both of its tests.

`red.txt` ends by pointing to a `receipt.json` with the green focused tests. That file was never committed. The folder arrived in commit `247d9bbc5` (2026-10-27), a snapshot of session 7fccbbfa's uncommitted work in `wt/p2-12` (last edited 2026-10-19), merged by `c7ea18470` from `rtd/p2-12-writer-fencing`. Nothing in the folder or in the P2-12 history records a green run, a repository check or a mutation result, so this folder does not qualify P2-12.

To reproduce the red run, check out `dc8c34d04`, apply only the `tests/` changes of `247d9bbc5` (the four new test files and their fixtures) and run the command in `receipt.json`.

## Receipt repaired 2026-10-31

The folder had no `README.md` and no `receipt.json`, which `npm run check:qualification` requires. Both were written from `red.txt` and the git history above. `receipt.json` lists the red run as its only command, with exit 1 (vitest's exit for a failing run; `red.txt` records the failures, not the exit code), and its test totals (2 failed of 2). `commit` is the red run's base `dc8c34d04`. Values that were never recorded are written as `not recorded` (pnpm, the macOS version), `22` for the Node major that `red.txt` gives, and `durationMs: 0`, which in these receipts means the duration was not recorded. `arch` is `arm64`, as `red.txt` records.
