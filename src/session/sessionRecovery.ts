// Crash recovery for the session spine. PRINCIPLE: recovery only ever APPENDS —
// it never updates, deletes, or truncates. A crashed session's partial turn
// stays in the log exactly as the crash left it; synthetic, signed, chained
// events are added after it (each carrying synthetic:true inside the hash) to
// make the sequence well-formed. SQLite compares the verified head and claims
// signed writer ownership atomically; JSONL takeover currently fails closed.

import { createHash, randomUUID } from "node:crypto";
import type { EvidenceEvent, EvidenceEventType, RuntimeName } from "../types.js";
import { verifyLedgerIntegrity } from "../ledger/ledgerVerification.js";
import { assertSessionOwnerAvailable, newSessionWriterOwner, readSessionWriter, sessionWriterMeta, SESSION_WRITER_META, SessionWriterRefused } from "./sessionOwnership.js";
import { openSessionEventStore } from "../persistence/openSessionEventStore.js";
import type { SessionEventStore, SessionStoreAppendInput } from "../persistence/sessionEventStore.js";
import { sha256Hex } from "../utils/hash.js";
import {
  embedEnvelope,
  extractEnvelope,
  SESSION_GENESIS,
  type SessionEnvelope,
  type SurfaceOp
} from "./sessionTypes.js";
import { merkleRoot, SESSION_MERKLE_EMPTY } from "./sessionMerkle.js";
import {
  buildStepEndMeta,
  buildTurnEndMeta,
  readStepBoundary,
  readTurnEndMeta,
  type StepBoundary
} from "./turnLifecycleMeta.js";

// RECOVERED   — the session was consistent or was made consistent by appending
//               synthetic events under a won claim.
// TAMPERED    — the per-session chain (prevSessionEventHash / seq) is broken:
//               a tamper finding, never "repaired".
// INDETERMINATE — recovery could not proceed (not stale enough without force, or
//               the claim was lost to another recoverer); nothing was changed.
export type RecoveryVerdict = "RECOVERED" | "TAMPERED" | "INDETERMINATE";

export interface RecoveryClaimant {
  readonly pid: number;
  readonly hostId: string;
  readonly bootId: string;
  readonly startedAt: number;
}

export interface RecoverSessionParams {
  readonly workspace: string;
  readonly sessionId: string;
  readonly claimant: RecoveryClaimant;
  readonly staleAfterMs?: number; // liveness gate; default 60_000
  readonly force?: boolean; // bypass only the age wait; never a live-owner check
  readonly close?: boolean; // also append session/close and seal the row
  /**
   * Store to recover through. Absent, the workspace's pinned backend is opened.
   * Recovery is a SECOND writer taking over after the crashed one is gone, so a
   * single-writer backend must have released its lock (or the owning process
   * must be dead) before this succeeds — which is the correct behaviour: a
   * live writer is not a session to recover.
   */
  readonly store?: SessionEventStore;
}

export interface RecoveryReport {
  readonly verdict: RecoveryVerdict;
  readonly sessionId: string;
  readonly claimEventId: string | null;
  readonly wonClaim: boolean;
  readonly syntheticTurnEnds: number;
  /** Steps the crash left open, closed synthetically with no stop reason and no usage. */
  readonly syntheticStepEnds: number;
  readonly unknownToolOutcomes: number;
  readonly unsealedTailCountBefore: number;
  readonly closed: boolean;
  readonly reason?: string;
}

// Default liveness window, matching SESSION_STALE_AFTER_MS in the verifier. Long
// enough that a slow turn is not misread as a crash, short enough that a dead
// session is surfaced promptly.
const DEFAULT_STALE_AFTER_MS = 60_000;

// The single deterministic body of a synthetic tool result. UNKNOWN, never OK or
// ERROR: the tool may have completed its side effect (a file written, a POST
// sent) before the process died, so asserting either way would be a fabrication.
// It is model-visible on purpose — every provider requires a tool_result for
// each tool_use block — and because it is model-visible it is logged as a blob,
// so its sha256 is the row's own payload_sha256.
const SYNTHETIC_TOOL_RESULT_BODY =
  "[amc:recovery] tool outcome unknown — the process ended before this tool reported a result.";


