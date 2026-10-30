# AMC-1509 · pnpm source install works on a clean clone: Done

- **Commits on main:** `2b737b3c` and `3749e1a2`; the reconciliation cites the range up to `79f36cfd`. All are ancestors of origin/main `5ea5e866a` and of the base `60d0255c4`.
- **Focused tests at `60d0255c4`:** `tests/cleanSourceDocs.test.ts` 8/8.
- **Remaining items from P0-32:** a helper-run receipt and one green hosted `clean-source` run. Both are done, see below.

## Local helper run (`clean-source.txt`)

`npm run check:clean-source` at `60d0255c4` exited 0 in 67 s, under Node v25.5.0 on macOS arm64. All 15 steps were ok:

- clone of the committed tree, then checkout of the commit
- `pnpm install --frozen-lockfile`, `pnpm run build`
- `amc doctor`, `amc init`
- a keyless native turn, then the session and agent-loop verifiers
- process A leaves the session open, and process B resumes and seals it
- the verifiers again, with 2-turn reconstruction

## Hosted run (`hosted-clean-source.json`)

- **Job:** the `clean-source` job of CI run [38132701944](https://github.com/AgentMaturity/AgentMaturityCompass/actions/runs/38132701944) (job id `114450140347`) concluded **success**.
- **Commit and time:** main `5ea5e866a`, push event, 2026-10-11T10:39:04Z to 10:40:20Z.
- **Overall run:** concluded failure, because `build-test (22)` failed at "Full suite and coverage thresholds". `clean-source` is a separate job, and that failure is not this issue's.
- **Read with:** `gh run list` and `gh run view`, read-only.

## Other checks

- `git grep -n "build:workspace" -- src` matches nothing (exit 1).
- `3749e1a2` fixed the two stale kernel-missing messages that the September reconciliation listed as defects.

## September reconciliation

`reconciliation-summary.json` summarises the 2026-09-14 record from candidate `37c1466b` (blob `aba10751…`). Its original is not in main's history.

- It found PARTIAL at `6e7875f2`: 13 claims held, 2 did not.
- Its missing items were a tracked receipt, a hosted-run disposition and the two stale messages. All three are now covered.

## Residual risk

- Public npm install of the released package is out of this issue's scope; P0-40 owns it.
