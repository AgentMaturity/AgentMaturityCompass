# P0-01 qualification receipt

Checks run on 2026-10-05 against commit `0814d82564218de203089440992badb6f07b588f` on branch `rtd/p0-01-contract-receipts-freeze`, based on `origin/main` at `786d8abb2a12b82d0986c3a286864d7966d21166`. Toolchain: Node v25.5.0, pnpm 10.33.0, macOS arm64, with `dist/` built by `pnpm run build`. `receipt.json` lists each command, its exit code and its duration.

## What was checked

- The focused tests for the freeze guard and the receipt validator: 27 tests, all passed. They failed first with "Cannot find module" before the scripts existed (commit `b546302b`).
- `npm run check:freeze` passed with only the exact check: `origin/main` has no `scripts/freeze-baseline.json` yet, so it has no base baseline to compare with. The baseline was written by `node scripts/check-freeze.mjs --write-baseline` while `HEAD` was detached at `786d8abb`, and `allowedExceptionKeys` was then filled in from the issue.
- `npm run check:qualification`, typecheck, typecheck:tests, lint, check:counts, check:docs-drift and check:architecture-boundaries all exited 0. The full suite is not part of this receipt.

## Mutation checks

1. The base-baseline comparison in `evaluateFreeze` was removed (`raised` forced to an empty list). Three tests in `tests/freezeGuard.test.ts` failed: "a raised baseline without the freeze-exception line fails", "an exception key the base does not allow fails, even if the PR allows it" and "an exception line without a reason fails". After the code was restored, all tests passed.
2. The 1,048,576-byte size check in `scripts/check-qualification-receipts.mjs` was removed. "a file over 1,048,576 bytes fails" in `tests/qualificationReceipts.test.ts` failed. After the code was restored, all tests passed.

## Reproduce

```
pnpm install --frozen-lockfile && pnpm run build
npx vitest run tests/freezeGuard.test.ts tests/qualificationReceipts.test.ts
npm run check:freeze && npm run check:qualification
```
