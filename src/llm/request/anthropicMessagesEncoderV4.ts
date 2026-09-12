import { assertNativeImageBytes, MAX_NATIVE_IMAGE_INPUT_BYTES, MAX_NATIVE_IMAGES } from "../../attachments/nativeImageInput.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { ANTHROPIC_MESSAGES_ENCODER_ID, anthropicMessagesEncoderV2, encodePart } from "./anthropicMessagesEncoder.js";
import { encodeProviderToolNames } from "./providerToolNames.js";
import { RequestEncodingError } from "./requestSpec.js";
import type { RequestEncoder } from "./requestEncoder.js";

/**
 * Native signed user images, inline base64, with v3 tool identity/cache behavior.
 * Official wire reference retrieved 2026-09-10:
 * https://platform.claude.com/docs/en/build-with-claude/vision
 * No URL fetch, Files API dependency, resizing, invented MIME, or model probe.
 * Versions 1/2/3 remain registered and keep refusing images.
 */
export const anthropicMessagesEncoderV4: RequestEncoder = {
  id: ANTHROPIC_MESSAGES_ENCODER_ID,
  version: 4,
  encode(request) {
    if (request.messages.some(message => message.parts.some(part => part.kind === "audio"))) throw new RequestEncodingError("Anthropic image v4 does not support native audio; no content was discarded.");
    const mapped = encodeProviderToolNames(request, ANTHROPIC_MESSAGES_ENCODER_ID);
    // Reuse the frozen v2 parameter/system/schema validation, not a weaker copy.
    const body = JSON.parse(anthropicMessagesEncoderV2.encode({ ...mapped, messages: [] }).toString("utf8")) as Record<string, unknown>;
    const messages: { role: "user" | "assistant"; content: unknown[] }[] = [];
    let imageCount = 0, imageBytes = 0;
    for (const message of mapped.messages) {
      if (message.role === "system") {
        if (message.parts.some(part => part.kind === "image")) throw new RequestEncodingError("Image input requires the user role.");
        continue;
      }
      if (!["user", "assistant", "tool"].includes(message.role)) throw new RequestEncodingError("Unsupported image-wire history role.");
      const content: unknown[] = [];
      for (const part of message.parts) {
        if (part.kind === "thinking") throw new RequestEncodingError("Anthropic thinking replay requires a provider signature; unsigned replay is unsupported.");
        if (part.kind !== "image") {
          const block = encodePart(part);
          if (block !== null) content.push(block);
          continue;
        }
        if (message.role !== "user" || !Buffer.isBuffer(part.bytes)) throw new RequestEncodingError("A user image requires original signed payload bytes, not a digest or URL.");
        try { assertNativeImageBytes(part.bytes, part.mediaType); }
        catch (error) { throw new RequestEncodingError(error instanceof Error ? error.message : "Invalid image payload."); }
        if (sha256Hex(part.bytes) !== part.sha256) throw new RequestEncodingError("Image bytes disagree with their committed SHA-256.");
        imageBytes += part.bytes.length;
        if (++imageCount > MAX_NATIVE_IMAGES || imageBytes > MAX_NATIVE_IMAGE_INPUT_BYTES) throw new RequestEncodingError("Image history exceeds native request image count/byte limits; no truncation was performed.");
        content.push({ type: "image", source: { type: "base64", media_type: part.mediaType, data: part.bytes.toString("base64") } });
      }
      if (content.length === 0) continue;
      const role = message.role === "assistant" ? "assistant" : "user";
      const previous = messages[messages.length - 1];
      if (previous?.role === role) previous.content.push(...content);
      else messages.push({ role, content });
    }
    const last = messages[messages.length - 1];
    if (last && last.content.length > 0) {
      const index = last.content.length - 1;
      last.content[index] = { ...(last.content[index] as Record<string, unknown>), cache_control: { type: "ephemeral" } };
    }
    body.messages = messages;
    const bytes = Buffer.from(canonicalize(body), "utf8");
    if (bytes.length > 32 * 1024 * 1024) throw new RequestEncodingError("Native Anthropic request exceeds the standard request-body bound.");
    return bytes;
  }
};
