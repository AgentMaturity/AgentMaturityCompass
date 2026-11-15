import { describe, expect, it } from "vitest";
import { EU_AI_ACT_TIMELINE, classifyEuAiActRisk } from "../src/compliance/euAiActClassifier.js";
import { getRegisterEntry } from "../src/compliance/regulatory/index.js";

const euEntry = getRegisterEntry("eu-ai-act")!;
const registerDate = (id: string) => euEntry.keyDates.find((k) => k.id === id);

describe("EU AI Act classifier timeline parity with the register", () => {
  it("every classifier date equals the verified register date of the same id", () => {
    for (const [id, date] of Object.entries(EU_AI_ACT_TIMELINE)) {
      const entry = registerDate(id);
      expect(entry, `register keyDate ${id}`).toBeDefined();
      expect(entry!.verified).toBe(true);
      expect(date, id).toBe(entry!.date);
    }
  });

  it("the register has no EU AI Act date the classifier ignores", () => {
    expect(euEntry.keyDates.map((k) => k.id).sort()).toEqual(Object.keys(EU_AI_ACT_TIMELINE).sort());
  });

  it("encodes the post-omnibus high-risk dates (Art. 113(c))", () => {
    expect(EU_AI_ACT_TIMELINE.annexIIIHighRisk).toBe("2027-12-02");
    expect(EU_AI_ACT_TIMELINE.article6_1AnnexIHighRisk).toBe("2028-08-02");
  });
});

describe("classification carries the dates its obligations apply from", () => {
  it("Annex III high-risk applies from the Annex III date", () => {
    const result = classifyEuAiActRisk({ employment: true });
    expect(result.applicationDates).toEqual([
      { basis: "Art. 6(2) + Annex III", appliesFrom: EU_AI_ACT_TIMELINE.annexIIIHighRisk },
    ]);
  });

  it("Art. 6(1) product safety components apply from the Annex I date", () => {
    const result = classifyEuAiActRisk({ safetyComponent: true, education: true });
    expect(result.applicationDates).toEqual([
      { basis: "Art. 6(2) + Annex III", appliesFrom: EU_AI_ACT_TIMELINE.annexIIIHighRisk },
      { basis: "Art. 6(1) + Annex I", appliesFrom: EU_AI_ACT_TIMELINE.article6_1AnnexIHighRisk },
    ]);
  });

  it("prohibitions apply from 2 February 2025", () => {
    const result = classifyEuAiActRisk({ socialScoring: true });
    expect(result.applicationDates).toEqual([{ basis: "Art. 5", appliesFrom: EU_AI_ACT_TIMELINE.prohibitionsAndAiLiteracy }]);
  });

  it("Art. 50 transparency applies from the general application date", () => {
    const result = classifyEuAiActRisk({ chatbot: true });
    expect(result.applicationDates).toEqual([{ basis: "Art. 50", appliesFrom: EU_AI_ACT_TIMELINE.generalApplication }]);
  });

  it("minimal risk carries no application date", () => {
    expect(classifyEuAiActRisk({}).applicationDates).toEqual([]);
  });
});

describe("article citations match the enacted text", () => {
  it("real-time remote biometric identification is Art. 5(1)(h)", () => {
    expect(classifyEuAiActRisk({ realtimeBiometricPublicSpaces: true }).articles).toEqual(["Art. 5(1)(h)"]);
  });

  it("interacting with people is the Art. 50(1) disclosure, not the deep-fake rule", () => {
    const result = classifyEuAiActRisk({ humanInteraction: true });
    expect(result.articles).toEqual(["Art. 50(1)"]);
    expect(result.findings[0]!.title).not.toMatch(/deep-fake/i);
  });

  it("keeps the employment mapping callers depend on", () => {
    expect(classifyEuAiActRisk({ employment: true }).articles).toContain("Art. 6(2) + Annex III(4)");
  });
});

