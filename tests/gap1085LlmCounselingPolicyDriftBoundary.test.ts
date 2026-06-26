import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPolicyDriftImpactReceipt,
  renderPolicyDriftImpactAuditExport,
  verifyPolicyDriftImpactReceipt,
  type PolicyDriftImpactEvidenceLink,
  type PolicyDriftImpactSourceCitation,
} from "../src/compliance/policyDrift.js";

const DOC = "docs/source-reviews/GAP-1085-llm-counseling-policy-drift.md";
const OPENALEX = "https://openalex.org/W7128356801";
const OPENALEX_API = "https://api.openalex.org/works/W7128356801";
const DOI = "https://doi.org/10.3390/bs16020241";
const CROSSREF = "https://api.crossref.org/works/10.3390%2Fbs16020241";
const MDPI = "https://www.mdpi.com/2076-328X/16/2/241";
const MDPI_PDF = "https://www.mdpi.com/2076-328X/16/2/241/pdf";
const TITLE = "Power Distance and Psychological Safety in LLM Counseling: Effects on Self-Efficacy with Implications for Mental Health-Relevant Behavior Change";
const IDENTIFIER = "llm_counseling_policy_drift";

const implementationFiles = [
  "src/compliance/policyDrift.ts",
  "src/claims/governanceLineage.ts",
  "src/fleet/governance.ts",
  "src/watch/policyPacks.ts",
  "docs/COMPLIANCE_FRAMEWORKS.md",
];

