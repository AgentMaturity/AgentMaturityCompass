---
"agent-maturity-compass": patch
---

Use exit codes 0 for passing experiment/comparison outcomes, 1 for qualified failures or fatal errors, and 3 for unavailable or inconclusive outcomes. Label fatal errors separately, and keep simulated architecture comparisons inconclusive.

Add `--check` and `--dry-run` flags to the existing `bench harness-compare` command. These validate the manifest, file pins, bounded fixture reads, placeholders, environment and named credentials, then preview trial order without executing adapters, oracles or models or writing results. Report partial check credit separately from all-pass trial rates, and retain bounded failure classes with safe, redacted diagnostics.

Prevent observability bridge usage totals from counting aggregate parent spans or repeated span identities twice. Reuse native usage measurement rules, distinguish reported and estimated costs, and expose incomplete usage totals.
