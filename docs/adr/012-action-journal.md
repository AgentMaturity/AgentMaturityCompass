# ADR 012: Action journal and receipt states

Status: proposed. Implemented for the native tool pipeline. Owner: P1-03. Date: 2026-10-08.

## Context

A consequential tool call left evidence only after its outcome. A recorder failure after a payment left a missing row
(gap G24), and a crash between dispatch and result left no statement of what was attempted. A body that threw was
reported as a plain error, and a call aborted after dispatch as `CANCELLED`, although its effect may have happened.
ToolHub wrote a `tool_action` row before `runTool` and a `tool_result` row after, with no state machine. The P0-11
threat model makes failure rows 1 (authority or evidence store unavailable), 2 (recorder fails after the effect),
3 (process dies between dispatch and receipt), 7 (model or provider outage) and 8 (telemetry exporter down) normative.

## Decision

- **States and transitions.** `src/actions/receiptStates.ts` defines `requested`, `authorized`, `started`,
  `completed`, `denied`, `cancelled` and `outcome_unknown`, and `ALLOWED_TRANSITIONS`. Nothing leaves `started` except
  `completed` or `outcome_unknown`; `outcome_unknown` leaves only through reconciliation (P1-04). A receipt may repeat
  its predecessor's state only to mark the evidence incomplete.
- **Journal.** `src/actions/actionJournal.ts` writes migration 12's `action_executions` (an index of each chain's
  head) and `action_transitions` (append-only by trigger). Each transition is one `BEGIN IMMEDIATE` transaction: verify
  the whole chain and derive the current state from it, never from the index row; check the transition; append the
  canonical `amc.action-receipt/v1` as a signed `ACTION_STATE` audit row with a `v: 2` receipt of kind `action_state`
  over its bytes (the P1-01 `receipt` contract); append the transition; rewrite the index row. Times come from AMC's
  clock inside the transaction. The journal refuses to open with `synchronous` OFF or NORMAL, or under
  `AMC_NO_SIGN=1`. Each row gets its own ledger session (`action-<executionId>-<seq>`), sealed in the same transaction
  as the native budget journal does, so ledger verification never meets an unsealed one. `action_executions` adds
  `session_id` and `call_id` (the agent's native session and call) to the issue's table, so recovery and coverage can
  find a session's calls, and receipts carry `workspaceId` and `agentId`.
- **Intent before dispatch.** `started` commits an `amc.action-intent/v1` built inside the journal from the
  authorization record whose digest the chain authorized: digests, the owner process and AMC's clock, never arguments.
  The body runs only after that commit; a running body refreshes a heartbeat every 10 s.
- **Pipeline.** Calls in the authorized classes are journaled when a composition supplies `journal` (the native agent
  toolset opens one on first use). Order: `request`, then `blocked_by_unreconciled` if the agent has an
  `outcome_unknown` execution, one with incomplete evidence, or a `started` one whose owner died or whose heartbeat is
  stale; then approval, guards and binding, `authorize`, the block read again (the approval wait can last minutes),
  the P1-02 recheck and consume, `start`, the body, `complete` or `markUnknown`, the recorder. Everything from the
  guards to the body is synchronous. `start` reads the block a third time inside its own transaction and refuses
  (`ActionBlocked`), so no other call or process can start past it between the check and the write. Every refusal before
  `started` is a `denied` receipt; an abort before it is `cancelled`. A journal that cannot write before `started`
  denies `journal_unavailable` and nothing is dispatched (row 1).
- **Effect classification.** A body may declare `effect` and `externalRef`. Declared `applied` or `not_applied` is
  `completed` with that effect; `unknown` is `outcome_unknown`; undeclared is `completed` with a null effect except for
  `FINANCIAL`, `DATA_EXPORT` and `IDENTITY` (`effect_not_declared`); `DefiniteFailureError` is `completed` /
  `not_applied`; any other throw is `outcome_unknown` (`body_threw_ambiguous`).
- **Recorder failure (row 2).** The effect and its outcome stand; the chain gets an evidence-incomplete receipt
  (`evidence_incomplete:recorder_failed`), which blocks the agent's later journaled calls. If a post-dispatch receipt
  cannot be written at all, the execution stays `started` for recovery and blocks the agent in this process.
- **Cancellation.** The native seam reports `CANCELLED` for a journaled call only when its receipt is `cancelled`;
  after `started` it reports `OK`, `ERROR` or `TOOL_OUTCOME_UNKNOWN`.
- **Recovery (row 3).** `src/actions/actionRecovery.ts` runs when the journal opens and from `recoverSession`. A
  `started` execution whose owner (read from its committed intent) died on this host, or whose heartbeat is older than
  60 s on another host, becomes `outcome_unknown` (`process_died`); a `requested` or `authorized` one whose owner died
  becomes `cancelled`. It never dispatches. The synthetic `TOOL_OUTCOME_UNKNOWN` session row names the `executionId`.
- **Provider outage (row 7).** When the loop gives up on a model request in a session with journaled executions, an
  incident is recorded through `createIncidentStore` (trigger type `ASSURANCE_FAILURE`, the nearest the incident table
  accepts). The turn ends there, so no `started` follows.
- **Telemetry (row 8).** The exporter counts what it drops; the journal writes at most one `TELEMETRY_DROPPED` audit
  row a minute with the count. The journal never depends on the exporter.
- **Action evidence.** `actionEvidenceCoverage` verifies the ledger chain, then counts from rows it re-verified in one
  read snapshot, grouping every execution of a call (from the signed `requested` rows and the index). A broken chain
  dominates its call, more than one execution is unknown and reported, and an unverifiable ledger is not evaluated.
- **Receipt contract.** `parseReceipt` parses v1 payloads with `legacy-receipt` and v2 with `receipt`. `ReceiptKind`
  gains `action_state`, which is always v2.

## Consequences

- Each journaled call costs four FULL-sync commits and a chain verification per transition. `requested` and
  `authorized` are not yet merged into one commit.
- An `outcome_unknown` execution blocks the agent's consequential calls in that workspace until it is reconciled. P1-04
  adds `reconcile()` and the operator's dual-control resolution (`amc action resolve`, docs/RECEIPTS.md); nothing
  replays an ambiguous effect.
- A thrown body in an authorized class is now `TOOL_OUTCOME_UNKNOWN`, not `ERROR`, and blocks the agent: a confined
  `bash` run that was cancelled or whose process tree exit was not proven, or a `web_fetch` refused after its request
  was sent, for example. Invalid `bash` arguments throw `DefiniteFailureError`, since no process starts. Other
  built-in adapters adopt `DefiniteFailureError` where they can prove no effect (P1-04 adds signed effect declarations).
- Every journaled row is a sealed ledger session of its own, so the sessions table grows by about four rows per call.
- Receipt signatures are checked against the workspace's own monitor keys: a local audit trail, not a portable verdict.

## Not done here

- Idempotency keys, adapter propagation and `reconcile()` (delivered by P1-04); writer fencing and resume rules (P2-12); one
  execution API across surfaces and journaling ToolHub's `runTool` (P2-13, P1-54); the hazard-reviewed safe state for
  row 7 (P2-26).
- A pid reused on the same host reads as a live owner until P2-12's fencing tokens.
