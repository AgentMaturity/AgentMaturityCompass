---
"agent-maturity-compass": patch
---

Add `amc demo run --no-vault` / `--demo` so first-time users and sales engineers can run the live gateway demo without preparing or unlocking the current workspace vault. The no-vault path uses an ephemeral demo workspace and labels output `DEMO_ONLY` so it is not confused with production audit evidence.
