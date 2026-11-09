# Native workflows

A workflow is a plan of delegated tasks, written as JSON. The model can author
one through the `workflow` tool, and an operator can run a reviewed plan file
headless with `amc agent-loop run --workflow-plan`. Every node runs through the
same governed delegation path as a `delegate` call: a signed handoff packet,
the depth refusal, the operator's scope and stop conditions, the root-governed
budget, and a `delegation-started`/`delegation-completed` pair in the parent's
signed session. Progress is recorded as signed `workflow/progress` rows, so an
interrupted run can be resumed in its own session and a completed node is reused
instead of run again.

This describes the contract of the current source build. It is not an
acceptance receipt, and no provider other than the local stub has been used to
qualify it.

## Plan grammar

| Node | Fields | Meaning |
| --- | --- | --- |
| `agent` | `id`, `runAs`, `goal`, `scope?`, `agent?` | One delegation. `scope` is intersected with the operator's `--delegate-scope`; `agent` names an [agent definition](NATIVE_DELEGATION_LIMITS.md#agent-definitions). |
| `verify` | `id`, `runAs`, `goal`, `of`, `scope?`, `agent?` | One delegation that reviews the output of leaf `of` and gates the plan on its verdict (below). |
| `parallel` | `id`, `children` | Runs the children concurrently (at most 8 live children per run, and 8 per session) and waits for all. |
| `pipeline` | `id`, `stages` | Runs the stages in order; each stage receives the previous stage's answer as "Input from the previous step". |

Limits: 64 nodes, depth 16, 256 KiB, unique ids. A plan is refused as data
before any delegation is authorised.

## Verify nodes

A `verify` node's `of` must name a leaf (`agent` or `verify`) in an **earlier
stage of an enclosing pipeline**. Forward references, siblings inside a
`parallel`, composite nodes and unknown ids are refused when the plan is read,
so the reviewed output always exists before the verifier is admitted.

The verifier's goal is the node's `goal`, then the runtime's verdict
instruction, then the reviewed output. The runtime mints a fresh token for every
dispatch and asks for exactly one final line of the form
`VERDICT-<token>: pass` or `VERDICT-<token>: fail`. The node passes only when
that line is present once, is the last non-empty line, and says `pass`. A
missing, repeated or contradictory line fails the node; so does a verifier that
only quotes the reviewed text, because the reviewed text cannot contain a token
minted after it was written. A failed verify node is recorded as `failed` in the
`workflow/progress` rows with a runtime-written reason (the verdict read and the
verifier's child session id, never the verifier's words), and the pipeline stops
there.

On pass, the **reviewed output** carries forward to the next stage; the
verifier's own words stay in its child session. The control flow is mechanical.
It is not a defence against the reviewed text: the verifier sees the token and
the reviewed output in the same goal, so text under review can still instruct
the verifier to write `pass`. The judgement behind the verdict is a model's,
nothing here evaluates whether it was right, and neither the run summary nor the
`workflow` tool result labels it otherwise.

Because `verify` is part of the plan grammar, an A4 Build that declares a
workflow may now declare one; the Assemble stage's readiness wording for
declared workflows is unchanged.

## Headless run

```sh
amc agent-loop run --delegate --tools workspace --workflow-plan plan.json --json
```

- The plan file must be a regular file inside the workspace (the file is never
  followed as a symlink; its directory is resolved through symlinks, so a
  `/var` or linked-checkout prefix is fine; any file name), at most 256 KiB.
  Its sha256 is printed before the run. `--workflow-plan-sha256 <hex>` pins
  it: the run is refused when the bytes read differ from the pinned digest.
  The workspace is writable by earlier agent runs, so an unattended (CI, cron)
  run should always pass the pin; without it the plan is whatever the file
  holds at run time.
- `--delegate` and `--tools workspace` are required, `--delegate-provider` is
  refused (every node is an in-process child), and no prompt, image or audio
  may be given: a workflow pass runs no model turn in the root session. The
  signed tool allowlist must name `delegate`, exactly as for `--delegate`.
- The root session is composed as for `--goal-rounds`: the same principal,
  second-writer and stop-condition checks, the same composed child runner, the
  same `--delegate-scope`, `--delegate-stop`, `--max-delegation-depth` and
  `--max-active-children` bounds. `--max-active-children N` also bounds the
  plan's own scheduler to `min(N, 8)` live nodes, so a wider `parallel` node
  queues instead of being refused at admission.
- The result is reported in the run summary as `workflow` (`runId`, `ok`,
  `outputs` keyed by node id, `failed`, `cancelled`, `agentsRun`). The command
  fails when the plan did not succeed. Ctrl-C and `--cancel-after <ms>` cancel
  the pass; a node whose child was running when the run was interrupted is
  parked as `TOOL_OUTCOME_UNKNOWN` and needs operator reconciliation before a
  retry.
- `--keep-open` leaves the session unsealed. A later
  `--session <id> --workflow-run-id <runId> --workflow-plan <same file>`
  resumes that run in that session: succeeded nodes are reused without a new
  dispatch, and a plan whose canonical content differs from the recorded one is
  refused by the existing checkpoint fence. A `--workflow-run-id` the session
  never created is refused before any dispatch (a resume never starts a new run
  under a given id, so a typo cannot re-run finished nodes). Without
  `--keep-open` (or a crash that left the session unsealed) there is nothing to
  resume. A resume that dispatches nothing and does not succeed (a mistyped run
  id, a checkpoint the fence refuses, a node parked as `TOOL_OUTCOME_UNKNOWN`)
  leaves the session as it found it, unsealed, so the same resume works once
  the cause is fixed. A resume that dispatches a node, or finishes from reused
  results, seals the session unless it repeats `--keep-open`; a sealed session
  can only be forked, not resumed.

The `workflow` tool is now also registered for the root `--delegate` run, beside
`delegate`; it stays hidden and denied until the signed allowlist names
`workflow` too, so permitting `delegate` does not permit a fan-out of up to 64
children.

## What is not here

- No scheduled workflows (a signed schedule still runs goal rounds).
- No operator view of a running workflow by `runId` beyond the session log.
- Studio native tasks, the SDK and ACP compose no delegation, so they run no
  workflows.
