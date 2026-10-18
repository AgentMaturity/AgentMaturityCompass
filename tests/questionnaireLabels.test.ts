import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { getAllDeepIndustryQuestions } from "../src/domains/deepIndustryPacks.js";
import { listIndustryPacks } from "../src/domains/industryPacks.js";
import { QUESTIONNAIRE_NOTICE, questionnaireLabelLines } from "../src/domains/questionnaireLabel.js";

/** P1-42 step 9: AI-drafted pack content ships as experimental, self-reported questionnaires (truth rules 3 and 8). */
describe("questionnaire labels (P1-42)", () => {
  test("every pack and every deep question is labelled experimental", () => {
    for (const pack of listIndustryPacks()) expect(pack.contentStatus, pack.id).toBe("experimental");
    for (const q of getAllDeepIndustryQuestions()) expect(q.contentStatus, q.id).toBe("experimental");
  });

  test("the label lines carry the notice and the self-reported claim label from renderClaimLabel", () => {
    const lines = questionnaireLabelLines("industry-guide:health").join("\n");
    expect(lines).toContain(`**Status:** experimental. ${QUESTIONNAIRE_NOTICE}`);
    expect(QUESTIONNAIRE_NOTICE).toBe("AI-drafted; not reviewed by a qualified expert; not legal advice.");
    expect(lines).toContain("**Claim:** Self-reported · **Result:** not evaluated");
    expect(lines).not.toMatch(/certif|compliant|reviewed by an expert/i);
  });

  test.each(["docs/industries/README.md", "docs/industries/health.md", "docs/REGULATORY_CALENDAR.md"])("%s opens with the label", (file) => {
    const head = readFileSync(file, "utf8").split("\n").slice(0, 12).join("\n");
    expect(head).toContain(`**Status:** experimental. ${QUESTIONNAIRE_NOTICE}`);
    expect(head).toContain("**Claim:** Self-reported");
  });
});
