import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DOC = "docs/source-reviews/GAP-0680-vellum-provider-drift.md";
const HOMEPAGE = "https://www.vellum.ai/";
const PRODUCT = "https://www.vellum.ai/product";
const MODEL_PROFILES = "https://www.vellum.ai/docs/key-concepts/model-profiles";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/api/benchmarkRouter.ts",
  "src/api/watchRouter.ts",
];

describe("GAP-0680 Vellum provider-drift boundary", () => {
  it("documents current Vellum live metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0680");
    expect(doc).toContain(HOMEPAGE);
    expect(doc).toContain(PRODUCT);
    expect(doc).toContain(MODEL_PROFILES);
    expect(doc).toContain("Personal AI");
    expect(doc).toContain("Personal Intelligence");
    expect(doc).toContain("Model Profiles");
    expect(doc).toContain("Quality Claude Opus");
    expect(doc).toContain("Balanced Claude Sonnet");
    expect(doc).toContain("Cost Optimized Claude Haiku");
    expect(doc).toContain("Action Overrides");
    expect(doc).toContain("v0.8.12");
    expect(doc).toContain("Jun 12, 2026");
    expect(doc).toContain("No live Vellum prompt-workflows or evals provider-drift page was found");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("does not turn stale competitor metadata into a Vellum provider-drift implementation", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("skipped as provider-drift implementation evidence");
    expect(doc).toContain("Vellum product metadata alone must fail closed");
    expect(doc).toContain("No Vellum provider-drift adapter, model-profile importer, action-override importer");
  });

  it("keeps Vellum identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("Vellum");
      expect(source).not.toContain("vellum_provider_drift");
      expect(source).not.toContain("vellum.ai");
    }
  });
});
