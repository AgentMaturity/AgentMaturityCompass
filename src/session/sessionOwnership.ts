import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import type { EvidenceEvent, SessionRecord } from "../types.js";
import { extractEnvelope, SESSION_GENESIS } from "./sessionTypes.js";

/** Ownership lives in signed session rows, never in a second authority store. */
export const SESSION_WRITER_META = "amcSessionWriter";
export interface SessionWriterOwner {
  readonly token: string;
  readonly pid: number;
  readonly hostId: string;
}
export interface SessionWriteFence {
  readonly owner: SessionWriterOwner;
  readonly mode: "claim" | "append" | "release";
  readonly head: { readonly eventId: string | null; readonly eventHash: string; readonly seq: number };
}
export class SessionWriterRefused extends Error {
  constructor(readonly code: "LIVE_WRITER" | "STALE_HEAD" | "UNSUPPORTED_OWNER" | "SEALED" | "INVALID_FENCE", message: string) {
    super(`${code}: ${message}`); this.name = "SessionWriterRefused";
  }
}
export function newSessionWriterOwner(): SessionWriterOwner {
  return { token: randomUUID(), pid: process.pid, hostId: hostname() };
}
export function sessionWriterMeta(owner: SessionWriterOwner, released = false) {
  return { v: 1, ...owner, state: released ? "released" : "active" };
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function hasSessionWriter(row: EvidenceEvent | null): boolean {
  try { return row !== null && SESSION_WRITER_META in JSON.parse(row.meta_json); } catch { return false; }
}
export function readSessionWriter(row: EvidenceEvent | null): (SessionWriterOwner & { state: "active" | "released" }) | null {
  if (!row) return null;
  let raw: unknown;
  try { raw = JSON.parse(row.meta_json)[SESSION_WRITER_META]; } catch { return null; }
  if (!object(raw) || raw.v !== 1 || typeof raw.token !== "string" || raw.token.length === 0
    || !Number.isSafeInteger(raw.pid) || (raw.pid as number) <= 0 || typeof raw.hostId !== "string" || !raw.hostId
    || (raw.state !== "active" && raw.state !== "released")) return null;
  return { token: raw.token, pid: raw.pid as number, hostId: raw.hostId, state: raw.state };
}

/** Only a released owner or a demonstrably dead LOCAL process can be replaced. */
export function assertSessionOwnerAvailable(row: EvidenceEvent): void {
  const owner = readSessionWriter(row);
  if (!owner) throw new SessionWriterRefused("UNSUPPORTED_OWNER", "session has no supported signed writer ownership; read or fork it instead");
  if (owner.state === "released") return;
  if (owner.hostId !== hostname()) throw new SessionWriterRefused("LIVE_WRITER", "writer liveness on another host cannot be established");
  try { process.kill(owner.pid, 0); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
    throw new SessionWriterRefused("LIVE_WRITER", "writer liveness cannot be established");
  }
  throw new SessionWriterRefused("LIVE_WRITER", `session writer process ${owner.pid} is still alive`);
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
  const next = meta[SESSION_WRITER_META];
  const released = fence.mode === "release";
  const claiming = ["session/open", "session/resume", "session/recovery-claim"].includes(input.eventType);
  if ((fence.mode === "claim") !== claiming) throw new SessionWriterRefused("INVALID_FENCE", "claim state must match an opening or claim event");
  if (!object(next) || next.v !== 1 || next.token !== fence.owner.token || next.pid !== fence.owner.pid
    || next.hostId !== fence.owner.hostId || next.state !== (released ? "released" : "active")
    || !Number.isSafeInteger(next.pid) || (next.pid as number) <= 0 || !next.token || !next.hostId) {
    throw new SessionWriterRefused("INVALID_FENCE", "signed writer identity does not match the append fence");
  }
  if (fence.mode === "claim") {
    if (last) assertSessionOwnerAvailable(last);
    else if (input.eventType !== "session/open") throw new SessionWriterRefused("INVALID_FENCE", "only session/open can begin an empty session");
  } else {
    if (!previousOwner || previousOwner.state !== "active" || previousOwner.token !== fence.owner.token
      || previousOwner.pid !== fence.owner.pid || previousOwner.hostId !== fence.owner.hostId) {
      throw new SessionWriterRefused("STALE_HEAD", "writer no longer owns this session");
    }
    if (released !== ["session/release", "session/close"].includes(input.eventType)) {
      throw new SessionWriterRefused("INVALID_FENCE", "release state must match a release or close event");
    }
  }
}
