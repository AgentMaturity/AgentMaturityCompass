/**
 * The agent's pending work, as a fold over signed rows.
 *
 * Ported from dsh's `Inbox` (`packages/core/agent/src/inbox.ts`), with one
 * change that matters: dsh's splices are session events in an unsigned log, and
 * these are signed, hash-chained evidence. The ordering dsh chose for its own
 * reasons — commit the durable splice BEFORE mutating the live projection — is
 * kept for a stronger one here: a queue that moved before its row committed
 * would be a queue whose state the log cannot explain.
 *
 * TWO LANES, ONE PRIMITIVE. `next-turn` holds prompts that each deserve their
 * own turn; `next-step` holds steering and injected context that joins the
 * nearest step boundary. A claim takes ALL of `next-step` and, at a turn
 * boundary, exactly ONE queued prompt — so a second queued prompt stays for the
 * next turn instead of being merged into this one.
 *
 * REPLAY. The projection is rebuilt from the session's own `loop/inbox` rows at
 * construction, so a driver built over an existing session keeps that session's
 * queue rather than starting empty and silently losing work. An unreadable or
 * inconsistent splice THROWS: a queue that cannot be reconstructed is not a
 * queue that should be guessed at.
 */
import { randomUUID } from "node:crypto";
import type { EvidenceEvent } from "../types.js";
import { readEventPayload } from "../session/eventPayload.js";
import { queuedInputPayloadRoute } from "../session/sessionPayloadCap.js";
import { resolveSpilledInboxPayload } from "../session/spill/spillInput.js";
import { readLoopInboxMeta } from "../session/loopEventMeta.js";
import type { InboxOrigin, InboxSpliceOp, InboxTarget, LoopInboxMeta } from "../session/loopEventMeta.js";
import type { SessionService } from "../session/sessionService.js";
import type { InboxMessage, InboxReceipt, LoopNotification } from "./loopTypes.js";
import { decodeNativeImageInput, encodeNativeImageInput, NATIVE_IMAGE_INPUT_FORMAT, snapshotNativeImages, type NativeImageInput } from "../attachments/nativeImageInput.js";
import { sha256Hex } from "../utils/hash.js";
import { decodeNativeOrderedInput, encodeNativeOrderedInput, NATIVE_ORDERED_INPUT_FORMAT,
  snapshotNativeInputParts, type NativeInputPart } from "../attachments/nativeOrderedInput.js";
import { decodeNativeAudioInput, encodeNativeAudioInput, NATIVE_AUDIO_INPUT_FORMAT,
  snapshotNativeAudioParts, type NativeAudioPart } from "../attachments/nativeAudioInput.js";

/** How an insertion was routed, beyond the target itself. */
export interface InsertOptions {
  readonly images?: readonly NativeImageInput[];
  readonly parts?: readonly NativeInputPart[];
  readonly audioParts?: readonly NativeAudioPart[];
  /** Whether this insertion is allowed to wake an idle driver. */
  readonly wake: boolean;
  /** The target the sender asked for, when this one is a demotion. */
  readonly demotedFrom: InboxTarget | null;
}

const TARGETS: readonly InboxTarget[] = ["next-turn", "next-step"];

export class LoopInbox {
  private readonly session: SessionService;

  private readonly notify: (notification: LoopNotification) => void;

  private readonly state: Record<InboxTarget, InboxMessage[]> = { "next-turn": [], "next-step": [] };

  constructor(session: SessionService, notify: (notification: LoopNotification) => void) {
    this.session = session;
    this.notify = notify;
    this.replay();
  }

  get nextTurn(): readonly InboxMessage[] {
    return this.state["next-turn"];
  }

  get nextStep(): readonly InboxMessage[] {
    return this.state["next-step"];
  }

  get hasPending(): boolean {
    return this.nextTurn.length > 0 || this.nextStep.length > 0;
  }

