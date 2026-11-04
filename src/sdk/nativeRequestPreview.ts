import { type AcpPromptBlock } from "../acp/acpPromptInput.js";
import { assertNativeImageBytes, imageTypeForFilename, MAX_NATIVE_IMAGE_INPUT_BYTES, MAX_NATIVE_IMAGES,
  type NativeImageInput } from "../attachments/nativeImageInput.js";
import { validClientRequestId } from "../session/loopEventMeta.js";
import { MAX_WIRE_LINE_BYTES } from "../wire/ndjsonFraming.js";
import { AMCNativeInputError, AMCNativeProtocolError } from "./nativeAgentErrors.js";
import { freezeJson, object } from "./nativeWire.js";

/** Local text/image prompt input. No workspace or running client is required. @experimental */
export interface AMCNativePromptPreviewInput {
  readonly sessionId: string;
  readonly text: string;
  readonly images?: readonly NativeImageInput[];
  readonly clientRequestId?: string;
}

/** Request data only, never a turn, provider output, evidence or an admission verdict. @experimental */
export interface AMCNativePromptPreview {
  readonly state: "preview";
  readonly dispatched: false;
  /** This local operation performs no provider request; no token/cost estimate is inferred. */
  readonly spend: "none";
  readonly admission: "not-evaluated";
  readonly request: {
    readonly method: "session/prompt";
    readonly params: {
      readonly sessionId: string;
      readonly prompt: readonly AcpPromptBlock[];
      readonly _meta?: { readonly "dev.agentmaturity.amc": { readonly clientRequestId: string } };
    };
  };
}

/**
 * Preview a native ACP prompt without spawning, claiming a writer, recording evidence or dispatching.
 * Snapshots original image bytes. Capability, ownership, attachment threat and budget admission still run on actual
 * submission; this is not a compiled provider request or a promise that a runtime will accept it.
 * @experimental
 */
export function previewNativePrompt(input: AMCNativePromptPreviewInput): AMCNativePromptPreview {
  if (!object(input)) throw new AMCNativeInputError("Preview input must be an object");
  const { sessionId, text, clientRequestId } = input;
  if (typeof sessionId !== "string" || !sessionId.trim() || sessionId.includes("\0")
      || Buffer.from(sessionId, "utf8").toString("utf8") !== sessionId) {
    throw new AMCNativeInputError("Preview requires an explicit lossless session identity");
  }
  if (typeof text !== "string" || Buffer.from(text, "utf8").toString("utf8") !== text) {
    throw new AMCNativeInputError("Prompt text must be a losslessly representable UTF-8 string");
  }
  if (clientRequestId !== undefined && !validClientRequestId(clientRequestId)) {
    throw new AMCNativeInputError("clientRequestId must be 1 through 128 visible ASCII characters");
  }
  const images = input.images === undefined ? [] : input.images;
  if (!Array.isArray(images) || images.length > MAX_NATIVE_IMAGES) throw new AMCNativeInputError(`At most ${MAX_NATIVE_IMAGES} native images may be previewed`);
  let imageBytes = 0;
  // The dispatch snapshot's attachment detonation emits guard evidence. Preview uses its pure checks only.
  const prompt: AcpPromptBlock[] = [{ type: "text", text }, ...Array.from(images).map(image => {
    if (!image || typeof image.filename !== "string" || !image.filename || image.filename.length > 255
        || /[\\/\u0000-\u001f\u007f]/.test(image.filename) || imageTypeForFilename(image.filename) !== image.mediaType) {
      throw new AMCNativeInputError("An image requires a bounded plain filename matching its media type");
    }
    assertNativeImageBytes(image.bytes, image.mediaType);
    imageBytes += image.bytes.length;
    if (imageBytes > MAX_NATIVE_IMAGE_INPUT_BYTES) throw new AMCNativeInputError("Native image input exceeds the aggregate byte limit");
    return { type: "image", mimeType: image.mediaType, data: image.bytes.toString("base64") };
  })];
  if (!text.trim() && !images.length) throw new AMCNativeInputError("A prompt must contain text or a supported image");
  const request = { method: "session/prompt" as const, params: { sessionId, prompt,
    ...(clientRequestId === undefined ? {} : { _meta: { "dev.agentmaturity.amc": { clientRequestId } } }) } };
  // Reserve the largest safe request ID: the live client allocates its own correlation ID at dispatch.
  if (Buffer.byteLength(JSON.stringify({ jsonrpc: "2.0", id: Number.MAX_SAFE_INTEGER, ...request })) > MAX_WIRE_LINE_BYTES) {
    throw new AMCNativeProtocolError("native request exceeds the ACP ingress frame limit (256 KiB including JSON/base64 overhead)");
  }
  return freezeJson<AMCNativePromptPreview>({ state: "preview", dispatched: false, spend: "none", admission: "not-evaluated", request });
}
