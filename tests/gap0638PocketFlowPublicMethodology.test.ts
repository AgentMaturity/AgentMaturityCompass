import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { badgeSourceReviewNotice, badgeUrl } from "../src/badge/badgeCli.js";
import { buildDiagnosticMethodologyVersioningReceipt, POCKETFLOW_SOURCE_REVIEW_REF } from "../src/diagnostic/methodologyVersioning.js";
import {
  AMC_PUBLIC_METHODOLOGY_VERSION,
  getPublicMethodologyManifest,
  getPublicMethodologyReference,
  renderPublicMethodologyMarkdown
} from "../src/methodology/publicMethodology.js";

describe("GAP-0638 PocketFlow public-methodology source-review boundary", () => {
  it("publishes methodology-versioned Score/Shield/Watch boundaries without a PocketFlow subsystem", () => {
    const manifest = getPublicMethodologyManifest();

    expect(AMC_PUBLIC_METHODOLOGY_VERSION).toBe("2026.06.25-r218");
    const pocketFlowChangelog = manifest.changelog.find((row) => row.version === "2026.06.21-r217");
    expect(pocketFlowChangelog).toMatchObject({
      version: "2026.06.21-r217",
      date: "2026-06-21"
    });
    expect(pocketFlowChangelog?.summary).toContain("PocketFlow-style public-methodology source-review boundaries");
    expect(pocketFlowChangelog?.migration).toContain("Reports generated under 2026.06.20-r216");
    expect(manifest.deprecationNotice).toContain("2026.06.21-r217");
    expect(manifest.deprecationNotice).toContain("PocketFlow-style public-methodology");
    expect(manifest.migrationGuidance.join("\n")).toContain("PocketFlow-style public-methodology claims");

    const changeTrigger = manifest.benchmarkMethodologyVersioning.changeTriggers.find(
      (row) => row.trigger === "pocketflow_public_methodology_change"
    );
    expect(changeTrigger?.versionImpact).toContain("docs/module source-review scope");
    expect(changeTrigger?.migration).toContain("GitHub repository metadata can seed review only");
    expect(changeTrigger?.migration).toContain("must not create a PocketFlow subsystem");

    const boundary = manifest.scoreClaimBoundaries.find((row) => row.boundary === "pocketflow_public_methodology");
    expect(boundary?.appliesWhen).toContain("Score report");
    expect(boundary?.appliesWhen).toContain("Shield receipt");
    expect(boundary?.appliesWhen).toContain("Watch alert");
    expect(boundary?.requiredEvidence).toContain("Live GitHub metadata relevance review");
    expect(boundary?.requiredEvidence).toContain("docs/module scope declaration");
    expect(boundary?.requiredEvidence).toContain("methodology version/changelog/deprecation/migration proof");
    expect(boundary?.publicDisclosure).toContain("not a PocketFlow subsystem, SDK, importer, adapter, parity claim");
    expect(boundary?.publicDisclosure).toContain("does not authorize copied upstream code");
    expect(boundary?.publicDisclosure).toContain("configs, examples");

    const gate = manifest.metricValidationGates.find((row) => row.gate === "pocketflow_public_methodology");
    expect(gate?.appliesWhen).toContain("Score, Shield, or Watch");
    expect(gate?.defaultThreshold).toContain("methodologyVersion present");
    expect(gate?.defaultThreshold).toContain("docsModuleScope present");
    expect(gate?.defaultThreshold).toContain("metadata-only GitHub source review fails closed");
    expect(gate?.proofField).toContain("methodologyVersioning.receiptHash");
    expect(gate?.migration).toContain("existing evaluator-suite primitives");
    expect(gate?.migration).toContain("no PocketFlow subsystem");

    const markdown = renderPublicMethodologyMarkdown(manifest);
    expect(markdown).toContain("pocketflow_public_methodology");
  });

  it("binds the PocketFlow boundary into diagnostic methodology-versioning and badges", () => {
    const manifest = getPublicMethodologyManifest();
    const receipt = buildDiagnosticMethodologyVersioningReceipt(manifest);

    expect(POCKETFLOW_SOURCE_REVIEW_REF).toBe("github:The-Pocket/PocketFlow");
    expect(receipt.status).toBe("ready");
    expect(receipt.sourceRef).toContain("github:The-Pocket/PocketFlow");
    expect(receipt.requiredAuditFields).toEqual(expect.arrayContaining([
      "pocketFlowLiveGithubMetadataReceipt",
      "pocketFlowDocsModuleScope",
      "pocketFlowEvalPackManifest",
      "pocketFlowFlowCaseManifestWhenClaimed",
      "pocketFlowValidationTable",
      "pocketFlowEvaluatorSuiteProof",
      "pocketFlowMethodologyVersionProof",
      "pocketFlowChangelogProof",
      "pocketFlowDeprecationNoticeProof",
      "pocketFlowMigrationGuidanceProof",
      "pocketFlowSignedEvidenceRefs",
      "pocketFlowNoCopyBoundary"
    ]));
    expect(receipt.presentAuditFields).toEqual(expect.arrayContaining([
      "sourceReview.pocketFlow.boundary",
      "sourceReview.pocketFlow.liveGithubMetadata",
      "sourceReview.pocketFlow.docsModuleScope",
      "sourceReview.pocketFlow.methodologyVersioning",
      "sourceReview.pocketFlow.noSubsystemBoundary",
      "sourceReview.pocketFlow.noCopyBoundary",
      "sourceReview.pocketFlow.metricGate"
    ]));
    expect(receipt.evidenceRefs).toContain("amc:pocketflow-public-methodology-boundary");
    expect(receipt.rejectedEvidenceRefs).toContain("metadata-only:The-Pocket/PocketFlow");
    expect(receipt.warnings.join("\n")).toContain("PocketFlow GitHub metadata");
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);

    const ref = getPublicMethodologyReference();
    expect(ref.versioningAssuranceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(badgeUrl({ level: 4 })).toContain("amc_methodology_assurance=");
    expect(badgeSourceReviewNotice(ref)).toContain("PocketFlow");
    expect(badgeSourceReviewNotice(ref)).toContain("no PocketFlow subsystem/SDK/importer/parity claim");
  });

  it("documents live source metadata and no-copy boundaries", () => {
    const methodologyDoc = readFileSync("docs/SCORING_METHODOLOGY.md", "utf8");
    const sourceReviewDoc = readFileSync("docs/source-reviews/GAP-0638-pocketflow-public-methodology.md", "utf8");

    expect(methodologyDoc).toContain("`2026.06.21-r217`");
    expect(methodologyDoc).toContain("PocketFlow-style public-methodology source-review boundaries");
    expect(methodologyDoc).toContain("No PocketFlow subsystem, SDK/importer, adapter, parity layer");
    expect(sourceReviewDoc).toContain("full_name: `The-Pocket/PocketFlow`");
    expect(sourceReviewDoc).toContain("default_branch: `main`");
    expect(sourceReviewDoc).toContain("license: `MIT`");
    expect(sourceReviewDoc).toContain("latest default-branch commit: `43ef382bb0c9dae8167528618bb40f5a3f9a28a5`");
    expect(sourceReviewDoc).toContain("No upstream code, prose, configs, prompts, examples, docs text, tests, README text, or implementation details were copied");
  });
});
