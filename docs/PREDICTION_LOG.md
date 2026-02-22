# PREDICTION_LOG.md Pattern

Use `.amc/PREDICTION_LOG.md` to record prediction confidence and resolved outcomes.

Canonical table format:

```md
| ts | agent | prediction_id | predicted | confidence | actual | correct | evaluator | run_id | score |
|---|---|---|---|---|---|---|---|---|---|
| 2026-02-18T00:00:00Z | agent-a | p-1 | success | 0.82 | success | true | evaluator-1 | run-1 | 78 |
| 2026-02-19T00:00:00Z | agent-a | p-2 | fail | 0.35 | success | false | evaluator-2 | run-1 | 74 |
```

Accepted aliases in headers:
- `ts` / `timestamp` / `date`
- `agent` / `agent_id`
- `prediction_id` / `id`
- `predicted` / `predicted_outcome`
- `actual` / `actual_outcome`
- `correct` / `was_correct`
- `evaluator` / `rater`
- `run_id`
- `score` / `amc_score`

Notes:
- `confidence` accepts `0..1`, percent format (`82%`), or `0..100` numeric.
- `correct` can be omitted; if omitted, it is inferred when both `predicted` and `actual` are present.
- `score` is optional but required for inter-rater reliability, score stability, and drift metrics.
