import { OPENAI_CHAT_ENCODER_ID } from "./openaiChatEncoder.js";
import { openaiChatEncoderV2 } from "./openaiChatEncoderV2.js";
import { encodeProviderToolNames } from "./providerToolNames.js";
import type { RequestEncoder } from "./requestEncoder.js";

/** Provider-safe tool identities; openai-chat@1 and @2 bytes remain unchanged. */
export const openaiChatEncoderV3: RequestEncoder = {
  id: OPENAI_CHAT_ENCODER_ID,
  version: 3,
  encode: request => openaiChatEncoderV2.encode(encodeProviderToolNames(request, OPENAI_CHAT_ENCODER_ID))
};
