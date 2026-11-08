---
"agent-maturity-compass": minor
---

Eval suites against the native agent (SH-OBS-04): `amc eval suite run <suite.yaml> --provider stub|<id> --attempts <n> --out results.json`, `amc eval suite baseline`, `amc eval suite compare --gate gate.json`.

Tasks run through the governed trial runner as stamped signed sessions; an attempt may call only the file tools (each confined to its attempt directory by an explicit `path`) and session-bound tools, so it cannot read the suite file or another attempt's outputs. Graders are `exact`, `contains`, `not_contains`, `regex` over the attempt's final text read from verified rows, and `script` / `tests` over a pristine fixture copy plus declared outputs under the OS sandbox: Bubblewrap on Linux; on macOS the write-only Seatbelt profile refuses them, and `--unsafe-unconfined-graders` runs them unconfined, graded by exit status and recorded `confined: false`. An `error` attempt is neither a pass nor a fail: rates and `pass@1..g` (unbiased estimator, Wilson intervals) run over graded attempts. The results and baseline digests are recorded in signed `EVAL_SUITE_RUN` / `EVAL_SUITE_BASELINE` rows; `baseline` only accepts a recorded run; `compare` is inconclusive on an edited file, a changed suite or fixture, a baseline task the run skipped, grader errors that could decide the rate, unavailable cost, or attempt counts too small to separate even a total regression (4 graded per side at 95 %). `llm_judge` is refused (deferred D-12). Example suite: `examples/eval-suites/stub-smoke/`.

freeze-exception: SH-OBS — `eval suite run`, `eval suite baseline` and `eval suite compare` are new commands of the state-of-the-art harness program.
