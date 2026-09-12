import { assertNativeAudioBytes, materializeNativeAudioParts, snapshotNativeAudioParts, NATIVE_AUDIO_INPUT_FORMAT,
  MAX_NATIVE_AUDIO_BYTES, NativeAudioInputError, type NativeAudioInput, type NativeAudioPart } from "../attachments/nativeAudioInput.js";
import { NativeImageInputError } from "../attachments/nativeImageInput.js";
import { acpSupportsImageInput, assertAcpRouteContent, materializeAcpImages, type AcpPromptBlock, type AcpPromptRoute } from "./acpPromptInput.js";
import { ACP_ERROR, AcpFailure } from "./acpErrors.js";

export const ACP_NATIVE_AUDIO_CONTRACT = Object.freeze({ format: NATIVE_AUDIO_INPUT_FORMAT,
  encoderId: "gemini-generate-content", encoderVersion: 2, mimeTypes: Object.freeze(["audio/wav"]) });
export function acpSupportsAudioInput(route?: AcpPromptRoute): boolean {
  return route?.encoderId === "gemini-generate-content" && route.encoderVersion === 2
    && route.capabilities?.protocol === "gemini-generate-content" && route.capabilities.features["audio-input"] === "supported";
}
/** Standard ACP AudioContent fields only. The optional uri is never followed. */
export function materializeAcpAudio(block: AcpPromptBlock, index = 0): NativeAudioInput {
  if (Object.keys(block).some(key => !["type", "mimeType", "data"].includes(key))
      || block.type !== "audio" || block.mimeType !== "audio/wav" || typeof block.data !== "string"
      || !block.data || block.data.length > 4 * Math.ceil(MAX_NATIVE_AUDIO_BYTES / 3)
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(block.data)) {
    throw new NativeAudioInputError("ACP audio requires original bounded canonical audio/wav base64, never a URI-only or uploaded resource.");
  }
  const bytes = Buffer.from(block.data, "base64");
  if (bytes.toString("base64") !== block.data) throw new NativeAudioInputError("ACP audio data is not canonical base64.");
  assertNativeAudioBytes(bytes, block.mimeType);
  return { filename: `acp-audio-${index + 1}.wav`, mediaType: block.mimeType, bytes };
}
export function nativeAudioPartsToAcp(parts: readonly NativeAudioPart[]): readonly AcpPromptBlock[] {
  return Object.freeze(snapshotNativeAudioParts(parts).map(part => Object.freeze(part.type === "text"
    ? { type: "text", text: part.text }
    : part.type === "image" ? { type: "image", mimeType: part.image.mediaType, data: part.image.data }
      : { type: "audio", mimeType: part.audio.mediaType, data: part.audio.data })));
}
export function audioPrompt(blocks: readonly AcpPromptBlock[], route?: AcpPromptRoute): readonly NativeAudioPart[] {
  if (!acpSupportsAudioInput(route)) throw new AcpFailure(ACP_ERROR.invalidParams, "Audio requires the explicit native gemini-generate-content@2 route; no fallback was used.");
  try {
    if (!Array.isArray(blocks) || blocks.length < 1 || blocks.length > 256) throw new NativeAudioInputError("Audio input requires one through 256 parts.");
    assertAcpRouteContent(route, blocks);
    if (blocks.some(block => block.type === "image") && !acpSupportsImageInput(route)) throw new NativeAudioInputError("This route does not support the original images accompanying audio.");
    const images = materializeAcpImages(blocks.filter(block => block.type === "image"));
    let imageIndex = 0, audioIndex = 0;
    const parts: NativeAudioPart[] = blocks.map(block => {
      const allowed = block.type === "text" ? ["type", "text", "annotations", "_meta"]
        : ["type", "data", "mimeType", "uri", "annotations", "_meta"];
      if (Object.keys(block).some(key => !allowed.includes(key))) throw new NativeAudioInputError("Unsupported audio prompt fields cannot be silently discarded.");
      // Content annotations are not media. Nonempty annotations/meta require their
      // own signed semantics rather than being silently discarded by this codec.
      const raw = block as unknown as Record<string, unknown>;
      if (raw.annotations !== undefined || raw._meta !== undefined) throw new NativeAudioInputError("Annotated audio prompt parts require a separately supported provenance contract.");
      if (block.uri !== undefined && block.uri !== null) throw new NativeAudioInputError("Audio-bearing inputs do not accept URI annotations or remote references.");
      if (block.type === "text" && typeof block.text === "string") return { type: "text", text: block.text };
      if (block.type === "image") return { type: "image", image: images[imageIndex++]! };
      if (block.type === "audio") return { type: "audio", audio: materializeAcpAudio(block, audioIndex++) };
      throw new NativeAudioInputError("Audio sequences support original text/image/audio only; files, links, video and embedded content are refused whole.");
    });
    return materializeNativeAudioParts(snapshotNativeAudioParts(parts));
  } catch (error) {
    if (error instanceof NativeAudioInputError || error instanceof NativeImageInputError) throw new AcpFailure(ACP_ERROR.invalidParams, error.message);
    throw error;
  }
}

/** Exact advertised version and MIME, not an optimistic boolean-only inference. */
export function advertisesNativeAudio(capabilities: unknown): boolean {
  if (!capabilities || typeof capabilities !== "object") return false;
  const value = capabilities as { promptCapabilities?: { audio?: unknown }; _meta?: Record<string, unknown> };
  const extension = value._meta?.["dev.agentmaturity.amc"] as { audioInput?: Record<string, unknown> } | undefined;
  const contract = extension?.audioInput;
  return value.promptCapabilities?.audio === true && contract?.format === NATIVE_AUDIO_INPUT_FORMAT
    && contract.encoderId === "gemini-generate-content" && contract.encoderVersion === 2
    && Array.isArray(contract.mimeTypes) && contract.mimeTypes.length === 1 && contract.mimeTypes[0] === "audio/wav";
}
