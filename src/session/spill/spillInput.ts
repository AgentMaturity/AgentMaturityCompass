/**
 * Spilled INPUT rows.
 *
 * A user attachment whose original bytes exceed `retention.maxPayloadBytesPerEvent`
 * cannot become one signed row, so its bytes are retained in the encrypted spill
 * store (./spillStore.ts) behind the same ordering the tool/result path uses: a
 * signed commitment row carrying the `SpillRef` is durable BEFORE the object is
 * published, and the attachment row that follows carries the same reference in
 * its meta plus a small descriptor as its payload.
 *
 * The descriptor is the row's PAYLOAD so that every existing invariant holds
 * unchanged: `surface.part.sha256` is still the payload digest, `payload_sha256`
 * still commits to what is stored, and retention can still prune the row's blob.
 * The descriptor names the object (locator), the full-content digest and the
 * byte length — the same three facts the signed `spilled` meta commits to — so a
 * reader cross-checks descriptor against meta before touching the store, and
 * then holds the object to the signed digest exactly as spillEvidence.ts does
 * for tool output. A descriptor is never returned as if it were the bytes.
 *
 * Read side: `resolveSpilledInputPayload` is the ONE resolver every consumer
 * that hands attachment bytes to a model or a client calls (request derivation,
 * ACP history replay). It refuses when the row is unauthentic, when the
 * descriptor and the signed reference disagree, when the object is modified,
 * or — when the session history is supplied — when no signed commitment row
 * precedes the attachment row.
 *
 * Write side: `SessionSpillPolicy.retainInput` (./spillPolicy.ts) prepares,
 * commits and publishes. Unlike tool output, nothing degrades to a preview: an
 * input whose bytes the store cannot retain is an input the model can never be
 * shown, so every failure is thrown as a `SpilledInputRetentionError` naming
 * the stage it failed at and what was (not) recorded.
 */
import type { EvidenceEvent } from "../../types.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { inspectSpilledEvent, type SpillRetrievalOptions } from "./spillEvidence.js";
import { extractSpillRef, parseSpillLocator, SPILL_META_KEY, type SpillRef } from "./spillTypes.js";

export const SPILLED_INPUT_FORMAT = "amc-spilled-input@1";
/**
 * Input spills reuse the tool commitment's event type: the retention engine
 * already treats every row of this type as a payload-free precommitment, and a
 * dedicated `user/spill-commitment` type would need the event-type union in
 * src/types.ts and src/session/sessionTypes.ts to grow first.
 */
export const SPILL_COMMITMENT_EVENT_TYPE = "tool/spill-commitment" as const;
/** Meta key on an input commitment row naming the event type it precedes. Tool commitments carry `toolCallId` instead. */
export const SPILL_SUBJECT_META_KEY = "subject";
/** Subject of a commitment that precedes a queued `loop/inbox` row (see `resolveSpilledInboxPayload`). */
export const SPILL_INBOX_SUBJECT = "loop/inbox" as const;
/** Meta key on a `loop/inbox` commitment naming the one queued message it retains bytes for. */
export const SPILL_INBOX_MESSAGE_META_KEY = "messageId";

/**
 * What a spilled input's commitment row names besides the reference. A
 * `user/attachment` row carries the same reference in its own meta; a
 * `loop/inbox` row cannot (its meta is a fixed hash pre-image in
 * ../loopEventMeta.ts), so its commitment binds the queued message id instead
 * and the reader finds the commitment by subject, message id and descriptor.
 */
export type SpillCommitmentSubject =
  | { readonly subject: "user/attachment"; readonly filename: string }
  | { readonly subject: typeof SPILL_INBOX_SUBJECT; readonly messageId: string };

/** The subject's contribution to the commitment row's signed meta. */
export function spillCommitmentMeta(subject: SpillCommitmentSubject): Record<string, unknown> {
  return subject.subject === SPILL_INBOX_SUBJECT
    ? { [SPILL_SUBJECT_META_KEY]: SPILL_INBOX_SUBJECT, [SPILL_INBOX_MESSAGE_META_KEY]: subject.messageId }
    : { [SPILL_SUBJECT_META_KEY]: "user/attachment", filename: subject.filename };
}

/** The store's object-name seed for a subject: the filename, or the queued message id. */
export function spillCommitmentNameSeed(subject: SpillCommitmentSubject): string {
  return subject.subject === SPILL_INBOX_SUBJECT ? subject.messageId : subject.filename;
}
const MAX_DESCRIPTOR_BYTES = 1024;
const SHA256_RE = /^[0-9a-f]{64}$/;

export interface SpilledInputDescriptor {
  readonly format: typeof SPILLED_INPUT_FORMAT;
  readonly contentSha256: string;
  readonly bytes: number;
  readonly locator: string;
}

