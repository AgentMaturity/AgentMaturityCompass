import { describe, expect, test } from "vitest";
import { listAssurancePacks } from "../src/assurance/packs/index.js";
import { builtInComplianceMappings, defaultComplianceMapsFile } from "../src/compliance/builtInMappings.js";
import { getFrameworkFamily } from "../src/compliance/frameworks.js";
import { complianceMapsSchema, complianceMappingSchema } from "../src/compliance/mappingSchema.js";

const NEW_FRAMEWORKS = ["DORA", "NIS2", "HHS_HTI_1", "NIST_AI_600_1", "CO_AI_ACT", "TX_TRAIGA", "CA_AI_LAWS", "KR_AI_BASIC_ACT"] as const;
const MIN_MAPPED_CONTROLS = 4;
// Publishers of the official texts (or, for Korea, the government-funded KLRI reference translation).
const OFFICIAL_HOSTS = [
  "publications.europa.eu", "www.ecfr.gov", "www.federalregister.gov", "nvlpubs.nist.gov",
  "leg.colorado.gov", "capitol.texas.gov", "leginfo.legislature.ca.gov", "cppa.ca.gov",
  "elaw.klri.re.kr", "www.law.go.kr",
];

describe("built-in compliance mappings", () => {
  test("the default maps file passes its own schema", () => {
    expect(() => complianceMapsSchema.parse(defaultComplianceMapsFile())).not.toThrow();
  });

  test.each(NEW_FRAMEWORKS)("%s has sourced control mappings on its own categories", (framework) => {
    const rows = builtInComplianceMappings.filter((row) => row.framework === framework);
    const family = getFrameworkFamily(framework);
    console.log(`${framework} mappedControls=${rows.length}`);
    expect(rows.length).toBeGreaterThanOrEqual(MIN_MAPPED_CONTROLS);
    for (const row of rows) {
      expect(family.categories, row.id).toContain(row.category);
      expect(row.sources?.length ?? 0, `${row.id} sources`).toBeGreaterThan(0);
      for (const source of row.sources ?? []) {
        expect(OFFICIAL_HOSTS, `${row.id} ${source.url}`).toContain(new URL(source.url).host);
        expect(source.retrievedAt, row.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(source.title.length, row.id).toBeGreaterThan(0);
      }
    }
  });

  test("mapping ids are unique", () => {
    const ids = builtInComplianceMappings.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every required assurance pack is a registered pack, so the requirement can be met", () => {
    const registered = new Set(listAssurancePacks().map((pack) => pack.id));
    const unknown = builtInComplianceMappings.flatMap((row) =>
      row.evidenceRequirements
        .filter((req) => req.type === "requires_assurance_pack" && !registered.has(req.packId))
        .map((req) => `${row.id}:${req.type === "requires_assurance_pack" ? req.packId : ""}`)
    );
    expect(unknown).toEqual([]);
  });

  test("schema rejects a framework id that is not a supported family", () => {
    const base = builtInComplianceMappings.find((row) => row.framework === "DORA")!;
    expect(complianceMappingSchema.safeParse(base).success).toBe(true);
    expect(complianceMappingSchema.safeParse({ ...base, framework: "DORA_X" }).success).toBe(false);
    expect(complianceMappingSchema.safeParse({ ...base, framework: "ONC_HTI_1" }).success).toBe(false);
  });

  test("sources are optional, so maps signed before the field existed still parse", () => {
    const { sources: _omitted, ...legacy } = builtInComplianceMappings.find((row) => row.framework === "DORA")!;
    expect(complianceMappingSchema.safeParse(legacy).success).toBe(true);
    expect(complianceMappingSchema.safeParse({ ...legacy, sources: [] }).success).toBe(false);
  });

  test("schema rejects a source without a URL or retrievedAt", () => {
    const base = builtInComplianceMappings.find((row) => row.framework === "DORA");
    expect(base).toBeDefined();
    const bad = (source: Record<string, string>) => complianceMappingSchema.safeParse({ ...base, sources: [source] }).success;
    expect(bad({ title: "t", url: "not a url", retrievedAt: "2026-10-03" })).toBe(false);
    expect(bad({ title: "t", url: "https://publications.europa.eu/x", retrievedAt: "" })).toBe(false);
    expect(bad({ title: "t", url: "https://publications.europa.eu/x", retrievedAt: "2026-10-03" })).toBe(true);
  });
});
