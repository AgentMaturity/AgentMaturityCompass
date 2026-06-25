import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPolicyDriftImpactReceipt,
  renderPolicyDriftImpactAuditExport,
  verifyPolicyDriftImpactReceipt,
  type PolicyDriftImpactEvidenceLink,
  type PolicyDriftImpactSourceCitation,
} from "../src/compliance/policyDrift.js";

const DOC = "docs/source-reviews/GAP-1069-validmind-policy-drift.md";
const HOME = "https://validmind.com";
const AGENT_AUTHORITY = "https://validmind.com/platform/agent-authority/";
const AI_GOVERNANCE = "https://validmind.com/platform/ai-governance/";
const MODEL_RISK = "https://validmind.com/platform/ai-model-risk-management/";
const VALIDATION = "https://validmind.com/platform/validation/";
const VALIDATE = "https://validmind.com/platform/validate/";
const MONITOR = "https://validmind.com/platform/monitor/";
const AI_RISK_MANAGEMENT = "https://validmind.com/ai-risk-management/";
const AI_GOVERNANCE_ASSESSMENT = "https://validmind.com/ai-governance-assessment/";
const TITLE = "ValidMind | Agentic AI Governance Platform";
const DESCRIPTION = "ValidMind is the agentic AI governance platform for regulated financial services.";
const AGENT_AUTHORITY_TITLE = "ValidMind Agent Authority: Agentic AI Governance";
const AI_GOVERNANCE_TITLE = "ValidMind AI Governance Solution | Enterprise Oversight";
const MODEL_RISK_TITLE = "ValidMind AI & Model Risk Management | Enterprise Grade";
const IDENTIFIER = "validmind_policy_drift";

const implementationFiles = [
  "src/compliance/policyDrift.ts",
  "src/claims/governanceLineage.ts",
  "src/fleet/governance.ts",
  "src/watch/policyPacks.ts",
  "docs/COMPLIANCE_FRAMEWORKS.md",
];

