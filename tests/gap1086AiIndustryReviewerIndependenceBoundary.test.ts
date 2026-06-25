import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildReviewerIndependenceReceipt,
  renderReviewerIndependenceAuditExport,
  verifyReviewerIndependenceReceipt,
  type ReviewerIndependenceEvidenceLink,
  type ReviewerIndependenceSourceCitation,
} from "../src/audit/reviewerIndependence.js";

const DOC = "docs/source-reviews/GAP-1086-ai-industry-reviewer-independence.md";
const OPENALEX = "https://openalex.org/W7127134078";
const OPENALEX_API = "https://api.openalex.org/works/W7127134078";
const DOI = "https://doi.org/10.3389/fncom.2026.1780276";
const CROSSREF = "https://api.crossref.org/works/10.3389%2Ffncom.2026.1780276";
const FRONTIERS = "https://www.frontiersin.org/articles/10.3389/fncom.2026.1780276/full";
const FRONTIERS_ARTICLE = "https://www.frontiersin.org/journals/computational-neuroscience/articles/10.3389/fncom.2026.1780276/full";
const FRONTIERS_PDF = "https://www.frontiersin.org/journals/computational-neuroscience/articles/10.3389/fncom.2026.1780276/pdf";
const TITLE = "Editorial: The convergence of AI, LLMs, and industry 4.0: enhancing BCI, HMI, and neuroscience research";
const IDENTIFIER = "ai_industry_reviewer_independence";

const implementationFiles = [
  "src/audit/reviewerIndependence.ts",
  "src/compliance/controlCrosswalk.ts",
  "src/passport/passportArtifact.ts",
  "src/passport/passportCollector.ts",
  "docs/COMPLIANCE_FRAMEWORKS.md",
];

