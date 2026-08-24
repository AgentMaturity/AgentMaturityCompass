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
import { readLoopInboxMeta } from "../session/loopEventMeta.js";
import type { InboxOrigin, InboxSpliceOp, InboxTarget, LoopInboxMeta } from "../session/loopEventMeta.js";
import type { SessionService } from "../session/sessionService.js";
import type { InboxMessage, InboxReceipt, LoopNotification } from "./loopTypes.js";

/** How an insertion was routed, beyond the target itself. */
export interface InsertOptions {
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
    const message: InboxMessage = { messageId: randomUUID(), text, origin };
    const list = this.state[target];
    const ref = this.session.recordLoopEvent({
      kind: "inbox",
      op: "insert",
      target,
      start: list.length,
      removedCount: 0,
      messageIds: [message.messageId],
      origin,
      text,
      wake: options.wake,
      demotedFrom: options.demotedFrom
    });
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
