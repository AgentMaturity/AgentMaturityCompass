# Headless native runs

`amc agent-loop run` for scripts and CI: the prompt from stdin, a machine-readable output format, and an exit code
that follows the execution contract ([Execution API](sdk/EXECUTION_API.md)). Everything below is true of the current
source build. The stub provider runs no model; its output is a synthetic demonstration, never a real-model result.

## The prompt

- Positional text opens the turn, as before: `amc agent-loop run "Summarise the README"`.
- `-` reads the prompt from stdin to EOF: `cat task.md | amc agent-loop run - --provider stub`.
- With no positional prompt, no `--audio-input` and a stdin that is not a terminal, stdin is read as well, so
  `echo "..." | amc agent-loop run` works without the `-`.
- The stdin prompt is bounded at 10 MiB and refused over it; nothing is cut or sent.
- A stdin that is never closed (for example `docker run -i` without input) waits for EOF. Pass the prompt
  positionally there.
- `--list-skills` answers before any prompt is read (with `text` or `json`; it is refused with `stream-json`, which
  streams a run, not a catalog). `--audio-input` takes its parts from its manifest and never reads stdin.

## `--output-format text|json|stream-json`

- `text` (default) prints the recorded summary as today.
- `json` prints one JSON object: the recorded summary, the `execution` phases and the `exitCode`. `--json` is the
  alias of `--output-format json`; passing `--json` with another format is refused.
- `stream-json` prints one JSON event per line on stdout and nothing else there. Human progress keeps going to
  stderr, exactly as under `--json`. It is refused with `--goal-rounds`, which runs child sessions and has no root
  turn to stream, and with `--list-skills`.
- On `--session <id>` and `--fork-from <id>` the stream carries only this run's rows. The session's existing rows
  (earlier turns, or the copied parent history) are authenticated under the same checks before the turn starts, but
  none is emitted and none counts against the per-turn output budget; the first `update` has a `seq` after them.

Every event has `type` and `sessionId` (`null` before a session exists). The schema version is `1`.

| Event | When | Fields |
|---|---|---|
| `system` (`subtype: "init"`) | once the session exists, so a `--fork-from` run reports the child's id | `schemaVersion`, `agentId`, `provider`, `model`, `tools`, `approvals` (the action class, or null) |
| `turn_start`, `turn_end`, `step_start`, `step_end`, `retry`, `compaction`, `inbox`, `status` | the loop's live notifications, as they happen | the notification's own fields, named per kind in `notificationEvent` (`turn`, `step`, `ending`, `attempt`, `decision`, `delayMs`, `message`, `eventIds`, `op`, `target`, `messageIds`, `status`). A `compaction` message is the loop's own fixed text; when the summary step failed it names the failure's code and HTTP status, never the provider's text |
| `error` (with `turn`/`step`) | a request or step failed inside the loop | `turn`, `step`, `code`, `httpStatus`, `summary`, `nextAction`: the fixed public guidance the text path prints, never the provider's or exception's own text (it can carry request details or credentials) |
| `text_delta`, `text_end` | the provider's live text, as it streams | `trust: "provisional"`, `headerEventId`, `text` or `truncated`. Provisional means not yet recorded: the committed `agent_message_chunk` below is the reply of record. |
| `update` | each row this run newly commits, authenticated, in commit order | `seq`, `eventId`, `eventHash`, and `update` in ACP's `session/update` shape: `agent_message_chunk`, `tool_call` (with `kind`, `title`, `locations` as absolute workspace paths), `tool_call_update`, `plan` (the signed current plan after each `todo` call) |
| `result` | last, after a final flush of the rows written while the turn settled | the recorded summary, `execution` phases, `goalRounds` when present, `exitCode` |
| `error` | last, instead of `result` | `message` (the last refusal line, a projection failure, or a fixed line for an unhandled exception whose text stays on stderr), `exitCode` |

