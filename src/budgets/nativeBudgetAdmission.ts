import { randomUUID } from "node:crypto";
import { openLedger } from "../ledger/ledger.js";
import type { SessionService } from "../session/sessionService.js";
import type { ToolExecution } from "../tools/toolTypes.js";
import { sha256Hex } from "../utils/hash.js";
import { budgetForAgent, loadVerifiedBudgetsConfig } from "./budgets.js";
import { budgetSessionAgent, NATIVE_BUDGET_RESERVATION, projectBudgetUsage, readBudgetEvents } from "./nativeBudgetUsage.js";

export class NativeBudgetRefusal extends Error {
  readonly code = "AMC_NATIVE_BUDGET_REFUSED";
  constructor(message: string) { super(message); this.name = "NativeBudgetRefusal"; }
}

type Spend = { kind: "llm"; nativeSessionId: string; headerEventId: string } |
  { kind: "tool"; nativeSessionId: string; toolToken: string; callId: string; actionClass: ToolExecution["actionClass"] };

/**
 * One workspace transaction covers read/check/reserve across CLI processes.
 * The reservation is a signed, sealed audit, not a mutable counter or expiring
 * lease. A missing outcome stays pending; only matching recorded facts settle it.
 * This is admission against known usage, not a tokenizer or pricing oracle.
 */
function reserve(workspace: string, spend: Spend, agentId?: string): void {
  const ledger = openLedger(workspace);
  try {
    ledger.db.transaction(() => {
      const config = loadVerifiedBudgetsConfig(workspace);
      const rows = readBudgetEvents(workspace, ledger);
      const owner = spend.kind === "llm" ? budgetSessionAgent(rows, spend.nativeSessionId) : agentId;
      if (!owner) throw new NativeBudgetRefusal("native budget identity is missing");
      // Toolset identity is inherited from the root. When a native session
      // exists, a forged tool agent cannot move its spend to a fresh account.
      if (rows.some(row => row.session_id === spend.nativeSessionId && row.event_type === "session/open") &&
          budgetSessionAgent(rows, spend.nativeSessionId) !== owner) throw new NativeBudgetRefusal("native budget identity differs from the session owner");
      const budget = budgetForAgent(config, owner);
      if (!budget) throw new NativeBudgetRefusal("no signed budget applies to this native agent");
      const now = Date.now();
      const usage = projectBudgetUsage(rows, owner, now);
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
          throw new NativeBudgetRefusal("native model token usage is unknown or a prior dispatch remains pending; review budgets.perAgent.<agent>.unknownTokenUsage and explicitly run amc budgets sign to approve ALLOW_WITH_WARNING");
        }
        if (usage.daily.llmTokens >= budget.daily.maxLlmTokens || usage.minute.llmTokens >= budget.perMinute.maxLlmTokens) {
          throw new NativeBudgetRefusal("native model token budget exhausted");
        }
        if (usage.daily.llmCostUsd >= budget.daily.maxCostUsd) throw new NativeBudgetRefusal("known model cost subtotal exhausted the signed budget");
        // Unpriced requests remain explicitly unknown in status. Never invent
        // prices or describe this lower-bound check as a hard USD ceiling.
      }
      const sessionId = `native-budget-${randomUUID()}`;
      const reservationKey = spend.kind === "llm" ? `llm:${spend.nativeSessionId}:${spend.headerEventId}` : `tool:${spend.nativeSessionId}:${spend.toolToken}`;
      if (rows.some(row => row.event_type === "audit" && JSON.parse(row.meta_json).reservationKey === reservationKey)) throw new NativeBudgetRefusal("native dispatch was already reserved");
      const meta = { auditType: NATIVE_BUDGET_RESERVATION, agentId: owner, trustTier: "OBSERVED", reservationKey, ...spend };
      ledger.startSession({ sessionId, runtime: "amc", binaryPath: "amc-native-budget-admission", binarySha256: sha256Hex("amc-native-budget-admission-v1") });
      ledger.appendEvidence({ sessionId, runtime: "amc", eventType: "audit", payload: JSON.stringify(meta), payloadExt: "json", meta });
      ledger.sealSession(sessionId);
    }).immediate();
  } finally { ledger.close(); }
}

export function reserveNativeModelBudget(session: SessionService, headerEventId: string): void {
  reserve(session.workspace, { kind: "llm", nativeSessionId: session.sessionId, headerEventId });
}

export function reserveNativeToolBudget(execution: ToolExecution, sessionId: string): string | undefined {
  if (execution.effectiveMode !== "EXECUTE") return undefined;
  if (execution.signal?.aborted) return "native tool cancelled before budget admission";
  try {
    reserve(execution.workspace, { kind: "tool", nativeSessionId: sessionId, toolToken: execution.token, callId: execution.callId, actionClass: execution.actionClass }, execution.agentId);
    return undefined;
  } catch (error) { return error instanceof Error ? error.message : "native budget admission failed"; }
}
