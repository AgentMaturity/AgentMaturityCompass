# Eval suites: task suites against the native agent

`amc eval suite` runs a suite of tasks through AMC's own governed agent, grades every attempt, and gates a run against a baseline. Every attempt is one signed native session; everything graded or counted is read back from verified rows, never from the runner's word. The shipped example is `examples/eval-suites/stub-smoke/suite.yaml`.

```
amc eval suite run <suite.yaml> [--provider stub|<id>] [--model <m>] [--attempts <1-10>] [--max-steps <1-1024>] [--tasks a,b] [--out results.json] [--agent <id>] [--unsafe-unconfined-graders] [--keep-dirs] [--json]
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
| `script` (`command`, `passExitCode`, `timeoutMs`), `tests` (`command`, `timeoutMs`; exit 0 passes) | a fresh directory restored from the fixture snapshot taken at load time plus the task's declared `outputs` copied from the attempt (plain files only) | the command's exit status; `error` on timeout, or when no sandbox backend can enforce the grader policy and `--unsafe-unconfined-graders` was not passed |
| `llm_judge` | refused by the schema | deferred (D-12): a judge must run as a signed, budgeted native session, which this build does not offer |

`{{taskDir}}` in a prompt is replaced with the attempt directory relative to the workspace, so a governed `fs.*` call can address it.

## What an attempt is

Each attempt opens one fresh session through the experiments' trial runner (`openAgentSession`, the ToolPipeline, a wall-clock limit with abort grace; a session that does not seal is never a completed attempt) under agent id `eval-suite` by default, with the suite's or task's `tools` and `allowedActionClasses`. Every row carries a `caseExecution` stamp (`casebookId: eval-suite:<suiteId>`, `caseId`, `trialId: <runId>:<taskId>:<attempt>`), so the attempt's usage and cost are read back with `collectTrialReceipts` from verified rows. A deny-only guard admits only the tools an attempt needs and confines the file tools: `fs.read`, `fs.write`, `fs.edit`, `glob` and `grep` must name a `path` inside the attempt directory (a `glob` or `grep` without one would search the workspace root, where the suite file and its expected answers live), and the session-bound `todo`, `plan`, `get_goal`, `tool_search` and `session.spill_read` reach no file. Every other tool is refused: shells, background jobs and terminals (they run commands), web tools, delegation, MCP tools, and any tool added later until it is listed. So attempt 2 cannot read attempt 1's files or the suite file. An attempt that failed before its turn started (a session that never opened, a crashed harness) is recorded as `error` with that reason: the agent was given nothing to fail. Governed tool calls run at the mode the workspace's signed Action Policy grants: with the default policy and no trusted sealed run, writes are SIMULATE (docs/GOVERNOR.md "Reaching EXECUTE"), so a repository task cannot produce its outputs; the runner then records the attempt as `error` with that reason rather than a `fail` the graders never saw. Attempt directories live under `workspace/output/amc-eval/<runId>/`, the only area the shipped `fs.write` / `fs.edit` allowlist permits (anywhere else the allowlist would deny every write before the eval guard is reached), and are deleted after grading unless `--keep-dirs`.

Command graders run through `SandboxRunner` with the grading directory as the only writable root, network denied, `~/.ssh`, `~/.aws`, `~/.config/gcloud`, the workspace's `.amc` and the attempt directory unreadable, and a process cap. On Linux, Bubblewrap enforces that policy. On macOS the Seatbelt profile confines writes only, so it refuses the grader policy (network, read denial, process cap) with nothing run: command graders cannot be confined on macOS. Wherever no backend can enforce the policy the grader result is `error` ("unconfined grader refused"). Only `--unsafe-unconfined-graders` on the command line runs it anyway, with the operator's full user rights, network included; the exit status then decides the grader and the result records `confined: false`, `backend: none` and says it ran unconfined. A suite file can never grant that.

## Results, scores and evidence

`results.json` (`amc.eval-results/v1`) holds the suite digest, every fixture file's digest, the provider and model, per attempt the session id, outcome, verdict (`pass` / `fail` / `error`), each grader's result, duration, usage and cost, and per task `passes/attempts`, a Wilson 95 % interval and `pass@1..pass@g` by the unbiased estimator `1 - C(g-c, k)/C(g, k)`. An `error` attempt is neither a pass nor a fail, so rates, intervals and pass@k run over the `g` graded attempts (attempts minus errors) and are null when nothing was graded. The summary gives the pass rate over graded attempts, the task pass rate (tasks whose every attempt passed), latency p50/p95 and cost, which is a number only when every attempt's cost projection was complete; the stub's cost is `unavailable`, never zero. `taskSelection` records a `--tasks` subset (null for the whole suite). The results digest is recorded in a signed `EVAL_SUITE_RUN` audit row. Runs are refused under `AMC_NO_SIGN=1`.

Eval sessions are OBSERVED native rows like any other session; they run under the `eval-suite` agent so they do not feed another agent's evidence unless `--agent` says so.

Use the results file from `run --out` for baseline and comparison. The `--json` command output adds the claim label and status dimensions outside the recorded artifact.

## Baselines and gates

`baseline` reduces a results file to per-task counts plus its fixture digests and records the baseline digest in a signed `EVAL_SUITE_BASELINE` row. It refuses a results file whose digest is not a recorded `EVAL_SUITE_RUN` of this workspace, so an edited results file cannot be laundered into a baseline every later run is gated against. Running it again on the same results file is idempotent. `compare` returns `pass` (exit 0), `fail` (1) or `inconclusive` (2). It is inconclusive, never a pass, when:

- the results file, the baseline file, or the results file the baseline was built from is not recorded in the verified ledger (an edited file);
- the suite digest or any fixture file's digest changed (`requireSameSuite`, default true): runs graded by different tests are not the same suite;
- a baseline task is absent from the results (a `--tasks` subset cannot gate the whole suite), or a task has no baseline;
- a task has fewer than `minAttemptsPerTask` attempts on either side, or had grader errors in the current run;
- a task's graded attempts cannot separate even a total regression (all passing before against none now) at 95 %: with equal counts on both sides that needs at least 4 graded attempts each, so a baseline and a run both made with `--attempts 1`, 2 or 3 are always inconclusive (a baseline with more attempts lowers the floor for the run: 10 against 3 can decide);
- a `minPassRate` is set and the errored attempts could still decide it (the rate fails only if it would fail however they resolved);
- a cost gate is set and cost is unavailable on either side.

A task regressed when its baseline Wilson lower bound lies above its current upper bound, so a task that passes 90 % of attempts is not flagged by one unlucky run of three. Run `--attempts 4` or more for a gate that can pass or fail. Gate file:

```json
{ "minPassRate": 0.9, "maxRegressedTasks": 0, "minAttemptsPerTask": 4, "requireSameSuite": true, "maxCostIncreaseRatio": 1.1 }
```

## Limits

- Attempts run one at a time (D-10). Each attempt scans the verified ledger for its rows; large workspaces pay for that.
- The stub provider proves the grading path, not model quality. Live providers need the workspace's configured route and credentials; nothing here calls a paid API by itself.
- No `llm_judge`, no Docker isolation for repository tasks (D-09), no suite import from promptfoo or OpenAI evals (D-11).
