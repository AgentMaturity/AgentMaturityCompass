import { OPENAI_RESPONSES_ENCODER_ID, openaiResponsesEncoder } from "./openaiResponsesEncoder.js";
import { encodeProviderToolNames } from "./providerToolNames.js";
import type { RequestEncoder } from "./requestEncoder.js";

/** Provider-safe tool identities; historical openai-responses@1 is untouched. */
export const openaiResponsesEncoderV2: RequestEncoder = {
  id: OPENAI_RESPONSES_ENCODER_ID,
  version: 2,
  encode: request => openaiResponsesEncoder.encode(encodeProviderToolNames(request, OPENAI_RESPONSES_ENCODER_ID))
};
