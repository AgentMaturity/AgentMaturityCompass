import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0774-thinking-machines-metric-validity-unavailable.md";
const DOI = "10.3390/bdcc10010038";
const OPENALEX = "W4414988547";
const TITLE = "Thinking Machines: Mathematical Reasoning in the Age of LLMs";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/diagnostic/questionBank.ts",
];

describe("GAP-0774 Thinking Machines metric-validity unavailable-source boundary", () => {
  it("documents failed live retrieval and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0774");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain("source unavailable");
    expect(doc).toContain("exact-title search");
    expect(doc).toContain("DOI search");
    expect(doc).toContain("OpenAlex search");
    expect(doc).toContain("direct DOI opening was blocked");
    expect(doc).toContain("skipped as metric-validity implementation evidence");
    expect(doc).toContain("mathematical reasoning");
    expect(doc).toContain("deductive reasoning");
    expect(doc).toContain("symbolic tasks");
    expect(doc).toContain("mathematical logic");
    expect(doc).toContain("cognitive science");
    expect(doc).toContain("computational models");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("keeps unavailable mathematical-reasoning metadata out of public metric-validity semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("Unavailable paper metadata alone must fail closed");
    expect(doc).toContain("validation table");
    expect(doc).toContain("confidence interval");
    expect(doc).toContain("sample size");
    expect(doc).toContain("metric owner");
    expect(doc).toContain("No mathematical-reasoning metric-validity adapter");
    expect(doc).toContain("No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, API, CLI, Studio, or scoring code changed");

    expect(manifestText).not.toContain(DOI);
    expect(manifestText).not.toContain(OPENALEX);
    expect(manifestText).not.toContain("thinking_machines_metric_validity");
  });

  it("keeps source-specific identifiers out of metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("thinking_machines_metric_validity");
    }
  });
});
