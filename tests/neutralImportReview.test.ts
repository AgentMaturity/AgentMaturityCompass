import { describe, expect, it } from "vitest";
import { renderNeutralImportReview } from "../src/console/assets/neutralImportReview.js";

function plan() {
  return {
    detectedAt: "2026-09-08T00:00:00.000Z", status: "ready", warnings: ["Missing fields remain unknown."],
    normalization: {
      normalizerVersion: "amc-neutral/2026-09-08", semanticDigest: "a".repeat(64),
      counts: { recognizedFiles: 1, skippedFiles: 1, malformedFiles: 1, unsupportedFiles: 0, oversizedFiles: 0,
        normalizedTraces: 1, failureTraces: 1, unknownTimestamps: 1, unknownDurations: 1 }, losses: ["No cost is inferred."],
      nextActions: [
        { label: "Apply reviewed import", argv: ["amc", "import", "/source", "--expected-digest", "a".repeat(64)] },
        { label: "Inspect options", argv: ["amc", "import", "--help"] }
      ],
      recordMapping: { schemaVersion: "amc-record-map/1", digestSha256: "b".repeat(64),
        counts: { records: 1, mapped: 1, retainedOnly: 0, malformed: 0, unsupported: 0, unlinkedTraces: 0 },
        sources: [{ path: "source.json", digest: "c".repeat(64), version: null, format: "json", disposition: "recognized", recordCount: 1 }],
        detailCoverage: { complete: true, emittedRecords: 1, omittedRecords: 0, omittedFields: 0, omittedTraceLinks: 0, boundedTextValues: 0 }, semantics: ["Source claims only."],
        records: [{ source: "source.json", pointer: "/0", sourceLine: null, disposition: "mapped", reason: "Source-reported failure.",
          fields: { projected: ["/0/input"], retainedOnly: ["/0/extra"], partial: ["/0/metadata"], redactionMarkers: ["/0/metadata"], omitted: 0 },
          traces: [{ index: 0, traceId: "failed", sourceTime: null, sourceTimeStatus: "absent", durationMs: null, failure: true }], omittedTraceLinks: 0 }]
      }
    }
  };
}

describe("Studio import record review", () => {
  it("makes version, source failures, unknown timing, retained fields and next action visible without JSON-only inspection", () => {
    const html = renderNeutralImportReview(plan());
    expect(html).toContain("SELF_REPORTED · NOT_EVALUATED");
    expect(html).toContain("amc-record-map/1");
    expect(html).toContain("source-reported failure");
    expect(html).toContain("unknown — no duration inferred");
    expect(html).toContain("cost not normalized");
    expect(html).toContain("Source fields outside this record’s primary trace projection");
    expect(html).toContain("/0/extra");
    expect(html).toContain("Ingest/review time: 2026-09-08T00:00:00.000Z");
    expect(html).toContain("unversioned or unknown");
    expect(html).toContain("--expected-digest");
    expect(html).not.toContain("0 ms");
  });

  it("escapes hostile filenames, source messages, field names and follow-up argv as inert display data", () => {
    const value = plan(); const hostile = '</summary><img src=x onerror="globalThis.compromised=true"><script>execute()</script>';
    value.normalization.recordMapping.sources[0].path = hostile;
    value.normalization.recordMapping.records[0].source = hostile;
    value.normalization.recordMapping.records[0].reason = hostile;
    value.normalization.recordMapping.records[0].fields.retainedOnly = [hostile];
    value.normalization.nextActions[0] = { label: hostile, argv: ["amc", "import", "$(touch owned);" + hostile] };
    const html = renderNeutralImportReview(value);
    expect(html).not.toContain("<img"); expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;img"); expect(html).toContain("&quot;");
    expect(html).toContain("$(touch owned);"); // visible copy data, never executable DOM or a command handler
    expect(html).not.toMatch(/<(?:button|a)\b[^>]*(?:onclick|href|data-command)/i);
  });

  it("does not invite reapplying a saved import and treats legacy detail as unavailable", () => {
    const saved = renderNeutralImportReview(plan(), { applied: true });
    expect(saved).toContain("Import saved as source claims");
    expect(saved).not.toContain("--expected-digest");
    expect(saved).toContain("Inspect options");
    expect(renderNeutralImportReview({})).toContain("Legacy receipt");
    const old = plan(); delete (old.normalization as Partial<typeof old.normalization>).recordMapping;
    expect(renderNeutralImportReview(old)).toContain("no per-record mapping detail");
  });

  it("labels receipt truncation and the separate UI display limit without pretending hidden records were examined", () => {
    const value = plan(), mapping = value.normalization.recordMapping;
    mapping.records = Array.from({ length: 103 }, (_, index) => ({ ...mapping.records[0], pointer: `/${index}` }));
    mapping.detailCoverage = { complete: false, emittedRecords: 103, omittedRecords: 20, omittedFields: 2, omittedTraceLinks: 1, boundedTextValues: 0 };
    const html = renderNeutralImportReview(value);
    expect(html).toContain("20 omitted by receipt limits");
    expect(html).toContain("Showing the first 100 of 103 retained details");
    expect(html).toContain("Detail coverage: partial");
    expect(html).not.toContain("/102");
  });
});
