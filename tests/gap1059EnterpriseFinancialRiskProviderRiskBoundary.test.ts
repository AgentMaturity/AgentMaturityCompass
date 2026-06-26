import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildThirdPartyProviderRiskReceipt,
  renderThirdPartyProviderRiskAuditExport,
  verifyThirdPartyProviderRiskReceipt,
  type ThirdPartyProviderRiskEvidenceLink,
  type ThirdPartyProviderRiskSourceCitation,
} from "../src/compliance/providerRisk.js";

const DOC = "docs/source-reviews/GAP-1059-enterprise-financial-risk-provider-risk.md";
const TITLE = "A Comprehensive Survey on\u00a0Enterprise Financial Risk Analysis from\u00a0Big Data and\u00a0LLMs Perspective";
const OPENALEX = "https://openalex.org/W4310419549";
const OPENALEX_API = "https://api.openalex.org/works/W4310419549";
const DOI = "https://doi.org/10.1007/978-981-92-1468-6_7";
const CROSSREF = "https://api.crossref.org/works/10.1007/978-981-92-1468-6_7";
const SPRINGER = "https://link.springer.com/chapter/10.1007/978-981-92-1468-6_7";
const ARXIV_PDF = "https://arxiv.org/pdf/2211.14997";

const implementationFiles = [
  "src/compliance/providerRisk.ts",
  "src/compliance/builtInMappings.ts",
  "src/passport/trustInterchange.ts",
  "src/trust/trustConfig.ts",
];

