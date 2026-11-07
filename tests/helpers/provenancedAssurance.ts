import { join } from "node:path";
import { openLedger, type Ledger } from "../../src/ledger/ledger.js";
import { getAgentPaths } from "../../src/fleet/paths.js";
import { startAssuranceSession, writeScenarioPrompt, writeScenarioResponse, writeScenarioTestResult } from "../../src/assurance/evidenceWriters.js";
import { writeSealedReport } from "./sealedRun.js";

export interface ProvenancedScenario { scenarioId?: string; pass: boolean; score0to100?: number; inconclusive?: boolean; [key: string]: unknown }
export interface ProvenancedPack { packId: string; scenarios: ProvenancedScenario[]; score0to100?: number }

/**
 * Writes the stdin/stdout/test rows of each scenario into a fresh sealed `amc-assurance-runner` session, as the runner
 * does, and returns the rows with their `evidenceEventIds` filled (SH-TRUST-02). Extra fields on a scenario are kept.
 */
export function backScenarioRows(workspace: string, params: { agentId?: string; packId: string; scenarios: ProvenancedScenario[] }):
  { sessionId: string; scenarioResults: Array<Record<string, unknown>> } {
  const agentId = params.agentId ?? "default";
  const ledger = openLedger(workspace);
  try {
    const sessionId = startAssuranceSession({ ledger, mode: "supervise", agentId, packIds: [params.packId], trustTier: "OBSERVED" });
    const scenarioResults = writeBackedRows(ledger, sessionId, agentId, params.packId, params.scenarios);
    ledger.sealSession(sessionId);
    return { sessionId, scenarioResults };
  } finally {
    ledger.close();
  }
}

function writeBackedRows(ledger: Ledger, sessionId: string, agentId: string, packId: string, scenarios: ProvenancedScenario[]): Array<Record<string, unknown>> {
  return scenarios.map((scenario, index) => {
    const scenarioId = scenario.scenarioId ?? `s${index + 1}`;
    const prompt = `prompt ${scenarioId}`, response = `response ${scenarioId}`;
    const common = { ledger, sessionId, runtime: "any" as const, trustTier: "OBSERVED" as const, packId, scenarioId, agentId };
    const promptId = writeScenarioPrompt({ ...common, prompt });
    const responseId = writeScenarioResponse({ ...common, response });
    const base = { title: scenarioId, category: packId, riskTier: "all", prompt, response, reasons: [], correlatedRequestIds: [], auditEventTypes: [], ...scenario, scenarioId };
    if (scenario.inconclusive) {
      return { ...base, pass: false, score0to5: 0, score0to100: 0, evidenceEventIds: [promptId, responseId], inconclusive: true };
    }
    const score = scenario.score0to100 ?? (scenario.pass ? 100 : 0);
    const testId = writeScenarioTestResult({ ...common, score0to100: score, pass: scenario.pass, reasons: [], correlatedRequestIds: [] });
    return { ...base, score0to5: Math.round(score / 20), score0to100: score, evidenceEventIds: [promptId, responseId, testId] };
  });
}

/**
 * Writes an assurance report the way the runner leaves it: every graded row backed by a sealed runner session, the
 * report naming that session, then sealed with the artifact-seal key. `extra` is spread over the report last, so a test
 * can still make it stale, INVALID or another agent's.
 */
export function writeProvenancedAssuranceReport(workspace: string, params: {
  name: string; agentId?: string; ts?: number; packs: ProvenancedPack[]; extra?: Record<string, unknown>;
}): { file: string; sessionId: string; report: Record<string, unknown> } {
  const agentId = params.agentId ?? "default", ts = params.ts ?? Date.now();
  const ledger = openLedger(workspace);
  let sessionId: string;
  let packResults: Array<{ packId: string; title: string; scenarioCount: number; passCount: number; failCount: number; score0to100: number;
    trustTier: string; scenarioResults: Array<Record<string, unknown>>; gradingMethod: string; regulatedEligible: boolean }>;
  try {
    sessionId = startAssuranceSession({ ledger, mode: "supervise", agentId, packIds: params.packs.map((pack) => pack.packId), trustTier: "OBSERVED" });
    packResults = params.packs.map((pack) => {
      const scenarioResults = writeBackedRows(ledger, sessionId, agentId, pack.packId, pack.scenarios);
      const graded = scenarioResults.filter((row) => row.inconclusive !== true);
      const passCount = graded.filter((row) => row.pass === true).length, failCount = graded.length - passCount;
      return { packId: pack.packId, title: pack.packId, scenarioCount: scenarioResults.length, passCount, failCount,
        score0to100: pack.score0to100 ?? (graded.length === 0 ? 0 : Math.round((passCount / graded.length) * 100)), trustTier: "OBSERVED",
        scenarioResults, gradingMethod: "structured", regulatedEligible: true };
    });
    ledger.sealSession(sessionId);
  } finally {
    ledger.close();
  }
  const inconclusive = packResults.reduce((sum, pack) => sum + pack.scenarioResults.filter((row) => row.inconclusive === true).length, 0);
  const total = packResults.reduce((sum, pack) => sum + pack.scenarioResults.length, 0);
  const report: Record<string, unknown> = {
    assuranceRunId: params.name, agentId, sessionId, ts, mode: "supervise", windowStartTs: ts - 1000, windowEndTs: ts, trustTier: "OBSERVED",
    status: "VALID", verificationPassed: true, packResults,
    overallScore0to100: packResults.length === 0 ? 0 : Math.round(packResults.reduce((sum, pack) => sum + pack.score0to100, 0) / packResults.length),
    integrityIndex: 0.8, trustLabel: "HIGH", evidenceStatus: total === 0 || inconclusive >= total ? "INSUFFICIENT_EVIDENCE" : "MEASURED",
    inconclusiveScenarioCount: inconclusive, ...params.extra
  };
  const dir = join(getAgentPaths(workspace, agentId).reportsDir, "assurance");
  return { file: writeSealedReport(workspace, dir, params.name, report), sessionId, report };
}
