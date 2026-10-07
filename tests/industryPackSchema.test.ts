import { describe, expect, test } from "vitest";
import * as industryPacksModule from "../src/domains/industryPacks.js";
import { INDUSTRY_PACKS, getIndustryPack, listIndustryPacks, scoreIndustryPack, type IndustryPack } from "../src/domains/industryPacks.js";
import {
  OFFICIAL_SOURCE_HOSTS,
  REGULATORY_STATUSES,
  isOfficialSourceUrl,
  resolveRegulatoryInstrument,
  validatePackRegulatoryCurrency,
  validateRegulatoryInstrument,
  type RegulatoryInstrument,
} from "../src/domains/packs/regulatorySchema.js";
import { REGULATORY_CATALOGUE } from "../src/domains/packs/regulatoryCatalogue.js";

/**
 * PackCurrencyFields v1, declared here exactly as the pack-audit side declares
 * it (structurally, not imported). Assigning a registry pack to it fails the
 * test typecheck if the S3 shape drifts (e.g. optional citation or an extra status).
 */
interface PackRegulatoryReferenceV1 {
  citation: string;
  jurisdiction?: string;
  url?: string;
  effectiveDate?: string;
  lastReviewed?: string;
  status?: "in-force" | "applies-from" | "proposed" | "repealed" | "unverified";
}
interface PackCurrencyFieldsV1 {
  version?: string;
  lastReviewed?: string;
  regulatoryReferences?: readonly PackRegulatoryReferenceV1[];
}

const packs = listIndustryPacks();
const AS_OF = new Date("2026-10-03T00:00:00Z");
const V1_STATUSES = ["in-force", "applies-from", "proposed", "repealed", "unverified"];

describe("industry pack schema", () => {
  test("registry shape: 41 packs, unique question ids, complete questions, thresholds in range", () => {
    expect(packs).toHaveLength(41);
    expect(Object.keys(INDUSTRY_PACKS)).toHaveLength(41);
    const ids = packs.flatMap((pack) => pack.questions.map((q) => q.id));
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes, "duplicate question ids").toEqual([]);
    for (const pack of packs) {
      expect(pack.certificationThreshold, pack.id).toBeGreaterThanOrEqual(50);
      expect(pack.certificationThreshold, pack.id).toBeLessThanOrEqual(95);
      for (const q of pack.questions) {
        expect(q.weight, q.id).toBeGreaterThan(0);
        for (const field of [q.dimension, q.text, q.regulatoryRef, q.l1, q.l3, q.l5]) expect(field.trim(), q.id).not.toBe("");
      }
    }
  });

  test("public surface keeps its names and signatures", () => {
    expect(Object.keys(industryPacksModule).sort()).toEqual([
      "INDUSTRY_PACKS", "getIndustryPack", "getIndustryPacksByStation", "getPackById", "getPacksForDomain",
      "getStationSummary", "listIndustryPackIds", "listIndustryPacks", "scoreIndustryPack", "sectorRiskToAgentRiskTier",
    ]);
    expect(getIndustryPack.length).toBe(1);
    expect(scoreIndustryPack.length).toBe(2);
    const pack = getIndustryPack("freight-3pl-warehouse");
    const mature = scoreIndustryPack(pack.id, Object.fromEntries(pack.questions.map((q) => [q.id, 5])));
    expect(mature.percentage).toBe(100);
    expect(mature.questionResults).toHaveLength(pack.questions.length);
  });

  test("getPackById refuses inherited property names (P0-23)", () => {
    for (const id of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      expect(industryPacksModule.getPackById(id), id).toBeUndefined();
    }
    expect(industryPacksModule.getPackById("clinical-trials")?.id).toBe("clinical-trials");
  });

  test("the status enum is exactly the PackCurrencyFields v1 enum", () => {
    expect([...REGULATORY_STATUSES]).toEqual(V1_STATUSES);
  });

  test("every pack carries version, lastReviewed and v1-conformant regulatory references", () => {
    const v1: PackCurrencyFieldsV1[] = packs; // compile-time contract check
    const problems: string[] = [];
    v1.forEach((fields, i) => {
      const id = packs[i]!.id;
      if (!fields.version) problems.push(`${id}: version missing`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.lastReviewed ?? "")) problems.push(`${id}: lastReviewed missing`);
      if (!fields.regulatoryReferences?.length) problems.push(`${id}: no regulatoryReferences`);
      for (const ref of fields.regulatoryReferences ?? []) {
        const at = `${id}: ${ref.citation}`;
        if (!ref.citation.trim()) problems.push(`${id}: empty citation`);
        if (!ref.jurisdiction?.trim()) problems.push(`${at}: empty jurisdiction`);
        if (!V1_STATUSES.includes(ref.status ?? "")) problems.push(`${at}: status ${ref.status} outside v1`);
        if (ref.status === "unverified" && (ref.url !== undefined || ref.effectiveDate !== undefined)) {
          problems.push(`${at}: unverified reference carries url/effectiveDate`);
        }
        if (ref.status !== "unverified" && !(ref.url && isOfficialSourceUrl(ref.url))) {
          problems.push(`${at}: url ${ref.url} is not on the official-source host allowlist`);
        }
      }
    });
    expect(problems).toEqual([]);
  });

  test("every catalogued instrument is valid, sourced from an official host or unverified", () => {
    const errors = REGULATORY_CATALOGUE.flatMap((inst) => validateRegulatoryInstrument(inst, AS_OF));
    expect(errors).toEqual([]);
    const ids = REGULATORY_CATALOGUE.map((inst) => inst.id);
    expect(new Set(ids).size).toBe(ids.length);
    const unverifiedCount = REGULATORY_CATALOGUE.filter((inst) => inst.status === "unverified").length;
    process.stdout.write(`instruments=${ids.length} sourced=${ids.length - unverifiedCount} unverified=${unverifiedCount}\n`);
  });
});

