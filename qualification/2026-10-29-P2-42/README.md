# P2-42 receipts (2026-10-29, branch rtd/w5-p2-42, base 88f77309b)

- `red-first.txt`: tests/a4/p242ShippedCatalog.test.ts on the base code: every journey refused at `POST …/stages/adapt/propose` with 413 INPUT_TOO_LARGE.
- `spec-sizes.txt`: stored Adapt row sizes per station after the fix, against the same spec with the plan inline (the base shape).
- `suite-run1.txt`: tests/a4 plus every test file importing src/a4 and the pinned suites: 49 files, 580 tests passed (Node 22, --maxWorkers=2).
- `p242-final.txt`: the P2-42 file (7 tests) and scenario 06 after the mutation runs.
- `mutations.txt`: nine guard mutations, each killed by the P2-42 tests; the source was restored after each.
- `checks.txt`, `checks-final.txt`: lint, check:gates, dead-code, duplicates, counts, api-ref, docs-drift, schemas, architecture-boundaries all exit 0.

Follow-up (all seven stations, resolved view):
- `red-first-seven-stations.txt`: with only the plan bound by digest, the all-seven project got 413 at Review and the resolved-view test failed.
- `spec-sizes-v2.txt`: stored vs resolved row sizes with every catalog-sized part bound (one station, and all seven: 14.6 KiB stored at Review, 809.4 KiB resolved).
- `suite-run2.txt`: tests/a4, every test importing src/a4, the console-asset tests, the pinned suites and wormSideTables: 101 files, 1048 tests passed.
- `mutations-v2.txt`: nine more mutations (kind-for-place, json parts, stateOf check, both revision routes), each killed.
- `checks-v2.txt`: every check exits 0; `p242-final-v2.txt`: the P2-42 file (9 tests) after the mutation runs.
