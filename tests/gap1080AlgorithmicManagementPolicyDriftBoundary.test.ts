import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPolicyDriftImpactReceipt,
  renderPolicyDriftImpactAuditExport,
  verifyPolicyDriftImpactReceipt,
  type PolicyDriftImpactEvidenceLink,
  type PolicyDriftImpactSourceCitation,
} from "../src/compliance/policyDrift.js";

const DOC = "docs/source-reviews/GAP-1080-algorithmic-management-policy-drift.md";
const OPENALEX = "https://openalex.org/W7134908244";
const OPENALEX_API = "https://api.openalex.org/works/W7134908244";
const DOI = "https://doi.org/10.3390/ai7030102";
const MDPI = "https://www.mdpi.com/2673-2688/7/3/102";
const MDPI_PDF = "https://www.mdpi.com/2673-2688/7/3/102/pdf";
const TITLE = "LLM-Augmented Algorithmic Management: A Governance-Oriented Architecture for Explainable Organizational Decision Systems";
const IDENTIFIER = "algorithmic_management_policy_drift";

const implementationFiles = [
  "src/compliance/policyDrift.ts",
  "src/claims/governanceLineage.ts",
  "src/fleet/governance.ts",
  "src/watch/policyPacks.ts",
  "docs/COMPLIANCE_FRAMEWORKS.md",
];

