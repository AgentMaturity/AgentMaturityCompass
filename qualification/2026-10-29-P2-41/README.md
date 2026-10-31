# P2-41: held projects refuse with A4_ON_HOLD, and integrity failures answer a fixed BLOCKED verdict (2026-10-29)

Branch `rtd/w6-p2-41`, base `cafe5751f`, in two commits:

- `650129366`: `assertAllowed` answers 409 `A4_ON_HOLD` when the action's reasons name `ON_HOLD`. `GET …/readiness` on records that fail verification answers 409 `A4_INTEGRITY_FAILED` with the fixed detail `{status: BLOCKED, reasonCodes: [A4_INTEGRITY_FAILED]}` instead of the store's problem list, which named member principal keys before membership was checked.
- `efaa4a554` (follow-up): every 409 `A4_INTEGRITY_FAILED` gets that fixed detail, so no route names failed rows or member principal keys before membership is decided. `GET …/verify` keeps the report for workspace OWNERs, AUDITORs, the admin token and verified members; when the member rows fail, other readers get the verdict instead of 403.

`receipt.md` is the lane's own receipt for both commits: red and green runs, mutation checks, suites and checks. The files beside it hold the outputs it cites:

| File | What it shows |
|---|---|
| `check:*.txt`, `gen-api-ref.txt`, `gen-counts.txt` | The first commit's checks and generators. |
| `lint.txt` | Lint, from the follow-up. |
| `tests.txt` | The follow-up's suite: 44 files, 588 tests passed. It replaced the first commit's run (42 files, 567 tests), which is in git at `650129366`. |
| `followup-red.txt` | `tests/a4/scenario13TamperedRecord.test.ts` with the new assertions on the previous tip's source: 8 of 9 failed. |
| `followup-green.txt` | The same file after the fix: 9 of 9 passed. |
| `followup-mutations.txt` | Three mutations: two killed, one equivalent (see `receipt.md`). |
| `followup-checks.txt` | The follow-up's checks and suite, all exit 0. |

To reproduce, check out `efaa4a554`, run `npm run build`, then the commands in `receipt.json`.

## Receipt repaired 2026-10-31

The folder had no `README.md` and no `receipt.json`, which `npm run check:qualification` requires; `receipt.md` stays as the lane wrote it. `receipt.json` was written from `receipt.md`, the files beside it and the git history. It names the follow-up commit `efaa4a554`, and its commands are the follow-up's checks in `followup-checks.txt`, written as the npm scripts they name, with the suite run in `tests.txt` and the green run in `followup-green.txt` written as vitest commands, because the exact command lines were not recorded. The durations of those two runs are the ones vitest reported. `tests` is the follow-up's suite run (588 of 588), which includes the green run's file. The first commit's runs are described in the notes. Every evidence file is listed as a hashed artifact. The Node, pnpm and OS versions and the other commands' durations were never recorded; they are written as `not recorded` and `durationMs: 0`. `arch` is `arm64`, a same-host inference from that day's receipts that record it, because the schema allows only `arm64` or `x64`.
