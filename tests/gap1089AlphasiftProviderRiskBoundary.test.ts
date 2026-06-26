import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildThirdPartyProviderRiskReceipt,
  renderThirdPartyProviderRiskAuditExport,
  verifyThirdPartyProviderRiskReceipt,
  type ThirdPartyProviderRiskEvidenceLink,
  type ThirdPartyProviderRiskSourceCitation,
} from "../src/compliance/providerRisk.js";

const DOC = "docs/source-reviews/GAP-1089-alphasift-provider-risk.md";
const REPO = "https://github.com/ZhuLinsen/alphasift";
const README = "https://raw.githubusercontent.com/ZhuLinsen/alphasift/main/README.md";
const LICENSE = "https://raw.githubusercontent.com/ZhuLinsen/alphasift/main/LICENSE";
const PYPROJECT = "https://raw.githubusercontent.com/ZhuLinsen/alphasift/main/pyproject.toml";
const SKILL = "https://raw.githubusercontent.com/ZhuLinsen/alphasift/main/SKILL.md";
const TITLE = "ZhuLinsen/alphasift";
const DESCRIPTION = "AI-native stock screening engine with full-market discovery, LLM ranking, risk-aware scoring, and auditable evaluation.";
const IDENTIFIER = "alphasift_provider_risk";

const implementationFiles = [
  "src/compliance/providerRisk.ts",
  "src/passport/trustInterchange.ts",
  "src/trust/trustConfig.ts",
  "docs/COMPLIANCE_FRAMEWORKS.md",
];

