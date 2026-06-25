import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildDiagnosticMethodologyVersioningReceipt,
  CUA_COMPUTER_USE_SOURCE_REVIEW_REF,
} from "../src/diagnostic/methodologyVersioning.js";
import {
  AMC_PUBLIC_METHODOLOGY_VERSION,
  getPublicMethodologyManifest,
  getPublicMethodologyReference,
} from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0024-cua-public-methodology-versioning.md";

describe("GAP-0024 Cua public methodology versioning", () => {
  it("documents Cua computer-use benchmark relevance without adding a Cua subsystem", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0024");
    expect(doc).toContain("trycua/cua");
    expect(doc).toContain("https://github.com/trycua/cua");
    expect(doc).toContain("https://raw.githubusercontent.com/trycua/cua/main/README.md");
    expect(doc).toContain("https://raw.githubusercontent.com/trycua/cua/main/libs/cua-bench/README.md");
    expect(doc).toContain("https://cua.ai/docs/cuabench/guide/getting-started/introduction");
    expect(doc).toContain("public methodology versioning");
    expect(doc).toContain("Score, Shield, and Watch");
    expect(doc).toContain("Build, benchmark, and deploy agents that use computers");
    expect(doc).toContain("Cua-Bench");
    expect(doc).toContain("OSWorld");
    expect(doc).toContain("ScreenSpot");
    expect(doc).toContain("Windows Arena");
    expect(doc).toContain("verifiable cross-platform environments");
    expect(doc).toContain("task dataset manifest");
    expect(doc).toContain("test script");
    expect(doc).toContain("oracle solution");
    expect(doc).toContain("methodology version, changelog, deprecation notice, and migration guidance");
    expect(doc).toContain("metadata-only trycua/cua evidence fails closed");
    expect(doc).toContain("No Cua adapter");
    expect(doc).toContain("No copied Cua README prose");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("binds Cua public-methodology proof requirements into the current methodology receipt", () => {
    const manifest = getPublicMethodologyManifest();
    const receipt = buildDiagnosticMethodologyVersioningReceipt(manifest);

    expect(AMC_PUBLIC_METHODOLOGY_VERSION).toBe("2026.06.25-r220");
    expect(manifest.changelog[0]?.summary).toContain("Cua-style computer-use benchmark public-methodology");
    expect(manifest.changelog[0]?.migration).toContain("Reports generated under 2026.06.25-r219");
    expect(manifest.changelog[1]?.summary).toContain("Lunary-style public-methodology");
    expect(receipt.status).toBe("ready");
    expect(receipt.sourceRef).toContain(CUA_COMPUTER_USE_SOURCE_REVIEW_REF);
    expect(receipt.requiredAuditFields).toEqual(expect.arrayContaining([
      "cuaComputerUseLiveGithubMetadataReceipt",
      "cuaComputerUseReadmeSnapshot",
      "cuaBenchDocsSnapshot",
      "cuaBenchTaskManifest",
      "cuaBenchEnvironmentImageManifest",
      "cuaBenchTestScriptOracleProof",
      "cuaBenchRunConfig",
      "cuaBenchTrajectoryExportWhenClaimed",
      "cuaBenchValidationTable",
      "cuaBenchThresholdPolicy",
      "cuaComputerUseMethodologyVersionProof",
      "cuaComputerUseChangelogProof",
      "cuaComputerUseDeprecationNoticeProof",
      "cuaComputerUseMigrationGuidanceProof",
      "cuaComputerUseBadgeAssuranceHash",
      "cuaComputerUseMetricOwner",
      "cuaComputerUseSampleSize",
      "cuaComputerUseConfidenceInterval",
      "cuaComputerUseSignedEvidenceRefs",
      "cuaComputerUseNoCopyBoundary",
    ]));
    expect(receipt.presentAuditFields).toContain("sourceReview.cuaComputerUse.boundary");
    expect(receipt.presentAuditFields).toContain("sourceReview.cuaComputerUse.benchmarkTaskProof");
    expect(receipt.presentAuditFields).toContain("sourceReview.cuaComputerUse.methodologyVersioning");
    expect(receipt.presentAuditFields).toContain("sourceReview.cuaComputerUse.metricGate");
    expect(receipt.evidenceRefs).toContain("amc:cua-computer-use-source-review-boundary");
    expect(receipt.rejectedEvidenceRefs).toContain("metadata-only:trycua/cua");
    expect(receipt.missingAuditFields).toEqual([]);
  });

  it("requires Cua benchmark lifecycle proof before computer-use evidence is externally comparable", () => {
    const manifest = getPublicMethodologyManifest();
    const reference = getPublicMethodologyReference();
    const boundary = manifest.scoreClaimBoundaries.find((item) => item.boundary === "cua_computer_use_public_methodology");
    const gate = manifest.metricValidationGates.find((item) => item.gate === "cua_computer_use_public_methodology");

    expect(boundary?.requiredEvidence).toContain("task dataset manifest");
    expect(boundary?.requiredEvidence).toContain("environment image manifest");
    expect(boundary?.requiredEvidence).toContain("setup script and test script hashes");
    expect(boundary?.requiredEvidence).toContain("oracle solution");
    expect(boundary?.requiredEvidence).toContain("methodology version");
    expect(boundary?.requiredEvidence).toContain("changelog");
    expect(boundary?.requiredEvidence).toContain("deprecation notice");
    expect(boundary?.requiredEvidence).toContain("migration guidance");
    expect(boundary?.publicDisclosure).toContain("source metadata alone");
    expect(boundary?.publicDisclosure).toContain("not a Cua integration");
    expect(boundary?.publicDisclosure).toContain("not a parity claim");
    expect(gate?.defaultThreshold).toContain("methodologyVersion present");
    expect(gate?.defaultThreshold).toContain("taskDatasetManifest present");
    expect(gate?.defaultThreshold).toContain("metadata-only GitHub source review fails closed");
    expect(reference.versioningAssuranceHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