describe("regulatory-currency validator", () => {
  const pack = (): IndustryPack => packs.find((p) => p.id === "farm-to-fork")!;
  const verified: RegulatoryInstrument = {
    id: "x", citation: "X", jurisdiction: "EU", kind: "law", status: "in-force",
    lastReviewed: "2026-10-03", url: "https://eur-lex.europa.eu/x", retrievedAt: "2026-10-03", aliases: ["X"],
  };

  test("a pack without lastReviewed or version is rejected", () => {
    const { lastReviewed: _l, ...noReview } = pack();
    expect(validatePackRegulatoryCurrency(noReview as IndustryPack, AS_OF).join("\n")).toMatch(/lastReviewed is missing/);
    const { version: _v, ...noVersion } = pack();
    expect(validatePackRegulatoryCurrency(noVersion as IndustryPack, AS_OF).join("\n")).toMatch(/version is missing/);
  });

  test("a stale or future lastReviewed is rejected", () => {
    expect(validatePackRegulatoryCurrency({ ...pack(), lastReviewed: "2025-01-01" }, AS_OF).join("\n")).toMatch(/review due/);
    expect(validatePackRegulatoryCurrency({ ...pack(), lastReviewed: "2027-01-01" }, AS_OF).join("\n")).toMatch(/in the future/);
  });

  test("a verified status needs an official https source; unverified must carry none", () => {
    expect(validateRegulatoryInstrument(verified, AS_OF)).toEqual([]);
    expect(validateRegulatoryInstrument({ ...verified, url: undefined }, AS_OF).join("\n")).toMatch(/requires an https source url/);
    expect(validateRegulatoryInstrument({ ...verified, url: "https://example.com/x" }, AS_OF).join("\n")).toMatch(/not an https url on an official source host/);
    expect(validateRegulatoryInstrument({ ...verified, url: "http://eur-lex.europa.eu/x" }, AS_OF).join("\n")).toMatch(/official source host/);
    expect(validateRegulatoryInstrument({ ...verified, retrievedAt: undefined }, AS_OF).join("\n")).toMatch(/retrievedAt is missing/);
    const bare = { ...verified, status: "unverified" as const, url: undefined, retrievedAt: undefined };
    expect(validateRegulatoryInstrument(bare, AS_OF)).toEqual([]);
    expect(validateRegulatoryInstrument({ ...bare, url: "https://eur-lex.europa.eu/x" }, AS_OF).join("\n")).toMatch(/unverified" must not carry url/);
    expect(validateRegulatoryInstrument({ ...bare, effectiveDate: "2025-01-01" }, AS_OF).join("\n")).toMatch(/must not carry effectiveDate/);
    expect(validateRegulatoryInstrument({ ...verified, status: "repealed" }, AS_OF).join("\n")).toMatch(/requires supersededBy/);
  });

  test("the host allowlist matches exact hosts and subdomains only", () => {
    expect(OFFICIAL_SOURCE_HOSTS).toContain("europa.eu");
    expect(isOfficialSourceUrl("https://data.europa.eu/eli/reg/2024/1689/oj")).toBe(true);
    expect(isOfficialSourceUrl("https://www.iso.org/standard/27001")).toBe(true);
    expect(isOfficialSourceUrl("https://europa.eu.example.com/x")).toBe(false);
    expect(isOfficialSourceUrl("https://notiso.org/x")).toBe(false);
    expect(isOfficialSourceUrl("not a url")).toBe(false);
  });

  test("alias resolution matches whole citations only", () => {
    expect(resolveRegulatoryInstrument("GDPR Art. 9 (sensitive data)")?.id).toBe("eu-gdpr");
    expect(resolveRegulatoryInstrument("GDPRX")).toBeUndefined();
  });
});
