# P2-41 receipt (2026-10-29)

Base cafe5751f, branch rtd/w6-p2-41.

- Red first: with only the test edits, scenario10 (expected [409, A4_ON_HOLD], received [409, A4_NOT_READY]) and all
  five scenario13 tamper cases (detail was the problem list, not the BLOCKED verdict) failed: 6 failed of 7.
- Green: after the assertAllowed and readiness changes, 7/7. Each guard's removal is the red state above (mutation check).
- Suite: tests/a4 plus every other test file touching a4Gates/a4Router/a4Openapi: 42 files, 567 tests passed (tests.txt).
- build, typecheck, typecheck:tests, lint, check:gates, check:dead-code, check:duplicates (new 0), check:counts,
  check:api-ref, check:docs-drift: all exit 0 (files beside this one).
- No new CLI command, audit type, deletion site or signing path.
