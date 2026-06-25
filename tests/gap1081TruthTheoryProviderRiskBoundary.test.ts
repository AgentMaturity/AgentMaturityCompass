import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildThirdPartyProviderRiskReceipt,
  renderThirdPartyProviderRiskAuditExport,
  verifyThirdPartyProviderRiskReceipt,
  type ThirdPartyProviderRiskEvidenceLink,
  type ThirdPartyProviderRiskSourceCitation,
} from "../src/compliance/providerRisk.js";

const DOC = "docs/source-reviews/GAP-1081-truth-theory-provider-risk.md";
const TITLE = "Truth without belief: can LLM-generated content satisfy classical theories of truth?";
const OPENALEX = "https://openalex.org/W7133239131";
const OPENALEX_API = "https://api.openalex.org/works/W7133239131";
const DOI = "https://doi.org/10.1007/s43681-026-01065-8";
const SPRINGER = "https://link.springer.com/article/10.1007/s43681-026-01065-8";
const SPRINGER_PDF = "https://link.springer.com/content/pdf/10.1007/s43681-026-01065-8.pdf";
const IDENTIFIER = "truth_theory_provider_risk";

const implementationFiles = [
  "src/compliance/providerRisk.ts",
  "src/passport/trustInterchange.ts",
  "src/trust/trustConfig.ts",
  "docs/COMPLIANCE_FRAMEWORKS.md",
];

