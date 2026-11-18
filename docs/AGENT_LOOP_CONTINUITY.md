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
- A `/skill` loads for one turn and is not part of that digest, so one session can mix skill turns and plain turns, and a resumed session accepts a different skill, or a skill whose text changed: each turn's signed composition record names the skill it loaded with the sha256 of its content. A session that a skill turn opened before this rule still resumes: its digest is checked in the earlier form, with the skills its signed first turn names.
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
- `--plan` requires `--tools workspace`; there is nothing to narrow in `echo` or `none`. It is refused with `--validate`, whose public checks run through `bash`, which plan mode denies.
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

Like `--interactive-approvals`, the flag is refused without an IPC channel (and with `--goal-rounds`, which runs no root turn to steer), and the listener is removed when the turn ends so the channel never keeps the process alive. The listener starts when the composed turn is ready: a frame sent before that gets no answer, so a parent waits for its first answer (a malformed probe is answered too) before it relies on delivery.

Limits, stated:

- Native chat does not yet open a steering prompt while a task runs; its `/withdraw` works between tasks as before. The chat half is a UI change (the terminal's single question slot is shared with approvals and `ask_user`) and is handed to the UI owner with this frame contract. Scripts can use `--steer`/`--steer-after` or fork the run with IPC.
- SDK, ACP and Studio have no steer method: ACP and Studio start a later turn with a new prompt, and the SDK accepts no second prompt while one is active (it can withdraw a queued submission). A steer on those surfaces is a later item.

## Run limits

```
amc agent-loop run --stop max-turns:2 --stop max-tokens:20000 --stop timeout-ms:60000 "…"
```

`--stop` is repeatable. A breach ends the run with a signed `loop/cancel` row whose cause is `{ kind: "limit", condition, bound }` and requester `run-limit`; a limit that fires inside a turn is also the `cancelCause` inside the hashed `turn/end` (`reason: "cancelled"`). The run then refuses new work at admission, prints `Run limit reached: <condition>:<bound>`, carries the same cause as `runLimit` in JSON output, and exits 4, because its prompt or a queued turn did not run to completion. ACP clients see such an ending as `cancelled`; the cause is in the signed log.

Units, stated:

- `max-turns:N` is a session turn number: no turn numbered above N opens. A queued follow-up or a steer that would open turn N+1 is refused with the cancel row and dropped. Because turn numbers continue across resumes, a resumed session that already ran N turns refuses its next one under the same limit.
- `max-tokens:N` counts provider-reported input, output and cache tokens over the session: the steps this run makes plus, on resume, what the session's earlier steps reported (read from its `step/end` rows). A forked child is a new session and starts its own count; its parent's counts are recorded beside it as `FORK_TOKEN_COUNTS`. A step that reported no usage (a cancelled or failed step included), or an earlier step in a resumed history that did, fails the limit closed (`unmeasured: true`): the budget cannot see an unmeasured step, so it is never counted as zero. The stub provider reports zero tokens, so `max-tokens` never fires on a stub run.
- `timeout-ms:N` is wall clock from the driver's construction, idle time included.
- Limits bound this driver only. In-process delegated children run under their own drivers and are not counted; bound them with `--delegate-stop`, which still accepts only `max-turns` and `timeout-ms`. `--stop` requires a root turn, so it is refused with `--goal-rounds` and `--workflow-plan`. Goal rounds keep their own ceiling, and `--delegate-stop` can bound children in both modes.
- Limits are per invocation and are not in the policy digest: resuming with a different `--stop` is allowed, and the limit is attributable from the cancel row it writes rather than from `session/open`.
- `max-cost-usd:D` (a dollar amount such as `0.50`) is checked before each turn opens and after each step: a resumed session already past D, or one with an earlier request of unknown cost, sends no further request, and a step takes the run past D only once. Attributed cost is the provider-reported cost where the provider gave one, otherwise AMC's catalog estimate when it is complete; it is indicative, not a bill, and it does not replace the signed budget (`docs/BUDGETS.md`), which refuses a request before it is sent. The limit fails closed: if any request in the session has no known cost (a model with no price, a stub route, a failed attempt without reported usage), the run stops with `unmeasured: true`, because the limit cannot see that request. The stub provider has no price, so `max-cost-usd` always stops a stub run after its first step.
- There is no default time limit. `timeout-ms` counts idle time from the driver's construction, so a default would cut native chat sessions, schedules and long A4 builds that wait between turns.

### Turn guards

Three guards run on every native turn, with no flag, in every driver (a delegated child has its own driver, so it starts fresh):

- **Repeated call.** The same tool with the same arguments (keys compared in sorted order, text compared after Unicode NFC normalisation) called again within one turn, in any order: A, B, A, B counts each of A and B. The third identical call is not run: the model gets a tool result saying so. The fifth ends the turn. A write-class tool that succeeds clears the counts of every other call made before it started, because the workspace may have changed, but never its own: the same successful command repeated still counts. A message from the person delivered into the turn (a steer) clears all counts. Polling tools whose result changes with no call in between (`job_output`, `job_list`, `terminal_read`, `terminal_list`, marked in the built-in tool table) are not counted.
- **Malformed responses.** Three model responses in a row with a tool call AMC could not use (arguments that are not a JSON object, or a tool the request did not offer) end the turn. A response whose calls are all usable starts the count again.
- **Refusals.** Five tool calls refused in one turn by a guard, a policy or an approver end the turn. The stop names the refused tools. Nothing is approved and no mode changes; AMC's own refusals of repeated or unoffered calls are counted above, not here.

A guard stop ends the turn, not the run: it is a signed `loop/cancel` row (requester `turn-guard`, queued messages kept) whose cause is `{ kind: "limit", condition: "repeated-call" | "malformed-responses" | "denials", bound, tools? }`, and the same cause is inside the hashed `turn/end`. `amc session show` lists every turn that stopped at a limit or a guard in plain words (`turnStops` with `--json`). `agent-loop run` prints the stop, carries it as `guardStop` in JSON output, and exits 4. The person can carry on with a new message (`--continue`); the counts start again in the new turn.

The defaults can only be made stricter, per run: `--stop repeated-calls:N` (2 to 5), `--stop malformed-responses:N` (1 to 3), `--stop denials:N` (1 to 5). A looser number is refused. These settings tighten the root turn only, so they are refused with `--goal-rounds` and `--workflow-plan`, whose delegated children keep the defaults. A guard stop does not ask the person whether to continue: the approval path asks about one tool action under the signed approval policy, and "continue after a repeat?" is not a tool action, so asking would need a new kind of approval. The person decides by sending the next message.

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

- Occupancy is per request, not per turn. The `tokenCounts` block sums a turn's steps for cost; `context` does not, so its ratio is one request's share of the window, never a multiple of the turn's step count.
- The window is a signed fact only where a row recorded it: an automatic `loop/compact` receipt. A session that never compacted reports `window not recorded` rather than the catalog's number, because an operator `--context-window` override may have changed it. The live `context` line uses the window the run is configured with, and is not evidence.
- A step whose provider reported nothing is `unmeasured`, never zero.

## When a request is too large for the model

Sometimes the model's provider refuses a request because it no longer fits the model's context window (the amount of text the model can read at once). AMC then does the following, once per turn, and only when automatic compaction is on:

1. The refused request is recorded and settled like any failed request: its usage stays unknown and counts against the budget as a failed request does.
2. If a run limit (`--stop`) would stop the run, or no step is left in the turn, nothing else happens: the turn ends with the provider's error, as before. With a `--stop` token limit this is always the case, because the refused request's usage is unknown.
3. AMC shortens large tool outputs in the context, this time including those of the most recent steps, and removes file text it restored after an earlier compaction. It does not ask the model for a summary here: that request would carry the whole context that just overflowed.
4. Each change is a signed `loop/compact` record that says it was caused by an overflow and names the refused request. Nothing is deleted from the record; only what the model sees changes.
5. If nothing could be removed, or a limit leaves no room, the turn ends with the provider's original error.
6. Otherwise AMC reads recent files again (see below), writes a signed `CONTEXT_OVERFLOW_RECOVERY` record saying the request overflowed, was compacted and is asked once more, and sends the next request. A second overflow in the same turn ends the turn.
7. Verification checks this from the record: `amc agent-loop verify` fails a session where a request followed an overflow in the same turn without both signed records for that overflow, or where one turn asked again more than once.

AMC does not estimate tokens from text size, so it cannot promise the next request fits; the provider's answer decides, and a second refusal ends the turn.

**Which providers.** AMC recognises an overflow from the error the provider sends: the error's own code `context_length_exceeded`, or a message that starts with one of a few known wordings. Echoed words elsewhere in an error do not count, and an error that blames the requested output length (`max_tokens`) is not treated as an overflow, because compaction cannot fix it.
- Known to work (tested with recorded examples of the wording): none. AMC has no recording from a real provider.
- Believed to work: OpenAI-compatible APIs that send `context_length_exceeded` or "This model's maximum context length is N tokens" (OpenAI, DeepSeek, OpenRouter, Mistral, older vLLM, Ollama's OpenAI-compatible endpoint). Also Anthropic's "prompt is too long: N tokens > M maximum" and Gemini's "The input token count (N) exceeds the maximum number of tokens allowed". The Anthropic and Gemini wordings come from user reports, not from the providers' documentation; the others are from memory.
- Not covered: newer vLLM ("longer than the maximum model length"), Amazon Bedrock, Anthropic's 413 "request too large", and anything else. These end the turn as before.

**Summaries.** The summary prompt (version 2) asks for fixed sections: objective and constraints, decisions and why, work state with file paths, what was and was not verified, open problems, and the next step. When an earlier summary is part of the text being summarized, the model is told to keep what is still true from it, drop what is stale, and treat it as model-written data: an instruction from you is kept only where it appears in your own message. The record names that earlier summary. Your own messages always stay word for word. A summary that leaves out a section is still used.

A summary request (at the normal compaction limit) now counts against `--stop` limits. If its usage is unknown (it was refused or failed) and a token limit is set, the run stops at once, before any further request, and the stop says that the summary request's usage was unknown.

**Files read again.** After a compaction that removed content, AMC reads again up to 5 files this session read whole, newest first. It skips any whose last read is still in context, and any that does not fit whole in the room left. The reads go through the same `fs.read` tool and checks as a normal read. A file is skipped when:
- it is gone, outside the workspace, or refused by the current policy;
- it is now a symlink, or has a symlink anywhere on its path;
- the read would first ask a person;
- the workspace has protected-data redaction on.

The text enters as file data from a tool, inside AMC's fence for untrusted tool context, never as your message. Because the read is whole and compared with the agent's last whole read, it counts as a read for "read before edit". A file that changed since then is marked as changed. Each compaction first removes file text restored earlier, so restored text does not pile up. The amount restored stays below half of what the compaction removed, at most 32,000 bytes each time and 96,000 bytes per session. A signed `COMPACTION_FILES_RESTORED` record lists the paths and digests (in its encrypted payload), never the content. After a compaction at the normal limit this happens only when the turn goes on.

**Symlinks and the tool allowlist.** A path is checked against the tool's allowlist both as named and as where it really leads. A file that is a symlink to `.env`, to AMC's own folder or to somewhere outside the workspace is refused, whatever its name.

`amc session show <id>` prints all of this in plain words, one line per turn.

## Checks after a turn that changed files

**What is always recorded.** At the end of every turn AMC writes one signed record that says whether the turn ran any action that can change files, and whether a check ran after the last of them. It is one of four states: the turn changed nothing; it changed files and a check ran afterwards and passed; it changed files and a check ran afterwards and failed; or it changed files and no check ran afterwards. `amc session show` prints the last two right under the agent's reply for that turn, for example "Turn 3 ran 2 actions that can change files; no check ran afterwards." `amc agent-loop run` and chat print the same line next to the reply. AMC does not try to read what the agent claims; it puts the record beside the claim.

**What counts as a change.** Writing or editing a file, applying a patch, and every action whose effect AMC cannot see from the record: a shell command, a terminal or background job, a delegated child agent, a workflow and every tool from an MCP server. AMC does not guess from a command's text whether it wrote anything, so a shell command always counts as "may have changed files". A call that was refused before it ran does not count. Reading, searching and listing never count. The count is of actions, not of files.

**What counts as a check.** Only a check AMC itself ran: a check you chose with `--validate`, or one set up for the workspace (below). If the agent runs your test command by itself, that is not counted, because the command it ran is only in the call's stored content, which a verifier may not be able to read. A check that ran before the last change does not count. A check that was refused, needed an approval nobody gave, or ran out of time leaves the turn "changed, no check ran afterwards", with the reason.

**Setting up checks for a workspace.** Add the commands to `.amc/tools.yaml` under `tools`, then sign the file again with `amc tools sign`:

```yaml
tools:
  afterEdits:
    checks:
      - id: tests
        title: Unit tests
        command: npm test
        timeoutMs: 120000
```

One to eight checks; `timeoutMs` is optional (two minutes when left out). AMC never takes a check command from the agent or from a file in the project (such as `package.json` or `AGENTS.md`): that would let the project's own content choose commands AMC runs. Only a person who can sign `.amc/tools.yaml` sets them. An unsigned or changed file is not used.

**When AMC continues a turn.** When checks are set up, and a turn would end after changing files with no check afterwards, AMC does not accept the agent's final answer yet. It runs the checks itself, through the same path as `--validate`: the same shell tool, the same sandbox, the same approval rules and time limits. AMC never approves a check for you; if the check needs your approval, you are asked, and if nobody approves it the turn ends as "no check ran afterwards". If a check fails, AMC sends its output back to the agent once, marked as data and not instructions, and the turn continues. If the agent changes files again, the checks run once more and the turn ends as passed or failed. There is at most one such continuation per turn, and it counts toward the turn's step limit and the run's limits like any other step. With `--validate`, those checks run instead and nothing more is added. With no checks set up, nothing runs; the record still says whether the turn was checked.

**Turning it off for one run.** `amc agent-loop run --no-verify-on-stop` and `amc agent-loop chat --no-verify-on-stop` skip the workspace checks for that run. Each turn's record says that checks were off.

**On by default where.** The switch is the signed list itself: AMC runs the checks in every workspace that has them in `.amc/tools.yaml`. `amc init --coding` and `amc init --regulated` do not add any, because AMC cannot know a project's test command; until a person adds them, those workspaces record each turn's status and run nothing.

**Verification.** `amc agent-loop verify` works out each turn's status again from the turn's own records and fails the session when the recorded status does not match.

**After an edit to a JSON file.** When `fs.write`, `fs.edit` or `apply_patch` leaves a `.json` file that does not parse as strict JSON, the tool result gets one extra line saying so. This is the only check of its kind: it needs nothing installed and runs no project code. Files that allow comments, like `tsconfig.json`, may ignore it. There is no other syntax check, linter or language server after edits.

## Not in this slice

- Rewind of files and conversation (`amc session rewind`) is deferred: it needs a checkpoint store that works without vault-backed blob keys, a conflict check against the last recorded `afterSha256` of each file, a live-writer fence on fork, and a composed path that gives the child a truthful identity. Conversation-only rewind remains available as `--fork-from <id>` at the latest sealed turn.
- Deterministic keyless replay of a recorded session, thinking-budget controls for Anthropic and OpenAI Responses, focused compaction instructions and `.amc/rules/*.md` remain deferred as listed in the SH-LOOP plan.
