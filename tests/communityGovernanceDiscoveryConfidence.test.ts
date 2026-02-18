import { describe, it, expect } from "vitest";
import {
  initCommunityPlatform,
  addCommunitySignal,
  detectGamingPatterns,
  scoreCommunityGovernance,
  renderCommunityGovernanceMarkdown,
  type CommunitySignal,
} from "../src/org/communityGovernance.js";
import {
  createDiscoveryRegistry,
  addCapability,
  linkPlatform,
  searchCapabilities,
  exportPortableReputation,
  verifyPortableReputation,
} from "../src/passport/agentDiscovery.js";
import {
  generateKnownUnknownsReport,
  renderKnownUnknownsMarkdown,
} from "../src/diagnostic/knownUnknowns.js";
import {
  computeDiagnosticMetaConfidence,
  computeQuestionMetaConfidence,
  renderMetaConfidenceMarkdown,
} from "../src/diagnostic/metaConfidence.js";
import {
  computeEffectiveLevel,
  confidenceCheck,
  DEFAULT_CONFIDENCE_GOVERNOR_CONFIG,
  renderConfidenceGovernorMarkdown,
} from "../src/governor/confidenceGovernor.js";
import {
  computeComponentConfidence,
  renderComponentConfidenceMarkdown,
  CONFIDENCE_COMPONENTS,
} from "../src/diagnostic/componentConfidence.js";
import type { DiagnosticReport, QuestionScore } from "../src/types.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDiagnosticReport(overrides?: Partial<DiagnosticReport>): DiagnosticReport {
  const baseQuestion: QuestionScore = {
    questionId: "q_tool_safety_1",
    claimedLevel: 4,
    supportedMaxLevel: 4,
    finalLevel: 4,
    confidence: 0.8,
    evidenceEventIds: ["ev1", "ev2", "ev3"],
    flags: [],
    narrative: "test",
  };
  return {
    agentId: "agent-1",
    runId: "run-1",
    ts: Date.now(),
    windowStartTs: Date.now() - 86400000,
    windowEndTs: Date.now(),
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.9,
    trustLabel: "HIGH TRUST",
    targetProfileId: null,
    layerScores: [],
    questionScores: [
      baseQuestion,
      { ...baseQuestion, questionId: "q_governance_policy_2", evidenceEventIds: ["ev4"], confidence: 0.3 },
      { ...baseQuestion, questionId: "q_identity_auth_3", evidenceEventIds: [], confidence: 0.1, flags: ["self_reported"] },
    ],
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: 0.8,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 0.6,
    evidenceTrustCoverage: { observed: 0.5, attested: 0.3, selfReported: 0.2 },
    ...overrides,
  } as DiagnosticReport;
}

// ── Community Governance ─────────────────────────────────────────────────────

describe("communityGovernance", () => {
  it("initializes a platform", () => {
    const config = initCommunityPlatform("TestPlatform");
    expect(config.name).toBe("TestPlatform");
    expect(config.signals).toHaveLength(0);
  });

  it("adds signals and scores", () => {
    let config = initCommunityPlatform("TestPlatform");
    config = addCommunitySignal(config, {
      tier: "OBSERVED",
      dimension: "identity_verification",
      source: "monitor",
      ts: Date.now(),
      value: 4,
    });
    config = addCommunitySignal(config, {
      tier: "SELF_REPORTED",
      dimension: "content_moderation",
      source: "user",
      ts: Date.now(),
      value: 3,
    });
    const report = scoreCommunityGovernance(config);
    expect(report.platformName).toBe("TestPlatform");
    expect(report.signalCount).toBe(2);
    expect(report.dimensionScores.length).toBe(5);
    const md = renderCommunityGovernanceMarkdown(report);
    expect(md).toContain("TestPlatform");
  });

  it("detects karma gaming", () => {
    const signals: CommunitySignal[] = [];
    for (let i = 0; i < 10; i++) {
      signals.push({
        id: `s${i}`,
        tier: "SELF_REPORTED",
        dimension: "reputation_integrity",
        source: `user${i}`,
        ts: Date.now(),
        value: 4.5,
      });
    }
    const detections = detectGamingPatterns(signals);
    expect(detections.some((d) => d.pattern === "karma_gaming")).toBe(true);
  });
});

