import { describe, expect, test } from "vitest";
import { getPackById } from "../src/domains/industryPacks.js";
import {
  buildIndustryPackAudit,
  verifyIndustryPackAudit,
  renderIndustryPackAuditMarkdown,
  normalizeAuditFramework,
  computePackCurrency,
  AUDIT_FRAMEWORKS,
  INDUSTRY_PACK_AUDIT_SCHEMA_VERSION,
  type IndustryPackAudit,
  type PackCurrencyFields,
} from "../src/domains/industryPackAudit.js";

const NOW = 1_700_000_000_000;

function pack() {
  const p = getPackById("clinical-trials");
  if (!p) throw new Error("expected clinical-trials pack to exist");
  return p;
}

function responsesAll(level: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const q of pack().questions) out[q.id] = level;
  return out;
}

describe("industry pack audit", () => {
  test("produces a deterministic, verifiable signed receipt", () => {
    const a = buildIndustryPackAudit({ pack: pack(), responses: responsesAll(3), now: NOW });
    const b = buildIndustryPackAudit({ pack: pack(), responses: responsesAll(3), now: NOW });
    expect(a.receiptHash).toBe(b.receiptHash);
    expect(a.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyIndustryPackAudit(a)).toBe(true);
    expect(a.generatedAt).toBe(new Date(NOW).toISOString());
  });

  test("detects tampering — any edit invalidates the receipt", () => {
    const audit = buildIndustryPackAudit({ pack: pack(), responses: responsesAll(3), now: NOW });
    const tampered: IndustryPackAudit = {
      ...audit,
      controls: audit.controls.map((c, i) => (i === 0 ? { ...c, level: 5, status: "PASS" as const } : c)),
    };
    expect(verifyIndustryPackAudit(tampered)).toBe(false);
  });

  test("maps every control across all frameworks plus the sector regulation", () => {
    const audit = buildIndustryPackAudit({ pack: pack(), responses: responsesAll(2), now: NOW });
    for (const c of audit.controls) {
      const frameworks = new Set(c.crosswalk.map((x) => x.framework));
      expect(frameworks.has("EU AI Act")).toBe(true);
      expect(frameworks.has("NIST AI RMF")).toBe(true);
      expect(frameworks.has("ISO 42001")).toBe(true);
      expect(frameworks.has("SOC 2")).toBe(true);
      expect(frameworks.has("Sector")).toBe(true);
    }
    const euCoverage = audit.frameworkCoverage.find((f) => f.framework === "EU AI Act");
    expect(euCoverage?.controls).toBe(audit.controls.length);
  });

  test("generates a concrete remediation for every control below PASS, none for PASS", () => {
    const gaps = buildIndustryPackAudit({ pack: pack(), responses: responsesAll(1), now: NOW });
    expect(gaps.overall.gapCount).toBe(gaps.controls.length);
    for (const c of gaps.controls) {
      expect(c.status).toBe("GAP");
      expect(c.remediation).not.toBeNull();
      expect(c.remediation?.generatedArtifact).toContain("target_level: 3");
      expect(c.remediation?.evidenceExpected.length).toBeGreaterThan(0);
    }

    const clean = buildIndustryPackAudit({ pack: pack(), responses: responsesAll(5), now: NOW });
    expect(clean.overall.passCount).toBe(clean.controls.length);
    expect(clean.overall.gapCount).toBe(0);
    for (const c of clean.controls) {
      expect(c.status).toBe("PASS");
      expect(c.remediation).toBeNull();
    }
    expect(clean.overall.percentage).toBeGreaterThanOrEqual(gaps.overall.percentage);
  });

  test("status thresholds: L5 PASS, L3 ADEQUATE, L1 GAP", () => {
    expect(buildIndustryPackAudit({ pack: pack(), responses: responsesAll(5), now: NOW }).controls[0]!.status).toBe("PASS");
    expect(buildIndustryPackAudit({ pack: pack(), responses: responsesAll(3), now: NOW }).controls[0]!.status).toBe("ADEQUATE");
    expect(buildIndustryPackAudit({ pack: pack(), responses: responsesAll(1), now: NOW }).controls[0]!.status).toBe("GAP");
  });

  test("framework filter narrows the crosswalk to one framework", () => {
    const audit = buildIndustryPackAudit({ pack: pack(), responses: responsesAll(2), now: NOW, frameworkFilter: "EU AI Act" });
    for (const c of audit.controls) {
      expect(c.crosswalk.every((x) => x.framework === "EU AI Act")).toBe(true);
    }
    expect(audit.frameworkCoverage).toHaveLength(1);
    expect(audit.frameworkCoverage[0]!.framework).toBe("EU AI Act");
  });

  test("normalizeAuditFramework resolves common aliases", () => {
    expect(normalizeAuditFramework("eu_ai_act")).toBe("EU AI Act");
    expect(normalizeAuditFramework("NIST")).toBe("NIST AI RMF");
    expect(normalizeAuditFramework("iso42001")).toBe("ISO 42001");
    expect(normalizeAuditFramework("soc2")).toBe("SOC 2");
    expect(normalizeAuditFramework("nonsense")).toBeUndefined();
    expect(AUDIT_FRAMEWORKS).toContain("EU AI Act");
  });

  test("renders an auditor-ready markdown report", () => {
    const md = renderIndustryPackAuditMarkdown(buildIndustryPackAudit({ pack: pack(), responses: responsesAll(1), now: NOW }));
    expect(md).toContain("# Industry Pack Audit — ");
    expect(md).toContain("## Framework coverage");
    expect(md).toContain("## Controls");
    expect(md).toContain("Receipt: `sha256:");
    expect(md).toContain("```yaml");
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDaysBefore = (days: number) => new Date(NOW - days * DAY_MS).toISOString().slice(0, 10);

function withCurrency(fields: PackCurrencyFields) {
  return { ...pack(), ...fields };
}

const FRESH_REF = { citation: "EU AI Act Annex III point 5(a)", jurisdiction: "EU", url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj", lastReviewed: isoDaysBefore(10), status: "in-force" as const };

describe("industry pack audit — regulatory currency", () => {
  test("a pack without currency fields (HEAD shape) is undated, never current", () => {
    const c = computePackCurrency(pack(), NOW);
    expect(c.status).toBe("undated");
    expect(c.missing).toEqual(["version", "lastReviewed", "regulatoryReferences"]);
    expect(c.packLastReviewed).toBeNull();
    expect(c.referenceCount).toBe(0);
  });

  test("a missing lastReviewed is reported even when references are present", () => {
    const c = computePackCurrency(withCurrency({ version: "2026.10", regulatoryReferences: [FRESH_REF] }), NOW);
    expect(c.status).toBe("undated");
    expect(c.missing).toEqual(["lastReviewed"]);
  });

  test("an unparseable or future lastReviewed counts as missing", () => {
    expect(computePackCurrency(withCurrency({ version: "1", lastReviewed: "not-a-date", regulatoryReferences: [FRESH_REF] }), NOW).missing).toEqual(["lastReviewed"]);
    expect(computePackCurrency(withCurrency({ version: "1", lastReviewed: isoDaysBefore(-30), regulatoryReferences: [FRESH_REF] }), NOW).missing).toEqual(["lastReviewed"]);
  });

  test("a pack reviewed longer ago than staleAfterDays is stale, age measured from now", () => {
    const c = computePackCurrency(withCurrency({ version: "1", lastReviewed: isoDaysBefore(400), regulatoryReferences: [FRESH_REF] }), NOW);
    expect(c.status).toBe("stale");
    expect(c.packAgeDays).toBe(400);
    expect(c.staleAfterDays).toBe(365);
    expect(computePackCurrency(withCurrency({ version: "1", lastReviewed: isoDaysBefore(400), regulatoryReferences: [FRESH_REF] }), NOW, { staleAfterDays: 500 }).status).toBe("current");
  });

  test("stale and undated references are listed by citation", () => {
    const c = computePackCurrency(withCurrency({
      version: "1",
      lastReviewed: isoDaysBefore(5),
      regulatoryReferences: [
        FRESH_REF,
        { ...FRESH_REF, citation: "HIPAA 45 CFR 164.312", lastReviewed: isoDaysBefore(500) },
        { citation: "GDPR Art. 9", status: "in-force" },
      ],
    }), NOW);
    expect(c.status).toBe("stale");
    expect(c.staleReferences).toEqual([{ citation: "HIPAA 45 CFR 164.312", lastReviewed: isoDaysBefore(500), ageDays: 500 }]);
    expect(c.undatedReferences).toEqual(["GDPR Art. 9"]);
  });

  test("an unverified reference makes an otherwise fresh pack 'unverified'; all fresh is 'current'", () => {
    const unverified = computePackCurrency(withCurrency({
      version: "1", lastReviewed: isoDaysBefore(5),
      regulatoryReferences: [FRESH_REF, { citation: "State AI law (draft)", lastReviewed: isoDaysBefore(5), status: "unverified" }],
    }), NOW);
    expect(unverified.status).toBe("unverified");
    expect(unverified.unverifiedReferences).toEqual(["State AI law (draft)"]);
    const current = computePackCurrency(withCurrency({ version: "1", lastReviewed: isoDaysBefore(5), regulatoryReferences: [FRESH_REF] }), NOW);
    expect(current.status).toBe("current");
    expect(current.missing).toEqual([]);
  });

  test("rejects a non-positive staleAfterDays instead of silently widening it", () => {
    expect(() => computePackCurrency(pack(), NOW, { staleAfterDays: 0 })).toThrow(RangeError);
    expect(() => buildIndustryPackAudit({ pack: pack(), responses: responsesAll(3), now: NOW, staleAfterDays: Number.NaN })).toThrow(RangeError);
  });

  test("currency is inside the signed receipt and rendered for the auditor", () => {
    const audit = buildIndustryPackAudit({ pack: pack(), responses: responsesAll(3), now: NOW });
    expect(INDUSTRY_PACK_AUDIT_SCHEMA_VERSION).toBe("amc.industry-pack-audit/2");
    expect(audit.schemaVersion).toBe("amc.industry-pack-audit/2");
    expect(audit.currency.status).toBe("undated");
    expect(verifyIndustryPackAudit(audit)).toBe(true);
    expect(verifyIndustryPackAudit({ ...audit, currency: { ...audit.currency, status: "current" } })).toBe(false);
    const md = renderIndustryPackAuditMarkdown(audit);
    expect(md).toContain("## Regulatory currency");
    expect(md).toContain("Status: **undated**");
    expect(md).toContain("Missing: version, lastReviewed, regulatoryReferences");
  });
});
