import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DOC = "docs/source-reviews/GAP-0682-self-reflective-provider-drift-unavailable.md";
const DOI = "10.20944/preprints202603.0129.v1";
const OPENALEX = "W7133517221";
const TITLE = "A Self-Reflective Multi-Agent Collaboration Framework for Dynamic Software Engineering Tasks";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/api/benchmarkRouter.ts",
  "src/api/watchRouter.ts",
];

describe("GAP-0682 self-reflective provider-drift unavailable-source boundary", () => {
  it("documents failed live retrieval and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0682");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain("source unavailable");
    expect(doc).toContain("exact-title search");
    expect(doc).toContain("DOI search");
    expect(doc).toContain("OpenAlex search");
    expect(doc).toContain("Preprints manuscript search");
    expect(doc).toContain("skipped as provider-drift implementation evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("does not create provider-drift behavior from unavailable paper metadata", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("Unavailable paper metadata alone must fail closed");
    expect(doc).toContain("No self-reflective multi-agent provider-drift adapter");
    expect(doc).toContain("No `src/benchmarks/providerDriftBenchmark.ts`, `src/api/benchmarkRouter.ts`, `src/api/watchRouter.ts`, API, CLI, Studio, Watch monitor, Shield verifier, or scoring code changed");
  });

  it("keeps source-specific identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("self_reflective_provider_drift");
    }
  });
});
