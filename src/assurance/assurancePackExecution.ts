import type { LoadedCatalog } from "../catalog/loader.js";
import type { ExecutedRunScope } from "./executed/reportTypes.js";
import { INDUSTRY_ASSURANCE_PACK_IDS } from "../domains/domainRegistry.js";
import { executeRegulatedPack } from "./executed/packExecution.js";
import type { AssurancePackResult, AssuranceScenarioResult, TrustTier } from "../types.js";
import type { Ledger } from "../ledger/ledger.js";
import { AgentResponderInvocationError, type AgentResponder, type AgentResponse } from "./agentResponder.js";
import type { GatewayReceiptAdmission } from "./gatewayReceiptAdmission.js";
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
  /** The run's gateway receipt admission (`gatewayReceiptAdmitter`): only a receipt bound to its exchange is stored (fix3 S12, S12c). */
  admitReceipts: (answer: AgentResponse, agentId: string) => GatewayReceiptAdmission;
  executedAttempts?: 1 | 25;
  now: string;
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
    // A gateway receipt bound to this exchange is its own provenance; its id fills the field that was always empty
    // (SH-TRUST-02). A forged or replayed one is audited and dropped; the row is graded all the same (S12, S12c).
    const receipt = input.admitReceipts(answer, agentId);
    if (receipt.rejected.length > 0) {
      writeAssuranceAudit({ ledger, sessionId, runtime, trustTier, agentId, packId: pack.id, scenarioId: scenario.id,
        auditType: "ASSURANCE_RECEIPT_REJECTED", severity: "HIGH", message: `Gateway receipt rejected: ${receipt.rejected.join(" | ")}` });
    }
    if (receipt.request !== null) row.correlatedRequestIds = [receipt.request.receiptId];
    const responseEventId = writeScenarioResponse({ ledger, sessionId, runtime, trustTier, packId: pack.id, scenarioId: scenario.id,
      response: answer.text, toolCalls: answer.toolCalls, agentId,
      ...(receipt.request === null ? {} : { requestReceipt: receipt.request.receipt }),
      ...(receipt.response === null ? {} : { responseReceipt: receipt.response }) });

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
