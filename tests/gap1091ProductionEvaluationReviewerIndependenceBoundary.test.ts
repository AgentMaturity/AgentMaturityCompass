import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildReviewerIndependenceReceipt,
  renderReviewerIndependenceAuditExport,
  verifyReviewerIndependenceReceipt,
  type ReviewerIndependenceEvidenceLink,
  type ReviewerIndependenceSourceCitation,
} from "../src/audit/reviewerIndependence.js";

const DOC = "docs/source-reviews/GAP-1091-production-evaluation-reviewer-independence.md";
const OPENALEX = "https://openalex.org/W7163809507";
const OPENALEX_API = "https://api.openalex.org/works/W7163809507";
const DOI = "https://doi.org/10.5281/zenodo.20583928";
const ZENODO_DOI = "https://zenodo.org/doi/10.5281/zenodo.20583928";
const ZENODO_RECORD = "https://zenodo.org/records/20583928";
const ZENODO_API = "https://zenodo.org/api/records/20583928";
const CROSSREF = "https://api.crossref.org/works/10.5281/zenodo.20583928";
const TITLE = "Replication package for \"Evaluation and Testing of LLM-Based Agents in Production: A Systematic Literature Review\"";
const IDENTIFIER = "production_evaluation_reviewer_independence";

const implementationFiles = [
  "src/audit/reviewerIndependence.ts",
  "src/compliance/controlCrosswalk.ts",
  "src/passport/passportArtifact.ts",
  "src/passport/passportCollector.ts",
  "docs/COMPLIANCE_FRAMEWORKS.md",
];

