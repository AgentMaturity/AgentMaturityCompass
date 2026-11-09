# Agent loop continuity: continue, plan mode, steering, run limits, memory files, context accounting

This page documents six features of the native agent loop that landed together (SH-LOOP). Each one reuses an existing signed seam; none adds a key scheme or a second inbox. The limits are stated with each feature.

The agent loop is `amc agent-loop run` and `amc agent-loop chat` (src/agent, src/kernel, src/session). `amc loop run` is the maturity loop (diagnostic, assurance, dashboard) and is documented in [LOOP.md](LOOP.md); it is not the agent loop.

## Continue the latest session

```
amc agent-loop run --continue "next step"
amc agent-loop chat --continue
amc session latest [--agent <id>] [--json]
```

`--continue` resolves the most recent session this agent can continue in this workspace and flows it into the same path as `--session <id>`: the session is verified, its writer is claimed, and the prompt opens its next turn. `amc session latest` prints the same choice without claiming anything.

A session is eligible when it is native (not imported), recorded for this agent, left `released` (a `--keep-open` run or a chat that exited cleanly), and passes the same continuation controls resume applies: it is not a delegated child, no parent or hook stopped it, and it has no unresolved child. Interrupted sessions (a turn that was never sealed) are deliberately not eligible; continue one explicitly with `--session <id>`, which runs crash recovery.

Limits, stated:

- The original run's flags are required. Resume refuses a session whose composition or policy digest differs from `session/open` (provider, model, tools, approval gate, max-steps, compaction). `--continue` reports this as `CONTINUE_CONFIGURATION_MISMATCH: session <id> …` naming the session it chose, so you can restore the flags or pick another id. It does not search for an older session that would match.
- Nothing eligible is `NO_SESSION_TO_CONTINUE` (exit 1) with the recent sessions it passed over and why. A new session is never started silently.
- Two sessions updated in the same millisecond are ordered by session id.

## Plan mode

```
amc agent-loop run --plan --tools workspace "investigate X and write a plan" --keep-open
amc agent-loop run --session <id> --tools workspace "execute the plan"
```

`--plan` narrows the root toolset to the `READ_ONLY` action class with the same registry restriction a `--delegate-scope READ_ONLY` child runs under, so the model is not offered `fs.write`, `fs.edit`, `bash`, the terminal tools or any other mutating tool, and a Code Mode program's sub-calls resolve through the same restricted registry. Three `READ_ONLY` tools are withheld by name because they cause effects elsewhere: `delegate`, `workflow` and `job_kill`. A deny-only guard backs the restriction for tools defined after composition (an MCP mount): such a tool can still be offered, and a call to it is refused unless its reviewed class is `READ_ONLY`, recorded by the pipeline as `TOOL_CALL_DENIED`. The model is told the rule through the `context:plan-mode` runtime context. Every turn the run opens, a queued follow-up included, records a signed `NATIVE_PLAN_MODE` audit row inside that turn, at its first step boundary, naming the turn and the tools withheld; a run that fails before its first turn records none.

There is no tool that leaves plan mode. The model records its plan with the signed `plan` tool; the operator executes it by starting the next turn without `--plan`. Plan mode is a per-turn fact, not part of the session's composition or policy digest, so the planning turn and the executing turn share one session (`--session <id>`).

Limits, stated:

- `--plan` is refused with `--delegate` and `--goal-rounds` (and the composed runner refuses plan mode with delegation, goal rounds or a schedule pass before any session row): a child's toolset is built after the root's is narrowed, so the restriction would not reach it.
- `--plan` requires `--tools workspace`; there is nothing to narrow in `echo` or `none`.
- Native chat has no plan-mode switch in this slice. Plan with `amc agent-loop run --plan --keep-open` and execute with `--session <id>`.
- A host that pins the system prompt through the runtime API (`runComposedTurn` with `systemPrompt`) gets no runtime context, so such a run is restricted the same way but is not told so in its prompt. `agent-loop run` always assembles its prompt.
- A tool whose reviewed class is `READ_ONLY` but which mutates something outside the workspace (an MCP tool with a wrong review) is the review's claim, not this mode's.
- The write scope of the executing turn is the workspace's own action policy; plan mode never widens it.

## Steer, queue and withdraw from a live surface

