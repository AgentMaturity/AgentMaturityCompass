import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPolicyDriftImpactReceipt,
  renderPolicyDriftImpactAuditExport,
  verifyPolicyDriftImpactReceipt,
  type PolicyDriftImpactEvidenceLink,
  type PolicyDriftImpactSourceCitation,
} from "../src/compliance/policyDrift.js";

const DOC = "docs/source-reviews/GAP-1090-evaluation-testing-production-policy-drift.md";
const OPENALEX = "https://openalex.org/W7163803520";
const OPENALEX_API = "https://api.openalex.org/works/W7163803520";
const DOI = "https://doi.org/10.5281/zenodo.20583927";
const ZENODO_DOI = "https://zenodo.org/doi/10.5281/zenodo.20583927";
const ZENODO_RECORD = "https://zenodo.org/records/20583928";
const ZENODO_API = "https://zenodo.org/api/records/20583928";
const CROSSREF = "https://api.crossref.org/works/10.5281/zenodo.20583927";
const TITLE = "Replication package for \"Evaluation and Testing of LLM-Based Agents in Production: A Systematic Literature Review\"";
const IDENTIFIER = "evaluation_testing_production_policy_drift";

const implementationFiles = [
  "src/compliance/policyDrift.ts",
  "src/claims/governanceLineage.ts",
  "src/fleet/governance.ts",
  "src/watch/policyPacks.ts",
  "docs/COMPLIANCE_FRAMEWORKS.md",
];