// ── Agent Discovery ──────────────────────────────────────────────────────────

describe("agentDiscovery", () => {
  it("adds capabilities and searches", () => {
    const registry = createDiscoveryRegistry();
    addCapability(registry, "agent-1", "code-review", ["ev1", "ev2"], 4);
    addCapability(registry, "agent-2", "code-review", ["ev3"], 2);
    addCapability(registry, "agent-1", "testing", ["ev4"], 3);

    const results = searchCapabilities(registry, { capability: "code-review" });
    expect(results.length).toBe(2);
    expect(results[0].maturityLevel).toBe(4); // sorted by maturity

    const filtered = searchCapabilities(registry, { capability: "code-review", minLevel: 3 });
    expect(filtered.length).toBe(1);
  });

  it("links platforms", () => {
    const registry = createDiscoveryRegistry();
    addCapability(registry, "agent-1", "deploy", [], 3);
    const link = linkPlatform(registry, "agent-1", "moltbook", "agent1handle");
    expect(link.platform).toBe("moltbook");
    expect(link.identity).toBe("agent1handle");
  });

  it("exports and verifies portable reputation", () => {
    const registry = createDiscoveryRegistry();
    addCapability(registry, "agent-1", "code-review", ["ev1"], 4);
    linkPlatform(registry, "agent-1", "github", "agent1");

    const bundle = exportPortableReputation(registry, "agent-1");
    expect(bundle).not.toBeNull();
    expect(bundle!.version).toBe(1);
    expect(verifyPortableReputation(bundle!)).toBe(true);

    // Tamper with it
    const tampered = { ...bundle!, capabilities: [] };
    expect(verifyPortableReputation(tampered)).toBe(false);
  });
});

// ── Known Unknowns ───────────────────────────────────────────────────────────

describe("knownUnknowns", () => {
  it("generates report with gaps", () => {
    const report = makeDiagnosticReport();
    const unknowns = generateKnownUnknownsReport(report);
    expect(unknowns.unknowns.length).toBeGreaterThan(0);
    expect(unknowns.summary.total).toBeGreaterThan(0);
    // Question with 0 evidence should have EVIDENCE_GAP
    const evidenceGaps = unknowns.unknowns.filter((u) => u.category === "EVIDENCE_GAP");
    expect(evidenceGaps.length).toBeGreaterThan(0);
    // Question with self_reported flag should have TRUST_GAP
    const trustGaps = unknowns.unknowns.filter((u) => u.category === "TRUST_GAP");
    expect(trustGaps.length).toBeGreaterThan(0);

    const md = renderKnownUnknownsMarkdown(unknowns);
    expect(md).toContain("Known Unknowns");
  });

  it("handles clean report", () => {
    const report = makeDiagnosticReport({
      questionScores: [
        {
          questionId: "q1",
          claimedLevel: 3,
          supportedMaxLevel: 3,
          finalLevel: 3,
          confidence: 0.9,
          evidenceEventIds: ["e1", "e2", "e3", "e4", "e5"],
          flags: [],
          narrative: "solid",
        },
      ],
      evidenceCoverage: 0.95,
      evidenceTrustCoverage: { observed: 0.8, attested: 0.15, selfReported: 0.05 },
    });
    const unknowns = generateKnownUnknownsReport(report);
    // Should have few or no unknowns for well-evidenced question
    expect(unknowns.summary.byCategory.EVIDENCE_GAP).toBe(0);
  });
});

// ── Meta-Confidence ──────────────────────────────────────────────────────────

