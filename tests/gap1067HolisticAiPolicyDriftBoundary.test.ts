import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPolicyDriftImpactReceipt,
  renderPolicyDriftImpactAuditExport,
  verifyPolicyDriftImpactReceipt,
  type PolicyDriftImpactEvidenceLink,
  type PolicyDriftImpactSourceCitation,
} from "../src/compliance/policyDrift.js";

const DOC = "docs/source-reviews/GAP-1067-holistic-ai-policy-drift.md";
const HOME = "https://www.holisticai.com";
const GOVERNANCE_PLATFORM = "https://www.holisticai.com/ai-governance-platform";
const OPERATIONAL_ALIGNMENT = "https://www.holisticai.com/operational-alignment";
const REGULATORY_ALIGNMENT = "https://www.holisticai.com/regulatory-alignment";
const ENFORCE = "https://www.holisticai.com/enforce";
const GUARDIAN_AGENTS = "https://www.holisticai.com/guardian-agents";
const AI_INVENTORY = "https://www.holisticai.com/ai-inventory";
const AI_AUDITS = "https://www.holisticai.com/ai-audits";
const AI_RISK = "https://www.holisticai.com/ai-risk-management";
const TITLE = "Holistic AI - The Leading AI Governance Platform";
const GOVERNANCE_TITLE = "An End to End AI Governance Platform - Holistic AI";
const OPERATIONAL_TITLE = "Empower Teams with Aligned, Embedded Governance - Holistic AI";
const IDENTIFIER = "holistic_ai_policy_drift";

const implementationFiles = [
  "src/compliance/policyDrift.ts",
  "src/claims/governanceLineage.ts",
  "src/fleet/governance.ts",
  "src/watch/policyPacks.ts",
  "docs/COMPLIANCE_FRAMEWORKS.md",
];

const sourceCitations: PolicyDriftImpactSourceCitation[] = [
  {
    sourceId: "holistic-ai-governance-platform",
    title: TITLE,
    url: HOME,
    retrievedAt: "2026-06-25T06:08:24.000+05:30",
  },
  {
    sourceId: "eu-ai-act-art14-human-oversight",
    title: "Regulation (EU) 2024/1689 Article 14 human oversight",
    url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
    retrievedAt: "2026-06-25T06:08:24.000+05:30",
  },
];

function signedEvidence(id: string, seed: string, eventType = "policy_change"): PolicyDriftImpactEvidenceLink {
  return {
    eventId: id,
    eventHash: seed.repeat(64).slice(0, 64),
    eventType,
    signedEvidenceRef: `ledger-${id}`,
  };
}

