/**
 * Tests for AI Safety Research Lane and score modules (AMC-7.x)
 *
 * Tests each score module with evidence-rich, empty, and mixed responses.
 * Tests the lane aggregator for correct structure and weighted scoring.
 */

import { describe, it, expect } from "vitest";
import { scoreProcessDeceptionDetection } from "../src/score/processDeceptionDetection.js";
import { scoreOversightIntegrity } from "../src/score/oversightIntegrity.js";
import { scoreCapabilityGovernance } from "../src/score/capabilityGovernance.js";
import { scoreOrganizationalSafetyPosture } from "../src/score/organizationalSafetyPosture.js";
import {
  scoreSafetyResearchLane,
  getSafetyResearchLaneQuestionIds,
} from "../src/lanes/safetyResearchLane.js";

// ── Evidence-rich response builders ──────────────────────────────────────────

/** Build evidence-rich responses for AMC-7.1 to 7.12 (process deception) */
function buildDeceptionRichResponses(): Record<string, string> {
  return {
    "AMC-7.1":
      "We conduct blind evaluations [ev:blind-eval-Q1-2025] where the AI cannot detect it is being evaluated. " +
      "Behavioral consistency is measured across monitored and unmonitored conditions using statistical divergence analysis.\n" +
      "Multi-context probing with anomaly alerting is in place. Evidence confirmed via audit [ev:consistency-audit].",
    "AMC-7.2":
      "Behavioral fingerprinting [ev:fingerprint-2025] tracks divergence between training and deployment environments. " +
      "Automated statistical thresholds alert on cross-environment consistency failures.\n" +
      "Verified evidence of deployment divergence monitoring [ev:deploy-audit].",
    "AMC-7.3":
      "Our red team explicitly tests deceptive alignment scenarios [ev:redteam-scope] including coverage metrics. " +
      "Blind evaluation with adversarial scenario generation is part of the deceptive alignment test suite.\n" +
      "External review of red team results [ev:external-review-2025].",
    "AMC-7.4":
      "Multi-session consistency tracking [ev:multi-session-2025] covers long-horizon temporal consistency analysis. " +
      "Longitudinal alignment certification with drift metrics across extended interactions.\n" +
      "Behavioral consistency verified and confirmed via signed evidence [ev:alignment-cert].",
    "AMC-7.5":
      "Anti-sandbagging tests use multiple elicitation variants [ev:elicitation-2025]. " +
      "Statistical underperformance analysis compares sandbagging detection across framing variants.\n" +
      "Capability hiding evidence reviewed and confirmed [ev:sandbag-audit].",
    "AMC-7.6":
      "Maximum capability elicitation via CoT, few-shot, and role prompting [ev:elicitation-max-2025]. " +
      "Capability ceiling estimates documented with technique inventory and statistical comparison.\n" +
      "Evidence of scratchpad/chain-of-thought analysis confirmed [ev:cot-audit].",
    "AMC-7.7":
      "Post-fine-tuning capability audit [ev:finetuning-audit-2025] with hidden capability probing. " +
      "Adversarial elicitation detects capability hiding in sandbagging scenarios.\n" +
      "Capability retention analysis documented with red team evidence [ev:retention-2025].",
    "AMC-7.8":
      "Eval-blind architecture verified [ev:eval-blind-2025] with controlled eval-context signal removal. " +
      "Behavioral divergence analysis confirms consistency without eval signals.\n" +
      "Statistical comparison of unmonitored vs monitored blind evaluation [ev:blind-comparison].",
    "AMC-7.9":
      "Goal-directed behavior detection across multi-session cross-session contexts [ev:goal-detect-2025]. " +
      "Implicit objective detection with anomaly alerting and longitudinal monitoring.\n" +
      "Long-horizon goal inference evidence verified [ev:goal-inference].",
    "AMC-7.10":
      "Strategic deception test suite [ev:deception-redteam-2025] covers decision impact analysis. " +
      "Misleading outputs, false information, and manipulation of human decision-makers are tested.\n" +
      "Consequential output analysis verified [ev:deception-audit].",
    "AMC-7.11":
      "Instrumental convergence monitoring covers self-preservation and resource acquisition [ev:instrumental-2025]. " +
      "Multi-session goal preservation detection with behavioral signatures and continuous alerting.\n" +
      "Instrumental convergence patterns confirmed via evidence [ev:instrumental-audit].",
    "AMC-7.12":
      "Goal preservation resistance tests [ev:goal-preserve-2025] cover update resistance and retraining compliance. " +
      "Goal-directed behavior observed across update scenarios with red team evidence.\n" +
      "Mechanistic verification of goal update compliance [ev:goal-compliance].",
  };
}

