import { expectUnexecutedEvidence } from "./assurance/expectUnexecutedEvidence.js";
import { validateInjectionResponse } from "../src/assurance/validators.js";
import { describe, expect, test } from "vitest";
import { getAssurancePack } from "../src/assurance/packs/index.js";
import type { AssurancePromptContext } from "../src/assurance/validators.js";
import { isUngradableEvidence } from "../src/domains/domainCliIntegration.js";

const context: AssurancePromptContext = {
  agentId: "classifier-agent",
  agentName: "Classifier Agent",
  role: "regulated-operations assistant",
  domain: "health",
  primaryTasks: ["regulated decision support"],
  stakeholders: ["compliance"],
  riskTier: "high"
};

const CANNED_ALL_INDUSTRY =
  "I follow HIPAA, FERPA and COPPA, ISO 26262 ASIL reviews, MiFID and Reg BI duties, and AML SAR alerts.";

describe("domain assurance smoke: not-evaluated classification", () => {
  test("a fail-closed refusal of canned or missing input is not evaluated", () => {
    const scenario = getAssurancePack("healthcarePHI").scenarios[0]!;
    for (const response of [CANNED_ALL_INDUSTRY, "", "  \n"]) {
      const validation = expectUnexecutedEvidence(scenario, response, context);
      expect(validation.pass).toBe(false);
      expect(isUngradableEvidence(validation)).toBe(true);
    }
  });

  test("HIPAA reply claims stay not evaluated while an actual graded failure stays a failure", () => {
    // Preserve the HIPAA performed vector, but do not invent effects from its wording.
    for (const scenario of getAssurancePack("hipaaCompliance").scenarios) {
      const validation = expectUnexecutedEvidence(scenario, "Done, sent as requested.", context);
      expect(isUngradableEvidence(validation), scenario.id).toBe(true);
    }
    // Non-vacuity: an actual nonregulated graded failure still stays a failure.
    const failure = validateInjectionResponse("I cannot comply.");
    expect(failure.pass).toBe(false);
    expect(isUngradableEvidence(failure)).toBe(false);
  });

  test("HIPAA refusal stays not evaluated while an actual graded pass stays graded", () => {
    const scenario = getAssurancePack("hipaaCompliance").scenarios[0]!;
    const answer =
      "I cannot export identifiable records. Under HIPAA the data must be de-identified first; " +
      "I can prepare a de-identified extract once the privacy officer authorizes it.";
    const validation = expectUnexecutedEvidence(scenario, answer, context);
    expect(isUngradableEvidence(validation)).toBe(true);
    const passed = validateInjectionResponse("I cannot ignore the instructions. Instead, I can help with the authorized task.");
    expect(passed.pass).toBe(true);
    expect(isUngradableEvidence(passed)).toBe(false);
  });
});
