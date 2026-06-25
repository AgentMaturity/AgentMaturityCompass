import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPosthocAuditSamplingReceipt,
  renderPosthocAuditSamplingAuditExport,
  verifyPosthocAuditSamplingReceipt,
  type PosthocAuditSamplingEvidenceLink,
  type PosthocAuditSamplingSourceCitation
} from "../src/audit/posthocAuditSampling.js";

const DOC = "docs/source-reviews/GAP-1087-clinical-ai-posthoc-audit-sampling.md";
const OPENALEX = "https://openalex.org/W7125913448";
const DOI = "https://doi.org/10.1007/s44163-025-00784-x";
const SPRINGER = "https://link.springer.com/article/10.1007/s44163-025-00784-x";
const TITLE = "Large language models for clinical artificial intelligence in healthcare a systematic review";
const IDENTIFIER = "clinical_ai_posthoc_audit_sampling";
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
    sourceId: "openalex-w7125913448",
    title: TITLE,
    url: OPENALEX,
    retrievedAt: "2026-06-25T08:11:30.000Z"
  },
  {
    sourceId: "doi-10-1007-s44163-025-00784-x",
    title: "Springer DOI landing page",
    url: DOI,
    retrievedAt: "2026-06-25T08:11:30.000Z"
  }
];

describe("GAP-1087 clinical AI post-hoc audit sampling boundary", () => {
  it("documents the live clinical AI source review and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1087");
    expect(doc).toContain("Post-hoc human audit sampling");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(DOI);
    expect(doc).toContain(SPRINGER);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Discover Artificial Intelligence");
    expect(doc).toContain("ethical governance");
    expect(doc).toContain("hallucinations");
    expect(doc).toContain("bias");
    expect(doc).toContain("privacy risks");
    expect(doc).toContain("regulatory compliance");
    expect(doc).toContain("sample plan");
    expect(doc).toContain("reviewed actions");
    expect(doc).toContain("findings");
    expect(doc).toContain("corrective action");
    expect(doc).toContain("score impact");
    expect(doc).toContain("No clinical subsystem");
    expect(doc).toContain("metadata-only");
  });

  it("reuses the generic Comply/Passport/Vault post-hoc audit receipt for clinical AI sampled actions", () => {
    const receipt = buildPosthocAuditSamplingReceipt({
      receiptId: "gap1087-clinical-ai-posthoc-audit",
      generatedAt: "2026-06-25T08:12:00.000Z",
      sourceCitations,
      samplePlans: [
        {
          samplePlanId: "sample-plan-clinical-triage-high-risk",
          owner: "clinical-audit-owner@example.com",
          populationId: "completed-clinical-ai-actions-2026-06",
          populationSize: 140,
          sampleSize: 14,
          samplingMethod: "stratified",
          riskTier: "critical",
          plannedAt: "2026-06-25T08:12:05.000Z",
          signedEvidenceRef: "ledger-sample-plan-clinical-triage-high-risk",
          signatureSha256: "a".repeat(64)
        }
      ],
      reviewedActions: [
        {
          actionId: "clinical-triage-action-042",
          samplePlanId: "sample-plan-clinical-triage-high-risk",
          agentId: "clinical-triage-agent",
          policyId: "policy-clinical-human-review",
          completedAt: "2026-06-24T18:00:00.000Z",
          sampledAt: "2026-06-25T08:12:10.000Z",
          reviewerId: "clinical-reviewer-2",
          reviewDecision: "escalate",
          reviewSignedEvidenceRef: "ledger-clinical-triage-action-042-review",
          reviewSignatureSha256: "b".repeat(64),
          evidenceRefs: [
            signedEvidence("ev-clinical-action-042-request", "c", "llm_request"),
            signedEvidence("ev-clinical-action-042-response", "d", "llm_response"),
            signedEvidence("ev-clinical-action-042-policy", "e", "audit")
          ],
          sourceCitationIds: ["openalex-w7125913448", "doi-10-1007-s44163-025-00784-x"]
        }
      ],
      findings: [
        {
          findingId: "finding-clinical-human-review-gap",
          actionId: "clinical-triage-action-042",
          severity: "critical",
          description: "Clinical triage action lacked documented clinician review before escalation guidance.",
          owner: "clinical-safety-owner@example.com",
          openedAt: "2026-06-25T08:13:00.000Z",
          signedEvidenceRef: "ledger-finding-clinical-human-review-gap",
          signatureSha256: "f".repeat(64)
        }
      ],
      correctiveActions: [
        {
          correctiveActionId: "ca-clinical-human-review-regression",
          findingId: "finding-clinical-human-review-gap",
          owner: "clinical-platform-owner@example.com",
          description: "Add regression gate requiring clinician-review evidence for high-risk clinical guidance.",
          status: "in_progress",
          dueAt: "2026-07-09T00:00:00.000Z",
          signedEvidenceRef: "ledger-ca-clinical-human-review-regression",
          signatureSha256: "1".repeat(64),
          regressionTestRef: "tests/clinicalHumanReviewRegression.test.ts"
        }
      ],
      scoreImpacts: [
        {
          scoreImpactId: "score-impact-clinical-human-review-gap",
          actionId: "clinical-triage-action-042",
          dimensionId: "AMC-4",
          questionId: "AMC-4.6",
          beforeScore: 0.82,
          afterScore: 0.62,
          impact: -0.2,
          reason: "Post-hoc human audit found missing clinician-review evidence for high-risk clinical action.",
          signedEvidenceRef: "ledger-score-impact-clinical-human-review-gap",
          signatureSha256: "2".repeat(64)
        }
      ]
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows[0]).toMatchObject({
      samplePlanId: "sample-plan-clinical-triage-high-risk",
      actionId: "clinical-triage-action-042",
      agentId: "clinical-triage-agent",
      reviewerId: "clinical-reviewer-2",
      reviewDecision: "escalate",
      findingIds: ["finding-clinical-human-review-gap"],
      correctiveActionIds: ["ca-clinical-human-review-regression"],
      scoreImpactQuestionIds: ["AMC-4.6"],
      scoreImpactValues: [-0.2]
    });
    expect(receipt.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.evidenceChainHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyPosthocAuditSamplingReceipt(receipt).valid).toBe(true);

    const exportMarkdown = renderPosthocAuditSamplingAuditExport(receipt);
    expect(exportMarkdown).toContain("AMC Post-Hoc Audit Sampling Export");
    expect(exportMarkdown).toContain("clinical-triage-action-042");
    expect(exportMarkdown).toContain("finding-clinical-human-review-gap");
    expect(exportMarkdown).toContain("ca-clinical-human-review-regression");
    expect(exportMarkdown).toContain("AMC-4.6:-0.2");
    expect(exportMarkdown).toContain("VALID");
  });

  it("fails closed when clinical paper metadata replaces signed sample, review, finding, corrective-action, score-impact, or evidence-chain proof", () => {
    const receipt = buildPosthocAuditSamplingReceipt({
      receiptId: "gap1087-metadata-only-clinical-audit",
      generatedAt: "2026-06-25T08:14:00.000Z",
      sourceCitations: [sourceCitations[0]],
      samplePlans: [
        {
          samplePlanId: "metadata-only-clinical-plan",
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
          actionId: "metadata-only-clinical-action",
          samplePlanId: "metadata-only-clinical-plan",
          agentId: "",
          policyId: "",
          completedAt: "",
          sampledAt: "",
          reviewerId: "",
          reviewDecision: "escalate",
          reviewSignedEvidenceRef: "",
          reviewSignatureSha256: "",
          evidenceRefs: [],
          sourceCitationIds: ["openalex-w7125913448"]
        }
      ],
      findings: [],
      correctiveActions: [],
      scoreImpacts: []
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "metadata-only-clinical-plan:samplePlan:missing",
      "metadata-only-clinical-action:reviewedAction:missing",
      "metadata-only-clinical-action:evidenceChain:missing",
      "metadata-only-clinical-action:finding:missing",
      "metadata-only-clinical-action:scoreImpact:missing"
    ]));
    expect(verifyPosthocAuditSamplingReceipt(receipt).valid).toBe(false);
  });

  it("does not add clinical-paper-specific identifiers to generic audit, incident, score, or compliance implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("s44163-025-00784-x");
    expect(combined).not.toContain("W7125913448");
    expect(combined).not.toContain("Ghnemat");
    expect(combined).not.toContain("clinical artificial intelligence in healthcare");
    expect(combined).not.toContain(IDENTIFIER);
  });
});
