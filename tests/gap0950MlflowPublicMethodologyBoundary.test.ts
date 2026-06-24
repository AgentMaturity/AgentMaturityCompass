import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0950-mlflow-public-methodology.md";
const REPO = "mlflow/mlflow";
const URL = "https://github.com/mlflow/mlflow";
const DOCS = "https://mlflow.org/docs/latest/genai/";
const EVAL_DOCS = "https://mlflow.org/docs/latest/genai/eval-monitor/";
const TRACING_DOCS = "https://mlflow.org/docs/latest/genai/tracing/";
const IDENTIFIER = "mlflow_public_methodology";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0950 MLflow public-methodology boundary", () => {
  it("documents live MLflow metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0950");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(EVAL_DOCS);
    expect(doc).toContain(TRACING_DOCS);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("Star 26.7k");
    expect(doc).toContain("Fork 5.9k");
    expect(doc).toContain("Issues 1.4k");
    expect(doc).toContain("Pull requests 561");
    expect(doc).toContain("12,569 Commits");
    expect(doc).toContain("Apache-2.0 license");
    expect(doc).toContain("The Open Source AI Engineering Platform for Agents, LLMs & Models");
    expect(doc).toContain("over 60 million monthly downloads");
    expect(doc).toContain("production-grade observability");
    expect(doc).toContain("evaluation");
    expect(doc).toContain("prompt management");
    expect(doc).toContain("prompt optimization");
    expect(doc).toContain("AI Gateway");
    expect(doc).toContain("MLflow: AI Engineering Platform for LLMs and Agents");
    expect(doc).toContain("over 30 million monthly downloads");
    expect(doc).toContain("20K+ GitHub Stars");
    expect(doc).toContain("50M+ monthly downloads");
    expect(doc).toContain("OpenTelemetry");
    expect(doc).toContain("vendor-neutral");
    expect(doc).toContain("Complete Observability");
    expect(doc).toContain("prompts, retrievals, tool calls, and LLM responses");
    expect(doc).toContain("Evaluation & Monitoring");
    expect(doc).toContain("LLM-as-a-judge");
    expect(doc).toContain("custom metrics");
    expect(doc).toContain("Evaluation-Driven Development");
    expect(doc).toContain("Dataset Management");
    expect(doc).toContain("Human Feedback");
    expect(doc).toContain("Systematic Evaluation");
    expect(doc).toContain("Production Monitoring");
    expect(doc).toContain("Evaluation Datasets");
    expect(doc).toContain("latency and token usage");
    expect(doc).toContain("Dataset");
    expect(doc).toContain("Scorer");
    expect(doc).toContain("Predict Function");
    expect(doc).toContain("public methodology versioning");
    expect(doc).toContain("methodology version");
    expect(doc).toContain("changelog");
    expect(doc).toContain("deprecation notice");
    expect(doc).toContain("migration guidance");
    expect(doc).toContain("No public methodology version bump");
    expect(doc).toContain("skipped as public-methodology implementation evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("keeps MLflow platform metadata out of public methodology semantics for this gap", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("MLflow platform metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain(IDENTIFIER);
  });

  it("keeps source-specific MLflow identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
