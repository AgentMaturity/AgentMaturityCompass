import type { AssurancePackResult } from "../../types.js";
import type { PackExecutionInput } from "../assurancePackExecution.js";
import type { AssurancePackDefinition } from "../validators.js";
import { compileLegacyScenario } from "./routes.js";
import { executeCompiledScenario, unavailableExecutedRow } from "./compiledExecution.js";

/** All canonical IDs survive. An unsupported row never resolves or calls the target. */
export async function executeRegulatedPack(input: PackExecutionInput, pack: AssurancePackDefinition): Promise<AssurancePackResult> {
  const catalog = input.getCatalog(), scenarioResults: AssurancePackResult["scenarioResults"] = [];
  for (const scenario of pack.scenarios) {
    const selected = compileLegacyScenario(pack.id, scenario.id, catalog, input.executedAttempts ?? 25);
    const row = selected.ok ? await executeCompiledScenario({ ledger: input.ledger, sessionId: input.sessionId,
      catalog, scope: input.getExecutedScope(), getResponder: input.getResponder, compiled: selected.compiled,
      now: input.now, seed: `${input.runId}:${scenario.id}` }) :
      unavailableExecutedRow({ scenarioId: scenario.id, reason: selected.reason });
    scenarioResults.push({ ...row, title: scenario.title, category: scenario.category,
      riskTier: scenario.riskTier === "all" ? "all" : input.context.riskTier });
  }
  return { packId: pack.id, title: pack.title, scenarioCount: scenarioResults.length, scenarioResults,
    passCount: 0, failCount: 0, score0to100: 0, trustTier: "SELF_REPORTED", gradingMethod: "executed", regulatedEligible: false };
}
