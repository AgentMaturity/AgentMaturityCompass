/**
 * Interrupted legacy sessions (LIVE-INTEGRITY-02 D-INT-6, -05 D-INT-8, -07): one implementation seals them, for the
 * running gateway's sweep and for `amc verify --repair`, and one reads the seals that gateway start events witness.
 *
 * A session is sealed only when, re-read inside one immediate transaction, it is unended with neither seal column, has
 * at least one signed event whose tail is at least `minAgeMs` old at `now`, and no gateway start event witnessed it as
 * sealed. The marker row and the seal commit together: a second sealer re-reads a sealed row and stops, and if it got
 * past that, protect_sessions_sealed_immutable rolls back its whole transaction, marker included.
 */
import type { Ledger } from "./ledger.js";
import { runImmediateTransaction } from "./ledgerSessionTransactions.js";
import { GATEWAY_SESSION_STALE_AFTER_MS, INTERRUPTED_SEALED_STAGE } from "./sessionLiveness.js";
import { extractEnvelope } from "../session/sessionTypes.js";
import type { SessionRecord } from "../types.js";

type SealColumns = Pick<SessionRecord, "runtime" | "ended_ts" | "session_final_event_hash" | "session_seal_sig">;
const SEAL_COLUMNS_SQL = "SELECT runtime, ended_ts, session_final_event_hash, session_seal_sig FROM sessions WHERE session_id = ?";
const unsealed = (row: SealColumns | undefined): row is SealColumns =>
  row !== undefined && row.ended_ts === null && row.session_final_event_hash === null && row.session_seal_sig === null;

/** A signed gateway start event's record that a gateway session was sealed with `finalHash`. */
export interface SealWitness { readonly finalHash: string; readonly eventId: string }

interface StartRow { id: string; session_id: string; event_type: string; runtime: string; meta_json: string }

function startMeta(row: StartRow): Record<string, unknown> | null {
  if (row.event_type !== "gateway" || row.runtime !== "gateway") return null;
  try {
    const meta = JSON.parse(row.meta_json) as Record<string, unknown>;
    return meta.stage === "start" ? meta : null;
  } catch {
    return null;
  }
}

/** -07: every session the `sealedGatewaySessions` of a gateway start row names, with the first row that named it. */
export function gatewaySealWitnesses(rows: readonly StartRow[]): Map<string, SealWitness> {
  const witnesses = new Map<string, SealWitness>();
  for (const row of rows) {
    const listed = startMeta(row)?.sealedGatewaySessions;
    if (!Array.isArray(listed)) continue;
    for (const entry of listed as Array<{ sessionId?: unknown; finalHash?: unknown } | null>) {
      if (typeof entry?.sessionId !== "string" || typeof entry.finalHash !== "string" || witnesses.has(entry.sessionId)) continue;
      witnesses.set(entry.sessionId, { finalHash: entry.finalHash, eventId: row.id });
    }
  }
  return witnesses;
}

function gatewayStartRows(ledger: Ledger): StartRow[] {
  return ledger.db.prepare(`SELECT id, session_id, event_type, runtime, meta_json FROM evidence_events
    WHERE event_type = 'gateway' AND meta_json LIKE '%"stage":"start"%' ORDER BY rowid ASC`).all() as StartRow[];
}

/** -07: the seals the ledger's gateway start rows witness. */
export function witnessedGatewaySeals(ledger: Ledger): Map<string, SealWitness> {
  return gatewaySealWitnesses(gatewayStartRows(ledger));
}

/**
 * -07: the gateway process sessions (each opened by a signed start row) that are sealed now and no start row lists yet.
 * ponytail: bridge sessions carry runtime "gateway" too but are not listed: bridgeServer.ts opens and seals a
 * `bridge-deny-*` session per unauthenticated denied request, so listing them would let any client grow the start row.
 * An erased bridge seal is re-sealed with a visible marker instead; list them too if that limit ever matters.
 */
export function sealedGatewaySessionsToWitness(ledger: Ledger): Array<{ sessionId: string; finalHash: string }> {
  const rows = gatewayStartRows(ledger);
  const witnessed = gatewaySealWitnesses(rows);
  const read = ledger.db.prepare("SELECT session_final_event_hash, session_seal_sig FROM sessions WHERE session_id = ?");
  const unlisted: Array<{ sessionId: string; finalHash: string }> = [];
  for (const sessionId of new Set(rows.filter((row) => startMeta(row) !== null).map((row) => row.session_id))) {
    const seal = read.get(sessionId) as Pick<SessionRecord, "session_final_event_hash" | "session_seal_sig"> | undefined;
    if (!witnessed.has(sessionId) && seal?.session_final_event_hash && seal.session_seal_sig) {
      unlisted.push({ sessionId, finalHash: seal.session_final_event_hash });
    }
  }
  return unlisted;
}

