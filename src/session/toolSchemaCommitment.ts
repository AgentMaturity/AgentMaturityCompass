/**
 * The rule that gives `toolSchemaSha256` a durable referent (plan P3.1).
 *
 * THE DEFECT THIS CLOSES. `request/header` has always carried a
 * `toolSchemaSha256` field. Nothing in the spine ever stored the bytes it named
 * — there was no tool-schema event, and the only values ever written were
 * `sha256Hex("tool-schema")` placeholders in two test files. A digest with no
 * durable referent is a commitment to nothing: it cannot be checked, it cannot
 * be re-derived, and a request carrying tools could not be rebuilt from the log
 * at all. So the field looked like evidence while proving nothing.
 *
 * THE FIX. The exact tool-schema bytes are now the payload of a `request/tools`
 * event, and a header may only name a `request/tools` row that exists IN THIS
 * SESSION and whose `payload_sha256` is the digest being committed. That last
 * clause is what this module enforces, and it runs before the header row is
 * appended — so the spine cannot contain a header whose tool-schema commitment
 * is unbacked, rather than merely being unlikely to.
 *
 * WHY A CONTENT EVENT AND NOT A BLOB REF IN META. The alternative was a
 * side-file with its ref in the header meta, mirroring spill. Three reasons it
 * lost. (1) These bytes are MODEL-VISIBLE — the model is shown every tool
 * definition — and this repository's invariant is that model-visible bytes are
 * the payload of a signed row, not of a file the ledger does not know about.
 * (2) A `request/tools` payload is blob-backed like all session content, so
 * retention can delete it; a spill file is session-scoped and outside
 * retention's reach, which would make tool definitions the one class of
 * conversation content a deletion request could not remove. (3) The existing
 * verifier already checks `payload_sha256` against blob content for every row,
 * so the commitment is checked by machinery that is already running.
 *
 * The `request/tools` event's surface op is `none`, deliberately. The tool
 * schema belongs to the REQUEST envelope, not to the conversation: appending it
 * to the surface would make it a history part that the request encoder would
 * then emit a second time, once as history and once as `tools`.
 */
import type { EvidenceEvent } from "../types.js";

/**
 * A reference to the `request/tools` row a header commits to.
 *
 * Field names match `SessionEventRef`'s on purpose, so the ref
 * `recordToolSchema` returns is assignable here with no re-shaping — a caller
 * hand-building this object is doing something unusual, and the check below is
 * what meets them.
 */
export interface ToolSchemaRef {
  readonly eventId: string;
  readonly payloadSha256: string;
}

export const TOOL_SCHEMA_EVENT_TYPE = "request/tools";

/**
 * Reject a tool-schema commitment that no logged row backs.
 *
 * Throws rather than returning a verdict: this runs on the write path, where the
 * only correct outcome for an unbacked commitment is that the header is never
 * written. Each failure names which of the three conditions broke, because
 * "unbacked" is not actionable and "names an event that is not in this session"
 * is.
 */
export function assertToolSchemaCommitted(
  events: readonly EvidenceEvent[],
  ref: ToolSchemaRef,
  sessionId: string
): void {
  const row = events.find((event) => event.id === ref.eventId);
  if (row === undefined) {
    throw new Error(
      `request/header names tool schema event ${ref.eventId}, which is not an event of session ${sessionId}`
    );
  }
  if (row.event_type !== TOOL_SCHEMA_EVENT_TYPE) {
    throw new Error(
      `request/header names tool schema event ${ref.eventId}, which is a ${row.event_type} row, not ${TOOL_SCHEMA_EVENT_TYPE}`
    );
  }
  if (row.payload_sha256 !== ref.payloadSha256) {
    throw new Error(
      `request/header commits tool schema digest ${ref.payloadSha256}, but event ${ref.eventId} has payload ${row.payload_sha256}`
    );
  }
}
