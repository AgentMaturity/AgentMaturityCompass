import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-1005-google-vertex-evaluation-public-methodology.md";
const ORIGINAL = "https://cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-overview";
const CANONICAL = "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/evaluation-overview";
const CONSOLE = "https://console.cloud.google.com/agent-platform/evaluation";
const CONSOLE_DOC = "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/evaluation-genai-console";
const SDK_DOC = "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/evaluation-genai-sdk";
const QUICK_NOTEBOOK =
  "https://github.com/GoogleCloudPlatform/generative-ai/blob/main/gemini/evaluation/quick_start_gen_ai_eval.ipynb";
const THIRD_PARTY_NOTEBOOK =
  "https://github.com/GoogleCloudPlatform/generative-ai/blob/main/gemini/evaluation/evaluating_third_party_llms_vertex_ai_gen_ai_eval_sdk.ipynb";
const MIGRATION_NOTEBOOK =
  "https://github.com/GoogleCloudPlatform/generative-ai/blob/main/gemini/evaluation/model_migration_with_gen_ai_eval.ipynb";
const IDENTIFIER = "google_vertex_ai_evaluation_public_methodology";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-1005 Google Vertex AI Evaluation public-methodology boundary", () => {
  it("documents live Google evaluation docs metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1005");
    expect(doc).toContain("Google Vertex AI Evaluation");
    expect(doc).toContain(ORIGINAL);
    expect(doc).toContain(CANONICAL);
    expect(doc).toContain(CONSOLE);
    expect(doc).toContain(CONSOLE_DOC);
    expect(doc).toContain(SDK_DOC);
    expect(doc).toContain(QUICK_NOTEBOOK);
    expect(doc).toContain(THIRD_PARTY_NOTEBOOK);
    expect(doc).toContain(MIGRATION_NOTEBOOK);
    expect(doc).toContain("HTTP/2 301");
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("last-modified: Tue, 23 Jun 2026 16:11:25 GMT");
    expect(doc).toContain("Last updated 2026-06-23 UTC");
    expect(doc).toContain("Gen AI evaluation service overview");
    expect(doc).toContain("Gemini Enterprise Agent Platform");
    expect(doc).toContain("Google Cloud Documentation");
    expect(doc).toContain("test-driven evaluation");
    expect(doc).toContain("adaptive rubrics");
    expect(doc).toContain("Evaluation dataset generation");
    expect(doc).toContain("Supported interfaces");
    expect(doc).toContain("Use cases");
    expect(doc).toContain("Evaluation workflow");
    expect(doc).toContain("Evaluation metrics");
    expect(doc).toContain("Adaptive rubrics example");
    expect(doc).toContain("Getting started with evaluations");
    expect(doc).toContain("Supported regions");
    expect(doc).toContain("Available notebooks");
    expect(doc).toContain("Google Cloud console");
    expect(doc).toContain("Python SDK");
    expect(doc).toContain("production logs");
    expect(doc).toContain("Create an evaluation dataset");
    expect(doc).toContain("Define evaluation metrics");
    expect(doc).toContain("Generate model responses");
    expect(doc).toContain("Run the evaluation");
    expect(doc).toContain("rubric-based metrics");
    expect(doc).toContain("Adaptive rubrics (recommended)");
    expect(doc).toContain("Static rubrics");
    expect(doc).toContain("Computation-based metrics");
    expect(doc).toContain("Custom function metrics");
    expect(doc).toContain("Pass");
    expect(doc).toContain("Fail");
    expect(doc).toContain("66.7%");
    expect(doc).toContain("RubricMetric.GENERAL_QUALITY");
    expect(doc).toContain("GenAI Client in Agent Platform SDK");
    expect(doc).toContain("Recommended");
    expect(doc).toContain("Preview");
    expect(doc).toContain("Evaluation module in Agent Platform SDK");
    expect(doc).toContain("GA");
    expect(doc).toContain("EvalTask");
    expect(doc).toContain("backward compatibility");
    expect(doc).toContain("no longer under active development");
    expect(doc).toContain("Getting Started: Quick Gen AI Evaluation");
    expect(doc).toContain("Evaluating third-party models");
    expect(doc).toContain("Model migration");
    expect(doc).toContain("Gemini 2.0 Flash");
    expect(doc).toContain("Gemini 2.5 Flash");
    expect(doc).toContain("multi-candidate evaluation");
    expect(doc).toContain("in-notebook visualization");
    expect(doc).toContain("asynchronous batch evaluation");
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

  it("keeps Google evaluation docs out of public methodology semantics for this gap", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain(
      "No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed",
    );
    expect(doc).toContain(
      "Google Vertex AI Evaluation docs alone cannot justify a public methodology version bump",
    );
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(ORIGINAL);
    expect(manifestText).not.toContain(CANONICAL);
    expect(manifestText).not.toContain("Google Vertex AI Evaluation");
    expect(manifestText).not.toContain("Gen AI evaluation service overview");
    expect(manifestText).not.toContain(IDENTIFIER);
  });

  it("keeps source-specific Google evaluation identifiers out of implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(ORIGINAL);
      expect(source).not.toContain(CANONICAL);
      expect(source).not.toContain("Google Vertex AI Evaluation");
      expect(source).not.toContain("Gen AI evaluation service overview");
      expect(source).not.toContain("RubricMetric.GENERAL_QUALITY");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