const sourceCitations: ReviewerIndependenceSourceCitation[] = [
  {
    sourceId: "openalex-ai-industry-editorial",
    title: TITLE,
    url: OPENALEX,
    retrievedAt: "2026-06-25T08:56:00.000+05:30",
  },
  {
    sourceId: "doi-ai-industry-editorial",
    title: TITLE,
    url: DOI,
    retrievedAt: "2026-06-25T08:56:00.000+05:30",
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

describe("GAP-1086 AI industry reviewer-independence boundary", () => {
  it("documents live OpenAlex, Crossref, DOI, and Frontiers metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1086");
    expect(doc).toContain("Reviewer independence proof");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(FRONTIERS);
    expect(doc).toContain(FRONTIERS_ARTICLE);
    expect(doc).toContain(FRONTIERS_PDF);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-02-03`");
    expect(doc).toContain("Frontiers in Computational Neuroscience");
    expect(doc).toContain("Frontiers Media");
    expect(doc).toContain("Frontiers Media SA");
    expect(doc).toContain("ISSN `1662-5188`");
    expect(doc).toContain("gold");
    expect(doc).toContain("cc-by");
    expect(doc).toContain("Umer Asgher");
    expect(doc).toContain("Czech Technical University in Prague");
    expect(doc).toContain("National University of Sciences and Technology");
    expect(doc).toContain("Computer science");
    expect(doc).toContain("Software deployment");
    expect(doc).toContain("Human-computer interaction");
    expect(doc).toContain("Scalability");
    expect(doc).toContain("OpenAlex abstract available");
    expect(doc).toContain("HTTP/2 `302`");
    expect(doc).toContain("HTTP/2 `301`");
    expect(doc).toContain("role separation");
    expect(doc).toContain("conflict flags");
    expect(doc).toContain("second-review requirements");
    expect(doc).toContain("approval receipt");
    expect(doc).toContain("metadata-only AI industry editorial evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses the existing reviewer-independence receipt for high-risk deployment approvals", () => {
    const receipt = buildReviewerIndependenceReceipt({
      receiptId: "gap1086-ai-industry-reviewer-independence",
      generatedAt: "2026-06-25T08:57:00.000+05:30",
      sourceCitations,
      approvals: [
        {
          approvalId: "approval-neuroadaptive-interface-release",
          actionId: "action-neuroadaptive-interface-release",
          controlId: "human_review_high_risk_deployment",
          riskTier: "high",
          requesterId: "requester-neuroadaptive-product",
          requesterRole: "product-owner",
          requesterOrgUnit: "product",
          reviewerId: "reviewer-independent-safety",
          reviewerRole: "independent-safety-reviewer",
          reviewerOrgUnit: "trust-and-safety",
          separationRuleId: "high-risk-bci-hmi-independent-review-v1",
          decision: "approved",
          decidedAt: "2026-06-25T08:58:00.000+05:30",
          approvalReceiptRef: "ledger-approval-neuroadaptive-interface-release",
          approvalSignatureSha256: "a".repeat(64),
          conflictCheck: {
            checkedAt: "2026-06-25T08:57:30.000+05:30",
            flags: [],
            reviewerIsRequester: false,
            reviewerSharesOrgUnitWithRequester: false,
            signedEvidenceRef: "ledger-conflict-neuroadaptive-interface-release",
            signatureSha256: "b".repeat(64),
          },
          secondReview: {
            required: true,
            reviewerId: "second-reviewer-human-factors",
            reviewerRole: "human-factors-reviewer",
            reviewerOrgUnit: "research-risk",
            decision: "approved",
            decidedAt: "2026-06-25T08:59:00.000+05:30",
            approvalReceiptRef: "ledger-second-review-neuroadaptive-interface-release",
            signedEvidenceRef: "ledger-second-review-evidence-neuroadaptive-interface-release",
            signatureSha256: "c".repeat(64),
          },
          evidenceRefs: [
            signedEvidence("ev-neuroadaptive-interface-release-approval", "d"),
            signedEvidence("ev-neuroadaptive-interface-conflict-check", "e"),
          ],
          sourceCitationIds: [
            "openalex-ai-industry-editorial",
            "doi-ai-industry-editorial",
          ],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      approvalId: "approval-neuroadaptive-interface-release",
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
    expect(markdown).toContain("approval-neuroadaptive-interface-release");
    expect(markdown).toContain("high-risk-bci-hmi-independent-review-v1");
    expect(markdown).toContain("reviewer-independent-safety");
    expect(markdown).toContain("second-reviewer-human-factors");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("VALID");
  });

  it("fails closed when paper metadata replaces reviewer separation, conflict checks, second review, approval receipts, or evidence lineage", () => {
    const receipt = buildReviewerIndependenceReceipt({
      receiptId: "gap1086-metadata-only-reviewer-independence",
      generatedAt: "2026-06-25T09:00:00.000+05:30",
      sourceCitations: [],
      approvals: [
        {
          approvalId: "approval-ai-industry-metadata-only",
          actionId: "action-ai-industry-metadata-only",
          controlId: "human_review_high_risk_deployment",
          riskTier: "high",
          requesterId: "same-person",
          requesterRole: "product-owner",
          requesterOrgUnit: "product",
          reviewerId: "same-person",
          reviewerRole: "product-owner",
          reviewerOrgUnit: "product",
          separationRuleId: "",
          decision: "approved",
          decidedAt: "2026-06-25T09:00:30.000+05:30",
          approvalReceiptRef: "",
          approvalSignatureSha256: "",
          conflictCheck: {
            checkedAt: "2026-06-25T09:00:20.000+05:30",
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
      "approval-ai-industry-metadata-only:sourceCitation:unknown",
      "approval-ai-industry-metadata-only:separationRule:missing",
      "approval-ai-industry-metadata-only:roleSeparation:failed",
      "approval-ai-industry-metadata-only:conflictCheck:failed",
      "approval-ai-industry-metadata-only:conflictCheckSignature:missing",
      "approval-ai-industry-metadata-only:secondReview:missing",
      "approval-ai-industry-metadata-only:approvalReceipt:missing",
      "approval-ai-industry-metadata-only:evidenceChain:invalid",
    ]));
    expect(verifyReviewerIndependenceReceipt(receipt).valid).toBe(false);
  });

  it("does not add AI industry editorial identifiers to generic audit, compliance, or passport implementation files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("10.3389/fncom.2026.1780276");
      expect(source).not.toContain("W7127134078");
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain(TITLE);
    }
  });
});
