import { describe, expect, test } from "vitest";
import { listIndustryPacks } from "../src/domains/industryPacks.js";
import {
  getRegulatoryInstrument,
  resolveRegulatoryInstrument,
  resolveRegulatoryRefParts,
  validatePackRegulatoryCurrency,
} from "../src/domains/packs/regulatorySchema.js";

const packs = listIndustryPacks();
const AS_OF = new Date("2026-10-03T00:00:00Z");

function milestoneDates(id: string): string[] {
  return (getRegulatoryInstrument(id)?.milestones ?? []).map((m) => m.date);
}

describe("October 2026 regulatory refresh", () => {
  test("every pack passes the regulatory-currency validator", () => {
    expect(packs.flatMap((pack) => validatePackRegulatoryCurrency(pack, AS_OF))).toEqual([]);
  });

  test("every pack has references from the October 2026 review, each regulatoryBasis entry resolved", () => {
    for (const pack of packs) {
      expect(pack.lastReviewed, pack.id).toMatch(/^2026-10-0\d$/);
      expect(pack.regulatoryReferences?.length, pack.id).toBeGreaterThan(0);
      expect(pack.regulatoryReferences, pack.id).toHaveLength(pack.regulatoryBasis.length);
      for (const ref of pack.regulatoryReferences ?? []) {
        expect(ref.instrumentId, `${pack.id}: ${ref.text}`).not.toBeNull();
        expect(ref.lastReviewed, `${pack.id}: ${ref.citation}`).toMatch(/^2026-10-0\d$/);
      }
    }
  });

  test("the six planner-verified instruments carry their official dates and status", () => {
    expect(getRegulatoryInstrument("eu-ai-act")?.status).toBe("in-force");
    expect(milestoneDates("eu-ai-act")).toEqual(expect.arrayContaining(["2027-12-02", "2028-08-02"]));
    expect(getRegulatoryInstrument("eu-nis2")?.status).toBe("in-force");
    expect(milestoneDates("eu-nis2")).toContain("2024-10-17");
    expect(getRegulatoryInstrument("eu-dora")).toMatchObject({ status: "in-force", effectiveDate: "2025-01-17" });
    expect(getRegulatoryInstrument("eu-mica")).toMatchObject({ status: "in-force", effectiveDate: "2024-12-30" });
    expect(milestoneDates("eu-mica")).toContain("2026-07-01");
    expect(getRegulatoryInstrument("eu-ehds")).toMatchObject({ status: "in-force", effectiveDate: "2025-03-26" });
    expect(milestoneDates("eu-ehds")).toContain("2029-03-26");
    expect(getRegulatoryInstrument("eu-eudr")?.status).toBe("in-force");
    expect(milestoneDates("eu-eudr")).toEqual(expect.arrayContaining(["2026-12-30", "2027-06-30"]));
    expect(resolveRegulatoryInstrument("Regulation (EU) 2025/327")?.id).toBe("eu-ehds");
  });

  test("question regulatoryRef coverage is measured and never cites a repealed instrument", () => {
    const parts = packs.flatMap((pack) => pack.questions.flatMap((q) => resolveRegulatoryRefParts(q.regulatoryRef)));
    const resolved = parts.filter((p) => p.instrument);
    process.stdout.write(`questionRefParts=${parts.length} resolved=${resolved.length} unresolved=${parts.length - resolved.length}\n`);
    expect(resolved.filter((p) => p.instrument!.status === "repealed").map((p) => p.part)).toEqual([]);
  });
});
