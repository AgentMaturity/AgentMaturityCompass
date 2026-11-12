import { OPENAI_CHAT_ENCODER_ID } from "./openaiChatEncoder.js";
import { openaiChatEncoderV4 } from "./openaiChatEncoderV4.js";
import type { RequestEncoder } from "./requestEncoder.js";
import type { EncodableMessage } from "./requestSpec.js";

/** The separator between a text-only user message's text parts in new Chat-style requests. */
const USER_TEXT_PART_SEPARATOR = "\n\n";

/**
 * Collapse a text-only user message's nonempty text parts into one, joined by a blank line. A user turn carries the
 * prompt and the runtime-context snapshot as separate parts; v1–v5 concatenated them with no separator. A plain string
 * (not a content-part array) is kept because several OpenAI-compatible servers accept only string user content.
 * Image messages already encode each part as its own content element and are left untouched.
 */
function separateUserTextParts(message: EncodableMessage): EncodableMessage {
  if (message.role !== "user" || message.parts.some(part => part.kind !== "text")) return message;
  const texts = message.parts.filter(part => part.kind === "text" && part.text.length > 0);
  if (texts.length < 2) return message;
  return { ...message, parts: [{ kind: "text", text: texts.map(part => part.kind === "text" ? part.text : "").join(USER_TEXT_PART_SEPARATOR) }] };
}

/** openai-chat@6: v4 bytes, except a user message's text parts are separated. openai-chat@1..@5 bytes are unchanged. */
export const openaiChatEncoderV6: RequestEncoder = {
  id: OPENAI_CHAT_ENCODER_ID,
  version: 6,
  encode: request => openaiChatEncoderV4.encode({ ...request, messages: request.messages.map(separateUserTextParts) })
};
