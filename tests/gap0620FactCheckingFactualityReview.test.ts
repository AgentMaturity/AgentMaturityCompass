import { describe, expect, it } from "vitest";
import { badgeSourceReviewNotice, badgeUrl, formatBadgeOutput } from "../src/badge/badgeCli.js";
import {
  AMC_PUBLIC_METHODOLOGY_VERSION,
  getPublicMethodologyManifest,
  getPublicMethodologyReference,
  renderPublicMethodologyMarkdown
} from "../src/methodology/publicMethodology.js";
import { buildDiagnosticMethodologyVersioningReceipt } from "../src/diagnostic/methodologyVersioning.js";

describe("GAP-0620 fact-checking/factuality review methodology boundary", () => {
  it("publishes methodology-versioned Score/Shield/Watch boundaries without a standalone fact-checking subsystem", () => {
    const manifest = getPublicMethodologyManifest();
    expect(AMC_PUBLIC_METHODOLOGY_VERSION).toBe("2026.06.25-r220");
    const pocketFlowRelease = manifest.changelog.find((row) => row.version === "2026.06.21-r217");
    expect(pocketFlowRelease).toMatchObject({
      version: "2026.06.21-r217",
      date: "2026-06-21"
    });
    expect(manifest.changelog.map((row) => row.summary).join("\n")).toContain("no standalone fact-checking subsystem");

    expect(manifest.deprecationNotice).toContain("2026.06.20-r214");
    expect(manifest.migrationGuidance.join("\n")).toContain("DOI/OpenAlex metadata receipts");

    const boundary = manifest.scoreClaimBoundaries.find(
      (row) => row.boundary === "fact_checking_factuality_review_methodology_integrity"
    );
    expect(boundary?.appliesWhen).toContain("Score report");
    expect(boundary?.appliesWhen).toContain("Shield receipt");
    expect(boundary?.appliesWhen).toContain("Watch alert");
    expect(boundary?.appliesWhen).toContain("10.1007/s10462-025-11454-w");
    expect(boundary?.appliesWhen).toContain("W7118132038");
    expect(boundary?.publicDisclosure).toContain("standalone fact-checking subsystem");
    expect(boundary?.publicDisclosure).toContain("no paper prose");
    expect(boundary?.requiredEvidence).toContain("DOI metadata receipt hash");
    expect(boundary?.requiredEvidence).toContain("OpenAlex metadata receipt hash");
    expect(boundary?.requiredEvidence).toContain("changelog row hash");
    expect(boundary?.migration).toContain("2026.06.20-r213");

    const gate = manifest.metricValidationGates.find(
      (row) => row.gate === "fact_checking_factuality_review_methodology_evidence"
    );
    expect(gate?.appliesWhen).toContain("Score, Shield, or Watch");
    expect(gate?.defaultThreshold).toContain("DOI/OpenAlex metadata");
    expect(gate?.migration).toContain("signed evidence");

    const markdown = renderPublicMethodologyMarkdown(manifest);
    expect(markdown).toContain("fact_checking_factuality_review_methodology_integrity");
    expect(markdown).toContain("fact_checking_factuality_review_methodology_change");
    expect(markdown).toContain("fact_checking_factuality_review_methodology_evidence");
  });

  it("binds the source-review boundary into diagnostic methodology-versioning and badges", () => {
    const manifest = getPublicMethodologyManifest();
    const receipt = buildDiagnosticMethodologyVersioningReceipt(manifest);
    expect(receipt.status).toBe("ready");
    expect(receipt.sourceRef).toContain("10.1007/s10462-025-11454-w");
    expect(receipt.sourceRef).toContain("W7118132038");
    expect(receipt.presentAuditFields).toContain("sourceReview.factCheckingFactualityReview.metricGate");
    expect(receipt.requiredAuditFields).toContain("factCheckingFactualityReviewDoiMetadataReceipt");
    expect(receipt.evidenceRefs).toContain("amc:fact-checking-factuality-review-methodology-boundary");
    expect(receipt.rejectedEvidenceRefs).toContain("metadata-only:openalex:W7118132038");
    expect(receipt.warnings.join("\n")).toContain("methodology-versioning source-review signal only");

    const ref = getPublicMethodologyReference();
    expect(ref.versioningAssuranceHash).toMatch(/^[a-f0-9]{64}$/);
    const url = badgeUrl({ level: 3 });
    expect(url).toContain("amc_methodology_assurance=");
    expect(badgeSourceReviewNotice(ref)).toContain("fact-checking/factuality-review");
    expect(formatBadgeOutput({ level: 3 })).toContain("Source Review Notice");
  });
});
