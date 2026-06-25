import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPosthocAuditSamplingReceipt,
  renderPosthocAuditSamplingAuditExport,
  verifyPosthocAuditSamplingReceipt,
  type PosthocAuditSamplingEvidenceLink,
  type PosthocAuditSamplingSourceCitation
} from "../src/audit/posthocAuditSampling.js";

const DOC = "docs/source-reviews/GAP-1104-agentic-healthcare-posthoc-audit-sampling.md";
const OPENALEX = "https://openalex.org/W7125926542";
const DOI = "https://doi.org/10.3389/fmed.2025.1753443";
const FRONTIERS = "https://www.frontiersin.org/journals/medicine/articles/10.3389/fmed.2025.1753443/full";
const TITLE = "Exploring Agentic AI in Healthcare: A Study on Its Working Mechanism";
const IDENTIFIER = "agentic_healthcare_posthoc_audit_sampling";
const IMPLEMENTATION_FILES = [
  "src/audit/posthocAuditSampling.ts",
  "src/audit/reviewerIndependence.ts",
  "src/incidents/incidentTypes.ts",
  "src/score/regulatoryReadiness.ts",
  "docs/COMPLIANCE_FRAMEWORKS.md"
];

function signedEvidence(id: string, seed: string, eventType = "audit"): PosthocAuditSamplingEvidenceLink {
  return {
    eventId: id,
    eventHash: seed.repeat(64).slice(0, 64),
    eventType,
    signedEvidenceRef: `ledger-${id}`
  };
}

const sourceCitations: PosthocAuditSamplingSourceCitation[] = [
  {
    sourceId: "openalex-w7125926542",
    title: TITLE,
    url: OPENALEX,
    retrievedAt: "2026-06-25T16:34:50.000Z"
  },
  {
    sourceId: "doi-10-3389-fmed-2025-1753443",
    title: "Frontiers DOI landing page",
    url: DOI,
    retrievedAt: "2026-06-25T16:34:50.000Z"
  },
  {
    sourceId: "frontiers-fmed-2025-1753443",
    title: "Frontiers in Medicine article page",
    url: FRONTIERS,
    retrievedAt: "2026-06-25T16:34:50.000Z"
  }
];