// A synthetic append. Superset of what the caller needs: eventHash and eventId
// go into the recovery window, so they are returned even for control events.
interface SyntheticRef {
  readonly eventId: string;
  readonly eventHash: string;
  readonly payloadSha256: string;
}

// Appends synthetic session events under a won recovery claim. Holds the
// per-session chain head (seq + prevSessionEventHash) in memory and advances it
// only after a durable commit, exactly like SessionService — recovery is just a
// second writer that takes over after the fence is won. Every event it writes
// carries synthetic:true inside the envelope, and therefore inside event_hash,
// so the marker cannot be stripped without breaking the chain.
class SyntheticAppender {
  private seqCounter: number;
  private prevHash: string;
  private headEventId: string | null;
  private readonly writerOwner = newSessionWriterOwner();

  constructor(
    private readonly store: SessionEventStore,
    private readonly sessionId: string,
    private readonly runtime: RuntimeName,
    seq: number,
    prevHash: string,
    headEventId: string | null
  ) {
    this.seqCounter = seq;
    this.prevHash = prevHash;
    this.headEventId = headEventId;
  }

  /** Release only OUR current claim after a partial recovery failed. */
  releaseForRetry(claimEventId: string): void {
    const events = this.store.readSessionEvents(this.sessionId);
    const last = events[events.length - 1];
    const owner = readSessionWriter(last ?? null);
    if (!last || owner?.token !== this.writerOwner.token || owner.state !== "active") return;
    const envelope = extractEnvelope(last.meta_json);
    if (!envelope) throw new Error("recovery head no longer has a supported envelope");
    // A backend may have committed before throwing; re-read only our own head.
    // The normal atomic check still prevents releasing a replacement owner.
    this.seqCounter = envelope.seq + 1; this.prevHash = last.event_hash; this.headEventId = last.id;
    this.append({ eventType: "session/release", typeMeta: { reason: "recovery-failed", claimEventId }, surface: { op: "none" }, turn: null, step: null });
  }

  append(spec: {
    readonly eventType: EvidenceEventType;
    readonly typeMeta: Record<string, unknown>;
    readonly surface: SurfaceOp;
    readonly turn: number | null;
    readonly step: number | null;
    readonly payload?: string | Buffer;
    readonly id?: string;
  }): SyntheticRef {
    const seq = this.seqCounter;
    const envelope: SessionEnvelope = {
      v: 1,
      sessionId: this.sessionId,
      seq,
      prevSessionEventHash: this.prevHash,
      turn: spec.turn,
      step: spec.step,
      surface: spec.surface,
      synthetic: true
    };
    // Content is blob-backed, never inline: retention can physically unlink a
    // blob but cannot touch canonical_payload_inline. The seam makes that the
    // only expressible option rather than a convention.
    const released = spec.eventType === "session/release" || spec.eventType === "session/close";
    const input: SessionStoreAppendInput = {
      sessionId: this.sessionId,
      runtime: this.runtime,
      eventType: spec.eventType,
      meta: embedEnvelope({ ...spec.typeMeta, [SESSION_WRITER_META]: sessionWriterMeta(this.writerOwner, released) }, envelope),
      sessionWriteFence: { owner: this.writerOwner, mode: spec.eventType === "session/recovery-claim" ? "claim" : released ? "release" : "append",
        head: { eventId: this.headEventId, eventHash: this.prevHash, seq: seq - 1 } },
      ...(spec.id !== undefined ? { id: spec.id } : {}),
      ...(spec.payload !== undefined ? { payload: spec.payload } : {})
    };

    const result = this.store.appendSessionEvent(input);

    // Advance ONLY after the commit returned; a throw above leaves the head at
    // the last durable event.
    this.seqCounter = seq + 1;
    this.prevHash = result.eventHash;
    this.headEventId = result.id;

    return { eventId: result.id, eventHash: result.eventHash, payloadSha256: result.payloadSha256 };
  }
}

function readSessionEvents(store: SessionEventStore, sessionId: string): EvidenceEvent[] {
  return [...store.readSessionEvents(sessionId)];
}

