import { decodeNativeOrderedInput, encodeNativeOrderedInput, materializeNativeInputParts,
  NATIVE_ORDERED_INPUT_FORMAT } from "../attachments/nativeOrderedInput.js";
import { readEventPayload } from "../session/eventPayload.js";
import { readLoopInboxMeta } from "../session/loopEventMeta.js";
import type { SessionEventRef, SessionService } from "../session/sessionService.js";
import { sha256Hex } from "../utils/hash.js";
import type { InboxMessage } from "./loopTypes.js";

/** Ordered claims cannot be rewritten, downgraded, duplicated or forged by a hook.
 * Legacy text rewriting retains its historical contract; explicit veto still wins.
 */
export function assertOrderedClaimDecision(claimed: readonly InboxMessage[], admitted: readonly InboxMessage[]): void {
  const ordered = claimed.filter(message => message.parts !== undefined);
  const relevant = admitted.filter(message => message.parts !== undefined || ordered.some(original => original.messageId === message.messageId || original.inputEventId === message.inputEventId));
  if (ordered.length !== relevant.length) throw new Error("A preStep decision dropped or forged ordered input; veto it explicitly instead.");
  for (let index = 0; index < ordered.length; index++) {
    const original = ordered[index]!, message = relevant[index]!;
    if (message.messageId !== original.messageId || message.inputEventId !== original.inputEventId
        || message.origin !== original.origin || message.text !== "" || message.images !== undefined || message.parts === undefined
        || encodeNativeOrderedInput(message.parts) !== encodeNativeOrderedInput(original.parts!)) {
      throw new Error("A preStep decision changed or reordered the committed ordered input.");
    }
  }
}

/** Validate the COMPLETE committed sequence before emitting even its first row. */
export function recordNativeOrderedMessage(session: SessionService, message: InboxMessage): SessionEventRef {
  const source = session.readEvents().find(event => event.id === message.inputEventId);
  const meta = source ? readLoopInboxMeta(source.meta_json) : null;
  if (!source || source.event_type !== "loop/inbox" || meta?.op !== "insert"
      || meta.payloadFormat !== NATIVE_ORDERED_INPUT_FORMAT || meta.messageIds.length !== 1
      || meta.messageIds[0] !== message.messageId || meta.origin !== message.origin
      || message.text !== "" || message.images !== undefined || message.parts === undefined) {
    throw new Error("Ordered input is not bound to this message's original signed inbox sequence.");
  }
  const payload = readEventPayload(session.workspace, source);
  if (payload.status !== "ok") throw new Error(`Ordered inbox payload is ${payload.status}; no part may be projected.`);
  if (sha256Hex(payload.bytes) !== source.payload_sha256) throw new Error("Ordered inbox payload was tampered with.");
  const committed = decodeNativeOrderedInput(payload.bytes);
  if (encodeNativeOrderedInput(message.parts) !== payload.bytes.toString("utf8")) throw new Error("A claimed ordered sequence changed after its signed inbox commitment.");
  const parts = materializeNativeInputParts(committed);
  let last: SessionEventRef | undefined, imageIndex = 0;
  parts.forEach((part, sourceContentIndex) => {
    const provenance = { sourceInputEventId: source.id, sourceInputFormat: NATIVE_ORDERED_INPUT_FORMAT, sourceContentIndex } as const;
    last = part.type === "text" ? session.recordUserMessage(part.text, provenance)
      : session.recordUserAttachment({ filename: part.image.filename, content: part.image.bytes,
        kind: "image", mimeType: part.image.mediaType, sourceInputIndex: imageIndex++, ...provenance });
  });
  return last!; // The codec requires a nonempty image-bearing sequence.
}