const sourceCitations: ThirdPartyProviderRiskSourceCitation[] = [
  {
    sourceId: "openalex-truth-without-belief",
    title: TITLE,
    url: OPENALEX,
    retrievedAt: "2026-06-25T08:15:00.000+05:30",
  },
  {
    sourceId: "springer-truth-without-belief",
    title: TITLE,
    url: SPRINGER,
    retrievedAt: "2026-06-25T08:15:00.000+05:30",
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

describe("GAP-1081 truth-theory provider-risk boundary", () => {
  it("documents live OpenAlex, DOI, and Springer metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1081");
    expect(doc).toContain("Third-party agent and provider risk");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(SPRINGER);
    expect(doc).toContain(SPRINGER_PDF);
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-03-02`");
    expect(doc).toContain("AI and Ethics");
    expect(doc).toContain("Springer International Publishing");
    expect(doc).toContain("article");
    expect(doc).toContain("closed");
    expect(doc).toContain("Lanzhou University");
    expect(doc).toContain("Zhang, Xufeng");
    expect(doc).toContain("Li, Han");
    expect(doc).toContain("Normative");
    expect(doc).toContain("Intentionality");
    expect(doc).toContain("Epistemology");
    expect(doc).toContain("Semantic theory of truth");
    expect(doc).toContain("Large language models");
    expect(doc).toContain("HTTP/2 `302`");
    expect(doc).toContain("HTTP/2 `200`");
    expect(doc).toContain("provider record");
    expect(doc).toContain("attestation");
    expect(doc).toContain("data boundary");
    expect(doc).toContain("contractual control");
    expect(doc).toContain("review date");
    expect(doc).toContain("metadata-only truth-theory evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses the existing generic provider-risk receipt for LLM-generated-content provider governance", () => {
    const receipt = buildThirdPartyProviderRiskReceipt({
      receiptId: "gap1081-truth-theory-provider-risk",
      generatedAt: "2026-06-25T08:16:00.000+05:30",
      sourceCitations,
      providers: [
        {
          providerId: "provider-llm-content-demo",
          providerName: "Example LLM Content Provider",
          providerType: "model",
          owner: "provider-risk-owner@example.com",
          reviewDate: "2026-06-25",
          nextReviewDate: "2026-09-25",
          dataProcessingPosture: "restricted_customer_data",
          allowedUseCases: ["draft generation with human review", "internal summarization"],
          modelRestrictions: ["no autonomous truth certification", "no source-free compliance claims"],
          attestations: [
            {
              attestationId: "att-content-provider-safety-review-2026",
              attestationType: "ai-safety",
              issuedAt: "2026-06-01",
              expiresAt: "2026-12-01",
              signedEvidenceRef: "ledger-att-content-provider-safety-review-2026",
              signatureSha256: "a".repeat(64),
            },
          ],
          dataBoundary: {
            boundaryId: "boundary-llm-content-demo",
            dataClasses: ["redacted_prompt", "generated_summary", "review_metadata"],
            allowedRegions: ["us-east-1", "eu-west-1"],
            subprocessors: ["example-hosted-model"],
            retentionDays: 30,
            transferMechanism: "content-provider-processing-addendum",
            signedEvidenceRef: "ledger-boundary-llm-content-demo",
            signatureSha256: "b".repeat(64),
          },
          contractualControls: [
            {
              controlId: "contract-no-autonomous-truth-claim",
              obligation: "Provider output must not be marketed or treated as autonomous truth verification.",
              status: "active",
              owner: "legal-owner@example.com",
              reviewDate: "2026-06-25",
              signedEvidenceRef: "ledger-contract-no-autonomous-truth-claim",
              signatureSha256: "c".repeat(64),
            },
          ],
          exceptions: [
            {
              exceptionId: "exc-truth-theory-review-window",
              state: "approved",
              owner: "provider-risk-owner@example.com",
              reason: "Signed time-boxed exception for provider review cadence while compensating human review remains active.",
              signedEvidenceRef: "ledger-exc-truth-theory-review-window",
              signatureSha256: "d".repeat(64),
            },
          ],
          evidenceRefs: [
            signedEvidence("ev-provider-llm-content-record", "e"),
            signedEvidence("ev-provider-llm-content-review", "f"),
          ],
          sourceCitationIds: [
            "openalex-truth-without-belief",
            "springer-truth-without-belief",
          ],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      providerId: "provider-llm-content-demo",
      providerType: "model",
      owner: "provider-risk-owner@example.com",
      reviewDate: "2026-06-25",
      contractualControlIds: ["contract-no-autonomous-truth-claim"],
      exceptionStates: ["approved"],
    });
    expect(receipt.rows[0]?.dataBoundaryHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.contractualControlsHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.attestationsHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.evidenceChainHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyThirdPartyProviderRiskReceipt(receipt).valid).toBe(true);

    const markdown = renderThirdPartyProviderRiskAuditExport(receipt);
    expect(markdown).toContain("# AMC Third-Party Provider Risk Audit Export");
    expect(markdown).toContain("provider-llm-content-demo");
    expect(markdown).toContain("contract-no-autonomous-truth-claim");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("VALID");
  });

  it("fails closed when paper metadata replaces provider-risk evidence", () => {
    const receipt = buildThirdPartyProviderRiskReceipt({
      receiptId: "gap1081-metadata-only-provider-risk",
      generatedAt: "2026-06-25T08:17:00.000+05:30",
      sourceCitations: [],
      providers: [
        {
          providerId: "metadata-only-truth-provider",
          providerName: "",
          providerType: "model",
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
              exceptionId: "exc-unsigned-truth-provider",
              state: "approved",
              owner: "provider-risk-owner@example.com",
              reason: "Unsigned exception should not pass.",
            },
          ],
          evidenceRefs: [
            {
              eventId: "paper-title-only",
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
      "metadata-only-truth-provider:sourceCitation:unknown",
      "metadata-only-truth-provider:providerRecord:missing",
      "metadata-only-truth-provider:owner:missing",
      "metadata-only-truth-provider:reviewDate:missing",
      "metadata-only-truth-provider:allowedUseCases:missing",
      "metadata-only-truth-provider:attestation:invalid",
      "metadata-only-truth-provider:dataBoundary:invalid",
      "metadata-only-truth-provider:contractualControl:invalid",
      "metadata-only-truth-provider:signedException:missing",
      "metadata-only-truth-provider:evidenceChain:invalid",
    ]));
    expect(verifyThirdPartyProviderRiskReceipt(receipt).valid).toBe(false);
  });

  it("does not add truth-theory source identifiers to generic provider-risk, passport, trust, or compliance-doc files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("10.1007/s43681-026-01065-8");
      expect(source).not.toContain("W7133239131");
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain(TITLE);
    }
  });
});