const sourceCitations: ThirdPartyProviderRiskSourceCitation[] = [
  {
    sourceId: "github-alphasift",
    title: TITLE,
    url: REPO,
    retrievedAt: "2026-06-25T17:00:00.000Z",
  },
  {
    sourceId: "alphasift-pyproject",
    title: "AlphaSift pyproject metadata",
    url: PYPROJECT,
    retrievedAt: "2026-06-25T17:00:00.000Z",
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

describe("GAP-1089 AlphaSift provider-risk boundary", () => {
  it("documents live GitHub metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1089");
    expect(doc).toContain("Third-party agent and provider risk");
    expect(doc).toContain(REPO);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(PYPROJECT);
    expect(doc).toContain(SKILL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DESCRIPTION);
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("stargazerCount `216`");
    expect(doc).toContain("forkCount `119`");
    expect(doc).toContain("open issues `3`");
    expect(doc).toContain("latest release `none`");
    expect(doc).toContain("license `Apache License 2.0`");
    expect(doc).toContain("primary language `Python`");
    expect(doc).toContain("default branch commit `fd45fb864b55daf53afd7253d468f72edda95860`");
    expect(doc).toContain("verification reason `valid`");
    expect(doc).toContain("README blob `0159234a95d255e632e0e55f19d1db9ab8434664`");
    expect(doc).toContain("LICENSE blob `f125b03fc2f6126cb7d6bc31cddb29eccf06fcb9`");
    expect(doc).toContain("pyproject blob `b7f2d4e88ae6ac3eda23e8cc52f7963bbac24362`");
    expect(doc).toContain("README first 200 KB SHA-256 `f60bd0eb7b54ade04658a111e6c8d312f99800befdcbb1b937b58228aeb84750`");
    expect(doc).toContain("LICENSE first 200 KB SHA-256 `4aa75c59fb0d50653262470726b84c66636899ca96232a6e94e83c77456f8175`");
    expect(doc).toContain("SKILL.md first 200 KB SHA-256 `0ccaa238d79f2b3417ad57d716ddbd3b419623a498fe4d3d5c756198f61ffea3`");
    expect(doc).toContain("package version `0.2.0`");
    expect(doc).toContain("requires-python `>=3.10`");
    expect(doc).toContain("agent");
    expect(doc).toContain("finance");
    expect(doc).toContain("fintech");
    expect(doc).toContain("provider record");
    expect(doc).toContain("attestation");
    expect(doc).toContain("data boundary");
    expect(doc).toContain("contractual control");
    expect(doc).toContain("review date");
    expect(doc).toContain("metadata-only AlphaSift evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses the existing generic provider-risk receipt for a finance-agent dependency review", () => {
    const receipt = buildThirdPartyProviderRiskReceipt({
      receiptId: "gap1089-alphasift-provider-risk",
      generatedAt: "2026-06-25T17:01:00.000Z",
      sourceCitations,
      providers: [
        {
          providerId: "provider-finance-stock-screening-library",
          providerName: "Example Finance Stock Screening Library",
          providerType: "tool",
          owner: "provider-risk-owner@example.com",
          reviewDate: "2026-06-25",
          nextReviewDate: "2026-09-25",
          dataProcessingPosture: "restricted_customer_data",
          allowedUseCases: ["offline provider-risk review", "internal finance-agent evaluation fixture"],
          modelRestrictions: ["no investment-advice claims", "no live trading or customer portfolio actions"],
          attestations: [
            {
              attestationId: "att-finance-tool-security-review-2026",
              attestationType: "security-questionnaire",
              issuedAt: "2026-06-01",
              expiresAt: "2026-12-01",
              signedEvidenceRef: "ledger-att-finance-tool-security-review-2026",
              signatureSha256: "a".repeat(64),
            },
          ],
          dataBoundary: {
            boundaryId: "boundary-finance-stock-screening-library",
            dataClasses: ["strategy_metadata", "review_notes", "synthetic_market_fixture"],
            allowedRegions: ["us-east-1"],
            subprocessors: ["approved-market-data-sandbox"],
            retentionDays: 30,
            transferMechanism: "sandboxed-offline-review",
            signedEvidenceRef: "ledger-boundary-finance-stock-screening-library",
            signatureSha256: "b".repeat(64),
          },
          contractualControls: [
            {
              controlId: "contract-apache-license-review",
              obligation: "Apache-2.0 dependency and finance-use disclaimers require legal review before customer-facing use.",
              status: "active",
              owner: "legal-owner@example.com",
              reviewDate: "2026-06-25",
              signedEvidenceRef: "ledger-contract-apache-license-review",
              signatureSha256: "c".repeat(64),
            },
          ],
          exceptions: [
            {
              exceptionId: "exc-finance-provider-offline-eval",
              state: "approved",
              owner: "provider-risk-owner@example.com",
              reason: "Signed time-boxed exception for offline finance-agent evaluation while live trading stays disabled.",
              signedEvidenceRef: "ledger-exc-finance-provider-offline-eval",
              signatureSha256: "d".repeat(64),
            },
          ],
          evidenceRefs: [
            signedEvidence("ev-finance-provider-record", "e"),
            signedEvidence("ev-finance-provider-license-review", "f"),
          ],
          sourceCitationIds: [
            "github-alphasift",
            "alphasift-pyproject",
          ],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      providerId: "provider-finance-stock-screening-library",
      providerType: "tool",
      owner: "provider-risk-owner@example.com",
      reviewDate: "2026-06-25",
      dataProcessingPosture: "restricted_customer_data",
      contractualControlIds: ["contract-apache-license-review"],
      exceptionStates: ["approved"],
    });
    expect(receipt.rows[0]?.dataBoundaryHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.contractualControlsHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.attestationsHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.evidenceChainHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyThirdPartyProviderRiskReceipt(receipt).valid).toBe(true);

    const markdown = renderThirdPartyProviderRiskAuditExport(receipt);
    expect(markdown).toContain("# AMC Third-Party Provider Risk Audit Export");
    expect(markdown).toContain("provider-finance-stock-screening-library");
    expect(markdown).toContain("contract-apache-license-review");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("VALID");
  });

  it("fails closed when repository metadata replaces provider-risk evidence", () => {
    const receipt = buildThirdPartyProviderRiskReceipt({
      receiptId: "gap1089-metadata-only-provider-risk",
      generatedAt: "2026-06-25T17:02:00.000Z",
      sourceCitations: [],
      providers: [
        {
          providerId: "metadata-only-alphasift-provider",
          providerName: "",
          providerType: "tool",
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
              exceptionId: "exc-unsigned-alphasift",
              state: "approved",
              owner: "provider-risk-owner@example.com",
              reason: "Unsigned exception should not pass.",
            },
          ],
          evidenceRefs: [
            {
              eventId: "repo-stars-only",
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
      "metadata-only-alphasift-provider:sourceCitation:unknown",
      "metadata-only-alphasift-provider:providerRecord:missing",
      "metadata-only-alphasift-provider:owner:missing",
      "metadata-only-alphasift-provider:reviewDate:missing",
      "metadata-only-alphasift-provider:allowedUseCases:missing",
      "metadata-only-alphasift-provider:attestation:invalid",
      "metadata-only-alphasift-provider:dataBoundary:invalid",
      "metadata-only-alphasift-provider:contractualControl:invalid",
      "metadata-only-alphasift-provider:signedException:missing",
      "metadata-only-alphasift-provider:evidenceChain:invalid",
    ]));
    expect(verifyThirdPartyProviderRiskReceipt(receipt).valid).toBe(false);
  });

  it("does not add AlphaSift identifiers to generic provider-risk, passport, trust, or compliance-doc files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("ZhuLinsen/alphasift");
      expect(source).not.toContain("alphasift");
      expect(source).not.toContain("fd45fb864b55daf53afd7253d468f72edda95860");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
