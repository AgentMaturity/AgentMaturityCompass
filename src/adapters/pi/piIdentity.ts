import { sha256Hex } from "../../utils/hash.js";

/**
 * AMC's action id for one Pi call. The control route derives it from Pi's session id and call id; the extension
 * derives the same id to check that an answer is for its call. Pi call ids can repeat across sessions, and nested
 * ones (`<parent>/<n>`) contain "/", so both are hashed.
 */
export function piActionId(sessionId: string, toolCallId: string): string {
  return `pi.${sha256Hex(`${sessionId}\0${toolCallId}`).slice(0, 40)}`;
}

/** The digest of a Pi session id a session registration records; the raw id is not stored. */
export function piSessionSha256(sessionId: string): string {
  return sha256Hex(`pi\0${sessionId}`);
}