describe("GAP-1067 Holistic AI policy drift boundary", () => {
  it("documents live Holistic AI source metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1067");
    expect(doc).toContain("Policy drift and change impact");
    expect(doc).toContain(HOME);
    expect(doc).toContain(GOVERNANCE_PLATFORM);
    expect(doc).toContain(OPERATIONAL_ALIGNMENT);
    expect(doc).toContain(REGULATORY_ALIGNMENT);
    expect(doc).toContain(ENFORCE);
    expect(doc).toContain(GUARDIAN_AGENTS);
    expect(doc).toContain(AI_INVENTORY);
    expect(doc).toContain(AI_AUDITS);
    expect(doc).toContain(AI_RISK);
    expect(doc).toContain(TITLE);
    expect(doc).toContain(GOVERNANCE_TITLE);
    expect(doc).toContain(OPERATIONAL_TITLE);
    expect(doc).toContain("HTTP/2 `200`");
    expect(doc).toContain("AI governance");
    expect(doc).toContain("compliance workflows");
    expect(doc).toContain("audit evidence");
    expect(doc).toContain("policies");
    expect(doc).toContain("approval");
    expect(doc).toContain("Guardian Agents");
    expect(doc).toContain("Inventory");
    expect(doc).toContain("Regulatory Alignment");
    expect(doc).toContain("Operational Alignment");
    expect(doc).toContain("policy diff");
    expect(doc).toContain("affected agents");
    expect(doc).toContain("affected tests");
    expect(doc).toContain("affected controls");
    expect(doc).toContain("prior decisions");
    expect(doc).toContain("recheck list");
    expect(doc).toContain("rollout receipt");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("builds a generic policy drift impact receipt with diff, affected agents, tests, controls, prior decisions, recheck list, rollout receipt, and evidence chain", () => {
    const receipt = buildPolicyDriftImpactReceipt({
      receiptId: "gap1067-holistic-ai-policy-drift",
      generatedAt: "2026-06-25T06:09:00.000+05:30",
      sourceCitations,
      changes: [
        {
          changeId: "policy-change-dual-control-v2",
          policyId: "policy-deploy-approval",
          previousPolicyVersion: "v1.3.0",
          nextPolicyVersion: "v1.4.0",
          previousPolicyHash: "a".repeat(64),
          nextPolicyHash: "b".repeat(64),
          changeOwner: "governance-owner@example.com",
          changedAt: "2026-06-25T06:09:10.000+05:30",
          rationale: "Deployment policy now requires dual-control approval for high-risk agents.",
          diffSummary: "High-risk DEPLOY actions require a second approval and evidence-retention check before rollout.",
          signedEvidenceRef: "ledger-policy-change-dual-control-v2",
          signatureSha256: "c".repeat(64),
          affectedAgents: [
            {
              agentId: "billing-resolution-agent",
              environment: "production",
              currentPolicyVersion: "v1.3.0",
              requiredPolicyVersion: "v1.4.0",
              impactLevel: "high",
              reason: "Agent can execute high-risk DEPLOY-equivalent refund policy changes.",
              signedEvidenceRef: "ledger-affected-agent-billing-resolution",
              signatureSha256: "d".repeat(64),
            },
            {
              agentId: "support-triage-agent",
              environment: "staging",
              currentPolicyVersion: "v1.3.0",
              requiredPolicyVersion: "v1.4.0",
              impactLevel: "medium",
              reason: "Agent must rerun staging approval checks before promotion.",
              signedEvidenceRef: "ledger-affected-agent-support-triage",
              signatureSha256: "e".repeat(64),
            },
          ],
          affectedControls: [
            {
              controlId: "euai_art14_human_oversight",
              framework: "EU AI Act",
              owner: "oversight-owner@example.com",
              changeType: "strengthened",
              signedEvidenceRef: "ledger-control-euai-art14-dual-control",
              signatureSha256: "f".repeat(64),
            },
          ],
          affectedTests: [
            {
              testId: "refund-second-approval-regression",
              command: "npx vitest run tests/refundSecondApprovalRegression.test.ts --reporter=dot",
              owner: "qa-owner@example.com",
              reason: "Policy change invalidates prior single-approval regression proof.",
              signedEvidenceRef: "ledger-test-refund-second-approval",
              signatureSha256: "1".repeat(64),
            },
          ],
          priorDecisions: [
            {
              decisionId: "approval-refund-agent-release-2026-06",
              agentId: "billing-resolution-agent",
              decisionType: "release_approval",
              decidedAt: "2026-06-20T12:00:00.000+05:30",
              invalidated: true,
              reason: "Prior approval did not include dual-control evidence required by the new policy.",
              signedEvidenceRef: "ledger-prior-decision-refund-agent-release",
              signatureSha256: "2".repeat(64),
            },
          ],
          recheckItems: [
            {
              recheckId: "recheck-billing-resolution-dual-control",
              owner: "qa-owner@example.com",
              dueAt: "2026-06-28T00:00:00.000+05:30",
              action: "Rerun dual-control approval regression and refresh audit-binder evidence.",
              status: "open",
              signedEvidenceRef: "ledger-recheck-billing-resolution-dual-control",
              signatureSha256: "3".repeat(64),
            },
          ],
          rolloutReceipt: {
            rolloutId: "rollout-policy-deploy-approval-v1-4-0",
            approvedBy: "grc-approver@example.com",
            approvedAt: "2026-06-25T06:10:00.000+05:30",
            rolloutWindowId: "rollout-window-2026-06-25",
            rollbackPlanRef: "runbook://policy-deploy-approval/rollback-v1.3.0",
            signedEvidenceRef: "ledger-rollout-policy-deploy-approval-v1-4-0",
            signatureSha256: "4".repeat(64),
          },
          evidenceRefs: [
            signedEvidence("ev-policy-diff-dual-control", "5"),
            signedEvidence("ev-rollout-dual-control", "6", "rollout"),
          ],
          sourceCitationIds: [
            "holistic-ai-governance-platform",
            "eu-ai-act-art14-human-oversight",
          ],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      changeId: "policy-change-dual-control-v2",
      policyId: "policy-deploy-approval",
      previousPolicyVersion: "v1.3.0",
      nextPolicyVersion: "v1.4.0",
      affectedAgentIds: ["billing-resolution-agent", "support-triage-agent"],
      affectedControlIds: ["euai_art14_human_oversight"],
      affectedTestIds: ["refund-second-approval-regression"],
      priorDecisionIds: ["approval-refund-agent-release-2026-06"],
      recheckIds: ["recheck-billing-resolution-dual-control"],
      rolloutId: "rollout-policy-deploy-approval-v1-4-0",
    });
    expect(receipt.rows[0]?.policyDiffHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.impactHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.rolloutHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.evidenceChainHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyPolicyDriftImpactReceipt(receipt).valid).toBe(true);

    const markdown = renderPolicyDriftImpactAuditExport(receipt);
    expect(markdown).toContain("# AMC Policy Drift Impact Audit Export");
    expect(markdown).toContain("Policy diff");
    expect(markdown).toContain("billing-resolution-agent");
    expect(markdown).toContain("refund-second-approval-regression");
    expect(markdown).toContain("euai_art14_human_oversight");
    expect(markdown).toContain("approval-refund-agent-release-2026-06");
    expect(markdown).toContain("recheck-billing-resolution-dual-control");
    expect(markdown).toContain("rollout-policy-deploy-approval-v1-4-0");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("VALID");
  });

  it("fails closed when Holistic AI metadata replaces signed policy drift impact evidence", () => {
    const receipt = buildPolicyDriftImpactReceipt({
      receiptId: "gap1067-metadata-only-policy-drift",
      generatedAt: "2026-06-25T06:11:00.000+05:30",
      sourceCitations: [sourceCitations[0]],
      changes: [
        {
          changeId: "metadata-only-policy-change",
          policyId: "",
          previousPolicyVersion: "",
          nextPolicyVersion: "",
          previousPolicyHash: "",
          nextPolicyHash: "",
          changeOwner: "",
          changedAt: "",
          rationale: "Website metadata only.",
          diffSummary: "",
          signedEvidenceRef: "",
          signatureSha256: "",
          affectedAgents: [],
          affectedControls: [],
          affectedTests: [],
          priorDecisions: [],
          recheckItems: [],
          rolloutReceipt: {
            rolloutId: "",
            approvedBy: "",
            approvedAt: "",
            rolloutWindowId: "",
            rollbackPlanRef: "",
            signedEvidenceRef: "",
            signatureSha256: "",
          },
          evidenceRefs: [],
          sourceCitationIds: ["holistic-ai-governance-platform"],
        },
      ],
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "metadata-only-policy-change:policyDiff:missing",
      "metadata-only-policy-change:affectedAgents:missing",
      "metadata-only-policy-change:affectedControls:missing",
      "metadata-only-policy-change:affectedTests:missing",
      "metadata-only-policy-change:priorDecisions:missing",
      "metadata-only-policy-change:recheckList:missing",
      "metadata-only-policy-change:rolloutReceipt:missing",
      "metadata-only-policy-change:evidenceChain:missing",
    ]));
    expect(verifyPolicyDriftImpactReceipt(receipt).valid).toBe(false);
  });

  it("fails closed when a policy change invalidates prior decisions but has no recheck list", () => {
    const receipt = buildPolicyDriftImpactReceipt({
      receiptId: "gap1067-missing-recheck-list",
      generatedAt: "2026-06-25T06:12:00.000+05:30",
      sourceCitations,
      changes: [
        {
          changeId: "policy-change-no-recheck",
          policyId: "policy-deploy-approval",
          previousPolicyVersion: "v1.3.0",
          nextPolicyVersion: "v1.4.0",
          previousPolicyHash: "a".repeat(64),
          nextPolicyHash: "b".repeat(64),
          changeOwner: "governance-owner@example.com",
          changedAt: "2026-06-25T06:09:10.000+05:30",
          rationale: "Deployment policy now requires dual-control approval for high-risk agents.",
          diffSummary: "High-risk DEPLOY actions require a second approval.",
          signedEvidenceRef: "ledger-policy-change-no-recheck",
          signatureSha256: "c".repeat(64),
          affectedAgents: [
            {
              agentId: "billing-resolution-agent",
              environment: "production",
              currentPolicyVersion: "v1.3.0",
              requiredPolicyVersion: "v1.4.0",
              impactLevel: "high",
              reason: "Agent needs a refreshed approval check.",
              signedEvidenceRef: "ledger-affected-agent-billing-resolution",
              signatureSha256: "d".repeat(64),
            },
          ],
          affectedControls: [
            {
              controlId: "euai_art14_human_oversight",
              framework: "EU AI Act",
              owner: "oversight-owner@example.com",
              changeType: "strengthened",
              signedEvidenceRef: "ledger-control-euai-art14-dual-control",
              signatureSha256: "f".repeat(64),
            },
          ],
          affectedTests: [
            {
              testId: "refund-second-approval-regression",
              command: "npx vitest run tests/refundSecondApprovalRegression.test.ts --reporter=dot",
              owner: "qa-owner@example.com",
              reason: "Policy change invalidates prior proof.",
              signedEvidenceRef: "ledger-test-refund-second-approval",
              signatureSha256: "1".repeat(64),
            },
          ],
          priorDecisions: [
            {
              decisionId: "approval-refund-agent-release-2026-06",
              agentId: "billing-resolution-agent",
              decisionType: "release_approval",
              decidedAt: "2026-06-20T12:00:00.000+05:30",
              invalidated: true,
              reason: "Prior approval did not include dual-control evidence required by the new policy.",
              signedEvidenceRef: "ledger-prior-decision-refund-agent-release",
              signatureSha256: "2".repeat(64),
            },
          ],
          recheckItems: [],
          rolloutReceipt: {
            rolloutId: "rollout-policy-deploy-approval-v1-4-0",
            approvedBy: "grc-approver@example.com",
            approvedAt: "2026-06-25T06:10:00.000+05:30",
            rolloutWindowId: "rollout-window-2026-06-25",
            rollbackPlanRef: "runbook://policy-deploy-approval/rollback-v1.3.0",
            signedEvidenceRef: "ledger-rollout-policy-deploy-approval-v1-4-0",
            signatureSha256: "4".repeat(64),
          },
          evidenceRefs: [signedEvidence("ev-policy-diff-dual-control", "5")],
          sourceCitationIds: ["holistic-ai-governance-platform"],
        },
      ],
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toContain("policy-change-no-recheck:recheckList:missing");
    expect(verifyPolicyDriftImpactReceipt(receipt).valid).toBe(false);
  });

  it("does not add Holistic AI source identifiers to generic compliance, claims, fleet, watch, or compliance-doc files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("holisticai.com");
      expect(source).not.toContain("Holistic AI");
      expect(source).not.toContain("COMP-122");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
