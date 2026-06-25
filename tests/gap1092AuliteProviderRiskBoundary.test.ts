import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildThirdPartyProviderRiskReceipt,
  renderThirdPartyProviderRiskAuditExport,
  verifyThirdPartyProviderRiskReceipt,
  type ThirdPartyProviderRiskEvidenceLink,
  type ThirdPartyProviderRiskSourceCitation,
} from "../src/compliance/providerRisk.js";

const DOC = "docs/source-reviews/GAP-1092-aulite-provider-risk.md";
const REPO = "https://github.com/el1ght/aulite";
const README = "https://raw.githubusercontent.com/el1ght/aulite/main/README.md";
const LICENSE = "https://raw.githubusercontent.com/el1ght/aulite/main/LICENSE.md";
const PACKAGE = "https://raw.githubusercontent.com/el1ght/aulite/main/package.json";
const RELEASE = "https://github.com/el1ght/aulite/releases/tag/v0.4.0";
const TITLE = "el1ght/aulite";
const DESCRIPTION = "EU AI Act compliance proxy for AI systems. Drop-in HTTP proxy that monitors every AI interaction for regulatory risks, logs to a tamper-proof audit trail, and generates legal-grade PDF reports. 143 rules across 8 Annex III domains. Self-hosted, open-core";
const IDENTIFIER = "aulite_provider_risk";

const implementationFiles = [
  "src/compliance/providerRisk.ts",
  "src/passport/trustInterchange.ts",
  "src/trust/trustConfig.ts",
  "docs/COMPLIANCE_FRAMEWORKS.md",
];

const sourceCitations: ThirdPartyProviderRiskSourceCitation[] = [
  {
    sourceId: "github-aulite",
    title: TITLE,
    url: REPO,
    retrievedAt: "2026-06-25T17:15:00.000Z",
  },
  {
    sourceId: "aulite-release-v0-4-0",
    title: "Aulite v0.4.0",
    url: RELEASE,
    retrievedAt: "2026-06-25T17:15:00.000Z",
  },
  {
    sourceId: "aulite-package-json",
    title: "Aulite package metadata",
    url: PACKAGE,
    retrievedAt: "2026-06-25T17:15:00.000Z",
  },
];

function signedEvidence(id: string, seed: string): ThirdPartyProviderRiskEvidenceLink {
  return {
    eventId: id,
    eventHash: seed.repeat(64).slice(0, 64),
    eventType: "review",
    signedEvidenceRef: `ledger-${id}`,
  };
}