The composed turn handle (`onReady` in `runComposedTurn`) now exposes `steer(text, clientRequestId?)`, `queue(text, clientRequestId?)` and `withdraw(messageId)`. Each goes through the same durable inbox a `--steer` flag or a chat line uses: a steer is a signed `loop/inbox` insert with origin `steer`, claimed by the nearest step boundary of the running turn; a queued message gets its own turn; a withdrawal is a signed splice. The `clientRequestId` makes a retried send idempotent.

```
amc agent-loop run --interactive-steer "…"   # under a parent that forked it with an IPC channel
```

With `--interactive-steer`, a parent process that forked the run with `child_process.fork` (as native chat forks its tasks) can send frames and receives a receipt for each:

- `{ type: "amc/native-steer", v: 1, lane: "next-step" | "next-turn", text, clientRequestId? }` → `{ type: "amc/native-inbox-receipt", v: 1, ok: true, frame: "steer", receipt }` where `receipt` is the inbox receipt (`eventId`, `messageId`, `target`, `demotedFrom`).
- `{ type: "amc/native-withdraw", v: 1, messageId }` → `{ …, ok: true, frame: "withdraw", messageId, withdrawn }`.
- A malformed frame (unknown lane, empty text, more than 256 KiB, a bad id) or one that arrives after the driver closed admission (disposed, or ended by a run limit) is answered `ok: false` with `refused` and touches no inbox.

Like `--interactive-approvals`, the flag is refused without an IPC channel, and the listener is removed when the turn ends so the channel never keeps the process alive.

Limits, stated:

