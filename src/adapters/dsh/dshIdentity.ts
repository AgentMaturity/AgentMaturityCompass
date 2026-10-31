import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";

/** AMC's action id for one DSH tool call, from the session and call id (call ids repeat across sessions). */
export function dshActionId(sessionId: string, callId: string): string {
  return `dsh_${sha256Hex(canonicalize({ sessionId, callId })).slice(0, 40)}`;
}

/** The digest of a DSH session id a registration records; the raw id is not stored. */
export function dshSessionSha256(sessionId: string): string {
  return sha256Hex(`dsh\0${sessionId}`);
}
