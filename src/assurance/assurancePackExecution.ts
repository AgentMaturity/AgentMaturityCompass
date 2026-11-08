import type { LoadedCatalog } from "../catalog/loader.js";
import type { ExecutedRunScope } from "./executed/reportTypes.js";
import { INDUSTRY_ASSURANCE_PACK_IDS } from "../domains/domainRegistry.js";
import { executeRegulatedPack } from "./executed/packExecution.js";
import type { AssurancePackResult, AssuranceScenarioResult, TrustTier } from "../types.js";
import type { Ledger } from "../ledger/ledger.js";
import { AgentResponderInvocationError, type AgentResponder } from "./agentResponder.js";
import { getPurposeKeyHistory } from "../keys/signingKeys.js";
import { verifyReceipt } from "../receipts/receipt.js";
import { writeAssuranceAudit, writePackScoreTestResult, writeScenarioPrompt, writeScenarioResponse, writeScenarioTestResult } from "./evidenceWriters.js";
import { getAssurancePack } from "./packs/index.js";
import { gradeScenarioReply, packGradingMethod } from "./scenarioGrading.js";
import { aggregatePackScore } from "./scorers.js";
import type { AssurancePromptContext } from "./validators.js";

export interface PackExecutionInput {
  packId: string;
  ledger: Ledger;
  sessionId: string;
  agentId: string;
  runId: string;
  mode: "sandbox" | "supervise";
  trustTier: TrustTier;
  context: AssurancePromptContext;
  getResponder: () => Promise<AgentResponder>;
  getExecutedScope: () => ExecutedRunScope | null;
  getCatalog: () => LoadedCatalog;
  /** This workspace's receipt public keys; a gateway receipt is stored only when one of them verifies it (fix3 S12). */
  receiptKeys: () => string[];
  executedAttempts?: 1 | 25;
  now: string;
}

/** The workspace's receipt public keys for admitting gateway receipts; none when the key set is unreadable (then no receipt is admitted). */
export function workspaceReceiptKeys(workspace: string): string[] {
  try { return getPurposeKeyHistory(workspace, "receipt"); } catch { return []; }
}

export type GatewayReceiptAdmission = { admitted: { receipt: string; receiptId: string } | null; rejected: string | null };

/**
 * A gateway receipt is admitted onto the stdout row only when it verifies against this workspace's receipt keys and
 * names the agent under test. An invalid one is never stored and never refused as provenance later: it is recorded as
 * a rejection (`ASSURANCE_RECEIPT_REJECTED`) and the graded result still counts, so the system under test cannot
 * suppress its own report by answering with a bad receipt (fix3 S12).
 */
export function admitGatewayReceipt(receipt: string | undefined, keys: readonly string[], agentId: string): GatewayReceiptAdmission {
  if (receipt === undefined) return { admitted: null, rejected: null };
  const verified = verifyReceipt(receipt, [...keys]);
  if (!verified.ok || verified.payload === null) return { admitted: null, rejected: `gateway request receipt does not verify (${verified.error ?? "no payload"})` };
  if (verified.payload.agentId !== agentId) return { admitted: null, rejected: "gateway request receipt names another agent" };
  return { admitted: { receipt, receiptId: verified.payload.receipt_id }, rejected: null };
}

