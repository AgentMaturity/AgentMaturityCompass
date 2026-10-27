import { describe, expect, test } from "vitest";
import { builtInComplianceMappings } from "../src/compliance/builtInMappings.js";
import { isSharedOfficialUrl } from "../src/compliance/citations/officialHosts.js";
import { frameworkControls } from "../src/compliance/frameworks/controls.js";
import { classifyFrameworkString, getFrameworkFamily, normalizeFrameworkName } from "../src/compliance/frameworks.js";
import { frameworkControlSchema, type FrameworkControl } from "../src/compliance/mappingSchema.js";

// Current source-text decisions: six families have supported text; three remain wholly unverified.
const TEXT_VERIFIED_FRAMEWORKS = ["NIS2", "NIST_AI_600_1", "NIST_AI_RMF", "TX_TRAIGA", "CA_AI_LAWS", "HIPAA"];
const UNVERIFIED_FRAMEWORKS = ["DORA", "CO_AI_ACT", "HHS_HTI_1"];

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

  test("every control cites an official publisher on the shared host list (P0-25)", () => {
    expect(frameworkControls.filter((row) => !isSharedOfficialUrl(row.sourceUrl)).map((row) => row.controlId)).toEqual([]);
  });

  test.each(TEXT_VERIFIED_FRAMEWORKS)("%s has current source-text-verified controls", (framework) => {
    expect(frameworkControls.some((row) => row.framework === framework && row.verified)).toBe(true);
  });

  test.each(UNVERIFIED_FRAMEWORKS)("%s retains only unverified controls with reasons", (framework) => {
    const rows = frameworkControls.filter((row) => row.framework === framework);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.verified, row.controlId).toBe(false);
      expect(row.unverifiedReason?.trim().length, row.controlId).toBeGreaterThan(0);
    }
  });

  test("source-text decisions cover every family and preserve retrieval provenance", () => {
    const frameworks = [...new Set(frameworkControls.map((row) => row.framework))].sort();
    expect(frameworks).toEqual([...TEXT_VERIFIED_FRAMEWORKS, ...UNVERIFIED_FRAMEWORKS].sort());
    for (const row of frameworkControls) {
      if (row.verified) expect(row.retrievedAt, row.controlId).toBe("2026-10-19");
      else expect(["2026-10-03", "2026-10-04"], row.controlId).toContain(row.retrievedAt);
    }
  });

  test("per-framework controls and current source-text-verified counts (2026-10-19)", () => {
    const counts: Record<string, [number, number]> = {};
    for (const row of frameworkControls) {
      const [total, verified] = counts[row.framework] ?? [0, 0];
      counts[row.framework] = [total + 1, verified + (row.verified ? 1 : 0)];
    }
    expect(counts).toEqual({
      DORA: [56, 0], NIS2: [89, 25], NIST_AI_600_1: [12, 10], NIST_AI_RMF: [49, 49], CO_AI_ACT: [11, 0],
      TX_TRAIGA: [10, 10], CA_AI_LAWS: [15, 5], HHS_HTI_1: [19, 0], HIPAA: [29, 13],
    });
  });

  test("HIPAA controls quote the proposed Security Rule (90 FR 898) and say so", () => {
    const hipaa = frameworkControls.filter((row) => row.framework === "HIPAA");
    expect(hipaa.length).toBeGreaterThan(0);
    for (const row of hipaa) expect(row.status, row.controlId).toBe("proposed");
  });

  test("ISO/IEC 42005 stays descoped: an alias with zero mapped controls and no resolution", () => {
    const cites42005 = frameworkControls.filter((row) => /42005/.test(`${row.controlId} ${row.title} ${row.text} ${row.sourceUrl}`));
    expect(cites42005.map((row) => row.controlId)).toEqual([]);
    for (const name of ["ISO/IEC 42005:2025", "ISO 42005", "iso42005", "ISO_42005", "iso-42005"]) {
      expect(normalizeFrameworkName(name)).toBeNull();
      expect(classifyFrameworkString(name)).toEqual({ framework: null, reason: "descoped-source-unreachable" });
    }
    expect(classifyFrameworkString("ISO/IEC 42001:2023").framework).toBe("ISO_42001");
  });

  // P1-45 review corrections: a pinpoint or a title never claims text the row does not quote.
  test("CA AB 2013 is pinned to the section chapeau it quotes, not to subdivision (a)", () => {
    const row = frameworkControls.find((control) => control.controlId.startsWith("CA-AB2013"))!;
    expect(row.controlId).toBe("CA-AB2013-CIV-3111");
    expect(row.text).toMatch(/^On or before January 1, 2026/);
    expect(row.title).toContain("section chapeau");
  });

  test("a time limit named in a title appears in the quoted text, unless the title says it is not quoted", () => {
    const units = /(\d+)(?:\s|-)(?:calendar )?(hours?|days?|months?|years?)/gi;
    const words: Record<string, string> = { 3: "three", 5: "five", 6: "six", 12: "twelve", 15: "fifteen", 24: "twenty-four", 30: "thirty", 72: "seventy-two" };
    const quoted = (text: string, n: string) => text.includes(n) || (words[n] !== undefined && text.toLowerCase().includes(words[n]!));
    const missing = frameworkControls.filter((row) => !/not quoted/.test(row.title)).flatMap((row) =>
      [...row.title.matchAll(units)].filter((match) => !quoted(row.text, match[1]!)).map((match) => `${row.controlId}: ${match[0]}`));
    expect(missing).toEqual([]);
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

  test("rejects an unknown framework id and an unknown relation", () => {
    expect(frameworkControlSchema.safeParse({ ...base, framework: "NYC_LL144" }).success).toBe(false);
    expect(frameworkControlSchema.safeParse({ ...base, mappings: [{ mappingId: "dora_art5_governance", relation: "indirect", rationale: "r" }] }).success).toBe(false);
  });
});
