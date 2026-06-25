import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildThirdPartyProviderRiskReceipt,
  renderThirdPartyProviderRiskAuditExport,
  verifyThirdPartyProviderRiskReceipt,
  type ThirdPartyProviderRiskEvidenceLink,
  type ThirdPartyProviderRiskSourceCitation,
} from "../src/compliance/providerRisk.js";

const DOC = "docs/source-reviews/GAP-1082-claude-skills-provider-risk.md";
const REPO = "https://github.com/borghei/Claude-Skills";
const README = "https://raw.githubusercontent.com/borghei/Claude-Skills/main/README.md";
const LICENSE = "https://raw.githubusercontent.com/borghei/Claude-Skills/main/LICENSE";
const RELEASE = "https://github.com/borghei/Claude-Skills/releases/tag/v4.8.0";
const TITLE = "borghei/Claude-Skills";
const DESCRIPTION = "338 AI skills across 16 domains. PM is the deepest (66 skills - discovery, execution, strategy frameworks, GTM, Jira/Linear/Notion). Plus engineering, marketing, C-level (CAIO/CDO/CCO/GC/VPE), compliance + audit-prep, new research/ domain, vertical advisors. 74 expert agents, 784+ stdlib Python tools. 11 AI assistants.";
const IDENTIFIER = "claude_skills_provider_risk";

const implementationFiles = [
  "src/compliance/providerRisk.ts",
  "src/passport/trustInterchange.ts",
  "src/trust/trustConfig.ts",
  "docs/COMPLIANCE_FRAMEWORKS.md",
];