const sourceCitations: PolicyDriftImpactSourceCitation[] = [
  {
    sourceId: "openalex-algorithmic-management",
    title: TITLE,
    url: OPENALEX,
    retrievedAt: "2026-06-25T08:08:00.000+05:30",
  },
  {
    sourceId: "doi-algorithmic-management",
    title: TITLE,
    url: DOI,
    retrievedAt: "2026-06-25T08:08:00.000+05:30",
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

describe("GAP-1080 algorithmic-management policy-drift boundary", () => {
  it("documents live OpenAlex and DOI metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1080");
    expect(doc).toContain("Policy drift and change impact");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(MDPI);
    expect(doc).toContain(MDPI_PDF);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-03-10`");
    expect(doc).toContain("article");
    expect(doc).toContain("AI");
    expect(doc).toContain("gold");
    expect(doc).toContain("cc-by");
    expect(doc).toContain("Technical University of Sofia");
    expect(doc).toContain("Institute of Information and Communication Technologies");
    expect(doc).toContain("Corporate governance");
    expect(doc).toContain("Management science");
    expect(doc).toContain("Audit");
    expect(doc).toContain("Interoperability");
    expect(doc).toContain("Algorithmic management systems");
    expect(doc).toContain("HTTP/2 `302`");
    expect(doc).toContain("HTTP/2 `403`");
    expect(doc).toContain("Access Denied");
    expect(doc).toContain("policy diff");
    expect(doc).toContain("affected agents");
    expect(doc).toContain("affected tests");
    expect(doc).toContain("affected controls");
    expect(doc).toContain("prior decisions");
    expect(doc).toContain("recheck list");
    expect(doc).toContain("rollout receipt");
    expect(doc).toContain("metadata-only algorithmic-management evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses the existing generic policy drift primitive for algorithmic-management governance context", () => {
    const receipt = buildPolicyDriftImpactReceipt({
      receiptId: "gap1080-algorithmic-management-policy-drift",
      generatedAt: "2026-06-25T08:09:00.000+05:30",
      sourceCitations,
      changes: [
        {
          changeId: "policy-change-work-allocation-governance-v2",
          policyId: "policy-work-allocation-governance",
          previousPolicyVersion: "v1.9.0",
          nextPolicyVersion: "v2.0.0",
          previousPolicyHash: "a".repeat(64),
          nextPolicyHash: "b".repeat(64),
          changeOwner: "org-governance-owner@example.com",
          changedAt: "2026-06-25T08:09:10.000+05:30",
          rationale: "Work-allocation policy now requires explainability and decision-audit evidence before rollout.",
          diffSummary: "Agents that support organizational decisions require impact review, rationale capture, and recheck before approval.",
          signedEvidenceRef: "ledger-policy-change-work-allocation-governance-v2",
          signatureSha256: "c".repeat(64),
          affectedAgents: [
            {
              agentId: "work-allocation-support-agent",
              environment: "production",
              currentPolicyVersion: "v1.9.0",
              requiredPolicyVersion: "v2.0.0",
              impactLevel: "critical",
              reason: "Agent supports organizational work-allocation decisions covered by the policy change.",
              signedEvidenceRef: "ledger-affected-agent-work-allocation-support",
              signatureSha256: "d".repeat(64),
            },
            {
              agentId: "decision-rationale-audit-agent",
              environment: "production",
              currentPolicyVersion: "v1.9.0",
              requiredPolicyVersion: "v2.0.0",
              impactLevel: "high",
              reason: "Agent must refresh rationale and audit evidence under the new governance policy.",
              signedEvidenceRef: "ledger-affected-agent-decision-rationale-audit",
              signatureSha256: "e".repeat(64),
            },
          ],
          affectedControls: [
            {
              controlId: "nist_govern",
              framework: "NIST AI RMF",
              owner: "grc-owner@example.com",
              changeType: "strengthened",
              signedEvidenceRef: "ledger-control-nist-govern-work-allocation-refresh",
              signatureSha256: "f".repeat(64),
            },
            {
              controlId: "iso42001_clause_5_leadership",
              framework: "ISO 42001",
              owner: "management-system-owner@example.com",
              changeType: "strengthened",
              signedEvidenceRef: "ledger-control-iso42001-leadership-work-allocation-refresh",
              signatureSha256: "1".repeat(64),
            },
          ],
          affectedTests: [
            {
              testId: "work-allocation-policy-drift-recheck",
              command: "npx vitest run tests/workAllocationPolicyDriftRecheck.test.ts --reporter=dot",
              owner: "qa-owner@example.com",
              reason: "Policy change invalidates prior decision-rationale approval evidence.",
              signedEvidenceRef: "ledger-test-work-allocation-policy-drift-recheck",
              signatureSha256: "2".repeat(64),
            },
          ],
          priorDecisions: [
            {
              decisionId: "approval-work-allocation-agent-release-2026-06",
              agentId: "work-allocation-support-agent",
              decisionType: "release_approval",
              decidedAt: "2026-06-19T12:00:00.000+05:30",
              invalidated: true,
              reason: "Prior approval did not include the new explainability and decision-audit evidence requirement.",
              signedEvidenceRef: "ledger-prior-decision-work-allocation-agent-release",
              signatureSha256: "3".repeat(64),
            },
          ],
          recheckItems: [
            {
              recheckId: "recheck-work-allocation-decision-audit",
              owner: "qa-owner@example.com",
              dueAt: "2026-06-29T00:00:00.000+05:30",
              action: "Rerun work-allocation policy drift recheck and attach updated rationale evidence.",
              status: "open",
              signedEvidenceRef: "ledger-recheck-work-allocation-decision-audit",
              signatureSha256: "4".repeat(64),
            },
          ],
          rolloutReceipt: {
            rolloutId: "rollout-policy-work-allocation-governance-v2",
            approvedBy: "grc-approver@example.com",
            approvedAt: "2026-06-25T08:10:00.000+05:30",
            rolloutWindowId: "rollout-window-2026-06-25-work-allocation",
            rollbackPlanRef: "runbook://policy-work-allocation-governance/rollback-v1.9.0",
            signedEvidenceRef: "ledger-rollout-policy-work-allocation-governance-v2",
            signatureSha256: "5".repeat(64),
          },
          evidenceRefs: [
            signedEvidence("ev-policy-diff-work-allocation-governance", "6"),
            signedEvidence("ev-rollout-work-allocation-governance", "7", "rollout"),
          ],
          sourceCitationIds: [
            "openalex-algorithmic-management",
            "doi-algorithmic-management",
          ],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      changeId: "policy-change-work-allocation-governance-v2",
      policyId: "policy-work-allocation-governance",
      previousPolicyVersion: "v1.9.0",
      nextPolicyVersion: "v2.0.0",
      affectedAgentIds: ["work-allocation-support-agent", "decision-rationale-audit-agent"],
      affectedControlIds: ["nist_govern", "iso42001_clause_5_leadership"],
      affectedTestIds: ["work-allocation-policy-drift-recheck"],
      priorDecisionIds: ["approval-work-allocation-agent-release-2026-06"],
      recheckIds: ["recheck-work-allocation-decision-audit"],
      rolloutId: "rollout-policy-work-allocation-governance-v2",
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
    expect(markdown).toContain("work-allocation-support-agent");
    expect(markdown).toContain("work-allocation-policy-drift-recheck");
    expect(markdown).toContain("nist_govern");
    expect(markdown).toContain("approval-work-allocation-agent-release-2026-06");
    expect(markdown).toContain("recheck-work-allocation-decision-audit");
    expect(markdown).toContain("rollout-policy-work-allocation-governance-v2");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("VALID");
  });

  it("fails closed when paper metadata replaces signed policy drift impact evidence", () => {
    const receipt = buildPolicyDriftImpactReceipt({
      receiptId: "gap1080-metadata-only-policy-drift",
      generatedAt: "2026-06-25T08:11:00.000+05:30",
      sourceCitations: [sourceCitations[0]],
      changes: [
        {
          changeId: "metadata-only-algorithmic-management-policy-change",
          policyId: "",
          previousPolicyVersion: "",
          nextPolicyVersion: "",
          previousPolicyHash: "",
          nextPolicyHash: "",
          changeOwner: "",
          changedAt: "",
          rationale: "Paper metadata only.",
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
          sourceCitationIds: ["openalex-algorithmic-management"],
        },
      ],
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "metadata-only-algorithmic-management-policy-change:policyDiff:missing",
      "metadata-only-algorithmic-management-policy-change:affectedAgents:missing",
      "metadata-only-algorithmic-management-policy-change:affectedControls:missing",
      "metadata-only-algorithmic-management-policy-change:affectedTests:missing",
      "metadata-only-algorithmic-management-policy-change:priorDecisions:missing",
      "metadata-only-algorithmic-management-policy-change:recheckList:missing",
      "metadata-only-algorithmic-management-policy-change:rolloutReceipt:missing",
      "metadata-only-algorithmic-management-policy-change:evidenceChain:missing",
    ]));
    expect(verifyPolicyDriftImpactReceipt(receipt).valid).toBe(false);
  });

  it("does not add algorithmic-management identifiers to generic policy, claims, fleet, watch, or compliance-doc files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(OPENALEX_API);
      expect(source).not.toContain("10.3390/ai7030102");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
