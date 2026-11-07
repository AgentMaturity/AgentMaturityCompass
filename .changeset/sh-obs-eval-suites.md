---
"agent-maturity-compass": minor
---

Eval suites against the native agent (SH-OBS-04): `amc eval suite run <suite.yaml> --provider stub|<id> --attempts <n> --out results.json`, `amc eval suite baseline`, `amc eval suite compare --gate gate.json`.

Tasks run through the governed trial runner as stamped signed sessions; graders are `exact`, `contains`, `not_contains`, `regex` over the attempt's final text read from verified rows, and `script` / `tests` over a pristine fixture copy plus declared outputs under the OS sandbox (refused when no backend can confine them unless `--unsafe-unconfined-graders`). Results carry per-task `pass@1..n` by the unbiased estimator and Wilson intervals; the results and baseline digests are recorded in signed `EVAL_SUITE_RUN` / `EVAL_SUITE_BASELINE` rows and `compare` is inconclusive on an edited file, a changed suite, too few attempts or unavailable cost. `llm_judge` is refused (deferred D-12). Example suite: `examples/eval-suites/stub-smoke/`.

freeze-exception: SH-OBS — `eval suite run`, `eval suite baseline` and `eval suite compare` are new commands of the state-of-the-art harness program.
