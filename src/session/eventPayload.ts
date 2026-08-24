/**
 * Reading one evidence row's payload bytes back out of a workspace.
 *
 * WHY THIS IS SHARED. Two different consumers need the same answer, and they
 * must not be able to disagree about it: request derivation rebuilds a model
 * request from the rows it was assembled from (src/llm/request/requestSources.ts),
 * and the agent loop's inbox replays queued messages whose text is a row's
 * payload (src/agent/inbox.ts). If one of them treated a pruned row as missing
 * while the other treated it as readable, the same log would produce two
 * different stories about the same bytes.
 *
 * PRUNED IS NOT TAMPER. Retention may lawfully unlink a blob, at which point the
 * bytes genuinely cannot be read. That is reported as its own status, distinct
 * from a payload that is simply gone, because conflating a deletion someone was
 * entitled to perform with evidence of alteration turns a compliance feature
 * into a false alarm.
 *
 * The precedence below mirrors `verifyLedgerIntegrity` (`payload_pruned` first,
 * then the canonical path, then the live path) so that a row this function calls
 * pruned is the same row the verifier calls pruned.
 */
import { join } from "node:path";
import type { EvidenceEvent } from "../types.js";
import { loadBlobPlaintext } from "../storage/blobs/blobStore.js";
import { pathExists } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";

const EMPTY_PAYLOAD_SHA256 = sha256Hex(Buffer.alloc(0));

/** The bytes of one row's payload, or the specific reason they are unavailable. */
export type EventPayloadRead =
  | { readonly status: "ok"; readonly bytes: Buffer }
  /** Lawfully deleted by retention. Not an alarm. */
  | { readonly status: "pruned" }
  /** Gone with no prune record, or unreadable. An alarm. */
  | { readonly status: "missing"; readonly detail: string };

/** Read one row's payload, following the verifier's own precedence. */
export function readEventPayload(workspace: string, event: EvidenceEvent): EventPayloadRead {
  if (event.payload_pruned === 1) {
    return { status: "pruned" };
  }
  if (event.payload_inline !== null && event.payload_inline !== undefined) {
    return { status: "ok", bytes: Buffer.from(event.payload_inline, "utf8") };
  }
  const payloadPath = event.payload_path ?? event.canonical_payload_path ?? null;
  if (payloadPath === null) {
    // A row that names no payload but commits to the empty digest legitimately
    // has none; any other digest means the row promised bytes nothing stores.
    if (event.payload_sha256 === EMPTY_PAYLOAD_SHA256) {
      return { status: "ok", bytes: Buffer.alloc(0) };
    }
    return { status: "missing", detail: `event ${event.id} names no payload but commits to ${event.payload_sha256}` };
  }
  if (!pathExists(join(workspace, payloadPath))) {
    return { status: "missing", detail: `blob for event ${event.id} is gone (${payloadPath}) with no prune record` };
  }
  try {
    return { status: "ok", bytes: loadBlobPlaintext(workspace, payloadPath).bytes };
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    return { status: "missing", detail: `blob for event ${event.id} could not be read: ${reason}` };
  }
}