describe("GAP-1092 Aulite provider-risk boundary", () => {
  it("documents live GitHub metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1092");
    expect(doc).toContain("Third-party agent and provider risk");
    expect(doc).toContain(REPO);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(PACKAGE);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DESCRIPTION);
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("stargazerCount `108`");
    expect(doc).toContain("forkCount `0`");
    expect(doc).toContain("open issues `0`");
    expect(doc).toContain("latest release `v0.4.0`");
    expect(doc).toContain("release name `v0.4.0 - External Rekor anchoring`");
    expect(doc).toContain("published `2026-06-14T21:57:04Z`");
    expect(doc).toContain("license `Other`");
    expect(doc).toContain("package license `BUSL-1.1`");
    expect(doc).toContain("primary language `TypeScript`");
    expect(doc).toContain("TypeScript `220732`");
    expect(doc).toContain("default branch commit `a8cfdf9271db7504115c77d88fccaaa785705e84`");
    expect(doc).toContain("verification reason `unsigned`");
    expect(doc).toContain("README blob `2cd92e4798e7c928800f876984ae1b940077ee8a`");
    expect(doc).toContain("LICENSE.md blob `59d7d94dc2848274cb7e178db9363523cefe5bb9`");
    expect(doc).toContain("package.json blob `d500b6d15082f3b90908e05b4f294af9720492db`");
    expect(doc).toContain("README first 200 KB SHA-256 `140e7dde549f5ad41631ea9605a707e417ff9272248cff21bc2ef5da976b3809`");
    expect(doc).toContain("LICENSE.md first 200 KB SHA-256 `77f3f82ba1596e02f4b11fc9ea86caacc20befc581cb85cbcc3a1f2d2facbca2`");
    expect(doc).toContain("package.json first 200 KB SHA-256 `950061d3487c8b6626fb27c7645c58de7dc9512b641dfc6e8951ba37855f24d4`");
    expect(doc).toContain("package version `0.4.0`");
    expect(doc).toContain("package type `module`");
    expect(doc).toContain("bin `aulite`");
    expect(doc).toContain("ai-governance");
    expect(doc).toContain("eu-ai-act");
    expect(doc).toContain("audit");
    expect(doc).toContain("compliance");
    expect(doc).toContain("provider record");
    expect(doc).toContain("attestation");
    expect(doc).toContain("data boundary");
    expect(doc).toContain("contractual control");
    expect(doc).toContain("review date");
    expect(doc).toContain("metadata-only Aulite evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses the existing generic provider-risk receipt for an AI compliance proxy dependency", () => {
    const receipt = buildThirdPartyProviderRiskReceipt({
      receiptId: "gap1092-aulite-provider-risk",
      generatedAt: "2026-06-25T17:16:00.000Z",
      sourceCitations,
      providers: [
        {
          providerId: "provider-ai-compliance-proxy",
          providerName: "Example AI Compliance Proxy",
          providerType: "infrastructure",
          owner: "provider-risk-owner@example.com",
          reviewDate: "2026-06-25",
          nextReviewDate: "2026-09-25",
          dataProcessingPosture: "sensitive_data",
          allowedUseCases: ["internal compliance-proxy evaluation", "offline audit-report fixture review"],
          modelRestrictions: [
            "no customer traffic until data processing terms are signed",
            "no regulator-facing report claims without AMC-owned verification",
          ],
          attestations: [
            {
              attestationId: "att-ai-compliance-proxy-security-review-2026",
              attestationType: "security-questionnaire",
              issuedAt: "2026-06-01",
              expiresAt: "2026-12-01",
              signedEvidenceRef: "ledger-att-ai-compliance-proxy-security-review-2026",
              signatureSha256: "a".repeat(64),
            },
          ],
          dataBoundary: {
            boundaryId: "boundary-ai-compliance-proxy",
            dataClasses: ["prompt_metadata", "response_metadata", "audit_report_fixture"],
            allowedRegions: ["eu-central-1"],
            subprocessors: ["approved-eu-audit-sandbox"],
            retentionDays: 14,
            transferMechanism: "self-hosted-eu-evaluation",
            signedEvidenceRef: "ledger-boundary-ai-compliance-proxy",
            signatureSha256: "b".repeat(64),
          },
          contractualControls: [
            {
              controlId: "contract-busl-license-and-dpa-review",
              obligation: "BUSL-1.1 license posture and data-processing terms require legal review before production or customer-facing use.",
              status: "active",
              owner: "legal-owner@example.com",
              reviewDate: "2026-06-25",
              signedEvidenceRef: "ledger-contract-busl-license-and-dpa-review",
              signatureSha256: "c".repeat(64),
            },
          ],
          exceptions: [
            {
              exceptionId: "exc-ai-compliance-proxy-offline-eval",
              state: "approved",
              owner: "provider-risk-owner@example.com",
              reason: "Signed time-boxed exception for offline compliance proxy review while customer traffic stays disabled.",
              signedEvidenceRef: "ledger-exc-ai-compliance-proxy-offline-eval",
              signatureSha256: "d".repeat(64),
            },
          ],
          evidenceRefs: [
            signedEvidence("ev-ai-compliance-proxy-provider-record", "e"),
            signedEvidence("ev-ai-compliance-proxy-license-review", "f"),
            signedEvidence("ev-ai-compliance-proxy-data-boundary", "1"),
          ],
          sourceCitationIds: [
            "github-aulite",
            "aulite-release-v0-4-0",
            "aulite-package-json",
          ],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      providerId: "provider-ai-compliance-proxy",
      providerType: "infrastructure",
      owner: "provider-risk-owner@example.com",
      reviewDate: "2026-06-25",
      dataProcessingPosture: "sensitive_data",
      contractualControlIds: ["contract-busl-license-and-dpa-review"],
      exceptionStates: ["approved"],
    });
    expect(receipt.rows[0]?.dataBoundaryHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.contractualControlsHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.attestationsHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.evidenceChainHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyThirdPartyProviderRiskReceipt(receipt).valid).toBe(true);

    const markdown = renderThirdPartyProviderRiskAuditExport(receipt);
    expect(markdown).toContain("# AMC Third-Party Provider Risk Audit Export");
    expect(markdown).toContain("provider-ai-compliance-proxy");
    expect(markdown).toContain("contract-busl-license-and-dpa-review");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("VALID");
  });

  it("fails closed when repository metadata replaces provider-risk evidence", () => {
    const receipt = buildThirdPartyProviderRiskReceipt({
      receiptId: "gap1092-metadata-only-provider-risk",
      generatedAt: "2026-06-25T17:17:00.000Z",
      sourceCitations: [],
      providers: [
        {
          providerId: "metadata-only-aulite-provider",
          providerName: "",
          providerType: "infrastructure",
          owner: "",
          reviewDate: "",
          dataProcessingPosture: "customer_data",
          allowedUseCases: [],
          modelRestrictions: [],
          attestations: [],
          dataBoundary: {
            boundaryId: "",
            dataClasses: [],
            allowedRegions: [],
            subprocessors: [],
            retentionDays: 0,
            transferMechanism: "",
            signedEvidenceRef: "",
            signatureSha256: "",
          },
          contractualControls: [],
          exceptions: [
            {
              exceptionId: "exc-unsigned-aulite",
              state: "approved",
              owner: "provider-risk-owner@example.com",
              reason: "Unsigned exception should not pass.",
            },
          ],
          evidenceRefs: [
            {
              eventId: "repo-release-only",
              eventHash: "not-a-sha",
              eventType: "review",
              signedEvidenceRef: "",
            },
          ],
          sourceCitationIds: ["missing-source"],
        },
      ],
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "sourceCitations:missing",
      "metadata-only-aulite-provider:sourceCitation:unknown",
      "metadata-only-aulite-provider:providerRecord:missing",
      "metadata-only-aulite-provider:owner:missing",
      "metadata-only-aulite-provider:reviewDate:missing",
      "metadata-only-aulite-provider:allowedUseCases:missing",
      "metadata-only-aulite-provider:attestation:invalid",
      "metadata-only-aulite-provider:dataBoundary:invalid",
      "metadata-only-aulite-provider:contractualControl:invalid",
      "metadata-only-aulite-provider:signedException:missing",
      "metadata-only-aulite-provider:evidenceChain:invalid",
    ]));
    expect(verifyThirdPartyProviderRiskReceipt(receipt).valid).toBe(false);
  });

  it("does not add Aulite identifiers to generic provider-risk, passport, trust, or compliance-doc files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("el1ght/aulite");
      expect(source).not.toContain("aulite");
      expect(source).not.toContain("a8cfdf9271db7504115c77d88fccaaa785705e84");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
