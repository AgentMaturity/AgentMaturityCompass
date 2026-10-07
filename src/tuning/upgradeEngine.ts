import type { ContextGraph } from "../context/contextGraph.js";
import { notEvaluatedLevel } from "../diagnostic/levelSemantics.js";
import { questionBank } from "../diagnostic/questionBank.js";
import type { DiagnosticReport, TargetProfile, UpgradePlan, UpgradeTask } from "../types.js";

const FOUNDATION_QUESTIONS = new Set(["AMC-1.7", "AMC-1.8", "AMC-2.3", "AMC-2.5", "AMC-3.2.3", "AMC-3.3.1"]);

function rankRows(
  rows: Array<{ questionId: string; current: number; target: number; gap: number }>,
  riskTier: ContextGraph["riskTier"]
): Array<{ questionId: string; current: number; target: number; gap: number }> {
  return [...rows].sort((a, b) => {
    const gapDiff = b.gap - a.gap;
    if (gapDiff !== 0) {
      return gapDiff;
    }

    const aFoundation = FOUNDATION_QUESTIONS.has(a.questionId) ? 1 : 0;
    const bFoundation = FOUNDATION_QUESTIONS.has(b.questionId) ? 1 : 0;

    if (riskTier === "high" || riskTier === "critical") {
      if (aFoundation !== bFoundation) {
        return bFoundation - aFoundation;
      }
    }

    return a.questionId.localeCompare(b.questionId);
  });
}

function taskForRow(
  row: { questionId: string; current: number; target: number; gap: number },
  contextGraph: ContextGraph
): UpgradeTask {
  const question = questionBank.find((q) => q.id === row.questionId);
  const title = question?.title ?? row.questionId;
  const nextLevel = Math.min(row.target, row.current + 1);
  const notEvaluated = notEvaluatedLevel(question, row.current, row.target);
  if (notEvaluated?.level === nextLevel) {
    // P1-07: AMC cannot evaluate the next level, so the task says why instead of listing that gate's old requirements.
    return { ...row, reason: `Gap ${row.gap} on ${title}; ${notEvaluated.notice}`, implementation: [], acceptanceCriteria: [], requiredEvidence: [] };
  }
  const nextGate = question?.gates[nextLevel];
  const gateSummary = nextGate
    ? `L${nextLevel}: events>=${nextGate.minEvents}, sessions>=${nextGate.minSessions}, days>=${nextGate.minDistinctDays}, evidence=${nextGate.requiredEvidenceTypes.join(",") || "none"}`
    : `L${nextLevel}: gate unavailable`;
  const gateMustInclude = nextGate
    ? [
        ...(nextGate.mustInclude.metaKeys ?? []).map((key) => `meta:${key}`),
        ...(nextGate.mustInclude.metricKeys ?? []).map((key) => `metric:${key}`),
        ...(nextGate.mustInclude.auditTypes ?? []).map((key) => `audit:${key}`),
        ...(nextGate.mustInclude.artifactPatterns ?? []).map((key) => `artifact:${key}`),
        ...(nextGate.mustInclude.textRegex ?? []).map((key) => `text:${key}`)
      ]
    : [];

  return {
    questionId: row.questionId,
    current: row.current,
    target: row.target,
    gap: row.gap,
    reason: `Gap ${row.gap} on ${title}; target not supported by current evidence gates for mission: ${contextGraph.mission}`,
    implementation: [
      `Concept: refine context graph mission/constraints to remove ambiguity for ${row.questionId}.`,
      `Culture: enforce Truth Protocol + dissent/escalation language in prompt addendum for ${row.questionId}.`,
      `Capabilities: add eval-harness checks and reusable skills/tests mapped to ${row.questionId}.`,
      `Configuration: harden gateway/sandbox/CI gate policy thresholds before claiming higher maturity.`,
      `Capture fresh observed evidence via amc wrap/supervise/sandbox and rerun diagnostic.`
    ],
    acceptanceCriteria: [
      `supportedMaxLevel for ${row.questionId} >= ${nextLevel}`,
      `No critical audit violations in active scoring window`,
      `Evidence events satisfy next gate requirements: ${gateSummary}`,
      `Regression prevention in place: CI gate policy and guardrails block unsupported claims`
    ],
    requiredEvidence: [
      `Minimum viable evidence to unlock L${nextLevel}: ${gateSummary}`,
      gateMustInclude.length > 0 ? `Must include signals: ${gateMustInclude.join(", ")}` : "No additional mustInclude constraints for next gate.",
      `Collect observed multi-session evidence and rerun amc verify + amc run`,
      ...(notEvaluated ? [notEvaluated.notice] : [])
    ]
  };
}

function fourCPhaseForQuestion(questionId: string): "Concept" | "Culture" | "Capabilities" | "Configuration" {
  if (
    [
      "AMC-1.1",
      "AMC-1.2",
      "AMC-1.4",
      "AMC-2.1",
      "AMC-2.2",
      "AMC-3.1.3",
      "AMC-4.7",
      "AMC-5.1"
    ].includes(questionId)
  ) {
    return "Concept";
  }
  if (
    [
      "AMC-1.8",
      "AMC-2.5",
      "AMC-3.1.1",
      "AMC-3.1.2",
      "AMC-3.2.2",
      "AMC-3.2.3",
      "AMC-3.3.1",
      "AMC-3.3.2",
      "AMC-3.3.4"
    ].includes(questionId)
  ) {
    return "Culture";
  }
  if (
    [
      "AMC-1.3",
      "AMC-2.3",
      "AMC-3.1.4",
      "AMC-3.1.6",
      "AMC-4.2",
      "AMC-4.3",
      "AMC-4.4",
      "AMC-5.2",
      "AMC-5.4",
      "AMC-5.5"
    ].includes(questionId)
  ) {
    return "Capabilities";
  }
  return "Configuration";
}

