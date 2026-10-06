# P0-01 qualification receipt

Checks run on 2026-10-05 against commit `557059970c5304750b9bf7ccaa5c5bed624d2895` on branch `rtd/p0-01-contract-receipts-freeze`, based on `origin/main` at `786d8abb2a12b82d0986c3a286864d7966d21166`. Toolchain: Node v25.5.0, pnpm 10.33.0, macOS arm64. `receipt.json` lists each command, its exit code and its duration.

## What was checked

- The focused tests for the freeze guard and the receipt validator passed. They failed first with "Cannot find module" before the scripts existed (commit `b546302b`).
- Every step of the CI `build-test` job, the clean-source, packed-install and e2e-smoke jobs, and `npm run release:gate`. The full suite under coverage: 21443 of 21443 tests passed in 1,524 files. Per-file coverage floors passed.
- Three steps exit non-zero, exactly as on `main` at `786d8abb`: `check:duplicates` and `check:dead-code` (existing findings; report-only in CI until decision D-11) and `release:gate` (17 of 19 checks passed; the two failures are those source-quality checks).
- `npm run check:freeze` passed with only the exact check: `origin/main` has no `scripts/freeze-baseline.json` yet. The baseline was written by `node scripts/check-freeze.mjs --write-baseline` while `HEAD` was detached at `786d8abb`, and `allowedExceptionKeys` was then filled in from the issue.

## Mutation checks

1. The base-baseline comparison in `evaluateFreeze` was removed (`raised` forced to an empty list). Three tests in `tests/freezeGuard.test.ts` failed: "a raised baseline without the freeze-exception line fails", "an exception key the base does not allow fails, even if the PR allows it" and "an exception line without a reason fails". After the code was restored, all tests passed.
2. The 1,048,576-byte size check in `scripts/check-qualification-receipts.mjs` was removed. "a file over 1,048,576 bytes fails" in `tests/qualificationReceipts.test.ts` failed. After the code was restored, all tests passed.

3. One export was added to `package.json`. The four restoration parity tests that now pin package entries (commit `cbb0dcdb`) all failed. After `package.json` was restored, they passed.

## Review fixes

Seven regression tests were added for the review findings (commit `3b8f6a06`). They failed on that commit before the fix in `cc9efbc3`, with 7 failed and 27 passed:

- On push, a baseline raise in an earlier commit of a multi-commit push passed (exit 0). The base was `HEAD^1` instead of the pre-push tip.
- `--counts-json` with missing or non-numeric counts passed (exit 0).
- A dangling symlink threw `ENOENT`, and an artifact path naming a directory threw `EISDIR`.
- A symlinked artifact pointing outside the folder validated.
- A backslash artifact path was reported as missing rather than outside the folder.
- A receipt dated 2026-02-30 validated.

## Reproduce

```
pnpm install --frozen-lockfile && pnpm run build
npx vitest run tests/freezeGuard.test.ts tests/qualificationReceipts.test.ts
npm run check:freeze && npm run check:qualification
```
