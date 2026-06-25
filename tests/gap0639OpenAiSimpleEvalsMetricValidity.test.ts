import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { badgeSourceReviewNotice, badgeUrl } from "../src/badge/badgeCli.js";
import {
  AMC_PUBLIC_METHODOLOGY_VERSION,
  getPublicMethodologyManifest,
  getPublicMethodologyReference,
  renderPublicMethodologyMarkdown
} from "../src/methodology/publicMethodology.js";
import {
  buildDiagnosticMethodologyVersioningReceipt,
  OPENAI_SIMPLE_EVALS_SOURCE_REVIEW_REF
} from "../src/diagnostic/methodologyVersioning.js";
import {
  OPENAI_SIMPLE_EVALS_METRIC_VALIDITY_SOURCE_REF,
  openaiSimpleEvalsMetricValidityRequirements
} from "../src/score/metricValidity.js";

describe("GAP-0639 OpenAI Simple Evals metric-validity source-review boundary", () => {
  it("publishes Score/Shield/Watch metric-validity boundaries using existing primitives only", () => {
    const manifest = getPublicMethodologyManifest();

    expect(AMC_PUBLIC_METHODOLOGY_VERSION).toBe("2026.06.25-r218");
    const changelog = manifest.changelog.find((row) => row.version === "2026.06.21-r217");
    expect(changelog?.summary).toContain("OpenAI Simple Evals-style metric-validity source-review boundaries");
    expect(changelog?.migration).toContain("2026.06.20-r216");

    const changeTrigger = manifest.benchmarkMethodologyVersioning.changeTriggers.find(
      (row) => row.trigger === "openai_simple_evals_metric_validity_change"
    );
    expect(changeTrigger?.versionImpact).toContain("validation table");
    expect(changeTrigger?.versionImpact).toContain("sample-size");
    expect(changeTrigger?.versionImpact).toContain("confidence-interval");
    expect(changeTrigger?.migration).toContain("GitHub repository metadata can seed review only");
    expect(changeTrigger?.migration).toContain("must not create an OpenAI Simple Evals subsystem");

    const boundary = manifest.scoreClaimBoundaries.find((row) => row.boundary === "openai_simple_evals_metric_validity");
    expect(boundary?.appliesWhen).toContain("Score report");
    expect(boundary?.appliesWhen).toContain("Shield receipt");
    expect(boundary?.appliesWhen).toContain("Watch alert");
    expect(boundary?.requiredEvidence).toContain("validation table artifact");
    expect(boundary?.requiredEvidence).toContain("metric owner");
    expect(boundary?.requiredEvidence).toContain("sample size");
    expect(boundary?.requiredEvidence).toContain("confidence interval");
    expect(boundary?.requiredEvidence).toContain("Score/Shield/Watch surface mapping");
    expect(boundary?.publicDisclosure).toContain("not an OpenAI Simple Evals subsystem");
    expect(boundary?.publicDisclosure).toContain("SDK");
    expect(boundary?.publicDisclosure).toContain("parity claim");
    expect(boundary?.publicDisclosure).toContain("does not authorize copied upstream code");
    expect(boundary?.migration).toContain("2026.06.20-r216");

    const gate = manifest.metricValidationGates.find((row) => row.gate === "openai_simple_evals_metric_validity");
    expect(gate?.appliesWhen).toContain("Score, Shield, or Watch");
    expect(gate?.defaultThreshold).toContain("validationTable present");
    expect(gate?.defaultThreshold).toContain("sampleSize>=configured minimum");
    expect(gate?.defaultThreshold).toContain("confidenceInterval present");
    expect(gate?.defaultThreshold).toContain("metricOwner present");
    expect(gate?.proofField).toContain("metricValidation.rows[].evaluatorSuiteCoverage");
    expect(gate?.migration).toContain("existing evaluator-suite and trace-evaluation primitives");
    expect(gate?.migration).toContain("no OpenAI Simple Evals subsystem");

    const requirements = openaiSimpleEvalsMetricValidityRequirements();
    expect(OPENAI_SIMPLE_EVALS_METRIC_VALIDITY_SOURCE_REF).toBe("github:openai/simple-evals");
    expect(requirements).toEqual(expect.arrayContaining([
      "validation table artifact",
      "metric owner",
      "sample size",
      "confidence interval",
      "no-copy/source-review boundary proof"
    ]));

    const markdown = renderPublicMethodologyMarkdown(manifest);
    expect(markdown).toContain("openai_simple_evals_metric_validity");
  });

  it("binds Simple Evals into diagnostic methodology-versioning and badges", () => {
    const manifest = getPublicMethodologyManifest();
    const receipt = buildDiagnosticMethodologyVersioningReceipt(manifest);

    expect(OPENAI_SIMPLE_EVALS_SOURCE_REVIEW_REF).toBe("github:openai/simple-evals");
    expect(receipt.status).toBe("ready");
    expect(receipt.sourceRef).toContain("github:openai/simple-evals");
    expect(receipt.requiredAuditFields).toEqual(expect.arrayContaining([
      "simpleEvalsLiveGithubMetadataReceipt",
      "simpleEvalsEvalPackManifest",
      "simpleEvalsValidationTable",
      "simpleEvalsEvaluatorSuiteProof",
      "simpleEvalsTraceEvaluationProofWhenClaimed",
      "simpleEvalsMetricOwner",
      "simpleEvalsSampleSize",
      "simpleEvalsConfidenceInterval",
      "simpleEvalsSignedEvidenceRefs",
      "simpleEvalsNoCopyBoundary"
    ]));
    expect(receipt.presentAuditFields).toEqual(expect.arrayContaining([
      "sourceReview.simpleEvals.boundary",
      "sourceReview.simpleEvals.validationTable",
      "sourceReview.simpleEvals.metricOwner",
      "sourceReview.simpleEvals.sampleSize",
      "sourceReview.simpleEvals.confidenceInterval",
      "sourceReview.simpleEvals.noSubsystemBoundary",
      "sourceReview.simpleEvals.noCopyBoundary",
      "sourceReview.simpleEvals.metricGate"
    ]));
    expect(receipt.evidenceRefs).toContain("amc:openai-simple-evals-source-review-boundary");
    expect(receipt.rejectedEvidenceRefs).toContain("metadata-only:openai/simple-evals");
    expect(receipt.warnings.join("\n")).toContain("OpenAI Simple Evals GitHub metadata");
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);

    const ref = getPublicMethodologyReference();
    expect(ref.versioningAssuranceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(badgeUrl({ level: 4 })).toContain("amc_methodology_assurance=");
    expect(badgeSourceReviewNotice(ref)).toContain("OpenAI Simple Evals");
    expect(badgeSourceReviewNotice(ref)).toContain("no SDK/importer/parity claim");
  });

  it("documents live metadata, acceptance fields, and the no-copy boundary", () => {
    const methodologyDoc = readFileSync("docs/SCORING_METHODOLOGY.md", "utf8");
    const sourceReviewDoc = readFileSync("docs/source-reviews/GAP-0639-openai-simple-evals-metric-validity.md", "utf8");

    expect(methodologyDoc).toContain("`2026.06.21-r217`");
    expect(methodologyDoc).toContain("OpenAI Simple Evals-style metric-validity source-review boundaries");
    expect(methodologyDoc).toContain("validation table");
    expect(methodologyDoc).toContain("metric owner");
    expect(methodologyDoc).toContain("sample size");
    expect(methodologyDoc).toContain("confidence interval");
    expect(methodologyDoc).toContain("No OpenAI Simple Evals subsystem, SDK/importer, adapter, parity layer");

    expect(sourceReviewDoc).toContain("API `full_name`: `openai/simple-evals`");
    expect(sourceReviewDoc).toContain("Default branch: `main`");
    expect(sourceReviewDoc).toContain("HEAD at retrieval: `652c89d0ca9df547706735883097e9537d40dc47`");
    expect(sourceReviewDoc).toContain("License metadata: `MIT`");
    expect(sourceReviewDoc).toContain("validation table");
    expect(sourceReviewDoc).toContain("metric owner");
    expect(sourceReviewDoc).toContain("sample size");
    expect(sourceReviewDoc).toContain("confidence interval");
    expect(sourceReviewDoc).toContain("No upstream code, README prose, docs prose, examples, prompts, configs, tests, task definitions, result tables, benchmark rows, implementation details, or UI/assets were copied");
  });
});