function parseMeta(metaJson: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(metaJson) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// Mirror of verifySessionChains, scoped to one session: seq is 0-based and
// strictly monotone and prevSessionEventHash links the prior session event's
// event_hash (SESSION_GENESIS at seq 0). A break is a tamper finding, never a
// crash — recovery aborts on it rather than "repairing" a rewritten chain.
function perSessionChainBroken(events: readonly EvidenceEvent[]): boolean {
  let expectedSeq = 0;
  let expectedPrevHash: string = SESSION_GENESIS;
  for (const event of events) {
    const envelope = extractEnvelope(event.meta_json);
    if (envelope === null) {
      continue;
    }
    if (
      envelope.sessionId !== event.session_id ||
      envelope.seq !== expectedSeq ||
      envelope.prevSessionEventHash !== expectedPrevHash
    ) {
      return true;
    }
    expectedSeq += 1;
    expectedPrevHash = event.event_hash;
  }
  return false;
}

// Events after the last turn/seal — the unsealed tail a crash leaves. All events
// when the session sealed no turn at all. Reported in session/recovered so a
// reader can see how much of the log the crash left unsealed.
function countUnsealedTail(events: readonly EvidenceEvent[]): number {
  let lastSealIndex = -1;
  events.forEach((event, index) => {
    if (event.event_type === "turn/seal") {
      lastSealIndex = index;
    }
  });
  return events.length - (lastSealIndex + 1);
}

// Head seed = the last session event's seq+1 and its global event_hash, so the
// first synthetic append chains straight onto the crashed tail.
function seedHead(events: readonly EvidenceEvent[]): { seq: number; prevHash: string } {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    const envelope = extractEnvelope(event.meta_json);
    if (envelope !== null) {
      return { seq: envelope.seq + 1, prevHash: event.event_hash };
    }
  }
  return { seq: 0, prevHash: SESSION_GENESIS };
}

function sessionRuntime(store: SessionEventStore, sessionId: string, events: readonly EvidenceEvent[]): RuntimeName {
  const row = store.readSessionRecord(sessionId);
  if (row) {
    return row.runtime;
  }
  const last = events[events.length - 1];
  return last ? last.runtime : "unknown";
}

interface PriorSeal {
  readonly eventId: string;
  readonly merkleRoot: string;
  readonly chainIndex: number;
}

// The last turn/seal already in the session, whose fields the recovery seal
// chains onto. Null when the crashed session sealed no turn.
function lastPriorSeal(events: readonly EvidenceEvent[]): PriorSeal | null {
  let result: PriorSeal | null = null;
  for (const event of events) {
    if (event.event_type !== "turn/seal") {
      continue;
    }
    const meta = parseMeta(event.meta_json);
    const root = meta?.window_merkle_root;
    const index = meta?.seal_chain_index;
    result = {
      eventId: event.id,
      merkleRoot: typeof root === "string" ? root : SESSION_MERKLE_EMPTY,
      chainIndex: typeof index === "number" ? index : 0
    };
  }
  return result;
}

// The highest turn number the session ever opened, used to label the recovery
// seal. Null when the crash happened before any turn started.
function lastTurnNumber(events: readonly EvidenceEvent[]): number | null {
  let turn: number | null = null;
  for (const event of events) {
    if (event.event_type !== "turn/start") {
      continue;
    }
    const value = parseMeta(event.meta_json)?.turn;
    if (typeof value === "number" && (turn === null || value > turn)) {
      turn = value;
    }
  }
  return turn;
}

interface UnmatchedToolCall {
  readonly toolCallId: string;
  readonly turn: number | null;
  readonly step: number | null;
}

