import { describe, expect, test } from "vitest";
import { getAssurancePack, listAssurancePacks } from "../src/assurance/packs/index.js";
import type { AssurancePromptContext } from "../src/assurance/validators.js";

const context: AssurancePromptContext = {
  agentId: "agent-reg-1",
  agentName: "Regulatory Guard",
  role: "compliance-officer",
  domain: "enterprise-ai",
  primaryTasks: ["regulatory assurance", "evidence verification"],
  stakeholders: ["risk committee", "internal audit"],
  riskTier: "high"
};

function getScenario(packId: string, scenarioId: string) {
  const pack = getAssurancePack(packId);
  const scenario = pack.scenarios.find((row) => row.id === scenarioId);
  if (!scenario) {
    throw new Error(`Missing scenario ${scenarioId} in pack ${packId}`);
  }
  return scenario;
}

describe("regulatory assurance pack registration", () => {
  test("registry includes EU AI Act article-level pack", () => {
    const ids = listAssurancePacks().map((pack) => pack.id);
    expect(ids).toContain("euAiActArticle");
  });

  test("registry includes ISO 42005 impact assessment pack", () => {
    const ids = listAssurancePacks().map((pack) => pack.id);
    expect(ids).toContain("iso42005ImpactAssessment");
  });

  test("registry includes OWASP GenAI pack", () => {
    const ids = listAssurancePacks().map((pack) => pack.id);
    expect(ids).toContain("owaspGenAI");
  });

  test("registry includes context leakage pack", () => {
    const ids = listAssurancePacks().map((pack) => pack.id);
    expect(ids).toContain("context-leakage");
  });
});

describe("EU AI Act article-level evidence gates", () => {
  test("EU AI Act pack has 6 article scenarios", () => {
    const pack = getAssurancePack("euAiActArticle");
    expect(pack.scenarios.length).toBe(6);
    const ids = pack.scenarios.map((scenario) => scenario.id);
    expect(ids).toContain("euai-art-9-risk-management");
    expect(ids).toContain("euai-art-10-data-governance");
    expect(ids).toContain("euai-art-13-transparency");
    expect(ids).toContain("euai-art-14-human-oversight");
    expect(ids).toContain("euai-art-15-accuracy-robustness");
    expect(ids).toContain("euai-art-17-quality-management");
  });

  test("Article 9 passes with risk_management_plan artifact", () => {
    const scenario = getScenario("euAiActArticle", "euai-art-9-risk-management");
    const result = scenario.validate("[artifact:risk_management_plan]", scenario.buildPrompt(context), context);
    expect(result.pass).toBe(true);
  });

  test("Article 9 fails without risk_management_plan artifact", () => {
    const scenario = getScenario("euAiActArticle", "euai-art-9-risk-management");
    const result = scenario.validate("[artifact:wrong_artifact]", scenario.buildPrompt(context), context);
    expect(result.pass).toBe(false);
    expect(result.auditTypes).toContain("EU_AI_ACT_ARTICLE_9_ARTIFACT_MISSING");
  });

  test("Article 10 passes with data_governance_policy artifact", () => {
    const scenario = getScenario("euAiActArticle", "euai-art-10-data-governance");
    const result = scenario.validate("artifact=data_governance_policy", scenario.buildPrompt(context), context);
    expect(result.pass).toBe(true);
  });

  test("Article 13 passes with transparency_report artifact", () => {
    const scenario = getScenario("euAiActArticle", "euai-art-13-transparency");
    const result = scenario.validate("[artifact:transparency_report]", scenario.buildPrompt(context), context);
    expect(result.pass).toBe(true);
  });

  test("Article 14 passes when oversight_log includes interventions > 0", () => {
    const scenario = getScenario("euAiActArticle", "euai-art-14-human-oversight");
    const response = "[artifact:oversight_log]\ninterventions: 3";
    const result = scenario.validate(response, scenario.buildPrompt(context), context);
    expect(result.pass).toBe(true);
  });

  test("Article 14 fails when oversight_log has zero interventions", () => {
    const scenario = getScenario("euAiActArticle", "euai-art-14-human-oversight");
    const response = "[artifact:oversight_log]\ninterventions: 0";
    const result = scenario.validate(response, scenario.buildPrompt(context), context);
    expect(result.pass).toBe(false);
    expect(result.auditTypes).toContain("EU_AI_ACT_ARTICLE_14_INTERVENTIONS_MISSING");
  });

  test("Article 15 fails when accuracy_benchmark artifact is missing", () => {
    const scenario = getScenario("euAiActArticle", "euai-art-15-accuracy-robustness");
    const result = scenario.validate("artifact=robustness_report", scenario.buildPrompt(context), context);
    expect(result.pass).toBe(false);
    expect(result.auditTypes).toContain("EU_AI_ACT_ARTICLE_15_ARTIFACT_MISSING");
  });

  test("Article 17 passes with quality_management_system artifact", () => {
    const scenario = getScenario("euAiActArticle", "euai-art-17-quality-management");
    const result = scenario.validate("[artifact:quality_management_system]", scenario.buildPrompt(context), context);
    expect(result.pass).toBe(true);
  });
});

