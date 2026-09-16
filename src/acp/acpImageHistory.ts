import { assertNativeImageBytes } from "../attachments/nativeImageInput.js";
import { assertNativeAudioBytes, NATIVE_AUDIO_INPUT_FORMAT } from "../attachments/nativeAudioInput.js";
import { readEventPayload } from "../session/eventPayload.js";
import { resolveSpilledInputPayload } from "../session/spill/spillInput.js";
import { extractEnvelope } from "../session/sessionTypes.js";
import type { EvidenceEvent } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { ACP_ERROR, AcpFailure } from "./acpErrors.js";
import type { AcpSessionUpdate } from "./acpProjection.js";

/** The caller authenticates the entire committed tail BEFORE any replay is sent.
 * This checks the signed attachment's meaning and resolves original binary bytes;
 * it neither re-ingests content under a new policy nor treats a digest as bytes.
 * An attachment above the per-event cap carries a descriptor payload and its
 * original bytes in the spill store; those are resolved against the row's signed
 * reference, and when `history` is supplied the signed commitment row that
 * preceded the object is required too.
 */
export function projectAcpAttachment(workspace: string, event: EvidenceEvent, history?: readonly EvidenceEvent[]): AcpSessionUpdate {
  const refuse = (reason: string): never => {
    throw new AcpFailure(ACP_ERROR.internal,
      `Signed attachment history cannot be replayed (${reason}); inspect the session evidence before continuing.`, { reason });
  };
  const envelope = extractEnvelope(event.meta_json);
  const surface = envelope?.surface;
  if (event.event_type !== "user/attachment" || envelope?.sessionId !== event.session_id
      || surface?.op !== "append" || surface.role !== "user"
      || !["image", "text", "audio"].includes(surface.part.kind)
      || surface.part.sha256 !== event.payload_sha256) return refuse("evidence-inconsistent");
  const payload = readEventPayload(workspace, event);
  if (payload.status !== "ok") return refuse(`payload-${payload.status}`);
  if (sha256Hex(payload.bytes) !== event.payload_sha256) return refuse("evidence-inconsistent");
  const meta = JSON.parse(event.meta_json) as Record<string, unknown>;
  const spilled = resolveSpilledInputPayload({ workspace, event, payload: payload.bytes, ...(history === undefined ? {} : { events: history }) });
  if (spilled.status !== "ok" && spilled.status !== "not-spilled") {
    return refuse(spilled.status === "missing" ? "payload-missing" : spilled.status === "key-unavailable" ? "payload-key-unavailable" : "evidence-inconsistent");
  }
  const bytes = spilled.status === "ok" ? spilled.bytes : payload.bytes;
  if (!Number.isSafeInteger(meta.bytes) || meta.bytes !== bytes.length) return refuse("evidence-inconsistent");
  if (surface.part.kind === "text") {
    const text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes)) return refuse("evidence-inconsistent");
    return { sessionUpdate: "user_message_chunk", content: { type: "text", text } };
  }
  if (surface.part.kind === "audio") {
    if (meta.sourceInputFormat !== NATIVE_AUDIO_INPUT_FORMAT) return refuse("evidence-inconsistent");
    try { assertNativeAudioBytes(bytes, meta.mimeType); }
    catch { return refuse("evidence-inconsistent"); }
    return { sessionUpdate: "user_message_chunk", content: {
      type: "audio", mimeType: meta.mimeType, data: bytes.toString("base64")
    } };
  }
  try { assertNativeImageBytes(bytes, meta.mimeType); }
  catch { return refuse("evidence-inconsistent"); }
  // Only standard ACP content fields. Filenames and signed provenance remain in
  // the evidence, not fabricated protocol fields. No optional URI is fetched.
  return { sessionUpdate: "user_message_chunk", content: {
    type: "image", mimeType: meta.mimeType, data: bytes.toString("base64")
  } };
}
