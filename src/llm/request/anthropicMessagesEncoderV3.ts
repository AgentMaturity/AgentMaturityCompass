import { ANTHROPIC_MESSAGES_ENCODER_ID, anthropicMessagesEncoderV2 } from "./anthropicMessagesEncoder.js";
import { encodeProviderToolNames } from "./providerToolNames.js";
import type { RequestEncoder } from "./requestEncoder.js";

/** Provider-safe names with the exact cache behavior of anthropic-messages@2. */
export const anthropicMessagesEncoderV3: RequestEncoder = {
  id: ANTHROPIC_MESSAGES_ENCODER_ID,
  version: 3,
  encode: request => anthropicMessagesEncoderV2.encode(encodeProviderToolNames(request, ANTHROPIC_MESSAGES_ENCODER_ID))
};
