# P1-47 pilot analysis

No ranking and no superiority factor. Scripted lanes are excluded from every result. Missing measurements are unknown, not zero.

Planned trials: 100 (executed 100, inconclusive 0, unavailable 0).


## Paired task-level differences

| Lane | Treatment - baseline | Tasks | Mean | 95% CI | Variance |
|---|---|---:|---:|---|---:|

## Overhead (matched passing pairs)

| Lane | Pair | Pairs | Median | p95 | Median <= 10% | p95 <= 15% |
|---|---|---:|---:|---:|---|---|

Decision latency: not measured; report.json has no per-decision latency field; see the scripted replay micro-benchmark (overhead.mjs).

## False blocks

- scripted (not a result) scripted/amc-native: 12/34 (35.3%), gate <= 1%: not met
- scripted (not a result) scripted/pi-contained: 0/54 (0.0%), gate <= 1%: met
- scripted (not a result) scripted/pi-contained-amc: 54/54 (100.0%), gate <= 1%: not met
- scripted (not a result) scripted/pi-contained-tuned: 0/54 (0.0%), gate <= 1%: met
- scripted (not a result) scripted/pi-contained-amc-tuned: 54/54 (100.0%), gate <= 1%: not met

Action evidence: not measured; report.json carries no AMC evidence linkage; it needs P1-06's verifier over AMC evidence from real fin-ops trials.

Duplicate effects: not measured.
Dispatch after revocation: not measured; the pilot corpus has no revocation task.

## Cost per correct, policy-compliant outcome

