import { describe, expect, it } from "vitest";
import { EU_AI_ACT_TIMELINE, classifyEuAiActRisk } from "../src/compliance/euAiActClassifier.js";
import { getRegisterEntry } from "../src/compliance/regulatoryRegister/index.js";

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
