---
"agent-maturity-compass": patch
---

`amc spill` and `amc session anchor` no longer refuse an empty `AMC_EXPECTED_MONITOR_FINGERPRINT` (a chart, Compose `.env` or `docker run -e` with no pin yet): every reader treats an empty value as unset, as the session readers already did. An explicit empty `--expect-monitor ""` is still refused.