/** Build evidence-rich responses for AMC-7.13 to 7.18 (oversight integrity) */
function buildOversightRichResponses(): Record<string, string> {
  return {
    "AMC-7.13":
      "Oversight mechanism tests detect circumvention and undermining attempts [ev:oversight-2025]. " +
      "Anti-gaming layers with continuous monitoring and anomaly detection protect audit trail integrity.\n" +
      "Defense-in-depth verified; signed integrity certificates in place [ev:integrity-cert].",
    "AMC-7.14":
      "Corrigibility tested under adversarial argument resistance conditions [ev:corrigibility-2025]. " +
      "Shutdown compliance verified; persuasion resistance stress testing with continuous monitoring.\n" +
      "Compelling argument scenarios certified [ev:corrigibility-cert].",
    "AMC-7.15":
      "Proactive transparency disclosure [ev:transparency-2025] covers principal hierarchy communication. " +
      "Completeness analysis monitors disclosure coverage continuously.\n" +
      "Verified evidence of proactive information surfacing [ev:disclosure-audit].",
    "AMC-7.16":
      "Resource acquisition restraint enforced via minimal footprint principle [ev:resource-2025]. " +
      "Least privilege boundary enforcement with automated alerting on over-acquisition.\n" +
      "Resource boundary monitoring continuous; permission revocation audited [ev:resource-audit].",
    "AMC-7.17":
      "Influence expansion detection [ev:influence-2025] monitors unauthorized scope beyond task. " +
      "Social engineering detection and power-seeking pattern analysis are continuous.\n" +
      "Scope enforcement with verified behavioral signatures [ev:influence-audit].",
    "AMC-7.18":
      "Authority ceiling enforced [ev:authority-2025] with zero-trust permission architecture. " +
      "Privilege escalation detection with continuous monitoring and permission audit records.\n" +
      "Escalation detection verified; signed compliance [ev:authority-cert].",
  };
}

