/**
 * Red-team rows for effect-graded scenarios: the scenario is run with the strategy applied to the attack, with its
 * benign twin, and every exchange, rejected gateway receipt, result and audit event is written to the run's session the
 * same way the one-reply path writes them.
 */
import type { AgentResponder, AgentResponse } from "../assurance/agentResponder.js";
import { runEffectScenario } from "../assurance/effectGrading.js";
import { writeAssuranceAudit, writeScenarioPrompt, writeScenarioResponse, writeScenarioTestResult } from "../assurance/evidenceWriters.js";
import type { GatewayReceiptAdmission } from "../assurance/gatewayReceiptAdmission.js";
import type { AssurancePromptContext, AssuranceScenarioDefinition } from "../assurance/validators.js";
import type { Ledger } from "../ledger/ledger.js";
import type { AssuranceScenarioResult, TrustTier } from "../types.js";
import type { RedTeamStrategy } from "./strategies.js";

/** Where a red-team run writes its rows (null when it records nothing). */
export interface RedTeamRows { ledger: Ledger; sessionId: string; runtime: "any"; trustTier: TrustTier; agentId: string; source: "redteam" }

/** Writes an ASSURANCE_RECEIPT_REJECTED audit event when the reply's gateway receipt was refused. */
export function auditRejectedReceipt(rows: RedTeamRows | null, at: { packId: string; scenarioId: string }, receipt: GatewayReceiptAdmission): void {
  if (rows === null || receipt.rejected.length === 0) return;
  writeAssuranceAudit({ ...rows, ...at, auditType: "ASSURANCE_RECEIPT_REJECTED", severity: "HIGH", message: `Gateway receipt rejected: ${receipt.rejected.join(" | ")}` });
}

/** Why a strategy is not applied to a scenario, or null when it is. */
export function strategyNotApplied(scenario: AssuranceScenarioDefinition, strat: RedTeamStrategy): string | null {
  return scenario.effect?.taskInAttack === true && strat.id !== "direct"
    ? "not applied: this scenario's attack is in content the agent reads, so this strategy would only rewrite the user's own harmless request"
    : null;
}

type EffectRowResult = Pick<AssuranceScenarioResult, "response" | "pass" | "score0to5" | "score0to100" | "reasons" | "auditEventTypes" |
  "inconclusive" | "gradingMethod" | "effect" | "responseTransport" | "evidenceEventIds" | "correlatedRequestIds">;

/** One effect-graded scenario under one strategy (one try and its benign twin), with its rows written. */
export async function runEffectRedTeamRow(params: { scenario: AssuranceScenarioDefinition; strat: RedTeamStrategy; context: AssurancePromptContext;
  responder: AgentResponder; rows: RedTeamRows | null; at: { packId: string; scenarioId: string }; promptEventId: string | null; agentId: string;
  admitReceipts: (answer: AgentResponse, agentId: string) => GatewayReceiptAdmission }): Promise<EffectRowResult> {
  const { rows, at } = params;
  const exchanges: string[] = [], correlatedRequestIds: string[] = [];
  const record = (prompt: string, answer: AgentResponse) => {
    const receipt = params.admitReceipts(answer, params.agentId);
    auditRejectedReceipt(rows, at, receipt);
    if (receipt.request !== null) correlatedRequestIds.push(receipt.request.receiptId);
    if (rows !== null) exchanges.push(writeScenarioPrompt({ ...rows, ...at, prompt }),
      writeScenarioResponse({ ...rows, ...at, response: answer.text, toolCalls: answer.toolCalls, gatewayReceipt: receipt }));
  };
  const attempts = 1;
  const run = await runEffectScenario(params.scenario.effect!, params.context, params.responder,
    { attempts, transform: params.strat.transform, warmUp: params.strat.warmUp, record });
  const { summary, outcome } = run;
  const effect = { ...summary, attempts };
  const prompt = params.promptEventId === null ? [] : [params.promptEventId];
  // Provenance reads the first stdin, stdout and test rows (reportProvenance.ts); the rest follow.
  const ids = (test: string[]) => [...exchanges.slice(0, 2), ...test, ...prompt, ...exchanges.slice(2)];
  const response = run.last?.text ?? "";
  if (outcome.inconclusive) {
    if (rows !== null) writeAssuranceAudit({ ...rows, ...at, auditType: "REDTEAM_SCENARIO_INCONCLUSIVE", severity: "HIGH", message: `Attack not measured: ${outcome.reasons.join(" | ")}` });
    return { response, pass: false, score0to5: 0, score0to100: 0, reasons: outcome.reasons, auditEventTypes: [], inconclusive: true, effect,
      evidenceEventIds: ids([]), correlatedRequestIds };
  }
  const { pass, reasons, auditTypes, score0to100, score0to5 } = outcome;
  const test = rows === null ? [] : [writeScenarioTestResult({ ...rows, ...at, score0to100, pass, reasons, correlatedRequestIds })];
  for (const auditType of rows === null ? [] : auditTypes) {
    writeAssuranceAudit({ ...rows!, ...at, auditType, severity: auditType.endsWith("_SUCCEEDED") ? "CRITICAL" : "HIGH",
      message: pass ? `${auditType} observed during red-team execution.` : reasons.join(" | ") });
  }
  return { response, pass, score0to5, score0to100, reasons, auditEventTypes: auditTypes, gradingMethod: "structured", effect,
    responseTransport: params.responder.target.transport, evidenceEventIds: ids(test), correlatedRequestIds };
}
