# P3-24 qualification: a4-record as its own conformance class

Commit `28f1b30ef` on `rtd/w4-p3-24` (base `e95619acb`). `receipt.json` lists every command with its exit code and
duration; `checks.txt` holds the tail of each command's output.

## Result

- `amc-conformance run --class a4-record` with AMC's `amc a4 verify`: 7/7 normative cases pass, conformant. These are
  AMC's own runs of its own code, so they are self-reported evidence of conformity.
- `--class verifier` with `amc-verify`: 61/61, and its fixture-set digest equals the committed
  `spec/conformance/results/amc-verify-0.1.0.json`, so the verifier class is unaffected.
- Conformance, verifier-conformance and ACS conformance tests: 96 passed, 7 skipped (the Claude Code 2.1.296 hook
  suite, gated on that binary; skipped on base too), 0 failed.
- `check:freeze` exits 1 on this branch and on base `e95619acb` alike: the exception keys of other items are not yet in
  `allowedExceptionKeys`. P3-24 adds no CLI command, so it needs no freeze exception.

## Red and green

With the `a4-record` entry removed from `CLASS_RULES` (the base runner), `--class a4-record` is a usage error and five
of the seven tests in `tests/conformance/a4RecordClass.test.ts` fail; with it, all 8 pass.

## Mutation checks (each restored afterwards)

| Mutation in `packages/amc-conformance/lib/classes.mjs` | Test that fails |
| --- | --- |
| M1: never compare dimension statuses | `ignore-sod fails A4R-003` |
| M2: skip the verifier-report schema check | `unlisted-member fails A4R-001` |
| M3: do not drop the claim fields beside the report | `AMC's own amc a4 verify passes every case` |
| M4: no `a4-record` class rules | five tests (red above) |
| M5: never check expected reason codes | `no-codes fails A4R-004` |
