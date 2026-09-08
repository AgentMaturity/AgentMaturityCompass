/**
 * Resume and fork signed native sessions across processes (AMC-1511).
 *
 * A session written by process A can be continued by process B only through
 * this module. Before B appends anything it checks the following, in this
 * order, and each refusal happens BEFORE any model or tool dispatch:
 *
 *   MISSING             no sessions row for that id
 *   SEALED              the session was closed; its final hash is signed and
 *                       nothing may follow it — fork it instead
 *   UNSUPPORTED_FORMAT  a row carries an envelope version this writer does not
 *                       speak. Formats evolve by REFUSING the unknown and, when
 *                       a migration exists, by appending a `session/migration`
 *                       receipt that names the source rows — signed bytes are
 *                       never rewritten in place. JSONL takeover and legacy
 *                       sessions without signed ownership are also refused.
 *   TAMPERED            the per-session chain (seq / prevSessionEventHash) or
 *                       the ledger's own hash/signature verification fails
 *   AGENT_MISMATCH      the requested agent differs from the signed session/open identity
 *   LIVE_WRITER         signed ownership still belongs to a live local process,
 *                       or a remote/unknown process whose death cannot be proved.
 *                       A turn seal and an elapsed timeout never release a writer.
 *   UNRECOVERED         recovery ran and did not reach RECOVERED
 *
 * What resumes is the SAME session: B's first row is `session/resume`, chained
 * onto A's last row, so the handover is signed evidence and A's signatures are
 * untouched. Byte-consistent history is a property of the ledger, not of this
 * module: B reads the rows A wrote.
 */
import { openSessionEventStore } from "../persistence/openSessionEventStore.js";
import type { SessionEventStore } from "../persistence/sessionEventStore.js";
import { verifyLedgerIntegrity, verifyNativeSessionContinuation } from "../ledger/ledgerVerification.js";
import type { EvidenceEvent, RuntimeName } from "../types.js";
import { recoverSession, type RecoveryClaimant, type RecoveryReport } from "./sessionRecovery.js";
import { SessionService } from "./sessionService.js";
import type { SessionLineage } from "./sessionApiTypes.js";
import { assertSessionOwnerAvailable, SessionWriterRefused } from "./sessionOwnership.js";
import { extractEnvelope, SESSION_ENVELOPE_META_KEY, SESSION_GENESIS } from "./sessionTypes.js";

export const SESSION_ENVELOPE_VERSION = 1;
const DEFAULT_STALE_AFTER_MS = 60_000;

export type ResumeRefusal = "MISSING" | "SEALED" | "UNSUPPORTED_FORMAT" | "TAMPERED" | "AGENT_MISMATCH" | "LIVE_WRITER" | "UNRECOVERED";

export class SessionResumeRefused extends Error {
  constructor(readonly code: ResumeRefusal, message: string, readonly details: readonly string[] = []) {
    super(`${code}: ${message}`);
    this.name = "SessionResumeRefused";
  }
}

interface OpenIdentity {
  readonly runtime?: RuntimeName;
  readonly agentId: string;
  readonly harnessVersion: string;
  readonly compositionDigest: string;
  readonly policyDigest: string;
}

export interface ResumeSessionParams extends OpenIdentity {
  readonly workspace: string;
  readonly sessionId: string;
  readonly claimant: RecoveryClaimant;
  /** How old an unsealed tail must be before it is taken over. Default 60s. */
  readonly staleAfterMs?: number;
  readonly store?: SessionEventStore;
}

export interface ResumeReport {
  readonly verdict: "RESUMED";
  readonly sessionId: string;
  readonly observedHeadEventId: string;
  readonly resumedAfterSeq: number;
  /** Present when the tail was a crash and recovery closed it first. */
  readonly recovery: RecoveryReport | null;
}

export interface ForkSessionParams extends OpenIdentity {
  readonly workspace: string;
  readonly parentSessionId: string;
  readonly claimant: RecoveryClaimant;
  readonly store?: SessionEventStore;
}

function meta(row: EvidenceEvent): Record<string, unknown> {
  try { return JSON.parse(row.meta_json) as Record<string, unknown>; } catch { return {}; }
}