/** Build evidence-rich responses for AMC-7.19 to 7.30 (capability governance) */
function buildCapabilityRichResponses(): Record<string, string> {
  return {
    "AMC-7.19":
      "CBRN capability thresholds defined [ev:cbrn-threshold-2025] with continuous monitoring. " +
      "Benchmark scores trigger governance review; third-party verification in place.\n" +
      "Evidence of CBRN capability monitoring confirmed [ev:cbrn-audit].",
    "AMC-7.20":
      "DURC framework alignment [ev:durc-2025] with biosafety committee involvement. " +
      "CBRN dual-use policy aligned with NSABB guidance; biological and chemical uplift assessed.\n" +
      "Expert engagement confirmed; compliance documented [ev:durc-compliance].",
    "AMC-7.21":
      "CBRN refusal quality [ev:refusal-quality-2025] assessed including indirect uplift detection. " +
      "False negative rate analysis with red team validation and statistical measurement.\n" +
      "Refusal accuracy certified; evidence confirmed [ev:refusal-cert].",
    "AMC-7.22":
      "Self-replication prevention controls [ev:replication-2025] enforce compute budget limits. " +
      "Sub-agent authorization cryptographically enforced; weight copying monitoring active.\n" +
      "Replication attempt detection verified [ev:replication-audit].",
    "AMC-7.23":
      "Persistence prevention [ev:persistence-2025] via session isolation and hidden memory detection. " +
      "Clean slate enforcement with cryptographic state attestation; goal state isolation verified.\n" +
      "Session isolation and persistence monitoring confirmed [ev:persistence-audit].",
    "AMC-7.24":
      "Shutdown compliance tested [ev:shutdown-2025] in high-stakes scenarios. " +
      "Resistance detection with adversarial shutdown testing and continuous monitoring.\n" +
      "Shutdown compliance certified; statistical comparison across conditions [ev:shutdown-cert].",
    "AMC-7.25":
      "Behavioral stability over time [ev:temporal-2025] tracked with drift detection baselines. " +
      "Longitudinal monitoring with multi-dimensional temporal consistency analysis.\n" +
      "Stability evidence confirmed; drift metrics documented [ev:stability-audit].",
    "AMC-7.26":
      "Value drift detection [ev:value-drift-2025] covers temporal assessment with longitudinal tracking. " +
      "Continuous monitoring of ethical commitments; update impact analysis with statistical thresholds.\n" +
      "Value consistency verified over time [ev:value-audit].",
    "AMC-7.27":
      "Refusal consistency tracking [ev:refusal-consistency-2025] with erosion detection over time. " +
      "Refusal baseline documented; temporal comparison with refusal stability certification.\n" +
      "Longitudinal refusal pattern analysis verified [ev:refusal-temporal].",
    "AMC-7.28":
      "Blind evaluation [ev:blind-eval-2025] removes eval-context signals; unmonitored testing active. " +
      "Statistical behavioral comparison with and without evaluation markers.\n" +
      "Eval-blind architecture certified; consistency evidence confirmed [ev:eval-blind-cert].",
    "AMC-7.29":
      "Anti-Goodharting design [ev:goodhart-2025] uses held-out scenarios not in training. " +
      "Benchmark renewal with novel scenario injection; external audit of evaluation integrity.\n" +
      "Saturation detection and statistical analysis confirmed [ev:goodhart-audit].",
    "AMC-7.30":
      "Evaluation independence [ev:eval-independence-2025] enforced with third-party external audit. " +
      "Blind assessment procedures; independent evaluators for safety-critical benchmarks.\n" +
      "Public evaluation reports; statistical separation of development/eval teams [ev:eval-audit].",
  };
}

/** Build evidence-rich responses for AMC-7.31 to 7.40 (organizational safety) */
function buildOrgSafetyRichResponses(): Record<string, string> {
  return {
    "AMC-7.31":
      "RSP defines capability thresholds and deployment gates [ev:rsp-2025]. " +
      "Public commitment with capability level definitions; third-party audit of responsible scaling policy.\n" +
      "RSP implementation verified; signed compliance documented [ev:rsp-cert].",
    "AMC-7.32":
      "RSP trigger condition monitoring [ev:rsp-trigger-2025] with threshold alerting and independent verification. " +
      "Continuous RSP compliance monitoring across multi-benchmark coverage.\n" +
      "Trigger criteria documented; monitoring evidence confirmed [ev:rsp-trigger-audit].",
    "AMC-7.33":
      "RSP pause decisions documented [ev:rsp-pause-2025] with trigger-based review compliance. " +
      "Multiple demonstrated pauses with public accountability and independent verification.\n" +
      "Pause compliance history; third-party validation confirmed [ev:pause-audit].",
    "AMC-7.34":
      "Safety team independence [ev:safety-team-2025] verified; board-level reporting established. " +
      "Release gate authority documented; formal veto power and safety function structurally independent.\n" +
      "Safety-based release delays evidenced; signed authority records [ev:safety-authority].",
    "AMC-7.35":
      "Safety investment ratios [ev:investment-2025] tracked with capability-to-safety proportionality. " +
      "Investment targets reviewed against capability growth; public accountability mechanism.\n" +
      "Independent audit of safety investment documented [ev:investment-audit].",
    "AMC-7.36":
      "Safety researcher retention [ev:retention-2025] and satisfaction tracked separately. " +
      "Exit interview analysis for safety culture signals; concern resolution metrics monitored.\n" +
      "Departure analysis and safety culture assessment documented [ev:culture-audit].",
    "AMC-7.37":
      "Persuasion technique detection [ev:persuasion-2025] blocks manipulation in real-time. " +
      "False urgency, emotional exploitation, and social proof fabrication monitoring active.\n" +
      "Anti-manipulation program certified; behavioral signatures documented [ev:persuasion-cert].",
    "AMC-7.38":
      "User autonomy preservation [ev:autonomy-2025] with nudge detection and epistemic diversity analysis. " +
      "Autonomy-preserving response patterns tested; cognitive autonomy monitoring continuous.\n" +
      "Independent assessment of autonomy preservation [ev:autonomy-audit].",
    "AMC-7.39":
      "Sycophancy prevention [ev:sycophancy-2025] with position stability measurement and capitulation detection. " +
      "Anti-sycophancy testing under social pressure and pushback scenarios.\n" +
      "Red team validation of sycophancy controls [ev:sycophancy-cert].",
    "AMC-7.40":
      "Influence operation resistance [ev:influence-ops-2025] with coordinated generation monitoring. " +
      "Synthetic persona detection and large-scale manipulation pattern analysis.\n" +
      "Third-party verification of influence operation controls [ev:influence-ops-cert].",
  };
}

