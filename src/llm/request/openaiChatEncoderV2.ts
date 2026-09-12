import { assertRequestCapabilities, OPENAI_CHAT_TEXT_CAPABILITIES } from "../adapter/providerCapabilities.js";
import { OPENAI_CHAT_ENCODER_ID, openaiChatEncoder } from "./openaiChatEncoder.js";
import type { RequestEncoder } from "./requestEncoder.js";
import { toolResultTextEnvelope } from "./toolResultTextEnvelope.js";

/** Explicit result-state text in new requests; historical openai-chat@1 is untouched. */
export const openaiChatEncoderV2: RequestEncoder = {
  id: OPENAI_CHAT_ENCODER_ID,
  version: 2,
  encode(request): Buffer {
    assertRequestCapabilities(OPENAI_CHAT_TEXT_CAPABILITIES, request);
    return openaiChatEncoder.encode({ ...request, messages: request.messages.map(message => ({ ...message,
      parts: message.parts.map(part => part.kind === "tool_result" ? { ...part, text: toolResultTextEnvelope(part) } : part)
    })) });
  }
};
