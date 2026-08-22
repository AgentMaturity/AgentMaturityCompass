import type { EvidenceEventType } from "../types.js";

// The turn-sealed session spine rides entirely inside the existing evidence
// chain: every session event is an ordinary `evidence_events` row, and the
// per-session ordering is carried by the SessionEnvelope embedded in meta_json.
// Because the envelope lives in meta_json it is inside `event_hash`, so its
// contents (seq, prevSessionEventHash, surface op, synthetic flag) are as
// tamper-evident as any other hashed field.

// The 18 event types that make up the session spine. These are a strict
// superset added to EvidenceEventType; none of them may be added to
// AUTO_INCIDENT_FALLBACK_EVENT_TYPES (ledger.ts) or every tool call would open
// an incident.
export const SESSION_EVENT_TYPES: ReadonlySet<EvidenceEventType> = new Set<EvidenceEventType>([
  "session/open",
  "session/close",
  "turn/start",
  "turn/end",
  "turn/seal",
  "step/start",
  "step/end",
  "request/header",
  "system/prompt",
  "user/message",
  "assistant/block",
  "tool/call",
  "tool/result",
  "approval/request",
  "approval/answer",
  "sandbox/mode",
  "session/recovery-claim",
  "session/recovered"
]);

// Sentinel value of SessionEnvelope.prevSessionEventHash at seq 0. A concrete
// string (rather than null) so the per-session chain has a fixed-width, hashable
// genesis marker, mirroring how the global chain seeds prev_event_hash.
export const SESSION_GENESIS = "SESSION_GENESIS";

// Stable meta_json key under which the envelope is embedded. Chosen so it does
// NOT collide with the keys sanitizeMetaForHash strips (`receipt`,
// `receipt_sha256`) — the envelope must survive into the hash pre-image.
export const SESSION_ENVELOPE_META_KEY = "amcSession";

export type SurfaceRole = "system" | "user" | "assistant" | "tool";

export type SurfaceKind = "text" | "thinking" | "tool_use" | "tool_result" | "image";

export interface SurfacePartRef {
  readonly kind: SurfaceKind;
  // INVARIANT BY CONSTRUCTION: this equals the row's own payload_sha256, so
  // every projected part is the payload of exactly one logged event.
  readonly sha256: string;
}

// How a session event mutates the derived conversation surface. Slots are named
// buckets; append adds a part to a role's slot, replace swaps a slot's part,
// retract removes it, and none leaves the surface untouched (control events and
// redaction-shadow events).
export type SurfaceOp =
  | { readonly op: "none" }
  | { readonly op: "append"; readonly slot: string; readonly role: SurfaceRole; readonly part: SurfacePartRef }
  | { readonly op: "replace"; readonly slot: string; readonly part: SurfacePartRef }
  | { readonly op: "retract"; readonly slot: string; readonly reason: string };

// The envelope embedded in meta_json on every session event. The Session
// service is the single writer for its own session, so it holds the per-session
// head (seq + prevSessionEventHash) in memory and pays no extra query per
// append; it re-reads on open and on recovery.
export interface SessionEnvelope {
  readonly v: 1;
  readonly sessionId: string;
  readonly seq: number; // per-session, 0-based, strictly monotone
  readonly prevSessionEventHash: string; // prior event_hash IN THIS SESSION; SESSION_GENESIS at seq 0
  readonly turn: number | null; // null for session-scoped events
  readonly step: number | null;
  readonly surface: SurfaceOp;
  readonly synthetic: boolean; // true only for crash-recovery appends
}

// Shared vocabulary used across the service, projection, and recovery so a tool
// outcome or approval answer is spelled the same way everywhere.
export type ToolOutcome = "OK" | "ERROR" | "DENIED" | "CANCELLED" | "TOOL_OUTCOME_UNKNOWN";

export type ToolDispatch = "native" | "code";

export type TurnTrigger = "user" | "followup" | "steer" | "resume";

export type TurnEndReason = "complete" | "cancelled" | "error" | "interrupted" | "max_steps";

export type ApprovalAnswer = "allow" | "allow_always" | "deny" | "unavailable";

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
}

function isSurfacePartRef(value: unknown): value is SurfacePartRef {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const kind = candidate.kind;
  const validKind =
    kind === "text" ||
    kind === "thinking" ||
    kind === "tool_use" ||
    kind === "tool_result" ||
    kind === "image";
  return validKind && typeof candidate.sha256 === "string";
}

function isSurfaceOp(value: unknown): value is SurfaceOp {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  switch (candidate.op) {
    case "none":
      return true;
    case "append":
      return (
        typeof candidate.slot === "string" &&
        (candidate.role === "system" ||
          candidate.role === "user" ||
          candidate.role === "assistant" ||
          candidate.role === "tool") &&
        isSurfacePartRef(candidate.part)
      );
    case "replace":
      return typeof candidate.slot === "string" && isSurfacePartRef(candidate.part);
    case "retract":
      return typeof candidate.slot === "string" && typeof candidate.reason === "string";
    default:
      return false;
  }
}

// Boundary validation: an envelope pulled out of a stored row is untrusted until
// its shape is checked, so extractEnvelope narrows through this guard rather
// than casting.
export function isSessionEnvelope(value: unknown): value is SessionEnvelope {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.v === 1 &&
    typeof candidate.sessionId === "string" &&
    typeof candidate.seq === "number" &&
    typeof candidate.prevSessionEventHash === "string" &&
    (candidate.turn === null || typeof candidate.turn === "number") &&
    (candidate.step === null || typeof candidate.step === "number") &&
    typeof candidate.synthetic === "boolean" &&
    isSurfaceOp(candidate.surface)
  );
}

// Attach the envelope to a type-specific meta object under the stable key. The
// envelope is placed first, then the type meta keys in their given insertion
// order. Key order is load-bearing: sanitizeMetaForHash re-stringifies in
// insertion order and canonicalize() never descends into meta_json, so meta
// built in a different key order hashes differently. Callers MUST build the
// type meta with a fixed key order; this helper fixes the envelope's position.
export function embedEnvelope(
  meta: Record<string, unknown>,
  envelope: SessionEnvelope
): Record<string, unknown> {
  return { [SESSION_ENVELOPE_META_KEY]: envelope, ...meta };
}

// Inverse of embedEnvelope. Returns null when the row carries no well-formed
// envelope (a non-session event, or malformed meta) rather than throwing, so
// callers can cheaply distinguish spine rows from the rest of the ledger.
export function extractEnvelope(metaJson: string): SessionEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(metaJson);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const candidate = (parsed as Record<string, unknown>)[SESSION_ENVELOPE_META_KEY];
  if (!isSessionEnvelope(candidate)) {
    return null;
  }
  return candidate;
}