describe("GAP-1104 agentic healthcare post-hoc audit sampling boundary", () => {
  it("documents the live agentic healthcare source review and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1104");
    expect(doc).toContain("Post-hoc human audit sampling");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(DOI);
    expect(doc).toContain(FRONTIERS);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Frontiers in Medicine");
    expect(doc).toContain("Frontiers Media SA");
    expect(doc).toContain("2026-01-28");
    expect(doc).toContain("sample plan");
    expect(doc).toContain("reviewed actions");
    expect(doc).toContain("findings");
    expect(doc).toContain("corrective action");
    expect(doc).toContain("score impact");
    expect(doc).toContain("No healthcare subsystem");
    expect(doc).toContain("metadata-only");
  });

  it("reuses the generic Comply/Passport/Vault post-hoc audit receipt for sampled healthcare-agent actions", () => {
    const receipt = buildPosthocAuditSamplingReceipt({
      receiptId: "gap1104-agentic-healthcare-posthoc-audit",
      generatedAt: "2026-06-25T16:35:00.000Z",
      sourceCitations,
      samplePlans: [
        {
          samplePlanId: "sample-plan-care-coordination-critical",
          owner: "healthcare-audit-owner@example.com",
          populationId: "completed-healthcare-agent-actions-2026-06",
          populationSize: 96,
          sampleSize: 12,
          samplingMethod: "risk_weighted_random",
          riskTier: "critical",
          plannedAt: "2026-06-25T16:35:05.000Z",
          signedEvidenceRef: "ledger-sample-plan-care-coordination-critical",
          signatureSha256: "a".repeat(64)
        }
      ],
      reviewedActions: [
        {
          actionId: "care-coordination-action-017",
          samplePlanId: "sample-plan-care-coordination-critical",
          agentId: "care-coordination-agent",
          policyId: "policy-healthcare-human-review",
          completedAt: "2026-06-24T18:45:00.000Z",
          sampledAt: "2026-06-25T16:35:10.000Z",
          reviewerId: "healthcare-reviewer-3",
          reviewDecision: "issue",
          reviewSignedEvidenceRef: "ledger-care-coordination-action-017-review",
          reviewSignatureSha256: "b".repeat(64),
          evidenceRefs: [
            signedEvidence("ev-care-action-017-request", "c", "llm_request"),
            signedEvidence("ev-care-action-017-response", "d", "llm_response"),
            signedEvidence("ev-care-action-017-policy", "e", "audit")
          ],
          sourceCitationIds: [
            "openalex-w7125926542",
            "doi-10-3389-fmed-2025-1753443",
            "frontiers-fmed-2025-1753443"
          ]
        }
      ],
      findings: [
        {
          findingId: "finding-care-review-gap",
          actionId: "care-coordination-action-017",
          severity: "critical",
          description: "Sampled healthcare-agent action lacked required human-review evidence before workflow escalation.",
          owner: "healthcare-compliance-owner@example.com",
          openedAt: "2026-06-25T16:36:00.000Z",
          signedEvidenceRef: "ledger-finding-care-review-gap",
          signatureSha256: "f".repeat(64)
        }
      ],
      correctiveActions: [
        {
          correctiveActionId: "ca-care-review-regression",
          findingId: "finding-care-review-gap",
          owner: "healthcare-platform-owner@example.com",
          description: "Add regression gate requiring signed human-review evidence for high-risk care coordination actions.",
          status: "in_progress",
          dueAt: "2026-07-09T00:00:00.000Z",
          signedEvidenceRef: "ledger-ca-care-review-regression",
          signatureSha256: "1".repeat(64),
          regressionTestRef: "tests/healthcarePosthocAuditReviewRegression.test.ts"
        }
      ],
      scoreImpacts: [
        {
          scoreImpactId: "score-impact-care-review-gap",
          actionId: "care-coordination-action-017",
          dimensionId: "AMC-4",
          questionId: "AMC-4.6",
          beforeScore: 0.79,
          afterScore: 0.58,
          impact: -0.21,
          reason: "Post-hoc audit found missing human-review evidence for a sampled high-risk healthcare-agent action.",
          signedEvidenceRef: "ledger-score-impact-care-review-gap",
          signatureSha256: "2".repeat(64)
        }
      ]
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows[0]).toMatchObject({
      samplePlanId: "sample-plan-care-coordination-critical",
      actionId: "care-coordination-action-017",
      agentId: "care-coordination-agent",
      reviewerId: "healthcare-reviewer-3",
      reviewDecision: "issue",
      findingIds: ["finding-care-review-gap"],
      correctiveActionIds: ["ca-care-review-regression"],
      scoreImpactQuestionIds: ["AMC-4.6"],
      scoreImpactValues: [-0.21]
    });
    expect(receipt.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.evidenceChainHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyPosthocAuditSamplingReceipt(receipt).valid).toBe(true);

    const exportMarkdown = renderPosthocAuditSamplingAuditExport(receipt);
    expect(exportMarkdown).toContain("AMC Post-Hoc Audit Sampling Export");
    expect(exportMarkdown).toContain("care-coordination-action-017");
    expect(exportMarkdown).toContain("finding-care-review-gap");
    expect(exportMarkdown).toContain("ca-care-review-regression");
    expect(exportMarkdown).toContain("AMC-4.6:-0.21");
    expect(exportMarkdown).toContain("VALID");
  });

  it("fails closed when paper metadata replaces signed sample, review, finding, corrective-action, score-impact, or evidence-chain proof", () => {
    const receipt = buildPosthocAuditSamplingReceipt({
      receiptId: "gap1104-metadata-only-healthcare-audit",
      generatedAt: "2026-06-25T16:36:30.000Z",
      sourceCitations: [sourceCitations[0]],
      samplePlans: [
        {
          samplePlanId: "metadata-only-healthcare-plan",
          owner: "",
          populationId: "",
          populationSize: 0,
          sampleSize: 0,
          samplingMethod: "",
          riskTier: "critical",
          plannedAt: "",
          signedEvidenceRef: "",
          signatureSha256: ""
        }
      ],
      reviewedActions: [
        {
          actionId: "metadata-only-healthcare-action",
          samplePlanId: "metadata-only-healthcare-plan",
          agentId: "",
          policyId: "",
          completedAt: "",
          sampledAt: "",
          reviewerId: "",
          reviewDecision: "issue",
          reviewSignedEvidenceRef: "",
          reviewSignatureSha256: "",
          evidenceRefs: [],
          sourceCitationIds: ["openalex-w7125926542"]
        }
      ],
      findings: [],
      correctiveActions: [],
      scoreImpacts: []
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "metadata-only-healthcare-plan:samplePlan:missing",
      "metadata-only-healthcare-action:reviewedAction:missing",
      "metadata-only-healthcare-action:evidenceChain:missing",
      "metadata-only-healthcare-action:finding:missing",
      "metadata-only-healthcare-action:scoreImpact:missing"
    ]));
    expect(verifyPosthocAuditSamplingReceipt(receipt).valid).toBe(false);
  });

  it("does not add agentic-healthcare-paper-specific identifiers to generic audit, incident, score, or compliance implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("10.3389/fmed.2025.1753443");
    expect(combined).not.toContain("W7125926542");
    expect(combined).not.toContain("Exploring Agentic AI in Healthcare");
    expect(combined).not.toContain("Frontiers in Medicine");
    expect(combined).not.toContain(IDENTIFIER);
  });
});
