import { describe, expect, test } from "vitest";
import { builtInComplianceMappings, defaultComplianceMapsFile } from "../src/compliance/builtInMappings.js";
import { coverageScore } from "../src/compliance/coverageScorer.js";
import { frameworkChoices, getFrameworkFamily } from "../src/compliance/frameworks.js";
import {
  buildControlCrosswalkReceipt,
  mappingSourceCitations,
  renderControlCrosswalkAuditExport,
  verifyControlCrosswalkReceipt,
  type ControlCrosswalkReceipt,
} from "../src/compliance/controlCrosswalk.js";
import { complianceMapsSchema, type ComplianceCategoryResult, type ComplianceCategoryStatus, type ComplianceMapping } from "../src/compliance/mappingSchema.js";

// Families added for the regulated-platform stations (same ids S5 uses as frameworkRef).
// ISO_42005 is not here: its text is not publicly readable (see docs/COMPLIANCE_MAPS.md).
const STATION_FRAMEWORKS = ["DORA", "NIS2", "HHS_HTI_1", "NIST_AI_600_1", "CO_AI_ACT", "TX_TRAIGA", "CA_AI_LAWS", "KR_AI_BASIC_ACT"];
// The twelve families and their mapping counts at 8f57ce63; the new families append after them.
const BASE_FRAMEWORK_COUNTS: Record<string, number> = {
  SOC2: 5, NIST_AI_RMF: 4, ISO_27001: 5, ISO_42001: 11, EU_AI_ACT: 12, GDPR: 13,
  MITRE_ATLAS: 8, OWASP_API_TOP10: 10, HIPAA: 10, SOX: 9, FEDRAMP: 10, PCI_DSS: 4,
};

describe("framework breadth", () => {
  const mappings = defaultComplianceMapsFile().complianceMaps.mappings;

  test("existing families keep their order and mappings; new families are appended", () => {
    const base = Object.keys(BASE_FRAMEWORK_COUNTS);
    expect(frameworkChoices().slice(0, base.length)).toEqual(base);
    expect(frameworkChoices().slice(base.length)).toEqual(STATION_FRAMEWORKS);
    for (const [framework, count] of Object.entries(BASE_FRAMEWORK_COUNTS)) {
      expect(mappings.filter((row) => row.framework === framework).length, framework).toBe(count);
    }
    expect(() => complianceMapsSchema.parse(defaultComplianceMapsFile())).not.toThrow();
  });

  test.each(STATION_FRAMEWORKS)("%s has at least four sourced mappings, each with related questions", (framework) => {
    const rows = mappings.filter((row) => row.framework === framework);
    expect(rows.length).toBeGreaterThanOrEqual(4);
    for (const row of rows) {
      expect(getFrameworkFamily(framework).categories, row.id).toContain(row.category);
      expect(row.related.questions.length, `${row.id} related.questions`).toBeGreaterThan(0);
      expect(row.sources?.length ?? 0, `${row.id} sources`).toBeGreaterThan(0);
    }
  });

  test("PCI DSS is labelled with the current version", () => {
    expect(getFrameworkFamily("PCI_DSS").displayName).toMatch(/^PCI DSS v4\.0\.1 /);
  });
});

const HASH = "a".repeat(64);
const mappings = builtInComplianceMappings.filter((row) => STATION_FRAMEWORKS.includes(row.framework));

function build(input: { mappings: ComplianceMapping[]; citations?: ReturnType<typeof mappingSourceCitations> }): ControlCrosswalkReceipt {
  const ids = input.mappings.map((row) => row.id);
  return buildControlCrosswalkReceipt({
    receiptId: "s6-crosswalk",
    generatedAt: "2026-10-03T00:00:00.000Z",
    mappings: input.mappings,
    sourceCitations: input.citations ?? mappingSourceCitations(input.mappings),
    ownersByMappingId: Object.fromEntries(ids.map((id) => [id, "grc-owner"])),
    evidenceByMappingId: Object.fromEntries(ids.map((id) => [id, [{ eventId: `ev-${id}`, eventHash: HASH, evidenceType: "audit", signedEvidenceRef: `ledger:${id}` }]])),
  });
}

