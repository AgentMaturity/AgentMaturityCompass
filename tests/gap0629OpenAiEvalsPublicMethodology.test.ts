import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { badgeSourceReviewNotice, badgeUrl } from "../src/badge/badgeCli.js";
import {
  AMC_PUBLIC_METHODOLOGY_VERSION,
  getPublicMethodologyManifest,
  getPublicMethodologyReference,
  renderPublicMethodologyMarkdown
} from "../src/methodology/publicMethodology.js";
import { buildDiagnosticMethodologyVersioningReceipt, OPENAI_EVALS_SOURCE_REVIEW_REF } from "../src/diagnostic/methodologyVersioning.js";

describe("GAP-0629 OpenAI Evals public-methodology source-review boundary", () => {
  it("publishes methodology-versioned Score/Shield/Watch boundaries without an OpenAI Evals subsystem", () => {
    const manifest = getPublicMethodologyManifest();

    expect(AMC_PUBLIC_METHODOLOGY_VERSION).toBe("2026.06.25-r220");

    const openaiEvalsChangelog = manifest.changelog.find((row) => row.version === "2026.06.20-r215");
    expect(openaiEvalsChangelog).toMatchObject({
      version: "2026.06.20-r215",
      date: "2026-06-20",
    });
    expect(openaiEvalsChangelog?.summary).toContain("OpenAI Evals-style public-methodology source-review boundaries");
    expect(openaiEvalsChangelog?.migration).toContain("Reports generated under 2026.06.20-r214");

    expect(manifest.deprecationNotice).toContain("2026.06.20-r215");
    expect(manifest.deprecationNotice).toContain("OpenAI Evals-style public-methodology");
    expect(manifest.migrationGuidance.join("\n")).toContain("OpenAI Evals-style public-methodology claims");

    const changeTrigger = manifest.benchmarkMethodologyVersioning.changeTriggers.find(
      (row) => row.trigger === "openai_evals_public_methodology_change"
    );
    expect(changeTrigger?.versionImpact).toContain("changelog");
    expect(changeTrigger?.migration).toContain("GitHub repository metadata can seed review only");

    const boundary = manifest.scoreClaimBoundaries.find((row) => row.boundary === "openai_evals_public_methodology");
    expect(boundary?.appliesWhen).toContain("Score report");
    expect(boundary?.appliesWhen).toContain("Shield receipt");
    expect(boundary?.appliesWhen).toContain("Watch alert");
    expect(boundary?.requiredEvidence).toContain("Live GitHub metadata relevance review");
    expect(boundary?.requiredEvidence).toContain("methodology version/changelog/deprecation/migration proof");
    expect(boundary?.publicDisclosure).toContain("not an OpenAI Evals subsystem");
    expect(boundary?.publicDisclosure).toContain("not");
    expect(boundary?.publicDisclosure).toContain("parity claim");
    expect(boundary?.publicDisclosure).toContain("does not authorize copied upstream code");
    expect(boundary?.migration).toContain("2026.06.20-r214");

    const gate = manifest.metricValidationGates.find((row) => row.gate === "openai_evals_public_methodology");
    expect(gate?.appliesWhen).toContain("Score, Shield, or Watch");
    expect(gate?.defaultThreshold).toContain("methodologyVersion present");
    expect(gate?.defaultThreshold).toContain("metadata-only GitHub source review fails closed");
    expect(gate?.proofField).toContain("methodologyVersioning.receiptHash");
    expect(gate?.migration).toContain("existing evaluator-suite primitives");

    const markdown = renderPublicMethodologyMarkdown(manifest);
    expect(markdown).toContain("openai_evals_public_methodology");
  });

  it("binds the OpenAI Evals boundary into diagnostic methodology-versioning and badges", () => {
    const manifest = getPublicMethodologyManifest();
    const receipt = buildDiagnosticMethodologyVersioningReceipt(manifest);

    expect(OPENAI_EVALS_SOURCE_REVIEW_REF).toBe("github:openai/evals");
    expect(receipt.status).toBe("ready");
    expect(receipt.sourceRef).toContain("github:openai/evals");
    expect(receipt.requiredAuditFields).toEqual(expect.arrayContaining([
      "openaiEvalsLiveGithubMetadataReceipt",
      "openaiEvalsEvalPackManifest",
      "openaiEvalsValidationTable",
      "openaiEvalsEvaluatorSuiteProof",
      "openaiEvalsMethodologyVersionProof",
      "openaiEvalsChangelogProof",
      "openaiEvalsDeprecationNoticeProof",
      "openaiEvalsMigrationGuidanceProof",
      "openaiEvalsSignedEvidenceRefs",
      "openaiEvalsNoCopyBoundary"
    ]));
    expect(receipt.presentAuditFields).toEqual(expect.arrayContaining([
      "sourceReview.openaiEvals.boundary",
      "sourceReview.openaiEvals.liveGithubMetadata",
      "sourceReview.openaiEvals.methodologyVersioning",
      "sourceReview.openaiEvals.noSubsystemBoundary",
      "sourceReview.openaiEvals.noCopyBoundary",
      "sourceReview.openaiEvals.metricGate"
    ]));
    expect(receipt.evidenceRefs).toContain("amc:openai-evals-public-methodology-boundary");
    expect(receipt.rejectedEvidenceRefs).toContain("metadata-only:openai/evals");
    expect(receipt.warnings.join("\n")).toContain("OpenAI Evals GitHub metadata");
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);

    const ref = getPublicMethodologyReference();
    expect(ref.versioningAssuranceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(badgeUrl({ level: 4 })).toContain("amc_methodology_assurance=");
    expect(badgeSourceReviewNotice(ref)).toContain("OpenAI Evals");
    expect(badgeSourceReviewNotice(ref)).toContain("no subsystem/importer/parity claim");
  });

  it("documents the source-review and migration boundary without copying upstream material", () => {
    const methodologyDoc = readFileSync("docs/SCORING_METHODOLOGY.md", "utf8");
    const sourceReviewDoc = readFileSync("docs/source-reviews/GAP-0629-openai-evals-public-methodology.md", "utf8");

    expect(methodologyDoc).toContain("`2026.06.20-r215`");
    expect(methodologyDoc).toContain("OpenAI Evals-style public-methodology source-review boundaries");
    expect(methodologyDoc).toContain("AMC must not add an OpenAI Evals subsystem, importer, adapter, registry mirror, parity layer");
    expect(sourceReviewDoc).toContain("full_name: openai/evals");
    expect(sourceReviewDoc).toContain("default_branch: main");
    expect(sourceReviewDoc).toContain("license: NOASSERTION");
    expect(sourceReviewDoc).toContain("No upstream code, prose, configs, prompts, datasets, eval specs, registry rows, README text, or implementation details were copied");
  });
});
