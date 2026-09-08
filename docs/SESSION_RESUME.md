# Native session resume and recovery

AMC can continue an unsealed native SQLite session using `amc agent-loop run --session <id>`. End the previous run with `--keep-open` to record a signed handover. A closed session can be used as the parent of a new run with `--fork-from <id>`.

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
| JSONL | Existing reads and verification remain available | **Refused** before opening a writer: atomic ownership takeover is not supported | Existing fork behavior remains available when the JSONL writer lock can be acquired |

JSONL resume/recovery is deliberately unavailable in this version: the current stale-lock replacement cannot guarantee one takeover winner. This restriction does not claim a repair of general JSONL lock acquisition. Native SQLite behavior was exercised with actual concurrent and killed child processes on macOS ARM64/Node 25.5. Other hosts and platforms need their own qualification.