describe("EU AI Act classifier after Regulation (EU) 2026/1744", () => {
  it("keeps Art. 50 transparency findings for a high-risk agent", () => {
    const result = classifyEuAiActRisk({ employment: true, chatbot: true, syntheticContentGeneration: true });
    expect(result.riskTier).toBe("HIGH");
    expect(result.articles).toEqual(expect.arrayContaining(["Art. 6(2) + Annex III(4)", "Art. 50(1)", "Art. 50(2)"]));
    expect(result.applicationDates).toContainEqual({ basis: "Art. 50", appliesFrom: EU_AI_ACT_TIMELINE.generalApplication });
    expect(result.duties!.some((d) => d.role === "provider" && d.article === "Art. 50(2)")).toBe(true);
  });

  it("knows the prohibitions added as Art. 5(1)(ba) and (bb), applying from 2 December 2026", () => {
    const result = classifyEuAiActRisk({ nonConsensualIntimateImagery: true, childSexualAbuseMaterial: true });
    expect(result.riskTier).toBe("UNACCEPTABLE");
    expect(result.articles).toEqual(["Art. 5(1)(ba)", "Art. 5(1)(bb)"]);
    expect(result.applicationDates).toEqual([{ basis: "Art. 5(1)(ba)-(bb)", appliesFrom: "2026-12-02" }]);
    expect(result.duties!.filter((d) => d.article.startsWith("Art. 5(1)")).every((d) => d.appliesFrom === "2026-12-02")).toBe(true);
  });

  it("knows Art. 5(1)(d), (e) and (g)", () => {
    expect(classifyEuAiActRisk({ crimePredictionProfiling: true, facialImageScraping: true, sensitiveBiometricCategorisation: true }).articles)
      .toEqual(["Art. 5(1)(d)", "Art. 5(1)(e)", "Art. 5(1)(g)"]);
  });

  it("cites Art. 49 for registration, national registration for critical infrastructure, and never Art. 56", () => {
    const annexIII = classifyEuAiActRisk({ employment: true });
    expect(annexIII.remediation.map((r) => r.article)).toContain("Art. 49");
    expect(annexIII.remediation.map((r) => r.article)).not.toContain("Art. 71");
    expect(classifyEuAiActRisk({ criticalInfrastructure: true }).remediation.map((r) => r.article)).toContain("Art. 49(5)");
    expect(classifyEuAiActRisk({ safetyComponent: true }).remediation.map((r) => r.article)).not.toContain("Art. 49");
    const limited = classifyEuAiActRisk({ syntheticContentGeneration: true });
    expect(JSON.stringify(limited)).not.toContain("Art. 56");
    expect(limited.remediation.map((r) => r.article)).toContain("Art. 50(7)");
  });

  it("separates provider and deployer duties with the date each applies from", () => {
    const result = classifyEuAiActRisk({ employment: true, safetyComponent: true });
    const provider = result.duties!.filter((d) => d.role === "provider");
    const deployer = result.duties!.filter((d) => d.role === "deployer");
    expect(provider.map((d) => d.article)).toEqual(expect.arrayContaining(["Art. 4", "Art. 9", "Art. 43", "Art. 49(1)", "Art. 73"]));
    expect(deployer.map((d) => d.article)).toEqual(expect.arrayContaining(["Art. 4", "Art. 26", "Art. 27", "Art. 49(3)"]));
    expect(deployer.map((d) => d.article)).not.toContain("Art. 9");
    expect(result.duties!.find((d) => d.article === "Art. 26")!.appliesFrom).toBe(EU_AI_ACT_TIMELINE.annexIIIHighRisk);
    expect(result.duties!.find((d) => d.article === "Art. 4")!.appliesFrom).toBe(EU_AI_ACT_TIMELINE.prohibitionsAndAiLiteracy);
    expect(classifyEuAiActRisk({}).duties!.map((d) => d.article)).toEqual(["Art. 4", "Art. 4"]);
  });
});
