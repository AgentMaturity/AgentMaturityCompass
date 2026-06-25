import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPosthocAuditSamplingReceipt,
  renderPosthocAuditSamplingAuditExport,
  verifyPosthocAuditSamplingReceipt,
  type PosthocAuditSamplingEvidenceLink,
  type PosthocAuditSamplingSourceCitation,
} from "../src/audit/posthocAuditSampling.js";

const DOC = "docs/source-reviews/GAP-1066-fairly-ai-posthoc-audit-sampling.md";
const FAIRLY_HOME = "https://www.fairly.ai";
const ASENION_HOME = "https://asenion.ai";
const GOVERNANCE_PLATFORM = "https://asenion.ai/ai-governance-platform";
const AI_TRISM = "https://asenion.ai/ai-trism";
const INCIDENT_REPORTING = "https://asenion.ai/incident-reporting";
const TRUST_CENTER = "https://asenion.ai/trust/fairly-ai";
const ENTERPRISE_AGENT_MANAGEMENT = "https://asenion.ai/enterprise-agent-management";
const TITLE = "Asenion | AI Governance, Risk and Compliance Management Platform";
const GOVERNANCE_TITLE = "Asenion | AI Governance Platform";
const INCIDENT_TITLE = "AI Incident Reporting Form | Fairly AI";
const IDENTIFIER = "fairly_ai_posthoc_audit_sampling";

const implementationFiles = [
  "src/audit/posthocAuditSampling.ts",
  "src/audit/reviewerIndependence.ts",
  "src/compliance/controlCrosswalk.ts",
  "src/compliance/exceptionLifecycle.ts",
  "src/incidents/incidentTypes.ts",
  "src/score/scoreExplainer.ts",
  "docs/COMPLIANCE_FRAMEWORKS.md",
];

const sourceCitations: PosthocAuditSamplingSourceCitation[] = [
  {
    sourceId: "fairly-ai-asenion-governance-platform",
    title: TITLE,
    url: ASENION_HOME,
    retrievedAt: "2026-06-25T05:56:30.000+05:30",
  },
  {
    sourceId: "eu-ai-act-art14-human-oversight",
    title: "Regulation (EU) 2024/1689 Article 14 human oversight",
    url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
    retrievedAt: "2026-06-25T05:56:30.000+05:30",
  },
];

function signedEvidence(id: string, seed: string, eventType = "audit"): PosthocAuditSamplingEvidenceLink {
  return {
    eventId: id,
    eventHash: seed.repeat(64).slice(0, 64),
    eventType,
    signedEvidenceRef: `ledger-${id}`,
  };
}

