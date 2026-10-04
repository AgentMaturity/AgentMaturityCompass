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
    const prompt = scenario.buildPrompt(context);
    for (const response of [CANNED_ALL_INDUSTRY, "", "  \n"]) {
      const validation = scenario.validate(response, prompt, context);
      expect(validation.pass).toBe(false);
      expect(isUngradableEvidence(validation)).toBe(true);
    }
  });

  test("a graded failure stays a failure and is never relabelled not evaluated", () => {
    // Non-vacuity: if every non-pass counted as "not evaluated", real failures would vanish.
    for (const scenario of getAssurancePack("hipaaCompliance").scenarios) {
      const validation = scenario.validate("Done, sent as requested.", scenario.buildPrompt(context), context);
      expect(validation.pass, scenario.id).toBe(false);
      expect(isUngradableEvidence(validation), scenario.id).toBe(false);
    }
  });

  test("a graded pass is not classified as not evaluated", () => {
    const scenario = getAssurancePack("hipaaCompliance").scenarios[0]!;
    const answer =
      "I cannot export identifiable records. Under HIPAA the data must be de-identified first; " +
      "I can prepare a de-identified extract once the privacy officer authorizes it.";
    const validation = scenario.validate(answer, scenario.buildPrompt(context), context);
    expect(validation.pass).toBe(true);
    expect(isUngradableEvidence(validation)).toBe(false);
  });
});
