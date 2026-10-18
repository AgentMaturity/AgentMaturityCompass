import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../../../src/catalog/loader.js";
import { controlRecordSchema } from "../../../../src/catalog/schema.js";
import { validateCatalog } from "../../../../src/catalog/validate.js";
import { getDeepQuestionsByStation } from "../../../../src/domains/deepIndustryPacks.js";
import { getIndustryPacksByStation } from "../../../../src/domains/industryPacks.js";
import { domainsForStation } from "../../../../src/domains/stations.js";

const ids = Array.from({ length: 8 }, (_, index) => `L1-TECH-${String(index + 1).padStart(2, "0")}`);
const restored = ["TECH-OS-4", "TECH-OS-15", "TECH-INF-15", "TECH-PP-7", "TECH-PP-13", "TECH-PP-14"];
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Technology experimental catalog overlay (P2-30)", () => {
  it("loads eight experimental, unreviewed controls through the unchanged catalog contract", () => {
    const catalog = loadCatalog();
    expect(validateCatalog(catalog).errors).toEqual([]);
    const pack = catalog.packs.get("overlay.technology")?.manifest;
    expect(pack).toMatchObject({ support: "experimental", stations: ["technology"], layer: 1 });
    expect(pack?.controls.slice().sort()).toEqual(ids);
    for (const id of ids) {
      const control = catalog.controls.get(id);
      expect(control, id).toBeDefined();
      expect(controlRecordSchema.safeParse(control).success, id).toBe(true);
      expect(control).toMatchObject({ support: "experimental", stations: ["technology"], review: { status: "pending", expert: null } });
      expect(control?.levels, id).toEqual(["L1"]);
      expect(control?.invalidatedBy, id).toEqual(expect.arrayContaining(["model_version", "prompt_version", "tool_version", "policy_version", "deployment_version"]));
      for (const citation of control?.citations ?? []) expect(citation.legalReview, id).toBeNull();
      for (const crosswalk of control?.crosswalk ?? []) {
        expect(crosswalk.relation, id).toBe("partial");
        expect(crosswalk.rationale.length, id).toBeGreaterThan(0);
      }
      const file = catalog.controlFiles.get(id);
      expect(file).toMatch(/^layers\/l1-technology-[^/]+\/controls\//);
      expect(read(`catalog/${file}`), id).not.toMatch(/\b(?:certified|compliant)\b/i);
    }
  });

  it("disposes all 97 pack and 16 deep Technology questions exactly once, including the six restored ids", () => {
    const path = "docs/catalog/technology/dispositions.json";
    expect(existsSync(path), path).toBe(true);
    const data = JSON.parse(read(path)) as { station: string; domain: string; dispositions: Array<{ id: string; disposition: string; reason: string }> };
    expect(data.station).toBe("technology");
    expect(domainsForStation("technology").map((domain) => domain.id)).toContain(data.domain);
    const packIds = getIndustryPacksByStation("technology").flatMap((pack) => pack.questions.map((question) => question.id));
    const deepIds = getDeepQuestionsByStation("technology").map((question) => question.id);
    const actual = [...packIds, ...deepIds];
    const named = data.dispositions.map((row) => row.id);
    expect(packIds).toHaveLength(97);
    expect(deepIds).toHaveLength(16);
    expect(actual).toHaveLength(113);
    expect(new Set(actual).size).toBe(actual.length);
    expect(new Set(named).size).toBe(named.length);
    expect([...named].sort()).toEqual([...actual].sort());
    for (const id of restored) expect(packIds, id).toContain(id);
    for (const row of data.dispositions) {
      expect(row.disposition.length, row.id).toBeGreaterThan(0);
      expect(row.reason.length, row.id).toBeGreaterThan(0);
    }
  });

  it("keeps promotion absent and expert and partner decisions visibly pending", () => {
    const path = "docs/catalog/technology/README.md";
    expect(existsSync(path), path).toBe(true);
    const text = read(path);
    expect(text).toContain("none");
    expect(text).toContain("experimental");
    expect(text).toContain("unreviewed");
    expect(text).toContain("D-14");
    expect(text).toContain("P1-29");
  });

  it("orders markets and retains unresolved instruments without invented source dates or legal review", () => {
    const metadata = JSON.parse(read("docs/catalog/technology/instruments.json")) as {
      instruments: Array<{ id: string; market: string; status: string; reverify: boolean; url: null; effectiveDate: null; complianceDueDate: null; registerEntryId: string | null }>;
    };
    const order = ["US", "EU", "RoW", "Standard"];
    const markets = metadata.instruments.map((row) => order.indexOf(row.market));
    expect(markets).toEqual([...markets].sort((a, b) => a - b));
    expect(new Set(metadata.instruments.map((row) => row.id)).size).toBe(metadata.instruments.length);
    const catalog = loadCatalog();
    const rows = [...(catalog.registers?.values() ?? [])].flatMap((register) => register.entries);
    for (const instrument of metadata.instruments) {
      expect(instrument).toMatchObject({ status: "unverified", reverify: true, url: null, effectiveDate: null, complianceDueDate: null });
      if (instrument.registerEntryId === null) continue;
      const row = rows.find((entry) => entry.id === instrument.registerEntryId);
      expect(row, instrument.id).toBeDefined();
      expect(row?.citation).toMatchObject({ contentHash: null, retrievedAt: null, legalReviewer: null, effectiveDate: null, complianceDueDate: null });
      expect(row?.flags.reverify, instrument.id).toBeTruthy();
    }
    const eu = catalog.registers?.get("eu");
    expect(eu?.entries.length).toBeGreaterThan(0);
    expect(eu?.entries.every((entry) => entry.stations.length === 1 && entry.stations[0] === "technology")).toBe(true);
  });
});
