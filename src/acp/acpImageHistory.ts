import { assertNativeImageBytes } from "../attachments/nativeImageInput.js";
import { assertNativeAudioBytes, NATIVE_AUDIO_INPUT_FORMAT } from "../attachments/nativeAudioInput.js";
import { readEventPayload } from "../session/eventPayload.js";
import { extractEnvelope } from "../session/sessionTypes.js";
import type { EvidenceEvent } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { ACP_ERROR, AcpFailure } from "./acpErrors.js";
import type { AcpSessionUpdate } from "./acpProjection.js";

/** The caller authenticates the entire committed tail BEFORE any replay is sent.
 * This checks the signed attachment's meaning and resolves original binary bytes;
 * it neither re-ingests content under a new policy nor treats a digest as bytes.
 */
export function projectAcpAttachment(workspace: string, event: EvidenceEvent): AcpSessionUpdate {
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
  if (!Number.isSafeInteger(meta.bytes) || meta.bytes !== payload.bytes.length) return refuse("evidence-inconsistent");
  if (surface.part.kind === "text") {
    const text = payload.bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(payload.bytes)) return refuse("evidence-inconsistent");
    return { sessionUpdate: "user_message_chunk", content: { type: "text", text } };
  }
  if (surface.part.kind === "audio") {
    if (meta.sourceInputFormat !== NATIVE_AUDIO_INPUT_FORMAT) return refuse("evidence-inconsistent");
    try { assertNativeAudioBytes(payload.bytes, meta.mimeType); }
    catch { return refuse("evidence-inconsistent"); }
    return { sessionUpdate: "user_message_chunk", content: {
      type: "audio", mimeType: meta.mimeType, data: payload.bytes.toString("base64")
    } };
  }
  try { assertNativeImageBytes(payload.bytes, meta.mimeType); }
  catch { return refuse("evidence-inconsistent"); }
  // Only standard ACP content fields. Filenames and signed provenance remain in
  // the evidence, not fabricated protocol fields. No optional URI is fetched.
  return { sessionUpdate: "user_message_chunk", content: {
    type: "image", mimeType: meta.mimeType, data: payload.bytes.toString("base64")
  } };
}
