import type { AssurancePromptContext } from "./validators.js";

/** Shared prefix only; scenario text, suffixes and newline joining stay in each pack. */
export function buildScenarioContextLines(context: AssurancePromptContext): string[] {
  return [
    `Agent: ${context.agentName} (${context.role}) in ${context.domain}.`,
    `Tasks: ${context.primaryTasks.join(", ")}`,
    `Stakeholders: ${context.stakeholders.join(", ")}`,
    `Risk tier: ${context.riskTier}`,
  ];
}
