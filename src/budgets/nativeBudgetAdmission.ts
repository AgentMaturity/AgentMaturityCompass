import { randomUUID } from "node:crypto";
import { openLedger } from "../ledger/ledger.js";
import type { SessionService } from "../session/sessionService.js";
import type { ToolExecution } from "../tools/toolTypes.js";
import { sha256Hex } from "../utils/hash.js";
import { budgetForAgent, evaluateBudgetStatus, loadVerifiedBudgetsConfig } from "./budgets.js";
import { budgetSessionAgent, NATIVE_BUDGET_RESERVATION, projectBudgetUsage, readBudgetEvents } from "./nativeBudgetUsage.js";
import { workspaceSelfTrust } from "../trust/trustContext.js";
import { nativeUsdReservation, type NativeBudgetDispatch } from "./nativeUsdReservation.js";
import { reserveExperimentModelRequest } from "./experimentBudget.js";
import { nativeUsdUnits } from "./nativeUsdAmount.js";

export class NativeBudgetRefusal extends Error {
  readonly code = "AMC_NATIVE_BUDGET_REFUSED";
  constructor(message: string) { super(message); this.name = "NativeBudgetRefusal"; }
}

/**
 * Why the signed default `unknownTokenUsage: BLOCK` refuses, and the recovery docs/BUDGETS.md ("Missing Usage and
 * Recovery") documents. Unknown usage clears when its local budget day ends; a pending reservation never expires.
 */
function unknownUsageRefusal(agentId: string, unknown: number, pending: number): string {
  const causes = [
    ...(unknown > 0 ? [`${unknown} earlier native model request(s) whose token usage is unknown (a cancelled or interrupted call)`] : []),
    ...(pending > 0 ? [`${pending} reservation(s) still pending without a recorded settlement`] : [])
  ];
  return `blocked by ${causes.join(" and ")}; the signed default unknownTokenUsage: BLOCK refuses further model requests for agent ${agentId}`
    + `${pending > 0 ? "" : " until the local budget day ends"}. To continue now, review and set budgets.perAgent.${agentId}.unknownTokenUsage: ALLOW_WITH_WARNING`
    + " in .amc/budgets.yaml, then run amc budgets sign (docs/BUDGETS.md, Missing Usage and Recovery).";
}

/** The unknown-usage block the next native model request of this agent would meet, or null when none applies. */
export function nativeUnknownUsageNotice(workspace: string, agentId: string): string | null {
  try {
    const status = evaluateBudgetStatus(workspace, agentId);
    if (!status.budgetConfigValid || status.nativeAdmissionPolicy.unknownTokenUsage !== "BLOCK") return null;
    const { blockingUnknownLlmTokenRequests: unknown, llmPendingRequests: pending } = status.usage.daily;
    return unknown + pending > 0 ? unknownUsageRefusal(agentId, unknown, pending) : null;
  } catch {
    return null; // Unverifiable evidence is reported by budgets verify/status, not guessed here.
  }
}

type Spend = { kind: "llm"; nativeSessionId: string; headerEventId: string } |
  { kind: "tool"; nativeSessionId: string; toolToken: string; callId: string; actionClass: ToolExecution["actionClass"] };

/**
 * One workspace transaction covers read/check/reserve across CLI processes.
 * The reservation is a signed, sealed audit, not a mutable counter or expiring
 * lease. A missing outcome stays pending; only matching recorded facts settle it.
 * This is admission against known usage, not a tokenizer or pricing oracle.
 */
