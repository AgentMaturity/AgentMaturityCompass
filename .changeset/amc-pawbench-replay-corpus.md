---
"agent-maturity-compass": patch
---

Add PawBench-style model-harness replay receipts for replay benchmark corpora.

Replay rows can now bind model id, harness id, task id/source, task taxonomy, grading mode, prompt/workspace/timeout/task metadata hashes, grader or judge rubric proof, transcript and metrics artifacts, submission and slice payloads, replay command, result-version path, deterministic seed, task count, preservation artifacts, signed evidence, and row hashes. Missing model-harness replay evidence fails closed through the manifest, CI receipt, Shield verification, and Watch alerts.
