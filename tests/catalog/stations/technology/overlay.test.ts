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
const euEntryIds = ["eu-ai-act-art50", "eu-ai-act-gpai", "technology-eu-ai-omnibus", "technology-eu-dsa", "technology-eu-data-act", "eu-cra-art14", "eu-nis2-art23"];
const ccpaNoticeId = "us-ca-ccpa-admt-notice";
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
      instruments: Array<{ id: string; market: string; status: string; reverify: boolean; url: string | null; effectiveDate: string | null; complianceDueDate: string | null; registerEntryId: string | null }>;
    };
    const order = ["US", "EU", "RoW", "Standard"];
    const markets = metadata.instruments.map((row) => order.indexOf(row.market));
    expect(markets).toEqual([...markets].sort((a, b) => a - b));
    expect(new Set(metadata.instruments.map((row) => row.id)).size).toBe(metadata.instruments.length);
    const catalog = loadCatalog();
    const rows = [...(catalog.registers?.values() ?? [])].flatMap((register) => register.entries);
    for (const instrument of metadata.instruments) {
      expect(instrument).toMatchObject({ status: "unverified", reverify: true });
      if (instrument.id === "us-ccpa") {
        expect(instrument).toMatchObject({
          registerEntryId: ccpaNoticeId,
          url: "https://cppa.ca.gov/regulations/pdf/ccpa_updates_cyber_risk_admt_appr_text.pdf",
          effectiveDate: "2026-01-01",
          complianceDueDate: "2027-01-01"
        });
      } else {
        expect(instrument).toMatchObject({
          url: instrument.id === "us-ftc-act" ? "https://www.ftc.gov/" : null,
          effectiveDate: null,
          complianceDueDate: null
        });
      }
      if (instrument.registerEntryId === null) continue;
      const row = rows.find((entry) => entry.id === instrument.registerEntryId);
      expect(row, instrument.id).toBeDefined();
      expect(row?.citation).toMatchObject({ contentHash: null, legalReviewer: null });
      if (instrument.id === "us-ccpa") {
        expect(row?.citation).toMatchObject({ statusType: "binding-future", retrievedAt: "2026-10-03", effectiveDate: "2026-01-01", complianceDueDate: "2027-01-01" });
      } else {
        expect(row?.citation).toMatchObject({ retrievedAt: null, effectiveDate: null, complianceDueDate: null });
      }
      expect(row?.flags.reverify, instrument.id).toBeTruthy();
    }
    const eu = catalog.registers?.get("eu");
    for (const id of euEntryIds) {
      const owned = eu?.entries.filter((entry) => entry.id === id) ?? [];
      expect(owned, id).toHaveLength(1);
      expect(owned[0]?.stations, id).toContain("technology");
    }
  });

  it("reuses the inherited future CCPA ADMT notice without duplicating or erasing its source metadata", () => {
    const catalog = loadCatalog();
    const entries = catalog.registers?.get("us")?.entries ?? [];
    const inherited = entries.filter((entry) => entry.id === ccpaNoticeId);
    expect(inherited).toHaveLength(1);
    const row = inherited[0]!;
    expect(row.s5RegisterId).toBe("us-ca-cppa-admt");
    expect(row.stations).toContain("technology");
    expect(row.citation).toEqual({
      instrument: "CCPA regulations on automated decisionmaking technology, risk assessments and cybersecurity audits (11 CCR; CPPA)",
      clause: "11 CCR §7220 pre-use notice, and Article 11 opt-out and access rights, for ADMT used for significant decisions",
      edition: "CPPA approved regulations text (OAL-approved 2025-09-22)",
      jurisdiction: "US-CA",
      statusType: "binding-future",
      effectiveDate: "2026-01-01",
      complianceDueDate: "2027-01-01",
      url: "https://cppa.ca.gov/regulations/pdf/ccpa_updates_cyber_risk_admt_appr_text.pdf",
      contentHash: null,
      retrievedAt: "2026-10-03",
      legalReviewer: null
    });
    expect(row.sourceNote).toBe("S5 entry us-ca-cppa-admt records this source read on 2026-10-03 (its obligations and dates checked there) without a content hash; not fetched or hashed in P1-18, which ran without network access (Sid, 2026-10-11).");
    expect(row.flags.reverify).toBeTruthy();
    const citation = catalog.controls.get("L1-TECH-05")?.citations[0];
    expect(citation).toMatchObject({
      key: row.id,
      registerId: row.s5RegisterId,
      instrument: row.citation.instrument,
      clause: row.citation.clause,
      edition: row.citation.edition,
      jurisdiction: row.citation.jurisdiction,
      statusType: row.citation.statusType,
      effectiveDate: row.citation.effectiveDate,
      complianceDueDate: row.citation.complianceDueDate,
      dateNote: row.dateNotes,
      url: row.citation.url,
      retrieval: { state: "unverified" },
      legalReview: null
    });
    expect(citation?.retrieval.state === "unverified" && citation.retrieval.reason).toContain("2026-10-03");
    expect(entries.filter((entry) => entry.id === "us-ccpa-admt")).toEqual([]);
  });

  it("labels the FTC Act homepage as an unverified discovery locator requiring re-verification", () => {
    const catalog = loadCatalog();
    const citation = catalog.controls.get("L1-TECH-08")?.citations[0];
    const metadata = JSON.parse(read("docs/catalog/technology/instruments.json")) as {
      instruments: Array<{ id: string; url: string | null; status: string; reverify: boolean; reason: string }>;
    };
    const instrument = metadata.instruments.find((entry) => entry.id === "us-ftc-act");
    expect(citation).toMatchObject({ registerId: null, url: "https://www.ftc.gov/", retrieval: { state: "unverified" }, legalReview: null });
    expect(instrument).toMatchObject({ url: citation?.url, status: "unverified", reverify: true });
    expect(citation?.note).toMatch(/re-verification required/i);
    expect(citation?.retrieval.state === "unverified" && citation.retrieval.reason).toMatch(/discovery locator/i);
    expect(instrument?.reason).toMatch(/discovery locator/i);
  });

});
