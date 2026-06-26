import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildThirdPartyProviderRiskReceipt,
  renderThirdPartyProviderRiskAuditExport,
  verifyThirdPartyProviderRiskReceipt,
  type ThirdPartyProviderRiskEvidenceLink,
  type ThirdPartyProviderRiskSourceCitation,
} from "../src/compliance/providerRisk.js";

const DOC = "docs/source-reviews/GAP-1061-execution-gap-provider-risk.md";
const TITLE = "Closing the Execution Gap in LLM Agent Systems Empirical Evidence for Compliant Drift, Partial Observability, and Integrated Runtime";
const OPENALEX = "https://openalex.org/W7158586692";
const OPENALEX_API = "https://api.openalex.org/works/W7158586692";
const DOI = "https://doi.org/10.5281/zenodo.19929771";
const ZENODO = "https://zenodo.org/records/19929771";
const ZENODO_API = "https://zenodo.org/api/records/19929771";
const IDENTIFIER = "execution_gap_provider_risk";

const implementationFiles = [
  "src/compliance/providerRisk.ts",
  "src/passport/trustInterchange.ts",
  "src/trust/trustConfig.ts",
  "docs/COMPLIANCE_FRAMEWORKS.md",
];

const sourceCitations: ThirdPartyProviderRiskSourceCitation[] = [
  {
    sourceId: "execution-gap-agent-systems",
    title: TITLE,
    url: DOI,
    retrievedAt: "2026-06-25T05:00:00.000+05:30",
  },
  {
    sourceId: "amc-provider-risk-policy",
    title: "AMC third-party provider risk receipt policy",
    url: "docs/COMPLIANCE_FRAMEWORKS.md",
    retrievedAt: "2026-06-25T05:00:00.000+05:30",
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

describe("GAP-1061 execution-gap provider-risk boundary", () => {
  it("documents live OpenAlex, Zenodo, and DOI metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1061");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(ZENODO);
    expect(doc).toContain(ZENODO_API);
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-04-30`");
    expect(doc).toContain("preprint");
    expect(doc).toContain("green");
    expect(doc).toContain("cc-by-4.0");
    expect(doc).toContain("Marcelo Patricio Fernandez");
    expect(doc).toContain("0009-0008-7884-2087");
    expect(doc).toContain("main.pdf");
    expect(doc).toContain("md5:80bc7912d199b16546094849a006119b");
    expect(doc).toContain("Provider record");
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

  it("uses the existing generic provider-risk receipt for execution-gap provider governance", () => {
    const receipt = buildThirdPartyProviderRiskReceipt({
      receiptId: "gap1061-execution-gap-provider-risk",
      generatedAt: "2026-06-25T05:01:00.000+05:30",
      sourceCitations,
      providers: [
        {
          providerId: "provider-runtime-observability-demo",
          providerName: "Example Runtime Observability Provider",
          providerType: "infrastructure",
          owner: "provider-risk-owner@example.com",
          reviewDate: "2026-06-25",
          nextReviewDate: "2026-09-25",
          dataProcessingPosture: "restricted_customer_data",
          allowedUseCases: ["runtime telemetry aggregation", "audit-log correlation"],
          modelRestrictions: ["no autonomous policy override", "no unreviewed cross-tenant trace export"],
          attestations: [
            {
              attestationId: "att-observability-security-review-2026",
              attestationType: "security-questionnaire",
              issuedAt: "2026-06-01",
              expiresAt: "2026-12-01",
              signedEvidenceRef: "ledger-att-observability-security-review-2026",
              signatureSha256: "a".repeat(64),
            },
          ],
          dataBoundary: {
            boundaryId: "boundary-runtime-observability-demo",
            dataClasses: ["trace_metadata", "redacted_tool_event"],
            allowedRegions: ["us-east-1"],
            subprocessors: ["example-log-store"],
            retentionDays: 45,
            transferMechanism: "observability-processing-addendum",
            signedEvidenceRef: "ledger-boundary-runtime-observability-demo",
            signatureSha256: "b".repeat(64),
          },
          contractualControls: [
            {
              controlId: "contract-runtime-telemetry-no-secondary-use",
              obligation: "Provider must not use telemetry for secondary model training or resale.",
              status: "active",
              owner: "legal-owner@example.com",
              reviewDate: "2026-06-25",
              signedEvidenceRef: "ledger-contract-runtime-telemetry-no-secondary-use",
              signatureSha256: "c".repeat(64),
            },
          ],
          exceptions: [
            {
              exceptionId: "exc-partial-observability-waiver",
              state: "approved",
              owner: "provider-risk-owner@example.com",
              reason: "Signed waiver for partial observability limitation with compensating audit export.",
              signedEvidenceRef: "ledger-exc-partial-observability-waiver",
              signatureSha256: "d".repeat(64),
            },
          ],
          evidenceRefs: [
            signedEvidence("ev-runtime-provider-record", "e"),
            signedEvidence("ev-runtime-provider-review", "f"),
          ],
          sourceCitationIds: [
            "execution-gap-agent-systems",
            "amc-provider-risk-policy",
          ],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      providerId: "provider-runtime-observability-demo",
      providerType: "infrastructure",
      owner: "provider-risk-owner@example.com",
      reviewDate: "2026-06-25",
      contractualControlIds: ["contract-runtime-telemetry-no-secondary-use"],
      exceptionStates: ["approved"],
    });
    expect(receipt.rows[0]?.dataBoundaryHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.evidenceChainHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyThirdPartyProviderRiskReceipt(receipt).valid).toBe(true);

    const markdown = renderThirdPartyProviderRiskAuditExport(receipt);
    expect(markdown).toContain("# AMC Third-Party Provider Risk Audit Export");
    expect(markdown).toContain("provider-runtime-observability-demo");
    expect(markdown).toContain("contract-runtime-telemetry-no-secondary-use");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("VALID");
  });

  it("fails closed when execution-gap metadata replaces provider-risk evidence", () => {
    const receipt = buildThirdPartyProviderRiskReceipt({
      receiptId: "gap1061-metadata-only-provider-risk",
      generatedAt: "2026-06-25T05:02:00.000+05:30",
      sourceCitations: [],
      providers: [
        {
          providerId: "metadata-only-runtime-provider",
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
              exceptionId: "exc-unsigned-execution-gap",
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
      "metadata-only-runtime-provider:sourceCitation:unknown",
      "metadata-only-runtime-provider:providerRecord:missing",
      "metadata-only-runtime-provider:owner:missing",
      "metadata-only-runtime-provider:reviewDate:missing",
      "metadata-only-runtime-provider:attestation:invalid",
      "metadata-only-runtime-provider:dataBoundary:invalid",
      "metadata-only-runtime-provider:contractualControl:invalid",
      "metadata-only-runtime-provider:signedException:missing",
      "metadata-only-runtime-provider:evidenceChain:invalid",
    ]));
    expect(verifyThirdPartyProviderRiskReceipt(receipt).valid).toBe(false);
  });

  it("does not add execution-gap source identifiers to generic provider-risk, passport, trust, or compliance-doc implementation files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("10.5281/zenodo.19929771");
      expect(source).not.toContain("W7158586692");
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain(TITLE);
    }
  });
});
