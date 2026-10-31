import { embedEnvelope, extractEnvelope, SESSION_GENESIS } from "../../src/session/sessionTypes.js";
import type { EvidenceEvent } from "../../src/types.js";

/**
 * Meta for the next native (`x/y`) row a fixture appends to `sessionId`, chained
 * onto the session's existing envelope rows. Verification refuses native rows
 * without an envelope (e6cc19014), so raw-append fixtures must carry one.
 */
export function nativeMeta(rows: readonly EvidenceEvent[], sessionId: string, typeMeta: Record<string, unknown>): Record<string, unknown> {
  const prior = rows.filter((row) => row.session_id === sessionId && extractEnvelope(row.meta_json) !== null);
  return embedEnvelope(typeMeta, {
    v: 1, sessionId, seq: prior.length, prevSessionEventHash: prior.at(-1)?.event_hash ?? SESSION_GENESIS,
    turn: null, step: null, surface: { op: "none" }, synthetic: false
  });
}
