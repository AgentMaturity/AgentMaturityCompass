import { getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import { canonicalMetadataForHash } from "../ledger/ledger.js";
import { extractEnvelope, SESSION_GENESIS } from "../session/sessionTypes.js";
import { sha256Hex } from "../utils/hash.js";
import type { EvidenceEvent } from "../types.js";

export const ACP_MAX_SESSION_ROWS = 100_000;
export const ACP_MAX_TURN_UPDATE_BYTES = 8 * 1024 * 1024;

/** Authenticate each newly committed row before projecting it as native output. */
export function validateAcpCommittedTail(workspace: string, sessionId: string, events: readonly EvidenceEvent[], from: number, previousHash: string | null): string | null {
  if (events.length > ACP_MAX_SESSION_ROWS || from > events.length || from < 0) throw new Error("ACP session history exceeds its bound or was truncated.");
  if (from > 0 && previousHash !== null && events[from - 1]?.event_hash !== previousHash) throw new Error("ACP's previously observed session head changed.");
  if (from === events.length) return previousHash;
  const keys = getPublicKeyHistory(workspace, "monitor");
  let previous = from > 0 ? events[from - 1]!.event_hash : SESSION_GENESIS;
  for (let index = from; index < events.length; index += 1) {
    const event = events[index]!;
    const envelope = extractEnvelope(event.meta_json);
    if (event.session_id !== sessionId || !envelope || envelope.sessionId !== sessionId || envelope.seq !== index || envelope.prevSessionEventHash !== previous) throw new Error("ACP session sequence or ownership envelope is invalid.");
    const metadata = canonicalMetadataForHash({ id: event.id, ts: event.ts, sessionId: event.session_id,
      runtime: event.runtime, eventType: event.event_type, payloadPath: event.canonical_payload_path ?? event.payload_path,
      payloadInline: event.canonical_payload_inline ?? event.payload_inline, metaJson: event.meta_json });
    if (sha256Hex(`${event.prev_event_hash}${metadata}${event.payload_sha256}`) !== event.event_hash || !verifyHexDigestAny(event.event_hash, event.writer_sig, keys)) throw new Error("ACP committed row authentication failed.");
    previous = event.event_hash;
  }
  return previous;
}
