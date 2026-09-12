import { decodeNativeAudioInput, encodeNativeAudioInput, materializeNativeAudioParts, NATIVE_AUDIO_INPUT_FORMAT } from "../attachments/nativeAudioInput.js";
import { readEventPayload } from "../session/eventPayload.js";
import { readLoopInboxMeta } from "../session/loopEventMeta.js";
import type { SessionEventRef, SessionService } from "../session/sessionService.js";
import { sha256Hex } from "../utils/hash.js";
import type { InboxMessage } from "./loopTypes.js";

/** Explicit veto remains possible; an entering hook cannot erase or rewrite input. */
export function assertAudioClaimDecision(claimed: readonly InboxMessage[], admitted: readonly InboxMessage[]): void {
  const originals = claimed.filter(message => message.audioParts !== undefined);
  const relevant = admitted.filter(message => message.audioParts !== undefined
    || originals.some(original => original.messageId === message.messageId || original.inputEventId === message.inputEventId));
  if (originals.length !== relevant.length) throw new Error("A preStep decision dropped or forged signed audio input; explicitly veto instead.");
  for (const [index, original] of originals.entries()) {
    const message = relevant[index]!;
    if (message.messageId !== original.messageId || message.inputEventId !== original.inputEventId || message.origin !== original.origin
        || message.text !== "" || message.images !== undefined || message.parts !== undefined || message.audioParts === undefined
        || encodeNativeAudioInput(message.audioParts) !== encodeNativeAudioInput(original.audioParts!)) {
      throw new Error("A preStep decision changed, downgraded or reordered committed audio input.");
    }
  }
}

/** Validate the complete original bundle before the first content row is emitted. */
export function recordNativeAudioMessage(session: SessionService, message: InboxMessage): SessionEventRef {
  const source = session.readEvents().find(event => event.id === message.inputEventId);
  const meta = source ? readLoopInboxMeta(source.meta_json) : null;
  if (!source || source.event_type !== "loop/inbox" || meta?.op !== "insert" || meta.payloadFormat !== NATIVE_AUDIO_INPUT_FORMAT
      || meta.messageIds.length !== 1 || meta.messageIds[0] !== message.messageId || meta.origin !== message.origin
      || message.text !== "" || message.images !== undefined || message.parts !== undefined || message.audioParts === undefined) {
    throw new Error("Audio input is not bound to the message's original signed inbox.");
  }
  const payload = readEventPayload(session.workspace, source);
  if (payload.status !== "ok") throw new Error(`Audio inbox payload is ${payload.status}; no prefix may be projected.`);
  if (sha256Hex(payload.bytes) !== source.payload_sha256) throw new Error("Audio inbox payload was tampered with.");
  const committed = decodeNativeAudioInput(payload.bytes);
  if (encodeNativeAudioInput(message.audioParts) !== payload.bytes.toString("utf8")) throw new Error("Audio input changed after its signed inbox commitment.");
  const parts = materializeNativeAudioParts(committed);
  let last: SessionEventRef | undefined, imageIndex = 0, audioIndex = 0;
  for (const [sourceContentIndex, part] of parts.entries()) {
    const provenance = { sourceInputEventId: source.id, sourceInputFormat: NATIVE_AUDIO_INPUT_FORMAT, sourceContentIndex } as const;
    if (part.type === "text") last = session.recordUserMessage(part.text, provenance);
    else if (part.type === "image") last = session.recordUserAttachment({ kind: "image", filename: part.image.filename,
      content: part.image.bytes, mimeType: part.image.mediaType, sourceInputIndex: imageIndex++, ...provenance });
    else last = session.recordUserAttachment({ kind: "audio", filename: part.audio.filename,
      content: part.audio.bytes, mimeType: part.audio.mediaType, sourceInputIndex: audioIndex++, ...provenance });
  }
  return last!;
}
