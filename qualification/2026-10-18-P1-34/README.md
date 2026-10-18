# P1-34 receipt: catalog content governance and currency reviews

Environment: local macOS 26.6.2 arm64 (Darwin 25.6.0), Node v22.23.3, pnpm 10.33.0. Not CI. Branch
`rtd/p1-34-catalog-governance`, run at `9d632e411` after `int` (`3c23d1c50`) was merged in. `receipt.json` lists every
command with its exit code and duration.

The spec asks for no receipt; this one records the mutation checks, the comparison with `int` and the checks after the
independent review's seven findings. Nothing here is a review: every catalog record is still `experimental`, D-08 has
named no expert, and docs/catalog/GOVERNANCE.md is a draft awaiting Sid's approval.

## What was checked

- All sixteen commands in `receipt.json` exit 0, including `check:freeze -- --base-ref int`, the duplicate and
  dead-code ratchets, `check:catalog-currency -- --as-of 2027-01-15` (0 errors, 3 register status-review warnings,
  15 re-verify items open, 0 review records) and `check:catalog-changelog -- --base-ref int`.
- `focused-tests.json`: 129 files, 1080 tests, 1079 passed. The one failure is
  `tests/trust/embeddedKeyForgery.test.ts` timing out at 30 s under a load average of 24 to 28; alone with a longer
  timeout it passes. The full suite was not run here.
- `mutations.json`: 68 mutations, one per guard, each killed by the test it names (the loader mutation fails its test
  file at load). They cover the review-record format, every verification step in effectiveSupport, the quorum, the pure
  supportStanding and compilePlan's promotions input, the server clock, the routed views (compile, activation, A4,
  OSCAL), the report, the cadence rules, the changelog guard, the re-verify list and the catalog-review purpose rule.
- `int-comparison.json`: the catalog's load issues, its warnings (P1-18's `CAT_NO_REGISTER_ENTRY`) and six compiled
  fixture plans are identical under `int`'s code and this branch's. For all 62 shipped controls the shown review status
  equals the record's (`experimental`/`pending`), so sealed A4 conformance statements recompute identically.

## Not evaluated

Real review records, the D-08 roster and pinned reviewer keys do not exist, so no positive path ran against real
people. `scripts/check-catalog-currency.mjs` itself is exercised by running it, not by an in-process test; its
`git log --follow` author lookup has no test.
