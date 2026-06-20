import { describe, expect, test } from "vitest";
import {
  getIndustryPack,
  getIndustryPacksByStation,
  listIndustryPacks,
  scoreIndustryPack
} from "../src/domains/industryPacks.js";
import { getDomainMetadata } from "../src/domains/domainRegistry.js";

describe("freight, 3PL, and warehouse industry pack", () => {
  test("registers the dedicated logistics pack under mobility discovery", () => {
    const mobility = getDomainMetadata("mobility");
    const mobilityPacks = getIndustryPacksByStation("mobility");
    const pack = getIndustryPack("freight-3pl-warehouse");

    expect(listIndustryPacks()).toHaveLength(41);
    expect(mobility.recommendedIndustryPacks).toContain("freight-3pl-warehouse");
    expect(mobilityPacks.map((item) => item.id)).toContain("freight-3pl-warehouse");
    expect(pack.stationId).toBe("mobility");
    expect(pack.name).toContain("Freight");
    expect(pack.description).toMatch(/3PL|warehouse/i);
    expect(pack.regulatoryBasis).toEqual(expect.arrayContaining([
      "ISO 28000:2022",
      "NIST SP 800-161r1-upd1",
      "GS1 EPCIS 2.0"
    ]));
  });

  test("scores concrete logistics controls and surfaces low-level compliance gaps", () => {
    const pack = getIndustryPack("freight-3pl-warehouse");
    const baseline = scoreIndustryPack("freight-3pl-warehouse", {});
    const mature = scoreIndustryPack(
      "freight-3pl-warehouse",
      Object.fromEntries(pack.questions.map((question) => [question.id, 5]))
    );

    expect(pack.questions.map((question) => question.id)).toEqual(expect.arrayContaining([
      "MOB-F3W-1",
      "MOB-F3W-3",
      "MOB-F3W-4",
      "MOB-F3W-7",
      "MOB-F3W-8"
    ]));
    expect(baseline.level).toBe(1);
    expect(baseline.certified).toBe(false);
    expect(baseline.complianceGaps.length).toBe(pack.questions.length);
    expect(mature.level).toBe(5);
    expect(mature.percentage).toBe(100);
    expect(mature.certified).toBe(true);
  });
});
