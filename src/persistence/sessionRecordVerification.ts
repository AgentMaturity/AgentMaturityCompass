/** Internal shared session-record core. Call sites select candidate keys; this is not a trust-admission verdict. */
import type { EvidenceEvent, SessionRecord } from "../types.js";
import { verifyHexDigestAny } from "../crypto/keys.js";

export function verifySessionRecords(
  rows: readonly EvidenceEvent[],
  records: readonly SessionRecord[],
  monitorKeys: string[],
  errors: string[]
): void {
  const byId = new Map(records.map((record) => [record.session_id, record]));
  const lastHashBySession = new Map<string, string>();
  for (const event of rows) {
    lastHashBySession.set(event.session_id, event.event_hash);
    if (!byId.has(event.session_id)) {
      errors.push(`Event ${event.id} references missing session ${event.session_id}`);
    }
  }
  for (const record of records) {
    if (record.session_final_event_hash === null) {
      continue;
    }
    // The seal must name the session's ACTUAL last event. Checking only the
    // signature would let a sealer commit to any hash it liked and still
    // produce a valid-looking seal over it.
    const last = lastHashBySession.get(record.session_id);
    if (last !== undefined && last !== record.session_final_event_hash) {
      errors.push(
        `Session ${record.session_id} seal names ${record.session_final_event_hash.slice(0, 16)}… ` +
          `but its last event is ${last.slice(0, 16)}…`
      );
    }
    if (
      record.session_seal_sig === null ||
      !verifyHexDigestAny(record.session_final_event_hash, record.session_seal_sig, monitorKeys)
    ) {
      errors.push(`Session ${record.session_id} seal signature invalid`);
    }
  }
}