const sourceCitations: ThirdPartyProviderRiskSourceCitation[] = [
  {
    sourceId: "enterprise-financial-risk-survey",
    title: TITLE,
    url: DOI,
    retrievedAt: "2026-06-25T04:42:00.000+05:30",
  },
  {
    sourceId: "nist-ai-rmf-third-party-risk-context",
    title: "NIST AI Risk Management Framework third-party risk context",
    url: "https://www.nist.gov/itl/ai-risk-management-framework",
    retrievedAt: "2026-06-25T04:42:00.000+05:30",
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

describe("GAP-1059 enterprise-financial-risk provider-risk boundary", () => {
  it("documents live OpenAlex, DOI, Crossref, Springer, and arXiv metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1059");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(SPRINGER);
    expect(doc).toContain(ARXIV_PDF);
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-01-01`");
    expect(doc).toContain("Springer Nature Singapore");
    expect(doc).toContain("Lecture Notes in Computer Science");
    expect(doc).toContain("book-chapter");
    expect(doc).toContain("9789819214679");
    expect(doc).toContain("9789819214686");
    expect(doc).toContain("sha256:665dca2ddc0e4c248cd1e87e74fa4a11c9e7f998e49170a36ef4daa7bf8ab92d");
    expect(doc).toContain("Third-party agent and provider risk");
    expect(doc).toContain("provider record");
    expect(doc).toContain("attestation");
    expect(doc).toContain("data boundary");
    expect(doc).toContain("contractual control");
    expect(doc).toContain("review date");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("builds a generic third-party provider-risk receipt with attestations, data boundary, contract controls, owner, and evidence lineage", () => {
    const receipt = buildThirdPartyProviderRiskReceipt({
      receiptId: "gap1059-provider-risk",
      generatedAt: "2026-06-25T04:43:00.000+05:30",
      sourceCitations,
      providers: [
        {
          providerId: "provider-model-risk-demo",
          providerName: "Example Hosted Model Provider",
          providerType: "model",
          owner: "vendor-risk-owner@example.com",
          reviewDate: "2026-06-25",
          nextReviewDate: "2026-09-25",
          dataProcessingPosture: "restricted_customer_data",
          allowedUseCases: ["low-risk summarization", "internal support triage"],
          modelRestrictions: ["no regulated credit decisioning", "no autonomous funds transfer"],
          attestations: [
            {
              attestationId: "att-soc2-bridge-2026",
              attestationType: "soc2",
              issuedAt: "2026-05-01",
              expiresAt: "2027-05-01",
              signedEvidenceRef: "ledger-att-soc2-bridge-2026",
              signatureSha256: "a".repeat(64),
            },
          ],
          dataBoundary: {
            boundaryId: "boundary-provider-model-risk-demo",
            dataClasses: ["support_ticket_summary", "redacted_customer_context"],
            allowedRegions: ["us-east-1", "eu-west-1"],
            subprocessors: ["example-vector-store"],
            retentionDays: 30,
            transferMechanism: "regional-processing-addendum",
            signedEvidenceRef: "ledger-boundary-provider-model-risk-demo",
            signatureSha256: "b".repeat(64),
          },
          contractualControls: [
            {
              controlId: "contract-no-training-on-customer-data",
              obligation: "Provider must not train on customer payloads.",
              status: "active",
              owner: "legal-owner@example.com",
              reviewDate: "2026-06-25",
              signedEvidenceRef: "ledger-contract-no-training-on-customer-data",
              signatureSha256: "c".repeat(64),
            },
          ],
          exceptions: [
            {
              exceptionId: "exc-approved-support-region",
              state: "approved",
              owner: "vendor-risk-owner@example.com",
              reason: "Temporary regional review extension approved for low-risk support triage.",
              signedEvidenceRef: "ledger-exc-approved-support-region",
              signatureSha256: "d".repeat(64),
            },
          ],
          evidenceRefs: [
            signedEvidence("ev-provider-record-demo", "e"),
            signedEvidence("ev-provider-risk-review-demo", "f"),
          ],
          sourceCitationIds: [
            "enterprise-financial-risk-survey",
            "nist-ai-rmf-third-party-risk-context",
          ],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      providerId: "provider-model-risk-demo",
      owner: "vendor-risk-owner@example.com",
      reviewDate: "2026-06-25",
      attestationCount: 1,
      contractualControlCount: 1,
      exceptionStates: ["approved"],
    });
    expect(receipt.rows[0]?.dataBoundaryHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.evidenceChainHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyThirdPartyProviderRiskReceipt(receipt).valid).toBe(true);

    const markdown = renderThirdPartyProviderRiskAuditExport(receipt);
    expect(markdown).toContain("# AMC Third-Party Provider Risk Audit Export");
    expect(markdown).toContain("provider-model-risk-demo");
    expect(markdown).toContain("restricted_customer_data");
    expect(markdown).toContain("contract-no-training-on-customer-data");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("VALID");
  });

  it("fails closed when metadata replaces provider record, attestation, data boundary, contract controls, review date, signed exception, or evidence lineage", () => {
    const receipt = buildThirdPartyProviderRiskReceipt({
      receiptId: "gap1059-metadata-only-provider-risk",
      generatedAt: "2026-06-25T04:44:00.000+05:30",
      sourceCitations: [],
      providers: [
        {
          providerId: "metadata-only-provider",
          providerName: "",
          providerType: "model",
          owner: "",
          reviewDate: "",
          dataProcessingPosture: "customer_data",
          allowedUseCases: [],
          modelRestrictions: [],
          attestations: [
            {
              attestationId: "paper-title-only",
              attestationType: "custom",
              issuedAt: "",
              expiresAt: "",
              signedEvidenceRef: "",
              signatureSha256: "",
            },
          ],
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
          contractualControls: [
            {
              controlId: "",
              obligation: "",
              status: "pending",
              owner: "",
              reviewDate: "",
              signedEvidenceRef: "",
              signatureSha256: "",
            },
          ],
          exceptions: [
            {
              exceptionId: "exc-unsigned",
              state: "approved",
              owner: "vendor-risk-owner@example.com",
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
      "metadata-only-provider:sourceCitation:unknown",
      "metadata-only-provider:providerRecord:missing",
      "metadata-only-provider:owner:missing",
      "metadata-only-provider:reviewDate:missing",
      "metadata-only-provider:attestation:invalid",
      "metadata-only-provider:dataBoundary:invalid",
      "metadata-only-provider:contractualControl:invalid",
      "metadata-only-provider:signedException:missing",
      "metadata-only-provider:evidenceChain:invalid",
    ]));
    expect(verifyThirdPartyProviderRiskReceipt(receipt).valid).toBe(false);
  });

  it("does not add enterprise-financial-risk paper identifiers to generic compliance, passport, or trust implementation files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("10.1007/978-981-92-1468-6_7");
      expect(source).not.toContain("W4310419549");
      expect(source).not.toContain("enterprise_financial_risk_provider_risk");
      expect(source).not.toContain(TITLE);
    }
  });
});
