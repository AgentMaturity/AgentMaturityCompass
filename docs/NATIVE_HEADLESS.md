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
- `--list-skills` answers before any prompt is read. `--audio-input` takes its parts from its manifest and never reads
  stdin.

## `--output-format text|json|stream-json`

- `text` (default) prints the recorded summary as today.
- `json` prints one JSON object: the recorded summary, the `execution` phases and the `exitCode`. `--json` is the
  alias of `--output-format json`; passing `--json` with another format is refused.
- `stream-json` prints one JSON event per line on stdout and nothing else there. Human progress keeps going to
  stderr, exactly as under `--json`. It is refused with `--goal-rounds`, which runs child sessions and has no root
  turn to stream.

Every event has `type` and `sessionId` (`null` before a session exists). The schema version is `1`.

| Event | When | Fields |
|---|---|---|
| `system` (`subtype: "init"`) | once the session exists, so a `--fork-from` run reports the child's id | `schemaVersion`, `agentId`, `provider`, `model`, `tools`, `approvals` (the action class, or null) |
| `turn_start`, `turn_end`, `step_start`, `step_end`, `retry`, `compaction`, `inbox`, `status`, `error` (with `turn`/`step`) | the loop's live notifications, as they happen | the notification's own fields (`turn`, `step`, `ending`, `attempt`, `decision`, `message`, ...) |
| `text_delta`, `text_end` | the provider's live text, as it streams | `trust: "provisional"`, `headerEventId`, `text` or `truncated`. Provisional means not yet recorded: the committed `agent_message_chunk` below is the reply of record. |
| `update` | each newly committed, authenticated session row, in commit order | `seq`, `eventId`, `eventHash`, and `update` in ACP's `session/update` shape: `agent_message_chunk`, `tool_call` (with `kind`, `title`, `locations`), `tool_call_update`, `plan` |
| `result` | last, after a final flush of the rows written while the turn settled | the recorded summary, `execution` phases, `goalRounds` when present, `exitCode` |
| `error` | last, instead of `result` | `message`, `exitCode` |

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
| 1 | the run failed: the driver failed, an `error` ending, requested validation not passed, goal rounds failed, a receipt chain failed integrity, or a refusal before dispatch (unknown flag value, missing prompt, a route it cannot compose) |
| 3 | the turn was `cancelled` (Ctrl-C, SIGTERM, `--cancel-after`) or `interrupted` (closed by crash repair) |
| 4 | a bounded ending: `max_steps` or `max_tokens` |
| 5 | `blocked`: a guard refused the turn |
| 6 | the turn completed but its side effects did not all settle as completed (a refused, unknown or still-open receipt) |

`2` is `amc agent-loop verify`'s integrity-only exit and is never produced by `run`. The `json` summary and the
`result` event carry the same `exitCode`; the process exit code is authoritative (a cleanup failure after the result
line still exits 1). `agent-loop chat` reads 3 to 6 from its turn child as "completion not established", not as a
failed turn.

## What this is not

- Not `--input-format stream-json`: a multi-turn stdio protocol already exists, `amc acp` ([ACP](ACP.md)).
- Not a structured-output contract (`--json-schema`): a post-hoc check on the final message would not be one. Deferred
  until the loop's validation seam can enforce it.
- Not a cost figure: usage in the summary is read back from the recorded rows; cost stays `not-derived`.
