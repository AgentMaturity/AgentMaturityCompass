import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0672-graph-rag-agent-metric-validity.md";
const SOURCE = "1517005260/graph-rag-agent";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/badge/badgeCli.ts",
];

describe("GAP-0672 graph-rag-agent metric-validity boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0672");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain("master");
    expect(doc).toContain("MIT");
    expect(doc).toContain("2.2k");
    expect(doc).toContain("316 forks");
    expect(doc).toContain("GraphRAG");
    expect(doc).toContain("DeepSearch");
    expect(doc).toContain("evaluation framework");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("keeps graph-rag-agent as source-review context instead of metric-validity product code", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, docs methodology page, API, CLI, Studio, or scoring behavior changed");
    expect(doc).toContain("validation table artifact");
    expect(doc).toContain("metric owner");
    expect(doc).toContain("sample size");
    expect(doc).toContain("confidence interval");
    expect(doc).toContain("No GraphRAG/DeepSearch integration, importer, adapter, evaluation-framework wrapper");

    expect(manifestText).toContain("validation table");
    expect(manifestText).not.toContain(SOURCE);
    expect(manifestText).not.toContain("graph_rag_agent_metric_validity");
  });

  it("does not add graph-rag-agent identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain("graph_rag_agent_metric_validity");
      expect(source).not.toContain("GraphRAG DeepSearch");
    }
  });
});
