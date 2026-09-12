import { assertNativeImageBytes, MAX_NATIVE_IMAGE_INPUT_BYTES, MAX_NATIVE_IMAGES } from "../../attachments/nativeImageInput.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { assertRequestCapabilities, OPENAI_CHAT_CAPABILITIES } from "../adapter/providerCapabilities.js";
import { OPENAI_CHAT_ENCODER_ID } from "./openaiChatEncoder.js";
import { openaiChatEncoderV3 } from "./openaiChatEncoderV3.js";
import type { RequestEncoder } from "./requestEncoder.js";
import { RequestEncodingError } from "./requestSpec.js";

/**
 * Native Chat Completions signed user images. Official Chat create schema read
 * 2026-09-10 (not inferred from the Responses API):
 * https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
 * messages[].content uses text and image_url parts; image_url.url is the data
 * URL and image_url.detail is fixed to auto by this encoder identity.
 * Only original committed bytes are encoded: no URL fetch, file ID, conversion,
 * remote state or model capability probe. Historical Chat v1/v2/v3 stay intact.
 */
export const openaiChatEncoderV4: RequestEncoder = {
  id: OPENAI_CHAT_ENCODER_ID,
  version: 4,
  encode(request): Buffer {
    // Validate all roles/modalities before filtering anything for v3. An image
    // in assistant/tool/system history must never acquire a user role.
    assertRequestCapabilities(OPENAI_CHAT_CAPABILITIES, request);
    const textRequest = { ...request, messages: request.messages.map(message => ({
      ...message, parts: message.parts.filter(part => part.kind !== "image")
    })) };
    // v3 remains the authority for params, tool aliases/choice, raw argument
    // strings, explicit null assistant content and keyed failed-result envelopes.
    const baseBytes = openaiChatEncoderV3.encode(textRequest);
    if (!request.messages.some(message => message.parts.some(part => part.kind === "image"))) return baseBytes;
    const body = JSON.parse(baseBytes.toString("utf8")) as Record<string, unknown>;
    const historical = body.messages as Record<string, unknown>[];
    let cursor = request.system === null ? 0 : 1;
    const messages = historical.slice(0, cursor);
    let imageCount = 0, imageBytes = 0;
    for (const message of request.messages) {
      // After capability admission, tool parts are exclusively keyed results.
      // v3 emits one message per result; other nonempty text/call messages emit
      // one. Empty user/assistant messages emit none. Keep those bytes/shapes.
      const hasText = message.parts.some(part => part.kind === "text" && part.text.length > 0);
      const width = message.role === "tool" ? message.parts.length
        : (hasText || message.parts.some(part => part.kind === "tool_use")) ? 1 : 0;
      if (!message.parts.some(part => part.kind === "image")) {
        messages.push(...historical.slice(cursor, cursor + width));
        cursor += width;
        continue;
      }
      const content: Record<string, unknown>[] = [];
      for (const part of message.parts) {
        if (part.kind === "text") { content.push({ type: "text", text: part.text }); continue; }
        if (message.role !== "user" || part.kind !== "image" || !Buffer.isBuffer(part.bytes)) {
          throw new RequestEncodingError("A Chat user image requires original signed payload bytes, not a digest, URL or file ID.");
        }
        try { assertNativeImageBytes(part.bytes, part.mediaType); }
        catch (error) { throw new RequestEncodingError(error instanceof Error ? error.message : "Invalid image payload."); }
        if (sha256Hex(part.bytes) !== part.sha256) throw new RequestEncodingError("Image bytes disagree with their committed SHA-256.");
        imageBytes += part.bytes.length;
        if (++imageCount > MAX_NATIVE_IMAGES || imageBytes > MAX_NATIVE_IMAGE_INPUT_BYTES) {
          throw new RequestEncodingError("Image history exceeds native request image count/byte limits; no truncation was performed.");
        }
        content.push({ type: "image_url", image_url: {
          url: `data:${part.mediaType};base64,${part.bytes.toString("base64")}`, detail: "auto"
        } });
      }
      // Image-only messages exist in v4 even though v3's text projection omitted
      // them. Do not invent an empty text part or consume the next history row.
      messages.push({ role: "user", content });
      cursor += width;
    }
    if (cursor !== historical.length) throw new RequestEncodingError("Chat image projection disagrees with historical message boundaries.");
    body.messages = messages;
    const bytes = Buffer.from(canonicalize(body), "utf8");
    if (bytes.length > 32 * 1024 * 1024) throw new RequestEncodingError("Native Chat image request exceeds the local request-body bound.");
    return bytes;
  }
};
