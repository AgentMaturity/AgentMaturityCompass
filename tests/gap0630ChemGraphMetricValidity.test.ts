import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  buildDiagnosticMethodologyVersioningReceipt,
  CHEMGRAPH_AGENTIC_CHEMISTRY_WORKFLOW_SOURCE_REVIEW_REF
} from "../src/diagnostic/methodologyVersioning.js";
import { getPublicMethodologyManifest, getPublicMethodologyReference } from "../src/methodology/publicMethodology.js";
import {
  CHEMGRAPH_AGENTIC_CHEMISTRY_WORKFLOW_METRIC_VALIDITY_SOURCE_REF,
  chemGraphAgenticChemistryWorkflowMetricValidityRequirements
} from "../src/score/metricValidity.js";

const SOURCE_REVIEW_DOC = "docs/source-reviews/GAP-0630-chemgraph-agentic-chemistry-workflow.md";

describe("GAP-0630 ChemGraph agentic chemistry workflow metric-validity boundary", () => {
  test("exposes DOI/OpenAlex source-review requirements through existing metric-validity primitives", () => {
    const requirements = chemGraphAgenticChemistryWorkflowMetricValidityRequirements();

    expect(CHEMGRAPH_AGENTIC_CHEMISTRY_WORKFLOW_METRIC_VALIDITY_SOURCE_REF).toContain("10.1038/s42004-025-01776-9");
    expect(CHEMGRAPH_AGENTIC_CHEMISTRY_WORKFLOW_METRIC_VALIDITY_SOURCE_REF).toContain("W7119161162");
    expect(requirements).toEqual(expect.arrayContaining([
      "verified DOI metadata receipt",
      "verified OpenAlex metadata receipt",
      "validation table artifact",
      "existing metric-validation primitive mapping",
      "metric owner",
      "sample size",
      "confidence interval",
      "no-copy/source-review boundary proof"
    ]));
  });

  test("publishes a fail-closed public methodology boundary without adding a chemistry subsystem", () => {
    const manifest = getPublicMethodologyManifest();
    const boundary = manifest.scoreClaimBoundaries.find((row) => row.boundary === "chemgraph_agentic_chemistry_workflow_metric_validity");
    const gate = manifest.metricValidationGates.find((row) => row.gate === "chemgraph_agentic_chemistry_workflow_metric_validity");
    const changeTrigger = manifest.benchmarkMethodologyVersioning.changeTriggers.find((row) => row.trigger === "chemgraph_agentic_chemistry_workflow_metric_validity_change");

    expect(manifest.version).toBe("2026.06.25-r220");
    expect(manifest.changelog.find((row) => row.version === "2026.06.20-r216")?.summary).toContain("ChemGraph-style agentic computational chemistry workflow metric-validity boundaries");
    expect(boundary).toBeDefined();
    expect(boundary?.appliesWhen).toContain("Score report");
    expect(boundary?.appliesWhen).toContain("Shield receipt");
    expect(boundary?.appliesWhen).toContain("Watch alert");
    expect(boundary?.appliesWhen).toContain("10.1038/s42004-025-01776-9");
    expect(boundary?.appliesWhen).toContain("W7119161162");
    expect(boundary?.requiredEvidence).toContain("Verified DOI metadata receipt");
    expect(boundary?.requiredEvidence).toContain("verified OpenAlex metadata receipt");
    expect(boundary?.requiredEvidence).toContain("validation table artifact");
    expect(boundary?.requiredEvidence).toContain("existing metric-validity primitive mapping");
    expect(boundary?.requiredEvidence).toContain("metric owner");
    expect(boundary?.requiredEvidence).toContain("sample size");
    expect(boundary?.requiredEvidence).toContain("confidence interval");
    expect(boundary?.publicDisclosure).toContain("source metadata alone");
    expect(boundary?.publicDisclosure).toContain("not a chemistry/domain subsystem");
    expect(boundary?.publicDisclosure).toContain("does not authorize copied paper prose");
    expect(gate?.defaultThreshold).toContain("DOI/OpenAlex metadata verified");
    expect(gate?.defaultThreshold).toContain("validationTable present");
    expect(gate?.proofField).toContain("metricValidation.rows[].scientificLiteratureCoverage");
    expect(gate?.proofField).toContain("existing primitives");
    expect(changeTrigger?.versionImpact).toContain("DOI/OpenAlex verification");
    expect(changeTrigger?.migration).toContain("must not create a chemistry/domain subsystem");

    const reference = getPublicMethodologyReference();
    expect(reference.versioningAssuranceHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("diagnostic methodology-versioning receipt includes ChemGraph source-review audit fields", () => {
    const receipt = buildDiagnosticMethodologyVersioningReceipt(getPublicMethodologyManifest());

    expect(CHEMGRAPH_AGENTIC_CHEMISTRY_WORKFLOW_SOURCE_REVIEW_REF).toContain("W7119161162");
    expect(receipt.status).toBe("ready");
    expect(receipt.sourceRef).toContain("doi:10.1038/s42004-025-01776-9");
    expect(receipt.sourceRef).toContain("openalex:W7119161162");
    expect(receipt.requiredAuditFields).toEqual(expect.arrayContaining([
      "chemGraphDoiMetadataReceipt",
      "chemGraphOpenAlexMetadataReceipt",
      "chemGraphValidationTable",
      "chemGraphMetricOwner",
      "chemGraphSampleSize",
      "chemGraphConfidenceInterval",
      "chemGraphSignedEvidenceRefs",
      "chemGraphNoCopyBoundary"
    ]));
    expect(receipt.presentAuditFields).toEqual(expect.arrayContaining([
      "sourceReview.chemGraph.doi",
      "sourceReview.chemGraph.openAlex",
      "sourceReview.chemGraph.validationTable",
      "sourceReview.chemGraph.metricOwner",
      "sourceReview.chemGraph.sampleSize",
      "sourceReview.chemGraph.confidenceInterval",
      "sourceReview.chemGraph.metricGate"
    ]));
    expect(receipt.evidenceRefs).toContain("amc:chemgraph-agentic-chemistry-workflow-source-review-boundary");
    expect(receipt.rejectedEvidenceRefs).toContain("metadata-only:openalex-W7119161162");
    expect(receipt.warnings.join(" ")).toContain("ChemGraph DOI/OpenAlex metadata");
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("documents live metadata verification and no-copy boundaries", () => {
    const methodologyDoc = readFileSync("docs/SCORING_METHODOLOGY.md", "utf8");
    const sourceReviewDoc = readFileSync(SOURCE_REVIEW_DOC, "utf8");

    expect(methodologyDoc).toContain("`2026.06.20-r216`");
    expect(methodologyDoc).toContain("ChemGraph-style agentic computational chemistry workflow");
    expect(methodologyDoc).toContain("No chemistry/domain subsystem, connector, importer, parity layer, or copied paper prose/data");
    expect(sourceReviewDoc).toContain("10.1038/s42004-025-01776-9");
    expect(sourceReviewDoc).toContain("W7119161162");
    expect(sourceReviewDoc).toContain("Communications Chemistry");
    expect(sourceReviewDoc).toContain("No paper prose");
    expect(sourceReviewDoc).toContain("existing AMC metric-validity/public-methodology primitives");
  });
});