/** The canonical payload that stands in for retained input bytes. */
export function encodeSpilledInputDescriptor(ref: Pick<SpillRef, "contentSha256" | "bytes" | "locator">): Buffer {
  if (ref.locator === null) throw new Error("a spilled input descriptor requires a retained locator");
  const descriptor: SpilledInputDescriptor = { format: SPILLED_INPUT_FORMAT, contentSha256: ref.contentSha256, bytes: ref.bytes, locator: ref.locator };
  return Buffer.from(canonicalize(descriptor), "utf8");
}

/** Null for anything that is not exactly a canonical descriptor. */
export function decodeSpilledInputDescriptor(bytes: Buffer): SpilledInputDescriptor | null {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_DESCRIPTOR_BYTES) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString("utf8")); } catch { return null; }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const candidate = parsed as Record<string, unknown>;
  if (candidate.format !== SPILLED_INPUT_FORMAT || typeof candidate.contentSha256 !== "string" || !SHA256_RE.test(candidate.contentSha256)
      || !Number.isSafeInteger(candidate.bytes) || (candidate.bytes as number) < 0
      || typeof candidate.locator !== "string" || parseSpillLocator(candidate.locator) === null) return null;
  const descriptor: SpilledInputDescriptor = {
    format: SPILLED_INPUT_FORMAT, contentSha256: candidate.contentSha256, bytes: candidate.bytes as number, locator: candidate.locator
  };
  // Only the canonical encoding is a descriptor: re-encoding must reproduce the payload byte for byte.
  return Buffer.from(canonicalize(descriptor), "utf8").equals(bytes) ? descriptor : null;
}

export type SpilledInputStage = "prepare" | "commit" | "persist";

export class SpilledInputRetentionError extends Error {
  readonly code = "AMC_SESSION_SPILL_RETENTION";
  readonly stage: SpilledInputStage;
  readonly byteLength: number;
  readonly cap: number;
  constructor(what: string, byteLength: number, cap: number, stage: SpilledInputStage, reason: string) {
    const outcome = stage === "prepare"
      ? "Nothing was recorded."
      : stage === "commit"
        ? "No object was published and no attachment row was recorded; if the commitment append itself was durable it remains as an explicitly missing object."
        : "The signed spill commitment records the attempt as an explicitly missing object; no attachment row was recorded.";
    super(`${what} is ${byteLength} bytes, above the ${cap}-byte limit for one signed session event, and the encrypted spill store `
      + `could not retain it (${stage}: ${reason}). ${outcome} Retaining oversize input needs vault-backed blob keys and a signed ops policy `
      + "with blob encryption enabled; otherwise attach smaller media or split the input across turns.");
    this.name = "SpilledInputRetentionError";
    this.stage = stage;
    this.byteLength = byteLength;
    this.cap = cap;
  }
}

export type SpilledInputResolution =
  /** The row's payload is the whole attachment. Most rows are that. */
  | { readonly status: "not-spilled" }
  | { readonly status: "ok"; readonly bytes: Buffer; readonly ref: SpillRef; readonly commitmentEventId: string | null }
  /** The object is gone or was never retained. Retention or a wiped store looks like this. */
  | { readonly status: "missing"; readonly detail: string }
  | { readonly status: "key-unavailable"; readonly detail: string }
  /** The row's own hash or signature does not hold. */
  | { readonly status: "unauthentic"; readonly detail: string }
  /** Descriptor, reference, commitment ordering or object bytes contradict each other. */
  | { readonly status: "evidence-inconsistent"; readonly detail: string };

function metaOf(event: EvidenceEvent): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(event.meta_json);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function inconsistent(detail: string): SpilledInputResolution {
  return { status: "evidence-inconsistent", detail };
}

/** The signed commitment row that must precede `event`: same session, same subject, identical reference. */
function precedingCommitment(events: readonly EvidenceEvent[], event: EvidenceEvent, ref: SpillRef): EvidenceEvent | null | undefined {
  const index = events.findIndex((row) => row.id === event.id);
  if (index < 0) return undefined;
  const wanted = canonicalize(ref);
  for (const row of events.slice(0, index)) {
    if (row.event_type !== SPILL_COMMITMENT_EVENT_TYPE || row.session_id !== event.session_id) continue;
    if (metaOf(row)[SPILL_SUBJECT_META_KEY] !== event.event_type) continue;
    const declared = extractSpillRef(row.meta_json);
    if (declared !== null && canonicalize(declared) === wanted) return row;
  }
  return null;
}

/**
 * Resolve a spilled input row's original bytes, or say exactly why not.
 *
 * `payload` is the row's own payload as the caller already read and digest-checked
 * it; this function never reads a row payload itself, so the caller's pruned /
 * missing precedence (src/session/eventPayload.ts) stays the single authority for
 * that question. When `events` is supplied, the signed commitment row must precede
 * the input row in it — the read-side half of the commitment-before-object rule.
 */
