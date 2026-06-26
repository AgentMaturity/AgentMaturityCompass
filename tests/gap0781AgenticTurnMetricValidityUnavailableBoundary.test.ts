import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0781-agentic-turn-metric-validity-unavailable.md";
const DOI = "10.3389/frai.2025.1728738";
const OPENALEX = "W7122443558";
const TITLE = "From the logic of coordination to goal-directed reasoning: the agentic turn in artificial intelligence";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/diagnostic/questionBank.ts",
];

describe("GAP-0781 agentic turn metric-validity unavailable-source boundary", () => {
  it("documents failed live retrieval and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0781");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain("source unavailable");
    expect(doc).toContain("exact-title search");
    expect(doc).toContain("DOI search");
    expect(doc).toContain("OpenAlex search");
    expect(doc).toContain("direct DOI opening produced no usable primary/source page");
    expect(doc).toContain("skipped as metric-validity implementation evidence");
    expect(doc).toContain("logic of coordination");
    expect(doc).toContain("goal-directed reasoning");
    expect(doc).toContain("agentic turn");
    expect(doc).toContain("agency");
    expect(doc).toContain("artificial life");
    expect(doc).toContain("cognitive science");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("keeps unavailable agentic-turn metadata out of public metric-validity semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("Unavailable paper metadata alone must fail closed");
    expect(doc).toContain("validation table");
    expect(doc).toContain("confidence interval");
    expect(doc).toContain("sample size");
    expect(doc).toContain("metric owner");
    expect(doc).toContain("No agentic-turn metric-validity adapter");
    expect(doc).toContain("No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, API, CLI, Studio, or scoring code changed");

    expect(manifestText).not.toContain(DOI);
    expect(manifestText).not.toContain(OPENALEX);
    expect(manifestText).not.toContain("agentic_turn_metric_validity");
  });

  it("keeps source-specific identifiers out of metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("agentic_turn_metric_validity");
    }
  });
});
