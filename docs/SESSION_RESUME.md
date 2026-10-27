# Native session resume and recovery

AMC can continue an eligible unsealed native SQLite or JSONL session using `amc agent-loop run --session <id>`. End the previous run with `--keep-open` to record a signed handover. Both backends require the original agent, execution composition and policy: provider/model, tool scope, step/token limits, approval and validation selection. Changing those settings is not a resume of the original execution contract. A closed session can be used as the parent of a new run with `--fork-from <id>`.

The original process owns its session from `session/open` until signed release or close. Completing a turn does not release ownership. A second process receives `LIVE_WRITER` while that owner is alive, including between sealed turns. The writer identity comes from the actual local process; caller-provided claimant fields are retained only as audit information.

SQLite checks the signed writer token, exact preceding event ID/hash/sequence, next envelope and closed state in the same immediate transaction as each native append. A stale writer or losing claim cannot append a row or materialize a payload. The session persistence API writes one native event at a time; batches containing owned native session writes are refused before any batch payload is written, including mixed legacy/native batches.

Governed workspace tools and delegated children record their audits through that same owning writer. CLI composition binds the tool recorder after a new, resumed or forked session is selected, so a fork's evidence follows its actual session ID. Supplying a session ID alone does not grant raw-ledger write authority.

After a demonstrably dead local owner, recovery acknowledges a pending unsealed turn before resume. A recorded `turn/end` without its `turn/seal` still needs this acknowledgement; the existing end and tool outcomes are preserved. Unanswered tool calls receive synthetic unknown-outcome results and are never dispatched again. Recovery seals its acknowledgement and releases its claim. A failed recovery attempts a token-checked release so a retry in the same process can continue safely. If storage also prevents that release, AMC reports the combined failure instead of claiming recovery succeeded.

`force` and a zero staleness window can bypass the recovery age wait; they cannot bypass a live or unknown owner. Dropping a service/database handle, including the test helper `simulateCrash()`, is not proof that its process died. A foreign-host owner and an owner whose local liveness cannot be established are refused unless an operator takes the session over explicitly (below). PID reuse may conservatively require waiting for that process to exit.

## Writer fencing, leases and takeover (P2-12)

Every native row's signed writer meta is version 2: `{ v: 2, token, pid, hostId, state, epoch, leaseMs }`. It is the session's fencing token, signed with the row by the workspace `ledger-row` key and chained to the head it follows.