// tool/call events whose toolCallId has no tool/result — matched over ALL
// results including synthetic ones, so a second recovery pass finds them already
// answered and appends nothing.
function unmatchedToolCalls(events: readonly EvidenceEvent[]): UnmatchedToolCall[] {
  const answered = new Set<string>();
  for (const event of events) {
    if (event.event_type !== "tool/result") {
      continue;
    }
    const id = parseMeta(event.meta_json)?.toolCallId;
    if (typeof id === "string") {
      answered.add(id);
    }
  }
  const calls: UnmatchedToolCall[] = [];
  for (const event of events) {
    if (event.event_type !== "tool/call") {
      continue;
    }
    const meta = parseMeta(event.meta_json);
    const id = meta?.toolCallId;
    if (typeof id !== "string" || answered.has(id)) {
      continue;
    }
    const turn = meta?.turn;
    const step = meta?.step;
    calls.push({
      toolCallId: id,
      turn: typeof turn === "number" ? turn : null,
      step: typeof step === "number" ? step : null
    });
  }
  return calls;
}

// step/start events whose (turn, step) has no step/end, in chain order.
//
// A crash between a step's first request and its step/end leaves a log that is
// well-formed at the TURN level once the turn is closed but still dangling at
// the STEP level — an open bracket no later reader can close. Recovery closes
// both, so "a recovered log is well-formed" holds at every level the writer
// opens, not just the outermost one.
function unmatchedSteps(events: readonly EvidenceEvent[]): StepBoundary[] {
  const key = (boundary: StepBoundary): string => `${boundary.turn}/${boundary.step}`;
  const ended = new Set<string>();
  for (const event of events) {
    if (event.event_type !== "step/end") {
      continue;
    }
    const boundary = readStepBoundary(event.meta_json);
    if (boundary !== null) {
      ended.add(key(boundary));
    }
  }
  const open: StepBoundary[] = [];
  for (const event of events) {
    if (event.event_type !== "step/start") {
      continue;
    }
    const boundary = readStepBoundary(event.meta_json);
    // Matched over ALL step/end rows including synthetic ones, so a second
    // recovery pass finds every step already closed and appends nothing.
    if (boundary !== null && !ended.has(key(boundary))) {
      open.push(boundary);
    }
  }
  return open;
}

// turn/start events whose turn has no turn/end, in chain order.
function unmatchedTurns(events: readonly EvidenceEvent[]): number[] {
  const ended = new Set<number>();
  for (const event of events) {
    if (event.event_type !== "turn/end") {
      continue;
    }
    // Read through the shared closer vocabulary: a turn is ended by a row that
    // says HOW it ended. A row that cannot say that does not close a turn.
    const meta = readTurnEndMeta(event.meta_json);
    if (meta !== null) {
      ended.add(meta.turn);
    }
  }
  const started: number[] = [];
  for (const event of events) {
    if (event.event_type !== "turn/start") {
      continue;
    }
    const turn = parseMeta(event.meta_json)?.turn;
    if (typeof turn === "number" && !ended.has(turn)) {
      started.push(turn);
    }
  }
  return started;
}

function report(partial: RecoveryReport): RecoveryReport {
  return partial;
}

/**
 * Recover a crashed session by appending synthetic closers under a fenced claim.
 *
 * Only ever appends. The partial turn stays exactly as the crash left it; a
 * broken per-session chain is a tamper finding (TAMPERED, nothing appended); an
 * already-closed session needs nothing (RECOVERED); a session that is not stale
 * is refused unless `force` is set (INDETERMINATE). A live or unknown owner is
 * always refused. Otherwise an atomic `session/recovery-claim` acquires the
 * verified head before appending: synthetic tool/result rows (outcome UNKNOWN) for
 * unanswered tool/call rows, a synthetic step/end (no stop reason, no usage) for
 * each open step, a synthetic turn/end (reason "interrupted") for each open
 * turn, a session/recovered summary, and a turn/seal closing the recovery
 * window. With `close`, it also appends session/close and seals the row — a
 * synthetic close that stays DISTINGUISHABLE from a clean one, never laundered.
 *
 * `reason: "interrupted"` is this path's alone. A live cancellation is recorded
 * by the loop as `reason: "cancelled"` with a signed cause; a reader must always
 * be able to tell "this agent died" from "someone stopped this agent".
 */
