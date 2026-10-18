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

const ids = ["L1-EDU-01", "L1-EDU-02", "L1-EDU-03", "L1-EDU-04"];
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Education experimental catalog overlay (P3-15)", () => {
  it("loads four experimental controls through the native catalog contract", () => {
    const catalog = loadCatalog();
    expect(validateCatalog(catalog).errors).toEqual([]);
    const pack = catalog.packs.get("overlay.education")?.manifest;
    expect(pack).toMatchObject({ support: "experimental", stations: ["education"], layer: 1 });
    expect(pack?.controls.slice().sort()).toEqual(ids);
    for (const id of ids) {
      const control = catalog.controls.get(id);
      expect(control, id).toBeDefined();
      expect(controlRecordSchema.safeParse(control).success, id).toBe(true);
      expect(control).toMatchObject({ support: "experimental", stations: ["education"], review: { status: "pending", expert: null } });
      expect(control?.invalidatedBy).toEqual(expect.arrayContaining(["model_version", "prompt_version", "tool_version", "policy_version", "deployment_version"]));
      for (const citation of control?.citations ?? []) expect(citation.legalReview, id).toBeNull();
      const path = catalog.controlFiles.get(id)!;
      expect(path).toMatch(/^layers\/l1-education-[^/]+\/controls\//);
      expect(read(`catalog/${path}`)).not.toMatch(/\b(?:certified|compliant)\b/i);
    }
  });

  it("disposes every actual Education question exactly once under the P1-13 domain", () => {
    const path = "docs/catalog/education/dispositions.json";
    expect(existsSync(path), path).toBe(true);
    const data = JSON.parse(read(path)) as { station: string; domain: string; dispositions: Array<{ id: string; reason: string }> };
    expect(data.station).toBe("education");
    expect(domainsForStation("education").map((domain) => domain.id)).toContain(data.domain);
    const pack = getIndustryPacksByStation("education").flatMap((item) => item.questions.map((question) => question.id));
    const deep = getDeepQuestionsByStation("education").map((question) => question.id);
    expect([pack.length, deep.length]).toEqual([87, 16]);
    const actual = [...pack, ...deep].sort();
    const named = data.dispositions.map((row) => row.id);
    expect(new Set(named).size).toBe(named.length);
    expect([...named].sort()).toEqual(actual);
    for (const row of data.dispositions) expect(row.reason.trim().length, row.id).toBeGreaterThan(0);
  });

  it("cites the education emotion ban as Article 5(1)(f)", () => {
    const control = loadCatalog().controls.get("L1-EDU-02");
    expect(control).toBeDefined();
    const clauses = control!.citations.map((citation) => citation.clause).join(" ");
    expect(clauses).toMatch(/5\s*\(1\)\s*\(f\)/i);
    expect(clauses).not.toMatch(/50\s*\(3\)/i);
  });

  it("keeps market-ordered instrument candidates unverified without new source-read or legal-review claims", () => {
    const path = "docs/catalog/education/instruments.json";
    expect(existsSync(path), path).toBe(true);
    const data = JSON.parse(read(path)) as { instruments: Array<{ id: string; market: string; status: string; reverify: boolean; effectiveDate: unknown; complianceDueDate: unknown; retrievedAt: unknown; contentSha256: unknown; legalReview: unknown; source: { readThisTask: boolean } }> };
    const marketOrder = ["US", "EU", "RoW", "Standard"];
    const ranks = data.instruments.map((instrument) => marketOrder.indexOf(instrument.market));
    expect(data.instruments.length).toBeGreaterThan(0);
    expect(ranks.every((rank) => rank >= 0)).toBe(true);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    for (const instrument of data.instruments) {
      expect(instrument, instrument.id).toMatchObject({ status: "unverified", reverify: true, effectiveDate: null, complianceDueDate: null, retrievedAt: null, contentSha256: null, legalReview: null });
      expect(instrument.source.readThisTask, instrument.id).toBe(false);
    }
  });

  it("provides asserted US and EU profiles without claiming a reviewed risk classification", () => {
    for (const name of ["profile.grading-assistant.json", "profile.grading-assistant-eu.json"]) {
      const path = `docs/catalog/education/${name}`;
      expect(existsSync(path), path).toBe(true);
      const profile = parseDeploymentProfile(JSON.parse(read(path)));
      expect(profile.primaryStation).toMatchObject({ value: "education", provenance: "asserted", reviewedBy: null });
      expect(profile.domains.value).toContain("education.schools-skills");
      expect(profile.riskClass).toMatchObject({ value: null, reviewedBy: null });
    }
  });

  it("keeps promotion and both named expert approvals open", () => {
    const path = "docs/catalog/education/promotion.yaml";
    expect(existsSync(path), path).toBe(true);
    const promotion = parseYaml(read(path));
    expect(promotion).toMatchObject({ support: "experimental", review: "pending", promotion: "none", approvedBy: null, partner: null, sidPromotionApproval: null, manualWcagAssessor: null, experts: { studentPrivacyCounsel: null, accessibilitySpecialist: null } });
    expect(promotion.admissionCriteria.map((row: { criterion: number }) => row.criterion)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
