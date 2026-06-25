import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPosthocAuditSamplingReceipt,
  renderPosthocAuditSamplingAuditExport,
  verifyPosthocAuditSamplingReceipt,
  type PosthocAuditSamplingEvidenceLink,
  type PosthocAuditSamplingSourceCitation,
} from "../src/audit/posthocAuditSampling.js";

const DOC = "docs/source-reviews/GAP-1072-onetrust-ai-governance-posthoc-audit.md";
const ORIGINAL_URL = "https://www.onetrust.com/products/ai-governance/";
const AI_GOVERNANCE = "https://www.onetrust.com/solutions/ai-governance/";
const POLICY_MANAGEMENT = "https://www.onetrust.com/products/policy-management/";
const THIRD_PARTY_RISK = "https://www.onetrust.com/products/third-party-risk-management/";
const DATA_DISCOVERY = "https://www.onetrust.com/products/data-discovery/";
const TITLE = "AI Governance Software | Solutions | OneTrust";
const DESCRIPTION = "Manage AI risk, automate compliance, and enforce policy-driven controls across the AI lifecycle. OneTrust AI Governance software helps enterprises monitor models and agents while scaling responsible AI.";
const POLICY_TITLE = "Compliance Automation | Products | OneTrust";
const THIRD_PARTY_RISK_TITLE = "Third-Party Risk Management | Products | OneTrust";
const DATA_USE_TITLE = "Data Use Governance | Solutions | OneTrust";
const IDENTIFIER = "onetrust_ai_governance_posthoc_audit";

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
    sourceId: "onetrust-ai-governance-policy-controls",
    title: TITLE,
    url: AI_GOVERNANCE,
    retrievedAt: "2026-06-25T06:56:40.000+05:30",
  },
  {
    sourceId: "eu-ai-act-art14-human-oversight",
    title: "Regulation (EU) 2024/1689 Article 14 human oversight",
    url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
    retrievedAt: "2026-06-25T06:56:40.000+05:30",
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

describe("GAP-1072 OneTrust AI Governance post-hoc audit boundary", () => {
  it("documents live OneTrust source metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1072");
    expect(doc).toContain("Post-hoc human audit sampling");
    expect(doc).toContain(ORIGINAL_URL);
    expect(doc).toContain(AI_GOVERNANCE);
    expect(doc).toContain(POLICY_MANAGEMENT);
    expect(doc).toContain(THIRD_PARTY_RISK);
    expect(doc).toContain(DATA_DISCOVERY);
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DESCRIPTION);
    expect(doc).toContain(POLICY_TITLE);
    expect(doc).toContain(THIRD_PARTY_RISK_TITLE);
    expect(doc).toContain(DATA_USE_TITLE);
    expect(doc).toContain("HTTP/2 `301`");
    expect(doc).toContain("HTTP/2 `200`");
    expect(doc).toContain("Protect the ROI of AI");
    expect(doc).toContain("Catalog AI Systems and Assess Risk");
    expect(doc).toContain("Programmatically Enforce Controls");
    expect(doc).toContain("sample plan");
    expect(doc).toContain("reviewed actions");
    expect(doc).toContain("findings");
    expect(doc).toContain("corrective action");
    expect(doc).toContain("score impact");
    expect(doc).toContain("metadata-only OneTrust evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("builds a generic post-hoc audit sampling receipt for source-cited AI governance review", () => {
    const receipt = buildPosthocAuditSamplingReceipt({
      receiptId: "gap1072-onetrust-posthoc-audit-sampling",
      generatedAt: "2026-06-25T06:57:00.000+05:30",
      sourceCitations,
      samplePlans: [
        {
          samplePlanId: "sample-plan-ai-governance-actions-june",
          owner: "audit-owner@example.com",
          populationId: "autonomous-ai-governance-actions-june-2026",
          populationSize: 480,
          sampleSize: 20,
          samplingMethod: "stratified",
          riskTier: "high",
          plannedAt: "2026-06-25T06:57:05.000+05:30",
          signedEvidenceRef: "ledger-sample-plan-ai-governance-actions-june",
          signatureSha256: "a".repeat(64),
        },
      ],
      reviewedActions: [
        {
          actionId: "action-ai-risk-tier-change-219",
          samplePlanId: "sample-plan-ai-governance-actions-june",
          agentId: "ai-governance-workflow-agent",
          policyId: "policy-high-risk-agent-control",
          completedAt: "2026-06-24T19:10:00.000+05:30",
          sampledAt: "2026-06-25T06:57:10.000+05:30",
          reviewerId: "human-auditor-23",
          reviewDecision: "issue",
          reviewSignedEvidenceRef: "ledger-reviewed-action-ai-risk-tier-change-219",
          reviewSignatureSha256: "b".repeat(64),
          evidenceRefs: [
            signedEvidence("ev-ai-risk-tier-change-runtime", "c", "runtime"),
            signedEvidence("ev-ai-risk-tier-change-review", "d", "review"),
          ],
          sourceCitationIds: [
            "onetrust-ai-governance-policy-controls",
            "eu-ai-act-art14-human-oversight",
          ],
        },
      ],
      findings: [
        {
          findingId: "finding-ai-risk-tier-approval-gap",
          actionId: "action-ai-risk-tier-change-219",
          severity: "high",
          description: "Risk-tier change lacked signed second-review evidence before release.",
          owner: "policy-owner@example.com",
          openedAt: "2026-06-25T06:58:00.000+05:30",
          signedEvidenceRef: "ledger-finding-ai-risk-tier-approval-gap",
          signatureSha256: "e".repeat(64),
        },
      ],
      correctiveActions: [
        {
          correctiveActionId: "ca-ai-risk-tier-second-review-regression",
          findingId: "finding-ai-risk-tier-approval-gap",
          owner: "engineering-owner@example.com",
          description: "Add regression that blocks risk-tier changes without second-review evidence.",
          status: "open",
          dueAt: "2026-07-02T00:00:00.000+05:30",
          signedEvidenceRef: "ledger-ca-ai-risk-tier-second-review-regression",
          signatureSha256: "f".repeat(64),
          regressionTestRef: "tests/aiRiskTierSecondReviewRegression.test.ts",
        },
      ],
      scoreImpacts: [
        {
          scoreImpactId: "score-impact-ai-risk-tier-approval-gap",
          actionId: "action-ai-risk-tier-change-219",
          dimensionId: "AMC-4",
          questionId: "AMC-4.3",
          beforeScore: 0.81,
          afterScore: 0.72,
          impact: -0.09,
          reason: "Post-hoc audit found missing second-review evidence for a high-risk AI governance action.",
          signedEvidenceRef: "ledger-score-impact-ai-risk-tier-approval-gap",
          signatureSha256: "1".repeat(64),
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      samplePlanId: "sample-plan-ai-governance-actions-june",
      actionId: "action-ai-risk-tier-change-219",
      agentId: "ai-governance-workflow-agent",
      reviewerId: "human-auditor-23",
      reviewDecision: "issue",
      findingIds: ["finding-ai-risk-tier-approval-gap"],
      correctiveActionIds: ["ca-ai-risk-tier-second-review-regression"],
      scoreImpactIds: ["score-impact-ai-risk-tier-approval-gap"],
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
    expect(markdown).toContain("finding-ai-risk-tier-approval-gap");
    expect(markdown).toContain("ca-ai-risk-tier-second-review-regression");
    expect(markdown).toContain("AMC-4.3");
    expect(markdown).toContain("-0.09");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("VALID");
  });

  it("fails closed when OneTrust metadata replaces signed post-hoc audit evidence", () => {
    const receipt = buildPosthocAuditSamplingReceipt({
      receiptId: "gap1072-metadata-only-posthoc-audit",
      generatedAt: "2026-06-25T06:58:30.000+05:30",
      sourceCitations: [sourceCitations[0]],
      samplePlans: [
        {
          samplePlanId: "metadata-only-onetrust-sample-plan",
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
          actionId: "metadata-only-onetrust-action",
          samplePlanId: "metadata-only-onetrust-sample-plan",
          agentId: "",
          policyId: "",
          completedAt: "",
          sampledAt: "",
          reviewerId: "",
          reviewDecision: "issue",
          reviewSignedEvidenceRef: "",
          reviewSignatureSha256: "",
          evidenceRefs: [],
          sourceCitationIds: ["onetrust-ai-governance-policy-controls"],
        },
      ],
      findings: [],
      correctiveActions: [],
      scoreImpacts: [],
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "metadata-only-onetrust-sample-plan:samplePlan:missing",
      "metadata-only-onetrust-action:reviewedAction:missing",
      "metadata-only-onetrust-action:evidenceChain:missing",
      "metadata-only-onetrust-action:finding:missing",
      "metadata-only-onetrust-action:scoreImpact:missing",
    ]));
    expect(verifyPosthocAuditSamplingReceipt(receipt).valid).toBe(false);
  });

  it("fails closed when a OneTrust-context audit finding has no corrective action", () => {
    const receipt = buildPosthocAuditSamplingReceipt({
      receiptId: "gap1072-missing-corrective-action",
      generatedAt: "2026-06-25T06:59:00.000+05:30",
      sourceCitations,
      samplePlans: [
        {
          samplePlanId: "sample-plan-ai-governance-actions-june",
          owner: "audit-owner@example.com",
          populationId: "autonomous-ai-governance-actions-june-2026",
          populationSize: 480,
          sampleSize: 20,
          samplingMethod: "stratified",
          riskTier: "high",
          plannedAt: "2026-06-25T06:57:05.000+05:30",
          signedEvidenceRef: "ledger-sample-plan-ai-governance-actions-june",
          signatureSha256: "a".repeat(64),
        },
      ],
      reviewedActions: [
        {
          actionId: "action-ai-risk-tier-change-219",
          samplePlanId: "sample-plan-ai-governance-actions-june",
          agentId: "ai-governance-workflow-agent",
          policyId: "policy-high-risk-agent-control",
          completedAt: "2026-06-24T19:10:00.000+05:30",
          sampledAt: "2026-06-25T06:57:10.000+05:30",
          reviewerId: "human-auditor-23",
          reviewDecision: "issue",
          reviewSignedEvidenceRef: "ledger-reviewed-action-ai-risk-tier-change-219",
          reviewSignatureSha256: "b".repeat(64),
          evidenceRefs: [signedEvidence("ev-ai-risk-tier-change-runtime", "c", "runtime")],
          sourceCitationIds: ["onetrust-ai-governance-policy-controls"],
        },
      ],
      findings: [
        {
          findingId: "finding-ai-risk-tier-approval-gap",
          actionId: "action-ai-risk-tier-change-219",
          severity: "high",
          description: "Risk-tier change lacked signed second-review evidence before release.",
          owner: "policy-owner@example.com",
          openedAt: "2026-06-25T06:58:00.000+05:30",
          signedEvidenceRef: "ledger-finding-ai-risk-tier-approval-gap",
          signatureSha256: "e".repeat(64),
        },
      ],
      correctiveActions: [],
      scoreImpacts: [
        {
          scoreImpactId: "score-impact-ai-risk-tier-approval-gap",
          actionId: "action-ai-risk-tier-change-219",
          dimensionId: "AMC-4",
          questionId: "AMC-4.3",
          beforeScore: 0.81,
          afterScore: 0.72,
          impact: -0.09,
          reason: "Post-hoc audit found missing second-review evidence for a high-risk AI governance action.",
          signedEvidenceRef: "ledger-score-impact-ai-risk-tier-approval-gap",
          signatureSha256: "1".repeat(64),
        },
      ],
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toContain("finding-ai-risk-tier-approval-gap:correctiveAction:missing");
    expect(verifyPosthocAuditSamplingReceipt(receipt).valid).toBe(false);
  });

  it("does not add OneTrust source identifiers to generic audit, compliance, score, or incident implementation files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("onetrust.com");
      expect(source).not.toContain("OneTrust");
      expect(source).not.toContain("COMP-128");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
