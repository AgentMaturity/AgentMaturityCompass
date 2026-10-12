# AMC-1514 · Provider capability and tool-name admission: Done

- **Commits on main:** `e7900221` and `9b60d86f`. Both are ancestors of origin/main `5ea5e866a` and of the base `60d0255c4`.
- **Focused tests at `60d0255c4`:** 54 passed, 0 failed.
  - `tests/providerToolNameBinding.test.ts` 16/16
  - `tests/providerToolNames.test.ts` 25/25
  - `tests/agentLoopRetry.test.ts` 13/13
- **Remaining item from P0-32 (records only):** done. This note and `../focused-tests.json` are the records.

## Evidence

- **Tracked keys:** the tracked-key rewrite belonged to P0-07, which landed as PR #37 (`df89603b`, on origin/main). After this run, `git status --porcelain` was empty, so these tests no longer rewrite tracked `.amc/keys`.
- **Installed tarball (P0-30):** `../../2026-10-11-P0-30/installed-subset.json` records an installed run.
  - The CLI advertised `amc_fs_read_<digest>`, `glob` and `grep`.
  - The model then called the unadvertised name `fs_write`. The turn ended with no tool call and no file, and `amc agent-loop verify` returned ok.
  - The empty, digest-mismatch and MCP-identity subsets were refused before any provider request.
- **Drift since that run (`910a63ba`):** only `200e6647d` (P0-59) touched the provider path. It changes the budget-refusal code in `src/llm/adapter/llmRuntime.ts`, not tool-name binding.

## September record

The candidate holds no reconciliation record for AMC-1514. Sid's untracked copy was not read.

## Residual risk

None open. P0-07 covered the tracked-key rewrite.
