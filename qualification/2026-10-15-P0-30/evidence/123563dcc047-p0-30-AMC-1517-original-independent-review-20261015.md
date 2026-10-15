# P0-30 AMC-1517 original-corpus independent review

No actionable findings in the assigned original 13-case, controller and restoration scope at source `58e91dcef111bf02f773dcbfd1921d428cf75e34`. All 186 indexed artifacts, 29 frozen phases and 992 unique referenced immutable files verified.

| Guard | Original baseline → mutant → restored | Decisive result |
|---|---|---|
| M20 allowlist | 13 → 12 → 13 | Exact span attributes fail at line19. Later event/count assertions are masked by that first failure. |
| M21 sensitive extension | 13 → 12 → 13 | Explicit extension improperly retains prompt/key attributes at line28. |
| M22 counter exemption | 13 → 12 → 13 | Known input/output token counters disappear at line34. |
| M23 closed guard | 13 → 13 → 13 | Survives only the original restricted corpus, which never calls close or flush. |

Each original phase has the same 13 names, criteria, fixtures, setup, cleanup and deadlines, with zero pending/todo or setup failures. The three private adaptations change only source imports to copied compiled imports. Original and final test/helper bytes match.

Every source mutation is exact-once; its mutated digest and patch reconstruct from the baseline. Actual private tsc commands succeed. Recorded maps show only callbackTelemetryCapture.js changed before each mutant run, after resetting unrelated emitted kernel bytes. All 4,529 compiled files restore exactly. The full private 12,268-file closure, live 7,739 source files, 63 protected pin entries covering 54 unique paths and native physical identity match. Previous AMC-1525/1516 packet bytes, complete closures and frozen physical fixtures remain exact.

The separate private supplement reports 3 → 2 → 3: the two ordinary lifecycle cases survive, while the public-getter case fails. This review checks its hashes, counts, controller and restoration only. I authored those case expectations, so another peer independently reviews their semantic and effect evidence. Its result is separate from original M23 survival; historical expected-equivalent metadata stays unchanged and is not a universal equivalence proof. The intact production guard is not claimed broken.

The current launcher records Node22.23.3 and ABI127; per-original-child ABI remains inferred. The supplemental per-case ABI observations have their own scope. Synthetic callbacks remain unsigned SELF_REPORTED/NOT_EVALUATED. External producer conformance, authenticated identity, all races, other issue controls, the held full batch, Node24, full suite, release and whole P0-30 acceptance remain unqualified.

All live reads are finished. No imports, tests, builds, compiles, syntax checks, network requests, Git commands or input edits occurred. Only this review pair was written.