const sourceCitations: ThirdPartyProviderRiskSourceCitation[] = [
  {
    sourceId: "github-claude-skills",
    title: TITLE,
    url: REPO,
    retrievedAt: "2026-06-25T08:24:00.000+05:30",
  },
  {
    sourceId: "claude-skills-release-v4-8-0",
    title: "Claude-Skills v4.8.0",
    url: RELEASE,
    retrievedAt: "2026-06-25T08:24:00.000+05:30",
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

describe("GAP-1082 Claude-Skills provider-risk boundary", () => {
  it("documents live GitHub metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1082");
    expect(doc).toContain("Third-party agent and provider risk");
    expect(doc).toContain(REPO);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DESCRIPTION);
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("stargazerCount `300`");
    expect(doc).toContain("forkCount `57`");
    expect(doc).toContain("open issues `0`");
    expect(doc).toContain("latest release `v4.8.0`");
    expect(doc).toContain("published `2026-05-27T21:11:52Z`");
    expect(doc).toContain("license `Other`");
    expect(doc).toContain("Commons Clause License Condition v1.0 + MIT");
    expect(doc).toContain("default branch commit `85aca133912e115e8565dc909dba794788256053`");
    expect(doc).toContain("unsigned");
    expect(doc).toContain("README blob `aae0a8618da8363beba2e6113fb554aca4ac6cb9`");
    expect(doc).toContain("LICENSE blob `9d84f9e269c910c4ba7e636f6c3febce1c468ac4`");
    expect(doc).toContain("registry.json");
    expect(doc).toContain("skills.json");
    expect(doc).toContain("agents");
    expect(doc).toContain("tools");
    expect(doc).toContain("HTML");
    expect(doc).toContain("Python");
    expect(doc).toContain("provider record");
    expect(doc).toContain("attestation");
    expect(doc).toContain("data boundary");
    expect(doc).toContain("contractual control");
    expect(doc).toContain("review date");
    expect(doc).toContain("metadata-only Claude-Skills evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses the existing generic provider-risk receipt for a third-party skills library dependency", () => {
    const receipt = buildThirdPartyProviderRiskReceipt({
      receiptId: "gap1082-claude-skills-provider-risk",
      generatedAt: "2026-06-25T08:25:00.000+05:30",
      sourceCitations,
      providers: [
        {
          providerId: "provider-third-party-skills-library",
          providerName: "Example Third-Party Skills Library",
          providerType: "tool",
          owner: "provider-risk-owner@example.com",
          reviewDate: "2026-06-25",
          nextReviewDate: "2026-09-25",
          dataProcessingPosture: "no_customer_data",
          allowedUseCases: ["offline skill review", "internal prompt-library evaluation"],
          modelRestrictions: ["no unattended third-party skill execution", "no commercial reuse without license review"],
          attestations: [
            {
              attestationId: "att-third-party-skills-security-review-2026",
              attestationType: "security-questionnaire",
              issuedAt: "2026-06-01",
              expiresAt: "2026-12-01",
              signedEvidenceRef: "ledger-att-third-party-skills-security-review-2026",
              signatureSha256: "a".repeat(64),
            },
          ],
          dataBoundary: {
            boundaryId: "boundary-third-party-skills-library",
            dataClasses: ["skill_metadata", "review_notes"],
            allowedRegions: ["us-east-1"],
            subprocessors: [],
            retentionDays: 30,
            transferMechanism: "offline-review-no-customer-data",
            signedEvidenceRef: "ledger-boundary-third-party-skills-library",
            signatureSha256: "b".repeat(64),
          },
          contractualControls: [
            {
              controlId: "contract-license-review-before-commercial-use",
              obligation: "License and Commons Clause terms require review before commercial reuse.",
              status: "active",
              owner: "legal-owner@example.com",
              reviewDate: "2026-06-25",
              signedEvidenceRef: "ledger-contract-license-review-before-commercial-use",
              signatureSha256: "c".repeat(64),
            },
          ],
          exceptions: [
            {
              exceptionId: "exc-third-party-skills-eval-window",
              state: "approved",
              owner: "provider-risk-owner@example.com",
              reason: "Signed time-boxed exception for offline evaluation while skill execution remains disabled.",
              signedEvidenceRef: "ledger-exc-third-party-skills-eval-window",
              signatureSha256: "d".repeat(64),
            },
          ],
          evidenceRefs: [
            signedEvidence("ev-third-party-skills-provider-record", "e"),
            signedEvidence("ev-third-party-skills-license-review", "f"),
          ],
          sourceCitationIds: [
            "github-claude-skills",
            "claude-skills-release-v4-8-0",
          ],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      providerId: "provider-third-party-skills-library",
      providerType: "tool",
      owner: "provider-risk-owner@example.com",
      reviewDate: "2026-06-25",
      dataProcessingPosture: "no_customer_data",
      contractualControlIds: ["contract-license-review-before-commercial-use"],
      exceptionStates: ["approved"],
    });
    expect(receipt.rows[0]?.dataBoundaryHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.contractualControlsHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.attestationsHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.evidenceChainHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyThirdPartyProviderRiskReceipt(receipt).valid).toBe(true);

    const markdown = renderThirdPartyProviderRiskAuditExport(receipt);
    expect(markdown).toContain("# AMC Third-Party Provider Risk Audit Export");
    expect(markdown).toContain("provider-third-party-skills-library");
    expect(markdown).toContain("contract-license-review-before-commercial-use");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("VALID");
  });

  it("fails closed when repository metadata replaces provider-risk evidence", () => {
    const receipt = buildThirdPartyProviderRiskReceipt({
      receiptId: "gap1082-metadata-only-provider-risk",
      generatedAt: "2026-06-25T08:26:00.000+05:30",
      sourceCitations: [],
      providers: [
        {
          providerId: "metadata-only-skills-provider",
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
              exceptionId: "exc-unsigned-claude-skills",
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
      "metadata-only-skills-provider:sourceCitation:unknown",
      "metadata-only-skills-provider:providerRecord:missing",
      "metadata-only-skills-provider:owner:missing",
      "metadata-only-skills-provider:reviewDate:missing",
      "metadata-only-skills-provider:allowedUseCases:missing",
      "metadata-only-skills-provider:attestation:invalid",
      "metadata-only-skills-provider:dataBoundary:invalid",
      "metadata-only-skills-provider:contractualControl:invalid",
      "metadata-only-skills-provider:signedException:missing",
      "metadata-only-skills-provider:evidenceChain:invalid",
    ]));
    expect(verifyThirdPartyProviderRiskReceipt(receipt).valid).toBe(false);
  });

  it("does not add Claude-Skills identifiers to generic provider-risk, passport, trust, or compliance-doc files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("borghei/Claude-Skills");
      expect(source).not.toContain("Claude-Skills");
      expect(source).not.toContain("85aca133912e115e8565dc909dba794788256053");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
