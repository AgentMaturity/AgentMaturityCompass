import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildDiagnosticMethodologyVersioningReceipt,
  LUNARY_SOURCE_REVIEW_REF,
} from "../src/diagnostic/methodologyVersioning.js";
import {
  AMC_PUBLIC_METHODOLOGY_VERSION,
  getPublicMethodologyManifest,
  getPublicMethodologyReference,
} from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0015-lunary-public-methodology-versioning.md";

describe("GAP-0015 Lunary public methodology versioning", () => {
  it("documents live Lunary relevance without adding source-specific product surface", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0015");
    expect(doc).toContain("Lunary");
    expect(doc).toContain("https://lunary.ai");
    expect(doc).toContain("https://docs.lunary.ai/get-started");
    expect(doc).toContain("public methodology versioning");
    expect(doc).toContain("Score, Shield, and Watch");
    expect(doc).toContain("Build AI agents with confidence");
    expect(doc).toContain("Agent Tracing");
    expect(doc).toContain("Score LLM responses");
    expect(doc).toContain("Prompt Templates");
    expect(doc).toContain("methodology version, changelog, deprecation notice, and migration guidance");
    expect(doc).toContain("metadata-only Lunary evidence fails closed");
    expect(doc).toContain("No Lunary adapter");
    expect(doc).toContain("No copied Lunary website prose");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("binds Lunary public-methodology proof requirements into the current methodology receipt", () => {
    const manifest = getPublicMethodologyManifest();
    const receipt = buildDiagnosticMethodologyVersioningReceipt(manifest);

    expect(AMC_PUBLIC_METHODOLOGY_VERSION).toBe("2026.06.25-r219");
    expect(manifest.changelog[0]?.summary).toContain("Lunary-style public-methodology");
    expect(manifest.changelog[0]?.migration).toContain("Reports generated under 2026.06.25-r218");
    expect(manifest.changelog[1]?.summary).toContain("LangSmith-style public-methodology");
    expect(receipt.status).toBe("ready");
    expect(receipt.sourceRef).toContain(LUNARY_SOURCE_REVIEW_REF);
    expect(receipt.requiredAuditFields).toEqual(expect.arrayContaining([
      "lunaryLiveSourceReceipt",
      "lunaryValidationTable",
      "lunaryMethodologyVersionProof",
      "lunaryChangelogProof",
      "lunaryDeprecationNoticeProof",
      "lunaryMigrationGuidanceProof",
      "lunarySignedEvidenceRefs",
      "lunaryNoCopyBoundary",
    ]));
    expect(receipt.presentAuditFields).toContain("sourceReview.lunary.methodologyVersioning");
    expect(receipt.presentAuditFields).toContain("sourceReview.lunary.metricGate");
    expect(receipt.evidenceRefs).toContain("amc:lunary-source-review-boundary");
    expect(receipt.rejectedEvidenceRefs).toContain("metadata-only:lunary.ai");
    expect(receipt.missingAuditFields).toEqual([]);
  });

  it("requires public methodology lifecycle proof before Lunary-style evidence is externally comparable", () => {
    const manifest = getPublicMethodologyManifest();
    const reference = getPublicMethodologyReference();
    const boundary = manifest.scoreClaimBoundaries.find((item) => item.boundary === "lunary_observability_metric_validity");
    const gate = manifest.metricValidationGates.find((item) => item.gate === "lunary_observability_metric_validity");

    expect(boundary?.requiredEvidence).toContain("methodology version");
    expect(boundary?.requiredEvidence).toContain("changelog");
    expect(boundary?.requiredEvidence).toContain("deprecation notice");
    expect(boundary?.requiredEvidence).toContain("migration guidance");
    expect(boundary?.requiredEvidence).toContain("badge-assurance hash");
    expect(boundary?.publicDisclosure).toContain("source metadata alone");
    expect(boundary?.publicDisclosure).toContain("not a parity claim");
    expect(gate?.defaultThreshold).toContain("methodologyVersion present");
    expect(gate?.defaultThreshold).toContain("metadata-only source review fails closed");
    expect(reference.versioningAssuranceHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
