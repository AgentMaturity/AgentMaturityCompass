/**
 * The agent's outcome_unknown lockout as readiness reads it (P1-60; design §10.2): the executions that block the agent's
 * journaled calls, read on a connection the caller already holds. openActionJournal is not used here: it opens a second
 * ledger connection and runs recovery writes, which a readiness read must never do, least of all inside the A4 write
 * transaction (whose two plan runs must read the same answer).
 * ponytail: the query copies the action journal's blocking rule (src/actions/actionJournal.ts blockingFor) and cannot see
 * its in-process list of chains whose post-dispatch receipt failed (rare; the journal itself still refuses those calls);
 * export the journal's read-only rule and call it instead once that module is open for an edit.
 */
import type Database from "better-sqlite3";
import { ownerAlive } from "../actions/actionJournal.js";
import { DEFAULT_ACTION_STALE_AFTER_MS } from "../actions/actionRecovery.js";
import { approvalStatusPayload } from "../approvals/approvalEngine.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import type { A4ChainLink } from "./a4Schema.js";
import { RESOLUTION_PURPOSE } from "./spec/assemble.js";

export function blockingExecutionsIn(db: Database.Database, workspace: string, agentId: string): string[] {
  const staleBefore = Date.now() - DEFAULT_ACTION_STALE_AFTER_MS;
  const rows = db.prepare(`SELECT e.execution_id AS id, e.state AS indexState, e.evidence_complete AS indexComplete,
        json_extract(t.receipt_json, '$.state') AS headState, json_extract(t.receipt_json, '$.evidenceComplete') AS headComplete,
        e.owner_pid AS pid, e.owner_host AS host, e.heartbeat_ts AS heartbeat
      FROM action_executions e JOIN action_transitions t ON t.execution_id = e.execution_id
        AND t.seq = (SELECT MAX(x.seq) FROM action_transitions x WHERE x.execution_id = e.execution_id)
      WHERE e.workspace_id = ? AND e.agent_id = ? AND (e.state IN ('started', 'outcome_unknown') OR e.evidence_complete = 0
        OR json_extract(t.receipt_json, '$.state') IN ('started', 'outcome_unknown') OR json_extract(t.receipt_json, '$.evidenceComplete') = 0)`)
    .all(workspaceIdFromDirectory(workspace), agentId) as Array<{ id: string; indexState: string; indexComplete: number; headState: string;
      headComplete: number; pid: number | null; host: string | null; heartbeat: number | null }>;
  return [...new Set(rows.filter((row) => row.indexState === "outcome_unknown" || row.headState === "outcome_unknown" || row.indexComplete === 0
    || row.headComplete === 0 || row.heartbeat === null || row.heartbeat < staleBefore || ownerAlive(row.pid, row.host) === false).map((row) => row.id))];
}

/**
 * The engine status (PENDING, QUORUM_MET, DENIED, EXPIRED, CONSUMED, CANCELLED; UNREADABLE when its record does not
 * verify) of exactly the engine requests readiness names, looked up by their own ids from links only this lane writes:
 * each effect gate's newest opened request (EFFECT_GATE_OPENED, an owner's), and the newest resolution request
 * (EVIDENCE_REF with purpose outcome_unknown_resolution, which the generic evidence route cannot set) of each execution
 * blocking the agent now. A generic `approval` ref a member adds is never read, so none can push these out. Readiness
 * names the status so a card never offers a vote on a closed request.
 */
export function engineRequestStatusesIn(workspace: string, agentId: string, chain: readonly A4ChainLink[], blocking: readonly string[]): Record<string, string> {
  const newest = [...chain].reverse();
  const gates = new Set<unknown>();
  const effectRequests = newest.flatMap((link) => {
    if (link.kind !== "EFFECT_GATE_OPENED" || gates.has(link.body.gateId)) return [];
    gates.add(link.body.gateId);
    return [link.body.approvalRequestId];
  }).slice(0, 16);
  const resolutionRequests = blocking.slice(0, 16).map((executionId) => newest.find((link) => link.kind === "EVIDENCE_REF"
    && link.body.purpose === RESOLUTION_PURPOSE && link.body.executionId === executionId)?.body.refId);
  const ids = [...new Set([...effectRequests, ...resolutionRequests].filter((id): id is string => typeof id === "string" && /^apprreq_[a-f0-9]{32}$/.test(id)))];
  return Object.fromEntries(ids.map((approvalId) => {
    try {
      return [approvalId, approvalStatusPayload({ workspace, agentId, approvalId }).status];
    } catch {
      return [approvalId, "UNREADABLE"];
    }
  }));
}
