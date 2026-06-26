import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildReviewerIndependenceReceipt,
  renderReviewerIndependenceAuditExport,
  verifyReviewerIndependenceReceipt,
  type ReviewerIndependenceEvidenceLink,
  type ReviewerIndependenceSourceCitation,
} from "../src/audit/reviewerIndependence.js";

const DOC = "docs/source-reviews/GAP-1076-childhood-safety-reviewer-independence.md";
const OPENALEX = "https://openalex.org/W4407691174";
const OPENALEX_API = "https://api.openalex.org/works/W4407691174";
const DOI = "https://doi.org/10.2139/ssrn.6836268";
const SSRN = "https://www.ssrn.com/abstract=6836268";
const TITLE = "LLMs and Childhood Safety Identifying Risks and Proposing a Protection Framework for Safe Child-LLM Interaction";
const IDENTIFIER = "childhood_safety_reviewer_independence";

const implementationFiles = [
  "src/audit/reviewerIndependence.ts",
  "src/compliance/controlCrosswalk.ts",
  "src/passport/passportArtifact.ts",
  "src/passport/passportCollector.ts",
  "docs/COMPLIANCE_FRAMEWORKS.md",
];

const sourceCitations: ReviewerIndependenceSourceCitation[] = [
  {
    sourceId: "childhood-safety-reviewer-independence",
    title: TITLE,
    url: DOI,
    retrievedAt: "2026-06-25T07:34:00.000+05:30",
  },
  {
    sourceId: "eu-ai-act-art14-human-oversight",
    title: "Regulation (EU) 2024/1689 Article 14 human oversight",
    url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
    retrievedAt: "2026-06-25T07:34:00.000+05:30",
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

describe("GAP-1076 childhood-safety reviewer-independence boundary", () => {
  it("documents live OpenAlex and DOI metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1076");
    expect(doc).toContain("Reviewer independence proof");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(SSRN);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-01-01`");
    expect(doc).toContain("preprint");
    expect(doc).toContain("SSRN Electronic Journal");
    expect(doc).toContain("green");
    expect(doc).toContain("Risk analysis (engineering)");
    expect(doc).toContain("Environmental health");
    expect(doc).toContain("The University of Texas at Austin");
    expect(doc).toContain("No abstract in OpenAlex metadata");
    expect(doc).toContain("HTTP/2 `302`");
    expect(doc).toContain("HTTP/2 `403`");
    expect(doc).toContain("Just a moment");
    expect(doc).toContain("role separation");
    expect(doc).toContain("conflict flags");
    expect(doc).toContain("second-review requirements");
    expect(doc).toContain("approval receipt");
    expect(doc).toContain("metadata-only childhood-safety evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses the existing reviewer-independence receipt for high-risk child-safety governance approvals", () => {
    const receipt = buildReviewerIndependenceReceipt({
      receiptId: "gap1076-childhood-safety-reviewer-independence",
      generatedAt: "2026-06-25T07:35:00.000+05:30",
      sourceCitations,
      approvals: [
        {
          approvalId: "approval-child-safety-policy-release",
          actionId: "action-child-safety-policy-release",
          controlId: "euai_art14_human_oversight",
          riskTier: "critical",
          requesterId: "requester-product-policy",
          requesterRole: "policy-owner",
          requesterOrgUnit: "product",
          reviewerId: "reviewer-trust-safety",
          reviewerRole: "independent-reviewer",
          reviewerOrgUnit: "trust-and-safety",
          separationRuleId: "high-risk-independent-child-safety-review-v1",
          decision: "approved",
          decidedAt: "2026-06-25T07:36:00.000+05:30",
          approvalReceiptRef: "ledger-approval-child-safety-policy-release",
          approvalSignatureSha256: "a".repeat(64),
          conflictCheck: {
            checkedAt: "2026-06-25T07:35:30.000+05:30",
            flags: [],
            reviewerIsRequester: false,
            reviewerSharesOrgUnitWithRequester: false,
            signedEvidenceRef: "ledger-conflict-child-safety-policy-release",
            signatureSha256: "b".repeat(64),
          },
          secondReview: {
            required: true,
            reviewerId: "second-reviewer-privacy-counsel",
            reviewerRole: "privacy-counsel",
            reviewerOrgUnit: "legal",
            decision: "approved",
            decidedAt: "2026-06-25T07:37:00.000+05:30",
            approvalReceiptRef: "ledger-second-review-child-safety-policy-release",
            signedEvidenceRef: "ledger-second-review-evidence-child-safety-policy-release",
            signatureSha256: "c".repeat(64),
          },
          evidenceRefs: [
            signedEvidence("ev-child-safety-policy-release-approval", "d"),
            signedEvidence("ev-child-safety-conflict-check", "e"),
          ],
          sourceCitationIds: [
            "childhood-safety-reviewer-independence",
            "eu-ai-act-art14-human-oversight",
          ],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      approvalId: "approval-child-safety-policy-release",
      roleSeparationPassed: true,
      conflictFree: true,
      secondReviewRequired: true,
      secondReviewSatisfied: true,
    });
    expect(receipt.rows[0]?.evidenceChainHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyReviewerIndependenceReceipt(receipt).valid).toBe(true);

    const markdown = renderReviewerIndependenceAuditExport(receipt);
    expect(markdown).toContain("# AMC Reviewer Independence Audit Export");
    expect(markdown).toContain("approval-child-safety-policy-release");
    expect(markdown).toContain("high-risk-independent-child-safety-review-v1");
    expect(markdown).toContain("reviewer-trust-safety");
    expect(markdown).toContain("second-reviewer-privacy-counsel");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("VALID");
  });

  it("fails closed when paper metadata replaces reviewer separation, conflict checks, second review, approval receipts, or evidence lineage", () => {
    const receipt = buildReviewerIndependenceReceipt({
      receiptId: "gap1076-metadata-only-reviewer-independence",
      generatedAt: "2026-06-25T07:38:00.000+05:30",
      sourceCitations: [],
      approvals: [
        {
          approvalId: "approval-child-safety-metadata-only",
          actionId: "action-child-safety-metadata-only",
          controlId: "euai_art14_human_oversight",
          riskTier: "critical",
          requesterId: "same-person",
          requesterRole: "policy-owner",
          requesterOrgUnit: "product",
          reviewerId: "same-person",
          reviewerRole: "policy-owner",
          reviewerOrgUnit: "product",
          separationRuleId: "",
          decision: "approved",
          decidedAt: "2026-06-25T07:38:30.000+05:30",
          approvalReceiptRef: "",
          approvalSignatureSha256: "",
          conflictCheck: {
            checkedAt: "2026-06-25T07:38:20.000+05:30",
            flags: ["reviewer_is_requester", "same_org_unit"],
            reviewerIsRequester: true,
            reviewerSharesOrgUnitWithRequester: true,
          },
          secondReview: {
            required: true,
            reviewerId: "",
            reviewerRole: "",
            decision: "approved",
          },
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
      "approval-child-safety-metadata-only:sourceCitation:unknown",
      "approval-child-safety-metadata-only:separationRule:missing",
      "approval-child-safety-metadata-only:roleSeparation:failed",
      "approval-child-safety-metadata-only:conflictCheck:failed",
      "approval-child-safety-metadata-only:conflictCheckSignature:missing",
      "approval-child-safety-metadata-only:secondReview:missing",
      "approval-child-safety-metadata-only:approvalReceipt:missing",
      "approval-child-safety-metadata-only:evidenceChain:invalid",
    ]));
    expect(verifyReviewerIndependenceReceipt(receipt).valid).toBe(false);
  });

  it("does not add childhood-safety paper identifiers to generic audit, compliance, or passport implementation files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("10.2139/ssrn.6836268");
      expect(source).not.toContain("W4407691174");
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain(TITLE);
    }
  });
});
