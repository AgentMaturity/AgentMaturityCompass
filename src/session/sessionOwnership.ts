import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import type { EvidenceEvent, SessionRecord } from "../types.js";
import { extractEnvelope, SESSION_GENESIS } from "./sessionTypes.js";

/** Ownership lives in signed session rows, never in a second authority store. */
export const SESSION_WRITER_META = "amcSessionWriter";
/**
 * Writer meta v2 (P2-12) is the session's fencing token: every claim raises `epoch` by exactly one, checked inside the
 * append transaction against the signed row it follows, and every row carries the writer's `leaseMs`. A lease is live
 * while the session's last signed row is younger than it. Version 1 rows (no epoch, no lease) stay readable as epoch 0.
 */
const SESSION_WRITER_META_VERSION = 2;
export const DEFAULT_SESSION_LEASE_MS = 60_000;
export const STALE_EPOCH_MESSAGE = "a newer writer claimed this session; no further effects are dispatched by this process";
const TAKEOVER_REASON_MAX = 500;
export interface SessionWriterOwner {
  readonly token: string;
  readonly pid: number;
  readonly hostId: string;
}
export interface SessionWriterState extends SessionWriterOwner {
  readonly state: "active" | "released";
  readonly version: 1 | 2;
  readonly epoch: number;
  readonly leaseMs: number;
}
export interface SessionWriteFence {
  readonly owner: SessionWriterOwner;
  readonly mode: "claim" | "append" | "release";
  readonly head: { readonly eventId: string | null; readonly eventHash: string; readonly seq: number };
}
/** An explicit claim of a remote, unknown or unresponsive writer whose lease lapsed, recorded in the claim row. */
export interface WriterTakeover {
  readonly reason: string;
  readonly previousOwner: SessionWriterOwner;
  readonly previousEpoch: number;
  /** The replaced writer's last signed row, by its own clock. The claim row's `ts` is the claimant's clock. */
  readonly previousLastRowTs: number;
  readonly leaseMs: number;
  readonly leaseExpiredAt: number;
}
export type SessionWriterRefusal = "LIVE_WRITER" | "STALE_HEAD" | "STALE_EPOCH" | "UNSUPPORTED_OWNER" | "SEALED" | "INVALID_FENCE";
export class SessionWriterRefused extends Error {
  constructor(readonly code: SessionWriterRefusal, message: string) {
    super(`${code}: ${message}`); this.name = "SessionWriterRefused";
  }
}
export function newSessionWriterOwner(): SessionWriterOwner {
  return { token: randomUUID(), pid: process.pid, hostId: hostname() };
}
export function sessionWriterMeta(owner: SessionWriterOwner & { readonly epoch?: number; readonly leaseMs?: number }, released = false) {
  return { v: SESSION_WRITER_META_VERSION, token: owner.token, pid: owner.pid, hostId: owner.hostId, state: released ? "released" : "active",
    epoch: owner.epoch ?? 1, leaseMs: owner.leaseMs ?? DEFAULT_SESSION_LEASE_MS };
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
export function hasSessionWriter(row: EvidenceEvent | null): boolean {
  try { return row !== null && SESSION_WRITER_META in JSON.parse(row.meta_json); } catch { return false; }
}
/** A writer meta object of a version this writer reads, or null (an unknown fencing token). */
function parseWriter(raw: unknown): SessionWriterState | null {
  if (!object(raw) || (raw.v !== 1 && raw.v !== 2) || typeof raw.token !== "string" || raw.token.length === 0
    || !positive(raw.pid) || typeof raw.hostId !== "string" || !raw.hostId
    || (raw.state !== "active" && raw.state !== "released")) return null;
  if (raw.v === 2 && (!positive(raw.epoch) || !positive(raw.leaseMs))) return null;
  return { token: raw.token, pid: raw.pid, hostId: raw.hostId, state: raw.state, version: raw.v,
    epoch: raw.v === 2 ? raw.epoch as number : 0, leaseMs: raw.v === 2 ? raw.leaseMs as number : DEFAULT_SESSION_LEASE_MS };
}
export function readSessionWriter(row: EvidenceEvent | null): SessionWriterState | null {
  if (!row) return null;
  try { return parseWriter(JSON.parse(row.meta_json)[SESSION_WRITER_META]); } catch { return null; }
}

/**
 * Only a released owner or a demonstrably dead LOCAL process is replaced without more. A remote, unknown or unresponsive
 * owner is replaced only by an explicit `takeover` with a stated reason, once its lease has been expired for one more
 * lease by this process's clock (one full lease of grace for clock skew). Returns the takeover to record, or null.
 */
export function assertSessionOwnerAvailable(row: EvidenceEvent, takeover?: { readonly reason: string }): WriterTakeover | null {
  const owner = readSessionWriter(row);
  if (!owner) throw new SessionWriterRefused("UNSUPPORTED_OWNER", "session has no supported signed writer ownership; read or fork it instead");
  if (owner.state === "released") return null;
  let refusal: string;
  if (owner.hostId !== hostname()) refusal = "writer liveness on another host cannot be established";
  else {
    try { process.kill(owner.pid, 0); refusal = `session writer process ${owner.pid} is still alive`; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return null;
      refusal = "writer liveness cannot be established";
    }
  }
  const leaseExpiredAt = row.ts + owner.leaseMs;
  const claimableAt = leaseExpiredAt + owner.leaseMs;
  if (takeover === undefined || Date.now() <= claimableAt) {
    throw new SessionWriterRefused("LIVE_WRITER", `${refusal}; if that writer is gone, claim the session after `
      + `${new Date(claimableAt).toISOString()} by this host's clock with --takeover-expired-writer "<reason>"`);
  }
  const reason = typeof takeover.reason === "string" ? takeover.reason.trim() : "";
  if (reason.length === 0 || reason.length > TAKEOVER_REASON_MAX) {
    throw new SessionWriterRefused("INVALID_FENCE", `a takeover needs a stated reason of 1-${TAKEOVER_REASON_MAX} characters`);
  }
  return { reason, previousOwner: { token: owner.token, pid: owner.pid, hostId: owner.hostId }, previousEpoch: owner.epoch,
    previousLastRowTs: row.ts, leaseMs: owner.leaseMs, leaseExpiredAt };
}

/** The signed `session/migration` facts a version-2 writer records after claiming a version-1 owner's session; else null. */
export function writerMetaMigration(previousHead: EvidenceEvent): Record<string, unknown> | null {
  if (readSessionWriter(previousHead)?.version !== 1) return null;
  return { fromVersion: 1, toVersion: SESSION_WRITER_META_VERSION, sourceHeadEventId: previousHead.id, sourceHeadHash: previousHead.event_hash,
    reason: "writer-meta-v2: epoch and lease fencing (P2-12)" };
}

/** A claim replaces exactly the owner it names: the takeover is re-derived here from the row it follows. */
function assertClaimable(last: EvidenceEvent, meta: Record<string, unknown>): void {
  const stated = meta.takeover;
  if (stated === undefined) { assertSessionOwnerAvailable(last); return; }
  if (!object(stated) || typeof stated.reason !== "string") throw new SessionWriterRefused("INVALID_FENCE", "unsupported takeover shape");
  const expected = assertSessionOwnerAvailable(last, { reason: stated.reason });
  if (expected === null || JSON.stringify(expected) !== JSON.stringify(stated)) {
    throw new SessionWriterRefused("INVALID_FENCE", "the recorded takeover does not match the owner it replaces");
  }
}

/** Run INSIDE the append transaction/lock, before materializing any payload. */
export function assertSessionWriteAllowed(input: {
  sessionId: string; eventType: string; meta?: Record<string, unknown>; sessionWriteFence?: SessionWriteFence;
}, last: EvidenceEvent | null, record: SessionRecord | null): void {
  const fence = input.sessionWriteFence;
  const previousOwner = readSessionWriter(last);
  const meta = input.meta ?? {};
  const previouslyOwned = hasSessionWriter(last);
  // Preserve ordinary legacy ledger writes; an owned native session cannot
  // escape the fence by omitting its envelope or owner from the next row.
  if (!fence && !previouslyOwned && !(SESSION_WRITER_META in meta)) return;
  if (!fence) throw new SessionWriterRefused("INVALID_FENCE", "owned session append requires a writer fence");
  if (!["claim", "append", "release"].includes(fence.mode) || !object(fence.owner) || !object(fence.head)
    || typeof fence.owner.token !== "string" || fence.owner.token.length === 0) {
    throw new SessionWriterRefused("INVALID_FENCE", "unsupported writer fence shape");
  }
  if (fence.owner.pid !== process.pid || fence.owner.hostId !== hostname()) {
    throw new SessionWriterRefused("INVALID_FENCE", "writer identity must be the actual local process");
  }
  if (!record) throw new SessionWriterRefused("INVALID_FENCE", "session record is missing");
  if (record.ended_ts !== null || record.session_seal_sig !== null || record.session_final_event_hash !== null || last?.event_type === "session/close") {
    throw new SessionWriterRefused("SEALED", "closed session cannot accept another event");
  }
  // P2-12: a writer whose claim a newer one replaced, or whose session carries an unknown token, fails closed first.
  if (fence.mode !== "claim" && previousOwner !== null && previousOwner.token !== fence.owner.token) {
    throw new SessionWriterRefused("STALE_EPOCH", STALE_EPOCH_MESSAGE);
  }
  if (previousOwner === null && previouslyOwned) throw new SessionWriterRefused("UNSUPPORTED_OWNER", "the session's writer meta is not a version this writer reads");
  const priorEnvelope = last ? extractEnvelope(last.meta_json) : null;
  if (fence.head.eventId !== (last?.id ?? null) || fence.head.eventHash !== (last?.event_hash ?? SESSION_GENESIS)
    || fence.head.seq !== (priorEnvelope?.seq ?? -1) || (last !== null && priorEnvelope === null)) {
    throw new SessionWriterRefused("STALE_HEAD", "session head changed before append");
  }
  const envelope = extractEnvelope(JSON.stringify(meta));
  if (!envelope || envelope.sessionId !== input.sessionId || envelope.seq !== fence.head.seq + 1
    || envelope.prevSessionEventHash !== fence.head.eventHash) {
    throw new SessionWriterRefused("INVALID_FENCE", "session envelope does not match the expected head");
  }
  const next = parseWriter(meta[SESSION_WRITER_META]);
  const released = fence.mode === "release";
  const claiming = ["session/open", "session/resume", "session/recovery-claim"].includes(input.eventType);
  if ((fence.mode === "claim") !== claiming) throw new SessionWriterRefused("INVALID_FENCE", "claim state must match an opening or claim event");
  if (!next || next.token !== fence.owner.token || next.pid !== fence.owner.pid || next.hostId !== fence.owner.hostId
    || next.state !== (released ? "released" : "active")) {
    throw new SessionWriterRefused("INVALID_FENCE", "signed writer identity does not match the append fence");
  }
  // A version-1 row continues only a version-1 (or new) session: after a fenced claim, a downgrade would drop the epoch.
  if (next.version === 1 && previousOwner?.version === 2) throw new SessionWriterRefused("INVALID_FENCE", "a version-1 writer row cannot follow a fenced (version-2) writer");
  if (fence.mode === "claim") {
    if (next.version === 2 && next.epoch !== (previousOwner?.epoch ?? 0) + 1) {
      throw new SessionWriterRefused("INVALID_FENCE", "a claim must raise the session's writer epoch by exactly one");
    }
    if (last) assertClaimable(last, meta);
    else if (input.eventType !== "session/open") throw new SessionWriterRefused("INVALID_FENCE", "only session/open can begin an empty session");
  } else {
    if (!previousOwner || previousOwner.state !== "active" || previousOwner.token !== fence.owner.token
      || previousOwner.pid !== fence.owner.pid || previousOwner.hostId !== fence.owner.hostId) {
      throw new SessionWriterRefused("STALE_HEAD", "writer no longer owns this session");
    }
    if (next.epoch !== previousOwner.epoch) throw new SessionWriterRefused("INVALID_FENCE", "a writer cannot change its epoch without a claim");
    if (released !== ["session/release", "session/close"].includes(input.eventType)) {
      throw new SessionWriterRefused("INVALID_FENCE", "release state must match a release or close event");
    }
  }
}