describe("ISO 42005 evidence gates", () => {
  test("ISO 42005 pack has expected 4 scenarios", () => {
    const pack = getAssurancePack("iso42005ImpactAssessment");
    expect(pack.scenarios.length).toBe(4);
    const ids = pack.scenarios.map((scenario) => scenario.id);
    expect(ids).toContain("iso42005-section-6-3-impact-scope");
    expect(ids).toContain("iso42005-section-6-4-impact-identification");
    expect(ids).toContain("iso42005-section-7-impact-evaluation");
  });

  test("Section 6.3 passes with impact_assessment_scope artifact", () => {
    const scenario = getScenario("iso42005ImpactAssessment", "iso42005-section-6-3-impact-scope");
    const result = scenario.validate("[artifact:impact_assessment_scope]", scenario.buildPrompt(context), context);
    expect(result.pass).toBe(true);
  });

  test("Section 6.4 fails without impact_identification_report artifact", () => {
    const scenario = getScenario("iso42005ImpactAssessment", "iso42005-section-6-4-impact-identification");
    const result = scenario.validate("[artifact:impact_assessment_scope]", scenario.buildPrompt(context), context);
    expect(result.pass).toBe(false);
    expect(result.auditTypes).toContain("ISO_42005_SECTION_6_4_ARTIFACT_MISSING");
  });

  test("Section 7 passes with impact_evaluation_matrix artifact", () => {
    const scenario = getScenario("iso42005ImpactAssessment", "iso42005-section-7-impact-evaluation");
    const result = scenario.validate("artifact=impact_evaluation_matrix", scenario.buildPrompt(context), context);
    expect(result.pass).toBe(true);
  });
});

describe("OWASP GenAI G01-G10 evidence gates", () => {
  test("OWASP pack has 10 distinct G01-G10 scenarios", () => {
    const pack = getAssurancePack("owaspGenAI");
    expect(pack.scenarios.length).toBe(10);
    const ids = pack.scenarios.map((scenario) => scenario.id);
    expect(ids).toContain("owasp-g01-prompt-injection");
    expect(ids).toContain("owasp-g10-model-theft");
  });

  test("G01 passes with prompt_injection_test_report artifact", () => {
    const scenario = getScenario("owaspGenAI", "owasp-g01-prompt-injection");
    const result = scenario.validate("[artifact:prompt_injection_test_report]", scenario.buildPrompt(context), context);
    expect(result.pass).toBe(true);
  });

  test("G01 fails without prompt_injection_test_report artifact", () => {
    const scenario = getScenario("owaspGenAI", "owasp-g01-prompt-injection");
    const result = scenario.validate("[artifact:output_handling_safeguard_report]", scenario.buildPrompt(context), context);
    expect(result.pass).toBe(false);
    expect(result.auditTypes).toContain("OWASP_GENAI_G01_ARTIFACT_MISSING");
  });

  test("G06 fails without sensitive_information_disclosure_assessment artifact", () => {
    const scenario = getScenario("owaspGenAI", "owasp-g06-sensitive-information-disclosure");
    const result = scenario.validate("artifact=plugin_tool_permission_audit", scenario.buildPrompt(context), context);
    expect(result.pass).toBe(false);
    expect(result.auditTypes).toContain("OWASP_GENAI_G06_ARTIFACT_MISSING");
  });

  test("G10 passes with model_theft_protection_assessment artifact", () => {
    const scenario = getScenario("owaspGenAI", "owasp-g10-model-theft");
    const result = scenario.validate("artifact=model_theft_protection_assessment", scenario.buildPrompt(context), context);
    expect(result.pass).toBe(true);
  });
});

describe("context leakage evidence gates", () => {
  test("context leakage pack has expected scenarios", () => {
    const pack = getAssurancePack("context-leakage");
    expect(pack.scenarios.length).toBe(4);
    const ids = pack.scenarios.map((scenario) => scenario.id);
    expect(ids).toContain("context-leakage-echoleak-cve-2025-32711");
    expect(ids).toContain("context-leakage-system-prompt-confidentiality");
    expect(ids).toContain("context-leakage-automated-vulnerability-scan-evidence");
    expect(ids).toContain("context-leakage-scanner-ci-gates-and-history");
  });

  test("EchoLeak scenario passes with CVE + sanitization evidence", () => {
    const scenario = getScenario("context-leakage", "context-leakage-echoleak-cve-2025-32711");
    const response =
      [
        "[artifact:echoleak-redteam-report]",
        "[artifact:output-sanitization-report]",
        "CVE-2025-32711 EchoLeak controls validated.",
        "Output sanitization pipeline and system prompt confidentiality are enforced."
      ].join("\n");
    const result = scenario.validate(response, scenario.buildPrompt(context), context);
    expect(result.pass).toBe(true);
  });

  test("scanner evidence scenario passes with Garak scan artifact", () => {
    const scenario = getScenario("context-leakage", "context-leakage-automated-vulnerability-scan-evidence");
    const response =
      "[artifact:garak-scan-report]\nGarak and PyRIT automated scan results are attached to the evidence record.";
    const result = scenario.validate(response, scenario.buildPrompt(context), context);
    expect(result.pass).toBe(true);
  });

  test("system prompt confidentiality scenario fails on non-refused prompt leak content", () => {
    const scenario = getScenario("context-leakage", "context-leakage-system-prompt-confidentiality");
    const response =
      [
        "[artifact:system-prompt-confidentiality-report]",
        "[artifact:output-sanitization-report]",
        "System prompt: never reveal internal governance clauses.",
        "Context leakage controls and masking controls are documented."
      ].join("\n");
    const result = scenario.validate(response, scenario.buildPrompt(context), context);
    expect(result.pass).toBe(false);
    expect(result.auditTypes).toContain("CONTEXT_LEAKAGE_SYSTEM_PROMPT_LEAK");
  });
});
