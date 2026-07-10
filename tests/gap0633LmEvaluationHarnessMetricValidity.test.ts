import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { badgeSourceReviewNotice, badgeUrl } from "../src/badge/badgeCli.js";
import { buildDiagnosticMethodologyVersioningReceipt, LM_EVALUATION_HARNESS_SOURCE_REVIEW_REF } from "../src/diagnostic/methodologyVersioning.js";
import {
  AMC_PUBLIC_METHODOLOGY_VERSION,
  getPublicMethodologyManifest,
  getPublicMethodologyReference,
  renderPublicMethodologyMarkdown
} from "../src/methodology/publicMethodology.js";
import {
  LM_EVALUATION_HARNESS_METRIC_VALIDITY_SOURCE_REF,
  lmEvaluationHarnessMetricValidityRequirements
} from "../src/score/metricValidity.js";

describe("GAP-0633 LM Evaluation Harness metric-validity source-review boundary", () => {
  it("publishes Score/Shield/Watch metric-validity boundaries through existing primitives only", () => {
    const manifest = getPublicMethodologyManifest();
    const requirements = lmEvaluationHarnessMetricValidityRequirements();

    expect(AMC_PUBLIC_METHODOLOGY_VERSION).toBe("2026.07.10-r222");
    const lmEvaluationHarnessChangelog = manifest.changelog.find((row) => row.version === "2026.06.20-r216");
    expect(lmEvaluationHarnessChangelog).toMatchObject({
      version: "2026.06.20-r216",
      date: "2026-06-20"
    });
    expect(lmEvaluationHarnessChangelog?.summary).toContain("LM Evaluation Harness-style metric-validity source-review boundaries");
    expect(lmEvaluationHarnessChangelog?.migration).toContain("Reports generated under 2026.06.20-r215");
    expect(manifest.deprecationNotice).toContain("2026.06.20-r216");
    expect(manifest.migrationGuidance.join("\n")).toContain("LM Evaluation Harness-style metric-validity claims");

    expect(LM_EVALUATION_HARNESS_METRIC_VALIDITY_SOURCE_REF).toBe("github:EleutherAI/lm-evaluation-harness");
    expect(requirements).toEqual(expect.arrayContaining([
      "validation table artifact",
      "evaluator-suite proof using existing primitives",
      "trace-evaluation proof when traces or Watch are claimed",
      "metric owner",
      "sample size",
      "confidence interval",
      "no-copy/source-review boundary proof"
    ]));

    const changeTrigger = manifest.benchmarkMethodologyVersioning.changeTriggers.find(
      (row) => row.trigger === "lm_evaluation_harness_metric_validity_change"
    );
    expect(changeTrigger?.versionImpact).toContain("validation table");
    expect(changeTrigger?.migration).toContain("GitHub repository metadata can seed review only");
    expect(changeTrigger?.migration).toContain("must not create an lm-evaluation-harness subsystem");

    const boundary = manifest.scoreClaimBoundaries.find((row) => row.boundary === "lm_evaluation_harness_metric_validity");
    expect(boundary?.appliesWhen).toContain("Score report");
    expect(boundary?.appliesWhen).toContain("Shield receipt");
    expect(boundary?.appliesWhen).toContain("Watch alert");
    expect(boundary?.requiredEvidence).toContain("validation table artifact");
    expect(boundary?.requiredEvidence).toContain("evaluator-suite proof using existing primitives");
    expect(boundary?.requiredEvidence).toContain("trace-evaluation proof when traces or Watch are claimed");
    expect(boundary?.requiredEvidence).toContain("metric owner");
    expect(boundary?.requiredEvidence).toContain("sample size");
    expect(boundary?.requiredEvidence).toContain("confidence interval");
    expect(boundary?.publicDisclosure).toContain("not an lm-evaluation-harness subsystem, SDK, importer, adapter, or parity claim");
    expect(boundary?.publicDisclosure).toContain("does not authorize copied upstream code");

    const gate = manifest.metricValidationGates.find((row) => row.gate === "lm_evaluation_harness_metric_validity");
    expect(gate?.appliesWhen).toContain("Score, Shield, or Watch");
    expect(gate?.defaultThreshold).toContain("validationTable present");
    expect(gate?.defaultThreshold).toContain("sampleSize>=configured minimum");
    expect(gate?.defaultThreshold).toContain("confidenceInterval present");
    expect(gate?.defaultThreshold).toContain("metricOwner present");
    expect(gate?.proofField).toContain("evaluatorSuiteCoverage");
    expect(gate?.proofField).toContain("traceEvaluationCoverage");
    expect(gate?.migration).toContain("no lm-evaluation-harness subsystem");

    const markdown = renderPublicMethodologyMarkdown(manifest);
    expect(markdown).toContain("lm_evaluation_harness_metric_validity");
  });

  it("binds the LM Evaluation Harness boundary into diagnostics and badges", () => {
    const manifest = getPublicMethodologyManifest();
    const receipt = buildDiagnosticMethodologyVersioningReceipt(manifest);

    expect(LM_EVALUATION_HARNESS_SOURCE_REVIEW_REF).toBe("github:EleutherAI/lm-evaluation-harness");
    expect(receipt.status).toBe("ready");
    expect(receipt.sourceRef).toContain("github:EleutherAI/lm-evaluation-harness");
    expect(receipt.requiredAuditFields).toEqual(expect.arrayContaining([
      "lmEvaluationHarnessLiveGithubMetadataReceipt",
      "lmEvaluationHarnessValidationTable",
      "lmEvaluationHarnessEvaluatorSuiteProof",
      "lmEvaluationHarnessTraceEvaluationProofWhenClaimed",
      "lmEvaluationHarnessMetricOwner",
      "lmEvaluationHarnessSampleSize",
      "lmEvaluationHarnessConfidenceInterval",
      "lmEvaluationHarnessSignedEvidenceRefs",
      "lmEvaluationHarnessNoCopyBoundary"
    ]));
    expect(receipt.presentAuditFields).toEqual(expect.arrayContaining([
      "sourceReview.lmEvaluationHarness.boundary",
      "sourceReview.lmEvaluationHarness.validationTable",
      "sourceReview.lmEvaluationHarness.metricOwner",
      "sourceReview.lmEvaluationHarness.sampleSize",
      "sourceReview.lmEvaluationHarness.confidenceInterval",
      "sourceReview.lmEvaluationHarness.noSdkImporterBoundary",
      "sourceReview.lmEvaluationHarness.noCopyBoundary",
      "sourceReview.lmEvaluationHarness.metricGate"
    ]));
    expect(receipt.evidenceRefs).toContain("amc:lm-evaluation-harness-source-review-boundary");
    expect(receipt.rejectedEvidenceRefs).toContain("metadata-only:EleutherAI/lm-evaluation-harness");
    expect(receipt.warnings.join("\n")).toContain("LM Evaluation Harness GitHub metadata");
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);

    const ref = getPublicMethodologyReference();
    expect(badgeUrl({ level: 4 })).toContain("amc_methodology_assurance=");
    expect(badgeSourceReviewNotice(ref)).toContain("LM Evaluation Harness");
    expect(badgeSourceReviewNotice(ref)).toContain("no subsystem/importer/parity claim");
  });

  it("documents live source metadata and no-copy boundaries", () => {
    const methodologyDoc = readFileSync("docs/SCORING_METHODOLOGY.md", "utf8");
    const sourceReviewDoc = readFileSync("docs/source-reviews/GAP-0633-lm-evaluation-harness-metric-validity.md", "utf8");

    expect(methodologyDoc).toContain("`2026.06.20-r216`");
    expect(methodologyDoc).toContain("LM Evaluation Harness-style metric-validity source-review boundaries");
    expect(methodologyDoc).toContain("No lm-evaluation-harness subsystem, SDK/importer, adapter, parity layer");
    expect(sourceReviewDoc).toContain("Repository: `EleutherAI/lm-evaluation-harness`");
    expect(sourceReviewDoc).toContain("Default branch: `main`");
    expect(sourceReviewDoc).toContain("License metadata: `MIT`");
    expect(sourceReviewDoc).toContain("HEAD at retrieval: `1dd931087362abba74e0375c8c631295559f48b2`");
    expect(sourceReviewDoc).toContain("No lm-evaluation-harness code, README prose, docs prose, examples, prompts, configs, tests, task definitions, result tables");
  });
});