- **Epochs.** `session/open` claims epoch 1. Every later claim (`session/resume`, `session/recovery-claim`) must raise the epoch of the signed row it follows by exactly one; the store checks this inside the same immediate transaction (SQLite) or writer mutex (JSONL) as the append. A row written by a version-1 writer reads as epoch 0.
- **Fence at append.** An append whose writer is no longer the one the last signed row names is refused `STALE_EPOCH` ("a newer writer claimed this session; no further effects are dispatched by this process") before anything is written. An unreadable writer meta (an unknown token version) is refused `UNSUPPORTED_OWNER`. A version-1 row after a version-2 writer is refused `INVALID_FENCE`: the epoch cannot be downgraded.
- **Fence at dispatch.** Before every model request (`src/agent/stepRunner.ts`) and before every governed tool body (the toolset's writer check, after any approval wait), the writer re-reads the session's last signed row and refuses `STALE_EPOCH` unless it still names this writer at its own epoch. A paused process that wakes after a takeover dispatches nothing and appends nothing.
- **Refusals are recorded.** A fence refusal at dispatch, and a `STALE_EPOCH` or `UNSUPPORTED_OWNER` refusal at append, writes a signed `SESSION_WRITER_FENCE_REFUSED` audit row (session, code, stage, both writers' tokens and epochs) in its own sealed ledger session, because the refused writer cannot append to the session. If that row cannot be written, the refusal still stands and its message says so.
- **Leases.** A writer's lease (`leaseMs`, default 60,000 ms) is live while the session's last signed row is younger than it. An idle live writer appends a signed `session/heartbeat` row at half the lease, only between turns. A writer inside a long turn writes no heartbeat; its lease can lapse, and only an explicit takeover can then replace it.
- **Takeover.** A released owner, or a local owner whose process is demonstrably dead, is claimed as before. A remote owner, a local owner whose liveness cannot be established, or a live but unresponsive local owner is claimed only with `amc agent-loop run --session <id> --takeover-expired-writer "<reason>"`, and only once its lease has been expired for one more lease by the claimant's clock (one full lease of grace for clock skew). The claim row records the reason, the replaced owner, its epoch, its last row's time (its own clock) and the lease expiry; the claim row's own time is the claimant's clock. The store re-derives the takeover from the row it replaces and refuses a claim whose recorded takeover does not match. Without the option the refusal is `LIVE_WRITER` and names the time after which a takeover is possible. JSONL sessions keep their process-lifetime writer mutex and are not taken over.
- **Anti-rollback.** A passing dispatch check, and a resume, raise this machine's high-water mark for the session journal (`session-journal:<sessionId>@<workspace scope>` in `<AMC home>/state/high-water.json`, the P1-08 store outside every workspace). Resume and recovery refuse a journal whose head is older than the mark (`ROLLBACK_DETECTED`, recovery reports `TAMPERED`) or whose row at the marked sequence holds other bytes (`FORK_DETECTED`). The mark is per machine: a fresh machine starts at none.
- **Migration receipt.** The first version-2 claim on a session whose last writer meta is version 1 is followed by one signed `session/migration` row: `fromVersion` 1, `toVersion` 2, the source head's event id and hash, and the reason. Earlier rows are never rewritten.

Signatures are checked against the workspace's own keys: a local audit trail, not a portable verdict.

## Resume rules for interrupted calls (P2-12)

Resume never runs a tool call again. After recovery has answered each unanswered call with a synthetic `TOOL_OUTCOME_UNKNOWN` result, `reconcileInterruptedCalls` (run by `runComposedTurn` before the resumed turn's first request) applies `resumeRuleFor` (`src/session/resumeRules.ts`) to each such call and appends one signed `tool/reconciled` row with the rule and the result (`completed`, `denied`, `not-found` or `unknown`).

| Call | Rule | On resume |
| --- | --- | --- |
| `READ_ONLY`, not MCP | `may-repeat` | Not reconciled; nothing blocks a new call |
| `fs.write` / `fs.edit` (`WRITE_LOW`, `WRITE_HIGH`) whose file still has its recorded `beforeSha256` (P1-36) | `repeat-with-same-idempotency-key` | Not reconciled; a journaled execution stays blocking until settled |
| `NETWORK_EXTERNAL`, `FINANCIAL`, `DEPLOY`, `DATA_EXPORT`, `IDENTITY`, `SECURITY`, every MCP tool, any other write, an unknown class | `reconcile-first` | An `outcome_unknown` execution is asked of its system of record through `reconcile()` (P1-04) |

The class and execution come from the call's verified receipt chain (P1-03), never from the journal's index row. A crash between an effect and its receipt leaves the execution `started`; recovery records it `outcome_unknown` (`process_died`), never as not run. While any journaled outcome stays unknown the action journal blocks the agent's later consequential calls (`blocked_by_unreconciled`) until `reconcile()` settles it or an operator resolves it with `amc action resolve`. `amc agent-loop run` composes no reconcile adapters, so there an interrupted `reconcile-first` call stays `unknown` and blocking; SDK callers pass `resume.reconcileAdapters`. A `tool/reconciled` row is recorded again on a later resume until the call is settled. A call AMC did not journal has no receipt to reconcile against and is reported `not-found`; under a compiled policy every class is journaled. The model still sees the recovery's unknown-outcome result for an interrupted call.

## Compatibility

The native ACP/SDK/Studio factory reconstructs its own approval and validation
bindings, rechecking the current signed configuration and using the original
accounting journal. It does not infer arbitrary external callbacks or restore an
absent parent's abort subscription. Both backends refuse standalone continuation
of delegated children, parent/hook-stopped sessions and parents with unresolved
children before acquiring a writer or appending crash recovery. A normal user
cancellation does not carry that permanent external-controller refusal.

`AMCNativeClient.processClosed` is a read-only observation of its actual ACP child
close event, not a successful signed release or proof about uncertain effects.
Studio can discard an exited child's obsolete handles after its in-flight work
has settled, without restarting Studio. Refresh only reads original history;
explicit **Resume** reopens an eligible same-session writer, and a **new explicit
turn** is still required before any model or tool request. A live/unknown child
or unsettled preparation/cleanup is never replaced on a timeout assumption.

| Session state/backend | Read and verify | Resume/recovery | Fork |
| --- | --- | --- | --- |
| SQLite with supported signed ownership | Supported | Signed release, confirmed dead local owner, or an explicit recorded takeover after lease expiry required | Supported |
| Legacy native SQLite without signed ownership | Supported; original bytes unchanged | Refused; no implicit ownership migration | Supported with verified parent hash |
| Closed SQLite session | Supported | Resume refused; recovery is a read-only no-op | Supported |
| JSONL with supported signed ownership and complete original evidence | Supported | Explicit release or confirmed dead local owner, original settings, authentic accounting and exclusive local writer required | Verified parent with available JSONL workspace writer |
| Closed or archived JSONL session | Supported | Resume refused; a fully closed native session is a read-only recovery no-op | Explicit fork, never an implicit replacement session |
| JSONL with incomplete tail, incompatible native state or missing original accounting | Available metadata may remain inspectable | Refused without trimming, rewriting or resetting evidence | Only where the original parent authenticates |

## JSONL recovery boundary

JSONL has one writer per workspace, not one per session. All current JSONL writers
hold a process-lifetime exclusive kernel mutex. AMC uses its existing SQLite
binding for the separate `writer.lock.coordination.sqlite` mutex file beside the
JSONL logs. That file is **not a session backend, usage journal or permission
record**. An empty coordinator or operations database cannot supply lost JSONL
history. Do not remove coordination files to try to make a live writer resumable.
The mutex is released by actual process exit; no elapsed timeout authorizes takeover.
Concurrent older binaries that do not implement this mutex, distributed/network
filesystems and cross-host takeover are outside this local-writer contract.

Before append descriptors open, resume authenticates the whole selected store,
native session identity, trust root and complete line boundaries, then repeats
the checks under the mutex. The signed per-session owner and expected head fence
must also permit transfer. The same checks protect CLI, ACP and SDK loading;
Studio adds its authenticated task owner, revision, intent, origin and CSRF rules.
Metadata inspection remains read-only and never grants append permission.

An interrupted turn is closed with signed synthetic recovery facts. An original
successful tool result remains successful evidence; an unanswered call remains
`TOOL_OUTCOME_UNKNOWN`. Outstanding model usage and tool reservations retain their
original identities and amounts. Missing original budget evidence is a refusal,
not a new allowance. An unresolved model reservation can still block the next
turn under the unchanged signed budget policy. Recovery does not fabricate usage,
approve a pending request, rerun an acknowledged side effect, or reinterpret an
unpriced request as free.

Continuation starts only when the operator submits a **new explicit turn**.
Original admitted inputs and pending inbox IDs remain in the signed history and
the recovery-boundary audit, but are not automatically replayed. A released
normally completed turn or user-cancelled turn can accept that new turn. A session
stopped by a parent or policy hook cannot be promoted to an uncontrolled standalone
agent. A delegated child requires its original parent controller; unresolved child
sessions also block standalone parent recovery. Restore or finish the original
controlling workflow rather than dropping its grants, abort signals or stop rules.

Original JSONL bytes are never truncated or silently rewritten. Even a parseable
last record without its newline is not an append-safe boundary. Restore complete
original evidence before trying again. Existing local signing and filesystem
authority do not prove that an entire valid snapshot was never rolled back;
independent saved head/checkpoint evidence remains necessary for that assertion.
Power-loss durability is unchanged. Retained-output decryption is still a
separate authorized operation, not part of metadata eligibility.

In the Node SDK, use `inspectJsonlSessionRecovery({workspace, sessionId, agentId})`
from `agent-maturity-compass/sdk/native` for read-only eligibility, and use the
existing `client.resumeSession(sessionId)` for actual ownership transfer. Readiness
can change before transfer; handle its refusal and refresh rather than falling
back to `newSession()`. Studio shows the same eligible recovery state and requires
**Refresh status** after lost observation or a lost control response.

This document describes the implementation contract. Qualification is recorded
separately under `AMC_OS/RESEARCH/2026-09-10-native-jsonl-writer-resume/` and
`AMC_OS/RESEARCH/2026-09-10-native-recovery-control-gap/`; source authoring alone is
not a passed restart, installed-package, browser or platform test.
