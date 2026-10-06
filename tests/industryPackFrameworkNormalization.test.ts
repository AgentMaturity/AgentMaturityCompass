import { describe, expect, test } from "vitest";
import { listIndustryPacks } from "../src/domains/industryPacks.js";
import { normalizeComplianceFrameworkLabel, validatePackRegulatoryCurrency } from "../src/domains/packs/regulatorySchema.js";

const packs = listIndustryPacks();
const AS_OF = new Date("2026-10-03T00:00:00Z");

describe("complianceFrameworks normalization", () => {
  test("every complianceFrameworks string normalizes to a built-in framework or a catalogued external one", () => {
    const labels = [...new Set(packs.flatMap((pack) => pack.complianceFrameworks))];
    const unresolved = labels.filter((label) => {
      const ref = normalizeComplianceFrameworkLabel(label);
      return ref.frameworkId === null && ref.instrumentId === null;
    });
    expect(unresolved).toEqual([]);
    for (const pack of packs) expect(pack.complianceFrameworkRefs, pack.id).toHaveLength(pack.complianceFrameworks.length);
    const builtIn = labels.filter((label) => normalizeComplianceFrameworkLabel(label).frameworkId !== null);
    process.stdout.write(`frameworkLabels=${labels.length} builtIn=${builtIn.length} external=${labels.length - builtIn.length}\n`);
  });

  test("built-in framework labels resolve to their AMC framework id", () => {
    expect(normalizeComplianceFrameworkLabel("ISO/IEC 42001:2023").frameworkId).toBe("ISO_42001");
    expect(normalizeComplianceFrameworkLabel("HIPAA").frameworkId).toBe("HIPAA");
    expect(normalizeComplianceFrameworkLabel("GDPR")).toMatchObject({ frameworkId: "GDPR", external: false });
  });

  test("an unknown framework label is rejected", () => {
    const pack = packs.find((p) => p.id === "farm-to-fork")!;
    const errors = validatePackRegulatoryCurrency({ ...pack, complianceFrameworks: ["Totally Made Up Standard 9999"] }, AS_OF);
    expect(errors.join("\n")).toMatch(/"Totally Made Up Standard 9999" neither normalizes/);
  });
});
