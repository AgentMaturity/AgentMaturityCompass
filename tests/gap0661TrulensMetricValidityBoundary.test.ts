import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0661-trulens-metric-validity.md";
const SOURCE = "truera/trulens";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/badge/badgeCli.ts",
];

describe("GAP-0661 TruLens metric-validity source-review boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0661");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain("Evaluation and Tracking for LLM Experiments and AI Agents");
    expect(doc).toContain("MIT");
    expect(doc).toContain("TruLens 2.8.1");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("keeps TruLens as source-review context instead of metric-validity product code", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, docs methodology page, API, CLI, Studio, or scoring behavior changed");
    expect(doc).toContain("validation table artifact");
    expect(doc).toContain("metric owner");
    expect(doc).toContain("sample size");
    expect(doc).toContain("confidence interval");
    expect(doc).toContain("No TruLens SDK integration, importer, adapter, dashboard clone");

    expect(manifestText).toContain("validation table");
    expect(manifestText).not.toContain(SOURCE);
    expect(manifestText).not.toContain("trulens_metric_validity");
  });

  it("keeps source-specific identifiers out of implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain("trulens_metric_validity");
      expect(source).not.toContain("TruLens SDK");
    }
  });
});
