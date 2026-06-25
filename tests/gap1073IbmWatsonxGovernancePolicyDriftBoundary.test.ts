import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPolicyDriftImpactReceipt,
  renderPolicyDriftImpactAuditExport,
  verifyPolicyDriftImpactReceipt,
  type PolicyDriftImpactEvidenceLink,
  type PolicyDriftImpactSourceCitation,
} from "../src/compliance/policyDrift.js";

const DOC = "docs/source-reviews/GAP-1073-ibm-watsonx-governance-policy-drift.md";
const HOME = "https://www.ibm.com/products/watsonx-governance";
const PRICING = "https://www.ibm.com/products/watsonx-governance/pricing";
const TRIAL = "https://www.ibm.com/products/watsonx-governance/trial";
const ROBOTS = "https://www.ibm.com/robots.txt";
const TITLE = "IBM watsonx.governance";
const DESCRIPTION = "Learn how you can direct, manage and monitor your AI with watsonx.governance, a single platform to speed responsible, transparent, explainable AI. Find out how you can address risks that AI presents, adhere and adapt to changing regulations, and help manage the complete AI lifecycle governance.";
const PRICING_TITLE = "IBM watsonx.governance | Pricing";
const IDENTIFIER = "ibm_watsonx_governance_policy_drift";

const implementationFiles = [
  "src/compliance/policyDrift.ts",
  "src/claims/governanceLineage.ts",
  "src/fleet/governance.ts",
  "src/watch/policyPacks.ts",
  "docs/COMPLIANCE_FRAMEWORKS.md",
];

