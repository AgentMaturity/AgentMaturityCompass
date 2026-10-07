---
"agent-maturity-compass": major
---

Breaking: consequential tool calls in the native agent are journaled with signed state receipts, and an ambiguous outcome is reported as unknown and blocks the agent's later consequential calls (P1-03).

- A tool call in an authorized class (by default every class except `READ_ONLY` and `WRITE_LOW`) gets an append-only chain of receipts in the evidence ledger: `requested`, then `authorized` or `denied` or `cancelled`, then `started`, then `completed` or `outcome_unknown`. `started` commits the call's intent (digests only, never arguments) before the tool body runs. Each receipt is the payload of a signed `ACTION_STATE` audit row with a `v: 2` receipt of kind `action_state`, written in the same SQLite transaction. Ledger migration 12 adds the `action_executions` and `action_transitions` tables.
- If the journal cannot be opened or written before dispatch, the call is denied `journal_unavailable` and the tool does not run. The journal refuses to open when `AMC_LEDGER_SQLITE_SYNCHRONOUS` is `OFF` or `NORMAL`, or when `AMC_NO_SIGN=1`.
- A tool body that throws in an authorized class is now `TOOL_OUTCOME_UNKNOWN`, not `ERROR`, unless it throws `DefiniteFailureError` (the adapter proved no effect). A `FINANCIAL`, `DATA_EXPORT` or `IDENTITY` body that does not declare `effect` is also unknown. A journaled call aborted after it started is reported from its receipt, never as `CANCELLED`.
- An `outcome_unknown` execution, or one whose evidence is incomplete (for example because the evidence recorder failed after the effect; the effect and its result stand), denies the same agent's later journaled calls `blocked_by_unreconciled:<executionId>` in that workspace. Nothing is replayed automatically, and AMC never promises exactly-once delivery. Clearing a block needs reconciliation, which P1-04 adds; until then there is no in-product way to clear one.
- When the journal opens, and when a native session is recovered, a started execution whose process died becomes `outcome_unknown` and one that never started becomes `cancelled`; a synthetic `TOOL_OUTCOME_UNKNOWN` session row names the `executionId`. A final model-request failure in a session with journaled actions records an incident. Telemetry the exporter drops is counted in a `TELEMETRY_DROPPED` audit row at most once a minute.
- `parseReceipt` and `verifyReceipt` now check v1 payloads against the `legacy-receipt` contract and accept `v: 2` `action_state` receipts checked against the `receipt` contract. The published `receipt` and `legacy-receipt` schemas add the `action_state` kind.

Receipt signatures are checked against the workspace's own monitor keys: a local audit trail, not a portable verdict.
