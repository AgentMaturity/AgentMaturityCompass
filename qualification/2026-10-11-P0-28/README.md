# P0-28 docs truth reset: recorded runs and checks (2026-10-11)

What ran locally on 2026-10-11 to support the P0-28 docs changes on branch `rtd/p0-28-docs-truth-reset` (based on `int` at `00dd20325`).

## Environment (local, not CI)

- macOS 26.6.2 (Darwin 25.6.0, arm64), Node v25.5.0, pnpm 10.33.0.
- The recorded runs used a fresh local clone of the branch at `7804800e2`, installed with `pnpm install --frozen-lockfile --offline` and built with `pnpm run build`, with a new temporary `HOME` and a new empty workspace directory. The vault passphrase was a random value passed only through the child environment; it is not recorded. `--no-remember` kept it out of the macOS Keychain.
- Nothing was pushed, published or deployed; no CI job ran.

## `amc start` / `amc up` (README "Assess agent maturity")

`runs/up-1.txt`, `runs/down-1.txt`, `runs/up-2.txt`, `runs/down-2.txt` and `runs/probes.json`. `amc start` is an alias of `amc up` (`node dist/cli.js up --help` prints `Usage: amc up|start`).

- `amc up --no-open --no-remember` exited 0. It created the workspace under `.amc/` (keys, vault, signed configuration), started Studio API 3212, gateway 3210, proxy 3211 and dashboard 4173 on 127.0.0.1 (all four listening afterwards; `GET /console` answered 200), printed the console URL and did not open a browser. With no earlier run, it ran the first 8-surface baseline (`amc run`): overall grade F (7/100), 4 of 8 surfaces evaluated, 4 pending, 3 failed.
- `amc down` exited 0 and printed `Sent SIGTERM to studio pid …`; nothing listened on those ports two seconds later.
- A second `amc up` in the same workspace reused it, printed `Latest run: none`, and ran the baseline again (F, 10/100). `src/cli.ts` `latestRunSummary` reads `.amc/agents/<agent>/runs`, while the baseline writes `.amc/runs`; this is a follow-up, not a docs change.

## Compliance commands (README "Compliance evidence")

`runs/compliance-report-iso-42001.txt`, `runs/domain-conformance-health.txt`, `runs/domain-conformance-wealth.txt`, `runs/domain-assess-health.txt`, `runs/audit-binder-create.txt`, in the same new workspace with no agent evidence.

- `amc compliance report --framework iso-42001` exited 0: `Result: not evaluated (no evidence events were recorded)`.
- `amc domain conformance --station health|wealth --agent default --max-evidence-age 30d` exited 0: `PASS 0, FAIL 0, NOT_EVALUATED 163` (health) and `92` (wealth).
- `amc domain assess --agent default --domain health` exited 1 with the Industry Packs locked notice (no license).
- `amc audit binder create --scope workspace --out binder.amcaudit` exited 0. Its claim line says `Evidence: sufficient` for a workspace with no agent evidence; that is a follow-up for the claim-line code, not a docs change.

## Docs-drift guard

- `docs-drift-initial.txt`: the extended `check:docs-drift` on the branch before the promoted-doc fixes (43 failures: 31 unregistered commands, one of them the A4 guide's planned `amc a4 verify`, which is now a logged exception; 12 banned claim words).
- `docs-drift-final.txt`: the same check at `7804800e2`, passing with 4 logged exceptions.
- `mutations.txt`: six mutations, each killed: a hand-typed 142 in the README, "fully certified" and `amc trust decay` in a promoted guide, and three weakenings of the guard (negation always true, subcommand check removed, quote skip always true).

## Moved files

`moved-files.txt` lists the 32 `git mv` renames into `docs/archive/` (none deleted). `readme-before-after.diff` is `git diff int..HEAD -- README.md`.

## Full suite

`npx vitest run` at `7804800e2` (4 workers, while the recorded runs and a clone build ran beside it): 23,297 tests, 23,262 passed, 25 failed, 10 skipped. 23 of the failures are in the int baseline for this environment (jsonlWriterResume 19, dataResidencyPersistence, llmResponsesCapabilities, privateModuleHelperVisibility, and publicDocsArtifact, which needs `.git` to be a directory and fails in any worktree); `studioNativeTaskService` hit a hook timeout. The other two (`amc1473SignedControlLifecycle`, `performance/sessionSpine.performance`) passed when rerun alone (13 of 13). `publicDocsGraph`, failing on int, passes.
