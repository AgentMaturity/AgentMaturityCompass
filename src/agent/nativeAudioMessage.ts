import { decodeNativeAudioInput, encodeNativeAudioInput, materializeNativeAudioParts, NATIVE_AUDIO_INPUT_FORMAT } from "../attachments/nativeAudioInput.js";
import { readLoopInboxMeta } from "../session/loopEventMeta.js";
import type { SessionEventRef, SessionService } from "../session/sessionService.js";
import { readQueuedInputBytes } from "./inbox.js";
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
  const events = session.readEvents(), source = events.find(event => event.id === message.inputEventId);
  const meta = source ? readLoopInboxMeta(source.meta_json) : null;
  if (!source || source.event_type !== "loop/inbox" || meta?.op !== "insert" || meta.payloadFormat !== NATIVE_AUDIO_INPUT_FORMAT
      || meta.messageIds.length !== 1 || meta.messageIds[0] !== message.messageId || meta.origin !== message.origin
      || message.text !== "" || message.images !== undefined || message.parts !== undefined || message.audioParts === undefined) {
    throw new Error("Audio input is not bound to the message's original signed inbox.");
  }
  // Above the cap the row's payload is a descriptor; the bytes come from the object its signed commitment names.
  const bytes = readQueuedInputBytes(session.workspace, events, source, message.messageId, { what: "Audio", consequence: "no prefix may be projected." });
  const committed = decodeNativeAudioInput(bytes);
  if (encodeNativeAudioInput(message.audioParts) !== bytes.toString("utf8")) throw new Error("Audio input changed after its signed inbox commitment.");
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
