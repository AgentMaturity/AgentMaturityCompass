---
"agent-maturity-compass": patch
---

Evidence rows whose `meta.source` is `user`, `inferred`, `numeric_self_answer` or `default` are classified as `manual` evidence, never AMC runtime evidence, so they can never support a positive regulated result. No AMC writer emits these sources on an evidence row today; the labels are used for A4 answer provenance, quick-score self answers and a policy default.
