/**
 * The action journal (P1-03): an intent committed durably before dispatch and an append-only chain of signed state
 * receipts per consequential execution. See docs/RECEIPTS.md and docs/adr/012-action-journal.md.
 *
 * Every transition is one `BEGIN IMMEDIATE` transaction on the evidence ledger: verify the execution's whole chain,
 * derive the current state from it (never from the index row), check `ALLOWED_TRANSITIONS`, append the receipt as a
 * signed `ACTION_STATE` audit row with a `v: 2` receipt over its canonical bytes, then append the transition and
 * rewrite the index row. Times are AMC's clock, taken inside the transition. Each row gets its own ledger session,
 * sealed in the same transaction (the native budget journal's pattern), so the ledger never holds an unsealed one.
 *
 * Signatures are checked against the workspace's own monitor keys: a local audit trail, not a portable verdict.
 */
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import type Database from "better-sqlite3";
import type { ReceiptV2 } from "../contracts/v1/receipt.js";
import { getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import { openLedger, type Ledger } from "../ledger/ledger.js";
import { ledgerSynchronousMode } from "../ledger/ledgerDurability.js";
import { runImmediateTransaction } from "../ledger/ledgerSessionTransactions.js";
import { noteTelemetryDropped, takeDroppedTelemetry } from "../observability/telemetryDrops.js";
import { verifyReceipt, type ActionReceiptMembers } from "../receipts/receipt.js";
import type { ActionClass } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { DEFAULT_ACTION_STALE_AFTER_MS, recoverUnsettled, type ActionRecoveryReport } from "./actionRecovery.js";
import { authorizationRecordDigest, type AuthorizationRecordV1 } from "./authorizationRecord.js";
import {
  ActionBlocked, actionIntentV1Schema, actionReceiptV1Schema, JournalUnavailable, ReceiptChainBroken, receiptDigest, transitionAllowed,
  TransitionRefused, type ActionIntentV1, type ActionReceiptV1, type EffectState, type ReceiptState, type Resolution
} from "./receiptStates.js";

/** Marks the journal's ledger sessions, one per receipt row: `action-<executionId>-<seq>`. */
export const ACTION_JOURNAL_BINARY = "amc-action-journal";
const ENFORCEMENT = { level: "enforced", boundary: "tool-pipeline" } as const;
const TELEMETRY_ROW_EVERY_MS = 60_000;
let lastTelemetryRowTs = 0;
/** Executions whose post-dispatch receipt could not be written, by `workspaceId\0agentId`. They block until restart. */
const unreconciledInProcess = new Map<string, Set<string>>();

export interface ActionRequest {
  readonly executionId: string;
  readonly agentId: string;
  readonly toolName: string;
  readonly actionClass: ActionClass;
  /** The agent's session and call, for recovery and evidence coverage. */
  readonly sessionId: string | null;
  readonly callId: string;
  readonly parentExecutionId: string | null;
  /** AMC's key from the authorization record (P1-04); the unique index refuses its reuse in this workspace. */
  readonly idempotencyKey: string | null;
}

/** A reconciliation (P1-04): the head it settles, what the system of record showed or an operator stated, and who. */
export interface Settlement {
  /** `receiptDigest` of the head this settles. A chain that moved since it was read is refused. */
  readonly headDigest: string;
  readonly resolution: Resolution;
  readonly effect: EffectState;
  readonly externalRef: string | null;
  /** False keeps the execution blocking: what was observed contradicts what was authorized. */
  readonly evidenceComplete: boolean;
  readonly reasonCode: string;
  /** The `v: 2` receipt's `reconciliation.method` and `evidenceRefs`. */
  readonly method: string;
  readonly evidenceRefs: readonly string[];
  /** Digest of the observation or statement; used only when the head is `outcome_unknown`, which has no outcome yet. */
  readonly outcomeDigest: string;
  /** Written to the signed evidence row beside the receipt: who stated it, or what the adapter reported. */
  readonly meta: Readonly<Record<string, unknown>>;
}

export interface ActionExecutionView {
  readonly executionId: string;
  readonly state: ReceiptState;
  readonly effect: EffectState | null;
  readonly evidenceComplete: boolean;
  readonly intent: ActionIntentV1 | null;
  readonly receipts: readonly ActionReceiptV1[];
}

export interface ChainVerification {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly receipts: readonly ActionReceiptV1[];
  /** The verified `v: 2` receipt id of each receipt, by `seq`. */
  readonly receiptIds: ReadonlyMap<number, string>;
}

export interface UnsettledExecution {
  readonly executionId: string;
  readonly agentId: string;
  readonly state: ReceiptState;
  readonly ownerPid: number | null;
  readonly ownerHost: string | null;
  readonly heartbeatTs: number | null;
}

export interface ActionJournal {
  readonly workspace: string;
  readonly workspaceId: string;
  /** What recovery did when this journal opened. */
  readonly recovery: ActionRecoveryReport;
  request(input: ActionRequest): ActionReceiptV1;
  authorize(executionId: string, authorizationDigest: string): ActionReceiptV1;
  deny(executionId: string, reasonCode: string): ActionReceiptV1;
  cancel(executionId: string, reasonCode: string): ActionReceiptV1;
  /** Commits the intent, built here from the authorization record the chain authorized. Dispatch only after this returns. */
  start(executionId: string, record: AuthorizationRecordV1): ActionReceiptV1;
  complete(executionId: string, result: { readonly effect: EffectState | null; readonly outcomeDigest: string;
    readonly externalRef: string | null; readonly reasonCode: string }): ActionReceiptV1;
  markUnknown(executionId: string, reasonCode: string): ActionReceiptV1;
  markEvidenceIncomplete(executionId: string, reasonCode: string): ActionReceiptV1;
  /** Reconciliation (P1-04): `completed` from `outcome_unknown`, or evidence restored on a `completed` execution. */
  settle(executionId: string, settlement: Settlement): ActionReceiptV1;
  heartbeat(executionId: string): void;
  get(executionId: string): ActionExecutionView | null;
  /**
   * Executions of this agent that block its journaled calls: `outcome_unknown`, evidence incomplete, or `started` with a
   * dead owner or a heartbeat older than the staleness window. `start` re-reads this inside its own transaction.
   */
  blockingExecutions(scope: { readonly workspaceId: string; readonly agentId: string }): string[];
  verifyReceiptChain(executionId: string): ChainVerification;
  /** Executions not yet in a terminal state, from the index; each transition re-verifies its chain. */
  unsettled(): UnsettledExecution[];
  /** Keep an execution blocking this agent's journaled calls for the life of this process (a chain that cannot be settled). */
  block(executionId: string, agentId: string): void;
  close(): void;
}

interface Change {
  /** Absent: the head's own state, which only marks the evidence incomplete. */
  readonly to?: ReceiptState;
  readonly reasonCode: string;
  readonly evidenceComplete?: boolean;
  readonly effect?: EffectState | null;
  readonly outcomeDigest?: string | null;
  readonly externalRef?: string | null;
  readonly authorizationDigest?: string;
  readonly request?: ActionRequest;
  readonly settlement?: Settlement;
  /** Builds the intent from the verified head; throwing refuses the transition before anything is written. */
  readonly intent?: (head: ActionReceiptV1) => ActionIntentV1;
  /** A precondition read inside the transaction, against the verified head; throwing refuses before anything is written. */
  readonly guard?: (head: ActionReceiptV1) => void;
}

interface TransitionRow { seq: number; receipt_json: string; receipt_digest: string; evidence_event_id: string }

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Verify one execution's chain: consecutive `seq`, canonical bytes matching their digest, `prevReceiptDigest` links,
 * allowed transitions only, one agent and this workspace throughout, the index row naming the head, and for every
 * receipt the signed ACTION_STATE evidence row and its `v: 2` receipt binding the same bytes and state.
 */
export function verifyChainIn(ledger: { readonly workspace: string; readonly db: Database.Database }, executionId: string): ChainVerification {
  const { db, workspace } = ledger;
  const rows = db.prepare("SELECT seq, receipt_json, receipt_digest, evidence_event_id FROM action_transitions WHERE execution_id = ? ORDER BY seq")
    .all(executionId) as TransitionRow[];
  const index = db.prepare("SELECT last_receipt_digest FROM action_executions WHERE execution_id = ?").get(executionId) as
    { last_receipt_digest: string } | undefined;
  const errors: string[] = [];
  const receipts: ActionReceiptV1[] = [];
  const receiptIds = new Map<number, string>();
  const workspaceId = workspaceIdFromDirectory(workspace);
  const events = new Set<string>();
  let keys: string[] | null = null;
  rows.forEach((row, position) => {
    const fail = (problem: string): void => { errors.push(`seq ${row.seq}: ${problem}`); };
    if (row.seq !== position) fail(`expected seq ${position}: a receipt is missing or out of order`);
    if (sha256Hex(row.receipt_json) !== row.receipt_digest) fail("receipt bytes do not match their digest");
    const parsed = actionReceiptV1Schema.safeParse(parseJson(row.receipt_json));
    if (!parsed.success) return fail(`receipt is not an amc.action-receipt/v1: ${parsed.error.issues[0]?.message ?? "invalid"}`);
    const receipt = parsed.data;
    const previous = receipts.at(-1) ?? null;
    if (canonicalize(receipt) !== row.receipt_json) fail("receipt is not in canonical form");
    if (receipt.executionId !== executionId || receipt.seq !== row.seq) fail("receipt names another execution or position");
    if (receipt.workspaceId !== workspaceId) fail(`receipt names workspace ${receipt.workspaceId}, not ${workspaceId}`);
    if (previous !== null && receipt.agentId !== previous.agentId) fail("receipt names another agent");
    if (previous !== null && receipt.idempotencyKey !== previous.idempotencyKey) fail("receipt names another idempotency key");
    if (receipt.prevReceiptDigest !== (position === 0 ? null : rows[position - 1]!.receipt_digest)) fail("broken link to the previous receipt");
    if (receipt.previousState !== (previous?.state ?? null) || !transitionAllowed(previous, receipt)) {
      fail(`${previous?.state ?? "none"} -> ${receipt.state} is not an allowed transition`);
    }
    if (events.has(row.evidence_event_id)) fail("evidence row already used by another receipt");
    events.add(row.evidence_event_id);
    keys ??= getPublicKeyHistory(workspace, "monitor");
    const evidence = checkEvidence(db, row, receipt, keys);
    if ("problem" in evidence) fail(evidence.problem);
    else {
      receiptIds.set(row.seq, evidence.payload.receipt_id);
      const from = "reconciliation" in evidence.payload ? evidence.payload.reconciliation?.fromReceiptId : undefined;
      if (from !== undefined && from !== receiptIds.get(row.seq - 1)) fail("reconciliation names another receipt than the one it follows");
    }
    receipts.push(receipt);
  });
  if (rows.length > 0 && index?.last_receipt_digest !== rows.at(-1)!.receipt_digest) errors.push("the index row does not name the chain head");
  if (rows.length === 0 && index !== undefined) errors.push("the index row names an execution with no receipts");
  return { ok: errors.length === 0, errors, receipts, receiptIds };
}

type EvidenceCheck = { readonly problem: string } | { readonly payload: ReceiptV2 };

function checkEvidence(db: Database.Database, row: TransitionRow, receipt: ActionReceiptV1, keys: string[]): EvidenceCheck {
  const problem = (text: string): EvidenceCheck => ({ problem: text });
  const event = db.prepare("SELECT event_type, session_id, payload_inline, payload_sha256, meta_json, event_hash, writer_sig FROM evidence_events WHERE id = ?")
    .get(row.evidence_event_id) as { event_type: string; session_id: string; payload_inline: string | null; payload_sha256: string;
      meta_json: string; event_hash: string; writer_sig: string } | undefined;
  if (event === undefined) return problem("evidence row missing");
  // A pruned payload leaves its digest, which the signed event hash and receipt still bind.
  if (event.event_type !== "audit" || event.payload_sha256 !== row.receipt_digest
    || (event.payload_inline !== null && event.payload_inline !== row.receipt_json)) return problem("evidence row does not carry this receipt");
  const meta = (parseJson(event.meta_json) ?? {}) as Record<string, unknown>;
  if (meta.auditType !== "ACTION_STATE" || meta.executionId !== receipt.executionId || meta.seq !== receipt.seq) return problem("evidence row is for another receipt");
  if (!verifyHexDigestAny(event.event_hash, event.writer_sig, keys)) return problem("evidence row signature does not verify");
  const signed = typeof meta.receipt === "string" ? verifyReceipt(meta.receipt, keys) : null;
  const payload = signed?.ok ? signed.payload : null;
  if (payload?.v !== 2) return problem(`signed receipt does not verify${signed?.error ? `: ${signed.error}` : ""}`);
  const reconciled = "reconciliation" in payload && payload.reconciliation !== undefined;
  if (payload.kind !== "action_state" || payload.executionId !== receipt.executionId || payload.state !== receipt.state
    || payload.body_sha256 !== row.receipt_digest || payload.event_hash !== event.event_hash || payload.session_id !== event.session_id
    || payload.authorizationRecordDigest !== receipt.authorizationDigest || payload.idempotencyKey !== receipt.idempotencyKey
    || reconciled !== (receipt.resolution !== null)) return problem("signed receipt does not bind this receipt");
  return { payload };
}

/** Same host: is that process alive? Another host, or no owner recorded: null (unknown here). */
export function ownerAlive(pid: number | null, host: string | null): boolean | null {
  if (host !== hostname() || pid === null) return null;
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Open the journal on the workspace's evidence ledger, then recover what crashed processes left (`recoverUnsettled`).
 * Refuses unless SQLite commits with `synchronous` FULL or EXTRA: an intent that may vanish on power loss is not durable.
 */
export function openActionJournal(workspace: string, options: { readonly staleAfterMs?: number } = {}): ActionJournal {
  if (process.env.AMC_NO_SIGN === "1") throw new JournalUnavailable("AMC_NO_SIGN=1: an unsigned receipt attests to nothing");
  const mode = ledgerSynchronousMode();
  if (mode === "OFF" || mode === "NORMAL") {
    throw new JournalUnavailable(`AMC_LEDGER_SQLITE_SYNCHRONOUS=${mode} could lose a committed intent; use FULL or EXTRA`);
  }
  let ledger: Ledger;
  try {
    ledger = openLedger(workspace);
  } catch (error) {
    throw new JournalUnavailable(`the evidence ledger could not be opened: ${message(error)}`, { cause: error });
  }
  const actual = Number(ledger.db.pragma("synchronous", { simple: true }));
  if (actual < 2) {
    ledger.close();
    throw new JournalUnavailable(`the ledger connection commits with synchronous=${actual}; FULL (2) or EXTRA (3) is required`);
  }
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_ACTION_STALE_AFTER_MS;
  const journal = createJournal(workspace, ledger, staleAfterMs);
  try {
    return { ...journal, recovery: recoverUnsettled(journal, staleAfterMs) };
  } catch (error) {
    journal.close();
    throw error;
  }
}

function createJournal(workspace: string, ledger: Ledger, staleAfterMs: number): ActionJournal {
  const db = ledger.db;
  const workspaceId = workspaceIdFromDirectory(workspace);
  /** This process's executions and their agents, so a failed post-dispatch write can block the right agent. */
  // ponytail: one small entry per journaled call for the life of the journal; prune settled ones if processes run for weeks.
  const agents = new Map<string, string>();

  const verified = (executionId: string): ChainVerification => {
    const chain = verifyChainIn(ledger, executionId);
    if (!chain.ok) throw new ReceiptChainBroken(executionId, chain.errors);
    return chain;
  };

  /**
   * What blocks `agentId`'s journaled calls, except `exclude`. State is read from each chain's latest appended receipt as
   * well as the index row; either one blocks. A `started` execution blocks once its owner is dead on this host or its
   * heartbeat is older than `staleAfterMs`: a live call in flight does not block a parallel one.
   * ponytail: one indexed scan of the agent's unsettled executions per check; add a head-state table if histories grow large.
   */
  const blockingFor = (agentId: string, exclude: string | null): string[] => {
    const staleBefore = Date.now() - staleAfterMs;
    const rows = db.prepare(`SELECT e.execution_id AS id, e.state AS indexState, e.evidence_complete AS indexComplete,
          json_extract(t.receipt_json, '$.state') AS headState, json_extract(t.receipt_json, '$.evidenceComplete') AS headComplete,
          e.owner_pid AS pid, e.owner_host AS host, e.heartbeat_ts AS heartbeat
        FROM action_executions e JOIN action_transitions t ON t.execution_id = e.execution_id
          AND t.seq = (SELECT MAX(x.seq) FROM action_transitions x WHERE x.execution_id = e.execution_id)
        WHERE e.workspace_id = ? AND e.agent_id = ? AND (e.state IN ('started', 'outcome_unknown') OR e.evidence_complete = 0
          OR json_extract(t.receipt_json, '$.state') IN ('started', 'outcome_unknown') OR json_extract(t.receipt_json, '$.evidenceComplete') = 0)`)
      .all(workspaceId, agentId) as Array<{ id: string; indexState: string; indexComplete: number; headState: string; headComplete: number;
        pid: number | null; host: string | null; heartbeat: number | null }>;
    const blocking = rows.filter((row) => row.indexState === "outcome_unknown" || row.headState === "outcome_unknown"
      || row.indexComplete === 0 || row.headComplete === 0
      || row.heartbeat === null || row.heartbeat < staleBefore || ownerAlive(row.pid, row.host) === false).map((row) => row.id);
    return [...new Set([...blocking, ...(unreconciledInProcess.get(`${workspaceId}\0${agentId}`) ?? [])])].filter((id) => id !== exclude);
  };

  /**
   * Another execution in this workspace, of any agent, with the same tool and arguments whose outcome is unknown (P1-04).
   * ponytail: tool and arguments are read from the index row and its intent, so a hand-edited row can hide a duplicate;
   * the agent's own block above reads the receipts too.
   */
  const duplicateOf = (executionId: string, toolName: string, argumentsDigest: string): string | null => {
    const row = db.prepare(`SELECT e.execution_id AS id FROM action_executions e JOIN action_transitions t ON t.execution_id = e.execution_id
          AND t.seq = (SELECT MAX(x.seq) FROM action_transitions x WHERE x.execution_id = e.execution_id)
        WHERE e.workspace_id = ? AND e.execution_id <> ? AND e.tool_name = ? AND json_extract(e.intent_json, '$.argumentsDigest') = ?
          AND (e.state = 'outcome_unknown' OR json_extract(t.receipt_json, '$.state') = 'outcome_unknown') LIMIT 1`)
      .get(workspaceId, executionId, toolName, argumentsDigest) as { id: string } | undefined;
    return row?.id ?? null;
  };

  const block = (executionId: string, agentId: string): void => {
    const key = `${workspaceId}\0${agentId}`;
    unreconciledInProcess.set(key, (unreconciledInProcess.get(key) ?? new Set()).add(executionId));
  };

  const transition = (executionId: string, change: Change): ActionReceiptV1 => {
    try {
      const receipt = runImmediateTransaction(db, () => append(executionId, change, verified(executionId)));
      writeTelemetryDrops(ledger);
      return receipt;
    } catch (error) {
      const failure = error instanceof TransitionRefused || error instanceof ReceiptChainBroken || error instanceof ActionBlocked ? error
        : new JournalUnavailable(message(error), { cause: error });
      const agentId = agents.get(executionId);
      if (agentId !== undefined && (change.to === undefined || change.to === "completed" || change.to === "outcome_unknown")) {
        block(executionId, agentId);
      }
      throw failure;
    }
  };

  const append = (executionId: string, change: Change, chain: ChainVerification): ActionReceiptV1 => {
    const head = chain.receipts.at(-1) ?? null;
    const to = change.to ?? head?.state;
    if (to === undefined) throw new TransitionRefused(executionId, "none", "requested");
    const evidenceComplete = change.evidenceComplete ?? head?.evidenceComplete ?? true;
    const settlement = change.settlement ?? null;
    // Only a settlement leaves outcome_unknown or restores evidence (transitionAllowed); nothing replays the call.
    if (!transitionAllowed(head, { state: to, evidenceComplete, resolution: settlement?.resolution ?? null })) {
      throw new TransitionRefused(executionId, head?.state ?? "none", to);
    }
    if (head !== null) change.guard?.(head);
    const intent = change.intent && head ? change.intent(head) : null;
    const carried = head !== null && head.state === to ? head : null;
    const now = Date.now();
    const receipt: ActionReceiptV1 = actionReceiptV1Schema.parse({
      schema: "amc.action-receipt/v1", executionId, workspaceId, agentId: change.request?.agentId ?? head?.agentId, seq: chain.receipts.length,
      state: to, previousState: head?.state ?? null, reasonCode: change.reasonCode,
      effect: change.effect !== undefined ? change.effect : carried?.effect ?? null, evidenceComplete,
      authorizationDigest: change.authorizationDigest ?? head?.authorizationDigest ?? null,
      intentDigest: intent ? receiptDigest(intent) : head?.intentDigest ?? null,
      idempotencyKey: change.request ? change.request.idempotencyKey : head?.idempotencyKey ?? null,
      resolution: settlement?.resolution ?? null,
      outcomeDigest: change.outcomeDigest !== undefined ? change.outcomeDigest : carried?.outcomeDigest ?? settlement?.outcomeDigest ?? null,
      externalRef: change.externalRef !== undefined ? change.externalRef : carried?.externalRef ?? null,
      at: new Date(now).toISOString(), prevReceiptDigest: head === null ? null : receiptDigest(head)
    });
    const bytes = canonicalize(receipt);
    const digest = sha256Hex(bytes);
    if (head === null) insertExecution(executionId, change, now, digest);
    // A settlement names the verified receipt it settles; the contract refuses to sign one without it.
    const action = { executionId, idempotencyKey: receipt.idempotencyKey, authorizationRecordDigest: receipt.authorizationDigest,
      enforcement: ENFORCEMENT, state: receipt.state, ...(receipt.state === "denied" ? { reason: receipt.reasonCode } : {}),
      ...(settlement === null ? {} : { reconciliation: { fromReceiptId: head === null ? undefined : chain.receiptIds.get(head.seq),
        reconciledAt: receipt.at, method: settlement.method, evidenceRefs: [...settlement.evidenceRefs] } }) } as ActionReceiptMembers;
    const sessionId = `action-${executionId}-${receipt.seq}`;
    ledger.startSession({ sessionId, runtime: "unknown", binaryPath: ACTION_JOURNAL_BINARY, binarySha256: "action-journal" });
    const evidence = ledger.appendEvidenceWithReceipt({
      sessionId, runtime: "unknown", eventType: "audit", payload: bytes, inline: true,
      // An operator's resolution is what the operator stated, never something AMC observed.
      meta: { trustTier: settlement?.resolution === "operator" ? "SELF_REPORTED" : "OBSERVED", auditType: "ACTION_STATE", executionId,
        seq: receipt.seq, state: receipt.state, reasonCode: receipt.reasonCode, evidenceComplete, agentId: receipt.agentId,
        ...(settlement === null ? {} : { resolution: settlement.resolution, resolutionDetail: settlement.meta,
          claimKind: settlement.resolution === "operator" ? "self_reported" : "observed" }),
        // The signed tie from an execution to the native session call it serves, so coverage need not trust the index.
        ...(change.request ? { agentSessionId: change.request.sessionId, callId: change.request.callId } : {}) },
      receipt: { kind: "action_state", agentId: receipt.agentId, providerId: ACTION_JOURNAL_BINARY, model: null, bodySha256: digest, action }
    });
    ledger.sealSession(sessionId);
    db.prepare("INSERT INTO action_transitions (execution_id, seq, receipt_json, receipt_digest, evidence_event_id) VALUES (?, ?, ?, ?, ?)")
      .run(executionId, receipt.seq, bytes, digest, evidence.id);
    db.prepare(`UPDATE action_executions SET state = ?, effect = ?, evidence_complete = ?, authorization_digest = ?,
        intent_json = COALESCE(?, intent_json), owner_pid = CASE WHEN ? THEN ? ELSE owner_pid END,
        owner_host = CASE WHEN ? THEN ? ELSE owner_host END, heartbeat_ts = CASE WHEN ? THEN ? ELSE heartbeat_ts END,
        updated_ts = ?, last_receipt_digest = ? WHERE execution_id = ?`)
      .run(receipt.state, receipt.effect, evidenceComplete ? 1 : 0, receipt.authorizationDigest, intent ? canonicalize(intent) : null,
        intent ? 1 : 0, process.pid, intent ? 1 : 0, hostname(), intent ? 1 : 0, now, now, digest, executionId);
    return receipt;
  };

  const insertExecution = (executionId: string, change: Change, now: number, digest: string): void => {
    const request = change.request;
    if (request === undefined) throw new TransitionRefused(executionId, "none", change.to ?? "requested");
    // The index row is written first so the transition's foreign key holds; it names the head once the receipt exists.
    db.prepare(`INSERT INTO action_executions (execution_id, workspace_id, agent_id, tool_name, action_class, state, effect,
        evidence_complete, idempotency_key, parent_execution_id, session_id, call_id, owner_pid, owner_host, heartbeat_ts, created_ts,
        updated_ts, last_receipt_digest) VALUES (?, ?, ?, ?, ?, 'requested', NULL, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(executionId, workspaceId, request.agentId, request.toolName, request.actionClass, request.idempotencyKey, request.parentExecutionId,
        request.sessionId, request.callId, process.pid, hostname(), now, now, now, digest);
  };

  return {
    workspace,
    workspaceId,
    recovery: { outcomeUnknown: [], cancelled: [], integrityFailures: [] },
    request(input) {
      agents.set(input.executionId, input.agentId);
      return transition(input.executionId, { to: "requested", reasonCode: "requested", request: input });
    },
    authorize: (executionId, authorizationDigest) => transition(executionId, { to: "authorized", reasonCode: "authorized", authorizationDigest }),
    deny: (executionId, reasonCode) => transition(executionId, { to: "denied", reasonCode }),
    cancel: (executionId, reasonCode) => transition(executionId, { to: "cancelled", reasonCode }),
    start: (executionId, record) => transition(executionId, { to: "started", reasonCode: "dispatching", guard: (head) => {
      // Atomic with the write: no call of this agent starts while another is unreconciled, whatever another process did
      // since the caller last looked. The agent is the one the verified chain names.
      const blocking = blockingFor(head.agentId, executionId);
      if (blocking.length > 0) throw new ActionBlocked(executionId, blocking[0]!);
      // Never repeat (P1-04): no second dispatch of an intent whose first dispatch has an unknown outcome.
      const duplicate = duplicateOf(executionId, record.action.toolName, record.action.argumentsDigest);
      if (duplicate !== null) throw new ActionBlocked(executionId, duplicate, "possible_duplicate_of");
    }, intent: (head) => {
      // The intent comes from the record the chain authorized, checked against the authorized digest, never from a caller.
      const digest = authorizationRecordDigest(record);
      if (digest !== head.authorizationDigest || record.executionId !== executionId || record.idempotencyKey !== head.idempotencyKey) {
        throw new TransitionRefused(executionId, head.state, "started");
      }
      return actionIntentV1Schema.parse({
        schema: "amc.action-intent/v1", executionId, authorizationId: record.authorizationId, authorizationDigest: digest, workspaceId,
        agentId: record.subject.governedAs, toolName: record.action.toolName, adapterId: record.action.adapterId,
        actionClass: record.action.actionClass, argumentsDigest: record.action.argumentsDigest, bindings: record.bindings,
        idempotencyKey: record.idempotencyKey,
        parentExecutionId: record.delegation.parentExecutionId || null, sessionId: record.session.sessionId || null, callId: record.session.callId,
        owner: { pid: process.pid, hostname: hostname() }, startedAt: new Date().toISOString()
      });
    } }),
    complete: (executionId, result) => transition(executionId, { to: "completed", reasonCode: result.reasonCode, effect: result.effect,
      outcomeDigest: result.outcomeDigest, externalRef: result.externalRef }),
    markUnknown: (executionId, reasonCode) => transition(executionId, { to: "outcome_unknown", reasonCode }),
    markEvidenceIncomplete: (executionId, reasonCode) =>
      transition(executionId, { reasonCode: `evidence_incomplete:${reasonCode}`, evidenceComplete: false }),
    settle: (executionId, settlement) => transition(executionId, { to: "completed", reasonCode: settlement.reasonCode,
      effect: settlement.effect, externalRef: settlement.externalRef, evidenceComplete: settlement.evidenceComplete, settlement,
      guard: (head) => {
        // Settles exactly the head that was read, and never contradicts an effect the body already declared.
        if (receiptDigest(head) !== settlement.headDigest || (head.effect !== null && head.effect !== settlement.effect)) {
          throw new TransitionRefused(executionId, head.state, "completed");
        }
      } }),
    heartbeat(executionId) {
      try {
        db.prepare("UPDATE action_executions SET heartbeat_ts = ? WHERE execution_id = ? AND state = 'started'").run(Date.now(), executionId);
      } catch (error) {
        throw new JournalUnavailable(message(error), { cause: error });
      }
    },
    get(executionId) {
      const { receipts } = verified(executionId);
      const head = receipts.at(-1);
      if (head === undefined) return null;
      const row = db.prepare("SELECT intent_json FROM action_executions WHERE execution_id = ?").get(executionId) as { intent_json: string | null };
      const intent = row.intent_json === null ? null : actionIntentV1Schema.parse(JSON.parse(row.intent_json));
      if ((intent === null ? null : receiptDigest(intent)) !== head.intentDigest) throw new ReceiptChainBroken(executionId, ["stored intent does not match the receipts"]);
      return { executionId, state: head.state, effect: head.effect, evidenceComplete: head.evidenceComplete, intent, receipts };
    },
    blockingExecutions: ({ workspaceId: scope, agentId }) => (scope === workspaceId ? blockingFor(agentId, null) : []),
    verifyReceiptChain(executionId) {
      const chain = verifyChainIn(ledger, executionId);
      return chain.receipts.length === 0 && chain.errors.length === 0 ? { ...chain, ok: false, errors: ["no receipts for this execution"] } : chain;
    },
    block,
    unsettled: () => (db.prepare(`SELECT execution_id AS executionId, agent_id AS agentId, state, owner_pid AS ownerPid, owner_host AS ownerHost,
        heartbeat_ts AS heartbeatTs FROM action_executions WHERE state IN ('requested', 'authorized', 'started')`).all() as UnsettledExecution[]),
    close: () => ledger.close()
  };
}

/** At most one TELEMETRY_DROPPED row a minute, with the count since the last one. A failed write gives the count back. */
function writeTelemetryDrops(ledger: Ledger): void {
  const now = Date.now();
  if (now - lastTelemetryRowTs < TELEMETRY_ROW_EVERY_MS) return;
  const dropped = takeDroppedTelemetry();
  if (dropped === 0) return;
  try {
    const sessionId = `telemetry-dropped-${randomUUID()}`;
    const payload = JSON.stringify({ auditType: "TELEMETRY_DROPPED", dropped, sinceTs: lastTelemetryRowTs || null, ts: now });
    runImmediateTransaction(ledger.db, () => {
      ledger.startSession({ sessionId, runtime: "unknown", binaryPath: ACTION_JOURNAL_BINARY, binarySha256: "action-journal" });
      ledger.appendEvidence({ sessionId, runtime: "unknown", eventType: "audit", payload, inline: true,
        meta: { trustTier: "OBSERVED", auditType: "TELEMETRY_DROPPED", dropped } });
      ledger.sealSession(sessionId);
    });
    lastTelemetryRowTs = now;
  } catch {
    noteTelemetryDropped(dropped);
  }
}
