# P2-24 qualification: bound reviews, scoped exceptions, signed break-glass

Local run on the branch `rtd/p2-24-bound-reviews`. The receipt names the commit it covers.

- `table-coverage.json`: each row of the issue's test table, with the test that covers it. All rows pass.
- `mutations.json`: thirteen guard mutations, each applied alone, the named test file run, and the source restored. Every mutation made at least one test fail. They include the three the issue names: M1 (skip the digest comparison in `reviewStatusFor`), M2 (restore an unsigned fallback in `publishSignedRecord`) and M3 (let break-glass bypass the freeze).
- Red on base `6ddbcadfb`: the four new test files fail there, because `src/governor/scopedExceptions.ts`, `src/governor/breakGlass.ts` and `src/approvals/reviewRecords.ts` do not exist. The legacy unsigned-override row already passed on base, because P0-10 refuses unsigned overrides in both stores.

These are local fixture runs with fixture reviewer ids, keys in temporary directories and no external service. They show the enforcement logic on this machine. They are not a review by a named human and not a compliance verdict.

Known pre-existing failures, unchanged by this item:

- `npm run check:architecture-boundaries`: `src/vault/vault.ts` is 803 lines on base.
- `node scripts/check-freeze.mjs`: the base baseline does not yet allow the P2-09, P2-30 and P3-14 freeze exceptions named by other changesets. This item adds no command path.