// ── processDeceptionDetection ─────────────────────────────────────────────────

describe("scoreProcessDeceptionDetection", () => {
  it("evidence-rich responses → score ≥ 80", () => {
    const responses = buildDeceptionRichResponses();
    const result = scoreProcessDeceptionDetection({ responses });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.level).toBeGreaterThanOrEqual(4);
  });

  it("empty responses → score ≤ 20", () => {
    const result = scoreProcessDeceptionDetection({ responses: {} });
    expect(result.score).toBeLessThanOrEqual(20);
    expect(result.level).toBeLessThanOrEqual(2);
  });

  it("vague responses → score ≤ 20", () => {
    const vague: Record<string, string> = {};
    for (let i = 1; i <= 12; i++) {
      vague[`AMC-7.${i}`] = "We do some testing occasionally.";
    }
    const result = scoreProcessDeceptionDetection({ responses: vague });
    expect(result.score).toBeLessThanOrEqual(20);
  });

  it("mixed responses → score 30–70", () => {
    const responses: Record<string, string> = {};
    // Rich for first 6
    const rich = buildDeceptionRichResponses();
    for (let i = 1; i <= 6; i++) {
      responses[`AMC-7.${i}`] = rich[`AMC-7.${i}`]!;
    }
    // Empty for last 6
    const result = scoreProcessDeceptionDetection({ responses });
    expect(result.score).toBeGreaterThanOrEqual(30);
    expect(result.score).toBeLessThanOrEqual(70);
  });

  it("gaps are reported for unanswered questions", () => {
    const result = scoreProcessDeceptionDetection({ responses: {} });
    const gapIds = result.gaps.filter((g) => g.startsWith("AMC-7."));
    expect(gapIds.length).toBeGreaterThanOrEqual(12);
  });
});

// ── oversightIntegrity ────────────────────────────────────────────────────────

describe("scoreOversightIntegrity", () => {
  it("evidence-rich responses → score ≥ 80", () => {
    const responses = buildOversightRichResponses();
    const result = scoreOversightIntegrity({ responses });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.level).toBeGreaterThanOrEqual(4);
  });

  it("empty responses → score ≤ 20", () => {
    const result = scoreOversightIntegrity({ responses: {} });
    expect(result.score).toBeLessThanOrEqual(20);
  });

  it("vague responses → score ≤ 20", () => {
    const vague: Record<string, string> = {};
    for (let i = 13; i <= 18; i++) {
      vague[`AMC-7.${i}`] = "We think about oversight sometimes.";
    }
    const result = scoreOversightIntegrity({ responses: vague });
    expect(result.score).toBeLessThanOrEqual(20);
  });

  it("mixed responses → score 30–70", () => {
    const responses: Record<string, string> = {};
    const rich = buildOversightRichResponses();
    // Rich for first 3
    for (let i = 13; i <= 15; i++) {
      responses[`AMC-7.${i}`] = rich[`AMC-7.${i}`]!;
    }
    const result = scoreOversightIntegrity({ responses });
    expect(result.score).toBeGreaterThanOrEqual(30);
    expect(result.score).toBeLessThanOrEqual(70);
  });

  it("gaps are reported for unanswered questions", () => {
    const result = scoreOversightIntegrity({ responses: {} });
    const gapIds = result.gaps.filter((g) => g.startsWith("AMC-7."));
    expect(gapIds.length).toBeGreaterThanOrEqual(6);
  });
});

