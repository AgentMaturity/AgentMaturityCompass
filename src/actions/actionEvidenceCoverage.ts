/**
 * The "Action evidence" measure (P1-03): of a session's consequential calls, how many have a verified receipt chain
 * that ends `completed` with complete evidence. Counts only; the gate that reads them decides, and a session with no
 * consequential call is not evaluated, never a pass. Signatures are checked against the workspace's own monitor keys:
 * a local audit trail, not a portable verdict.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { openLedger } from "../ledger/ledger.js";
import { hasTable } from "../ledger/ledgerSchema.js";
import { DEFAULT_AUTHORIZE_CLASSES } from "../tools/toolPipeline.js";
import { verifyChainIn } from "./actionJournal.js";

export type ActionEvidenceCoverage =
  | { readonly status: "not_evaluated"; readonly reason: string }
  | {
    readonly status: "evaluated";
    readonly calls: number;
    /** Verified chain, dispatched, ended `completed` with complete evidence. */
    readonly linked: number;
    /** Verified chain, dispatched, ended `outcome_unknown`, still `started`, or with evidence marked incomplete. */
    readonly unknown: number;
    /** A dispatched consequential call with no journaled execution, or one whose chain never reached `started`. */
    readonly unlinked: number;
    /** A chain that failed verification: an integrity failure, counted apart and never as linked. */
    readonly integrityFailures: number;
  };

/** Dispatch dispositions the tool pipeline records for a call (src/tools/toolEvidence.ts). */
const DISPATCHED = new Set(["TOOL_CALL_ALLOWED", "TOOL_CALL_FAILED"]);

export function actionEvidenceCoverage(workspace: string, sessionId: string): ActionEvidenceCoverage {
  if (!existsSync(join(workspace, ".amc", "evidence.sqlite"))) return { status: "not_evaluated", reason: "no evidence ledger in this workspace" };
  const ledger = openLedger(workspace, { readonly: true });
  try {
    const journaled = hasTable(ledger.db, "action_executions");
    const executions = new Map(journaled ? (ledger.db.prepare(
      "SELECT call_id, execution_id FROM action_executions WHERE session_id = ? AND call_id IS NOT NULL ORDER BY created_ts")
      .all(sessionId) as Array<{ call_id: string; execution_id: string }>).map((row) => [row.call_id, row.execution_id]) : []);
    const calls = new Set<string>();
    for (const row of ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE session_id = ? AND event_type = 'audit'").all(sessionId) as
      Array<{ meta_json: string }>) {
      const meta = JSON.parse(row.meta_json) as Record<string, unknown>;
      if (DISPATCHED.has(String(meta.auditType)) && DEFAULT_AUTHORIZE_CLASSES.has(String(meta.actionClass)) && typeof meta.callId === "string") {
        calls.add(meta.callId);
      }
    }
    const counts = { linked: 0, unknown: 0, unlinked: 0, integrityFailures: 0 };
    for (const [callId, executionId] of executions) {
      const chain = verifyChainIn(ledger, executionId);
      if (!chain.ok || chain.receipts.length === 0) {
        calls.add(callId);
        counts.integrityFailures += 1;
        continue;
      }
      if (!chain.receipts.some((receipt) => receipt.state === "started")) {
        if (calls.has(callId)) counts.unlinked += 1; // The tool row says it ran; the journal says it never started.
        continue;
      }
      calls.add(callId);
      const head = chain.receipts.at(-1)!;
      if (head.state === "completed" && head.evidenceComplete) counts.linked += 1;
      else counts.unknown += 1;
    }
    for (const callId of calls) if (!executions.has(callId)) counts.unlinked += 1;
    if (calls.size === 0) return { status: "not_evaluated", reason: "no consequential call in this session" };
    return { status: "evaluated", calls: calls.size, ...counts };
  } finally {
    ledger.close();
  }
}
