import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0729-workflow-optimization-public-methodology.md";
const SOURCE = "https://arxiv.org/abs/2603.22386";
const DOI = "10.48550/arxiv.2603.22386";
const OPENALEX = "W7140304056";
const TITLE = "From Static Templates to Dynamic Runtime Graphs: A Survey of Workflow Optimization for LLM Agents";

const methodologyFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/badge/badgeCli.ts",
];

describe("GAP-0729 workflow-optimization public-methodology boundary", () => {
  it("documents live arXiv metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0729");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Ling Yue");
    expect(doc).toContain("Kushal Raj Bhandari");
    expect(doc).toContain("Ching-Yun Ko");
    expect(doc).toContain("Dhaval Patel");
    expect(doc).toContain("Pin-Yu Chen");
    expect(doc).toContain("Shaowu Pan");
    expect(doc).toContain("2026-03-23");
    expect(doc).toContain("workflow optimization");
    expect(doc).toContain("static templates");
    expect(doc).toContain("dynamic runtime graphs");
    expect(doc).toContain("workflow graphs");
    expect(doc).toContain("runtime adaptation");
    expect(doc).toContain("methodology version");
    expect(doc).toContain("changelog");
    expect(doc).toContain("deprecation notice");
    expect(doc).toContain("migration guidance");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("does not create an AMC public-methodology version bump from survey metadata", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, API, CLI, Studio, diagnostic question bank, scoring code");
    expect(doc).toContain("survey labels are not accepted as public methodology proof without AMC-owned methodology receipts");
    expect(doc).toContain("No workflow-optimization taxonomy, graph runtime, agentic computation graph engine, orchestration engine");

    expect(manifestText).not.toContain(SOURCE);
    expect(manifestText).not.toContain(DOI);
    expect(manifestText).not.toContain(OPENALEX);
    expect(manifestText).not.toContain("workflow_optimization_public_methodology");
    expect(manifestText).not.toContain("dynamic_runtime_graphs");
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of methodologyFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("workflow_optimization_public_methodology");
      expect(source).not.toContain("dynamic_runtime_graphs");
    }
  });
});