const sourceCitations: PolicyDriftImpactSourceCitation[] = [
  {
    sourceId: "ibm-watsonx-governance",
    title: TITLE,
    url: HOME,
    retrievedAt: "2026-06-25T07:04:51.000+05:30",
  },
  {
    sourceId: "eu-ai-act-2024-1689",
    title: "Regulation (EU) 2024/1689",
    url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
    retrievedAt: "2026-06-25T07:04:51.000+05:30",
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

describe("GAP-1073 IBM watsonx.governance policy drift boundary", () => {
  it("documents live IBM watsonx.governance source metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1073");
    expect(doc).toContain("Policy drift and change impact");
    expect(doc).toContain(HOME);
    expect(doc).toContain(PRICING);
    expect(doc).toContain(TRIAL);
    expect(doc).toContain(ROBOTS);
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DESCRIPTION);
    expect(doc).toContain(PRICING_TITLE);
    expect(doc).toContain("HTTP/2 `200`");
    expect(doc).toContain("Accelerate ROI with smarter AI governance, risk and compliance");
    expect(doc).toContain("Governance Graph");
    expect(doc).toContain("Control");
    expect(doc).toContain("Closing the loop between intent and reality");
    expect(doc).toContain("AI governance in action");
    expect(doc).toContain("policy diff");
    expect(doc).toContain("affected agents");
    expect(doc).toContain("affected tests");
    expect(doc).toContain("affected controls");
    expect(doc).toContain("prior decisions");
    expect(doc).toContain("recheck list");
    expect(doc).toContain("rollout receipt");
    expect(doc).toContain("metadata-only IBM evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses the existing generic policy drift primitive for IBM AI lifecycle governance context", () => {
    const receipt = buildPolicyDriftImpactReceipt({
      receiptId: "gap1073-ibm-watsonx-governance-policy-drift",
      generatedAt: "2026-06-25T07:05:00.000+05:30",
      sourceCitations,
      changes: [
        {
          changeId: "policy-change-ai-lifecycle-governance-v4",
          policyId: "policy-ai-lifecycle-governance",
          previousPolicyVersion: "v3.4.0",
          nextPolicyVersion: "v4.0.0",
          previousPolicyHash: "a".repeat(64),
          nextPolicyHash: "b".repeat(64),
          changeOwner: "grc-owner@example.com",
          changedAt: "2026-06-25T07:05:10.000+05:30",
          rationale: "AI lifecycle governance policy now requires evidence refresh for changing regulation controls.",
          diffSummary: "High-risk agents require control exposure review, lifecycle monitoring proof, and rollout recheck before approval.",
          signedEvidenceRef: "ledger-policy-change-ai-lifecycle-governance-v4",
          signatureSha256: "c".repeat(64),
          affectedAgents: [
            {
              agentId: "ai-risk-monitoring-agent",
              environment: "production",
              currentPolicyVersion: "v3.4.0",
              requiredPolicyVersion: "v4.0.0",
              impactLevel: "critical",
              reason: "Agent monitors AI risk controls affected by the lifecycle governance policy change.",
              signedEvidenceRef: "ledger-affected-agent-ai-risk-monitoring",
              signatureSha256: "d".repeat(64),
            },
            {
              agentId: "model-inventory-agent",
              environment: "production",
              currentPolicyVersion: "v3.4.0",
              requiredPolicyVersion: "v4.0.0",
              impactLevel: "high",
              reason: "Agent inventory attestations must be rechecked against the new governance control diff.",
              signedEvidenceRef: "ledger-affected-agent-model-inventory",
              signatureSha256: "e".repeat(64),
            },
          ],
          affectedControls: [
            {
              controlId: "euai_art9_risk_management",
              framework: "EU AI Act",
              owner: "risk-owner@example.com",
              changeType: "strengthened",
              signedEvidenceRef: "ledger-control-euai-art9-ai-lifecycle-refresh",
              signatureSha256: "f".repeat(64),
            },
            {
              controlId: "nist_govern",
              framework: "NIST AI RMF",
              owner: "grc-owner@example.com",
              changeType: "strengthened",
              signedEvidenceRef: "ledger-control-nist-govern-ai-lifecycle-refresh",
              signatureSha256: "1".repeat(64),
            },
          ],
          affectedTests: [
            {
              testId: "ai-lifecycle-governance-policy-recheck",
              command: "npx vitest run tests/aiLifecycleGovernancePolicyRecheck.test.ts --reporter=dot",
              owner: "qa-owner@example.com",
              reason: "Policy change invalidates prior lifecycle-governance approval evidence.",
              signedEvidenceRef: "ledger-test-ai-lifecycle-governance-policy-recheck",
              signatureSha256: "2".repeat(64),
            },
          ],
          priorDecisions: [
            {
              decisionId: "approval-ai-risk-monitoring-release-2026-06",
              agentId: "ai-risk-monitoring-agent",
              decisionType: "release_approval",
              decidedAt: "2026-06-18T12:00:00.000+05:30",
              invalidated: true,
              reason: "Prior approval did not include the new lifecycle-monitoring evidence requirement.",
              signedEvidenceRef: "ledger-prior-decision-ai-risk-monitoring-release",
              signatureSha256: "3".repeat(64),
            },
          ],
          recheckItems: [
            {
              recheckId: "recheck-ai-risk-monitoring-lifecycle-controls",
              owner: "qa-owner@example.com",
              dueAt: "2026-06-29T00:00:00.000+05:30",
              action: "Rerun lifecycle-governance policy recheck and attach updated monitoring proof.",
              status: "open",
              signedEvidenceRef: "ledger-recheck-ai-risk-monitoring-lifecycle-controls",
              signatureSha256: "4".repeat(64),
            },
          ],
          rolloutReceipt: {
            rolloutId: "rollout-policy-ai-lifecycle-governance-v4",
            approvedBy: "grc-approver@example.com",
            approvedAt: "2026-06-25T07:06:00.000+05:30",
            rolloutWindowId: "rollout-window-2026-06-25-ai-lifecycle",
            rollbackPlanRef: "runbook://policy-ai-lifecycle-governance/rollback-v3.4.0",
            signedEvidenceRef: "ledger-rollout-policy-ai-lifecycle-governance-v4",
            signatureSha256: "5".repeat(64),
          },
          evidenceRefs: [
            signedEvidence("ev-policy-diff-ai-lifecycle-governance", "6"),
            signedEvidence("ev-rollout-ai-lifecycle-governance", "7", "rollout"),
          ],
          sourceCitationIds: [
            "ibm-watsonx-governance",
            "eu-ai-act-2024-1689",
          ],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      changeId: "policy-change-ai-lifecycle-governance-v4",
      policyId: "policy-ai-lifecycle-governance",
      previousPolicyVersion: "v3.4.0",
      nextPolicyVersion: "v4.0.0",
      affectedAgentIds: ["ai-risk-monitoring-agent", "model-inventory-agent"],
      affectedControlIds: ["euai_art9_risk_management", "nist_govern"],
      affectedTestIds: ["ai-lifecycle-governance-policy-recheck"],
      priorDecisionIds: ["approval-ai-risk-monitoring-release-2026-06"],
      recheckIds: ["recheck-ai-risk-monitoring-lifecycle-controls"],
      rolloutId: "rollout-policy-ai-lifecycle-governance-v4",
    });
    expect(receipt.rows[0]?.policyDiffHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.impactHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.rolloutHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.evidenceChainHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyPolicyDriftImpactReceipt(receipt).valid).toBe(true);

    const markdown = renderPolicyDriftImpactAuditExport(receipt);
    expect(markdown).toContain("# AMC Policy Drift Impact Audit Export");
    expect(markdown).toContain("Policy diff");
    expect(markdown).toContain("ai-risk-monitoring-agent");
    expect(markdown).toContain("ai-lifecycle-governance-policy-recheck");
    expect(markdown).toContain("euai_art9_risk_management");
    expect(markdown).toContain("approval-ai-risk-monitoring-release-2026-06");
    expect(markdown).toContain("recheck-ai-risk-monitoring-lifecycle-controls");
    expect(markdown).toContain("rollout-policy-ai-lifecycle-governance-v4");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("VALID");
  });

  it("fails closed when IBM metadata replaces signed policy drift impact evidence", () => {
    const receipt = buildPolicyDriftImpactReceipt({
      receiptId: "gap1073-metadata-only-policy-drift",
      generatedAt: "2026-06-25T07:07:00.000+05:30",
      sourceCitations: [sourceCitations[0]],
      changes: [
        {
          changeId: "metadata-only-ibm-policy-change",
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
          sourceCitationIds: ["ibm-watsonx-governance"],
        },
      ],
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "metadata-only-ibm-policy-change:policyDiff:missing",
      "metadata-only-ibm-policy-change:affectedAgents:missing",
      "metadata-only-ibm-policy-change:affectedControls:missing",
      "metadata-only-ibm-policy-change:affectedTests:missing",
      "metadata-only-ibm-policy-change:priorDecisions:missing",
      "metadata-only-ibm-policy-change:recheckList:missing",
      "metadata-only-ibm-policy-change:rolloutReceipt:missing",
      "metadata-only-ibm-policy-change:evidenceChain:missing",
    ]));
    expect(verifyPolicyDriftImpactReceipt(receipt).valid).toBe(false);
  });

  it("does not add IBM source identifiers to generic compliance, claims, fleet, watch, or compliance-doc files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("ibm.com");
      expect(source).not.toContain("IBM");
      expect(source).not.toContain("watsonx.governance");
      expect(source).not.toContain("COMP-129");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
