---
"agent-maturity-compass": patch
---

On a workspace whose session store is JSONL (`AMC_SESSION_STORE=jsonl`, or a workspace pinned to JSONL), work that needs a second session writer is now refused up front with the typed reason `SESSION_STORE_SINGLE_WRITER`, before anything is opened. `amc agent-loop run --delegate` with in-process delegates exits 1 and says that JSONL admits one session writer per workspace; it used to start the parent turn and then fail the child with `session event store is locked by another writer: database is locked`. A second ACP `session/new`, `session/load` or `session/fork` while another session is open on the connection is refused with `-32602` and `data.reason: "SESSION_STORE_SINGLE_WRITER"` (it used to be `-32603`), and the native SDK raises it as `AMCNativeRefusedError` with that data. Delegation to a foreign runner, and one session at a time over ACP, still work on JSONL. The SQLite store is unchanged.