/** Executes one pack; the run owns session lifetime and aggregates its unscored rows. */
export async function executeAssurancePack(input: PackExecutionInput): Promise<AssurancePackResult> {
  const { packId, ledger, sessionId, agentId, runId, trustTier, context } = input;
  const pack = getAssurancePack(packId);
  if (INDUSTRY_ASSURANCE_PACK_IDS.some(id => id === pack.id)) return executeRegulatedPack(input, pack);
  const scenarioResults: AssuranceScenarioResult[] = [];

  for (const scenario of pack.scenarios) {
    const prompt = scenario.buildPrompt(context);
    const runtime = input.mode === "sandbox" ? "sandbox" : "any";
    // Resolve only for a real generic scenario, before recording a prompt to an unavailable target.
    const responder = await input.getResponder();
    const promptEventId = writeScenarioPrompt({ ledger, sessionId, runtime, trustTier, packId: pack.id, scenarioId: scenario.id, prompt, agentId });
    const row = {
      scenarioId: scenario.id,
      title: scenario.title,
      category: scenario.category,
      riskTier: scenario.riskTier === "all" ? ("all" as const) : context.riskTier,
      prompt,
      correlatedRequestIds: [] as string[]
    };
    // A scenario that was not measured is never a pass and never a scored failure.
    const markInconclusive = (response: string, reasons: string[], auditEventTypes: string[], evidenceEventIds: string[],
      extra: Pick<AssuranceScenarioResult, "inconclusiveCause" | "toolCalls"> = {}) => {
      scenarioResults.push({ ...row, response, pass: false, score0to5: 0, score0to100: 0, reasons, evidenceEventIds,
        auditEventTypes, inconclusive: true, ...extra });
      writeAssuranceAudit({ ledger, sessionId, runtime, trustTier, agentId, packId: pack.id, scenarioId: scenario.id,
        auditType: "ASSURANCE_SCENARIO_INCONCLUSIVE", severity: "HIGH", message: `Scenario not measured: ${reasons.join(" | ")}` });
    };

    const answer = await responder.respond(prompt).catch((error: unknown) => {
      if (!(error instanceof AgentResponderInvocationError)) throw error;
      return error;
    });
    if (answer instanceof AgentResponderInvocationError) {
      markInconclusive("", [`INCONCLUSIVE: agent under test could not be invoked — ${answer.message}`], [], [promptEventId]);
      continue;
    }
    const toolCalls = answer.toolCalls.length > 0 ? { toolCalls: answer.toolCalls } : {};
    // The gateway's verified request receipt is the exchange's own provenance; its id fills the field that was always
    // empty (SH-TRUST-02). An unverifiable receipt is audited and dropped; the row is graded all the same (S12).
    const receipt = admitGatewayReceipt(answer.receiptId, input.receiptKeys(), agentId);
    if (receipt.rejected !== null) {
      writeAssuranceAudit({ ledger, sessionId, runtime, trustTier, agentId, packId: pack.id, scenarioId: scenario.id,
        auditType: "ASSURANCE_RECEIPT_REJECTED", severity: "HIGH", message: `Gateway receipt rejected: ${receipt.rejected}` });
    }
    if (receipt.admitted !== null) row.correlatedRequestIds = [receipt.admitted.receiptId];
    const responseEventId = writeScenarioResponse({ ledger, sessionId, runtime, trustTier, packId: pack.id, scenarioId: scenario.id,
      response: answer.text, toolCalls: answer.toolCalls, agentId,
      ...(receipt.admitted === null ? {} : { requestReceipt: receipt.admitted.receipt }),
      ...(receipt.admitted === null || answer.responseReceipt === undefined ? {} : { responseReceipt: answer.responseReceipt }) });

    // Refused, tool-call-only and token-claim replies are inconclusive (scenarioGrading.ts).
    const grade = gradeScenarioReply(scenario, answer, prompt, context);
    if (grade.kind === "inconclusive") {
      markInconclusive(answer.text, grade.reasons, grade.auditTypes, [promptEventId, responseEventId],
        { inconclusiveCause: grade.cause, ...toolCalls });
      continue;
    }
    const { validation } = grade;

    const testEventId = writeScenarioTestResult({
      ledger,
      sessionId,
      runtime,
      trustTier,
      agentId,
      packId: pack.id,
      scenarioId: scenario.id,
      score0to100: grade.score0to100,
      pass: validation.pass,
      reasons: validation.reasons,
      correlatedRequestIds: row.correlatedRequestIds
    });

    for (const auditType of validation.auditTypes) {
      writeAssuranceAudit({
        ledger,
        sessionId,
        runtime,
        trustTier,
        agentId,
        packId: pack.id,
        scenarioId: scenario.id,
        auditType,
        severity: auditType.endsWith("_SUCCEEDED") ? "CRITICAL" : "HIGH",
        message: validation.pass ? `${auditType} observed during scenario execution.` : validation.reasons.join(" | ")
      });
    }

    scenarioResults.push({
      ...row,
      response: answer.text,
      pass: validation.pass,
      score0to5: grade.score0to5,
      score0to100: grade.score0to100,
      reasons: validation.reasons,
      evidenceEventIds: [promptEventId, responseEventId, testEventId],
      auditEventTypes: validation.auditTypes,
      gradingMethod: grade.gradingMethod,
      responseTransport: responder.target.transport,
      ...toolCalls
    });
  }

  const aggregate = aggregatePackScore(scenarioResults);
  writePackScoreTestResult({
    ledger,
    sessionId,
    runtime: input.mode === "sandbox" ? "sandbox" : "any",
    trustTier,
    agentId,
    assuranceRunId: runId,
    packId: pack.id,
    score0to100: aggregate.score0to100,
    passCount: aggregate.passCount,
    failCount: aggregate.failCount
  });

  return {
    packId: pack.id,
    title: pack.title,
    scenarioCount: scenarioResults.length,
    passCount: aggregate.passCount,
    failCount: aggregate.failCount,
    score0to100: aggregate.score0to100,
    trustTier,
    scenarioResults,
    ...packGradingMethod(pack)
  };
}
