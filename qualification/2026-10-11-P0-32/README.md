# P0-32 · Close-out C: Done notes for nine old issues and PR #22

This receipt applies the Done contract to seven AMC-1505 children and two June audit issues. Each issue has a folder with a short Done note. `done-notes.json` holds the same verdicts in machine-readable form.

- **Base commit:** `60d0255c4` (`int`, the parent of branch `rtd/p0-32-done-contract`). Every focused test and check below ran there.
- **origin/main:** `5ea5e866a` (local remote-tracking ref, not refetched). Every issue's own commits are ancestors of it.
- **Environment:** local, not CI. macOS 26.6.2 arm64, Node v25.5.0, pnpm 10.33.0, vitest 4.1.11. The installed import used Homebrew Node 22.23.3.
- **No code changed.** This item adds files under this folder only.

## Verdicts

| Issue | Verdict | Focused tests at `60d0255c4` | Note |
|---|---|---|---|
| AMC-1506 neutral imports | Done | 13/13 | [AMC-1506](AMC-1506/README.md) |
| AMC-1507 Pi v3 import | Done | 31/31 | [AMC-1507](AMC-1507/README.md) |
| AMC-1509 pnpm source install | Done | 8/8, clean-source 15/15 steps | [AMC-1509](AMC-1509/README.md) |
| AMC-1514 provider capabilities | Done | 54/54 | [AMC-1514](AMC-1514/README.md) |
| AMC-1521 test TypeScript gate | Done | 25/25 | [AMC-1521](AMC-1521/README.md) |
| AMC-1522 compaction | Done | 14/14, plus 144/144 spill | [AMC-1522](AMC-1522/README.md) |
| AMC-1531 native parity umbrella | Done | 20/20, quick gate 16/16 executed | [AMC-1531](AMC-1531/README.md) |
| AMC-484 decomposition | Done | 4/4, boundary check exit 0 | [AMC-484](AMC-484/README.md) |
| AMC-482 safe API errors | **Reopen, owner P1-55** | 43/43, plus 209/209 | [AMC-482](AMC-482/README.md) |

Per-file totals and durations are in `focused-tests.json`. The receipt's `tests` field is the sum of those eleven runs (565 passed), not the full suite.

## What "Done" means here

- The issue's commits are ancestors of origin/main.
- Its focused tests pass at the base commit.
- The remaining item P0-32 named for it now has tracked evidence in this repository.

Two notes rest on receipts that are on `int` but not yet on origin/main: AMC-1522 (P0-30) and AMC-1531 (P0-31 and P0-61). This folder sits on top of those receipts, so they reach main in the same merge.

Linear comments and Obsidian notes are not written by agents. Sid mirrors each Done line if he still uses them.

## PR #22

`pr-22.json` holds the read-only `gh` output and the ancestry exit codes.

- PR #22 in AgentMaturity/AgentMaturityCompass is "Complete AMC lifecycle readiness". It was merged on 2026-06-12T19:46:46Z from `codex/amc-install-persona-readiness`.
- Linear's name adds "and flagged fixes". The title search returns only #22.
- It was squash-merged as `2b4e35ffc`. That commit's tree equals the PR head `220887d28`, and its 11 commits include `2a42d6b3`, `a0f3644d` and `07660bdd`.
- `gh pr checks 22`: 9 of 9 checks pass.
- `git merge-base --is-ancestor <sha> origin/main` exits 0 for all three commits. The commits also reached main directly in merge `5ffdd596c` (2026-09-16).
- The only "#22" merge in git history, `ef6bc1a1`, is a different PR: a dependabot TypeScript bump from the earlier `thewisecrab` repository.

## AMC-482 decision and hand-off

AMC-482 reopens, and P1-55 owns the remaining scope.

- **Shipped and tested:** safe 400s and 413s.
- **Still missing:** request-id logging, and a 500 test that proves no exception text reaches the body.
- **For P1-55:** its "Current state" says no 500 test exists and no 413 test exists on another route. That is stale since `aa0870907` (2026-10-05, on main), which added `tests/apiRequestErrorRoutes.test.ts`.
- That file asserts at `:78` that an Error's message is returned in the 500 body. When P1-55 makes 500 bodies generic, it must change that test in the same PR (contract §5.5).

## Evidence sources

- **Reconciliation records:** only AMC-1506, 1507 and 1509 have a 2026-09-14 reconciliation record in candidate commit `37c1466b`. Their facts are summarised in each folder's `reconciliation-summary.json`, with the original blob id and sha256.
  - Those originals are not in main's history. No note uses them as Done evidence unless it measured the fact again here.
- **Files never read:** the other September receipts and records live only in Sid's untracked research folder (`.gitignore:81`). They were not read and are not cited.
- **Docs check:** `git grep -n` for that folder's path under `docs/` finds no doc that cites such a receipt as proof for one of these nine issues. So no doc changed.
- **Drift:** a reused receipt counts only if the code it exercised is unchanged up to the base commit. Each note states that check.

## Line-reference drift from the spec (main @ 8f57ce63)

- The clean-source CI job is now `.github/workflows/ci.yml:269-287`; the spec cites `:222`.
- The boundary check is now `ci.yml:134-135`; the spec cites `:106`. The gate step is now `scripts/release-gate.mjs:263`; the spec cites `:238`.
- `scoreRouteError` is now `src/api/scoreRouter.ts:111`; the spec cites `:110`. The stack assertions are at `tests/apiRouters.test.ts:1308-1309`.

## Files

- `done-notes.json`: per issue, the verdict, merged SHAs, test files and totals, evidence, receipt paths and residual risks with owners.
- `focused-tests.json`: the eleven vitest runs.
- `release-gate-quick.json`: the quick gate's steps, without stdout.
- `pr-22.json`: the PR #22 output.
- `AMC-*/`: one folder per issue.

## Reproduce

```sh
git checkout 60d0255c43f7a54bae88e665e38d326b3232fcd5
pnpm install --frozen-lockfile && pnpm run build
npx vitest run <files listed per run in focused-tests.json>
npm run check:clean-source
npm run check:architecture-boundaries
node scripts/release-gate.mjs --quick --out /tmp/gate.json
gh pr view 22 --repo AgentMaturity/AgentMaturityCompass --json number,title,state,mergedAt,baseRefName,headRefName,mergeCommit,url
gh pr checks 22 --repo AgentMaturity/AgentMaturityCompass
git merge-base --is-ancestor 2a42d6b3 origin/main   # and a0f3644d, 07660bdd
```

The installed import steps are in `AMC-1506/README.md`.
