/**
 * Recovery for the action journal (P1-03). It never dispatches and never replays: a dispatched execution whose owner
 * died becomes `outcome_unknown` (`process_died`) and blocks its agent's journaled calls until reconciled (P1-04); one
 * that was never dispatched becomes `cancelled`. Also failure row 7: a provider outage in a session with journaled
 * actions is recorded as an incident. See docs/RECEIPTS.md.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { getPrivateKeyPem, signHexDigest } from "../crypto/keys.js";
import { computeIncidentHash, createIncidentStore } from "../incidents/incidentStore.js";
import type { Incident } from "../incidents/incidentTypes.js";
import { openLedger } from "../ledger/ledger.js";
import { hasTable } from "../ledger/ledgerSchema.js";
import { openActionJournal, ownerAlive, type ActionJournal } from "./actionJournal.js";
import { ReceiptChainBroken, TransitionRefused } from "./receiptStates.js";

/** The native session recovery default (src/session/sessionRecovery.ts), so both agree on when an owner is gone. */
export const DEFAULT_ACTION_STALE_AFTER_MS = 60_000;

export interface ActionRecoveryReport {
  readonly outcomeUnknown: readonly string[];
  readonly cancelled: readonly string[];
  /** Executions recovery could not settle because their chain failed verification. They block their agent. */
  readonly integrityFailures: readonly { readonly executionId: string; readonly error: string }[];
}

const NOTHING: ActionRecoveryReport = { outcomeUnknown: [], cancelled: [], integrityFailures: [] };

/**
 * Settle what dead owners left. `started`: owner dead on this host, or (another host) heartbeat older than
 * `staleAfterMs` → `outcome_unknown`. `requested`/`authorized`: owner dead on this host → `cancelled`.
 */
export function recoverUnsettled(journal: ActionJournal, staleAfterMs = DEFAULT_ACTION_STALE_AFTER_MS): ActionRecoveryReport {
  const outcomeUnknown: string[] = [];
  const cancelled: string[] = [];
  const integrityFailures: { executionId: string; error: string }[] = [];
  const now = Date.now();
  for (const row of journal.unsettled()) {
    try {
      if (row.state === "started") {
        // The owner of a dispatched execution is read from the intent its chain committed, not from the index row.
        const owner = journal.get(row.executionId)?.intent?.owner;
        const alive = ownerAlive(owner?.pid ?? null, owner?.hostname ?? null);
        // ponytail: a reused pid on this host reads as alive; P2-12's fencing tokens replace the pid check.
        if (alive === false || (alive === null && (row.heartbeatTs === null || now - row.heartbeatTs > staleAfterMs))) {
          journal.markUnknown(row.executionId, "process_died");
          outcomeUnknown.push(row.executionId);
        }
      } else if (ownerAlive(row.ownerPid, row.ownerHost) === false) {
        journal.cancel(row.executionId, "process_died");
        cancelled.push(row.executionId);
      }
    } catch (error) {
      // Refused: another recoverer settled it first, and the chain says so. Anything but a broken chain is a store failure.
      if (error instanceof TransitionRefused) continue;
      if (!(error instanceof ReceiptChainBroken)) throw error;
      journal.block(row.executionId, row.agentId);
      integrityFailures.push({ executionId: row.executionId, error: error.message });
    }
  }
  return { outcomeUnknown, cancelled, integrityFailures };
}

/** Read the workspace's ledger without migrating or creating it; `empty` when there is no journal yet. */
function readJournal<T>(workspace: string, empty: T, read: (db: Database.Database) => T): T {
  const path = join(workspace, ".amc", "evidence.sqlite");
  if (!existsSync(path)) return empty;
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    return hasTable(db, "action_executions") ? read(db) : empty;
  } finally {
    db.close();
  }
}

/** Recover the workspace's journal. Opens it (and so recovers) only when an execution is unsettled. */
export function recoverActionJournal(workspace: string, options: { readonly staleAfterMs?: number } = {}): ActionRecoveryReport {
  const unsettled = readJournal(workspace, false, (db) =>
    db.prepare("SELECT 1 FROM action_executions WHERE state IN ('requested', 'authorized', 'started') LIMIT 1").get() !== undefined);
  if (!unsettled) return NOTHING;
  const journal = openActionJournal(workspace, options);
  try {
    return journal.recovery;
  } finally {
    journal.close();
  }
}

/** The journaled execution behind each call of a native session, by call id. */
export function executionIdsForCalls(workspace: string, sessionId: string): ReadonlyMap<string, string> {
  return readJournal(workspace, new Map<string, string>(), (db) => new Map(
    (db.prepare("SELECT call_id, execution_id FROM action_executions WHERE session_id = ? AND call_id IS NOT NULL ORDER BY created_ts")
      .all(sessionId) as Array<{ call_id: string; execution_id: string }>).map((row) => [row.call_id, row.execution_id])));
}

/**
 * Failure row 7: the loop gave up on a model request (a final `request/failure`) in a session that journaled actions.
 * One signed incident per agent with executions in that session. The turn ends there, so no `started` follows.
 * Returns the incident ids; none when the session journaled nothing.
 */
export function recordProviderOutage(input: { readonly workspace: string; readonly sessionId: string;
  readonly outcomeEventId: string | null; readonly reason: string }): string[] {
  const agents = readJournal(input.workspace, [] as string[], (db) => (db.prepare(
    "SELECT DISTINCT agent_id FROM action_executions WHERE session_id = ? ORDER BY agent_id").all(input.sessionId) as Array<{ agent_id: string }>)
    .map((row) => row.agent_id));
  return recordActionIncidents(input.workspace, agents, { title: "Model provider outage during a session with journaled actions",
    description: `The model request failed finally (${input.reason}) in session ${input.sessionId}. Journaled actions in this `
      + "session keep their receipts; any outcome_unknown among them stays blocked until reconciled. Nothing is replayed.",
    triggerId: input.outcomeEventId ?? input.sessionId });
}

/** One signed `WARN` incident per agent about its journaled actions. Returns the incident ids. */
export function recordActionIncidents(workspace: string, agentIds: readonly string[],
  text: { readonly title: string; readonly description: string; readonly triggerId: string }): string[] {
  if (agentIds.length === 0) return [];
  const ledger = openLedger(workspace);
  try {
    const store = createIncidentStore(ledger.db);
    store.initTables();
    const key = getPrivateKeyPem(workspace, "monitor");
    return agentIds.map((agentId) => {
      const now = Date.now();
      // ASSURANCE_FAILURE is the nearest trigger the incident table accepts; the cause itself is named in the text.
      const partial: Omit<Incident, "incident_hash" | "signature"> = {
        incidentId: `incident_${randomUUID().replace(/-/g, "")}`, agentId, severity: "WARN", state: "OPEN",
        title: text.title, description: text.description, triggerType: "ASSURANCE_FAILURE", triggerId: text.triggerId, rootCauseClaimIds: [],
        affectedQuestionIds: [], causalEdges: [], timelineEventIds: [], createdTs: now, updatedTs: now, resolvedTs: null,
        postmortemRef: null, prev_incident_hash: store.getLastIncidentHash(agentId)
      };
      const incidentHash = computeIncidentHash(partial);
      store.insertIncident({ ...partial, incident_hash: incidentHash, signature: signHexDigest(incidentHash, key) });
      return partial.incidentId;
    });
  } finally {
    ledger.close();
  }
}
