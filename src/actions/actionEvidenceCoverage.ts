/**
 * The "Action evidence" measure (P1-03): of a session's consequential calls, how many have a verified receipt chain
 * that ends `completed` with complete evidence. Counts only; the gate that reads them decides, and a session with no
 * consequential call is not evaluated, never a pass.
 *
 * Nothing is counted from an unverified ledger. The ledger's chain is verified first; then, in one read snapshot, every
 * evidence row is re-verified (hash, link and signature) and the counts come from those verified bytes, never from a
 * second read. Signatures are checked against the workspace's own monitor keys: a local audit trail, not a portable
 * verdict.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readBudgetEvents } from "../budgets/nativeBudgetUsage.js";
import { openLedger } from "../ledger/ledger.js";
import { hasTable } from "../ledger/ledgerSchema.js";
import { verifyLedgerIntegrity } from "../ledger/ledgerVerification.js";
import { DEFAULT_AUTHORIZE_CLASSES } from "../tools/toolPipeline.js";
import type { EvidenceEvent } from "../types.js";
import { verifyChainIn } from "./actionJournal.js";

export type ActionEvidenceCoverage =
  | {
    readonly status: "not_evaluated";
    readonly reason: string;
    /** Present when the ledger failed verification: an integrity failure, so nothing was counted. */
    readonly integrityErrors?: readonly string[];
  }
  | {
    readonly status: "evaluated";
    /** Consequential calls: dispatched per the session's tool evidence, or journaled past `requested` evidence. */
    readonly calls: number;
    /** Every execution of the call verified, started, and ended `completed` with complete evidence; exactly one. */
    readonly linked: number;
    /** Settled by an operator's resolution (P1-04): self-reported, so never counted as linked. */
    readonly operatorResolved: number;
    /** Ended `outcome_unknown`, still `started`, evidence marked incomplete, or more than one execution for the call. */
    readonly unknown: number;
    /** Dispatched with no journaled execution, or with one that never reached `started`. */
    readonly unlinked: number;
    /** A chain that failed verification. It dominates every other outcome for its call and never counts as linked. */
    readonly integrityFailures: number;
    /** Calls with more than one execution (also counted as unknown): a retry path, a bug or an injected row. */
    readonly duplicateExecutions: number;
  };

/** Dispatch dispositions the tool pipeline records for a call (src/tools/toolEvidence.ts). */
const DISPATCHED = new Set(["TOOL_CALL_ALLOWED", "TOOL_CALL_FAILED"]);

/** A verified row's meta. Meta that is not a JSON object is legal in the ledger and names no call. */
function metaOf(row: EvidenceEvent): Record<string, unknown> {
  try {
    const meta: unknown = JSON.parse(row.meta_json);
    return typeof meta === "object" && meta !== null ? meta as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function actionEvidenceCoverage(workspace: string, sessionId: string): ActionEvidenceCoverage {
  if (!existsSync(join(workspace, ".amc", "evidence.sqlite"))) return { status: "not_evaluated", reason: "no evidence ledger in this workspace" };
  const integrity = verifyLedgerIntegrity(workspace);
  if (!integrity.chain.ok) {
    return { status: "not_evaluated", reason: `ledger_integrity_failed: ${integrity.chain.errors[0] ?? "unknown"}`, integrityErrors: integrity.chain.errors };
  }
  const ledger = openLedger(workspace, { readonly: true });
  try {
    ledger.db.exec("BEGIN"); // One snapshot: the rows verified below are the rows counted.
    let rows: EvidenceEvent[];
    try {
      rows = readBudgetEvents(workspace, ledger);
    } catch (error) {
      return { status: "not_evaluated", reason: `ledger_integrity_failed: ${message(error)}`, integrityErrors: [message(error)] };
    }
    const dispatched = new Set<string>();
    /** Every execution per call: from the signed requested rows, and from the index in case a row went missing. */
    const executions = new Map<string, Set<string>>();
    const add = (callId: string, executionId: string): void => { executions.set(callId, (executions.get(callId) ?? new Set()).add(executionId)); };
    for (const row of rows) {
      if (row.event_type !== "audit") continue;
      const meta = metaOf(row);
      if (row.session_id === sessionId && DISPATCHED.has(String(meta.auditType)) && DEFAULT_AUTHORIZE_CLASSES.has(String(meta.actionClass))
        && typeof meta.callId === "string") dispatched.add(meta.callId);
      if (meta.auditType === "ACTION_STATE" && meta.seq === 0 && meta.agentSessionId === sessionId && typeof meta.callId === "string"
        && typeof meta.executionId === "string") add(meta.callId, meta.executionId);
    }
    if (hasTable(ledger.db, "action_executions")) {
      for (const row of ledger.db.prepare("SELECT call_id, execution_id FROM action_executions WHERE session_id = ? AND call_id IS NOT NULL")
        .all(sessionId) as Array<{ call_id: string; execution_id: string }>) add(row.call_id, row.execution_id);
    }
    const counts = { calls: 0, linked: 0, operatorResolved: 0, unknown: 0, unlinked: 0, integrityFailures: 0, duplicateExecutions: 0 };
    for (const callId of new Set([...dispatched, ...executions.keys()])) {
      const chains = [...(executions.get(callId) ?? [])].map((executionId) => verifyChainIn(ledger, executionId));
      const started = chains.filter((chain) => chain.receipts.some((receipt) => receipt.state === "started"));
      // Not consequential: never dispatched by the tool evidence, a single intact chain, never started (a denial, say).
      if (!dispatched.has(callId) && chains.length === 1 && chains[0]!.ok && started.length === 0) continue;
      counts.calls += 1;
      if (chains.some((chain) => !chain.ok || chain.receipts.length === 0)) counts.integrityFailures += 1;
      else if (chains.length > 1) {
        counts.duplicateExecutions += 1;
        counts.unknown += 1;
      } else if (started.length === 0) counts.unlinked += 1;
      else {
        const head = started[0]!.receipts.at(-1)!;
        if (started[0]!.receipts.some((receipt) => receipt.resolution === "operator")) counts.operatorResolved += 1;
        else if (head.state === "completed" && head.evidenceComplete) counts.linked += 1;
        else counts.unknown += 1;
      }
    }
    if (counts.calls === 0) return { status: "not_evaluated", reason: "no consequential call in this session" };
    return { status: "evaluated", ...counts };
  } finally {
    if (ledger.db.inTransaction) ledger.db.exec("COMMIT");
    ledger.close();
  }
}