const sourceCitations: PolicyDriftImpactSourceCitation[] = [
  {
    sourceId: "validmind-agentic-ai-governance",
    title: TITLE,
    url: HOME,
    retrievedAt: "2026-06-25T06:31:00.000+05:30",
  },
  {
    sourceId: "validmind-ai-governance-platform",
    title: AI_GOVERNANCE_TITLE,
    url: AI_GOVERNANCE,
    retrievedAt: "2026-06-25T06:31:00.000+05:30",
  },
  {
    sourceId: "eu-ai-act-2024-1689",
    title: "Regulation (EU) 2024/1689",
    url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
    retrievedAt: "2026-06-25T06:31:00.000+05:30",
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

describe("GAP-1069 ValidMind policy drift boundary", () => {
  it("documents live ValidMind source metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1069");
    expect(doc).toContain("Policy drift and change impact");
    expect(doc).toContain(HOME);
    expect(doc).toContain(AGENT_AUTHORITY);
    expect(doc).toContain(AI_GOVERNANCE);
    expect(doc).toContain(MODEL_RISK);
    expect(doc).toContain(VALIDATION);
    expect(doc).toContain(VALIDATE);
    expect(doc).toContain(MONITOR);
    expect(doc).toContain(AI_RISK_MANAGEMENT);
    expect(doc).toContain(AI_GOVERNANCE_ASSESSMENT);
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DESCRIPTION);
    expect(doc).toContain(AGENT_AUTHORITY_TITLE);
    expect(doc).toContain(AI_GOVERNANCE_TITLE);
    expect(doc).toContain(MODEL_RISK_TITLE);
    expect(doc).toContain("HTTP/2 `200`");
    expect(doc).toContain("model risk");
    expect(doc).toContain("validation");
    expect(doc).toContain("compliance");
    expect(doc).toContain("audit");
    expect(doc).toContain("evidence");
    expect(doc).toContain("policies");
    expect(doc).toContain("workflows");
    expect(doc).toContain("approvals");
    expect(doc).toContain("monitoring");
    expect(doc).toContain("SR 11-7");
    expect(doc).toContain("EU AI Act");
    expect(doc).toContain("SS1/23");
    expect(doc).toContain("E-23");
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

  it("uses the existing generic policy drift primitive for model-risk governance context", () => {
    const receipt = buildPolicyDriftImpactReceipt({
      receiptId: "gap1069-validmind-policy-drift",
      generatedAt: "2026-06-25T06:32:00.000+05:30",
      sourceCitations,
      changes: [
        {
          changeId: "policy-change-model-validation-v3",
          policyId: "policy-model-validation",
          previousPolicyVersion: "v2.8.0",
          nextPolicyVersion: "v3.0.0",
          previousPolicyHash: "a".repeat(64),
          nextPolicyHash: "b".repeat(64),
          changeOwner: "model-risk-owner@example.com",
          changedAt: "2026-06-25T06:32:10.000+05:30",
          rationale: "Model validation policy now requires agentic AI monitoring evidence before approval.",
          diffSummary: "High-risk model agents require validation, monitoring, and approval evidence refresh before rollout.",
          signedEvidenceRef: "ledger-policy-change-model-validation-v3",
          signatureSha256: "c".repeat(64),
          affectedAgents: [
            {
              agentId: "credit-risk-validation-agent",
              environment: "production",
              currentPolicyVersion: "v2.8.0",
              requiredPolicyVersion: "v3.0.0",
              impactLevel: "critical",
              reason: "Agent produces model validation evidence for regulated credit decisions.",
              signedEvidenceRef: "ledger-affected-agent-credit-risk-validation",
              signatureSha256: "d".repeat(64),
            },
            {
              agentId: "portfolio-monitoring-agent",
              environment: "production",
              currentPolicyVersion: "v2.8.0",
              requiredPolicyVersion: "v3.0.0",
              impactLevel: "high",
              reason: "Agent must refresh monitoring evidence before the validation policy rollout.",
              signedEvidenceRef: "ledger-affected-agent-portfolio-monitoring",
              signatureSha256: "e".repeat(64),
            },
          ],
          affectedControls: [
            {
              controlId: "euai_art9_risk_management",
              framework: "EU AI Act",
              owner: "risk-owner@example.com",
              changeType: "strengthened",
              signedEvidenceRef: "ledger-control-euai-art9-validation-refresh",
              signatureSha256: "f".repeat(64),
            },
            {
              controlId: "sr-11-7-model-validation",
              framework: "SR 11-7",
              owner: "model-risk-owner@example.com",
              changeType: "added",
              signedEvidenceRef: "ledger-control-sr117-validation-refresh",
              signatureSha256: "1".repeat(64),
            },
          ],
          affectedTests: [
            {
              testId: "model-validation-evidence-refresh",
              command: "npx vitest run tests/modelValidationEvidenceRefresh.test.ts --reporter=dot",
              owner: "qa-owner@example.com",
              reason: "Policy change invalidates prior validation report evidence.",
              signedEvidenceRef: "ledger-test-model-validation-evidence-refresh",
              signatureSha256: "2".repeat(64),
            },
          ],
          priorDecisions: [
            {
              decisionId: "approval-credit-risk-agent-release-2026-06",
              agentId: "credit-risk-validation-agent",
              decisionType: "release_approval",
              decidedAt: "2026-06-18T12:00:00.000+05:30",
              invalidated: true,
              reason: "Prior approval did not include the new monitoring evidence requirement.",
              signedEvidenceRef: "ledger-prior-decision-credit-risk-agent-release",
              signatureSha256: "3".repeat(64),
            },
          ],
          recheckItems: [
            {
              recheckId: "recheck-credit-risk-validation-monitoring",
              owner: "qa-owner@example.com",
              dueAt: "2026-06-29T00:00:00.000+05:30",
              action: "Rerun validation evidence refresh and attach monitoring proof to the audit binder.",
              status: "open",
              signedEvidenceRef: "ledger-recheck-credit-risk-validation-monitoring",
              signatureSha256: "4".repeat(64),
            },
          ],
          rolloutReceipt: {
            rolloutId: "rollout-policy-model-validation-v3",
            approvedBy: "grc-approver@example.com",
            approvedAt: "2026-06-25T06:33:00.000+05:30",
            rolloutWindowId: "rollout-window-2026-06-25-model-risk",
            rollbackPlanRef: "runbook://policy-model-validation/rollback-v2.8.0",
            signedEvidenceRef: "ledger-rollout-policy-model-validation-v3",
            signatureSha256: "5".repeat(64),
          },
          evidenceRefs: [
            signedEvidence("ev-policy-diff-model-validation", "6"),
            signedEvidence("ev-rollout-model-validation", "7", "rollout"),
          ],
          sourceCitationIds: [
            "validmind-agentic-ai-governance",
            "validmind-ai-governance-platform",
            "eu-ai-act-2024-1689",
          ],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      changeId: "policy-change-model-validation-v3",
      policyId: "policy-model-validation",
      previousPolicyVersion: "v2.8.0",
      nextPolicyVersion: "v3.0.0",
      affectedAgentIds: ["credit-risk-validation-agent", "portfolio-monitoring-agent"],
      affectedControlIds: ["euai_art9_risk_management", "sr-11-7-model-validation"],
      affectedTestIds: ["model-validation-evidence-refresh"],
      priorDecisionIds: ["approval-credit-risk-agent-release-2026-06"],
      recheckIds: ["recheck-credit-risk-validation-monitoring"],
      rolloutId: "rollout-policy-model-validation-v3",
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
    expect(markdown).toContain("credit-risk-validation-agent");
    expect(markdown).toContain("model-validation-evidence-refresh");
    expect(markdown).toContain("euai_art9_risk_management");
    expect(markdown).toContain("approval-credit-risk-agent-release-2026-06");
    expect(markdown).toContain("recheck-credit-risk-validation-monitoring");
    expect(markdown).toContain("rollout-policy-model-validation-v3");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("VALID");
  });

  it("fails closed when ValidMind metadata replaces signed policy drift impact evidence", () => {
    const receipt = buildPolicyDriftImpactReceipt({
      receiptId: "gap1069-metadata-only-policy-drift",
      generatedAt: "2026-06-25T06:34:00.000+05:30",
      sourceCitations: [sourceCitations[0]],
      changes: [
        {
          changeId: "metadata-only-validmind-policy-change",
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
          sourceCitationIds: ["validmind-agentic-ai-governance"],
        },
      ],
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "metadata-only-validmind-policy-change:policyDiff:missing",
      "metadata-only-validmind-policy-change:affectedAgents:missing",
      "metadata-only-validmind-policy-change:affectedControls:missing",
      "metadata-only-validmind-policy-change:affectedTests:missing",
      "metadata-only-validmind-policy-change:priorDecisions:missing",
      "metadata-only-validmind-policy-change:recheckList:missing",
      "metadata-only-validmind-policy-change:rolloutReceipt:missing",
      "metadata-only-validmind-policy-change:evidenceChain:missing",
    ]));
    expect(verifyPolicyDriftImpactReceipt(receipt).valid).toBe(false);
  });

  it("does not add ValidMind source identifiers to generic compliance, claims, fleet, watch, or compliance-doc files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("validmind.com");
      expect(source).not.toContain("ValidMind");
      expect(source).not.toContain("COMP-124");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