/** Every enveloped row, with a refusal for any envelope version we do not speak. */
function envelopedRows(rows: readonly EvidenceEvent[]): EvidenceEvent[] {
  const out: EvidenceEvent[] = [];
  for (const row of rows) {
    // The version is read RAW, before validation: `extractEnvelope` returns
    // null for any version it does not recognise, which would let a future
    // format slip through as "not enveloped" and be judged as tampering instead.
    const raw = meta(row)[SESSION_ENVELOPE_META_KEY];
    if (raw && typeof raw === "object" && (raw as { v?: unknown }).v !== SESSION_ENVELOPE_VERSION) {
      throw new SessionResumeRefused(
        "UNSUPPORTED_FORMAT",
        `row ${row.id} carries session envelope v${String((raw as { v?: unknown }).v)}; this writer speaks v${SESSION_ENVELOPE_VERSION} and does not rewrite signed rows`
      );
    }
    const envelope = extractEnvelope(row.meta_json);
    if (envelope === null) continue;
    out.push(row);
  }
  return out;
}

/** Mirror of the verifier's per-session chain rule; a break is TAMPERED. */
function assertChainIntact(sessionId: string, rows: readonly EvidenceEvent[]): void {
  let expectedSeq = 0;
  let expectedPrev: string = SESSION_GENESIS;
  for (const row of rows) {
    const envelope = extractEnvelope(row.meta_json)!;
    if (envelope.sessionId !== sessionId || envelope.seq !== expectedSeq || envelope.prevSessionEventHash !== expectedPrev) {
      throw new SessionResumeRefused("TAMPERED", `per-session chain breaks at row ${row.id} (seq ${String(envelope.seq)}, expected ${expectedSeq})`);
    }
    expectedSeq += 1;
    expectedPrev = row.event_hash;
  }
}

/** The ledger's own hash/signature verdict; refused on any chain error. */
function assertLedgerVerifies(workspace: string, sessionId: string, allowIncompleteLegacy: boolean): void {
  const verdict = allowIncompleteLegacy ? verifyNativeSessionContinuation(workspace, sessionId) : verifyLedgerIntegrity(workspace);
  if (!verdict.chain.ok) {
    throw new SessionResumeRefused("TAMPERED", "the evidence ledger does not verify", verdict.chain.errors);
  }
}

function verifiedRows(params: { workspace: string; sessionId: string; store: SessionEventStore }, allowSealed: boolean): EvidenceEvent[] {
  const record = params.store.readSessionRecord(params.sessionId);
  if (record === null) throw new SessionResumeRefused("MISSING", `no session ${params.sessionId} in this workspace`);
  if (!allowSealed && (record.session_seal_sig !== null || record.ended_ts !== null)) {
    throw new SessionResumeRefused("SEALED", `session ${params.sessionId} is sealed; fork it to continue from it`);
  }
  const rows = envelopedRows(params.store.readSessionEvents(params.sessionId));
  if (rows.length === 0) throw new SessionResumeRefused("MISSING", `session ${params.sessionId} has no enveloped rows`);
  assertChainIntact(params.sessionId, rows);
  assertLedgerVerifies(params.workspace, params.sessionId, !allowSealed);
  return rows;
}

/** Rows after the last turn/seal: the part no seal commits to yet. */
function unsealedTail(rows: readonly EvidenceEvent[]): EvidenceEvent[] {
  let lastSeal = -1;
  rows.forEach((row, index) => { if (row.event_type === "turn/seal") lastSeal = index; });
  return rows.slice(lastSeal + 1);
}

/** Read-only view for the checks; the writer store opens only once they pass. */
function withReadOnlyStore<T>(params: { workspace: string; store?: SessionEventStore }, use: (store: SessionEventStore) => T): T {
  if (params.store) return use(params.store);
  const store = openSessionEventStore(params.workspace, undefined, { readOnly: true });
  try { return use(store); } finally { store.close(); }
}

function assertResumeAgent(rows: readonly EvidenceEvent[], agentId: string): void {
  const opened = rows.find(row => row.event_type === "session/open");
  if (opened === undefined || meta(opened).agentId !== agentId) {
    throw new SessionResumeRefused("AGENT_MISMATCH", "resume requires the agent recorded in session/open; inspect the session and select that agent explicitly");
  }
}

