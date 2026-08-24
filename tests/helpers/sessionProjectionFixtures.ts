/**
 * Log fixtures for the projection registry tests.
 *
 * These are not toy rows: `event_hash` is computed with the ledger's real
 * pre-image (`canonicalMetadataForHash`, the same helper the writer and the
 * verifier share), so a fixture log is self-consistent in exactly the sense
 * `verifyLedgerIntegrity` means. That matters because the cache's guarantee is
 * stated against self-consistent rows, and a fixture that faked its hashes
 * would let a test assert a property the production formula does not have.
 */
import { canonicalMetadataForHash } from "../../src/ledger/eventHash.js";
import { embedEnvelope, SESSION_GENESIS } from "../../src/session/sessionTypes.js";
import type {
  SessionEnvelope,
  SurfaceKind,
  SurfaceOp,
  SurfaceRole
} from "../../src/session/sessionTypes.js";
import type { EvidenceEvent, EvidenceEventType } from "../../src/types.js";
import { sha256Hex } from "../../src/utils/hash.js";

export const FIXTURE_SESSION_ID = "sess-projection";

export interface EventSpec {
  readonly eventType: EvidenceEventType;
  readonly surface: SurfaceOp;
}

export function appendOp(
  slot: string,
  role: SurfaceRole,
  kind: SurfaceKind,
  sha256: string
): SurfaceOp {
  return { op: "append", slot, role, part: { kind, sha256 } };
}

export const NONE_OP: SurfaceOp = { op: "none" };

/** The event-hash pre-image the ledger writer and verifier both use. */
export function recomputeEventHash(event: EvidenceEvent): string {
  const canonicalMetadata = canonicalMetadataForHash({
    id: event.id,
    ts: event.ts,
    sessionId: event.session_id,
    runtime: event.runtime,
    eventType: event.event_type,
    payloadPath: event.canonical_payload_path ?? event.payload_path,
    payloadInline: event.canonical_payload_inline ?? event.payload_inline,
    metaJson: event.meta_json
  });
  return sha256Hex(`${event.prev_event_hash}${canonicalMetadata}${event.payload_sha256}`);
}

// The payload a surface op names is the row's own payload — the structural
// "model-visible ⊆ logged" statement — so the fixture derives one from the
// other rather than letting them drift.
function payloadShaFor(op: SurfaceOp, index: number): string {
  if (op.op === "append" || op.op === "replace") {
    return op.part.sha256;
  }
  return sha256Hex(`control-${index}`);
}

function buildEvent(
  index: number,
  spec: EventSpec,
  prevGlobalHash: string,
  prevSessionHash: string
): EvidenceEvent {
  const envelope: SessionEnvelope = {
    v: 1,
    sessionId: FIXTURE_SESSION_ID,
    seq: index,
    prevSessionEventHash: prevSessionHash,
    turn: null,
    step: null,
    surface: spec.surface,
    synthetic: false
  };
  const draft: EvidenceEvent = {
    id: `evt-${index}`,
    ts: 1_700_000_000_000 + index,
    session_id: FIXTURE_SESSION_ID,
    runtime: "amc",
    event_type: spec.eventType,
    payload_path: `blobs/${index}`,
    payload_inline: null,
    payload_sha256: payloadShaFor(spec.surface, index),
    meta_json: JSON.stringify(embedEnvelope({}, envelope)),
    prev_event_hash: prevGlobalHash,
    event_hash: "",
    writer_sig: `sig-${index}`
  };
  return { ...draft, event_hash: recomputeEventHash(draft) };
}

/** A chained, self-consistent log: each row commits to its predecessor. */
export function buildLog(specs: readonly EventSpec[]): readonly EvidenceEvent[] {
  return specs.reduce<readonly EvidenceEvent[]>((events, spec, index) => {
    const previous = events[index - 1];
    const event = buildEvent(
      index,
      spec,
      previous?.event_hash ?? "GENESIS",
      previous?.event_hash ?? SESSION_GENESIS
    );
    return [...events, event];
  }, []);
}

/**
 * Chain one more event onto an existing log. `uid` names the row (id, ts,
 * envelope seq) and must be unique across a run: rows may have been dropped, so
 * position is not a usable identity.
 */
export function appendTo(
  events: readonly EvidenceEvent[],
  spec: EventSpec,
  uid: number
): readonly EvidenceEvent[] {
  const previous = events[events.length - 1];
  return [
    ...events,
    buildEvent(uid, spec, previous?.event_hash ?? "GENESIS", previous?.event_hash ?? SESSION_GENESIS)
  ];
}

/**
 * Rewrite ONE row's surface op in place, re-deriving that row's own
 * `event_hash` and leaving every later row's recorded hash untouched.
 *
 * This is the adversarial shape for a cache: the head of the log is byte-
 * identical, the length is unchanged, and only an interior row moved. A cache
 * that validated on "the last event still has the hash I remember" would extend
 * a value folded over the OLD row and return a conversation the log does not
 * contain. The registry's contract is over the array it is handed, so it has to
 * survive this whatever produced it — a filtered read, two merged reads, or a
 * rewrite applied to one row and not its successors.
 */
export function rewriteSurfaceAt(
  events: readonly EvidenceEvent[],
  index: number,
  surface: SurfaceOp
): readonly EvidenceEvent[] {
  return events.map((event, position) => {
    if (position !== index) {
      return event;
    }
    const meta = JSON.parse(event.meta_json) as Record<string, unknown>;
    const envelope = { ...(meta.amcSession as SessionEnvelope), surface };
    const rewritten: EvidenceEvent = {
      ...event,
      payload_sha256: payloadShaFor(surface, index),
      meta_json: JSON.stringify({ ...meta, amcSession: envelope })
    };
    return { ...rewritten, event_hash: recomputeEventHash(rewritten) };
  });
}

/**
 * Rewrite a row's surface op but KEEP its recorded `event_hash`.
 *
 * The row is now internally inconsistent — outside the premise the projection
 * cache is built on, and inside the premise `verifyLedgerIntegrity` exists to
 * police. Present so the boundary is stated by a test rather than only by a
 * comment.
 */
export function rewriteSurfaceKeepingHash(
  events: readonly EvidenceEvent[],
  index: number,
  surface: SurfaceOp
): readonly EvidenceEvent[] {
  const rewritten = rewriteSurfaceAt(events, index, surface);
  return rewritten.map((event, position) =>
    position === index ? { ...event, event_hash: events[index]?.event_hash ?? "" } : event
  );
}

export function swapAt(
  events: readonly EvidenceEvent[],
  first: number,
  second: number
): readonly EvidenceEvent[] {
  return events.map((event, index) => {
    if (index === first) return events[second] ?? event;
    if (index === second) return events[first] ?? event;
    return event;
  });
}

export function dropAt(
  events: readonly EvidenceEvent[],
  index: number
): readonly EvidenceEvent[] {
  return events.filter((_, position) => position !== index);
}
