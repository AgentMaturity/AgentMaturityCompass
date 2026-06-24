import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DOC = "docs/source-reviews/GAP-0931-awesome-agentops-landscape-provider-drift.md";
const REPO = "dyronrh/awesome-agentops-landscape";
const URL = "https://github.com/dyronrh/awesome-agentops-landscape";
const TITLE = "awesome-agentops-landscape";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

describe("GAP-0931 awesome-agentops-landscape provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0931");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("main");
    expect(doc).toContain("Star 13");
    expect(doc).toContain("Fork 4");
    expect(doc).toContain("Issues 2");
    expect(doc).toContain("Pull requests 1");
    expect(doc).toContain("95 Commits");
    expect(doc).toContain("README.md");
    expect(doc).toContain(".github/ workflows");
    expect(doc).toContain("assets");
    expect(doc).toContain("data");
    expect(doc).toContain("scripts");
    expect(doc).toContain("Last generated: 2026-06-20");
    expect(doc).toContain("GitHub Actions + GitHub API");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Packages 0");
    expect(doc).toContain("Python 100.0%");
    expect(doc).toContain("curated, research-driven list");
    expect(doc).toContain("AgentOps Landscape (2026)");
    expect(doc).toContain("Feature Benchmark");
    expect(doc).toContain("Tracing");
    expect(doc).toContain("Monitoring");
    expect(doc).toContain("Evaluation");
    expect(doc).toContain("Cost Tracking");
    expect(doc).toContain("Guardrails");
    expect(doc).toContain("OpenTelemetry");
    expect(doc).toContain("Langfuse");
    expect(doc).toContain("DeepEval");
    expect(doc).toContain("RAGAS");
    expect(doc).toContain("Provider and model drift benchmark");
    expect(doc).toContain("misclassified");
    expect(doc).toContain("skipped as provider-drift implementation evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("does not create provider-drift behavior from an awesome-list", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("Curated landscape metadata alone cannot justify a provider/model drift benchmark");
    expect(doc).toContain("No `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, `src/api/benchmarkRouter.ts`, API, CLI, Studio, Watch monitor, Shield verifier, or scoring code changed");
    expect(doc).toContain("No awesome-agentops-landscape adapter");
  });

  it("keeps source-specific identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("awesome_agentops_landscape_provider_drift");
    }
  });
});
