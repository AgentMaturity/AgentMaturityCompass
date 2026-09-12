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
import { assertSessionPayloadWithinCap } from "../session/sessionPayloadCap.js";
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
    // The queued message becomes one signed row. An oversize one is refused here, before anything is recorded,
    // with the limit and its fix named — not as a bare ledger error after the caller believes it was queued.
    assertSessionPayloadWithinCap(this.session.workspace, "The queued input (text plus encoded media)", Buffer.byteLength(payloadText, "utf8"));
    const ref = this.session.recordLoopEvent({
      kind: "inbox",
      op: "insert",
      target,
      start: list.length,
      removedCount: 0,
      messageIds: [messageId],
      origin,
      text: payloadText,
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
    for (const event of this.session.readEvents()) {
      if (event.event_type !== "loop/inbox") {
        continue;
      }
      const meta = readLoopInboxMeta(event.meta_json);
      if (meta === null) {
        throw new Error(`agent inbox: unreadable loop/inbox row ${event.id}`);
      }
      this.apply(meta, event);
    }
  }

  /** Apply one persisted splice, refusing anything the live lanes cannot accept. */
  private apply(meta: LoopInboxMeta, event: EvidenceEvent): void {
    const list = this.state[meta.target];
    if (meta.start > list.length || meta.start + meta.removedCount > list.length) {
      throw new Error(`agent inbox: loop/inbox row ${event.id} splices outside the replayed queue`);
    }
    const inserted = meta.op === "insert" ? [this.replayMessage(meta, event)] : [];
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
  private replayMessage(meta: LoopInboxMeta, event: EvidenceEvent): InboxMessage {
    const messageId = meta.messageIds[0];
    if (messageId === undefined || meta.origin === null) {
      throw new Error(`agent inbox: loop/inbox row ${event.id} inserts a message with no id or origin`);
    }
    const payload = readEventPayload(this.session.workspace, event);
    if (payload.status !== "ok") {
      // Pruned and missing are both fatal HERE even though they mean different
      // things elsewhere: either way the queued text cannot be shown to a model,
      // and continuing would silently drop a message the sender was told landed.
      throw new Error(
        `agent inbox: loop/inbox row ${event.id} has no readable text (${payload.status})`
      );
    }
    if (meta.payloadFormat === NATIVE_AUDIO_INPUT_FORMAT) {
      if (sha256Hex(payload.bytes) !== event.payload_sha256) throw new Error(`agent inbox: audio input ${event.id} has tampered payload bytes`);
      return Object.freeze({ messageId, text: "", audioParts: decodeNativeAudioInput(payload.bytes), origin: meta.origin, inputEventId: event.id });
    }
    if (meta.payloadFormat === NATIVE_ORDERED_INPUT_FORMAT) {
      if (sha256Hex(payload.bytes) !== event.payload_sha256) throw new Error(`agent inbox: ordered input ${event.id} has tampered payload bytes`);
      return Object.freeze({ messageId, text: "", parts: decodeNativeOrderedInput(payload.bytes), origin: meta.origin, inputEventId: event.id });
    }
    if (meta.payloadFormat === NATIVE_IMAGE_INPUT_FORMAT) {
      if (sha256Hex(payload.bytes) !== event.payload_sha256) throw new Error(`agent inbox: image input ${event.id} has tampered payload bytes`);
      return Object.freeze({ messageId, ...decodeNativeImageInput(payload.bytes), origin: meta.origin, inputEventId: event.id });
    }
    return { messageId, text: payload.bytes.toString("utf8"), origin: meta.origin };
  }

  private assertUnique(messageId: string, event: EvidenceEvent): void {
    for (const target of TARGETS) {
      if (this.state[target].some((message) => message.messageId === messageId)) {
        throw new Error(`agent inbox: loop/inbox row ${event.id} re-queues pending message ${messageId}`);
      }
    }
  }
}
