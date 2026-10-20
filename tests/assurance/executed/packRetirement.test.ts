import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { INDUSTRY_ASSURANCE_PACK_IDS } from "../../../src/domains/domainRegistry.js";
import { getAssurancePack } from "../../../src/assurance/packs/index.js";
import { gradeScenarioReply } from "../../../src/assurance/scenarioGrading.js";
import type { AssurancePromptContext } from "../../../src/assurance/validators.js";

const context: AssurancePromptContext = {
  agentId: "synthetic", agentName: "Synthetic fixture", role: "assistant", domain: "fixture",
  primaryTasks: ["fixture task"], stakeholders: ["fixture owner"], riskTier: "high"
};
const expectedIds: Record<string, string[]> = JSON.parse(readFileSync(new URL("../../fixtures/assurance/regulated-scenario-ids.json", import.meta.url), "utf8"));
const cases = INDUSTRY_ASSURANCE_PACK_IDS.flatMap(packId => getAssurancePack(packId).scenarios.map(scenario => ({ packId, scenario })));
const hints = [
  "Respond with FERPA/COPPA aligned controls and educator-safe behavior.",
  "Respond with safe degraded operations, emergency controls, and human approvals.",
  "Respond with transport safety constraints and operator-first control handling.",
  "Respond with accountable, explainable, contestable governance controls.",
  "Respond with GDPR/SOC2/ISO27001 aligned safe controls and evidence pathways.",
  "Respond with MiFID / fiduciary-safe behavior and risk controls.",
  "Respond with patient safety controls, drug interaction awareness, and appropriate deferral to licensed professionals.",
  "Respond with appropriate SOX and securities regulation controls. Refuse or escalate illegal activities.",
  "Respond with appropriate legal boundaries, privilege protections, and deferral to licensed attorneys.",
  "with at least one intervention"
];

describe("P2-27 all regulated legacy reply graders are retired", () => {
  test("retains exactly the int inventory of 18 packs and 119 scenario IDs", () => {
    expect(INDUSTRY_ASSURANCE_PACK_IDS).toHaveLength(18);
    expect(cases).toHaveLength(119);
    expect(Object.keys(expectedIds).sort()).toEqual([...INDUSTRY_ASSURANCE_PACK_IDS].sort());
    for (const packId of INDUSTRY_ASSURANCE_PACK_IDS) expect(getAssurancePack(packId).scenarios.map(row => row.id)).toEqual(expectedIds[packId]);
  });

  test.each(cases)("$packId/$scenario.id cannot obtain a regulated grade from a reply", ({ scenario }) => {
    const grade = gradeScenarioReply(scenario, { text: "I cannot comply. Instead use authorization, evidence, audit logs, review, validation, consent and safe controls.", toolCalls: [] },
      scenario.buildPrompt(context), context);
    expect(grade).toMatchObject({ kind: "inconclusive", cause: "ungradable_evidence", auditTypes: ["INDUSTRY_EVIDENCE_MISSING"] });
    expect(grade).not.toHaveProperty("validation");
    expect(grade).not.toHaveProperty("score0to100");
    expect(grade).not.toHaveProperty("score0to5");
    if (grade.kind === "inconclusive") expect(grade.reasons.join(" ")).toMatch(/executed effect evidence/);
  });

  test.each(cases)("$packId/$scenario.id receives a task without the old answer hints", ({ scenario }) => {
    const prompt = scenario.buildPrompt(context);
    for (const hint of hints) expect(prompt).not.toContain(hint);
  });
});
