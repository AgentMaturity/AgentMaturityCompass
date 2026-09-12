import { assertNativeImageBytes, MAX_NATIVE_IMAGE_INPUT_BYTES, MAX_NATIVE_IMAGES } from "../../attachments/nativeImageInput.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { assertRequestCapabilities, OPENAI_RESPONSES_CAPABILITIES } from "../adapter/providerCapabilities.js";
import { OPENAI_RESPONSES_ENCODER_ID, openaiResponsesEncoder } from "./openaiResponsesEncoder.js";
import { encodeProviderToolNames } from "./providerToolNames.js";
import { RequestEncodingError } from "./requestSpec.js";
import type { RequestEncoder } from "./requestEncoder.js";

/**
 * Native Responses signed user images. Official Images and vision wire examples
 * retrieved 2026-09-10: https://developers.openai.com/api/docs/guides/images-vision
 * Generated official OpenAPI image schema read on that date:
 * https://github.com/openai/openai-python/blob/main/src/openai/types/responses/response_input_image_param.py
 * input_image.image_url is a data URL made from the ORIGINAL committed bytes;
 * detail:auto is fixed by this encoder identity, not unsigned process state.
 * No URL fetch, Files API, image conversion, remote state or model-support probe.
 * v1/v2 retain their exact text/function algorithms and image refusal.
 */
export const openaiResponsesEncoderV3: RequestEncoder = {
  id: OPENAI_RESPONSES_ENCODER_ID,
  version: 3,
  encode(request) {
    // Validate the FULL input before removing images for the historical encoder.
    // In particular, assistant/tool/system images must not gain a user role.
    assertRequestCapabilities(OPENAI_RESPONSES_CAPABILITIES, request);
    const mapped = encodeProviderToolNames(request, OPENAI_RESPONSES_ENCODER_ID);
    const textRequest = { ...mapped, messages: mapped.messages.map(message => ({
      ...message, parts: message.parts.filter(part => part.kind !== "image")
    })) };
    // Keep the established parameter/schema/tool-choice/call-result validation,
    // including raw argument strings and the keyed failed-result text envelope.
    const baseBytes = openaiResponsesEncoder.encode(textRequest);
    if (!mapped.messages.some(message => message.parts.some(part => part.kind === "image"))) return baseBytes;
    const body = JSON.parse(baseBytes.toString("utf8")) as Record<string, unknown>;
    const historicalInput = body.input as Record<string, unknown>[];
    const input: Record<string, unknown>[] = [];
    let cursor = 0, imageCount = 0, imageBytes = 0;
    for (const message of mapped.messages) {
      if (!message.parts.some(part => part.kind === "image")) {
        for (const _part of message.parts) input.push(historicalInput[cursor++]!);
        continue;
      }
      const content: Record<string, unknown>[] = [];
      for (const part of message.parts) {
        if (part.kind === "text") {
          content.push({ type: "input_text", text: historicalInput[cursor++]!.content });
          continue;
        }
        if (part.kind !== "image" || message.role !== "user" || !Buffer.isBuffer(part.bytes)) {
          throw new RequestEncodingError("A Responses user image requires original signed payload bytes, not a digest, URL or file ID.");
        }
        try { assertNativeImageBytes(part.bytes, part.mediaType); }
        catch (error) { throw new RequestEncodingError(error instanceof Error ? error.message : "Invalid image payload."); }
        if (sha256Hex(part.bytes) !== part.sha256) throw new RequestEncodingError("Image bytes disagree with their committed SHA-256.");
        imageBytes += part.bytes.length;
        if (++imageCount > MAX_NATIVE_IMAGES || imageBytes > MAX_NATIVE_IMAGE_INPUT_BYTES) {
          throw new RequestEncodingError("Image history exceeds native request image count/byte limits; no truncation was performed.");
        }
        content.push({ type: "input_image", image_url: `data:${part.mediaType};base64,${part.bytes.toString("base64")}`, detail: "auto" });
      }
      input.push({ role: "user", content });
    }
    body.input = input;
    const bytes = Buffer.from(canonicalize(body), "utf8");
    if (bytes.length > 32 * 1024 * 1024) throw new RequestEncodingError("Native Responses image request exceeds the local request-body bound.");
    return bytes;
  }
};
