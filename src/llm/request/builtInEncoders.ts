/**
 * The encoders this tree ships.
 *
 * A module of its own so no encoder has to import a sibling. The list used to
 * live beside the Anthropic encoder, which meant adding an OpenAI encoder would
 * have made the Anthropic module depend on it — a cycle in spirit if not yet in
 * fact, and the kind of coupling that quietly decides where the next encoder has
 * to live.
 *
 * Registration order does not matter: a registry keys on `(id, version)` and
 * refuses to replace an existing pair, so two encoders can never race for a
 * slot.
 */
import { anthropicMessagesEncoder, anthropicMessagesEncoderV2 } from "./anthropicMessagesEncoder.js";
import { openaiChatEncoder } from "./openaiChatEncoder.js";
import { openaiChatEncoderV2 } from "./openaiChatEncoderV2.js";
import { openaiChatEncoderV3 } from "./openaiChatEncoderV3.js";
import { openaiChatEncoderV4 } from "./openaiChatEncoderV4.js";
import { anthropicMessagesEncoderV3 } from "./anthropicMessagesEncoderV3.js";
import { anthropicMessagesEncoderV4 } from "./anthropicMessagesEncoderV4.js";
import { openaiResponsesEncoder } from "./openaiResponsesEncoder.js";
import { openaiResponsesEncoderV2 } from "./openaiResponsesEncoderV2.js";
import { openaiResponsesEncoderV3 } from "./openaiResponsesEncoderV3.js";
import { deepseekChatEncoder } from "./deepseekChatEncoder.js";
import { geminiContentEncoder } from "./geminiContentEncoder.js";
import { geminiContentEncoderV2 } from "./geminiContentEncoderV2.js";
import { ollamaChatEncoder } from "./ollamaChatEncoder.js";
import type { RequestEncoder } from "./requestEncoder.js";

export const BUILT_IN_REQUEST_ENCODERS: readonly RequestEncoder[] = [
  anthropicMessagesEncoder,
  anthropicMessagesEncoderV2,
  anthropicMessagesEncoderV3,
  anthropicMessagesEncoderV4,
  openaiChatEncoder,
  openaiChatEncoderV2,
  openaiChatEncoderV3,
  openaiChatEncoderV4,
  openaiResponsesEncoder,
  openaiResponsesEncoderV2,
  openaiResponsesEncoderV3,
  deepseekChatEncoder,
  geminiContentEncoder,
  geminiContentEncoderV2,
  ollamaChatEncoder
];
