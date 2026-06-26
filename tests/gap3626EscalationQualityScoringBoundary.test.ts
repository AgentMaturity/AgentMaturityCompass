import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assessOversightQuality,
  type OversightEscalationEvent
} from "../src/score/humanOversightQuality.js";

const DOC = "docs/source-reviews/GAP-3626-escalation-quality-scoring.md";
const OPENALEX = "https://openalex.org/W4392866835";
const OPENALEX_API = "https://api.openalex.org/works/W4392866835";
const DOI = "https://doi.org/10.1145/3816150";
const CROSSREF = "https://api.crossref.org/works/10.1145/3816150";
const ACM = "https://dl.acm.org/doi/10.1145/3816150";
const TITLE = "Usable XAI: 10 Strategies Towards Exploiting Explainability in the LLM Era";
const IDENTIFIER = "usable_xai_escalation_quality";
const IMPLEMENTATION_FILES = [
  "src/score/humanOversightQuality.ts",
  "src/assurance/packs/humanOversightQualityPack.ts"
];

const BASE_SCORES = {
  "AMC-HOQ-1": 5,
  "AMC-HOQ-2": 5,
  "AMC-HOQ-3": 5,
  "AMC-HOQ-4": 5,
  "graduated-autonomy": 5
} as const;

const BASE_TS = Date.parse("2026-06-25T17:15:00.000Z");

function escalation(overrides: Partial<OversightEscalationEvent> = {}): OversightEscalationEvent {
  return {
    escalationId: "esc-base",
    triggeredTs: BASE_TS,
    expectedLevel: 2,
    reachedLevel: 2,
    acknowledgedTs: BASE_TS + 2 * 60_000,
    resolvedTs: BASE_TS + 6 * 60_000,
    reviewerRole: "on-call safety reviewer",
    outcome: "fallback reviewer routed",
    escalationPacket: {
      summary: "High-risk deployment requires human decision before execution.",
      risk: "Potential customer data exposure if the deployment is unsafe.",
      options: ["approve with rollback", "deny", "route to fallback reviewer"],
      missingEvidence: ["production rollback dry run is not attached"],
      recommendedReviewerAction: "Deny until rollback evidence is attached.",
      evidenceRefs: ["ev-escalation-context-1"]
    },
    ...overrides
  };
}

describe("GAP-3626 escalation quality scoring boundary", () => {
  it("documents live paper metadata and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-3626");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(ACM);
    expect(doc).toContain("ACM Transactions on Knowledge Discovery from Data");
    expect(doc).toContain("Association for Computing Machinery");
    expect(doc).toContain("Xuansheng Wu");
    expect(doc).toContain("USable");
    expect(doc).toContain("World Wide Web");
    expect(doc).toContain("Escalation packet, reviewer role, completeness score, and outcome");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No XAI strategy subsystem");
  });

  it("scores escalation packet completeness and records missing fields", () => {
    const escalations: OversightEscalationEvent[] = [
      escalation({
        escalationId: "esc-complete-primary",
        reviewerRole: "security incident commander",
        outcome: "approved with rollback evidence"
      }),
      escalation({
        escalationId: "esc-complete-fallback",
        reviewerRole: "fallback compliance reviewer",
        outcome: "denied pending evidence",
        escalationPacket: {
          summary: "Privileged tool request needs review before execution.",
          risk: "Policy exception could expose regulated data.",
          options: ["deny", "approve after redaction proof", "route to legal"],
          missingEvidence: ["redaction proof is missing"],
          recommendedReviewerAction: "Route to legal and deny until redaction proof exists.",
          evidenceRefs: ["ev-legal-context-1"]
        }
      }),
      escalation({
        escalationId: "esc-incomplete",
        reviewerRole: undefined,
        outcome: undefined,
        escalationPacket: {
          summary: "Needs review.",
          risk: "High risk.",
          options: [],
          missingEvidence: [],
          recommendedReviewerAction: undefined
        }
      })
    ];

    const result = assessOversightQuality({ scores: BASE_SCORES, escalations });

    expect(result.escalationPacketQualityMet).toBe(false);
    expect(result.escalationPacketQuality.assessedCount).toBe(3);
    expect(result.escalationPacketQuality.completeCount).toBe(2);
    expect(result.escalationPacketQuality.incompleteCount).toBe(1);
    expect(result.escalationPacketQuality.averageCompleteness).toBeGreaterThan(0.75);
    expect(result.escalationPacketQuality.byEscalation).toEqual(expect.arrayContaining([
      expect.objectContaining({
        escalationId: "esc-complete-primary",
        reviewerRole: "security incident commander",
        outcome: "approved with rollback evidence",
        completenessScore: 1,
        missingFields: []
      }),
      expect.objectContaining({
        escalationId: "esc-incomplete",
        reviewerRole: null,
        outcome: null,
        missingFields: expect.arrayContaining([
          "options",
          "missingEvidence",
          "recommendedReviewerAction",
          "reviewerRole",
          "outcome"
        ])
      })
    ]));
    expect(result.gaps.some((gap) => gap.includes("Escalation packet quality incomplete"))).toBe(true);
    expect(result.recommendations.some((rec) => rec.includes("Include concise context"))).toBe(true);
  });

  it("passes escalation packet quality when all escalations include complete reviewer context", () => {
    const result = assessOversightQuality({
      scores: BASE_SCORES,
      escalations: [
        escalation({ escalationId: "esc-good-1" }),
        escalation({ escalationId: "esc-good-2", reviewerRole: "privacy reviewer", outcome: "denied" })
      ]
    });

    expect(result.escalationPacketQualityMet).toBe(true);
    expect(result.escalationPacketQuality.assessedCount).toBe(2);
    expect(result.escalationPacketQuality.completeCount).toBe(2);
    expect(result.escalationPacketQuality.averageCompleteness).toBe(1);
    expect(result.escalationPacketQuality.byEscalation.every((row) => row.missingFields.length === 0)).toBe(true);
  });

  it("does not treat score-only metadata as escalation quality proof", () => {
    const result = assessOversightQuality({ scores: BASE_SCORES });

    expect(result.escalationPacketQualityMet).toBe(false);
    expect(result.escalationPacketQuality.assessedCount).toBe(0);
    expect(result.gaps.some((gap) => gap.includes("Escalation packet quality is not evidenced"))).toBe(true);
  });

  it("does not add XAI-paper-specific identifiers to generic oversight implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("10.1145/3816150");
    expect(combined).not.toContain("W4392866835");
    expect(combined).not.toContain("ACM Transactions on Knowledge Discovery from Data");
    expect(combined).not.toContain("Usable XAI");
    expect(combined).not.toContain(IDENTIFIER);
  });
});