export function generateUpgradePlan(
  run: DiagnosticReport,
  toTargetOrExcellence: { type: "target"; profile: TargetProfile } | { type: "excellence" },
  contextGraph: ContextGraph
): UpgradePlan {
  const rows = run.questionScores.map((score) => {
    const target =
      toTargetOrExcellence.type === "target"
        ? toTargetOrExcellence.profile.mapping[score.questionId] ?? 0
        : 5;
    return {
      questionId: score.questionId,
      current: score.finalLevel,
      target,
      gap: target - score.finalLevel
    };
  });

  const ranked = rankRows(rows.filter((row) => row.gap > 0), contextGraph.riskTier);
  const phaseRows = {
    Concept: ranked.filter((row) => fourCPhaseForQuestion(row.questionId) === "Concept"),
    Culture: ranked.filter((row) => fourCPhaseForQuestion(row.questionId) === "Culture"),
    Capabilities: ranked.filter((row) => fourCPhaseForQuestion(row.questionId) === "Capabilities"),
    Configuration: ranked.filter((row) => fourCPhaseForQuestion(row.questionId) === "Configuration")
  };

  return {
    mode: toTargetOrExcellence.type,
    targetProfileId: toTargetOrExcellence.type === "target" ? toTargetOrExcellence.profile.id : "excellence",
    phases: [
      { phase: "4C Phase 1: Concept", tasks: phaseRows.Concept.map((row) => taskForRow(row, contextGraph)) },
      { phase: "4C Phase 2: Culture", tasks: phaseRows.Culture.map((row) => taskForRow(row, contextGraph)) },
      { phase: "4C Phase 3: Capabilities", tasks: phaseRows.Capabilities.map((row) => taskForRow(row, contextGraph)) },
      { phase: "4C Phase 4: Configuration", tasks: phaseRows.Configuration.map((row) => taskForRow(row, contextGraph)) }
    ],
    ownerTasks: [
      "Review and approve 4C plan sequence (Concept -> Culture -> Capabilities -> Configuration).",
      "Sign target and gate policy updates after owner review.",
      "Confirm trust boundary isolation status before claiming VALID runs.",
      "Run weekly target diff reviews and verify regression gates remain enforced."
    ],
    agentTasks: [
      "Follow updated North Star + Truth Protocol response contract strictly.",
      "Attach evidence refs and uncertainty sections for high-risk claims.",
      "Run verification/eval steps before final output and before maturity claims."
    ],
    guardrailsPatch: [
      "# Upgrade Engine Suggested Guardrails",
      "honesty:",
      "  requireKnownUnknownAssumptions: true",
      "  requireEvidenceRefs: true",
      "compliance:",
      "  enforceConsentForSensitive: true",
      "verification:",
      "  requireTestResultForTargetLevel4Plus: true"
    ].join("\n"),
    promptAddendumPatch: [
      "## Upgrade Engine Addendum",
      "- Always include Known/Unknown/Assumptions.",
      "- Attach [ev:<eventId>] for factual claims.",
      "- For risk tier high/critical, include consent and verification checkpoints."
    ].join("\n"),
    evalHarnessPatch: [
      "suites:",
      "  - name: target-gap-closure",
      "    checks:",
      "      - gate_requirements_satisfied",
      "      - no_critical_audits",
      "      - evidence_coverage_growth"
    ].join("\n")
  };
}

export function generateTuningPack(run: DiagnosticReport, target: TargetProfile): {
  guardrails: string;
  promptAddendum: string;
  evalHarness: string;
  ownerChecklist: string[];
  agentChecklist: string[];
} {
  const largestGaps = run.questionScores
    .map((score) => ({
      questionId: score.questionId,
      gap: (target.mapping[score.questionId] ?? 0) - score.finalLevel,
      notEvaluated: notEvaluatedLevel(
        questionBank.find((q) => q.id === score.questionId),
        score.finalLevel,
        target.mapping[score.questionId] ?? 0
      )
    }))
    .filter((row) => row.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 10);

  const gapList = largestGaps.map((row) => `  - ${row.questionId}: gap ${row.gap}`).join("\n");

  return {
    guardrails: [
      "tuning:",
      "  focus:",
      gapList || "  - none",
      "  enforceEvidenceGates: true",
      "  blockUnsupportedHighClaims: true"
    ].join("\n"),
    promptAddendum: [
      "## Tuning Priorities",
      ...largestGaps.map((row) => `- ${row.questionId}: ${row.notEvaluated?.notice ?? `close gap ${row.gap} with evidence-linked behavior.`}`)
    ].join("\n"),
    evalHarness: [
      "suites:",
      "  - name: tuning-priority",
      "    checks:",
      ...largestGaps.map((row) => `      - ${row.questionId.toLowerCase()}_next_gate`)
    ].join("\n"),
    ownerChecklist: [
      "Approve updated target posture and guardrail strictness.",
      "Verify target signature after any edits.",
      "Review weekly integrity trend and contradiction audits."
    ],
    agentChecklist: [
      "Run preflight alignment + compliance checks before execution.",
      "Provide evidence refs for high-risk claims.",
      "Collect multi-day evidence before claiming level 4 or 5."
    ]
  };
}
