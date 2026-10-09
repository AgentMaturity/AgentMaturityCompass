/**
 * The A4 poll (P1-57; design §11): events folded from the verified chain (comments are COMMENT transitions; their text
 * stays in the encrypted blob store and is read through `…/comments`), the head, and presence. The cursor is the next
 * seq to read; a page holds at most 512 events or 2 MiB, and `nextCursor` continues it. The chain is complete, so
 * nothing is ever dropped (`droppedEvents: 0`, `firstCursor: 0`). No SSE until P2-33.
 */
import type { A4ChainLink, A4ProjectRow } from "./a4Schema.js";

export const A4_EVENT_WINDOW = 512;
const A4_EVENT_WINDOW_BYTES = 2 * 1024 * 1024;

const text = (value: unknown): string | null => typeof value === "string" ? value : null;

export function a4Events(input: { chain: readonly A4ChainLink[]; head: A4ProjectRow; cursor: number; card: string | null;
  presence: ReadonlyArray<{ username: string; card: string }> }) {
  const events: Array<Record<string, unknown>> = [];
  let bytes = 0;
  let nextCursor = input.cursor;
  for (const link of input.chain) {
    if (link.seq < input.cursor) continue;
    if (events.length >= A4_EVENT_WINDOW) break;
    const cardId = text(link.body.cardId);
    const event = { cursor: link.seq, kind: link.kind, stage: text(link.body.stage), revisionNo: link.revisionNo, actor: text(link.body.actorUsername),
      ts: link.body.ts, cardId, gateId: text(link.body.gateId), commentId: text(link.body.commentId) };
    const size = Buffer.byteLength(JSON.stringify(event));
    if (events.length > 0 && bytes + size > A4_EVENT_WINDOW_BYTES) break;
    nextCursor = link.seq + 1;
    if (input.card !== null && cardId !== input.card) continue;
    bytes += size;
    events.push(event);
  }
  const { head } = input;
  return {
    events, nextCursor, firstCursor: 0, droppedEvents: 0,
    head: { headSeq: head.head_seq, headDigest: head.head_digest, stage: head.stage, step: head.step, hold: head.hold === 1, revisionNo: head.revision_no },
    presence: input.presence
  };
}
