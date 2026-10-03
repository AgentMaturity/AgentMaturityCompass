import { describe, expect, test } from "vitest";
import { builtInComplianceMappings } from "../src/compliance/builtInMappings.js";
import {
  buildControlCrosswalkReceipt,
  mappingSourceCitations,
  renderControlCrosswalkAuditExport,
  verifyControlCrosswalkReceipt,
  type ControlCrosswalkReceipt,
} from "../src/compliance/controlCrosswalk.js";
import type { ComplianceMapping } from "../src/compliance/mappingSchema.js";

const HASH = "a".repeat(64);
const mappings = builtInComplianceMappings.filter((row) => ["DORA", "NIS2", "ONC_HTI_1"].includes(row.framework));

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
