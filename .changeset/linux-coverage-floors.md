---
"agent-maturity-compass": patch
---

Contributor tooling only, no runtime change: the per-file coverage ratchet accepts measured per-platform floors. Its baseline was measured on macOS, where Seatbelt, keychain and native PTY tests run; on Linux CI those tests are platform-gated, so 12 files cover fewer lines and the `Per-file coverage floors` step failed on the first `build-test` to finish since 2026-09-16. `scripts/quality/coverage-baseline.json` now records Linux floors for those 12 files, taken from CI run 37483109284. The macOS floors are unchanged.