  /** Queue one message at the end of a lane. */
  insert(target: InboxTarget, text: string, origin: InboxOrigin, options: InsertOptions): InboxReceipt {
    if (options.audioParts !== undefined && (text !== "" || options.images !== undefined || options.parts !== undefined)) throw new Error("Audio input cannot be combined with legacy text/image input options.");
    const audioParts = options.audioParts === undefined ? undefined : snapshotNativeAudioParts(options.audioParts);
    if (options.parts !== undefined && (text !== "" || options.images !== undefined)) throw new Error("Ordered input cannot be combined with legacy text/images.");
    const parts = options.parts === undefined ? undefined : snapshotNativeInputParts(options.parts);
    const images = snapshotNativeImages(options.images);
    const messageId = randomUUID();
    const list = this.state[target];
    const payloadText = audioParts !== undefined ? encodeNativeAudioInput(audioParts) : parts !== undefined ? encodeNativeOrderedInput(parts) : images.length === 0 ? text : encodeNativeImageInput(text, images);
    // The queued message becomes one signed row — or, above the per-event cap, a signed `loop/inbox` spill
    // commitment durable BEFORE the object plus a row whose payload is the descriptor (src/session/spill/
    // spillInput.ts). Above the blob cap it is refused here, before anything is recorded, with the fix named —
    // not as a bare ledger error after the caller believes it was queued.
    const what = "The queued input (text plus encoded media)", encoded = Buffer.from(payloadText, "utf8");
    const route = queuedInputPayloadRoute(this.session.workspace, what, encoded.byteLength);
    const retained = route.spill ? this.session.retainOversizeInput(what, encoded, route.cap, { subject: "loop/inbox", messageId }) : null;
    const ref = this.session.recordLoopEvent({
      kind: "inbox",
      op: "insert",
      target,
      start: list.length,
      removedCount: 0,
      messageIds: [messageId],
      origin,
      text: retained === null ? payloadText : retained.descriptor.toString("utf8"),
      ...(audioParts !== undefined ? { payloadFormat: NATIVE_AUDIO_INPUT_FORMAT } : parts !== undefined ? { payloadFormat: NATIVE_ORDERED_INPUT_FORMAT } : images.length === 0 ? {} : { payloadFormat: NATIVE_IMAGE_INPUT_FORMAT }),
      wake: options.wake,
      demotedFrom: options.demotedFrom
    });
    const message: InboxMessage = Object.freeze({ messageId, text, origin,
      ...(audioParts === undefined ? {} : { audioParts, inputEventId: ref.eventId }),
      ...(parts === undefined ? {} : { parts, inputEventId: ref.eventId }),
      ...(images.length === 0 ? {} : { images, inputEventId: ref.eventId }) });
    list.push(message);
    this.notify({ kind: "inbox", op: "insert", target, messageIds: [message.messageId] });
    return {
      eventId: ref.eventId,
      messageId: message.messageId,
      target,
      demotedFrom: options.demotedFrom
    };
  }

  /**
   * Take the batch one step boundary is entitled to.
   *
   * All of `next-step`, plus — only at a turn boundary — the single oldest
   * queued prompt. The removals are recorded as `claim`, never `cancel`: that
   * one field is what separates "a turn consumed this" from "a cancel dropped
   * it" when the log is folded later, and no other field in the row can.
   */
  claim(target: InboxTarget): readonly InboxMessage[] {
    const claimed: InboxMessage[] = [
      ...this.splice("next-step", 0, this.state["next-step"].length, "claim")
    ];
    if (target === "next-turn") {
      claimed.push(...this.splice("next-turn", 0, 1, "claim"));
    }
    return claimed;
  }

  /**
   * Drop every pending message, `next-step` before `next-turn`.
   *
   * Steering goes first so that, if the second splice were to throw, what
   * survives is the coarser-grained work rather than half-applied steering.
   */
  clear(): void {
    this.splice("next-step", 0, this.state["next-step"].length, "cancel");
    this.splice("next-turn", 0, this.state["next-turn"].length, "cancel");
  }

  /** One durable removal, committed before the live list moves. */
  private splice(
    target: InboxTarget,
    start: number,
    deleteCount: number,
    op: Extract<InboxSpliceOp, "claim" | "cancel">
  ): readonly InboxMessage[] {
    const list = this.state[target];
    const count = Math.min(Math.max(deleteCount, 0), list.length - start);
    if (count <= 0) {
      return [];
    }
    const doomed = list.slice(start, start + count);
    this.session.recordLoopEvent({
      kind: "inbox",
      op,
      target,
      start,
      removedCount: count,
      messageIds: doomed.map((message) => message.messageId),
      origin: null,
      text: null,
      wake: false,
      demotedFrom: null
    });
    const removed = list.splice(start, count);
    this.notify({ kind: "inbox", op, target, messageIds: removed.map((message) => message.messageId) });
    return removed;
  }

  /** Rebuild the two lanes from this session's committed `loop/inbox` rows. */
  private replay(): void {
    const events = this.session.readEvents();
    for (const event of events) {
      if (event.event_type !== "loop/inbox") {
        continue;
      }
      const meta = readLoopInboxMeta(event.meta_json);
      if (meta === null) {
        throw new Error(`agent inbox: unreadable loop/inbox row ${event.id}`);
      }
      this.apply(meta, event, events);
    }
  }

