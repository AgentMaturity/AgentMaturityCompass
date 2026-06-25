import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildReviewerIndependenceReceipt,
  renderReviewerIndependenceAuditExport,
  verifyReviewerIndependenceReceipt,
  type ReviewerIndependenceEvidenceLink,
  type ReviewerIndependenceSourceCitation,
} from "../src/audit/reviewerIndependence.js";
import { builtInComplianceMappings } from "../src/compliance/builtInMappings.js";
import {
  buildControlCrosswalkReceipt,
  verifyControlCrosswalkReceipt,
} from "../src/compliance/controlCrosswalk.js";

const DOC = "docs/source-reviews/GAP-1064-credo-ai-reviewer-independence.md";
const HOME = "https://www.credo.ai";
const PRODUCT = "https://www.credo.ai/product";
const RISK = "https://www.credo.ai/solutions/risk-management";
const STANDARDS = "https://www.credo.ai/solutions/regulations-and-standards";
const ARTIFACTS = "https://www.credo.ai/solutions/artifacts";
const TITLE = "Credo AI - The Trusted Leader in AI Governance";
const PRODUCT_TITLE = "Credo AI - The Leader in Responsible AI - Product";
const ARTIFACTS_TITLE = "Credo AI - Create Artifacts for Audit";
const IDENTIFIER = "credo_ai_reviewer_independence";

const implementationFiles = [
  "src/audit/reviewerIndependence.ts",
  "src/compliance/controlCrosswalk.ts",
  "src/passport/passportArtifact.ts",
  "src/passport/passportCollector.ts",
  "docs/COMPLIANCE_FRAMEWORKS.md",
];

const sourceCitations: ReviewerIndependenceSourceCitation[] = [
  {
    sourceId: "credo-ai-governance-platform",
    title: TITLE,
    url: HOME,
    retrievedAt: "2026-06-25T05:32:36.000+05:30",
  },
  {
    sourceId: "eu-ai-act-art14-human-oversight",
    title: "Regulation (EU) 2024/1689 Article 14 human oversight",
    url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
    retrievedAt: "2026-06-25T05:32:36.000+05:30",
  },
];

function signedEvidence(id: string, seed: string): ReviewerIndependenceEvidenceLink {
  return {
    eventId: id,
    eventHash: seed.repeat(64).slice(0, 64),
    eventType: "review",
    signedEvidenceRef: `ledger-${id}`,
  };
}

function selectedCrosswalkMappings() {
  const ids = [
    "nist_govern",
    "iso42001_clause_5_leadership",
    "euai_art14_human_oversight",
    "gdpr_art5_accountability",
    "soc2_security",
  ];
  return ids.map((id) => {
    const mapping = builtInComplianceMappings.find((row) => row.id === id);
    if (!mapping) throw new Error(`missing mapping ${id}`);
    return mapping;
  });
}

