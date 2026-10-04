import { describe, expect, test } from "vitest";
import { builtInComplianceMappings } from "../src/compliance/builtInMappings.js";
import { frameworkControls } from "../src/compliance/frameworks/controls.js";
import { getFrameworkFamily, normalizeFrameworkName } from "../src/compliance/frameworks.js";
import { frameworkControlSchema, type FrameworkControl } from "../src/compliance/mappingSchema.js";

// Publishers of the official texts the round-2 controls were read from.
const OFFICIAL_HOSTS = [
  "publications.europa.eu", "eur-lex.europa.eu", "nvlpubs.nist.gov", "www.ecfr.gov", "www.federalregister.gov",
  "leg.colorado.gov", "capitol.texas.gov", "leginfo.legislature.ca.gov", "cppa.ca.gov",
];
// Families the round-2 mappings were applied to; each must carry at least one verified clause.
const APPLIED_FRAMEWORKS = ["DORA", "NIS2", "NIST_AI_600_1", "NIST_AI_RMF", "CO_AI_ACT", "TX_TRAIGA", "CA_AI_LAWS", "HHS_HTI_1", "HIPAA"];

describe("clause-level framework controls", () => {
  test("every control passes the schema: source url, retrievedAt, verified, paraphrase flag", () => {
    const failures = frameworkControls
      .map((row) => ({ id: row.controlId, result: frameworkControlSchema.safeParse(row) }))
      .filter(({ result }) => !result.success)
      .map(({ id, result }) => `${id}: ${result.error?.issues.map((issue) => issue.message).join("; ")}`);
    expect(failures).toEqual([]);
  });

  test("control ids are unique", () => {
    const ids = frameworkControls.map((row) => `${row.framework}:${row.controlId}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("a category, when set, is one of the family's categories", () => {
    for (const row of frameworkControls.filter((r) => r.category !== null)) {
      expect(getFrameworkFamily(row.framework).categories, row.controlId).toContain(row.category);
    }
  });

  test("every mapped id is a built-in mapping", () => {
    const known = new Set(builtInComplianceMappings.map((row) => row.id));
    const missing = frameworkControls.flatMap((row) => row.mappings.filter((m) => !known.has(m.mappingId)).map((m) => `${row.controlId}->${m.mappingId}`));
    expect(missing).toEqual([]);
  });

  test("every control cites an official publisher", () => {
    for (const row of frameworkControls) {
      expect(OFFICIAL_HOSTS, `${row.controlId} ${row.sourceUrl}`).toContain(new URL(row.sourceUrl).host);
    }
  });

  test.each(APPLIED_FRAMEWORKS)("%s has at least one verified control", (framework) => {
    expect(frameworkControls.some((row) => row.framework === framework && row.verified)).toBe(true);
  });

  test("no framework carries controls without a verified one", () => {
    const frameworks = new Set(frameworkControls.map((row) => row.framework));
    for (const framework of frameworks) {
      expect(frameworkControls.some((row) => row.framework === framework && row.verified), framework).toBe(true);
    }
  });

  test("per-framework control and verified counts (apply/frameworks/counts.json, 2026-10-04)", () => {
    const counts: Record<string, [number, number]> = {};
    for (const row of frameworkControls) {
      const [total, verified] = counts[row.framework] ?? [0, 0];
      counts[row.framework] = [total + 1, verified + (row.verified ? 1 : 0)];
    }
    expect(counts).toEqual({
      DORA: [56, 55], NIS2: [89, 89], NIST_AI_600_1: [12, 12], NIST_AI_RMF: [49, 49], CO_AI_ACT: [11, 11],
      TX_TRAIGA: [10, 10], CA_AI_LAWS: [15, 15], HHS_HTI_1: [19, 19], HIPAA: [29, 29],
    });
  });

  test("HIPAA controls quote the proposed Security Rule (90 FR 898) and say so", () => {
    const hipaa = frameworkControls.filter((row) => row.framework === "HIPAA");
    expect(hipaa.length).toBeGreaterThan(0);
    for (const row of hipaa) expect(row.status, row.controlId).toBe("proposed");
  });

  test("ISO/IEC 42005 stays descoped: no control text and no resolution", () => {
    const cites42005 = frameworkControls.filter((row) => /42005/.test(`${row.controlId} ${row.title} ${row.text} ${row.sourceUrl}`));
    expect(cites42005.map((row) => row.controlId)).toEqual([]);
    for (const name of ["ISO/IEC 42005:2025", "ISO 42005", "iso42005", "ISO_42005"]) expect(normalizeFrameworkName(name)).toBeNull();
  });
});

describe("frameworkControlSchema", () => {
  const base: FrameworkControl = {
    controlId: "X-1", framework: "DORA", category: null, title: "t", text: "quoted", textKind: "verbatim", status: "law",
    sourceUrl: "https://publications.europa.eu/resource/celex/32022R2554", retrievedAt: "2026-10-03", verified: true, mappings: [],
  };

  test("accepts a verified verbatim control", () => {
    expect(frameworkControlSchema.safeParse(base).success).toBe(true);
  });

  test("rejects a paraphrase marked verified", () => {
    expect(frameworkControlSchema.safeParse({ ...base, textKind: "paraphrase" }).success).toBe(false);
    expect(frameworkControlSchema.safeParse({ ...base, textKind: "paraphrase", verified: false, unverifiedReason: "paraphrase" }).success).toBe(true);
  });

  test("rejects an unverified control that does not say why", () => {
    expect(frameworkControlSchema.safeParse({ ...base, verified: false }).success).toBe(false);
  });

  test.each(["sourceUrl", "retrievedAt", "verified"] as const)("rejects a control without %s", (field) => {
    const { [field]: _omitted, ...rest } = base;
    expect(frameworkControlSchema.safeParse(rest).success).toBe(false);
  });

  test("rejects an unknown framework id and an unknown coverage label", () => {
    expect(frameworkControlSchema.safeParse({ ...base, framework: "NYC_LL144" }).success).toBe(false);
    expect(frameworkControlSchema.safeParse({ ...base, mappings: [{ mappingId: "dora_art5_governance", coverage: "indirect" }] }).success).toBe(false);
  });
});
