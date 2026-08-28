import type { TurnEndReason } from "../session/sessionTypes.js";

/**
 * How an AMC turn ending becomes an ACP stop reason (plan P7.1a).
 *
 * ACP has five stop reasons and AMC has seven turn endings, so the mapping is
 * lossy in one direction and this file is where that loss is stated rather than
 * hidden inside a handler.
 *
 * `blocked` MAPS TO `end_turn`, NOT `refusal`. This is the one mapping that
 * would be actively wrong. In ACP, `refusal` means the model declined and the
 * prompt is DROPPED FROM FUTURE CONTEXT -- a client is entitled to prune the
 * exchange on seeing it. AMC's `blocked` means a governance hook vetoed the
 * turn: the prompt is in the log, it happened, and nothing about it should be
 * forgotten. Reporting a governance veto as a model refusal would tell the
 * client to discard evidence.
 *
 * WHAT A CLIENT CANNOT SEE. `blocked`, `error` and `interrupted` all arrive as
 * `end_turn`, so a user watching in an editor cannot tell "finished" from "a
 * hook stopped this" from the chrome alone. That is the protocol's gap, not a
 * detail to paper over by inventing a reason: the real ending travels in the
 * response's `_meta` and, authoritatively, in the signed `turn/end` row.
 */

export const ACP_STOP_REASONS = [
  "end_turn",
  "max_tokens",
  "max_turn_requests",
  "refusal",
  "cancelled"
] as const;

export type AcpStopReason = (typeof ACP_STOP_REASONS)[number];

/**
 * Every AMC ending, mapped explicitly.
 *
 * A total record rather than a switch with a default: adding a `TurnEndReason`
 * should fail to compile here, not silently acquire whatever the default was.
 */
const STOP_REASON_OF: Readonly<Record<TurnEndReason, AcpStopReason>> = {
  complete: "end_turn",
  cancelled: "cancelled",
  max_tokens: "max_tokens",
  // ACP counts REQUESTS to the model, which is what an AMC step is.
  max_steps: "max_turn_requests",
  // The three below are the lossy ones. See the module note.
  blocked: "end_turn",
  error: "end_turn",
  interrupted: "end_turn"
};

export function acpStopReasonFor(reason: TurnEndReason): AcpStopReason {
  return STOP_REASON_OF[reason];
}

/**
 * Whether a client would be told something the log does not say.
 *
 * Exposed so a handler can attach the true ending to `_meta` exactly when the
 * mapping lost information, rather than always or never.
 */
export function stopReasonIsLossy(reason: TurnEndReason): boolean {
  return reason === "blocked" || reason === "error" || reason === "interrupted";
}
