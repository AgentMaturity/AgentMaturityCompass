# RECEIPTS

AMC receipts are compact cryptographic proofs minted by trusted monitor/gateway processes.

## Format (AMC Receipt v1)

```
<base64url(canonical_json_payload)>.<base64url(ed25519_signature)>
```

Payload fields:
- `v`
- `kind` (`llm_request|llm_response|tool_action|tool_result|guard_check|work_accepted`; `action_state` is always v2)
- `receipt_id`
- `ts`
- `agentId`
- `providerId`
- `model`
- `event_hash`
- `body_sha256`
- `session_id`

## How Receipts Are Used

1. Gateway writes signed ledger evidence (`llm_request` / `llm_response`).
2. Gateway mints receipts bound to the event hash.
3. Gateway injects headers:
   - `x-amc-request-id`
   - `x-amc-receipt`
   - `x-amc-monitor-pub-fpr`
4. Runtime traces include receipt values.
5. `amc run` correlates traces with receipts and ledger rows deterministically.

AMC checks every receipt payload against its contract (`legacy-receipt` for v1, `receipt` for v2;
`spec/schemas/v1/`) before it checks the signature. A v1 payload may carry signed members the contract does not
name; they are accepted and left out of the payload AMC returns.

## Action-state receipts (v2)

A consequential action is a tool call in an authorized class: by default every class except `READ_ONLY` and
`WRITE_LOW` (P1-02). Each one gets an append-only chain of receipts in the evidence ledger (P1-03), one per state.

| State | Meaning |
|---|---|
| `requested` | The call entered the tool pipeline. Nothing has run. |
| `authorized` | The authorization record bound. Its digest is on every later receipt. |
| `denied` | Refused before dispatch: blocked, approval, guard, binding or recheck. `reason` names the code. |
| `cancelled` | Stopped before dispatch. A call is never `cancelled` once `started`. |
| `started` | The intent (`amc.action-intent/v1`, digests only) was committed durably. Only then does the body run. |
| `completed` | The body returned. `effect` is `applied`, `not_applied`, or null when the adapter did not declare. |
| `outcome_unknown` | The body was dispatched and AMC cannot say whether the effect happened. |

Allowed transitions: `requested` to `authorized`, `denied` or `cancelled`; `authorized` to `started`, `denied` or
`cancelled`; `started` to `completed` or `outcome_unknown`; `outcome_unknown` to `completed` only through
reconciliation (P1-04). A receipt may repeat its predecessor's state only to mark the evidence incomplete, for example
when the recorder failed after the effect.

**What outcome unknown means.** The effect may or may not have happened: the body threw without proving it had no
effect, it declared `effect: "unknown"`, a `FINANCIAL`, `DATA_EXPORT` or `IDENTITY` body declared no effect, or the
process died after `started`. AMC records it honestly and never replays the call. An `outcome_unknown` execution, one
whose evidence is incomplete, or a `started` one whose process died or whose heartbeat is older than 60 s, blocks the
same agent's later consequential calls (`blocked_by_unreconciled`) until it is reconciled. The block is read when the
call enters, again after any approval wait, and once more inside the transaction that writes `started`, so neither a
long approval wait nor another process can start a call past it. A body that proves no effect happened throws `DefiniteFailureError` and gets `completed` /
`not_applied`. AMC never promises exactly-once delivery: a local ledger cannot make an external effect happen once,
so it records what it knows and refuses to guess.

**Where they live.** Each receipt is a canonical `amc.action-receipt/v1` record in `action_transitions`, hash-linked
to its predecessor (`prevReceiptDigest`), and the payload of a signed `ACTION_STATE` audit row written in the same
SQLite transaction. That row carries a `v: 2` receipt of kind `action_state` whose `body_sha256` is the receipt's
digest, so the chain head is bound to a signed record. Receipts hold digests, never arguments or outputs.
`action_executions` indexes each chain's head. Each row has its own ledger session, sealed in the same transaction.
The journal refuses to open unless SQLite commits with `synchronous=FULL` or `EXTRA`, and under `AMC_NO_SIGN=1`; a
journaled call is then denied `journal_unavailable` and nothing runs.

**Recovery.** When the journal opens, and when a native session is recovered, a `started` execution whose owner
process died on this host, or whose heartbeat is older than 60 s on another host, becomes `outcome_unknown`
(`process_died`); a `requested` or `authorized` one whose owner died becomes `cancelled`. Recovery never dispatches.
A synthetic `TOOL_OUTCOME_UNKNOWN` result names the call's `executionId`.

**Verification.** A chain verifies when its `seq` values are consecutive, every link and transition is allowed, it
names one workspace and one agent, the index row names its head, and each receipt's evidence row and `v: 2` receipt
verify against the workspace's monitor keys and bind the same bytes and state. A deleted, duplicated, reordered or
cross-workspace receipt fails. These are the workspace's own keys: a local audit trail, not a portable verdict.

**Action evidence.** `actionEvidenceCoverage(workspace, sessionId)` counts a session's consequential calls as linked
(exactly one execution, its chain verified, `completed`, evidence complete), unknown (including a call with more than
one execution, also counted as `duplicateExecutions`), unlinked, or integrity failures, which dominate every other
outcome for their call. It verifies the ledger first and counts only rows it re-verified in the same read; a ledger
that fails verification is not evaluated, with the integrity errors. A session with no consequential call is not
evaluated.

## Verification

Receipt verification requires monitor public key(s):
- signature valid,
- `event_hash` exists,
- `body_sha256` matches ledger payload hash,
- agent attribution matches expected route/header attribution.

## Anti-Cheat Impact

When correlation is weak or invalid:
- AMC emits `TRACE_RECEIPT_INVALID`, `TRACE_EVENT_HASH_NOT_FOUND`, `TRACE_BODY_HASH_MISMATCH`, `TRACE_AGENT_MISMATCH`, `TRACE_CORRELATION_LOW`.
- IntegrityIndex is penalized.
- maturity caps are applied for observability/verification/honesty questions.
