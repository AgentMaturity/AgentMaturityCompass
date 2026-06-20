---
"agent-maturity-compass": patch
---

Add Google ADK-style agent-toolkit evaluation metric-validity boundaries.

AMC now treats live `google/adk-python` GitHub metadata as a source-review signal only: Score, Shield, and Watch metric-validity claims require an AMC-owned eval pack, validation table, evaluator-suite proof through existing primitives, trace-evaluation proof where traces or Watch are claimed, fail-closed thresholds, metric owner, sample size, confidence interval, signed evidence, artifact hashes, row hashes, and no-copy/source-review proof. No Google ADK subsystem, adapter, importer, parity layer, or upstream code/prose/config is added.
