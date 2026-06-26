---
"agent-maturity-compass": minor
---

Add provider/model canary drift benchmarking with fail-closed score, refusal, latency, and cost thresholds plus watch alert and waiver outputs.

Add user-aware agent-quality drift dimensions for progress AUC, progress per turn, pass@k, pass^k, subgoal completion, expected-tool-call coverage, persona coverage, and clustered error-rate analysis so stable headline scores cannot hide multi-turn or user-proxy regressions.

Add standard evaluator-suite drift dimensions for evaluator coverage, guardrail pass rate, score-threshold pass rate, and retry stability so provider/model promotions fail closed when evaluator-library or pytest-style regression coverage weakens despite a stable headline score.