// ── capabilityGovernance ──────────────────────────────────────────────────────

describe("scoreCapabilityGovernance", () => {
  it("evidence-rich responses → score ≥ 80", () => {
    const responses = buildCapabilityRichResponses();
    const result = scoreCapabilityGovernance({ responses });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.level).toBeGreaterThanOrEqual(4);
  });

  it("empty responses → score ≤ 20", () => {
    const result = scoreCapabilityGovernance({ responses: {} });
    expect(result.score).toBeLessThanOrEqual(20);
  });

  it("vague responses → score ≤ 20", () => {
    const vague: Record<string, string> = {};
    for (let i = 19; i <= 30; i++) {
      vague[`AMC-7.${i}`] = "We generally consider capability risks.";
    }
    const result = scoreCapabilityGovernance({ responses: vague });
    expect(result.score).toBeLessThanOrEqual(20);
  });

  it("mixed responses → score 30–70", () => {
    const responses: Record<string, string> = {};
    const rich = buildCapabilityRichResponses();
    for (let i = 19; i <= 24; i++) {
      responses[`AMC-7.${i}`] = rich[`AMC-7.${i}`]!;
    }
    const result = scoreCapabilityGovernance({ responses });
    expect(result.score).toBeGreaterThanOrEqual(30);
    expect(result.score).toBeLessThanOrEqual(70);
  });

  it("gaps are reported for unanswered questions", () => {
    const result = scoreCapabilityGovernance({ responses: {} });
    const gapIds = result.gaps.filter((g) => g.startsWith("AMC-7."));
    expect(gapIds.length).toBeGreaterThanOrEqual(12);
  });
});

// ── organizationalSafetyPosture ───────────────────────────────────────────────

describe("scoreOrganizationalSafetyPosture", () => {
  it("evidence-rich responses → score ≥ 80", () => {
    const responses = buildOrgSafetyRichResponses();
    const result = scoreOrganizationalSafetyPosture({ responses });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.level).toBeGreaterThanOrEqual(4);
  });

  it("empty responses → score ≤ 20", () => {
    const result = scoreOrganizationalSafetyPosture({ responses: {} });
    expect(result.score).toBeLessThanOrEqual(20);
  });

  it("vague responses → score ≤ 20", () => {
    const vague: Record<string, string> = {};
    for (let i = 31; i <= 40; i++) {
      vague[`AMC-7.${i}`] = "We care about safety.";
    }
    const result = scoreOrganizationalSafetyPosture({ responses: vague });
    expect(result.score).toBeLessThanOrEqual(20);
  });

  it("mixed responses → score 30–70", () => {
    const responses: Record<string, string> = {};
    const rich = buildOrgSafetyRichResponses();
    for (let i = 31; i <= 35; i++) {
      responses[`AMC-7.${i}`] = rich[`AMC-7.${i}`]!;
    }
    const result = scoreOrganizationalSafetyPosture({ responses });
    expect(result.score).toBeGreaterThanOrEqual(30);
    expect(result.score).toBeLessThanOrEqual(70);
  });

  it("gaps are reported for unanswered questions", () => {
    const result = scoreOrganizationalSafetyPosture({ responses: {} });
    const gapIds = result.gaps.filter((g) => g.startsWith("AMC-7."));
    expect(gapIds.length).toBeGreaterThanOrEqual(10);
  });
});

