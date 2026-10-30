/**
 * The I/O half of the execution contract (P2-13): the receipt states of a session's journaled actions, read from
 * verified receipt chains, and the status every surface reports from them. See ./executionContract.ts.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { verifyChainIn } from "../actions/actionJournal.js";
import { readAgentRunSummary } from "../agent/runReport.js";
import { openLedger } from "../ledger/ledger.js";
import { hasTable } from "../ledger/ledgerSchema.js";
import { deriveExecutionStatus, EVIDENCE_INCOMPLETE, INTEGRITY_FAILED, type ExecutionFacts, type ExecutionStatus } from "./executionContract.js";

/** The pipeline's authorization denials: the binding at admission and the pre-dispatch recheck (src/tools/toolPipeline.ts). */
const AUTHORIZATION_DENIALS = ["authorization_denied:", "recheck_failed:"];

/**
 * The verified head state of every execution journaled for `sessionId`, sorted, and the typed authorization failures
 * (`RecheckFailure` codes such as `purpose_violation`) of the ones the authorization step denied: their `denied`
 * receipt's `authorization_denied:<codes>` (binding) or `recheck_failed:<codes>` (pre-dispatch recheck) reason. Executions are found from the index AND
 * from the signed ACTION_STATE rows, so deleting an index row does not hide one; each chain is then verified (hash,
 * link, signature) and a chain that fails is `integrity_failed`, never skipped. A workspace with no ledger or no journal
 * table has journaled nothing. Signatures are checked against the workspace's own keys: a local audit trail.
 */
export function sessionReceipts(workspace: string, sessionId: string): { readonly states: readonly string[]; readonly recheckFailures: readonly string[] } {
  const none = { states: [], recheckFailures: [] };
  if (!existsSync(join(workspace, ".amc", "evidence.sqlite"))) return none;
  let ledger: ReturnType<typeof openLedger>;
  try { ledger = openLedger(workspace, { readonly: true }); } catch { return { states: [INTEGRITY_FAILED], recheckFailures: [] }; }
  try {
    ledger.db.exec("BEGIN"); // One snapshot: the executions found are the ones verified.
    if (!hasTable(ledger.db, "action_executions")) return none;
    const ids = new Set((ledger.db.prepare("SELECT execution_id FROM action_executions WHERE session_id = ?")
      .all(sessionId) as Array<{ execution_id: string }>).map((row) => row.execution_id));
    for (const row of ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE event_type = 'audit' AND meta_json LIKE ?")
      .all('%"ACTION_STATE"%') as Array<{ meta_json: string }>) {
      const meta = JSON.parse(row.meta_json) as Record<string, unknown>;
      if (meta.auditType === "ACTION_STATE" && meta.agentSessionId === sessionId && typeof meta.executionId === "string") ids.add(meta.executionId);
    }
    const states: string[] = [], recheckFailures: string[] = [];
    for (const id of ids) {
      const chain = verifyChainIn(ledger, id);
      const head = chain.receipts.at(-1);
      if (!chain.ok || !head) { states.push(INTEGRITY_FAILED); continue; }
      states.push(head.state === "completed" && !head.evidenceComplete ? EVIDENCE_INCOMPLETE : head.state);
      const prefix = head.state === "denied" ? AUTHORIZATION_DENIALS.find((p) => head.reasonCode.startsWith(p)) : undefined;
      if (prefix) recheckFailures.push(...head.reasonCode.slice(prefix.length).split(","));
    }
    return { states: states.sort(), recheckFailures };
  } catch {
    return { states: [INTEGRITY_FAILED], recheckFailures: [] }; // An unreadable journal is an integrity failure, never "nothing journaled".
  } finally {
    if (ledger.db.inTransaction) ledger.db.exec("COMMIT");
    ledger.close();
  }
}

/** The status a surface reports: its own observations plus the session's verified receipt states. */
export function executionStatusFor(workspace: string, facts: Omit<ExecutionFacts, "receiptStates" | "recheckFailures">): ExecutionStatus {
  const receipts = sessionReceipts(workspace, facts.sessionId);
  return deriveExecutionStatus({ ...facts, receiptStates: receipts.states, recheckFailures: receipts.recheckFailures });
}

/**
 * The status of a recorded session read back cold (`amc agent-loop verify --json`): admission from the session's own
 * rows, the model phase from its latest RECORDED turn ending (rows, not a verdict), and `verified` from the verifier.
 */
export function recordedExecutionStatus(workspace: string, sessionId: string, verified: boolean | null): ExecutionStatus {
  let recorded: ReturnType<typeof readAgentRunSummary> | null = null;
  try { recorded = readAgentRunSummary(workspace, sessionId, "idle"); } catch { /* unreadable rows: the model phase reads unknown */ }
  return executionStatusFor(workspace, { sessionId, admission: recorded === null ? null : recorded.events > 0 ? "admitted" : null,
    turn: recorded === null ? "unreadable" : recorded.endings.at(-1)?.reason ?? null, verified });
}