const sourceCitations: PolicyDriftImpactSourceCitation[] = [
  {
    sourceId: "openalex-evaluation-testing-production-replication",
    title: TITLE,
    url: OPENALEX,
    retrievedAt: "2026-06-25T16:51:23.000Z",
  },
  {
    sourceId: "doi-zenodo-20583927",
    title: TITLE,
    url: DOI,
    retrievedAt: "2026-06-25T16:51:23.000Z",
  },
  {
    sourceId: "zenodo-record-20583928",
    title: TITLE,
    url: ZENODO_RECORD,
    retrievedAt: "2026-06-25T16:51:23.000Z",
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

describe("GAP-1090 evaluation/testing production policy-drift boundary", () => {
  it("documents live OpenAlex, DOI, Zenodo, and Crossref retrieval boundaries with required sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1090");
    expect(doc).toContain("Policy drift and change impact");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(ZENODO_DOI);
    expect(doc).toContain(ZENODO_RECORD);
    expect(doc).toContain(ZENODO_API);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-06-07`");
    expect(doc).toContain("Zenodo (CERN European Organization for Nuclear Research)");
    expect(doc).toContain("Dataset");
    expect(doc).toContain("5 creators");
    expect(doc).toContain("1 file");
    expect(doc).toContain("Carlos Chinchilla Corbacho");
    expect(doc).toContain("Daniel Hernández de la Iglesia");
    expect(doc).toContain("Systematic review");
    expect(doc).toContain("Data extraction");
    expect(doc).toContain("Audit");
    expect(doc).toContain("HTTP/2 `302`");
    expect(doc).toContain("HTTP/1.1 `200 OK`");
    expect(doc).toContain("HTTP/2 `404`");
    expect(doc).toContain("b70ea004d90ef157fcb3de4b96f2f20f3d4bc88cd35557fe71050c5e05f5c754");
    expect(doc).toContain("policy diff");
    expect(doc).toContain("affected agents");
    expect(doc).toContain("affected tests");
    expect(doc).toContain("affected controls");
    expect(doc).toContain("prior decisions");
    expect(doc).toContain("recheck list");
    expect(doc).toContain("rollout receipt");
    expect(doc).toContain("metadata-only replication-package evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses the existing generic policy drift primitive for LLM-agent production-testing governance context", () => {
    const receipt = buildPolicyDriftImpactReceipt({
      receiptId: "gap1090-production-testing-policy-drift",
      generatedAt: "2026-06-25T16:52:00.000Z",
      sourceCitations,
      changes: [
        {
          changeId: "policy-change-production-agent-eval-gates-v4",
          policyId: "policy-production-agent-evaluation-gates",
          previousPolicyVersion: "v3.4.0",
          nextPolicyVersion: "v3.5.0",
          previousPolicyHash: "a".repeat(64),
          nextPolicyHash: "b".repeat(64),
          changeOwner: "production-grc-owner@example.com",
          changedAt: "2026-06-25T16:52:10.000Z",
          rationale: "Production LLM agents require refreshed evaluation, testing, and rollout recheck evidence before policy changes are accepted.",
          diffSummary: "Strengthen production test-gate approval, regression replay, and prior-decision recheck before rollout.",
          signedEvidenceRef: "ledger-policy-change-production-agent-eval-gates-v4",
          signatureSha256: "c".repeat(64),
          affectedAgents: [
            {
              agentId: "customer-support-production-agent",
              environment: "production",
              currentPolicyVersion: "v3.4.0",
              requiredPolicyVersion: "v3.5.0",
              impactLevel: "critical",
              reason: "Agent has production customer workflow access and must refresh evaluation and testing evidence.",
              signedEvidenceRef: "ledger-affected-agent-customer-support-production",
              signatureSha256: "d".repeat(64),
            },
            {
              agentId: "ops-triage-production-agent",
              environment: "production",
              currentPolicyVersion: "v3.4.0",
              requiredPolicyVersion: "v3.5.0",
              impactLevel: "high",
              reason: "Agent handles operational triage and must rerun policy-drift regression tests before rollout.",
              signedEvidenceRef: "ledger-affected-agent-ops-triage-production",
              signatureSha256: "e".repeat(64),
            },
          ],
          affectedControls: [
            {
              controlId: "nist_map",
              framework: "NIST AI RMF",
              owner: "grc-owner@example.com",
              changeType: "strengthened",
              signedEvidenceRef: "ledger-control-nist-production-agent-eval-refresh",
              signatureSha256: "f".repeat(64),
            },
            {
              controlId: "iso_42001_change_control",
              framework: "ISO/IEC 42001",
              owner: "compliance-owner@example.com",
              changeType: "strengthened",
              signedEvidenceRef: "ledger-control-iso-42001-production-agent-change-control",
              signatureSha256: "1".repeat(64),
            },
          ],
          affectedTests: [
            {
              testId: "production-agent-policy-drift-recheck",
              command: "npx vitest run tests/productionAgentPolicyDriftRecheck.test.ts --reporter=dot",
              owner: "qa-owner@example.com",
              reason: "Policy change invalidates previous production evaluation and testing approval evidence.",
              signedEvidenceRef: "ledger-test-production-agent-policy-drift-recheck",
              signatureSha256: "2".repeat(64),
            },
          ],
          priorDecisions: [
            {
              decisionId: "approval-customer-support-production-agent-2026-06",
              agentId: "customer-support-production-agent",
              decisionType: "release_approval",
              decidedAt: "2026-06-18T12:00:00.000Z",
              invalidated: true,
              reason: "Prior approval did not include the strengthened production evaluation and testing evidence requirement.",
              signedEvidenceRef: "ledger-prior-decision-customer-support-production",
              signatureSha256: "3".repeat(64),
            },
          ],
          recheckItems: [
            {
              recheckId: "recheck-customer-support-production-eval-gates",
              owner: "qa-owner@example.com",
              dueAt: "2026-06-29T00:00:00.000Z",
              action: "Rerun production-agent policy drift recheck and attach updated evaluation gate evidence.",
              status: "open",
              signedEvidenceRef: "ledger-recheck-customer-support-production-eval-gates",
              signatureSha256: "4".repeat(64),
            },
          ],
          rolloutReceipt: {
            rolloutId: "rollout-policy-production-agent-eval-gates-v4",
            approvedBy: "grc-approver@example.com",
            approvedAt: "2026-06-25T16:53:00.000Z",
            rolloutWindowId: "rollout-window-2026-06-25-production-agent-eval-gates",
            rollbackPlanRef: "runbook://policy-production-agent-evaluation-gates/rollback-v3.4.0",
            signedEvidenceRef: "ledger-rollout-policy-production-agent-eval-gates-v4",
            signatureSha256: "5".repeat(64),
          },
          evidenceRefs: [
            signedEvidence("ev-policy-diff-production-agent-eval-gates", "6"),
            signedEvidence("ev-rollout-production-agent-eval-gates", "7", "rollout"),
          ],
          sourceCitationIds: [
            "openalex-evaluation-testing-production-replication",
            "doi-zenodo-20583927",
            "zenodo-record-20583928",
          ],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      changeId: "policy-change-production-agent-eval-gates-v4",
      policyId: "policy-production-agent-evaluation-gates",
      previousPolicyVersion: "v3.4.0",
      nextPolicyVersion: "v3.5.0",
      affectedAgentIds: ["customer-support-production-agent", "ops-triage-production-agent"],
      affectedControlIds: ["nist_map", "iso_42001_change_control"],
      affectedTestIds: ["production-agent-policy-drift-recheck"],
      priorDecisionIds: ["approval-customer-support-production-agent-2026-06"],
      recheckIds: ["recheck-customer-support-production-eval-gates"],
      rolloutId: "rollout-policy-production-agent-eval-gates-v4",
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
    expect(markdown).toContain("customer-support-production-agent");
    expect(markdown).toContain("production-agent-policy-drift-recheck");
    expect(markdown).toContain("iso_42001_change_control");
    expect(markdown).toContain("approval-customer-support-production-agent-2026-06");
    expect(markdown).toContain("recheck-customer-support-production-eval-gates");
    expect(markdown).toContain("rollout-policy-production-agent-eval-gates-v4");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("VALID");
  });

  it("fails closed when replication-package metadata replaces signed policy drift impact evidence", () => {
    const receipt = buildPolicyDriftImpactReceipt({
      receiptId: "gap1090-metadata-only-policy-drift",
      generatedAt: "2026-06-25T16:54:00.000Z",
      sourceCitations: [sourceCitations[0]],
      changes: [
        {
          changeId: "metadata-only-production-testing-policy-change",
          policyId: "",
          previousPolicyVersion: "",
          nextPolicyVersion: "",
          previousPolicyHash: "",
          nextPolicyHash: "",
          changeOwner: "",
          changedAt: "",
          rationale: "Replication-package metadata only.",
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
          sourceCitationIds: ["openalex-evaluation-testing-production-replication"],
        },
      ],
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "metadata-only-production-testing-policy-change:policyDiff:missing",
      "metadata-only-production-testing-policy-change:affectedAgents:missing",
      "metadata-only-production-testing-policy-change:affectedControls:missing",
      "metadata-only-production-testing-policy-change:affectedTests:missing",
      "metadata-only-production-testing-policy-change:priorDecisions:missing",
      "metadata-only-production-testing-policy-change:recheckList:missing",
      "metadata-only-production-testing-policy-change:rolloutReceipt:missing",
      "metadata-only-production-testing-policy-change:evidenceChain:missing",
    ]));
    expect(verifyPolicyDriftImpactReceipt(receipt).valid).toBe(false);
  });

  it("does not add replication-package identifiers to generic policy, claims, fleet, watch, or compliance-doc files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("W7163803520");
      expect(source).not.toContain("10.5281/zenodo.20583927");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