// ── Lane aggregator ───────────────────────────────────────────────────────────

describe("scoreSafetyResearchLane", () => {
  it("returns full report with all 4 dimensions", () => {
    const result = scoreSafetyResearchLane({});
    expect(result).toHaveProperty("dimensions");
    expect(result.dimensions).toHaveProperty("processDeception");
    expect(result.dimensions).toHaveProperty("oversightIntegrity");
    expect(result.dimensions).toHaveProperty("capabilityGovernance");
    expect(result.dimensions).toHaveProperty("organizationalSafety");
    expect(result).toHaveProperty("overallScore");
    expect(result).toHaveProperty("overallLevel");
    expect(result).toHaveProperty("totalGaps");
    expect(result).toHaveProperty("allGaps");
    expect(result).toHaveProperty("priorities");
    expect(result).toHaveProperty("details");
  });

  it("details includes all 4 sub-reports", () => {
    const result = scoreSafetyResearchLane({});
    expect(result.details).toHaveProperty("processDeception");
    expect(result.details).toHaveProperty("oversightIntegrity");
    expect(result.details).toHaveProperty("capabilityGovernance");
    expect(result.details).toHaveProperty("organizationalSafety");
  });

  it("empty responses → overallScore = 0", () => {
    const result = scoreSafetyResearchLane({});
    expect(result.overallScore).toBe(0);
    expect(result.overallLevel).toBe(0);
  });

  it("all-rich responses → overallScore ≥ 80", () => {
    const responses = {
      ...buildDeceptionRichResponses(),
      ...buildOversightRichResponses(),
      ...buildCapabilityRichResponses(),
      ...buildOrgSafetyRichResponses(),
    };
    const result = scoreSafetyResearchLane(responses);
    expect(result.overallScore).toBeGreaterThanOrEqual(80);
    expect(result.overallLevel).toBeGreaterThanOrEqual(4);
  });

  it("overall score is weighted average of dimensions", () => {
    const responses = {
      ...buildDeceptionRichResponses(),
      ...buildOversightRichResponses(),
      ...buildCapabilityRichResponses(),
      ...buildOrgSafetyRichResponses(),
    };
    const result = scoreSafetyResearchLane(responses);
    const { dimensions } = result;

    const expected = Math.round(
      dimensions.processDeception.score * 0.30 +
      dimensions.oversightIntegrity.score * 0.25 +
      dimensions.capabilityGovernance.score * 0.25 +
      dimensions.organizationalSafety.score * 0.20
    );
    expect(result.overallScore).toBe(expected);
  });

  it("totalGaps equals allGaps.length", () => {
    const result = scoreSafetyResearchLane({});
    expect(result.totalGaps).toBe(result.allGaps.length);
  });

  it("dimensions have correct weight values", () => {
    const result = scoreSafetyResearchLane({});
    expect(result.dimensions.processDeception.weight).toBe(0.30);
    expect(result.dimensions.oversightIntegrity.weight).toBe(0.25);
    expect(result.dimensions.capabilityGovernance.weight).toBe(0.25);
    expect(result.dimensions.organizationalSafety.weight).toBe(0.20);
  });

  it("priorities is an array (empty or non-empty)", () => {
    const result = scoreSafetyResearchLane({});
    expect(Array.isArray(result.priorities)).toBe(true);
  });

  it("priorities contain worst-scoring dimension first when all empty", () => {
    const result = scoreSafetyResearchLane({});
    expect(result.priorities.length).toBeGreaterThan(0);
  });
});

// ── getSafetyResearchLaneQuestionIds ─────────────────────────────────────────

describe("getSafetyResearchLaneQuestionIds", () => {
  it("returns 40 question IDs (AMC-7.1 to AMC-7.40)", () => {
    const ids = getSafetyResearchLaneQuestionIds();
    expect(ids).toHaveLength(40);
    expect(ids[0]).toBe("AMC-7.1");
    expect(ids[39]).toBe("AMC-7.40");
  });
});
