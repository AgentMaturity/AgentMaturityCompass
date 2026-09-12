/** ACP v1 / vendored SDK0.18.0; official content/initialization docs read2026-09-10.
 * Wire images contain data + mimeType, not filenames, local paths or digests.
 * Optional uri is a source annotation, NEVER a fetch instruction.
 */
import { materializeNativeImages, snapshotNativeImages, NativeImageInputError,
  type NativeImageInput, type NativeImageMediaType, type QueuedNativeImage } from "../attachments/nativeImageInput.js";
import type { PinnedRoute } from "../llm/adapter/adapterRegistry.js";
import { ANTHROPIC_MESSAGES_ENCODER_ID } from "../llm/request/anthropicMessagesEncoder.js";
import { OPENAI_RESPONSES_ENCODER_ID } from "../llm/request/openaiResponsesEncoder.js";
import { OPENAI_CHAT_ENCODER_ID } from "../llm/request/openaiChatEncoder.js";
import { GEMINI_CONTENT_ID } from "../llm/providers/geminiContract.js";
import { ACP_ERROR, AcpFailure } from "./acpErrors.js";
import { materializeNativeInputParts, snapshotNativeInputParts, type NativeInputPart } from "../attachments/nativeOrderedInput.js";

export type AcpPromptRoute = Pick<PinnedRoute, "capabilities" | "encoderId" | "encoderVersion">;
export interface AcpPromptBlock {
  readonly type: string;
  readonly text?: string;
  readonly uri?: string | null;
  readonly data?: string;
  readonly mimeType?: string;
}
const EXTENSIONS: Readonly<Record<NativeImageMediaType, string>> = {
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp"
};

/** Capture once at launch: historical encoders and other protocols stay false.
 * This describes native wire support, NOT a remotely probed model capability.
 */
export function acpSupportsImageInput(route?: AcpPromptRoute): boolean {
  if (route?.capabilities?.features["image-input"] !== "supported") return false;
  return (route.encoderId === ANTHROPIC_MESSAGES_ENCODER_ID && route.encoderVersion === 4
      && route.capabilities.protocol === "anthropic-messages")
    || (route.encoderId === OPENAI_RESPONSES_ENCODER_ID && route.encoderVersion === 3
      && route.capabilities.protocol === "openai-responses")
    || (route.encoderId === OPENAI_CHAT_ENCODER_ID && route.encoderVersion === 4
      && route.capabilities.protocol === "openai-chat-completions")
    || (route.encoderId === GEMINI_CONTENT_ID && (route.encoderVersion === 1 || route.encoderVersion === 2)
      && route.capabilities.protocol === "gemini-generate-content");
}

/** Gemini's documented MIME intersection is narrower than the native codec.
 * Refuse before an ACP turn/inbox is admitted; never silently convert GIF.
 */
export function assertAcpRouteContent(route: AcpPromptRoute | undefined, blocks: readonly AcpPromptBlock[]): void {
  if (route?.encoderId === GEMINI_CONTENT_ID && (route.encoderVersion === 1 || route.encoderVersion === 2)
      && blocks.some(block => block.type === "image" && !["image/png", "image/jpeg", "image/webp"].includes(block.mimeType ?? ""))) {
    throw new AcpFailure(ACP_ERROR.invalidParams, "Gemini native image input supports original PNG, JPEG and WebP only. No image conversion or fallback was performed.");
  }
}

/** Strict base64/MIME/header/size admission reuses the native durable-input seam. */
export function materializeAcpImages(blocks: readonly AcpPromptBlock[]): readonly NativeImageInput[] {
  const queued: QueuedNativeImage[] = blocks.map((block, index) => {
    if (block.type !== "image" || typeof block.mimeType !== "string"
      || !Object.hasOwn(EXTENSIONS, block.mimeType) || typeof block.data !== "string") {
      throw new NativeImageInputError("ACP image requires supported mimeType and original base64 data; URI-only images are not fetched.");
    }
    const mediaType = block.mimeType as NativeImageMediaType;
    return { filename: `acp-image-${index + 1}.${EXTENSIONS[mediaType]}`, mediaType, data: block.data };
  });
  return materializeNativeImages(queued);
}