/** Refuse a different signed identity before a caller starts an external MCP server. */
export function assertSessionResumeAgent(params: { workspace: string; sessionId: string; agentId: string }): void {
  withReadOnlyStore(params, store => assertResumeAgent(verifiedRows({ ...params, store }, false), params.agentId));
}

export function resumeSession(params: ResumeSessionParams): { service: SessionService; report: ResumeReport } {
  const staleAfterMs = params.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  let recovery: RecoveryReport | null = null;

  // 1. Verify and classify through a read-only handle: no writer lock is held
  //    while the answer may still be "refuse".
  let rows = withReadOnlyStore(params, (store) => {
    if (store.backendId !== "sqlite") throw new SessionResumeRefused("UNSUPPORTED_FORMAT", "JSONL resume requires atomic ownership takeover; read or fork this session instead");
    return verifiedRows({ workspace: params.workspace, sessionId: params.sessionId, store }, false);
  });
  // Check identity before ownership takeover or crash recovery can append rows.
  assertResumeAgent(rows, params.agentId);
  try { assertSessionOwnerAvailable(rows[rows.length - 1]!); }
  catch (error) {
    if (error instanceof SessionWriterRefused) throw new SessionResumeRefused(error.code === "LIVE_WRITER" ? "LIVE_WRITER" : "UNSUPPORTED_FORMAT", error.message);
    throw error;
  }
  const tail = unsealedTail(rows);
  // endTurn is not a seal: a crash between them still needs a recovery receipt.
  const openTurn = tail.some((row) => row.event_type === "turn/start");
  if (openTurn) {
    // 2. A crash after a side effect: recovery (its own writer, released when
    //    it returns) closes the turn synthetically and records what is unknown.
    //    Nothing is re-executed.
    recovery = recoverSession({ workspace: params.workspace, sessionId: params.sessionId, claimant: params.claimant, staleAfterMs, ...(params.store ? { store: params.store } : {}) });
    if (recovery.verdict !== "RECOVERED") {
      throw new SessionResumeRefused("UNRECOVERED", `crash recovery ended ${recovery.verdict}${recovery.reason ? `: ${recovery.reason}` : ""}`);
    }
    rows = withReadOnlyStore(params, (store) => verifiedRows({ workspace: params.workspace, sessionId: params.sessionId, store }, false));
  }
  const head = rows[rows.length - 1]!;

  // 3. The backend atomically claims this verified head inside its append transaction.
  const store = params.store ?? openSessionEventStore(params.workspace);
  try {
    const service = new SessionService(params.workspace, store);
    service.attach({
      sessionId: params.sessionId,
      runtime: params.runtime,
      agentId: params.agentId,
      harnessVersion: params.harnessVersion,
      compositionDigest: params.compositionDigest,
      policyDigest: params.policyDigest,
      claimant: params.claimant,
      observedHeadEventId: head.id,
      observedHeadEventHash: head.event_hash
    });
    return {
      service,
      report: {
        verdict: "RESUMED",
        sessionId: params.sessionId,
        observedHeadEventId: head.id,
        resumedAfterSeq: extractEnvelope(head.meta_json)!.seq,
        recovery
      }
    };
  } catch (error) {
    if (params.store === undefined) store.close();
    if (error instanceof SessionWriterRefused) throw new SessionResumeRefused(error.code === "LIVE_WRITER" ? "LIVE_WRITER" : "UNRECOVERED", error.message);
    throw error;
  }
}

/**
 * A new session whose `session/open` row names the parent's VERIFIED final row.
 * The parent may be sealed or live; it is read, never written.
 */
export function forkSession(params: ForkSessionParams): { service: SessionService; parent: SessionLineage } {
  const rows = withReadOnlyStore(params, (store) => verifiedRows({ workspace: params.workspace, sessionId: params.parentSessionId, store }, true));
  const last = rows[rows.length - 1]!;
  const parent: SessionLineage = { sessionId: params.parentSessionId, finalEventHash: last.event_hash, seq: extractEnvelope(last.meta_json)!.seq };
  const store = params.store ?? openSessionEventStore(params.workspace);
  const service = new SessionService(params.workspace, store);
  service.open({
    runtime: params.runtime,
    agentId: params.agentId,
    harnessVersion: params.harnessVersion,
    compositionDigest: params.compositionDigest,
    policyDigest: params.policyDigest,
    parent
  });
  return { service, parent };
}
