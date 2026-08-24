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
import { anthropicMessagesEncoder } from "./anthropicMessagesEncoder.js";
import { openaiChatEncoder } from "./openaiChatEncoder.js";
import type { RequestEncoder } from "./requestEncoder.js";

export const BUILT_IN_REQUEST_ENCODERS: readonly RequestEncoder[] = [
  anthropicMessagesEncoder,
  openaiChatEncoder
];