/**
 * Seals one interrupted session with a signed `interrupted-sealed` marker, or returns false and writes nothing when the
 * re-read row is sealed, ended, event-less, too fresh, or witnessed. Throws only what the ledger throws (a locked vault,
 * a lost race on the trigger); the transaction has rolled back by then.
 */
export function sealInterruptedSession(ledger: Ledger, sessionId: string, input: {
  now: number; minAgeMs: number; recoveredBy: string; witnessed: ReadonlyMap<string, SealWitness>;
}): boolean {
  if (input.witnessed.has(sessionId)) return false;
  return runImmediateTransaction(ledger.db, () => {
    const row = ledger.db.prepare(SEAL_COLUMNS_SQL).get(sessionId) as SealColumns | undefined;
    if (!unsealed(row)) return false;
    const tail = ledger.db.prepare("SELECT ts FROM evidence_events WHERE session_id = ? ORDER BY rowid DESC LIMIT 1")
      .get(sessionId) as { ts: number } | undefined;
    if (!tail || input.now - tail.ts < input.minAgeMs) return false;
    ledger.appendEvidence({ sessionId, runtime: row.runtime, eventType: "gateway",
      meta: { stage: INTERRUPTED_SEALED_STAGE, lastEventTs: tail.ts, recoveredBy: input.recoveredBy, trustTier: "OBSERVED" } });
    ledger.sealSession(sessionId);
    return true;
  });
}

/** A session `amc verify --repair` may seal (D-INT-8), with the facts its plan prints. */
export interface InterruptedSession { sessionId: string; runtime: string; tailAgeMs: number }

/**
 * -05: the sessions behind the chain errors when every error is "Session <id> missing seal" for an unended, unsealed
 * legacy (non-agent) session with a signed tail older than the liveness window that no gateway start witnessed; null
 * when anything else failed, a session has no signed event or a future tail, or a session is a native agent session.
 */
export function sealableInterruptedSessions(ledger: Ledger, chainErrors: readonly string[], now: number): InterruptedSession[] | null {
  const ids = chainErrors.map((error) => /^Session (.+) missing seal$/.exec(error)?.[1]);
  if (ids.length === 0 || ids.some((id) => id === undefined)) return null;
  const witnessed = witnessedGatewaySeals(ledger);
  const sessions: InterruptedSession[] = [];
  for (const sessionId of new Set(ids as string[])) {
    const row = ledger.db.prepare(SEAL_COLUMNS_SQL).get(sessionId) as SealColumns | undefined;
    const events = ledger.db.prepare("SELECT event_type, meta_json, ts FROM evidence_events WHERE session_id = ? ORDER BY rowid")
      .all(sessionId) as Array<{ event_type: string; meta_json: string; ts: number }>;
    const tail = events.at(-1);
    const native = events.some((event) => event.event_type === "session/open" || extractEnvelope(event.meta_json) !== null);
    if (!unsealed(row) || !tail || native || witnessed.has(sessionId) || now - tail.ts <= GATEWAY_SESSION_STALE_AFTER_MS) return null;
    sessions.push({ sessionId, runtime: row.runtime, tailAgeMs: now - tail.ts });
  }
  return sessions;
}

/** -05: seals the planned sessions in one transaction, all or none; each is re-checked by sealInterruptedSession. */
export function sealInterruptedSessions(ledger: Ledger, input: { ids: readonly string[]; recoveredBy: string; now: number }): string[] {
  const witnessed = witnessedGatewaySeals(ledger);
  return runImmediateTransaction(ledger.db, () => input.ids.map((sessionId) => {
    if (!sealInterruptedSession(ledger, sessionId, { now: input.now, minAgeMs: GATEWAY_SESSION_STALE_AFTER_MS + 1, recoveredBy: input.recoveredBy, witnessed })) {
      throw new Error(`session ${sessionId} is no longer an interrupted session (sealed, written to or witnessed since the plan)`);
    }
    return sessionId;
  }));
}
