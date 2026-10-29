# P2-41 receipt (2026-10-29)

Base cafe5751f, branch rtd/w6-p2-41.

- Red first: with only the test edits, scenario10 (expected [409, A4_ON_HOLD], received [409, A4_NOT_READY]) and all
  five scenario13 tamper cases (detail was the problem list, not the BLOCKED verdict) failed: 6 failed of 7.
- Green: after the assertAllowed and readiness changes, 7/7. Each guard's removal is the red state above (mutation check).
- Suite: tests/a4 plus every other test file touching a4Gates/a4Router/a4Openapi: 42 files, 567 tests passed (tests.txt).
- build, typecheck, typecheck:tests, lint, check:gates, check:dead-code, check:duplicates (new 0), check:counts,
  check:api-ref, check:docs-drift: all exit 0 (files beside this one).
- No new CLI command, audit type, deletion site or signing path.

## Follow-up: integrity problems before membership (same branch)

- Red: scenario13 with the new assertions on the previous tip's source: 8 failed of 9 (followup-red.txt).
- Green: 9/9 after the sendA4Error change (followup-green.txt).
- Mutations (followup-mutations.txt): (1) no central detail override: 7 of 8 failed; (2) verify back to 403 when the
  member rows fail: 1 failed; (3) ZodError detail re-added: survived, as the central override replaces any
  A4_INTEGRITY_FAILED detail (an equivalent mutant); the parse-issue message is covered by the head-row test, which
  failed on the old source.
- Suite: 44 files, 588 tests passed (tests.txt; tests/a4 plus every file touching a4Gates, a4Router, a4Openapi and the
  MCP A4 tools, and tests/a4PostgresMirror.test.ts).
- build, typecheck, typecheck:tests, lint, check:gates, check:duplicates, check:counts, check:api-ref,
  check:docs-drift: exit 0. check:dead-code first flagged the exported A4_INTEGRITY_VERDICT; it is module-local now and
  the rerun is exit 0 (followup-checks.txt).