const sourceCitations: ReviewerIndependenceSourceCitation[] = [
  {
    sourceId: "openalex-production-evaluation-package",
    title: TITLE,
    url: OPENALEX,
    retrievedAt: "2026-06-25T17:20:00.000Z",
  },
  {
    sourceId: "zenodo-production-evaluation-package",
    title: TITLE,
    url: ZENODO_RECORD,
    retrievedAt: "2026-06-25T17:20:00.000Z",
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

describe("GAP-1091 production-agent evaluation reviewer-independence boundary", () => {
  it("documents live OpenAlex, DOI, Zenodo, and Crossref boundary metadata with required sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1091");
    expect(doc).toContain("Reviewer independence proof");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(ZENODO_DOI);
    expect(doc).toContain(ZENODO_RECORD);
    expect(doc).toContain(ZENODO_API);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-06-07`");
    expect(doc).toContain("type `dataset`");
    expect(doc).toContain("Zenodo (CERN European Organization for Nuclear Research)");
    expect(doc).toContain("license `cc-by`");
    expect(doc).toContain("Zenodo record `20583928`");
    expect(doc).toContain("concept DOI `10.5281/zenodo.20583927`");
    expect(doc).toContain("DOI `10.5281/zenodo.20583928`");
    expect(doc).toContain("resource type `Dataset`");
    expect(doc).toContain("files count `1`");
    expect(doc).toContain("license `cc-by-4.0`");
    expect(doc).toContain("authors count `5`");
    expect(doc).toContain("Carlos Chinchilla Corbacho");
    expect(doc).toContain("Daniel Hernández de la Iglesia");
    expect(doc).toContain("André Sales Mendes");
    expect(doc).toContain("Diego M. Jiménez-Bravo");
    expect(doc).toContain("Alfonso José López-Rivero");
    expect(doc).toContain("Systematic review");
    expect(doc).toContain("Data extraction");
    expect(doc).toContain("Audit");
    expect(doc).toContain("quality assurance");
    expect(doc).toContain("DOI returned HTTP/2 `302`");
    expect(doc).toContain("Zenodo DOI page returned HTTP/1.1 `302`");
    expect(doc).toContain("Zenodo record returned HTTP/1.1 `200`");
    expect(doc).toContain("Crossref returned HTTP/2 `404`");
    expect(doc).toContain("OpenAlex API first 200 KB SHA-256 `2e86573e5a5efb21b8b72529a5d8478c5434d987ec5f18b72fd14f4c18280737`");
    expect(doc).toContain("Zenodo API first 200 KB SHA-256 `750828e6cd90c3a6cf41d67e301ede1a8903e97b24e33fa2001eeea2e39e503f`");
    expect(doc).toContain("Zenodo record first 200 KB SHA-256 `b70ea004d90ef157fcb3de4b96f2f20f3d4bc88cd35557fe71050c5e05f5c754`");
    expect(doc).toContain("reviewer metadata");
    expect(doc).toContain("role separation");
    expect(doc).toContain("conflict flags");
    expect(doc).toContain("second-review requirements");
    expect(doc).toContain("approval receipt");
    expect(doc).toContain("metadata-only replication package evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses the existing reviewer-independence receipt for high-risk production-agent evaluation approvals", () => {
    const receipt = buildReviewerIndependenceReceipt({
      receiptId: "gap1091-production-evaluation-reviewer-independence",
      generatedAt: "2026-06-25T17:21:00.000Z",
      sourceCitations,
      approvals: [
        {
          approvalId: "approval-production-agent-eval-release",
          actionId: "action-production-agent-eval-release",
          controlId: "human_review_high_risk_evaluation_release",
          riskTier: "high",
          requesterId: "requester-agent-eval-lead",
          requesterRole: "evaluation-owner",
          requesterOrgUnit: "agent-platform",
          reviewerId: "reviewer-independent-quality",
          reviewerRole: "independent-quality-reviewer",
          reviewerOrgUnit: "quality-assurance",
          separationRuleId: "high-risk-production-eval-independent-review-v1",
          decision: "approved",
          decidedAt: "2026-06-25T17:22:00.000Z",
          approvalReceiptRef: "ledger-approval-production-agent-eval-release",
          approvalSignatureSha256: "a".repeat(64),
          conflictCheck: {
            checkedAt: "2026-06-25T17:21:30.000Z",
            flags: [],
            reviewerIsRequester: false,
            reviewerSharesOrgUnitWithRequester: false,
            signedEvidenceRef: "ledger-conflict-production-agent-eval-release",
            signatureSha256: "b".repeat(64),
          },
          secondReview: {
            required: true,
            reviewerId: "second-reviewer-agent-assurance",
            reviewerRole: "agent-assurance-reviewer",
            reviewerOrgUnit: "risk-and-compliance",
            decision: "approved",
            decidedAt: "2026-06-25T17:23:00.000Z",
            approvalReceiptRef: "ledger-second-review-production-agent-eval-release",
            signedEvidenceRef: "ledger-second-review-evidence-production-agent-eval-release",
            signatureSha256: "c".repeat(64),
          },
          evidenceRefs: [
            signedEvidence("ev-production-agent-eval-approval", "d"),
            signedEvidence("ev-production-agent-eval-conflict-check", "e"),
            signedEvidence("ev-production-agent-eval-second-review", "f"),
          ],
          sourceCitationIds: [
            "openalex-production-evaluation-package",
            "zenodo-production-evaluation-package",
          ],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      approvalId: "approval-production-agent-eval-release",
      roleSeparationPassed: true,
      conflictFree: true,
      secondReviewRequired: true,
      secondReviewSatisfied: true,
      requesterId: "requester-agent-eval-lead",
      reviewerId: "reviewer-independent-quality",
    });
    expect(receipt.rows[0]?.evidenceChainHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyReviewerIndependenceReceipt(receipt).valid).toBe(true);

    const markdown = renderReviewerIndependenceAuditExport(receipt);
    expect(markdown).toContain("# AMC Reviewer Independence Audit Export");
    expect(markdown).toContain("approval-production-agent-eval-release");
    expect(markdown).toContain("high-risk-production-eval-independent-review-v1");
    expect(markdown).toContain("reviewer-independent-quality");
    expect(markdown).toContain("second-reviewer-agent-assurance");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("VALID");
  });

  it("fails closed when replication-package metadata replaces reviewer separation, conflict checks, second review, approval receipts, or evidence lineage", () => {
    const receipt = buildReviewerIndependenceReceipt({
      receiptId: "gap1091-metadata-only-reviewer-independence",
      generatedAt: "2026-06-25T17:24:00.000Z",
      sourceCitations: [],
      approvals: [
        {
          approvalId: "approval-production-eval-metadata-only",
          actionId: "action-production-eval-metadata-only",
          controlId: "human_review_high_risk_evaluation_release",
          riskTier: "high",
          requesterId: "same-person",
          requesterRole: "evaluation-owner",
          requesterOrgUnit: "agent-platform",
          reviewerId: "same-person",
          reviewerRole: "evaluation-owner",
          reviewerOrgUnit: "agent-platform",
          separationRuleId: "",
          decision: "approved",
          decidedAt: "2026-06-25T17:24:30.000Z",
          approvalReceiptRef: "",
          approvalSignatureSha256: "",
          conflictCheck: {
            checkedAt: "2026-06-25T17:24:20.000Z",
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
              eventId: "zenodo-title-only",
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
      "approval-production-eval-metadata-only:sourceCitation:unknown",
      "approval-production-eval-metadata-only:separationRule:missing",
      "approval-production-eval-metadata-only:roleSeparation:failed",
      "approval-production-eval-metadata-only:conflictCheck:failed",
      "approval-production-eval-metadata-only:conflictCheckSignature:missing",
      "approval-production-eval-metadata-only:secondReview:missing",
      "approval-production-eval-metadata-only:approvalReceipt:missing",
      "approval-production-eval-metadata-only:evidenceChain:invalid",
    ]));
    expect(verifyReviewerIndependenceReceipt(receipt).valid).toBe(false);
  });

  it("does not add replication-package identifiers to generic audit, compliance, or passport implementation files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("W7163809507");
      expect(source).not.toContain("20583928");
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain(TITLE);
    }
  });
});