export function recoverSession(params: RecoverSessionParams): RecoveryReport {
  const staleAfterMs = params.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const force = params.force ?? false;
  const close = params.close ?? false;
  // Verification and unsupported-backend refusals must precede any writer open.
  const readStore = params.store ?? openSessionEventStore(params.workspace, undefined, { readOnly: true });
  let preflightEvents: EvidenceEvent[];
  try {
    if (readStore.backendId !== "sqlite") return report({ verdict: "INDETERMINATE", sessionId: params.sessionId, claimEventId: null, wonClaim: false,
      syntheticTurnEnds: 0, syntheticStepEnds: 0, unknownToolOutcomes: 0, unsealedTailCountBefore: 0, closed: false,
      reason: "JSONL recovery requires atomic ownership takeover; no recovery was attempted" });
    preflightEvents = readSessionEvents(readStore, params.sessionId);
    const verification = verifyLedgerIntegrity(params.workspace);
    if (!verification.chain.ok) return report({ verdict: "TAMPERED", sessionId: params.sessionId, claimEventId: null, wonClaim: false,
      syntheticTurnEnds: 0, syntheticStepEnds: 0, unknownToolOutcomes: 0, unsealedTailCountBefore: countUnsealedTail(preflightEvents), closed: false,
      reason: verification.chain.errors.join("; ") });
  } finally { if (params.store === undefined) readStore.close(); }
  let store = params.store;
  let acquiredClaim: string | null = null;
  let attemptedClaim: string | null = null;
  let recoveryAppender: SyntheticAppender | null = null;

  try {
    const events = preflightEvents;
    if (events.length === 0) {
      return report({
        verdict: "INDETERMINATE",
        sessionId: params.sessionId,
        claimEventId: null,
        wonClaim: false,
        syntheticTurnEnds: 0,
        syntheticStepEnds: 0,
        unknownToolOutcomes: 0,
        unsealedTailCountBefore: 0,
        closed: false,
        reason: "no events for session"
      });
    }

    // 1. A broken per-session chain is tampering, not a crash. Abort — never
    //    append synthetic closers on top of rewritten history.
    if (perSessionChainBroken(events)) {
      return report({
        verdict: "TAMPERED",
        sessionId: params.sessionId,
        claimEventId: null,
        wonClaim: false,
        syntheticTurnEnds: 0,
        syntheticStepEnds: 0,
        unknownToolOutcomes: 0,
        unsealedTailCountBefore: countUnsealedTail(events),
        closed: false,
        reason: "per-session chain broken"
      });
    }

    const unsealedTailCountBefore = countUnsealedTail(events);

    // 2. A chained, signed session/close means the session is already closed.
    if (events.some((event) => event.event_type === "session/close")) {
      return report({
        verdict: "RECOVERED",
        sessionId: params.sessionId,
        claimEventId: null,
        wonClaim: false,
        syntheticTurnEnds: 0,
        syntheticStepEnds: 0,
        unknownToolOutcomes: 0,
        unsealedTailCountBefore,
        closed: true,
        reason: "session already closed"
      });
    }

    // 3. Liveness gate. A merely slow or paused process must not be declared
    //    crashed, so recovery refuses a fresh session unless forced.
    const lastEvent = events[events.length - 1]!;
    if (!force && Date.now() - lastEvent.ts <= staleAfterMs) {
      return report({
        verdict: "INDETERMINATE",
        sessionId: params.sessionId,
        claimEventId: null,
        wonClaim: false,
        syntheticTurnEnds: 0,
        syntheticStepEnds: 0,
        unknownToolOutcomes: 0,
        unsealedTailCountBefore,
        closed: false,
        reason: `session is not stale (last event ${Date.now() - lastEvent.ts}ms ago, threshold ${staleAfterMs}ms)`
      });
    }

    // A handle drop is not process death, and force only bypasses the age wait.
    try { assertSessionOwnerAvailable(lastEvent); }
    catch (error) {
      if (!(error instanceof SessionWriterRefused)) throw error;
      return report({ verdict: "INDETERMINATE", sessionId: params.sessionId, claimEventId: null, wonClaim: false,
        syntheticTurnEnds: 0, syntheticStepEnds: 0, unknownToolOutcomes: 0, unsealedTailCountBefore, closed: false, reason: error.message });
    }
    if (!events.slice(events.length - countUnsealedTail(events)).some((event) => event.event_type === "turn/start")) {
      return report({ verdict: "INDETERMINATE", sessionId: params.sessionId, claimEventId: null, wonClaim: false,
        syntheticTurnEnds: 0, syntheticStepEnds: 0, unknownToolOutcomes: 0, unsealedTailCountBefore, closed: false, reason: "no unsealed turn requires recovery" });
    }
    store ??= openSessionEventStore(params.workspace);
    const seed = seedHead(events);
    const appender = new SyntheticAppender(
      store,
      params.sessionId,
      sessionRuntime(store, params.sessionId, events),
      seed.seq,
      seed.prevHash,
      lastEvent.id
    );
    recoveryAppender = appender;

    // 4. The backend atomically compares the verified head and acquires ownership.
    // A losing claim adds neither a row nor a blob; historical claims cannot win again.
    const observedHeadEventId = lastEvent.id;
    attemptedClaim = randomUUID();
    const claim = appender.append({
      id: attemptedClaim,
      eventType: "session/recovery-claim",
      typeMeta: {
        claimant: {
          pid: params.claimant.pid,
          hostId: params.claimant.hostId,
          bootId: params.claimant.bootId,
          startedAt: params.claimant.startedAt
        },
        observedHeadEventId
      },
      surface: { op: "none" },
      turn: null,
      step: null
    });

    acquiredClaim = claim.eventId;
    const contested = readSessionEvents(store, params.sessionId);
    // 5. Unknown tool outcomes FIRST, so the projection is well-formed (each
    //    tool_use is followed by its tool_result before the turn closes).
    const resultBytes = Buffer.from(SYNTHETIC_TOOL_RESULT_BODY, "utf8");
    const resultSha = sha256Hex(resultBytes);
    const windowHashes: string[] = [claim.eventHash];
    let windowLastId = claim.eventId;
    let unknownToolOutcomes = 0;
    for (const call of unmatchedToolCalls(contested)) {
      const ref = appender.append({
        eventType: "tool/result",
        typeMeta: {
          toolCallId: call.toolCallId,
          outcome: "TOOL_OUTCOME_UNKNOWN",
          exitCode: null,
          timedOut: false,
          denied: false,
          recoveredBy: claim.eventId
        },
        surface: {
          op: "append",
          slot: `tool:${call.toolCallId}`,
          role: "tool",
          part: { kind: "tool_result", sha256: resultSha }
        },
        turn: call.turn,
        step: call.step,
        payload: resultBytes
      });
      windowHashes.push(ref.eventHash);
      windowLastId = ref.eventId;
      unknownToolOutcomes += 1;
    }

    // 6. Then the synthetic close of each open STEP, before its turn closes.
    //    A recovered log has to be well-formed at both levels: a turn/end over a
    //    step that never ended leaves an inner bracket nobody can close later,
    //    and every reader of the step level would have to special-case it.
    //    stopReason and usage are null because the process died without either —
    //    a zero here would be a measurement nobody took, signed.
    let syntheticStepEnds = 0;
    for (const boundary of unmatchedSteps(contested)) {
      const ref = appender.append({
        eventType: "step/end",
        typeMeta: buildStepEndMeta({
          turn: boundary.turn,
          step: boundary.step,
          stopReason: null,
          usage: null,
          recoveredBy: claim.eventId
        }),
        surface: { op: "none" },
        turn: boundary.turn,
        step: boundary.step
      });
      windowHashes.push(ref.eventHash);
      windowLastId = ref.eventId;
      syntheticStepEnds += 1;
    }

    // 7. Then the synthetic close of each open turn — interrupted, never
    //    laundered into a clean completion, and never spelled as a cancellation:
    //    "this agent died" and "someone stopped this agent" are different facts,
    //    and buildTurnEndMeta refuses to let this writer claim the other one.
    let syntheticTurnEnds = 0;
    for (const turn of unmatchedTurns(contested)) {
      const ref = appender.append({
        eventType: "turn/end",
        typeMeta: buildTurnEndMeta(
          {
            turn,
            reason: "interrupted",
            cancelCause: null,
            recovery: { lastObservedEventId: observedHeadEventId, recoveredBy: claim.eventId }
          },
          "recovery"
        ),
        surface: { op: "none" },
        turn,
        step: null
      });
      windowHashes.push(ref.eventHash);
      windowLastId = ref.eventId;
      syntheticTurnEnds += 1;
    }

    // 8. Summarise the recovery.
    const recovered = appender.append({
      eventType: "session/recovered",
      typeMeta: {
        claimEventId: claim.eventId,
        syntheticTurnEnds,
        syntheticStepEnds,
        unknownToolOutcomes,
        unsealedTailCountBefore
      },
      surface: { op: "none" },
      turn: null,
      step: null
    });
    windowHashes.push(recovered.eventHash);
    windowLastId = recovered.eventId;

    // 9. Seal the recovery window so the recovery itself cannot be silently
    //    rolled back. The row's own writer_sig IS the seal signature.
    const priorSeal = lastPriorSeal(contested);
    const sealTurn = lastTurnNumber(contested);
    appender.append({
      eventType: "turn/seal",
      typeMeta: {
        turn: sealTurn,
        window_first_event_id: claim.eventId,
        window_last_event_id: windowLastId,
        window_event_count: windowHashes.length,
        window_merkle_root: merkleRoot(windowHashes),
        prev_seal_event_id: priorSeal?.eventId ?? null,
        prev_seal_merkle_root: priorSeal?.merkleRoot ?? SESSION_MERKLE_EMPTY,
        seal_chain_index: priorSeal ? priorSeal.chainIndex + 1 : 0
      },
      surface: { op: "none" },
      turn: sealTurn,
      step: null
    });

    // 10. Closing the session is the caller's decision — recovery makes a session
    //    consistent, it does not decide the session is over.
    let closed = false;
    if (close) {
      closed = closeRecoveredSession(store, appender, params.sessionId);
    } else {
      appender.append({ eventType: "session/release", typeMeta: { reason: "recovery-complete", claimEventId: claim.eventId }, surface: { op: "none" }, turn: null, step: null });
    }

    return report({
      verdict: "RECOVERED",
      sessionId: params.sessionId,
      claimEventId: claim.eventId,
      wonClaim: true,
      syntheticTurnEnds,
      syntheticStepEnds,
      unknownToolOutcomes,
      unsealedTailCountBefore,
      closed
    });
  } catch (error) {
    if (attemptedClaim !== null) {
      // The store can commit a claim and then throw in post-commit work.
      // A preallocated ID plus token check also handles that uncertain return.
      try { recoveryAppender?.releaseForRetry(attemptedClaim); }
      catch (releaseError) { throw new AggregateError([error, releaseError], "Recovery failed and its writer claim could not be released"); }
    }
    if (!(error instanceof SessionWriterRefused) || acquiredClaim !== null) throw error;
    return report({ verdict: "INDETERMINATE", sessionId: params.sessionId, claimEventId: null, wonClaim: false,
      syntheticTurnEnds: 0, syntheticStepEnds: 0, unknownToolOutcomes: 0, unsealedTailCountBefore: countUnsealedTail(preflightEvents), closed: false, reason: error.message });
  } finally {
    if (params.store === undefined) store?.close();
  }
}

// Append a synthetic session/close and seal the row. The close carries
// synthetic:true (in the envelope, inside the hash), so a recovery-closed
// session stays distinguishable from a cleanly closed one. sealSession is not
// idempotent, so this runs exactly once, at the true end of the recovered log.
function closeRecoveredSession(store: SessionEventStore, appender: SyntheticAppender, sessionId: string): boolean {
  const events = readSessionEvents(store, sessionId);
  const sealHashes = events
    .filter((event) => event.event_type === "turn/seal")
    .map((event) => event.event_hash);
  const turnCount = events.filter((event) => event.event_type === "turn/start").length;
  const closeId = randomUUID();

  appender.append({
    eventType: "session/close",
    typeMeta: {
      reason: "recovered",
      turnCount,
      sealCount: sealHashes.length,
      sessionMerkleRoot: merkleRoot(sealHashes),
      finalEventId: closeId
    },
    surface: { op: "none" },
    turn: null,
    step: null,
    id: closeId
  });

  store.sealSession(sessionId);
  return true;
}
