import { decodeNativeImageInput, materializeNativeImages, NATIVE_IMAGE_INPUT_FORMAT } from "../attachments/nativeImageInput.js";
import { readEventPayload } from "../session/eventPayload.js";
import { readLoopInboxMeta } from "../session/loopEventMeta.js";
import type { SessionEventRef, SessionService } from "../session/sessionService.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { InboxMessage } from "./loopTypes.js";

/** Only called after the pre-step gate admits the claimed message. */
export function recordNativeImageMessage(session: SessionService, message: InboxMessage): SessionEventRef | null {
  if (message.images === undefined) return null;
  const source = session.readEvents().find(event => event.id === message.inputEventId);
  const meta = source ? readLoopInboxMeta(source.meta_json) : null;
  if (!source || source.event_type !== "loop/inbox" || meta?.payloadFormat !== NATIVE_IMAGE_INPUT_FORMAT
      || meta.messageIds.length !== 1 || meta.messageIds[0] !== message.messageId) {
    throw new Error("Image input is not bound to this message's signed inbox row.");
  }
  const payload = readEventPayload(session.workspace, source);
  if (payload.status !== "ok") throw new Error(`Image inbox payload is ${payload.status}; no image may be projected.`);
  if (sha256Hex(payload.bytes) !== source.payload_sha256) throw new Error("Image inbox payload was tampered with.");
  const committed = decodeNativeImageInput(payload.bytes);
  if (canonicalize(committed.images) !== canonicalize(message.images)) throw new Error("A claimed image was changed after its signed inbox commitment.");
  const images = materializeNativeImages(committed.images);
  let last: SessionEventRef | null = null;
  images.forEach((image, index) => {
    last = session.recordUserAttachment({ filename: image.filename, content: image.bytes,
      kind: "image", mimeType: image.mediaType, sourceInputEventId: source.id, sourceInputIndex: index });
  });
  return last;
}
