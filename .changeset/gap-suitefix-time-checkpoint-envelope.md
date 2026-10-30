---
"agent-maturity-compass": patch
---

`amc verify` and the JSONL/Postgres writers no longer refuse honest history that contains signed `time/checkpoint` rows. Envelope admission (WP17a) treated every slash-typed row without a session envelope as unsupported native evidence, but time checkpoints are operational rows written outside any session, like wire `work/accepted` intake. Native session rows without an envelope are still refused.
