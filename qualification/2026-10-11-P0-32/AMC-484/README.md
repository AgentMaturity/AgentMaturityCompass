# AMC-484 · CLI/API/Studio decomposition boundary: Done

- **Commits on main:** `a0f3644d` and `07660bdd`, both in PR #22. `git merge-base --is-ancestor <sha> origin/main` exits 0 for each, against origin/main `5ea5e866a`.
- **Focused tests at `60d0255c4`:** `tests/architectureBoundaries.test.ts` 4/4.
- **Boundary check:** `npm run check:architecture-boundaries` exited 0 with `failures: []`.
- **Remaining item from P0-32 (confirm PR #22):** done. See `../pr-22.json` and the PR #22 section of `../README.md`.

## PR #22

- **What it is:** "Complete AMC lifecycle readiness" in AgentMaturity/AgentMaturityCompass. It was MERGED on 2026-06-12T19:46:46Z from `codex/amc-install-persona-readiness` into `main`.
- **How it merged:** squash commit `2b4e35ffc`, whose tree equals the PR head `220887d28`.
- **Its 11 commits** include `2a42d6b3`, `a0f3644d` and `07660bdd`. `gh pr checks 22` shows 9 of 9 checks pass.
- **Not to be confused with** `ef6bc1a1`, git's only "#22" merge. That is a dependabot bump from the earlier `thewisecrab` repository.

## Boundary check in CI and the gate

| Where | Location | Result |
|---|---|---|
| CI | `.github/workflows/ci.yml:134-135` (the spec cites `:106`) | Hosted run 38132701944 on main `5ea5e866a`: "Architecture boundary compatibility" succeeded |
| Release gate | `scripts/release-gate.mjs:263` (the spec cites `:238`) | Step `architecture-boundaries` passed in the quick gate at `60d0255c4` |

## Residual risk

- Broader CLI decomposition (AMC-1500) is paused; P2-29 owns it.
