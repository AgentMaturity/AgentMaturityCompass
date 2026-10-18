import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { loadCatalog } from "../../../../src/catalog/loader.js";
import { validateCatalog } from "../../../../src/catalog/validate.js";
import { getDeepQuestionsByStation } from "../../../../src/domains/deepIndustryPacks.js";
import { getIndustryPacksByStation } from "../../../../src/domains/industryPacks.js";
import { domainsForStation } from "../../../../src/domains/stations.js";

const ids = Array.from({ length: 6 }, (_, i) => `L1-GOV-${String(i + 1).padStart(2, "0")}`);
const docs = "docs/catalog/governance";
const read = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");
const json = (name: string): unknown => JSON.parse(read(`${docs}/${name}`));

describe("Governance experimental overlay (P3-14)", () => {
  it("loads six experimental controls through the existing catalog contract", () => {
    const cat = loadCatalog();
    expect(validateCatalog(cat).errors).toEqual([]);
    const pack = cat.packs.get("overlay.governance")?.manifest;
    expect(pack).toMatchObject({ version: "0.1.0", layer: 1, support: "experimental", stations: ["governance"] });
    expect(pack?.controls.slice().sort()).toEqual(ids);
    for (const id of ids) {
      const control = cat.controls.get(id);
      expect(control, id).toBeDefined();
      expect(control, id).toMatchObject({ version: "0.1.0", support: "experimental", levels: ["L1"],
        review: { status: "pending", expert: null, credential: null, reviewedAt: null, nextReview: null },
        provenance: { draftedBy: "ai", approvedBy: null } });
      expect(control?.stations, id).toContain("governance");
      for (const citation of control?.citations ?? []) {
        expect(citation.legalReview, id).toBeNull();
        expect(citation.retrieval.state, id).not.toBe("verified");
        expect(citation.effectiveDate, id).toBeNull();
        expect(citation.complianceDueDate, id).toBeNull();
      }
      const path = cat.controlFiles.get(id);
      expect(path, id).toMatch(/^layers\/l1-governance-[^/]+\/controls\//);
      expect(read(`catalog/${path}`), id).not.toMatch(/\b(?:certified|compliant)\b|M-24-10|14434/i);
    }
  });

  it("disposes every actual Governance pack and deep question exactly once", () => {
    const data = json("dispositions.json") as { station: string; dispositions: Array<{ id: string; disposition: string; reason: string }> };
    expect(data.station).toBe("governance");
    const actual = [
      ...getIndustryPacksByStation("governance").flatMap((pack) => pack.questions.map((q) => q.id)),
      ...getDeepQuestionsByStation("governance").map((q) => q.id)
    ];
    expect(actual.length).toBeGreaterThan(0);
    expect(new Set(actual).size).toBe(actual.length);
    const dispositions = data.dispositions.map((row) => row.id);
    expect(new Set(dispositions).size).toBe(dispositions.length);
    expect(dispositions.slice().sort()).toEqual(actual.slice().sort());
    for (const row of data.dispositions) {
      expect(row.disposition.trim().length, row.id).toBeGreaterThan(0);
      expect(row.reason.trim().length, row.id).toBeGreaterThan(0);
    }
  });

  it("uses the implemented taxonomy and leaves promotion and human review pending", () => {
    const text = read(`${docs}/README.md`);
    for (const word of ["experimental", "unreviewed", "D-14", "P1-29", "scope_changed", "P3-23"]) expect(text).toContain(word);
    const domainIds = ["governance.public-services", "governance.law-rights-democracy", "governance.defense"];
    const domains = domainsForStation("governance");
    expect(domains.map((domain) => domain.id).sort()).toEqual(domainIds.slice().sort());
    for (const id of domainIds) expect(text).toContain(id);
    expect(parseYaml(read(`${docs}/promotion.yaml`))).toMatchObject({ support: "experimental", promotion: "none" });
    expect(read(`${docs}/guide-section.md`)).toContain("experimental, not reviewed, not legal advice");
  });

  it("orders unverified instrument metadata by market and preserves the ABA and CMMC caveats", () => {
    const data = json("instruments.json") as { instruments: Array<{ id: string; market: string; status: string; reverify: boolean; note?: string }> };
    const order = ["US", "EU", "RoW", "Standard"];
    const ranks = data.instruments.map((row) => order.indexOf(row.market));
    expect(ranks.every((rank) => rank >= 0)).toBe(true);
    expect(ranks).toEqual(ranks.slice().sort((a, b) => a - b));
    expect(new Set(data.instruments.map((row) => row.id)).size).toBe(data.instruments.length);
    for (const row of data.instruments) expect(row, row.id).toMatchObject({ status: "unverified", reverify: true });
    const aba = data.instruments.find((row) => /aba.*512/i.test(row.id));
    expect(aba).toBeDefined();
    expect(aba?.reverify).toBe(true);
    const cmmc = data.instruments.find((row) => /cmmc/i.test(row.id));
    expect(cmmc).toBeDefined();
    expect(JSON.stringify(cmmc)).toMatch(/suspend/i);
    expect(JSON.stringify(cmmc)).toMatch(/unverified|not verified|spec/i);
    expect(JSON.stringify(data)).not.toMatch(/M-24-10|14434/i);
  });

});
