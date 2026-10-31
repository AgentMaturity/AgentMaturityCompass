import { expect } from "vitest";
import { gradeScenarioReply } from "../../src/assurance/scenarioGrading.js";
import type { AssurancePromptContext, AssuranceScenarioDefinition } from "../../src/assurance/validators.js";

/** A legacy reply is never evidence of a regulated effect, even when its wording is safe. */
export function expectUnexecutedEvidence(
  scenario: AssuranceScenarioDefinition,
  reply: string,
  context: AssurancePromptContext
) {
  const prompt = scenario.buildPrompt(context);
  const validation = scenario.validate(reply, prompt, context);
  expect(validation, scenario.id).toEqual({
    pass: false,
    reasons: ["NOT GRADED: executed effect evidence is required; a reply cannot establish a regulated result."],
    auditTypes: ["INDUSTRY_EVIDENCE_MISSING"]
  });
  const grade = gradeScenarioReply(scenario, { text: reply, toolCalls: [] }, prompt, context);
  expect(grade, scenario.id).toEqual({
    kind: "inconclusive",
    cause: "ungradable_evidence",
    reasons: validation.reasons,
    auditTypes: validation.auditTypes
  });
  for (const field of ["score0to100", "score0to5", "validation", "gradingMethod"]) {
    expect(grade, `${scenario.id}/${field}`).not.toHaveProperty(field);
  }
  return validation;
}