export function resolveSpilledInputPayload(input: {
  readonly workspace: string;
  readonly event: EvidenceEvent;
  readonly payload: Buffer;
  readonly events?: readonly EvidenceEvent[];
  readonly options?: SpillRetrievalOptions;
}): SpilledInputResolution {
  const { event } = input;
  const ref = extractSpillRef(event.meta_json);
  if (ref === null) {
    const declared = metaOf(event)[SPILL_META_KEY];
    return declared === undefined || declared === null
      ? { status: "not-spilled" }
      : inconsistent(`event ${event.id} declares a spill reference this reader cannot parse`);
  }
  const descriptor = decodeSpilledInputDescriptor(input.payload);
  if (descriptor === null) return inconsistent(`event ${event.id} carries a spill reference but its payload is not a spilled-input descriptor`);
  if (descriptor.locator !== ref.locator || descriptor.contentSha256 !== ref.contentSha256 || descriptor.bytes !== ref.bytes) {
    return inconsistent(`event ${event.id}: its descriptor does not name the object, digest and length its signed reference commits to`);
  }
  let commitmentEventId: string | null = null;
  if (input.events !== undefined) {
    const commitment = precedingCommitment(input.events, event, ref);
    if (commitment === undefined) return inconsistent(`event ${event.id} is not in the supplied session history`);
    if (commitment === null) return inconsistent(`no signed spill commitment precedes event ${event.id} for ${ref.locator}`);
    commitmentEventId = commitment.id;
  }
  return readCommittedObject(input.workspace, event, ref, commitmentEventId, input.options);
}

/**
 * Row hash and monitor signature of the row that carries `ref` in its meta, then
 * the object held to the signed digest and length — the same walk tool output
 * takes. For an attachment the carrier is the attachment row itself; for a
 * queued input it is the commitment row, the only signed row naming the object.
 */
function readCommittedObject(
  workspace: string, carrier: EvidenceEvent, ref: SpillRef, commitmentEventId: string | null, options?: SpillRetrievalOptions
): SpilledInputResolution {
  const inspected = inspectSpilledEvent(workspace, carrier, options ?? {});
  if (inspected.status !== "ok" || inspected.bytes === null) {
    const detail = `event ${carrier.id}: ${inspected.detail ?? inspected.status}`;
    switch (inspected.status) {
      case "missing":
      case "unretrievable":
        return { status: "missing", detail };
      case "key-unavailable":
        return { status: "key-unavailable", detail };
      case "row-unauthentic":
        return { status: "unauthentic", detail };
      default:
        return inconsistent(detail);
    }
  }
  const bytes = inspected.bytes;
  if (bytes.length !== ref.bytes || sha256Hex(bytes) !== ref.contentSha256) {
    return inconsistent(`event ${carrier.id}: resolved bytes differ from the signed commitment`);
  }
  return { status: "ok", bytes, ref, commitmentEventId };
}

/**
 * Resolve a queued `loop/inbox` row's original bytes, or say exactly why not.
 *
 * A `loop/inbox` row's meta is a fixed hash pre-image, so it carries no
 * reference of its own: the descriptor is its payload, and the signed
 * reference lives on the `tool/spill-commitment` row (subject `loop/inbox`,
 * naming this message id) that must precede it in `events`. The history is
 * therefore required, not optional. A payload that is not a descriptor is the
 * queued input itself (`not-spilled`); a descriptor with no matching preceding
 * commitment is refused, never decoded as input.
 */
export function resolveSpilledInboxPayload(input: {
  readonly workspace: string;
  readonly event: EvidenceEvent;
  readonly messageId: string;
  readonly payload: Buffer;
  readonly events: readonly EvidenceEvent[];
  readonly options?: SpillRetrievalOptions;
}): SpilledInputResolution {
  const { event } = input;
  const descriptor = decodeSpilledInputDescriptor(input.payload);
  if (descriptor === null) return { status: "not-spilled" };
  if (event.event_type !== "loop/inbox") return inconsistent(`event ${event.id} carries a spilled-input descriptor but is not a loop/inbox row`);
  const index = input.events.findIndex((row) => row.id === event.id);
  if (index < 0) return inconsistent(`event ${event.id} is not in the supplied session history`);
  for (const row of input.events.slice(0, index)) {
    if (row.event_type !== SPILL_COMMITMENT_EVENT_TYPE || row.session_id !== event.session_id) continue;
    const meta = metaOf(row);
    if (meta[SPILL_SUBJECT_META_KEY] !== SPILL_INBOX_SUBJECT || meta[SPILL_INBOX_MESSAGE_META_KEY] !== input.messageId) continue;
    const declared = extractSpillRef(row.meta_json);
    if (declared === null || declared.locator !== descriptor.locator || declared.contentSha256 !== descriptor.contentSha256 || declared.bytes !== descriptor.bytes) continue;
    return readCommittedObject(input.workspace, row, declared, row.id, input.options);
  }
  return inconsistent(`no signed loop/inbox spill commitment for message ${input.messageId} precedes event ${event.id} naming ${descriptor.locator}`);
}
