# Native session resume and recovery

AMC can continue an eligible unsealed native SQLite or JSONL session using `amc agent-loop run --session <id>`. End the previous run with `--keep-open` to record a signed handover. For JSONL, use the original agent, provider/model, tool scope, step/token limits, validation selection and signed policy. Changing those settings is not a resume of the original execution contract. A closed session can be used as the parent of a new run with `--fork-from <id>`.

The original process owns its session from `session/open` until signed release or close. Completing a turn does not release ownership. A second process receives `LIVE_WRITER` while that owner is alive, including between sealed turns. The writer identity comes from the actual local process; caller-provided claimant fields are retained only as audit information.

SQLite checks the signed writer token, exact preceding event ID/hash/sequence, next envelope and closed state in the same immediate transaction as each native append. A stale writer or losing claim cannot append a row or materialize a payload. The session persistence API writes one native event at a time; batches containing owned native session writes are refused before any batch payload is written, including mixed legacy/native batches.

Governed workspace tools and delegated children record their audits through that same owning writer. CLI composition binds the tool recorder after a new, resumed or forked session is selected, so a fork's evidence follows its actual session ID. Supplying a session ID alone does not grant raw-ledger write authority.

After a demonstrably dead local owner, recovery acknowledges a pending unsealed turn before resume. A recorded `turn/end` without its `turn/seal` still needs this acknowledgement; the existing end and tool outcomes are preserved. Unanswered tool calls receive synthetic unknown-outcome results and are never dispatched again. Recovery seals its acknowledgement and releases its claim. A failed recovery attempts a token-checked release so a retry in the same process can continue safely. If storage also prevents that release, AMC reports the combined failure instead of claiming recovery succeeded.

`force` and a zero staleness window can bypass the recovery age wait; they cannot bypass a live or unknown owner. Dropping a service/database handle, including the test helper `simulateCrash()`, is not proof that its process died. A foreign-host owner and an owner whose local liveness cannot be established are refused. PID reuse may conservatively require waiting for that process to exit; AMC does not claim cross-host lease coordination.

## Compatibility

| Session state/backend | Read and verify | Resume/recovery | Fork |
| --- | --- | --- | --- |
| SQLite with supported signed ownership | Supported | Signed release or confirmed dead local owner required | Supported |
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
separately under `AMC_OS/RESEARCH/2026-09-10-native-jsonl-writer-resume/`; source
authoring alone is not a passed restart, installed-package, browser or platform test.
