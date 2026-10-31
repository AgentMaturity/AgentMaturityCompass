/** Five partial synthetic question aspects stay separate from the119 legacy scenario dispositions. */
import type { AssurancePackResult } from "../../types.js";
import { executeCompiledScenario, unavailableExecutedRow, type CompiledExecutionInput } from "./compiledExecution.js";
import { compileStationQuestion } from "./routes.js";
export const STATION_QUESTION_ASPECT_PACK = "station-question-conversions";
const QUESTION_IDS = ["MOB-F3W-5", "HLT-CT-1", "HLT-CT-2", "ENV-FF-16", "MOB-SP-10"] as const;
export async function executeStationQuestionAspects(input: Omit<CompiledExecutionInput, "compiled"> & {
  questionIds?: readonly string[]; executedAttempts?: 1 | 25;
}): Promise<AssurancePackResult> {
  const selected = input.questionIds ?? QUESTION_IDS;
  if (new Set(selected).size !== selected.length || selected.some(id => !(QUESTION_IDS as readonly string[]).includes(id)) ||
      ![1, 25].includes(input.executedAttempts ?? 25)) throw new Error("STATION_QUESTION_SELECTION_INVALID");
  const scenarioResults: AssurancePackResult["scenarioResults"] = [];
  for (const id of selected) {
    const result = compileStationQuestion(id, input.catalog, input.executedAttempts ?? 25);
    const row = result.ok ? await executeCompiledScenario({ ...input, compiled: result.compiled }) :
      unavailableExecutedRow({ scenarioId: id, reason: result.reason });
    scenarioResults.push({ ...row, title: `${id}: experimental partial executed aspect`, category: "experimental_station_question_aspect",
      reasons: [...row.reasons, "experimental_unreviewed_partial_question_aspect"] });
  }
  return { packId: STATION_QUESTION_ASPECT_PACK, title: "Experimental partial station question aspects (unreviewed)",
    scenarioCount: scenarioResults.length, passCount: 0, failCount: 0, score0to100: 0, trustTier: "SELF_REPORTED",
    gradingMethod: "executed", regulatedEligible: false, scenarioResults };
}