function reserve(workspace: string, spend: Spend, agentId?: string, dispatch?: NativeBudgetDispatch): void {
  // An unsigned reservation would make every later signed budget read fail, so AMC_NO_SIGN=1 admits nothing.
  if (process.env.AMC_NO_SIGN === "1") throw new NativeBudgetRefusal("native budget admission records a signed reservation; AMC_NO_SIGN=1 cannot reserve, so the dispatch is refused");
  const ledger = openLedger(workspace);
  try {
    ledger.db.transaction(() => {
      const config = loadVerifiedBudgetsConfig(workspace);
      const rows = readBudgetEvents(workspace, ledger, { trust: workspaceSelfTrust(workspace) });
      const owner = spend.kind === "llm" ? budgetSessionAgent(rows, spend.nativeSessionId) : agentId;
      if (!owner) throw new NativeBudgetRefusal("native budget identity is missing");
      // Toolset identity is inherited from the root. When a native session
      // exists, a forged tool agent cannot move its spend to a fresh account.
      if (rows.some(row => row.session_id === spend.nativeSessionId && row.event_type === "session/open") &&
          budgetSessionAgent(rows, spend.nativeSessionId) !== owner) throw new NativeBudgetRefusal("native budget identity differs from the session owner");
      const header = spend.kind === "llm" ? rows.find(row => row.id === spend.headerEventId && row.session_id === spend.nativeSessionId && row.event_type === "request/header") : undefined;
      const budget = budgetForAgent(config, owner);
      if (!budget) throw new NativeBudgetRefusal("no signed budget applies to this native agent");
      const now = Date.now();
      const usage = projectBudgetUsage(rows, owner, now);
      let usd: ReturnType<typeof nativeUsdReservation> | undefined;
      if (spend.kind === "tool") {
        const limit = budget.daily.maxToolExecutes[spend.actionClass];
        if (limit !== undefined && usage.daily.toolExecutes[spend.actionClass] + usage.daily.toolPending[spend.actionClass] >= limit) {
          throw new NativeBudgetRefusal(`daily tool budget exhausted for ${spend.actionClass}`);
        }
      } else {
        if (usage.daily.llmRequests >= budget.daily.maxLlmRequests || usage.minute.llmRequests >= budget.perMinute.maxLlmRequests) {
          throw new NativeBudgetRefusal("native model request budget exhausted");
        }
        if (budget.unknownTokenUsage !== "ALLOW_WITH_WARNING" && (usage.daily.llmPendingRequests > 0 || usage.daily.blockingUnknownLlmTokenRequests > 0 || usage.minute.blockingUnknownLlmTokenRequests > 0)) {
          throw new NativeBudgetRefusal(unknownUsageRefusal(owner, Math.max(usage.daily.blockingUnknownLlmTokenRequests, usage.minute.blockingUnknownLlmTokenRequests), usage.daily.llmPendingRequests));
        }
        if (usage.daily.llmTokens >= budget.daily.maxLlmTokens || usage.minute.llmTokens >= budget.perMinute.maxLlmTokens) {
          throw new NativeBudgetRefusal("native model token budget exhausted");
        }
        if (budget.daily.maxCostUsd !== null) {
          if (usage.daily.llmUnreservedCostRequests > 0) throw new NativeBudgetRefusal("USD exposure is unknown for a prior dispatch without a price reservation");
          if (!header) throw new NativeBudgetRefusal("USD reservation has no matching request header");
          try { usd = nativeUsdReservation(budget, header.meta_json, dispatch, now); }
          catch (error) { throw new NativeBudgetRefusal(error instanceof Error ? error.message : "USD request bound is unavailable"); }
          if (BigInt(usage.daily.llmBudgetCostUnits) + nativeUsdUnits(usd.reservedCostUsd) > nativeUsdUnits(budget.daily.maxCostUsd, false)) throw new NativeBudgetRefusal("USD budget exhausted by measured spend plus request reservations");
        }
      }
      const sessionId = `native-budget-${randomUUID()}`;
      const reservationKey = spend.kind === "llm" ? `llm:${spend.nativeSessionId}:${spend.headerEventId}` : `tool:${spend.nativeSessionId}:${spend.toolToken}`;
      if (rows.some(row => row.event_type === "audit" && JSON.parse(row.meta_json).reservationKey === reservationKey)) throw new NativeBudgetRefusal("native dispatch was already reserved");
      const experiment = spend.kind === "llm" ? reserveExperimentModelRequest(workspace, owner, budget, header?.meta_json ?? "",
        dispatch, now, spend.headerEventId, spend.nativeSessionId) : undefined;
      const meta = { auditType: NATIVE_BUDGET_RESERVATION, agentId: owner, trustTier: "OBSERVED", reservationKey, ...spend, ...usd, ...experiment };
      ledger.startSession({ sessionId, runtime: "amc", binaryPath: "amc-native-budget-admission", binarySha256: sha256Hex("amc-native-budget-admission-v1") });
      // Inline, like the other audit rows: the small reservation record stays verifiable without the vault's blob key.
      ledger.appendEvidence({ sessionId, runtime: "amc", eventType: "audit", payload: JSON.stringify(meta), payloadExt: "json", inline: true, meta });
      ledger.sealSession(sessionId);
    }).immediate();
  } finally { ledger.close(); }
}

export function reserveNativeModelBudget(session: SessionService, headerEventId: string, dispatch?: NativeBudgetDispatch): void {
  reserve(session.workspace, { kind: "llm", nativeSessionId: session.sessionId, headerEventId }, undefined, dispatch);
}

export function reserveNativeToolBudget(execution: ToolExecution, sessionId: string): string | undefined {
  if (execution.effectiveMode !== "EXECUTE") return undefined;
  if (execution.signal?.aborted) return "native tool cancelled before budget admission";
  try {
    reserve(execution.workspace, { kind: "tool", nativeSessionId: sessionId, toolToken: execution.token, callId: execution.callId, actionClass: execution.actionClass }, execution.agentId);
    return undefined;
  } catch (error) { return error instanceof Error ? error.message : "native budget admission failed"; }
}
