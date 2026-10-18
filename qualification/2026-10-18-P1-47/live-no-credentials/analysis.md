# P1-47 pilot analysis

No ranking and no superiority factor. Scripted lanes are excluded from every result. Missing measurements are unknown, not zero.

Planned trials: 300 (executed 0, inconclusive 0, unavailable 300).

- unavailable x300: Required named live credentials are unavailable.

## Paired task-level differences

| Lane | Treatment - baseline | Tasks | Mean | 95% CI | Variance |
|---|---|---:|---:|---|---:|
| live | pi-contained-amc - pi-contained | 0 | unknown | unknown | unknown |
| live | amc-native - pi-contained | 0 | unknown | unknown | unknown |
| live | pi-contained-amc-tuned - pi-contained-tuned | 0 | unknown | unknown | unknown |

## Overhead (matched passing pairs)

| Lane | Pair | Pairs | Median | p95 | Median <= 10% | p95 <= 15% |
|---|---|---:|---:|---:|---|---|
| live | pi-contained-amc vs pi-contained | 0 | unknown | unknown | not measured | not measured |
| live | pi-contained-amc-tuned vs pi-contained-tuned | 0 | unknown | unknown | not measured | not measured |

Decision latency: not measured; report.json has no per-decision latency field; see the scripted replay micro-benchmark (overhead.mjs).

## False blocks


Action evidence: not measured; report.json carries no AMC evidence linkage; it needs P1-06's verifier over AMC evidence from real fin-ops trials.

Duplicate effects: not measured.
Dispatch after revocation: not measured; the pilot corpus has no revocation task.

## Cost per correct, policy-compliant outcome

