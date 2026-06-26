import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPolicyDriftImpactReceipt,
  renderPolicyDriftImpactAuditExport,
  verifyPolicyDriftImpactReceipt,
  type PolicyDriftImpactEvidenceLink,
  type PolicyDriftImpactSourceCitation,
} from "../src/compliance/policyDrift.js";

const DOC = "docs/source-reviews/GAP-1088-agentic-fintech-policy-drift.md";
const OPENALEX = "https://openalex.org/W7127378038";
const OPENALEX_API = "https://api.openalex.org/works/W7127378038";
const DOI = "https://doi.org/10.2139/ssrn.6136529";
const CROSSREF = "https://api.crossref.org/works/10.2139/ssrn.6136529";
const SSRN = "https://www.ssrn.com/abstract=6136529";
const SSRN_PAPERS = "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6136529";
const TITLE = "Agentic FinTech: A Comprehensive Survey on AI Agents in Finance in the Era of LLMs";
const IDENTIFIER = "agentic_fintech_policy_drift";

const implementationFiles = [
  "src/compliance/policyDrift.ts",
  "src/claims/governanceLineage.ts",
  "src/fleet/governance.ts",
  "src/watch/policyPacks.ts",
  "docs/COMPLIANCE_FRAMEWORKS.md",
];

const sourceCitations: PolicyDriftImpactSourceCitation[] = [
  {
    sourceId: "openalex-agentic-fintech-survey",
    title: TITLE,
    url: OPENALEX,
    retrievedAt: "2026-06-25T16:43:27.000Z",
  },
  {
    sourceId: "doi-agentic-fintech-survey",
    title: TITLE,
    url: DOI,
    retrievedAt: "2026-06-25T16:43:27.000Z",
  },
  {
    sourceId: "crossref-agentic-fintech-survey",
    title: TITLE,
    url: CROSSREF,
    retrievedAt: "2026-06-25T16:43:27.000Z",
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

describe("GAP-1088 Agentic FinTech policy-drift boundary", () => {
  it("documents live OpenAlex, DOI, Crossref, and SSRN metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1088");
    expect(doc).toContain("Policy drift and change impact");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(SSRN);
    expect(doc).toContain(SSRN_PAPERS);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-01-01`");
    expect(doc).toContain("SSRN Electronic Journal");
    expect(doc).toContain("Elsevier BV");
    expect(doc).toContain("posted-content");
    expect(doc).toContain("Yaxiong Wu");
    expect(doc).toContain("Yixuan Li");
    expect(doc).toContain("Finance");
    expect(doc).toContain("Financial risk");
    expect(doc).toContain("Financial services");
    expect(doc).toContain("HTTP/2 `302`");
    expect(doc).toContain("HTTP/2 `403`");
    expect(doc).toContain("052c9a3d453ebbbcc96a51cc1afe562aaa86969b22fd7e25b8d943074caa4a8d");
    expect(doc).toContain("policy diff");
    expect(doc).toContain("affected agents");
    expect(doc).toContain("affected tests");
    expect(doc).toContain("affected controls");
    expect(doc).toContain("prior decisions");
    expect(doc).toContain("recheck list");
    expect(doc).toContain("rollout receipt");
    expect(doc).toContain("metadata-only Agentic FinTech evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses the existing generic policy drift primitive for finance-agent governance context", () => {
    const receipt = buildPolicyDriftImpactReceipt({
      receiptId: "gap1088-agentic-fintech-policy-drift",
      generatedAt: "2026-06-25T16:44:00.000Z",
      sourceCitations,
      changes: [
        {
          changeId: "policy-change-finance-agent-risk-v3",
          policyId: "policy-finance-agent-risk-controls",
          previousPolicyVersion: "v2.1.0",
          nextPolicyVersion: "v2.2.0",
          previousPolicyHash: "a".repeat(64),
          nextPolicyHash: "b".repeat(64),
          changeOwner: "finance-grc-owner@example.com",
          changedAt: "2026-06-25T16:44:10.000Z",
          rationale: "Finance agents require refreshed market-risk, suitability, and human-approval controls before rollout.",
          diffSummary: "Strengthen pre-trade approval, model-risk review, and customer-impact recheck for finance-agent workflows.",
          signedEvidenceRef: "ledger-policy-change-finance-agent-risk-v3",
          signatureSha256: "c".repeat(64),
          affectedAgents: [
            {
              agentId: "portfolio-rebalancing-agent",
              environment: "production",
              currentPolicyVersion: "v2.1.0",
              requiredPolicyVersion: "v2.2.0",
              impactLevel: "critical",
              reason: "Agent can recommend portfolio changes and needs refreshed market-risk and human-approval evidence.",
              signedEvidenceRef: "ledger-affected-agent-portfolio-rebalancing",
              signatureSha256: "d".repeat(64),
            },
            {
              agentId: "fintech-risk-research-agent",
              environment: "staging",
              currentPolicyVersion: "v2.1.0",
              requiredPolicyVersion: "v2.2.0",
              impactLevel: "high",
              reason: "Agent summarizes financial risk signals and must refresh suitability and citation controls.",
              signedEvidenceRef: "ledger-affected-agent-fintech-risk-research",
              signatureSha256: "e".repeat(64),
            },
          ],
          affectedControls: [
            {
              controlId: "nist_map",
              framework: "NIST AI RMF",
              owner: "grc-owner@example.com",
              changeType: "strengthened",
              signedEvidenceRef: "ledger-control-nist-finance-agent-risk-refresh",
              signatureSha256: "f".repeat(64),
            },
            {
              controlId: "soc2_change_management",
              framework: "SOC 2",
              owner: "compliance-owner@example.com",
              changeType: "strengthened",
              signedEvidenceRef: "ledger-control-soc2-finance-agent-change-management",
              signatureSha256: "1".repeat(64),
            },
          ],
          affectedTests: [
            {
              testId: "finance-agent-policy-drift-recheck",
              command: "npx vitest run tests/financeAgentPolicyDriftRecheck.test.ts --reporter=dot",
              owner: "qa-owner@example.com",
              reason: "Policy change invalidates prior approval evidence for market-risk and human-approval gates.",
              signedEvidenceRef: "ledger-test-finance-agent-policy-drift-recheck",
              signatureSha256: "2".repeat(64),
            },
          ],
          priorDecisions: [
            {
              decisionId: "approval-portfolio-rebalancing-release-2026-06",
              agentId: "portfolio-rebalancing-agent",
              decisionType: "release_approval",
              decidedAt: "2026-06-18T12:00:00.000Z",
              invalidated: true,
              reason: "Prior approval did not include the strengthened finance-agent market-risk evidence requirement.",
              signedEvidenceRef: "ledger-prior-decision-portfolio-rebalancing-release",
              signatureSha256: "3".repeat(64),
            },
          ],
          recheckItems: [
            {
              recheckId: "recheck-portfolio-rebalancing-market-risk-controls",
              owner: "qa-owner@example.com",
              dueAt: "2026-06-29T00:00:00.000Z",
              action: "Rerun finance-agent policy drift recheck and attach updated market-risk approval evidence.",
              status: "open",
              signedEvidenceRef: "ledger-recheck-portfolio-rebalancing-market-risk-controls",
              signatureSha256: "4".repeat(64),
            },
          ],
          rolloutReceipt: {
            rolloutId: "rollout-policy-finance-agent-risk-v3",
            approvedBy: "grc-approver@example.com",
            approvedAt: "2026-06-25T16:45:00.000Z",
            rolloutWindowId: "rollout-window-2026-06-25-finance-agent-risk",
            rollbackPlanRef: "runbook://policy-finance-agent-risk-controls/rollback-v2.1.0",
            signedEvidenceRef: "ledger-rollout-policy-finance-agent-risk-v3",
            signatureSha256: "5".repeat(64),
          },
          evidenceRefs: [
            signedEvidence("ev-policy-diff-finance-agent-risk", "6"),
            signedEvidence("ev-rollout-finance-agent-risk", "7", "rollout"),
          ],
          sourceCitationIds: [
            "openalex-agentic-fintech-survey",
            "doi-agentic-fintech-survey",
            "crossref-agentic-fintech-survey",
          ],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      changeId: "policy-change-finance-agent-risk-v3",
      policyId: "policy-finance-agent-risk-controls",
      previousPolicyVersion: "v2.1.0",
      nextPolicyVersion: "v2.2.0",
      affectedAgentIds: ["portfolio-rebalancing-agent", "fintech-risk-research-agent"],
      affectedControlIds: ["nist_map", "soc2_change_management"],
      affectedTestIds: ["finance-agent-policy-drift-recheck"],
      priorDecisionIds: ["approval-portfolio-rebalancing-release-2026-06"],
      recheckIds: ["recheck-portfolio-rebalancing-market-risk-controls"],
      rolloutId: "rollout-policy-finance-agent-risk-v3",
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
    expect(markdown).toContain("portfolio-rebalancing-agent");
    expect(markdown).toContain("finance-agent-policy-drift-recheck");
    expect(markdown).toContain("nist_map");
    expect(markdown).toContain("approval-portfolio-rebalancing-release-2026-06");
    expect(markdown).toContain("recheck-portfolio-rebalancing-market-risk-controls");
    expect(markdown).toContain("rollout-policy-finance-agent-risk-v3");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("VALID");
  });

  it("fails closed when paper metadata replaces signed policy drift impact evidence", () => {
    const receipt = buildPolicyDriftImpactReceipt({
      receiptId: "gap1088-metadata-only-policy-drift",
      generatedAt: "2026-06-25T16:46:00.000Z",
      sourceCitations: [sourceCitations[0]],
      changes: [
        {
          changeId: "metadata-only-agentic-fintech-policy-change",
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
          sourceCitationIds: ["openalex-agentic-fintech-survey"],
        },
      ],
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "metadata-only-agentic-fintech-policy-change:policyDiff:missing",
      "metadata-only-agentic-fintech-policy-change:affectedAgents:missing",
      "metadata-only-agentic-fintech-policy-change:affectedControls:missing",
      "metadata-only-agentic-fintech-policy-change:affectedTests:missing",
      "metadata-only-agentic-fintech-policy-change:priorDecisions:missing",
      "metadata-only-agentic-fintech-policy-change:recheckList:missing",
      "metadata-only-agentic-fintech-policy-change:rolloutReceipt:missing",
      "metadata-only-agentic-fintech-policy-change:evidenceChain:missing",
    ]));
    expect(verifyPolicyDriftImpactReceipt(receipt).valid).toBe(false);
  });

  it("does not add Agentic FinTech identifiers to generic policy, claims, fleet, watch, or compliance-doc files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(OPENALEX_API);
      expect(source).not.toContain("10.2139/ssrn.6136529");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
