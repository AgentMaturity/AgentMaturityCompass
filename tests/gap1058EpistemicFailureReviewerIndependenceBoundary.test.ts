import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildReviewerIndependenceReceipt,
  renderReviewerIndependenceAuditExport,
  verifyReviewerIndependenceReceipt,
  type ReviewerIndependenceEvidenceLink,
  type ReviewerIndependenceSourceCitation,
} from "../src/audit/reviewerIndependence.js";

const DOC = "docs/source-reviews/GAP-1058-epistemic-failure-reviewer-independence.md";
const DOI = "https://doi.org/10.5281/zenodo.19042469";
const ZENODO = "https://zenodo.org/records/19042469";
const ZENODO_API = "https://zenodo.org/api/records/19042469";
const OPENALEX = "https://openalex.org/W7136127232";
const OPENALEX_API = "https://api.openalex.org/works/W7136127232";
const TITLE = "A Taxonomy of Epistemic Failure Modes in Large Language Models";
const PDF_FILE = "A Taxonomy of Epistemic Failure Modes in Large Language Models - Bosch 2026.pdf";

const implementationFiles = [
  "src/audit/reviewerIndependence.ts",
  "src/compliance/controlCrosswalk.ts",
  "src/passport/passportArtifact.ts",
  "src/passport/passportCollector.ts",
];

const sourceCitations: ReviewerIndependenceSourceCitation[] = [
  {
    sourceId: "epistemic-failure-modes-reviewer-independence",
    title: TITLE,
    url: DOI,
    retrievedAt: "2026-06-25T04:28:00.000+05:30",
  },
  {
    sourceId: "eu-ai-act-art14-human-oversight",
    title: "Regulation (EU) 2024/1689 Article 14 human oversight",
    url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
    retrievedAt: "2026-06-25T04:28:00.000+05:30",
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

describe("GAP-1058 epistemic-failure reviewer-independence boundary", () => {
  it("documents live OpenAlex, Zenodo, and DOI metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1058");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(ZENODO);
    expect(doc).toContain(ZENODO_API);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-03-15`");
    expect(doc).toContain("preprint");
    expect(doc).toContain("green");
    expect(doc).toContain("cc-by-4.0");
    expect(doc).toContain("Bosch Rodriguez, Rolando");
    expect(doc).toContain("0009-0005-4896-1112");
    expect(doc).toContain(PDF_FILE);
    expect(doc).toContain("md5:d4e26daf91a6520b9684a925c3fe2c11");
    expect(doc).toContain("Reviewer independence proof");
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

  it("builds a generic reviewer-independence receipt for high-risk approvals with signed second review and evidence lineage", () => {
    const receipt = buildReviewerIndependenceReceipt({
      receiptId: "gap1058-reviewer-independence",
      generatedAt: "2026-06-25T04:29:00.000+05:30",
      sourceCitations,
      approvals: [
        {
          approvalId: "approval-high-risk-vault-release",
          actionId: "action-vault-policy-release",
          controlId: "euai_art14_human_oversight",
          riskTier: "high",
          requesterId: "requester-vault-owner",
          requesterRole: "control-owner",
          requesterOrgUnit: "vault",
          reviewerId: "reviewer-grc-lead",
          reviewerRole: "independent-reviewer",
          reviewerOrgUnit: "compliance",
          separationRuleId: "grc-independent-review-v1",
          decision: "approved",
          decidedAt: "2026-06-25T04:30:00.000+05:30",
          approvalReceiptRef: "ledger-approval-high-risk-vault-release",
          approvalSignatureSha256: "a".repeat(64),
          conflictCheck: {
            checkedAt: "2026-06-25T04:29:30.000+05:30",
            flags: [],
            reviewerIsRequester: false,
            reviewerSharesOrgUnitWithRequester: false,
            signedEvidenceRef: "ledger-conflict-approval-high-risk-vault-release",
            signatureSha256: "b".repeat(64),
          },
          secondReview: {
            required: true,
            reviewerId: "second-reviewer-security",
            reviewerRole: "security-approver",
            reviewerOrgUnit: "security",
            decision: "approved",
            decidedAt: "2026-06-25T04:31:00.000+05:30",
            approvalReceiptRef: "ledger-second-review-high-risk-vault-release",
            signedEvidenceRef: "ledger-second-review-evidence-high-risk-vault-release",
            signatureSha256: "c".repeat(64),
          },
          evidenceRefs: [
            signedEvidence("ev-approval-high-risk-vault-release", "d"),
            signedEvidence("ev-policy-diff-high-risk-vault-release", "e"),
          ],
          sourceCitationIds: [
            "epistemic-failure-modes-reviewer-independence",
            "eu-ai-act-art14-human-oversight",
          ],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      approvalId: "approval-high-risk-vault-release",
      roleSeparationPassed: true,
      conflictFree: true,
      secondReviewSatisfied: true,
    });
    expect(receipt.rows[0]?.evidenceChainHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyReviewerIndependenceReceipt(receipt).valid).toBe(true);

    const markdown = renderReviewerIndependenceAuditExport(receipt);
    expect(markdown).toContain("# AMC Reviewer Independence Audit Export");
    expect(markdown).toContain("approval-high-risk-vault-release");
    expect(markdown).toContain("grc-independent-review-v1");
    expect(markdown).toContain("reviewer-grc-lead");
    expect(markdown).toContain("second-reviewer-security");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("VALID");
  });

  it("fails closed when metadata replaces reviewer separation, conflict checks, second review, approval receipts, or signed evidence", () => {
    const receipt = buildReviewerIndependenceReceipt({
      receiptId: "gap1058-metadata-only-reviewer-independence",
      generatedAt: "2026-06-25T04:32:00.000+05:30",
      sourceCitations: [],
      approvals: [
        {
          approvalId: "approval-conflicted-high-risk",
          actionId: "action-conflicted-high-risk",
          controlId: "euai_art14_human_oversight",
          riskTier: "critical",
          requesterId: "same-person",
          requesterRole: "control-owner",
          requesterOrgUnit: "compliance",
          reviewerId: "same-person",
          reviewerRole: "control-owner",
          reviewerOrgUnit: "compliance",
          separationRuleId: "",
          decision: "approved",
          decidedAt: "2026-06-25T04:33:00.000+05:30",
          approvalReceiptRef: "",
          approvalSignatureSha256: "",
          conflictCheck: {
            checkedAt: "2026-06-25T04:32:30.000+05:30",
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
      "approval-conflicted-high-risk:sourceCitation:unknown",
      "approval-conflicted-high-risk:separationRule:missing",
      "approval-conflicted-high-risk:roleSeparation:failed",
      "approval-conflicted-high-risk:conflictCheck:failed",
      "approval-conflicted-high-risk:conflictCheckSignature:missing",
      "approval-conflicted-high-risk:secondReview:missing",
      "approval-conflicted-high-risk:approvalReceipt:missing",
      "approval-conflicted-high-risk:evidenceChain:invalid",
    ]));
    expect(verifyReviewerIndependenceReceipt(receipt).valid).toBe(false);
  });

  it("does not add epistemic-failure paper identifiers to generic audit, compliance, or passport implementation files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("10.5281/zenodo.19042469");
      expect(source).not.toContain("W7136127232");
      expect(source).not.toContain("epistemic_failure_modes_reviewer_independence");
      expect(source).not.toContain(TITLE);
    }
  });
});
