# Eval suites: task suites against the native agent

`amc eval suite` runs a suite of tasks through AMC's own governed agent, grades every attempt, and gates a run against a baseline. Every attempt is one signed native session; everything graded or counted is read back from verified rows, never from the runner's word. The shipped example is `examples/eval-suites/stub-smoke/suite.yaml`.

```
amc eval suite run <suite.yaml> [--provider stub|<id>] [--model <m>] [--attempts <n>] [--tasks a,b] [--out results.json] [--agent <id>] [--unsafe-unconfined-graders] [--keep-dirs] [--json]
amc eval suite baseline <results.json> --out baseline.json
amc eval suite compare <baseline.json> <results.json> [--gate gate.json] [--json]
```

## Suite file (`amc.eval-suite/v1`)

```yaml
version: 1
suiteId: stub-smoke
defaults: { tools: none, maxSteps: 8, allowedActionClasses: [READ_ONLY, WRITE_LOW], timeoutMs: 300000 }
tasks:
  - id: echo-exact
    prompt: "The answer is 42."
    graders:
      - { type: contains, expected: "42" }
  - id: answer-file
    prompt: '{"tool":"fs.write","arguments":{"path":"{{taskDir}}/answer.txt","content":"42\n"}}'
    tools: workspace
    fixture: { dir: fixtures/answer-file }   # relative to the suite file, never outside it
    outputs: [answer.txt]                     # the only attempt files the graders may see
    graders:
      - { type: tests, command: ["node", "check.mjs"] }
```

Graders:

| Type | Input | Verdict |
| --- | --- | --- |
| `exact` (`normalize`: `trim`, `whitespace`, `none`), `contains`, `not_contains` (`caseSensitive`), `regex` (`pattern`, `flags`) | the attempt's last assistant text block, read from the verified rows with a digest check | `pass` / `fail`; `error` when the text cannot be read as committed (a pruned payload never passes `not_contains`) |
| `script` (`command`, `passExitCode`, `timeoutMs`), `tests` (`command`, `timeoutMs`; exit 0 passes) | a fresh directory restored from the fixture snapshot taken at load time plus the task's declared `outputs` copied from the attempt (plain files only) | the command's exit status; `error` on timeout or when no sandbox backend can confine it |
| `llm_judge` | refused by the schema | deferred (D-12): a judge must run as a signed, budgeted native session, which this build does not offer |

`{{taskDir}}` in a prompt is replaced with the attempt directory relative to the workspace, so a governed `fs.*` call can address it.

## What an attempt is

Each attempt opens one fresh session through the experiments' trial runner (`openAgentSession`, the ToolPipeline, a wall-clock limit with abort grace; a session that does not seal is never a completed attempt) under agent id `eval-suite` by default, with the suite's or task's `tools` and `allowedActionClasses`. Every row carries a `caseExecution` stamp (`casebookId: eval-suite:<suiteId>`, `caseId`, `trialId: <runId>:<taskId>:<attempt>`), so the attempt's usage and cost are read back with `collectTrialReceipts` from verified rows. A deny-only guard refuses any `fs.*` path outside the attempt directory and refuses the shell, so attempt 2 cannot read attempt 1's files or the suite file. Governed tool calls run at the mode the workspace's signed Action Policy grants: with the default policy and no trusted sealed run, writes are SIMULATE (docs/GOVERNOR.md "Reaching EXECUTE"), so a repository task cannot produce its outputs; the runner then records the attempt as `error` with that reason rather than a `fail` the graders never saw. Attempt directories live under `workspace/output/amc-eval/<runId>/`, the only area the shipped `fs.write` / `fs.edit` allowlist permits (anywhere else the allowlist would deny every write before the eval guard is reached), and are deleted after grading unless `--keep-dirs`.

Command graders run through `SandboxRunner` (Seatbelt on macOS, Bubblewrap on Linux) with the grading directory as the only writable root, network denied, `~/.ssh`, `~/.aws`, `~/.config/gcloud`, the workspace's `.amc` and the attempt directory unreadable, and a process cap. With no backend the grader result is `error` ("unconfined grader refused"); only `--unsafe-unconfined-graders` on the command line runs it with the operator's full user rights, and the result then records `confined: false`. A suite file can never grant that.

## Results, scores and evidence

`results.json` (`amc.eval-results/v1`) holds the suite digest, every fixture file's digest, the provider and model, per attempt the session id, outcome, verdict (`pass` / `fail` / `error`), each grader's result, duration, usage and cost, and per task `passes/attempts`, a Wilson 95 % interval and `pass@1..pass@n` by the unbiased estimator `1 - C(n-c, k)/C(n, k)`. The summary gives the pass rate over attempts, the task pass rate (tasks whose every attempt passed), latency p50/p95 and cost, which is a number only when every attempt's cost projection was complete; the stub's cost is `unavailable`, never zero. The results digest is recorded in a signed `EVAL_SUITE_RUN` audit row. Runs are refused under `AMC_NO_SIGN=1`.

Eval sessions are OBSERVED native rows like any other session; they run under the `eval-suite` agent so they do not feed another agent's evidence unless `--agent` says so.

## Baselines and gates

`baseline` reduces a results file to per-task counts and records the baseline digest in a signed `EVAL_SUITE_BASELINE` row. `compare` returns `pass` (exit 0), `fail` (1) or `inconclusive` (2). It is inconclusive, never a pass, when the results or baseline file digest is not in the verified ledger (an edited file), when the suite digest changed (`requireSameSuite`, default true), when a task has fewer than `minAttemptsPerTask` attempts on either side, when a task had grader errors, or when a cost gate is set and cost is unavailable on either side. A task regressed when its baseline Wilson lower bound lies above its current upper bound, so a task that passes 90 % of attempts is not flagged by one unlucky run of three. Gate file:

```json
{ "minPassRate": 0.9, "maxRegressedTasks": 0, "minAttemptsPerTask": 1, "requireSameSuite": true, "maxCostIncreaseRatio": 1.1 }
```

## Limits

- Attempts run one at a time (D-10). Each attempt scans the verified ledger for its rows; large workspaces pay for that.
- The stub provider proves the grading path, not model quality. Live providers need the workspace's configured route and credentials; nothing here calls a paid API by itself.
- No `llm_judge`, no Docker isolation for repository tasks (D-09), no suite import from promptfoo or OpenAI evals (D-11).
