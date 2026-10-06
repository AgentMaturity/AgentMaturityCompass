---
"agent-maturity-compass": patch
---

Contributor tooling only, no runtime change: the per-file coverage ratchet accepts measured per-platform floors. Its baseline was measured on macOS, where Seatbelt, keychain and native PTY tests run; on Linux CI those tests are platform-gated, so 12 files cover fewer lines and the `Per-file coverage floors` step failed on the first `build-test` to finish since 2026-09-16. `scripts/quality/coverage-baseline.json` now records Linux floors for those 12 files, taken from CI run 37483109284. The macOS floors are unchanged.

CI also runs `tests/performance/` in its own step, without coverage and one file at a time. Their throughput floors hold for uninstrumented code with the CPU to itself; under coverage, with every test worker busy, the 500 ev/s session-spine control-plane floor measured 477–496 ev/s on hosted runners and failed `build-test (24)` at random. The coverage run excludes those four files.