describe("GAP-1064 Credo AI reviewer-independence boundary", () => {
  it("documents live Credo AI source metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1064");
    expect(doc).toContain("Reviewer independence proof");
    expect(doc).toContain(HOME);
    expect(doc).toContain(PRODUCT);
    expect(doc).toContain(RISK);
    expect(doc).toContain(STANDARDS);
    expect(doc).toContain(ARTIFACTS);
    expect(doc).toContain(TITLE);
    expect(doc).toContain(PRODUCT_TITLE);
    expect(doc).toContain(ARTIFACTS_TITLE);
    expect(doc).toContain("HTTP/2 `200`");
    expect(doc).toContain("Operationalize Trusted AI governance");
    expect(doc).toContain("AI Registry");
    expect(doc).toContain("Risk Intelligence");
    expect(doc).toContain("Compliance");
    expect(doc).toContain("Runtime Governance");
    expect(doc).toContain("AI Agent Registry");
    expect(doc).toContain("Risk Center");
    expect(doc).toContain("Audit Ready");
    expect(doc).toContain("Artifacts");
    expect(doc).toContain("NIST AI RMF");
    expect(doc).toContain("ISO/IEC 42001");
    expect(doc).toContain("EU AI Act");
    expect(doc).toContain("requester/control owner");
    expect(doc).toContain("role separation");
    expect(doc).toContain("conflict flags");
    expect(doc).toContain("second-review requirements");
    expect(doc).toContain("approval receipt");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("builds a generic reviewer-independence receipt with requester owner, signed review proof, and evidence lineage", () => {
    const receipt = buildReviewerIndependenceReceipt({
      receiptId: "gap1064-credo-reviewer-independence",
      generatedAt: "2026-06-25T05:33:00.000+05:30",
      sourceCitations,
      approvals: [
        {
          approvalId: "approval-high-risk-grc-policy-release",
          actionId: "action-grc-policy-release",
          controlId: "euai_art14_human_oversight",
          riskTier: "critical",
          requesterId: "requester-control-owner-grc",
          requesterRole: "control-owner",
          requesterOrgUnit: "governance",
          reviewerId: "reviewer-independent-compliance",
          reviewerRole: "independent-reviewer",
          reviewerOrgUnit: "compliance",
          separationRuleId: "grc-independent-reviewer-v1",
          decision: "approved",
          decidedAt: "2026-06-25T05:33:30.000+05:30",
          approvalReceiptRef: "ledger-approval-high-risk-grc-policy-release",
          approvalSignatureSha256: "a".repeat(64),
          conflictCheck: {
            checkedAt: "2026-06-25T05:33:10.000+05:30",
            flags: [],
            reviewerIsRequester: false,
            reviewerSharesOrgUnitWithRequester: false,
            signedEvidenceRef: "ledger-conflict-high-risk-grc-policy-release",
            signatureSha256: "b".repeat(64),
          },
          secondReview: {
            required: true,
            reviewerId: "second-reviewer-security-lead",
            reviewerRole: "security-approver",
            reviewerOrgUnit: "security",
            decision: "approved",
            decidedAt: "2026-06-25T05:34:00.000+05:30",
            approvalReceiptRef: "ledger-second-review-high-risk-grc-policy-release",
            signedEvidenceRef: "ledger-second-review-evidence-high-risk-grc-policy-release",
            signatureSha256: "c".repeat(64),
          },
          evidenceRefs: [
            signedEvidence("ev-approval-high-risk-grc-policy-release", "d"),
            signedEvidence("ev-control-owner-high-risk-grc-policy-release", "e"),
          ],
          sourceCitationIds: [
            "credo-ai-governance-platform",
            "eu-ai-act-art14-human-oversight",
          ],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows[0]).toMatchObject({
      requesterId: "requester-control-owner-grc",
      roleSeparationPassed: true,
      conflictFree: true,
      secondReviewSatisfied: true,
    });
    expect(receipt.rows[0]?.evidenceChainHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyReviewerIndependenceReceipt(receipt).valid).toBe(true);

    const markdown = renderReviewerIndependenceAuditExport(receipt);
    expect(markdown).toContain("# AMC Reviewer Independence Audit Export");
    expect(markdown).toContain("Requester/Owner");
    expect(markdown).toContain("requester-control-owner-grc");
    expect(markdown).toContain("reviewer-independent-compliance");
    expect(markdown).toContain("second-reviewer-security-lead");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("VALID");
  });

  it("keeps control mapping, signed exception workflow, owner, and evidence chain on existing Comply primitives", () => {
    const receipt = buildControlCrosswalkReceipt({
      receiptId: "gap1064-credo-control-crosswalk",
      generatedAt: "2026-06-25T05:34:30.000+05:30",
      mappings: selectedCrosswalkMappings(),
      sourceCitations,
      ownersByMappingId: {
        nist_govern: "grc-owner@example.com",
        iso42001_clause_5_leadership: "leadership-owner@example.com",
        euai_art14_human_oversight: "oversight-owner@example.com",
        gdpr_art5_accountability: "privacy-owner@example.com",
        soc2_security: "security-owner@example.com",
      },
      evidenceByMappingId: {
        nist_govern: [{ eventId: "ev-nist-govern-credo", eventHash: "1".repeat(64), evidenceType: "audit", signedEvidenceRef: "ledger-nist-govern-credo" }],
        iso42001_clause_5_leadership: [{ eventId: "ev-iso-leadership-credo", eventHash: "2".repeat(64), evidenceType: "review", signedEvidenceRef: "ledger-iso-leadership-credo" }],
        euai_art14_human_oversight: [{ eventId: "ev-euai-art14-credo", eventHash: "3".repeat(64), evidenceType: "review", signedEvidenceRef: "ledger-euai-art14-credo" }],
        gdpr_art5_accountability: [{ eventId: "ev-gdpr-accountability-credo", eventHash: "4".repeat(64), evidenceType: "audit", signedEvidenceRef: "ledger-gdpr-accountability-credo" }],
        soc2_security: [{ eventId: "ev-soc2-security-credo", eventHash: "5".repeat(64), evidenceType: "audit", signedEvidenceRef: "ledger-soc2-security-credo" }],
      },
      exceptions: [
        {
          mappingId: "euai_art14_human_oversight",
          exceptionId: "exc-euai-art14-reviewer-window",
          state: "approved",
          owner: "oversight-owner@example.com",
          reason: "Signed refresh-window exception for reviewer rota migration.",
          signedEvidenceRef: "ledger-exc-euai-art14-reviewer-window",
          signatureSha256: "6".repeat(64),
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows.every((row) => row.owner.includes("@"))).toBe(true);
    expect(receipt.rows.every((row) => row.sourceCitationIds.includes("credo-ai-governance-platform"))).toBe(true);
    expect(receipt.rows.every((row) => row.evidenceChainHash.match(/^[a-f0-9]{64}$/))).toBe(true);
    expect(receipt.rows.find((row) => row.mappingId === "euai_art14_human_oversight")?.exceptionState).toBe("approved");
    expect(verifyControlCrosswalkReceipt(receipt).valid).toBe(true);
  });

  it("fails closed when Credo metadata replaces signed reviewer independence evidence", () => {
    const receipt = buildReviewerIndependenceReceipt({
      receiptId: "gap1064-metadata-only-reviewer-independence",
      generatedAt: "2026-06-25T05:35:00.000+05:30",
      sourceCitations: [sourceCitations[0]],
      approvals: [
        {
          approvalId: "approval-metadata-only-high-risk",
          actionId: "action-metadata-only-high-risk",
          controlId: "euai_art14_human_oversight",
          riskTier: "high",
          requesterId: "same-person",
          requesterRole: "control-owner",
          requesterOrgUnit: "governance",
          reviewerId: "same-person",
          reviewerRole: "control-owner",
          reviewerOrgUnit: "governance",
          separationRuleId: "",
          decision: "approved",
          decidedAt: "2026-06-25T05:35:30.000+05:30",
          approvalReceiptRef: "",
          approvalSignatureSha256: "",
          evidenceRefs: [],
          sourceCitationIds: ["credo-ai-governance-platform"],
        },
      ],
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "approval-metadata-only-high-risk:separationRule:missing",
      "approval-metadata-only-high-risk:roleSeparation:failed",
      "approval-metadata-only-high-risk:conflictCheck:missing",
      "approval-metadata-only-high-risk:secondReview:missing",
      "approval-metadata-only-high-risk:approvalReceipt:missing",
      "approval-metadata-only-high-risk:evidenceChain:missing",
    ]));
    expect(verifyReviewerIndependenceReceipt(receipt).valid).toBe(false);
  });

  it("does not add Credo source identifiers to generic audit, compliance, or passport implementation files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("credo.ai");
      expect(source).not.toContain("Credo AI");
      expect(source).not.toContain("COMP-119");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
