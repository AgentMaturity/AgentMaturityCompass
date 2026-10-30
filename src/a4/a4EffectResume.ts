/**
 * Whether a failed A4 effect may run again (P2-37; design §6.5): P2-12's resume rule decides, from the effect's action
 * class and tool name as a tool call's (never MCP, no recorded file change). `may-repeat` retries in place. Every other
 * rule is `reconcile-first`, as P2-12 settles an interrupted call (src/session/resumeRules.ts settleCall): an execution
 * id the action journal never recorded reached no system of record under that key (`not-found`, settled), so the owner's
 * one retry stands; a journaled one is asked of its system of record through P1-04's `reconcile` before the retry, and
 * the retry runs only once its verified head says nothing was applied (refused or cancelled before dispatch, or
 * completed `not_applied`). An applied effect is never run again; an unknown one waits for reconciliation or the
 * operator's resolution (amc action resolve, the outcome_unknown card). A chain that does not verify refuses.
 */
import { verifyChainIn } from "../actions/actionJournal.js";
import { reconcile, type ReconcileAdapter } from "../actions/reconcile.js";
import { hasTable } from "../ledger/ledgerSchema.js";
import { resumeRuleFor, type ResumeRule } from "../session/resumeRules.js";
import type { ActionClass } from "../types.js";
import { A4StoreError } from "./a4Store.js";

type Ledger = Parameters<typeof verifyChainIn>[0];
type EffectKind = { readonly actionClass: ActionClass; readonly toolName: string };

export const effectResumeRule = (def: EffectKind): ResumeRule => resumeRuleFor({ actionClass: def.actionClass, toolName: def.toolName, mcp: false, file: null });

/**
 * Whether the action journal ever recorded `executionId`: its index or transitions, or a signed ACTION_STATE row naming
 * it, so deleting index rows does not turn a journaled execution into "never journaled".
 */
function journaled(db: Ledger["db"], executionId: string): boolean {
  if (hasTable(db, "action_executions") && db.prepare("SELECT 1 FROM action_executions WHERE execution_id = ?").get(executionId) !== undefined) return true;
  if (hasTable(db, "action_transitions") && db.prepare("SELECT 1 FROM action_transitions WHERE execution_id = ?").get(executionId) !== undefined) return true;
  return (db.prepare("SELECT meta_json FROM evidence_events WHERE event_type = 'audit' AND meta_json LIKE ? AND meta_json LIKE ?")
    .all('%"ACTION_STATE"%', `%${executionId}%`) as Array<{ meta_json: string }>).some((row) => {
    try {
      const meta = JSON.parse(row.meta_json) as Record<string, unknown>;
      return meta.auditType === "ACTION_STATE" && meta.executionId === executionId;
    } catch {
      return true; // an unreadable row that mentions the id is not evidence that it was never journaled
    }
  });
}

/** Refuses (409) a retry of `def`'s execution unless P2-12's rule lets it run again; reads on the caller's ledger connection. */
export function assertEffectResumable(ledger: Ledger, def: EffectKind, executionId: string): void {
  if (effectResumeRule(def) !== "reconcile-first" || !journaled(ledger.db, executionId)) return;
  let chain: ReturnType<typeof verifyChainIn>;
  try {
    chain = verifyChainIn(ledger, executionId);
  } catch (error) {
    throw new A4StoreError(409, "EFFECT_INTEGRITY_FAILED", `The journaled execution ${executionId} could not be verified: ${(error as Error).message}`);
  }
  const head = chain.receipts.at(-1);
  if (!chain.ok || head === undefined) {
    throw new A4StoreError(409, "EFFECT_INTEGRITY_FAILED", `The receipt chain of ${executionId} does not verify; nothing is retried.`, { errors: chain.errors.slice(0, 8) });
  }
  if (head.state === "denied" || head.state === "cancelled") return;
  if (head.state === "completed" && head.effect === "not_applied" && head.evidenceComplete) return;
  if (head.state === "completed" && head.effect === "applied") {
    throw new A4StoreError(409, "EFFECT_ALREADY_APPLIED", `The system of record shows ${executionId} applied; it is not run again.`, { executionId });
  }
  throw new A4StoreError(409, "EFFECT_RECONCILE_FIRST",
    `${executionId} is ${head.state}${head.evidenceComplete ? "" : " with incomplete evidence"}: reconcile it, or resolve it from the outcome_unknown card, before a retry.`,
    { executionId, state: head.state, rule: "reconcile-first" });
}

/**
 * Before a retry, outside the project lock: asks the system of record about a journaled reconcile-first execution
 * through P1-04's `reconcile` (an answer it cannot give changes nothing). The retry's own transaction then re-reads
 * the verified head (assertEffectResumable), so skipping this never lets a retry through.
 * ponytail: A4 holds no reconcile adapters yet, so an execution without one is settled only by the operator's resolution;
 * pass the adapters here once an A4 effect journals a call that has one.
 */
export async function reconcileBeforeRetry(ledger: Ledger, def: EffectKind, executionId: string,
  adapters: ReadonlyMap<string, ReconcileAdapter> = new Map()): Promise<void> {
  if (effectResumeRule(def) !== "reconcile-first" || !journaled(ledger.db, executionId)) return;
  try {
    await reconcile(executionId, { workspace: ledger.workspace, adapters });
  } catch {
    // The retry's transaction re-reads the verified head and refuses whatever this could not settle.
  }
}