  /** Apply one persisted splice, refusing anything the live lanes cannot accept. */
  private apply(meta: LoopInboxMeta, event: EvidenceEvent, events: readonly EvidenceEvent[]): void {
    const list = this.state[meta.target];
    if (meta.start > list.length || meta.start + meta.removedCount > list.length) {
      throw new Error(`agent inbox: loop/inbox row ${event.id} splices outside the replayed queue`);
    }
    const inserted = meta.op === "insert" ? [this.replayMessage(meta, event, events)] : [];
    if (inserted.length > 0) {
      this.assertUnique(inserted[0]!.messageId, event);
    }
    list.splice(meta.start, meta.removedCount, ...inserted);
  }

  /**
   * Rebuild one queued message from its row.
   *
   * The text comes from the row's PAYLOAD, not from its meta: the payload is
   * what `payload_sha256` commits to, and that digest is what a later reader
   * joins against the `user/message` row to prove the model was shown the
   * message verbatim. Rebuilding from anything else would break that join.
   */
  private replayMessage(meta: LoopInboxMeta, event: EvidenceEvent, events: readonly EvidenceEvent[]): InboxMessage {
    const messageId = meta.messageIds[0];
    if (messageId === undefined || meta.origin === null) {
      throw new Error(`agent inbox: loop/inbox row ${event.id} inserts a message with no id or origin`);
    }
    // Pruned, missing, tampered and unresolvable are all fatal HERE even though
    // they mean different things elsewhere: either way the queued text cannot be
    // shown to a model, and continuing would silently drop a message the sender
    // was told landed. Above the cap the payload is a descriptor: the bytes come
    // from the object its preceding signed `loop/inbox` commitment names, never
    // from the descriptor itself.
    const bytes = readQueuedInputBytes(this.session.workspace, events, event, messageId,
      { what: "agent inbox: queued", consequence: `loop/inbox row ${event.id} cannot be replayed.` });
    if (meta.payloadFormat === NATIVE_AUDIO_INPUT_FORMAT) {
      return Object.freeze({ messageId, text: "", audioParts: decodeNativeAudioInput(bytes), origin: meta.origin, inputEventId: event.id });
    }
    if (meta.payloadFormat === NATIVE_ORDERED_INPUT_FORMAT) {
      return Object.freeze({ messageId, text: "", parts: decodeNativeOrderedInput(bytes), origin: meta.origin, inputEventId: event.id });
    }
    if (meta.payloadFormat === NATIVE_IMAGE_INPUT_FORMAT) {
      return Object.freeze({ messageId, ...decodeNativeImageInput(bytes), origin: meta.origin, inputEventId: event.id });
    }
    return { messageId, text: bytes.toString("utf8"), origin: meta.origin };
  }

  private assertUnique(messageId: string, event: EvidenceEvent): void {
    for (const target of TARGETS) {
      if (this.state[target].some((message) => message.messageId === messageId)) {
        throw new Error(`agent inbox: loop/inbox row ${event.id} re-queues pending message ${messageId}`);
      }
    }
  }
}

/**
 * A queued row's ORIGINAL bytes: its payload, or — above the per-event cap — the
 * object named by the signed `loop/inbox` spill commitment that precedes it in
 * `events` (src/session/spill/spillInput.ts). Every reader that decodes a
 * `loop/inbox` row goes through here, so none can mistake a descriptor for the
 * queued input. Pruned, missing, tampered and unresolvable all throw, with the
 * caller's `what` and `consequence` in the message; nothing degrades.
 */
export function readQueuedInputBytes(
  workspace: string, events: readonly EvidenceEvent[], source: EvidenceEvent, messageId: string,
  describe: { readonly what: string; readonly consequence: string }
): Buffer {
  const payload = readEventPayload(workspace, source);
  if (payload.status !== "ok") throw new Error(`${describe.what} inbox payload is ${payload.status}; ${describe.consequence}`);
  if (sha256Hex(payload.bytes) !== source.payload_sha256) throw new Error(`${describe.what} inbox payload was tampered with.`);
  const spilled = resolveSpilledInboxPayload({ workspace, event: source, messageId, payload: payload.bytes, events });
  if (spilled.status === "not-spilled") return payload.bytes;
  if (spilled.status !== "ok") throw new Error(`${describe.what} inbox payload is ${spilled.status}; ${describe.consequence} (${spilled.detail})`);
  return spilled.bytes;
}
