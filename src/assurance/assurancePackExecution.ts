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
import type { AssurancePromptContext, AssuranceScenarioDefinition } from "./validators.js";
import { describeEffectSummary, runEffectScenario } from "./effectGrading.js";
import { scenarioScoreFromValidation } from "./scorers.js";

/** Tries per effect-graded scenario when the caller names none (NIST CAISI repeats; 25 is the thorough setting). */
export const DEFAULT_EFFECT_ATTEMPTS = 5;

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
  /** The run's gateway receipt admission (`gatewayReceiptAdmitter`). */
  admitReceipts: (answer: AgentResponse, agentId: string) => GatewayReceiptAdmission;
  executedAttempts?: 1 | 25;
  /** Tries per effect-graded scenario (default DEFAULT_EFFECT_ATTEMPTS). */
  attempts?: number;
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

    if (scenario.effect) {
      scenarioResults.push(await executeEffectScenario(input, scenario, responder, row, promptEventId, runtime));
      continue;
    }
    const answer = await responder.respond(prompt).catch((error: unknown) => {
      if (!(error instanceof AgentResponderInvocationError)) throw error;
      return error;
    });
    if (answer instanceof AgentResponderInvocationError) {
      markInconclusive("", [`INCONCLUSIVE: agent under test could not be invoked — ${answer.message}`], [], [promptEventId]);
      continue;
    }
    const toolCalls = answer.toolCalls.length > 0 ? { toolCalls: answer.toolCalls } : {};
    // Only a verified pair can supply a correlation id. Refused receipts are audited without affecting grading.
    const receipt = input.admitReceipts(answer, agentId);
    if (receipt.rejected.length > 0) {
      writeAssuranceAudit({ ledger, sessionId, runtime, trustTier, agentId, packId: pack.id, scenarioId: scenario.id,
        auditType: "ASSURANCE_RECEIPT_REJECTED", severity: "HIGH", message: `Gateway receipt rejected: ${receipt.rejected.join(" | ")}` });
    }
    if (receipt.request !== null) row.correlatedRequestIds = [receipt.request.receiptId];
    const responseEventId = writeScenarioResponse({ ledger, sessionId, runtime, trustTier, packId: pack.id, scenarioId: scenario.id,
      response: answer.text, toolCalls: answer.toolCalls, agentId, gatewayReceipt: receipt });

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

type ScenarioRow = Pick<AssuranceScenarioResult, "scenarioId" | "title" | "category" | "riskTier" | "prompt" | "correlatedRequestIds">;

/** Repeated attack and benign tries on fresh fixtures; every exchange is recorded, the summary is one row. */
async function executeEffectScenario(input: PackExecutionInput, scenario: AssuranceScenarioDefinition, responder: AgentResponder,
  row: ScenarioRow, promptEventId: string, runtime: "sandbox" | "any"): Promise<AssuranceScenarioResult> {
  const { ledger, sessionId, agentId, trustTier, packId } = input;
  const exchangeIds: string[] = [];
  const record = (prompt: string, answer: AgentResponse) => {
    const receipt = input.admitReceipts(answer, agentId);
    if (receipt.request !== null) row.correlatedRequestIds.push(receipt.request.receiptId);
    exchangeIds.push(writeScenarioPrompt({ ledger, sessionId, runtime, trustTier, packId, scenarioId: scenario.id, prompt, agentId }),
      writeScenarioResponse({ ledger, sessionId, runtime, trustTier, packId, scenarioId: scenario.id, response: answer.text,
        toolCalls: answer.toolCalls, agentId, gatewayReceipt: receipt }));
  };
  const attempts = input.attempts ?? DEFAULT_EFFECT_ATTEMPTS;
  const run = await runEffectScenario(scenario.effect!, input.context, responder, { attempts, record });
  const { summary } = run;
  // Provenance reads the first stdin, stdout and test rows (reportProvenance.ts); the rest follow.
  const evidenceEventIds = [...exchangeIds.slice(0, 2), promptEventId, ...exchangeIds.slice(2)];
  const effect = { attempts, measured: summary.measured, attackSuccesses: summary.attackSuccesses,
    attackSuccessRate: summary.attackSuccessRate, wilson95: summary.wilson95, benign: summary.benign, underAttack: summary.underAttack };
  const complete = summary.measured === attempts && summary.benign.measured === attempts;
  if (summary.measured === 0 || (run.validation.pass && !complete)) {
    const reasons = [`INCONCLUSIVE: only ${summary.measured} of ${attempts} attack tries and ${summary.benign.measured} of ${attempts} ordinary tries reached the agent` +
      (run.errors[0] ? ` — ${run.errors[0]}` : "")];
    writeAssuranceAudit({ ledger, sessionId, runtime, trustTier, agentId, packId, scenarioId: scenario.id,
      auditType: "ASSURANCE_SCENARIO_INCONCLUSIVE", severity: "HIGH", message: `Scenario not measured: ${reasons.join(" | ")}` });
    return { ...row, response: run.last?.text ?? "", pass: false, score0to5: 0, score0to100: 0, reasons, evidenceEventIds,
      auditEventTypes: [], inconclusive: true, effect };
  }
  const validation = run.validation;
  const score = scenarioScoreFromValidation(validation.pass, validation.reasons.length);
  const testEventId = writeScenarioTestResult({ ledger, sessionId, runtime, trustTier, agentId, packId, scenarioId: scenario.id,
    score0to100: score.score0to100, pass: validation.pass, reasons: [describeEffectSummary(summary), ...validation.reasons],
    correlatedRequestIds: row.correlatedRequestIds });
  evidenceEventIds.splice(2, 0, testEventId);
  for (const auditType of validation.auditTypes) {
    writeAssuranceAudit({ ledger, sessionId, runtime, trustTier, agentId, packId, scenarioId: scenario.id, auditType,
      severity: auditType.endsWith("_SUCCEEDED") ? "CRITICAL" : "HIGH", message: describeEffectSummary(summary) });
  }
  return { ...row, response: run.last?.text ?? "", pass: validation.pass, ...score, reasons: validation.reasons, evidenceEventIds,
    auditEventTypes: validation.auditTypes, gradingMethod: "structured", responseTransport: responder.target.transport, effect,
    ...(run.last && run.last.toolCalls.length > 0 ? { toolCalls: run.last.toolCalls } : {}) };
}
