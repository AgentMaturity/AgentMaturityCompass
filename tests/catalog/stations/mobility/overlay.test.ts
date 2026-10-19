import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { compilePlan, parseDeploymentProfile } from "../../../../src/catalog/compiler/compile.js";
import { loadCatalog } from "../../../../src/catalog/loader.js";
import { controlRecordSchema } from "../../../../src/catalog/schema.js";
import { validateCatalog } from "../../../../src/catalog/validate.js";
import { getDeepQuestionsByStation } from "../../../../src/domains/deepIndustryPacks.js";
import { getIndustryPacksByStation } from "../../../../src/domains/industryPacks.js";
import { domainsForStation } from "../../../../src/domains/stations.js";

const ids = Array.from({ length: 6 }, (_, i) => `L1-MOB-${String(i + 1).padStart(2, "0")}`);
const read = (path: string) => readFileSync(path, "utf8");

describe("Mobility experimental catalog overlay (P3-17)", () => {
  it("loads six experimental controls through the unchanged native catalog contract", () => {
    const catalog = loadCatalog();
    expect(validateCatalog(catalog).errors).toEqual([]);
    const pack = catalog.packs.get("overlay.mobility")?.manifest;
    expect(pack).toMatchObject({ support: "experimental", version: "0.1.0", layer: 1 });
    expect(pack?.controls.slice().sort()).toEqual(ids);
    for (const id of ids) {
      const control = catalog.controls.get(id);
      expect(control, id).toBeDefined();
      expect(controlRecordSchema.safeParse(control).success, id).toBe(true);
      expect(control).toMatchObject({ support: "experimental", version: "0.1.0", review: { status: "pending", expert: null } });
      expect(control?.stations).toContain("mobility");
      expect(control?.invalidatedBy).toEqual(expect.arrayContaining(["model_version", "prompt_version", "tool_version", "policy_version", "deployment_version"]));
      for (const citation of control?.citations ?? []) expect(citation.legalReview, id).toBeNull();
      expect(catalog.controlFiles.get(id)).toMatch(/^layers\/l1-mobility-[^/]+\/controls\//);
      expect(read(`catalog/${catalog.controlFiles.get(id)}`)).not.toMatch(/\b(?:certified|compliant)\b/i);
    }
  });

  it("disposes all 94 pack and 16 deep questions exactly once without silently placing disputed packs", () => {
    const path = "docs/catalog/mobility/dispositions.json";
    expect(existsSync(path), path).toBe(true);
    const data = JSON.parse(read(path)) as { station: string; domains: string[]; dispositions: Array<{ id: string; reason: string }> };
    expect(data.station).toBe("mobility");
    const domains = domainsForStation("mobility");
    expect([...data.domains].sort()).toEqual(domains.map((row) => row.id).sort());
    expect(domains.find((row) => row.id === "mobility.unplaced")?.packIds.slice().sort()).toEqual(["privacy-security-mobility", "virtual-infrastructure"]);
    const packs = getIndustryPacksByStation("mobility").flatMap((pack) => pack.questions.map((q) => q.id));
    const deep = getDeepQuestionsByStation("mobility").map((q) => q.id);
    expect([packs.length, deep.length]).toEqual([94, 16]);
    const actual = [...packs, ...deep];
    const named = data.dispositions.map((row) => row.id);
    expect(new Set(named).size).toBe(named.length);
    expect(named.slice().sort()).toEqual(actual.slice().sort());
    expect(named).toContain("MOB-PS-15-v2");
    expect(named).not.toContain("MOB-PS-15");
    for (const row of data.dispositions) expect(row.reason.trim().length, row.id).toBeGreaterThan(0);
  });

  it("retains all five evidence negatives on every signature", () => {
    const catalog = loadCatalog();
    for (const id of ids) {
      const control = catalog.controls.get(id);
      expect(control, id).toBeDefined();
      const fixtures = control!.tests.flatMap((test) => [...test.fixtures.positive, ...test.fixtures.negative]).map((path) => catalog.fixtures.get(path)!.envelope!);
      expect(fixtures.some((fixture) => fixture.polarity === "positive"), id).toBe(true);
      expect(fixtures.map((fixture) => fixture.evidenceClass), id).toEqual(expect.arrayContaining(["stale", "replayed", "contradictory", "cross_tenant", "empty"]));
    }
  });

  it("orders unverified candidates without inventing source reads or legal review", () => {
    const path = "docs/catalog/mobility/instruments.json";
    expect(existsSync(path), path).toBe(true);
    const data = JSON.parse(read(path)) as { instruments: Array<{ id: string; market: string; status: string; reverify: boolean; source: { readThisTask: boolean } }> };
    const markets = ["US", "EU", "RoW", "Standard"];
    const ranks = data.instruments.map((row) => markets.indexOf(row.market));
    expect(ranks.length).toBeGreaterThan(0);
    expect(ranks.every((rank) => rank >= 0)).toBe(true);
    expect(ranks).toEqual(ranks.slice().sort((a, b) => a - b));
    for (const row of data.instruments) {
      expect(row, row.id).toMatchObject({ status: "unverified", reverify: true, effectiveDate: null, complianceDueDate: null, retrievedAt: null, contentSha256: null, legalReview: null });
      expect(row.source.readThisTask, row.id).toBe(false);
    }
  });

  it("compiles three asserted profiles including actual Mobility and Technology composition", () => {
    const catalog = loadCatalog();
    for (const name of ["port-operations", "tenant-screening", "fleet-software"]) {
      const path = `docs/catalog/mobility/profile.${name}.json`;
      expect(existsSync(path), path).toBe(true);
      const profile = parseDeploymentProfile(JSON.parse(read(path)));
      expect(profile.primaryStation).toMatchObject({ value: "mobility", provenance: "asserted", reviewedBy: null });
      expect(profile.riskClass).toMatchObject({ value: null, reviewedBy: null });
      const plan = compilePlan({ catalog, profile, asOf: "2026-10-19T00:00:00Z" });
      expect(plan.requirements.some((row) => row.controlId.startsWith("L1-MOB-"))).toBe(true);
      if (name === "fleet-software") {
        expect(profile.stations.value?.slice().sort()).toEqual(["mobility", "technology"]);
        expect(profile.domains.value).toEqual(expect.arrayContaining(["mobility.vehicles-aviation", "technology.platforms-data"]));
        expect(plan.requirements.some((row) => row.controlId.startsWith("L1-TECH-"))).toBe(true);
      }
    }
  });

  it("keeps promotion and all three expert relationships pending", () => {
    const path = "docs/catalog/mobility/promotion.yaml";
    expect(existsSync(path), path).toBe(true);
    const data = parseYaml(read(path));
    expect(data).toMatchObject({ support: "experimental", review: "pending", promotion: "none", approvedBy: null, sidPromotionApproval: null, experts: { maritimePortSecurity: null, fairHousing: null, automotiveSafety: null } });
    expect(data.admissionCriteria.map((row: { criterion: number }) => row.criterion)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