Committed updates go through the same authentication ACP uses before an editor sees them (`src/acp/acpCommittedStream.ts`):
each new row's signature, hash chain and sequence envelope are checked, unsigned rows are refused, and one event is
bounded at 900,000 bytes with 8 MiB per turn. If any of that fails, the stream ends with `error`, the turn is
cancelled (cause `disposed`, by `stream-json:projection`) and the process exits 1. A quietly shorter stream would read
as a faithful one. Tool output in `tool_call_update` is the recorded text; a result that was spilled or pruned refuses
the projection rather than printing a placeholder.

The stream is not a verification verdict. `amc agent-loop verify <sessionId>` is.

Example:

```sh
echo "Check the recording path." | amc agent-loop run --provider stub --output-format stream-json | jq -c '.type'
# "system" "turn_start" "step_start" ... "update" ... "turn_end" "result"
```

## Exit codes

Derived from the execution phases in `src/execution/executionContract.ts`, never restated beside them
(`src/cli/agentLoopOutputOptions.ts`):

| Code | Meaning |
|---|---|
| 0 | admission, model completion and side-effect completion all succeeded (a `complete` ending, every journaled action settled `completed`) |
| 1 | the run failed: the driver failed, an `error` ending, no readable ending was recorded for this run's turn, requested validation not passed, goal rounds `failed`, `refused`, `check-failed` or `check-unavailable`, a receipt chain failed integrity, or a refusal before dispatch (unknown flag value, missing prompt, a route it cannot compose) |
| 3 | the turn was `cancelled` (Ctrl-C, SIGTERM, `--cancel-after`) or `interrupted` (closed by crash repair); goal rounds `cancelled` or stopped for a `human` |
| 4 | a bounded ending: `max_steps` or `max_tokens`; goal rounds hit `max-rounds` |
| 5 | `blocked`: a guard refused the turn, or goal rounds stopped `blocked` |
| 6 | the turn completed (or goal rounds reached `done`) but the session's journaled side effects did not all settle as completed (a refused, unknown or still-open receipt) |

The ending is this invocation's: a `--session` turn is judged by the ending it recorded, not by an earlier turn's.
The side-effect phase is the whole session's receipts (the same `execution` object the summary prints), so a
`--session` turn after a turn whose side effect was refused exits 6 even when it made no tool call; the `execution`
field says which receipt. Under `--goal-rounds` the stop reason decides (`src/cli/agentLoopOutputOptions.ts`
`GOAL_STOP_EXIT_CODES`; a stop reason this version does not know exits 1). A goal run records no root turn, so its
side effects are read from the receipts of the root session and of every session its rounds ran in: each round is a
delegated child session named by a signed `agent_delegation_started` row, and a round's own delegates are read too.
`done` exits 0 only when all of those receipts settled `completed` (else 6), an integrity failure in any of them exits
1 whatever the stop reason, and a delegation row that names no child reads as an integrity failure. The `json` summary
carries those receipts as `goalReceiptStates`; its `execution` object stays the root session's own phases. `agent-loop
run` configures no completion check, done claim or human checkpoint for its goal rounds, so today they stop by
`max-rounds`, `blocked`, `failed`, `refused` or `cancelled`; the table maps every stop the driver defines.

`2` is `amc agent-loop verify`'s integrity-only exit and is never produced by `run`. The `json` summary and the
`result` event carry the same `exitCode`; the process exit code is authoritative (a cleanup failure after the result
line still exits 1, and a stream that ends with a terminal `error` always exits non-zero). A code once recorded is
never replaced by a later, lesser one: a failure (1) reported before the summary stands over the summary's 3 to 6, and
the first table code stands over a second. `agent-loop chat` reads 3 to 6 from its turn child as "completion not
established", not as a failed turn: 3 to 5 are named by the recorded ending, 6 by the code itself ("the session's side
effects did not all settle"). Chat sends the entered prompt to its turn child over stdin (`run -`), so the prompt is
never an argv word.

## What this is not

- Not `--input-format stream-json`: a multi-turn stdio protocol already exists, `amc acp` ([ACP](ACP.md)).
- Not a structured-output contract (`--json-schema`): a post-hoc check on the final message would not be one. Deferred
  until the loop's validation seam can enforce it.
- Not a cost figure: usage in the summary is read back from the recorded rows; cost stays `not-derived`.