- Native chat does not yet open a steering prompt while a task runs; its `/withdraw` works between tasks as before. The chat half is a UI change (the terminal's single question slot is shared with approvals and `ask_user`) and is handed to the UI owner with this frame contract. Scripts can use `--steer`/`--steer-after` or fork the run with IPC.
- SDK, ACP and Studio still queue follow-ups only; a steer method on those surfaces is a later item.

## Run limits

```
amc agent-loop run --stop max-turns:2 --stop max-tokens:20000 --stop timeout-ms:60000 "…"
```

`--stop` is repeatable. A breach ends the run with a signed `loop/cancel` row whose cause is `{ kind: "limit", condition, bound }` and requester `run-limit`; a limit that fires inside a turn is also the `cancelCause` inside the hashed `turn/end` (`reason: "cancelled"`). The run then refuses new work at admission, prints `Run limit reached: <condition>:<bound>`, carries the same cause as `runLimit` in `--json`, and exits 1, because its prompt or a queued turn did not run to completion. ACP clients see such an ending as `cancelled`; the cause is in the signed log.

Units, stated:

- `max-turns:N` is a session turn number: no turn numbered above N opens. A queued follow-up or a steer that would open turn N+1 is refused with the cancel row and dropped. Because turn numbers continue across resumes, a resumed session that already ran N turns refuses its next one under the same limit.
- `max-tokens:N` counts provider-reported input, output and cache tokens over the session: the steps this run makes plus, on resume, what the session's earlier steps reported (read from its `step/end` rows). A forked child is a new session and starts its own count; its parent's counts are recorded beside it as `FORK_TOKEN_COUNTS`. A step that reported no usage (a cancelled or failed step included), or an earlier step in a resumed history that did, fails the limit closed (`unmeasured: true`): the budget cannot see an unmeasured step, so it is never counted as zero. The stub provider reports zero tokens, so `max-tokens` never fires on a stub run.
- `timeout-ms:N` is wall clock from the driver's construction, idle time included.
- Limits bound this driver only. In-process delegated children run under their own drivers and are not counted; bound them with `--delegate-stop`, which still accepts only `max-turns` and `timeout-ms`. `--goal-rounds` is bounded by its own round ceiling.
- Limits are per invocation and are not in the policy digest: resuming with a different `--stop` is allowed, and the limit is attributable from the cancel row it writes rather than from `session/open`.

## Memory files: AMC.md, local overlays, `@path` imports

A native run loads workspace instruction files in ascending precedence `CLAUDE.md` < `AMC.md` < `AGENTS.md`, with local overlays `CLAUDE.local.md` < `AMC.local.md` < `AGENTS.local.md` after the base files in each directory. `AGENTS.md` stays the strongest file on purpose: AMC's own guardrail writer (`amc guide`, one-click fix) targets `AGENTS.md`, and the reader must rank the writer's target highest so an unmanaged `AMC.md` shipped in a cloned repository cannot out-rank guardrails AMC wrote. Directory files are discovered for the workspace root and for the ancestors of directories a signed tool call touched, as before.

A line that is exactly `@<path>` inside a project instruction file imports that file. The path is relative to the importing file's directory; a leading `/` is relative to the workspace root. Imports may import in turn, up to four hops; the fifth is omitted and the model is told. Each imported file is quoted under its own heading with its SHA-256 and the file that imported it, counts against the per-file and total instruction budgets together with its importer (a file whose imports exceed the total budget is left out whole, and said so), and appears in `amc agent-loop system-prompt instructions` (under `imports` with `--json`). Imports are resolved per instruction file: two files that import the same file each carry it.

Bounds, stated: one instruction file follows at most 32 `@` lines across its whole import tree and stops reading once it and its imports exceed the total budget; what it did not follow is one summary omission. A refused target is quoted back with its control characters escaped and at most 160 characters of it, because omissions reach every step's prompt and the operator's terminal outside the byte budgets.

Confinement, stated:

- An import reaches only a regular file inside the workspace, read through the same bounded reader the instruction files use: no `..` escape, no symlink anywhere in the path, and no file with more than one hard link (a hard link is a second name for the same bytes, which no name check sees).
- `~`, absolute host paths and `$AMC_HOME` are refused. So are `.amc/`, `.git/`, `node_modules/`, and every home-relative secret directory the macOS shell sandbox denies (`.ssh/`, `.aws/`, `.azure/`, `.config/gcloud/`, `.gnupg/`, `.kube/`, `.docker/`, `Library/Keychains/`, `.netrc`, `.npmrc`), at any depth, since a workspace can be a home directory. Credential carriers are refused by name even when renamed into a text file: any name starting with `.env` (`.env.local`, `.envrc`, `.env-prod.txt`), `.npmrc`, `.netrc`, `.pypirc`, `.git-credentials` and `credentials` with any suffix (`credentials.md`), SSH identities by key-type stem (`id_rsa`, `id_dsa`, `id_ecdsa`, `id_ed25519`, so `id_rsa.txt` too) and key-file extensions anywhere in the name (`.pem`, `.key`, `.p12`, `.pfx`, `.jks`, `.keystore`, so `server.pem.txt` too). All of this holds however the path is written and whatever its letter case (a case-insensitive filesystem resolves `.AMC/` to `.amc/`). Segment shapes that alias another name on some volumes are refused outright: a trailing dot or space (Win32 strips them, so `.amc.` opens `.amc`), `:` (an NTFS alternate data stream), `~1` short names, the other Win32-reserved characters and control characters, and NFKC look-alikes. After the read, the canonical on-disk path is judged against the same list, so the name the filesystem opened is the name that was checked. There is no approval prompt for a foreign path; the import is omitted and the omission is stated in the model's context. This is stricter than Claude Code's approval dialog.
- Only text files import: the target must end in `.md`, `.mdx` or `.txt`. A `package.json`, a shell script or a binary is refused by extension before anything else is considered.
- User-scope files never import; an `@` line in one is text.
- `amc agent-loop system-prompt instructions` now lists exactly what a native run loads (workspace-only discovery), not the legacy user-plus-root scan.

## Context accounting per turn

`amc session show <id>` prints a `Context per turn` block, and `--json` carries it as `context`: for each turn, the prompt tokens of the last step that reported usage, the peak, the share of the window, how many steps were measured and how many automatic compactions ran inside the turn. The prompt is `inputTokens + cacheRead + cacheWrite`, the same formula the automatic compactor measures. During a run, every step ends with a `context` notification (`step T.S context: prompt N tokens of W (P%)`), printed by `agent-loop run` unless `--json` without `--stream` silences notifications.

Limits, stated:

- Occupancy is per request, not per turn. The `tokenCounts` block sums a turn's steps for cost; `context` does not, so its ratio never exceeds 1 for a single request.
- The window is a signed fact only where a row recorded it: an automatic `loop/compact` receipt. A session that never compacted reports `window not recorded` rather than the catalog's number, because an operator `--context-window` override may have changed it.
- A step whose provider reported nothing is `unmeasured`, never zero.

## Not in this slice

- Rewind of files and conversation (`amc session rewind`) is deferred: it needs a checkpoint store that works without vault-backed blob keys, a conflict check against the last recorded `afterSha256` of each file, a live-writer fence on fork, and a composed path that gives the child a truthful identity. Conversation-only rewind remains available as `--fork-from <id>` at the latest sealed turn.
- Deterministic keyless replay of a recorded session, thinking-budget controls for Anthropic and OpenAI Responses, focused compaction instructions and `.amc/rules/*.md` remain deferred as listed in the SH-LOOP plan.
