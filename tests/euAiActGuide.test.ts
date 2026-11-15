import { describe, expect, it } from "vitest";
import { GUIDE_AREA_CHOICES, GUIDE_BANNED_CHOICES, guideCapabilities } from "../src/compliance/euAiActCli.js";
import { classifyEuAiActRisk } from "../src/compliance/euAiActClassifier.js";

const none = { banned: [], areas: [], safetyComponent: false, talksToPeople: false, content: [], role: "both" as const };

describe("comply risk-classify --guide", () => {
  it("maps the six answers to the classifier's capabilities", () => {
    expect(guideCapabilities(none)).toEqual({});
    expect(guideCapabilities({ ...none, areas: ["employment"], talksToPeople: true, content: ["syntheticContentGeneration"], safetyComponent: true }))
      .toEqual({ employment: true, humanInteraction: true, syntheticContentGeneration: true, safetyComponent: true });
    expect(guideCapabilities({ ...none, content: ["deepFakes"] })).toEqual({ deepFakes: true });
    const deployer = classifyEuAiActRisk(guideCapabilities({ ...none, content: ["deepFakes"] })).duties ?? [];
    expect(deployer.some((d) => d.role === "deployer" && d.article.startsWith("Art. 50(4)"))).toBe(true);
    expect(classifyEuAiActRisk(guideCapabilities({ ...none, banned: ["childSexualAbuseMaterial"] })).riskTier).toBe("UNACCEPTABLE");
  });

  it("offers every Art. 5 practice and every Annex III area the classifier knows, in plain words", () => {
    expect(GUIDE_BANNED_CHOICES).toHaveLength(10);
    expect(GUIDE_AREA_CHOICES).toHaveLength(8);
    for (const [key] of [...GUIDE_BANNED_CHOICES]) expect(classifyEuAiActRisk({ [key]: true }).riskTier).toBe("UNACCEPTABLE");
    for (const [key] of [...GUIDE_AREA_CHOICES]) expect(classifyEuAiActRisk({ [key]: true }).riskTier).toBe("HIGH");
    const words = [...GUIDE_BANNED_CHOICES, ...GUIDE_AREA_CHOICES].map(([, text]) => text).join(" ");
    expect(words).not.toMatch(/compliant|Annex|Art\./);
  });
});