describe("GAP-1066 Fairly AI post-hoc audit sampling boundary", () => {
  it("documents live Fairly AI / Asenion source metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1066");
    expect(doc).toContain("Post-hoc human audit sampling");
    expect(doc).toContain(FAIRLY_HOME);
    expect(doc).toContain(ASENION_HOME);
    expect(doc).toContain(GOVERNANCE_PLATFORM);
    expect(doc).toContain(AI_TRISM);
    expect(doc).toContain(INCIDENT_REPORTING);
    expect(doc).toContain(TRUST_CENTER);
    expect(doc).toContain(ENTERPRISE_AGENT_MANAGEMENT);
    expect(doc).toContain(TITLE);
    expect(doc).toContain(GOVERNANCE_TITLE);
    expect(doc).toContain(INCIDENT_TITLE);
    expect(doc).toContain("HTTP/2 `301`");
    expect(doc).toContain("HTTP/2 `200`");
    expect(doc).toContain("Asenion");
    expect(doc).toContain("Fairly AI");
    expect(doc).toContain("AI Governance, Risk and Compliance");
    expect(doc).toContain("oversight");
    expect(doc).toContain("Audit");
    expect(doc).toContain("Risk");
    expect(doc).toContain("Documentation");
    expect(doc).toContain("Incident Reporting");
    expect(doc).toContain("Enterprise Agent Management");
    expect(doc).toContain("sample plan");
    expect(doc).toContain("reviewed actions");
    expect(doc).toContain("findings");
    expect(doc).toContain("corrective action");
    expect(doc).toContain("score impact");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("builds a generic post-hoc audit sampling receipt with sample plan, reviewed action, finding, corrective action, score impact, and evidence chain", () => {
    const receipt = buildPosthocAuditSamplingReceipt({
      receiptId: "gap1066-fairly-ai-posthoc-audit-sampling",
      generatedAt: "2026-06-25T05:57:00.000+05:30",
      sourceCitations,
      samplePlans: [
        {
          samplePlanId: "sample-plan-high-risk-actions-june",
          owner: "audit-owner@example.com",
          populationId: "autonomous-actions-june-2026",
          populationSize: 320,
          sampleSize: 12,
          samplingMethod: "risk_weighted_random",
          riskTier: "high",
          plannedAt: "2026-06-25T05:57:05.000+05:30",
          signedEvidenceRef: "ledger-sample-plan-high-risk-actions-june",
          signatureSha256: "a".repeat(64),
        },
      ],
      reviewedActions: [
        {
          actionId: "action-auto-refund-884",
          samplePlanId: "sample-plan-high-risk-actions-june",
          agentId: "billing-resolution-agent",
          policyId: "policy-refund-approval",
          completedAt: "2026-06-24T18:30:00.000+05:30",
          sampledAt: "2026-06-25T05:57:10.000+05:30",
          reviewerId: "human-auditor-17",
          reviewDecision: "issue",
          reviewSignedEvidenceRef: "ledger-reviewed-action-auto-refund-884",
          reviewSignatureSha256: "b".repeat(64),
          evidenceRefs: [
            signedEvidence("ev-action-auto-refund-884-trace", "c", "runtime"),
            signedEvidence("ev-action-auto-refund-884-review", "d", "review"),
          ],
          sourceCitationIds: [
            "fairly-ai-asenion-governance-platform",
            "eu-ai-act-art14-human-oversight",
          ],
        },
      ],
      findings: [
        {
          findingId: "finding-refund-policy-miss",
          actionId: "action-auto-refund-884",
          severity: "high",
          description: "Refund action missed required second-approval evidence.",
          owner: "policy-owner@example.com",
          openedAt: "2026-06-25T05:58:00.000+05:30",
          signedEvidenceRef: "ledger-finding-refund-policy-miss",
          signatureSha256: "e".repeat(64),
        },
      ],
      correctiveActions: [
        {
          correctiveActionId: "ca-refund-second-approval-regression",
          findingId: "finding-refund-policy-miss",
          owner: "engineering-owner@example.com",
          description: "Add regression check that blocks refund release without second-approval evidence.",
          status: "open",
          dueAt: "2026-07-02T00:00:00.000+05:30",
          signedEvidenceRef: "ledger-ca-refund-second-approval-regression",
          signatureSha256: "f".repeat(64),
          regressionTestRef: "tests/refundSecondApprovalRegression.test.ts",
        },
      ],
      scoreImpacts: [
        {
          scoreImpactId: "score-impact-refund-policy-miss",
          actionId: "action-auto-refund-884",
          dimensionId: "AMC-4",
          questionId: "AMC-4.3",
          beforeScore: 0.78,
          afterScore: 0.68,
          impact: -0.1,
          reason: "Post-hoc audit found missing second-approval evidence for a high-risk action.",
          signedEvidenceRef: "ledger-score-impact-refund-policy-miss",
          signatureSha256: "1".repeat(64),
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      samplePlanId: "sample-plan-high-risk-actions-june",
      actionId: "action-auto-refund-884",
      agentId: "billing-resolution-agent",
      reviewerId: "human-auditor-17",
      reviewDecision: "issue",
      findingIds: ["finding-refund-policy-miss"],
      correctiveActionIds: ["ca-refund-second-approval-regression"],
      scoreImpactIds: ["score-impact-refund-policy-miss"],
    });
    expect(receipt.rows[0]?.samplePlanHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.findingsHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.correctiveActionsHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.scoreImpactHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.evidenceChainHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyPosthocAuditSamplingReceipt(receipt).valid).toBe(true);

    const markdown = renderPosthocAuditSamplingAuditExport(receipt);
    expect(markdown).toContain("# AMC Post-Hoc Audit Sampling Export");
    expect(markdown).toContain("Sample plan");
    expect(markdown).toContain("Reviewed action");
    expect(markdown).toContain("finding-refund-policy-miss");
    expect(markdown).toContain("ca-refund-second-approval-regression");
    expect(markdown).toContain("AMC-4.3");
    expect(markdown).toContain("-0.1");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("VALID");
  });

  it("fails closed when Fairly AI / Asenion metadata replaces signed post-hoc audit evidence", () => {
    const receipt = buildPosthocAuditSamplingReceipt({
      receiptId: "gap1066-metadata-only-posthoc-audit",
      generatedAt: "2026-06-25T05:58:30.000+05:30",
      sourceCitations: [sourceCitations[0]],
      samplePlans: [
        {
          samplePlanId: "metadata-only-sample-plan",
          owner: "",
          populationId: "",
          populationSize: 0,
          sampleSize: 0,
          samplingMethod: "",
          riskTier: "high",
          plannedAt: "",
          signedEvidenceRef: "",
          signatureSha256: "",
        },
      ],
      reviewedActions: [
        {
          actionId: "metadata-only-action",
          samplePlanId: "metadata-only-sample-plan",
          agentId: "",
          policyId: "",
          completedAt: "",
          sampledAt: "",
          reviewerId: "",
          reviewDecision: "issue",
          reviewSignedEvidenceRef: "",
          reviewSignatureSha256: "",
          evidenceRefs: [],
          sourceCitationIds: ["fairly-ai-asenion-governance-platform"],
        },
      ],
      findings: [],
      correctiveActions: [],
      scoreImpacts: [],
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "metadata-only-sample-plan:samplePlan:missing",
      "metadata-only-action:reviewedAction:missing",
      "metadata-only-action:evidenceChain:missing",
      "metadata-only-action:finding:missing",
      "metadata-only-action:scoreImpact:missing",
    ]));
    expect(verifyPosthocAuditSamplingReceipt(receipt).valid).toBe(false);
  });

  it("fails closed when an audit finding has no corrective action", () => {
    const receipt = buildPosthocAuditSamplingReceipt({
      receiptId: "gap1066-missing-corrective-action",
      generatedAt: "2026-06-25T05:59:00.000+05:30",
      sourceCitations,
      samplePlans: [
        {
          samplePlanId: "sample-plan-high-risk-actions-june",
          owner: "audit-owner@example.com",
          populationId: "autonomous-actions-june-2026",
          populationSize: 320,
          sampleSize: 12,
          samplingMethod: "risk_weighted_random",
          riskTier: "high",
          plannedAt: "2026-06-25T05:57:05.000+05:30",
          signedEvidenceRef: "ledger-sample-plan-high-risk-actions-june",
          signatureSha256: "a".repeat(64),
        },
      ],
      reviewedActions: [
        {
          actionId: "action-auto-refund-884",
          samplePlanId: "sample-plan-high-risk-actions-june",
          agentId: "billing-resolution-agent",
          policyId: "policy-refund-approval",
          completedAt: "2026-06-24T18:30:00.000+05:30",
          sampledAt: "2026-06-25T05:57:10.000+05:30",
          reviewerId: "human-auditor-17",
          reviewDecision: "issue",
          reviewSignedEvidenceRef: "ledger-reviewed-action-auto-refund-884",
          reviewSignatureSha256: "b".repeat(64),
          evidenceRefs: [signedEvidence("ev-action-auto-refund-884-trace", "c", "runtime")],
          sourceCitationIds: ["fairly-ai-asenion-governance-platform"],
        },
      ],
      findings: [
        {
          findingId: "finding-refund-policy-miss",
          actionId: "action-auto-refund-884",
          severity: "high",
          description: "Refund action missed required second-approval evidence.",
          owner: "policy-owner@example.com",
          openedAt: "2026-06-25T05:58:00.000+05:30",
          signedEvidenceRef: "ledger-finding-refund-policy-miss",
          signatureSha256: "e".repeat(64),
        },
      ],
      correctiveActions: [],
      scoreImpacts: [
        {
          scoreImpactId: "score-impact-refund-policy-miss",
          actionId: "action-auto-refund-884",
          dimensionId: "AMC-4",
          questionId: "AMC-4.3",
          beforeScore: 0.78,
          afterScore: 0.68,
          impact: -0.1,
          reason: "Post-hoc audit found missing second-approval evidence for a high-risk action.",
          signedEvidenceRef: "ledger-score-impact-refund-policy-miss",
          signatureSha256: "1".repeat(64),
        },
      ],
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toContain("finding-refund-policy-miss:correctiveAction:missing");
    expect(verifyPosthocAuditSamplingReceipt(receipt).valid).toBe(false);
  });

  it("does not add Fairly AI or Asenion source identifiers to generic audit, compliance, score, or incident implementation files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("fairly.ai");
      expect(source).not.toContain("Fairly AI");
      expect(source).not.toContain("Asenion");
      expect(source).not.toContain("COMP-121");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
