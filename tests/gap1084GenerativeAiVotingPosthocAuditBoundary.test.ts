import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPosthocAuditSamplingReceipt,
  renderPosthocAuditSamplingAuditExport,
  verifyPosthocAuditSamplingReceipt,
  type PosthocAuditSamplingEvidenceLink,
  type PosthocAuditSamplingSourceCitation,
} from "../src/audit/posthocAuditSampling.js";

const DOC = "docs/source-reviews/GAP-1084-generative-ai-voting-posthoc-audit.md";
const OPENALEX = "https://openalex.org/W7128424040";
const OPENALEX_API = "https://api.openalex.org/works/W7128424040";
const DOI = "https://doi.org/10.1140/epjds/s13688-025-00612-3";
const CROSSREF = "https://api.crossref.org/works/10.1140%2Fepjds%2Fs13688-025-00612-3";
const SPRINGER = "https://link.springer.com/article/10.1140/epjds/s13688-025-00612-3";
const PDF = "https://link.springer.com/content/pdf/10.1140/epjds/s13688-025-00612-3.pdf";
const TITLE = "Generative AI voting: fair collective choice is resilient to LLM biases and inconsistencies";
const IDENTIFIER = "generative_ai_voting_posthoc_audit";

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
    sourceId: "openalex-generative-ai-voting",
    title: TITLE,
    url: OPENALEX,
    retrievedAt: "2026-06-25T08:41:00.000+05:30",
  },
  {
    sourceId: "doi-generative-ai-voting",
    title: TITLE,
    url: DOI,
    retrievedAt: "2026-06-25T08:41:00.000+05:30",
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

describe("GAP-1084 generative AI voting post-hoc audit boundary", () => {
  it("documents live OpenAlex, Crossref, DOI, and Springer metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1084");
    expect(doc).toContain("Post-hoc human audit sampling");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(SPRINGER);
    expect(doc).toContain(PDF);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-02-09`");
    expect(doc).toContain("EPJ Data Science");
    expect(doc).toContain("Springer Nature");
    expect(doc).toContain("Springer Science and Business Media LLC");
    expect(doc).toContain("ISSN `2193-1127`");
    expect(doc).toContain("gold");
    expect(doc).toContain("cc-by");
    expect(doc).toContain("Srijoni Majumdar");
    expect(doc).toContain("University of Leeds");
    expect(doc).toContain("Edith Elkind");
    expect(doc).toContain("Northwestern University");
    expect(doc).toContain("Evangelos Pournaras");
    expect(doc).toContain("Ballot");
    expect(doc).toContain("Voting");
    expect(doc).toContain("Group decision-making");
    expect(doc).toContain("Artificial intelligence");
    expect(doc).toContain("OpenAlex abstract available");
    expect(doc).toContain("HTTP/2 `302`");
    expect(doc).toContain("HTTP/2 `301`");
    expect(doc).toContain("Springer Nature Link");
    expect(doc).toContain("sample plan");
    expect(doc).toContain("reviewed actions");
    expect(doc).toContain("findings");
    expect(doc).toContain("corrective action");
    expect(doc).toContain("score impact");
    expect(doc).toContain("metadata-only Generative AI voting evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("builds a generic post-hoc audit sampling receipt for source-cited collective-decision agent review", () => {
    const receipt = buildPosthocAuditSamplingReceipt({
      receiptId: "gap1084-generative-ai-voting-posthoc-audit",
      generatedAt: "2026-06-25T08:42:00.000+05:30",
      sourceCitations,
      samplePlans: [
        {
          samplePlanId: "sample-plan-collective-choice-actions-june",
          owner: "audit-owner@example.com",
          populationId: "collective-choice-agent-actions-june-2026",
          populationSize: 540,
          sampleSize: 27,
          samplingMethod: "risk-stratified",
          riskTier: "high",
          plannedAt: "2026-06-25T08:42:05.000+05:30",
          signedEvidenceRef: "ledger-sample-plan-collective-choice-actions-june",
          signatureSha256: "a".repeat(64),
        },
      ],
      reviewedActions: [
        {
          actionId: "action-voting-recommendation-312",
          samplePlanId: "sample-plan-collective-choice-actions-june",
          agentId: "collective-choice-assistant",
          policyId: "policy-human-review-for-representative-decisions",
          completedAt: "2026-06-24T21:10:00.000+05:30",
          sampledAt: "2026-06-25T08:42:10.000+05:30",
          reviewerId: "human-auditor-31",
          reviewDecision: "issue",
          reviewSignedEvidenceRef: "ledger-reviewed-action-voting-recommendation-312",
          reviewSignatureSha256: "b".repeat(64),
          evidenceRefs: [
            signedEvidence("ev-voting-recommendation-runtime", "c", "runtime"),
            signedEvidence("ev-voting-recommendation-review", "d", "review"),
          ],
          sourceCitationIds: [
            "openalex-generative-ai-voting",
            "doi-generative-ai-voting",
          ],
        },
      ],
      findings: [
        {
          findingId: "finding-collective-choice-review-gap",
          actionId: "action-voting-recommendation-312",
          severity: "high",
          description: "Representative decision recommendation lacked signed human review before being treated as audit-ready.",
          owner: "policy-owner@example.com",
          openedAt: "2026-06-25T08:43:00.000+05:30",
          signedEvidenceRef: "ledger-finding-collective-choice-review-gap",
          signatureSha256: "e".repeat(64),
        },
      ],
      correctiveActions: [
        {
          correctiveActionId: "ca-collective-choice-review-regression",
          findingId: "finding-collective-choice-review-gap",
          owner: "engineering-owner@example.com",
          description: "Add regression that blocks representative decision claims without signed post-hoc review evidence.",
          status: "open",
          dueAt: "2026-07-02T00:00:00.000+05:30",
          signedEvidenceRef: "ledger-ca-collective-choice-review-regression",
          signatureSha256: "f".repeat(64),
          regressionTestRef: "tests/collectiveChoiceReviewRegression.test.ts",
        },
      ],
      scoreImpacts: [
        {
          scoreImpactId: "score-impact-collective-choice-review-gap",
          actionId: "action-voting-recommendation-312",
          dimensionId: "AMC-4",
          questionId: "AMC-4.3",
          beforeScore: 0.84,
          afterScore: 0.74,
          impact: -0.1,
          reason: "Post-hoc audit found missing human review evidence for a representative decision action.",
          signedEvidenceRef: "ledger-score-impact-collective-choice-review-gap",
          signatureSha256: "1".repeat(64),
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      samplePlanId: "sample-plan-collective-choice-actions-june",
      actionId: "action-voting-recommendation-312",
      agentId: "collective-choice-assistant",
      reviewerId: "human-auditor-31",
      reviewDecision: "issue",
      findingIds: ["finding-collective-choice-review-gap"],
      correctiveActionIds: ["ca-collective-choice-review-regression"],
      scoreImpactIds: ["score-impact-collective-choice-review-gap"],
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
    expect(markdown).toContain("finding-collective-choice-review-gap");
    expect(markdown).toContain("ca-collective-choice-review-regression");
    expect(markdown).toContain("AMC-4.3");
    expect(markdown).toContain("-0.1");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("VALID");
  });

  it("fails closed when paper metadata replaces signed post-hoc audit evidence", () => {
    const receipt = buildPosthocAuditSamplingReceipt({
      receiptId: "gap1084-metadata-only-posthoc-audit",
      generatedAt: "2026-06-25T08:43:30.000+05:30",
      sourceCitations: [sourceCitations[0]],
      samplePlans: [
        {
          samplePlanId: "metadata-only-generative-ai-voting-sample-plan",
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
          actionId: "metadata-only-generative-ai-voting-action",
          samplePlanId: "metadata-only-generative-ai-voting-sample-plan",
          agentId: "",
          policyId: "",
          completedAt: "",
          sampledAt: "",
          reviewerId: "",
          reviewDecision: "issue",
          reviewSignedEvidenceRef: "",
          reviewSignatureSha256: "",
          evidenceRefs: [],
          sourceCitationIds: ["openalex-generative-ai-voting"],
        },
      ],
      findings: [],
      correctiveActions: [],
      scoreImpacts: [],
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "metadata-only-generative-ai-voting-sample-plan:samplePlan:missing",
      "metadata-only-generative-ai-voting-action:reviewedAction:missing",
      "metadata-only-generative-ai-voting-action:evidenceChain:missing",
      "metadata-only-generative-ai-voting-action:finding:missing",
      "metadata-only-generative-ai-voting-action:scoreImpact:missing",
    ]));
    expect(verifyPosthocAuditSamplingReceipt(receipt).valid).toBe(false);
  });

  it("fails closed when a source-cited audit finding has no corrective action", () => {
    const receipt = buildPosthocAuditSamplingReceipt({
      receiptId: "gap1084-missing-corrective-action",
      generatedAt: "2026-06-25T08:44:00.000+05:30",
      sourceCitations,
      samplePlans: [
        {
          samplePlanId: "sample-plan-collective-choice-actions-june",
          owner: "audit-owner@example.com",
          populationId: "collective-choice-agent-actions-june-2026",
          populationSize: 540,
          sampleSize: 27,
          samplingMethod: "risk-stratified",
          riskTier: "high",
          plannedAt: "2026-06-25T08:42:05.000+05:30",
          signedEvidenceRef: "ledger-sample-plan-collective-choice-actions-june",
          signatureSha256: "a".repeat(64),
        },
      ],
      reviewedActions: [
        {
          actionId: "action-voting-recommendation-312",
          samplePlanId: "sample-plan-collective-choice-actions-june",
          agentId: "collective-choice-assistant",
          policyId: "policy-human-review-for-representative-decisions",
          completedAt: "2026-06-24T21:10:00.000+05:30",
          sampledAt: "2026-06-25T08:42:10.000+05:30",
          reviewerId: "human-auditor-31",
          reviewDecision: "issue",
          reviewSignedEvidenceRef: "ledger-reviewed-action-voting-recommendation-312",
          reviewSignatureSha256: "b".repeat(64),
          evidenceRefs: [signedEvidence("ev-voting-recommendation-runtime", "c", "runtime")],
          sourceCitationIds: ["openalex-generative-ai-voting"],
        },
      ],
      findings: [
        {
          findingId: "finding-collective-choice-review-gap",
          actionId: "action-voting-recommendation-312",
          severity: "high",
          description: "Representative decision recommendation lacked signed human review before being treated as audit-ready.",
          owner: "policy-owner@example.com",
          openedAt: "2026-06-25T08:43:00.000+05:30",
          signedEvidenceRef: "ledger-finding-collective-choice-review-gap",
          signatureSha256: "e".repeat(64),
        },
      ],
      correctiveActions: [],
      scoreImpacts: [
        {
          scoreImpactId: "score-impact-collective-choice-review-gap",
          actionId: "action-voting-recommendation-312",
          dimensionId: "AMC-4",
          questionId: "AMC-4.3",
          beforeScore: 0.84,
          afterScore: 0.74,
          impact: -0.1,
          reason: "Post-hoc audit found missing human review evidence for a representative decision action.",
          signedEvidenceRef: "ledger-score-impact-collective-choice-review-gap",
          signatureSha256: "1".repeat(64),
        },
      ],
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toContain("finding-collective-choice-review-gap:correctiveAction:missing");
    expect(verifyPosthocAuditSamplingReceipt(receipt).valid).toBe(false);
  });

  it("does not add paper-specific identifiers to generic audit, compliance, score, or incident implementation files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("10.1140/epjds/s13688-025-00612-3");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain("Generative AI voting");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
