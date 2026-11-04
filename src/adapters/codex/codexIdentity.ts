import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";

/** AMC's id for one Codex tool call it observed, from Codex's session and tool_use_id. */
export function codexActionId(sessionId: string, toolUseId: string): string {
  return `codex_${sha256Hex(canonicalize({ sessionId, toolUseId })).slice(0, 40)}`;
}

/** The digest of a Codex session id an observation records; the raw id is not stored. */
export function codexSessionSha256(sessionId: string): string {
  return sha256Hex(`codex\0${sessionId}`);
}
