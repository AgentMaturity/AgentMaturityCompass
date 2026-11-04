import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { parseDeploymentProfile } from "../../../../src/catalog/compiler/compile.js";
import { loadCatalog } from "../../../../src/catalog/loader.js";
import { controlRecordSchema } from "../../../../src/catalog/schema.js";
import { validateCatalog } from "../../../../src/catalog/validate.js";
import { getDeepQuestionsByStation } from "../../../../src/domains/deepIndustryPacks.js";
import { getIndustryPacksByStation } from "../../../../src/domains/industryPacks.js";
import { domainsForStation } from "../../../../src/domains/stations.js";

const ids = ["L1-ENV-01", "L1-ENV-02", "L1-ENV-03", "L1-ENV-04", "L1-ENV-05", "L1-ENV-06"];
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Environment experimental catalog overlay (P3-16)", () => {
  it("loads six experimental controls through the native catalog contract", () => {
    const catalog = loadCatalog();
    expect(validateCatalog(catalog).errors).toEqual([]);
    const pack = catalog.packs.get("overlay.environment")?.manifest;
    expect(pack).toMatchObject({ support: "experimental", stations: ["environment"], layer: 1 });
    expect(pack?.controls.slice().sort()).toEqual(ids);
    for (const id of ids) {
      const control = catalog.controls.get(id);
      expect(control, id).toBeDefined();
      expect(controlRecordSchema.safeParse(control).success, id).toBe(true);
      expect(control).toMatchObject({ support: "experimental", stations: ["environment"], review: { status: "pending", expert: null } });
      expect(control?.invalidatedBy).toEqual(expect.arrayContaining(["model_version", "prompt_version", "tool_version", "policy_version", "deployment_version"]));
      for (const citation of control?.citations ?? []) expect(citation.legalReview, id).toBeNull();
      expect(catalog.controlFiles.get(id)).toMatch(/^layers\/l1-environment-[^/]+\/controls\//);
      expect(read(`catalog/${catalog.controlFiles.get(id)}`)).not.toMatch(/\b(?:certified|compliant)\b/i);
    }
  });

  it("disposes every actual Environment question exactly once under both P1-13 domains", () => {
    const path = "docs/catalog/environment/dispositions.json";
    expect(existsSync(path), path).toBe(true);
    const data = JSON.parse(read(path)) as { station: string; domains: string[]; dispositions: Array<{ id: string; reason: string }> };
    expect(data.station).toBe("environment");
    expect([...data.domains].sort()).toEqual(domainsForStation("environment").map((domain) => domain.id).sort());
    const pack = getIndustryPacksByStation("environment").flatMap((item) => item.questions.map((question) => question.id));
    const deep = getDeepQuestionsByStation("environment").map((question) => question.id);
    expect([pack.length, deep.length]).toEqual([104, 17]);
    const named = data.dispositions.map((row) => row.id);
    expect(new Set(named).size).toBe(named.length);
    expect([...named].sort()).toEqual([...pack, ...deep].sort());
    for (const row of data.dispositions) expect(row.reason.trim().length, row.id).toBeGreaterThan(0);
  });

  it("keeps evidence negatives on every signature without manufacturing a CEA clock", () => {
    const catalog = loadCatalog();
    for (const id of ids) {
      const control = catalog.controls.get(id);
      expect(control, id).toBeDefined();
      const fixtures = control!.tests.flatMap((test) => [...test.fixtures.positive, ...test.fixtures.negative]).map((path) => catalog.fixtures.get(path)!.envelope!);
      expect(fixtures.some((fixture) => fixture.polarity === "positive"), id).toBe(true);
      expect(fixtures.map((fixture) => fixture.evidenceClass), id).toEqual(expect.arrayContaining(["stale", "replayed", "contradictory", "cross_tenant", "empty"]));
    }
    expect(catalog.controls.get("L1-ENV-03")?.clock).toBeNull();
  });

  it("keeps market-ordered instrument candidates unverified without fresh source or legal-review claims", () => {
    const path = "docs/catalog/environment/instruments.json";
    expect(existsSync(path), path).toBe(true);
    const data = JSON.parse(read(path)) as { instruments: Array<{ id: string; market: string; status: string; reverify: boolean; source: { readThisTask: boolean } }> };
    const markets = ["US", "EU", "RoW", "Standard"];
    const ranks = data.instruments.map((instrument) => markets.indexOf(instrument.market));
    expect(data.instruments.length).toBeGreaterThan(0);
    expect(ranks.every((rank) => rank >= 0)).toBe(true);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    for (const instrument of data.instruments) {
      expect(instrument, instrument.id).toMatchObject({ status: "unverified", reverify: true, effectiveDate: null, complianceDueDate: null, retrievedAt: null, contentSha256: null, legalReview: null });
      expect(instrument.source.readThisTask, instrument.id).toBe(false);
    }
    for (const id of ["us-nerc-cip", "us-fsma-traceability", "us-fsma-pchf"]) expect(data.instruments.find((row) => row.id === id), id).toMatchObject({ reverify: true });
  });

  it("provides three asserted profiles without a reviewed risk classification", () => {
    for (const name of ["profile.grid-operations.json", "profile.grid-operations-in.json", "profile.food-lot-release.json"]) {
      const path = `docs/catalog/environment/${name}`;
      expect(existsSync(path), path).toBe(true);
      const profile = parseDeploymentProfile(JSON.parse(read(path)));
      expect(profile.primaryStation).toMatchObject({ value: "environment", provenance: "asserted", reviewedBy: null });
      expect(profile.domains.value?.some((domain) => domainsForStation("environment").some((known) => known.id === domain))).toBe(true);
      expect(profile.riskClass).toMatchObject({ value: null, reviewedBy: null });
    }
  });

  it("keeps promotion, partners and both named experts open", () => {
    const path = "docs/catalog/environment/promotion.yaml";
    expect(existsSync(path), path).toBe(true);
    const promotion = parseYaml(read(path));
    expect(promotion).toMatchObject({ support: "experimental", review: "pending", promotion: "none", approvedBy: null, sidPromotionApproval: null, experts: { gridCybersecurity: null, foodSafety: null } });
    expect(promotion.admissionCriteria.map((row: { criterion: number }) => row.criterion)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
