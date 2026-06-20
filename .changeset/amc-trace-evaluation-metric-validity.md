---
"agent-maturity-compass": patch
---

Add trace-derived agent-evaluation metric-validity proof for Bedrock-style agent quality loops.

Metric-validation reports now support optional `traceEvaluationChecks` plus `requireTraceEvaluationProof`. When required, AMC fails closed unless the row binds signed evidence for model config, agent parameters, tool registry, trace manifest, repeatable cases, dynamic validators, bulk runs, run permutations, mocked LLM controls, metric definitions, measurement exports, production monitor bindings, threshold alarms, owner, sample size, confidence interval, and row hashes.