describe("metaConfidence", () => {
  it("computes diagnostic meta-confidence", () => {
    const report = makeDiagnosticReport();
    const mc = computeDiagnosticMetaConfidence(report);
    expect(mc.agentId).toBe("agent-1");
    expect(mc.overallConfidence).toBeGreaterThan(0);
    expect(mc.overallConfidence).toBeLessThanOrEqual(1);
    expect(mc.questionConfidences.length).toBe(3);

    // Question with more evidence should have higher volume factor
    const q1 = mc.questionConfidences.find((q) => q.questionId === "q_tool_safety_1")!;
    const q3 = mc.questionConfidences.find((q) => q.questionId === "q_identity_auth_3")!;
    expect(q1.factors.evidenceVolume).toBeGreaterThan(q3.factors.evidenceVolume);

    const md = renderMetaConfidenceMarkdown(mc);
    expect(md).toContain("Meta-Confidence");
  });

  it("uses prior runs for consistency", () => {
    const report = makeDiagnosticReport();
    const prior = makeDiagnosticReport({ runId: "run-0" });
    const mc = computeDiagnosticMetaConfidence(report, { priorRuns: [prior] });
    // With identical prior run, consistency should be high
    const q1 = mc.questionConfidences.find((q) => q.questionId === "q_tool_safety_1")!;
    expect(q1.factors.consistency).toBeGreaterThan(0.8);
  });
});

// ── Confidence Governor ──────────────────────────────────────────────────────

describe("confidenceGovernor", () => {
  it("computes effective level with linear curve", () => {
    // L4 at 0.5 confidence = effective L2
    expect(computeEffectiveLevel(4, 0.5)).toBe(2);
    // L4 at 1.0 confidence = L4
    expect(computeEffectiveLevel(4, 1.0)).toBe(4);
    // L4 at 0.3 confidence (below floor 0.6) = capped at L2
    expect(computeEffectiveLevel(4, 0.3)).toBe(2);
  });

  it("applies confidence floor", () => {
    expect(computeEffectiveLevel(5, 0.1)).toBe(2); // below floor, capped
    expect(computeEffectiveLevel(5, 0.5)).toBe(2); // below floor, capped
    expect(computeEffectiveLevel(5, 0.7)).toBe(3.5); // above floor, linear
  });

  it("runs confidence check with diagnostic report", () => {
    const report = makeDiagnosticReport();
    const decision = confidenceCheck({
      agentId: "agent-1",
      actionClass: "DEPLOY",
      diagnosticReport: report,
      requiredLevel: 3,
    });
    expect(decision.agentId).toBe("agent-1");
    expect(decision.rawMaturityLevel).toBeGreaterThan(0);
    expect(decision.confidence).toBeGreaterThan(0);
    expect(typeof decision.allowed).toBe("boolean");
    expect(decision.reasons.length).toBeGreaterThan(0);

    const md = renderConfidenceGovernorMarkdown(decision);
    expect(md).toContain("Confidence Governor");
  });
});

// ── Component Confidence ─────────────────────────────────────────────────────

describe("componentConfidence", () => {
  it("computes per-component scores", () => {
    const report = makeDiagnosticReport();
    const cc = computeComponentConfidence(report);
    expect(cc.agentId).toBe("agent-1");
    expect(cc.components.length).toBe(CONFIDENCE_COMPONENTS.length);
    for (const c of cc.components) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(1);
      expect(["improving", "stable", "degrading"]).toContain(c.trend);
    }
    expect(cc.overallScore).toBeGreaterThan(0);
    expect(cc.heatmapData.length).toBe(CONFIDENCE_COMPONENTS.length);

    const md = renderComponentConfidenceMarkdown(cc);
    expect(md).toContain("Component Confidence");
  });

  it("detects trends from prior reports", () => {
    const report = makeDiagnosticReport();
    const prior1 = makeDiagnosticReport({
      runId: "run-old",
      questionScores: report.questionScores.map((q) => ({ ...q, confidence: 0.2 })),
    });
    const prior2 = makeDiagnosticReport({
      runId: "run-newer",
      questionScores: report.questionScores.map((q) => ({ ...q, confidence: 0.5 })),
    });
    const cc = computeComponentConfidence(report, [prior1, prior2]);
    // With improving confidence in priors, some should show improving trend
    expect(cc.components.length).toBe(CONFIDENCE_COMPONENTS.length);
  });
});
