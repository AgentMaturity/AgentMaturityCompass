import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const SOURCE_REVIEW_DOC = "docs/source-reviews/GAP-0661-trulens-metric-validity.md";
const REPO = "truera/trulens";
const HEAD_SHA = "3fb807eea0ddf25cac5e65b1418a5af33f719586";
const API_RESPONSE_HASH = "1982f0b09cb75a023c1c08a81d2dbc5aa7150dbb46df88ad03679438eb9f6b69";
const SELECTED_METADATA_HASH = "26ed935f2bee86149ad6df04bcb158cf10d179fe1c9b790398696e2adf76f895";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/badge/badgeCli.ts",
];

describe("GAP-0661 TruLens metric-validity source-review boundary", () => {
  it("records only live GitHub metadata facts, hashes, and no-copy provenance", () => {
    const doc = readFileSync(SOURCE_REVIEW_DOC, "utf8");

    expect(doc).toContain("Gap: `GAP-0661`");
    expect(doc).toContain("https://github.com/truera/trulens");
    expect(doc).toContain("refs/heads/main");
    expect(doc).toContain(`HEAD at retrieval: \`${HEAD_SHA}\``);
    expect(doc).toContain(`GitHub API response SHA-256 at retrieval: \`${API_RESPONSE_HASH}\``);
    expect(doc).toContain(`Selected canonical metadata SHA-256: \`${SELECTED_METADATA_HASH}\``);
    expect(doc).toContain("API `full_name`: `truera/trulens`");
    expect(doc).toContain("License metadata: `MIT`");
    expect(doc).toContain("Evaluation and Tracking for LLM Experiments and AI Agents");
    expect(doc).toContain("3,392 stars; 302 forks; 108 open issues");
    expect(doc).toContain("not archived, not disabled");
    expect(doc).toContain("No TruLens code, README prose, documentation prose, examples, prompts, configs, tests");
  });

  it("fails closed as metadata-only while preserving existing evaluator and trace primitives", () => {
    const doc = readFileSync(SOURCE_REVIEW_DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("Decision: relevant source-review signal, but fail-closed metadata-only review; no implementation added.");
    expect(doc).toContain("No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`");
    expect(doc).toContain("No TruLens subsystem, SDK/importer, adapter, evaluator clone, parity layer");
    expect(doc).toContain("metricValidation.rows[].evaluatorSuiteCoverage");
    expect(doc).toContain("metricValidation.rows[].traceEvaluationCoverage");

    expect(manifestText).toContain("evaluator_suite_coverage");
    expect(manifestText).toContain("trace_evaluation_coverage");
    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain("trulens_metric_validity");
    expect(manifestText).not.toContain("tru_lens");
  });

  it("keeps GAP-0661 TruLens identifiers out of source methodology, scoring, diagnostics, and badges", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("trulens_metric_validity");
      expect(source).not.toContain("tru_lens");
      expect(source).not.toContain("TruLens subsystem");
    }
  });
});
