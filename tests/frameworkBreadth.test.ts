import { describe, expect, test } from "vitest";
import { builtInComplianceMappings, defaultComplianceMapsFile } from "../src/compliance/builtInMappings.js";
import { familyReview, frameworkChoices, getFrameworkFamily } from "../src/compliance/frameworks.js";
import { REGULATORY_REGISTER } from "../src/compliance/regulatory/index.js";
import { FRAMEWORK_STATIONS } from "../src/compliance/stationTags.js";
import {
  buildControlCrosswalkReceipt,
  mappingSourceCitations,
  renderControlCrosswalkAuditExport,
  verifyControlCrosswalkReceipt,
  type ControlCrosswalkReceipt,
} from "../src/compliance/controlCrosswalk.js";
import { complianceMapsSchema, type ComplianceMapping } from "../src/compliance/mappingSchema.js";

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

// P1-45: truth rule 8 and the currency flags the strategy asks for.
describe("family review status", () => {
  test.each(frameworkChoices())("%s is experimental with no expert sign-off (D-08 placeholder)", (framework) => {
    const review = familyReview(framework);
    expect(review.status).toBe("experimental");
    expect(review.expertSignOff).toBeNull();
  });

  test("HHS HTI-1 is flagged at risk from an HTI-5 final rule", () => {
    expect(familyReview("HHS_HTI_1").flags.join(" ")).toContain("At risk: an HTI-5 final rule may delete model-card requirements; re-verify before publishing.");
  });

  test("Colorado records the retrieval date of the SB26-189 text and asks for re-verification", () => {
    const flags = familyReview("CO_AI_ACT").flags.join(" ");
    expect(flags).toContain("SB26-189 publisher page and act were captured on 2026-10-19");
    expect(flags).toContain("remain unverified under the source-text policy");
    expect(flags).toContain("current-law applicability review remain pending");
    expect(flags).toContain("re-verify before publishing");
    const sources = builtInComplianceMappings.filter((row) => row.framework === "CO_AI_ACT").flatMap((row) => row.sources ?? []);
    expect(new Set(sources.map((source) => source.retrievedAt))).toEqual(new Set(["2026-10-04"]));
  });

  test("Korea says its pinpoints were not verified against an official text", () => {
    expect(familyReview("KR_AI_BASIC_ACT").flags.join(" ")).toContain("The Art. 31-35 pinpoints were not verified against an official text");
  });

  test("ISO/IEC 42001 says its ISO 42005 and 42006 categories are unverified", () => {
    expect(getFrameworkFamily("ISO_42001").displayName).toContain("unverified: source unreachable");
    expect(familyReview("ISO_42001").flags.join(" ")).toContain("an alias with zero mapped controls");
  });

  // Stations come from the register entry for the same instrument, not from a hand-typed list.
  test.each([["DORA", ["eu-dora"]], ["NIS2", ["eu-nis2"]], ["HHS_HTI_1", ["us-onc-hti1-dsi"]], ["NIST_AI_600_1", ["us-nist-ai-600-1"]],
    ["CO_AI_ACT", ["us-co-sb26-189"]], ["TX_TRAIGA", ["us-tx-traiga"]], ["CA_AI_LAWS", ["us-ca-sb53", "us-ca-ab2013", "us-ca-cppa-admt"]],
    ["KR_AI_BASIC_ACT", ["kr-ai-basic-act"]]] as const)("%s stations equal register entries %j", (framework, ids) => {
    const register = new Set(REGULATORY_REGISTER.entries.filter((entry) => (ids as readonly string[]).includes(entry.id)).flatMap((entry) => entry.stations));
    expect(new Set(FRAMEWORK_STATIONS[framework])).toEqual(register);
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