describe("control crosswalk over sourced mappings", () => {
  test("derives one citation per official source, each with url and retrievedAt", () => {
    const citations = mappingSourceCitations(mappings);
    expect(citations.length).toBeGreaterThan(0);
    expect(new Set(citations.map((c) => c.sourceId)).size).toBe(citations.length);
    for (const citation of citations) {
      expect(citation.url).toMatch(/^https:\/\//);
      expect(citation.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("each row cites only its own mapping's sources", () => {
    const receipt = build({ mappings });
    expect(receipt.failClosed).toBe(false);
    for (const row of receipt.rows) {
      const mapping = mappings.find((m) => m.id === row.mappingId)!;
      const expected = mappingSourceCitations([mapping]).map((c) => c.sourceId);
      expect(row.sourceCitationIds).toEqual(expected);
    }
  });

  test("round-trips through JSON and stays verifiable; tampering is detected", () => {
    const receipt = build({ mappings });
    const copy = JSON.parse(JSON.stringify(receipt)) as ControlCrosswalkReceipt;
    expect(verifyControlCrosswalkReceipt(copy)).toEqual({ valid: true, reasons: [] });
    expect(copy).toEqual(receipt);

    const tampered = JSON.parse(JSON.stringify(receipt)) as ControlCrosswalkReceipt;
    tampered.rows[0]!.frameworkClause = "Art. 1 Subject matter";
    expect(verifyControlCrosswalkReceipt(tampered).valid).toBe(false);

    const exported = renderControlCrosswalkAuditExport(receipt);
    for (const citation of receipt.sourceCitations) expect(exported).toContain(citation.url);
  });

  test("fails closed when a row's own source is not among the receipt citations", () => {
    const receipt = build({ mappings, citations: [{ sourceId: "other", title: "Other", url: "https://example.org", retrievedAt: "2026-10-03" }] });
    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons.some((reason) => reason.endsWith(":sourceCitations:unlisted"))).toBe(true);
  });

  test("mappings without their own sources keep citing every receipt source", () => {
    const legacy = builtInComplianceMappings.find((row) => row.id === "soc2_security")!;
    const citations = [{ sourceId: "aicpa-tsc", title: "AICPA TSC", url: "https://www.aicpa-cima.com", retrievedAt: "2026-10-03" }];
    const receipt = build({ mappings: [legacy], citations });
    expect(receipt.rows[0]!.sourceCitationIds).toEqual(["aicpa-tsc"]);
    expect(receipt.failClosed).toBe(false);
  });
});

function row(id: string, status: ComplianceCategoryStatus): ComplianceCategoryResult {
  return { id, framework: "DORA", category: "Art. 9 Protection and prevention", description: "d", status, reasons: [], evidenceRefs: [], neededToSatisfy: [] };
}

describe("coverageScore", () => {
  test("weights satisfied 1, partial 0.5, missing 0", () => {
    expect(coverageScore([row("a", "SATISFIED"), row("b", "PARTIAL"), row("c", "MISSING")])).toEqual({
      satisfied: 1, partial: 1, missing: 1, unknown: 0, score: 0.5
    });
  });

  test("an UNKNOWN control earns no credit", () => {
    expect(coverageScore([row("a", "UNKNOWN")]).score).toBe(0);
    expect(coverageScore([row("a", "SATISFIED"), row("b", "UNKNOWN")]).score).toBe(0.5);
  });

  test("an empty result scores zero", () => {
    expect(coverageScore([]).score).toBe(0);
  });

  test.each(["", "   "])("refuses a row whose control id is %j", (id) => {
    expect(() => coverageScore([row("a", "SATISFIED"), row(id, "SATISFIED")])).toThrow(/control id/);
  });
});
