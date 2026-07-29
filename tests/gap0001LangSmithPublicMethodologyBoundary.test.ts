import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDiagnosticMethodologyVersioningReceipt, LANGSMITH_SOURCE_REVIEW_REF } from "../src/diagnostic/methodologyVersioning.js";
import {
  AMC_PUBLIC_METHODOLOGY_VERSION,
  getPublicMethodologyManifest,
  getPublicMethodologyReference
} from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0001-langsmith-public-methodology.md";

describe("GAP-0001 LangSmith public methodology boundary", () => {
  it("documents the live source review and no-bloat relevance decision", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0001");
    expect(doc).toContain("LangSmith");
    expect(doc).toContain("https://www.langchain.com/langsmith");
    expect(doc).toContain("https://www.langchain.com/langsmith/observability");
    expect(doc).toContain("https://www.langchain.com/langsmith/evaluation");
    expect(doc).toContain("public methodology versioning");
    expect(doc).toContain("Score, Shield, and Watch");
    expect(doc).toContain("metadata-only LangSmith evidence fails closed");
    expect(doc).toContain("No LangSmith adapter");
    expect(doc).toContain("No copied LangSmith website prose");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("binds LangSmith public-methodology evidence into the signed methodology assurance receipt", () => {
    const manifest = getPublicMethodologyManifest();
    const receipt = buildDiagnosticMethodologyVersioningReceipt(manifest);

    expect(AMC_PUBLIC_METHODOLOGY_VERSION).toBe("2026.07.29-r223");
    expect(manifest.changelog[3]?.summary).toContain("Cua-style computer-use benchmark public-methodology");
    expect(manifest.changelog[4]?.summary).toContain("Lunary-style public-methodology");
    expect(manifest.changelog[5]?.summary).toContain("LangSmith-style public-methodology");
    expect(manifest.changelog[5]?.migration).toContain("Reports generated under 2026.06.21-r217");
    expect(receipt.status).toBe("ready");
    expect(receipt.sourceRef).toContain(LANGSMITH_SOURCE_REVIEW_REF);
    expect(receipt.requiredAuditFields).toContain("langSmithLiveSourceReceipt");
    expect(receipt.requiredAuditFields).toContain("langSmithMethodologyVersionProof");
    expect(receipt.requiredAuditFields).toContain("langSmithSignedEvidenceRefs");
    expect(receipt.presentAuditFields).toContain("sourceReview.langSmith.boundary");
    expect(receipt.presentAuditFields).toContain("sourceReview.langSmith.metricGate");
    expect(receipt.evidenceRefs).toContain("amc:langsmith-source-review-boundary");
    expect(receipt.rejectedEvidenceRefs).toContain("metadata-only:langchain.com/langsmith");
    expect(receipt.missingAuditFields).toEqual([]);
  });

  it("includes LangSmith source-review gates in badge assurance hash scope", () => {
    const manifest = getPublicMethodologyManifest();
    const reference = getPublicMethodologyReference();

    const langSmithBoundary = manifest.scoreClaimBoundaries.find((boundary) => boundary.boundary === "langsmith_eval_observability_metric_validity");
    const langSmithGate = manifest.metricValidationGates.find((gate) => gate.gate === "langsmith_eval_observability_metric_validity");

    expect(langSmithBoundary?.requiredEvidence).toContain("methodology version");
    expect(langSmithBoundary?.requiredEvidence).toContain("changelog");
    expect(langSmithBoundary?.requiredEvidence).toContain("signed evidence refs");
    expect(langSmithBoundary?.publicDisclosure).toContain("source metadata alone");
    expect(langSmithBoundary?.publicDisclosure).toContain("not parity proof");
    expect(langSmithGate?.defaultThreshold).toContain("metadata-only source review fails closed");
    expect(reference.versioningAssuranceHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
