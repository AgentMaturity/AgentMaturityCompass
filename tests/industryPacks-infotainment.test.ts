import { describe, expect, test } from "vitest";
import { getIndustryPack } from "../src/domains/industryPacks.js";

describe("infotainment pack (reaudit 34)", () => {
  test("TECH-INF-8 cites DSA Art. 20 for internal complaint-handling (not Art. 17)", () => {
    const pack = getIndustryPack("infotainment");
    const question = pack.questions.find((q) => q.id === "TECH-INF-8");

    expect(question).toBeDefined();
    expect(question!.text).toContain("Article 14");
    expect(question!.text).toContain("Article 20");

    // Regression guard: internal complaint-handling is DSA Art. 20 (Art. 17 is statement of reasons).
    expect(question!.text).not.toMatch(/Article 17\s+internal complaint-handling/i);

    expect(question!.regulatoryRef).toContain("EU DSA");
    expect(question!.regulatoryRef).toContain("Art.");
    expect(question!.regulatoryRef).toContain("14");
    expect(question!.regulatoryRef).toContain("20");
    expect(question!.regulatoryRef).not.toMatch(/Art\.?\s*17/);
  });
});
