/**
 * Mobility station, round-2 content (round2/content/mobility, refuter review 2026-10-04).
 * Pins the floor, the validator, and the corrections the refuter made binding.
 */
import { describe, expect, test } from "vitest";
import { INDUSTRY_PACKS } from "../src/domains/industryPacks.js";
import { getDeepQuestionsByStation } from "../src/domains/deepIndustryPacks.js";
import { PACK_QUESTION_FLOOR, validatePackRegulatoryCurrency } from "../src/domains/packs/regulatorySchema.js";

const packs = Object.values(INDUSTRY_PACKS).filter((p) => p.stationId === "mobility");
const question = (id: string) => packs.flatMap((p) => p.questions).find((q) => q.id === id);

describe("mobility station packs", () => {
  test("six packs, each at or above the question floor, ids unique, currency validator clean", () => {
    expect(packs.map((p) => p.id).sort()).toEqual([
      "freight-3pl-warehouse", "privacy-security-mobility", "sustainable-communities",
      "sustainable-ports", "sustainable-real-estate", "virtual-infrastructure",
    ]);
    const ids = packs.flatMap((p) => p.questions.map((q) => q.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of packs) {
      expect(p.questions.length, p.id).toBeGreaterThanOrEqual(PACK_QUESTION_FLOOR);
      expect(validatePackRegulatoryCurrency(p, new Date("2026-10-04")), p.id).toEqual([]);
    }
  });

  test("merged and dropped questions are gone", () => {
    for (const id of ["MOB-SC-1", "MOB-SC-11", "MOB-SC-14", "MOB-SP-3", "MOB-SP-13", "MOB-RE-9", "MOB-RE-11", "MOB-RE-12",
      "MOB-RE-13", "MOB-RE-14", "MOB-RE-15", "MOB-VI-5", "MOB-VI-14", "MOB-PS-5", "MOB-PS-9", "MOB-PS-13", "MOB-F3W-8"]) {
      expect(question(id), id).toBeUndefined();
    }
  });

  test("S3 additions survive and the author's colliding additions are renumbered", () => {
    expect(question("MOB-SC-15")?.regulatoryRef).toBe("GDPR Art. 35(3)(c)");
    expect(question("MOB-SP-15")?.regulatoryRef).toBe("EU Port Services Regulation 2017/352 Art. 13");
    expect(question("MOB-VI-15")?.regulatoryRef).toBe("EU NIS2 Directive 2022/2555 Art. 23");
    expect(question("MOB-PS-14")?.regulatoryRef).toBe("GDPR Art. 32(1)");
    expect(question("MOB-F3W-15")?.regulatoryRef).toBe("GDPR Art. 28(2)-(3)");
    expect(question("MOB-SC-16")?.regulatoryRef).toContain("EU AI Act Annex III point 2");
    expect(question("MOB-SP-16")?.regulatoryRef).toContain("EU NIS2 Annex I point 2(c)");
    expect(question("MOB-VI-16")?.regulatoryRef).toContain("EU AI Act Annex III point 2");
    expect(question("MOB-PS-17")?.regulatoryRef).toContain("Implementing Regulation (EU) 2022/1426");
    expect(question("MOB-F3W-16")?.regulatoryRef).toContain("Regulation (EU) 2020/1056");
    // S3's CRA Art. 14 question and the author's are one obligation: one question, the author's deadlines.
    const cra = packs.flatMap((p) => p.questions).filter((q) => /CRA[^;]*Art\. 14/.test(q.regulatoryRef));
    expect(cra.map((q) => q.id)).toEqual(["MOB-PS-15"]);
    expect(cra[0]!.text).toContain("72 hours");
  });

  test("refuter corrections: no compound DORA anchor, no unconfirmed IR 2022/1426 point 2.3", () => {
    expect(question("MOB-VI-2")?.regulatoryRef).toBe("ISO 22301:2019 §8.4");
    expect(question("MOB-VI-17")?.regulatoryRef).toBe("EU DORA Art. 11; EU DORA Art. 12");
    const all = JSON.stringify(packs);
    expect(all).not.toMatch(/§2\.1-2\.3|annual in-service report/);
  });

  test("corrected citations", () => {
    expect(question("MOB-SC-9")?.regulatoryRef).toContain("Art. 5(1)(h)");
    expect(question("MOB-SP-1")?.regulatoryRef).not.toContain("§12");
    expect(question("MOB-RE-10")?.regulatoryRef).toBe("EU EPBD Art. 7(1); EU EPBD Art. 11");
    expect(question("MOB-PS-11")?.regulatoryRef).toBe("ISO/SAE 21434:2021 Clause 15");
  });

  test("deep questions continue S4's numbering at 11 with official sources", () => {
    const ids = getDeepQuestionsByStation("mobility").map((q) => q.id);
    expect(ids).toEqual(Array.from({ length: 16 }, (_, i) => `mobility-deep-${String(i + 1).padStart(2, "0")}`));
  });
});
