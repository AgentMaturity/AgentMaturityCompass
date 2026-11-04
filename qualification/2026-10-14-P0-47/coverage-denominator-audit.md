# P0-47 canonical coverage denominator audit — 14 October 2026

The existing 7a81 report covers exactly 2,169 tracked canonical source files. It has no missing or unexpected source inventory entries, no paths outside this checkout’s `src/`, no untracked temporary modules and no nested test fixtures. Production `src/` has no diff from accepted main5ea to7a81. The coverage configuration, per-file checker and baseline hashes are unchanged from accepted main. No new test or coverage run was performed.

The baseline has 1,901 files; every one remains measured. The report adds 268 current source files. The independent count reconstruction matches 924 failing metric rows across 289 files: 565 rows in154 new files and359 rows in135 existing files. There are37 existing failing rows with the same denominator and fewer covered hits, so aggregate gains do not eliminate actual per-file regressions.

| Function group | Covered / total | Coverage |
|---|---:|---:|
| baseline existing | 21552 / 27558 | 78.21% |
| current existing | 21738 / 27655 | 78.60% |
| current new | 944 / 3862 | 24.44% |

The measured 22,682/31,517 functions yield71.96%, below the unchanged75% floor. At a fixed denominator, at least956 additional covered functions would be required. This is arithmetic, not a prediction that narrow correctness fixes will produce them. A4 alone records10/1,480 functions covered and144 failing metric rows across38 of its39 files. Those are real retained-source inputs; this audit authorizes neither source exclusion nor resumption of held/paused A4 work. The CLI also records0/1,225 functions; child-process behavior checks need not be visible in this parent-process V8 report, and existing successful black-box behavior is not automatically instrumented coverage.

The preserved P0-33 full profile measured a different source and additionally includes `packages/verifier/src`: 2,240 files and72.89% functions, itself below75%. Its durable receipt retains880 per-file failures. It supplies no passing coverage result that can be carried over.

The baseline’s recorded source tree `7b1f772cb7b3abc866658026ed7f6bc07d0bc382` is not locally available in the four inspected checkouts. Source-byte identity with that historical tree therefore remains unverified. The committed count baseline and current canonical inventory are verified. No refs were fetched or changed.

The JSON companion contains exact counts, all924 metric-failure rows, denominator groups, file hashes and report hashes. Keep thresholds, instrumentation scope, baseline and freeze checks unchanged. Current P0-47 completion cannot be claimed from this report.