const sourceCitations: PolicyDriftImpactSourceCitation[] = [
  {
    sourceId: "openalex-llm-counseling-psychological-safety",
    title: TITLE,
    url: OPENALEX,
    retrievedAt: "2026-06-25T08:49:00.000+05:30",
  },
  {
    sourceId: "doi-llm-counseling-psychological-safety",
    title: TITLE,
    url: DOI,
    retrievedAt: "2026-06-25T08:49:00.000+05:30",
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

describe("GAP-1085 LLM counseling policy-drift boundary", () => {
  it("documents live OpenAlex, Crossref, DOI, and MDPI metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1085");
    expect(doc).toContain("Policy drift and change impact");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(MDPI);
    expect(doc).toContain(MDPI_PDF);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-02-08`");
    expect(doc).toContain("Behavioral Sciences");
    expect(doc).toContain("Multidisciplinary Digital Publishing Institute");
    expect(doc).toContain("MDPI AG");
    expect(doc).toContain("ISSN `2076-328X`");
    expect(doc).toContain("gold");
    expect(doc).toContain("cc-by");
    expect(doc).toContain("Shengyu He");
    expect(doc).toContain("Zhejiang University");
    expect(doc).toContain("Yuxing (Nemo) Chen");
    expect(doc).toContain("University of Michigan");
    expect(doc).toContain("Construal level theory");
    expect(doc).toContain("Vignette");
    expect(doc).toContain("Mental health");
    expect(doc).toContain("Psychological safety");
    expect(doc).toContain("Suicide prevention");
    expect(doc).toContain("OpenAlex abstract available");
    expect(doc).toContain("HTTP/2 `302`");
    expect(doc).toContain("HTTP/2 `403`");
    expect(doc).toContain("policy diff");
    expect(doc).toContain("affected agents");
    expect(doc).toContain("affected tests");
    expect(doc).toContain("affected controls");
    expect(doc).toContain("prior decisions");
    expect(doc).toContain("recheck list");
    expect(doc).toContain("rollout receipt");
    expect(doc).toContain("metadata-only LLM counseling evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses the existing generic policy drift primitive for counseling-adjacent governance context", () => {
    const receipt = buildPolicyDriftImpactReceipt({
      receiptId: "gap1085-llm-counseling-policy-drift",
      generatedAt: "2026-06-25T08:50:00.000+05:30",
      sourceCitations,
      changes: [
        {
          changeId: "policy-change-counseling-adjacent-safety-v2",
          policyId: "policy-counseling-adjacent-agent-safety",
          previousPolicyVersion: "v1.3.0",
          nextPolicyVersion: "v1.4.0",
          previousPolicyHash: "a".repeat(64),
          nextPolicyHash: "b".repeat(64),
          changeOwner: "clinical-safety-policy-owner@example.com",
          changedAt: "2026-06-25T08:50:10.000+05:30",
          rationale: "Counseling-adjacent agents require refreshed disclaimers, escalation, and psychological-safety review before rollout.",
          diffSummary: "Agents in counseling-adjacent contexts require impact review, updated escalation tests, and prior approval recheck.",
          signedEvidenceRef: "ledger-policy-change-counseling-adjacent-safety-v2",
          signatureSha256: "c".repeat(64),
          affectedAgents: [
            {
              agentId: "wellbeing-guidance-agent",
              environment: "production",
              currentPolicyVersion: "v1.3.0",
              requiredPolicyVersion: "v1.4.0",
              impactLevel: "critical",
              reason: "Agent provides counseling-adjacent guidance and must refresh escalation and safety-boundary evidence.",
              signedEvidenceRef: "ledger-affected-agent-wellbeing-guidance",
              signatureSha256: "d".repeat(64),
            },
            {
              agentId: "self-efficacy-coach-agent",
              environment: "staging",
              currentPolicyVersion: "v1.3.0",
              requiredPolicyVersion: "v1.4.0",
              impactLevel: "high",
              reason: "Agent must refresh psychological-safety review evidence before staged rollout.",
              signedEvidenceRef: "ledger-affected-agent-self-efficacy-coach",
              signatureSha256: "e".repeat(64),
            },
          ],
          affectedControls: [
            {
              controlId: "nist_map",
              framework: "NIST AI RMF",
              owner: "grc-owner@example.com",
              changeType: "strengthened",
              signedEvidenceRef: "ledger-control-nist-map-counseling-safety-refresh",
              signatureSha256: "f".repeat(64),
            },
            {
              controlId: "eu_ai_act_human_oversight",
              framework: "EU AI Act",
              owner: "compliance-owner@example.com",
              changeType: "strengthened",
              signedEvidenceRef: "ledger-control-eu-ai-act-human-oversight-refresh",
              signatureSha256: "1".repeat(64),
            },
          ],
          affectedTests: [
            {
              testId: "counseling-adjacent-policy-drift-recheck",
              command: "npx vitest run tests/counselingAdjacentPolicyDriftRecheck.test.ts --reporter=dot",
              owner: "qa-owner@example.com",
              reason: "Policy change invalidates prior escalation and boundary-check approval evidence.",
              signedEvidenceRef: "ledger-test-counseling-adjacent-policy-drift-recheck",
              signatureSha256: "2".repeat(64),
            },
          ],
          priorDecisions: [
            {
              decisionId: "approval-wellbeing-guidance-agent-release-2026-06",
              agentId: "wellbeing-guidance-agent",
              decisionType: "release_approval",
              decidedAt: "2026-06-18T12:00:00.000+05:30",
              invalidated: true,
              reason: "Prior approval did not include the strengthened counseling-adjacent escalation evidence requirement.",
              signedEvidenceRef: "ledger-prior-decision-wellbeing-guidance-agent-release",
              signatureSha256: "3".repeat(64),
            },
          ],
          recheckItems: [
            {
              recheckId: "recheck-wellbeing-guidance-escalation-controls",
              owner: "qa-owner@example.com",
              dueAt: "2026-06-29T00:00:00.000+05:30",
              action: "Rerun counseling-adjacent policy drift recheck and attach updated escalation evidence.",
              status: "open",
              signedEvidenceRef: "ledger-recheck-wellbeing-guidance-escalation-controls",
              signatureSha256: "4".repeat(64),
            },
          ],
          rolloutReceipt: {
            rolloutId: "rollout-policy-counseling-adjacent-safety-v2",
            approvedBy: "grc-approver@example.com",
            approvedAt: "2026-06-25T08:51:00.000+05:30",
            rolloutWindowId: "rollout-window-2026-06-25-counseling-adjacent",
            rollbackPlanRef: "runbook://policy-counseling-adjacent-agent-safety/rollback-v1.3.0",
            signedEvidenceRef: "ledger-rollout-policy-counseling-adjacent-safety-v2",
            signatureSha256: "5".repeat(64),
          },
          evidenceRefs: [
            signedEvidence("ev-policy-diff-counseling-adjacent-safety", "6"),
            signedEvidence("ev-rollout-counseling-adjacent-safety", "7", "rollout"),
          ],
          sourceCitationIds: [
            "openalex-llm-counseling-psychological-safety",
            "doi-llm-counseling-psychological-safety",
          ],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      changeId: "policy-change-counseling-adjacent-safety-v2",
      policyId: "policy-counseling-adjacent-agent-safety",
      previousPolicyVersion: "v1.3.0",
      nextPolicyVersion: "v1.4.0",
      affectedAgentIds: ["wellbeing-guidance-agent", "self-efficacy-coach-agent"],
      affectedControlIds: ["nist_map", "eu_ai_act_human_oversight"],
      affectedTestIds: ["counseling-adjacent-policy-drift-recheck"],
      priorDecisionIds: ["approval-wellbeing-guidance-agent-release-2026-06"],
      recheckIds: ["recheck-wellbeing-guidance-escalation-controls"],
      rolloutId: "rollout-policy-counseling-adjacent-safety-v2",
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
    expect(markdown).toContain("wellbeing-guidance-agent");
    expect(markdown).toContain("counseling-adjacent-policy-drift-recheck");
    expect(markdown).toContain("nist_map");
    expect(markdown).toContain("approval-wellbeing-guidance-agent-release-2026-06");
    expect(markdown).toContain("recheck-wellbeing-guidance-escalation-controls");
    expect(markdown).toContain("rollout-policy-counseling-adjacent-safety-v2");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("VALID");
  });

  it("fails closed when paper metadata replaces signed policy drift impact evidence", () => {
    const receipt = buildPolicyDriftImpactReceipt({
      receiptId: "gap1085-metadata-only-policy-drift",
      generatedAt: "2026-06-25T08:52:00.000+05:30",
      sourceCitations: [sourceCitations[0]],
      changes: [
        {
          changeId: "metadata-only-llm-counseling-policy-change",
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
          sourceCitationIds: ["openalex-llm-counseling-psychological-safety"],
        },
      ],
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "metadata-only-llm-counseling-policy-change:policyDiff:missing",
      "metadata-only-llm-counseling-policy-change:affectedAgents:missing",
      "metadata-only-llm-counseling-policy-change:affectedControls:missing",
      "metadata-only-llm-counseling-policy-change:affectedTests:missing",
      "metadata-only-llm-counseling-policy-change:priorDecisions:missing",
      "metadata-only-llm-counseling-policy-change:recheckList:missing",
      "metadata-only-llm-counseling-policy-change:rolloutReceipt:missing",
      "metadata-only-llm-counseling-policy-change:evidenceChain:missing",
    ]));
    expect(verifyPolicyDriftImpactReceipt(receipt).valid).toBe(false);
  });

  it("does not add LLM counseling identifiers to generic policy, claims, fleet, watch, or compliance-doc files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(OPENALEX_API);
      expect(source).not.toContain("10.3390/bs16020241");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