/** Snapshot BEFORE handing work to the asynchronous subprocess/queue. */
export function nativeImagesToAcp(images: readonly NativeImageInput[] = []): readonly AcpPromptBlock[] {
  return snapshotNativeImages(images).map(image => Object.freeze({
    type: "image", mimeType: image.mediaType, data: image.data
  }));
}

/** Original sequence on the standard ACP wire; the caller negotiates v2 separately. */
export function nativePartsToAcp(parts: readonly NativeInputPart[]): readonly AcpPromptBlock[] {
  return Object.freeze(snapshotNativeInputParts(parts).map(part => Object.freeze(part.type === "text"
    ? { type: "text", text: part.text }
    : { type: "image", mimeType: part.image.mediaType, data: part.image.data })));
}

/** A standard ACP image followed by text cannot use the legacy prefix/images path. */
export function requiresOrderedPrompt(blocks: readonly AcpPromptBlock[]): boolean {
  let image = false;
  for (const block of blocks) {
    if (block.type === "image") image = true;
    else if (image && (block.type === "text" || block.type === "resource_link")) return true;
  }
  return false;
}

export function orderedPrompt(blocks: readonly AcpPromptBlock[], imageSupported: boolean): readonly NativeInputPart[] {
  if (!imageSupported) throw new AcpFailure(ACP_ERROR.invalidParams, "Ordered image input is unsupported by the selected native protocol. No fallback was used.");
  try {
    const images = materializeAcpImages(blocks.filter(block => block.type === "image"));
    let imageIndex = 0;
    const parts: NativeInputPart[] = blocks.map(block => {
      if (block.type === "text" && typeof block.text === "string") return { type: "text", text: block.text };
      if (block.type === "resource_link" && typeof block.uri === "string") return { type: "text", text: `[linked resource: ${block.uri}]` };
      if (block.type === "image") return { type: "image", image: images[imageIndex++]! };
      throw new NativeImageInputError("Unsupported prompt content; audio, embedded resources and unknown blocks cannot be discarded.");
    });
    return materializeNativeInputParts(snapshotNativeInputParts(parts));
  } catch (error) {
    if (error instanceof NativeImageInputError) throw new AcpFailure(ACP_ERROR.invalidParams, error.message);
    throw error;
  }
}

/** No unsupported block may be lost, even when accompanied by valid text. */
export function flattenPrompt(blocks: readonly AcpPromptBlock[], imageSupported: boolean): {
  readonly text: string; readonly images: readonly NativeImageInput[];
} {
  const text: string[] = [], images: AcpPromptBlock[] = [];
  for (const block of blocks) {
    if (images.length && (block.type === "text" || block.type === "resource_link")) {
      throw new AcpFailure(ACP_ERROR.invalidParams,
        "The native input contract requires text/resource references before images; this interleaved prompt cannot be represented without reordering. Submit that supported order explicitly.");
    }
    if (block.type === "text" && typeof block.text === "string") text.push(block.text);
    else if (block.type === "resource_link" && typeof block.uri === "string") text.push(`[linked resource: ${block.uri}]`);
    else if (block.type === "image") {
      if (!imageSupported) throw new AcpFailure(ACP_ERROR.invalidParams,
        "Image input is unsupported by the selected native protocol; choose Anthropic Messages v4, OpenAI Responses v3 or OpenAI Chat v4, or remove the image. No fallback was used.");
      images.push(block);
    } else throw new AcpFailure(ACP_ERROR.invalidParams,
      "Unsupported prompt content block; audio, embedded resources and unknown blocks are not implemented and cannot be silently discarded.");
  }
  try {
    const result = { text: text.join("\n").trim(), images: materializeAcpImages(images) };
    if (!result.text && !result.images.length) throw new NativeImageInputError("A prompt must contain text or a supported image.");
    return result;
  } catch (error) {
    if (error instanceof NativeImageInputError) throw new AcpFailure(ACP_ERROR.invalidParams, error.message);
    throw error;
  }
}
