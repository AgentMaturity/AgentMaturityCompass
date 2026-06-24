import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0662-dspy-metric-validity.md";

const metricValidityFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
];

describe("GAP-0662 DSPy metric-validity source-review boundary", () => {
  it("documents DSPy live source context and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0662");
    expect(doc).toContain("https://dspy.ai");
    expect(doc).toContain("stanfordnlp/dspy");
    expect(doc).toContain("COMP-082");
    expect(doc).toContain("Evaluate");
    expect(doc).toContain("SemanticF1");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("keeps existing Mechanic DSPy export separate from metric-validity proof", () => {
    const doc = readFileSync(DOC, "utf8");
    const mechanicSource = readFileSync("src/mechanic/tuneExport.ts", "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(mechanicSource).toContain("exportAsDSPyTargets");
    expect(doc).toContain("The existing Mechanic DSPy target export remains a generic export format");
    expect(doc).toContain("not source-review proof");
    expect(doc).toContain("No DSPy SDK integration, importer, adapter, optimizer wrapper, evaluator wrapper");

    expect(manifestText).toContain("validation table");
    expect(manifestText).not.toContain("dspy_metric_validity");
    expect(manifestText).not.toContain("stanfordnlp/dspy");
  });

  it("does not add DSPy-specific metric-validity identifiers to methodology modules", () => {
    for (const path of metricValidityFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("dspy_metric_validity");
      expect(source).not.toContain("stanfordnlp/dspy");
      expect(source).not.toContain("COMP-082");
    }
  });
});
