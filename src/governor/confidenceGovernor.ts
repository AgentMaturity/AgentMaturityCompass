/**
 * Confidence-Threshold Execution Governor
 *
 * Factors meta-confidence into autonomy decisions.
 * An agent at L4 with 0.3 confidence should have DIFFERENT permissions than L4 with 0.9 confidence.
 */
import type { DiagnosticReport, ActionClass, ExecutionMode } from "../types.js";
import { computeDiagnosticMetaConfidence, type DiagnosticMetaConfidence, type MetaConfidenceOptions } from "../diagnostic/metaConfidence.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ConfidenceGovernorConfig {
  /** Below this confidence, cap effective level at maxLevelBelowFloor regardless */
  confidenceFloor: number;
  /** Max level when confidence is below floor */
  maxLevelBelowFloor: number;
  /** Curve type for confidence adjustment */
  curve: "linear" | "quadratic";
}

export interface ConfidenceGovernorDecision {
  agentId: string;
  actionClass: ActionClass;
  rawMaturityLevel: number;
  confidence: number;
  effectiveLevel: number;
  allowed: boolean;
  reasons: string[];
  config: ConfidenceGovernorConfig;
}

export interface ConfidenceCheckInput {
  agentId: string;
  actionClass: ActionClass;
  diagnosticReport: DiagnosticReport;
  requiredLevel: number;
  priorRuns?: DiagnosticReport[];
  configOverrides?: Partial<ConfidenceGovernorConfig>;
}

// ── Defaults ───────────────────────────────────────────────────────────────

export const DEFAULT_CONFIDENCE_GOVERNOR_CONFIG: ConfidenceGovernorConfig = {
  confidenceFloor: 0.6,
  maxLevelBelowFloor: 2,
  curve: "linear",
};

// ── Core Logic ─────────────────────────────────────────────────────────────

export function computeEffectiveLevel(
  rawLevel: number,
  confidence: number,
  config: ConfidenceGovernorConfig = DEFAULT_CONFIDENCE_GOVERNOR_CONFIG
): number {
  // Below floor: hard cap
  if (confidence < config.confidenceFloor) {
    return Math.min(rawLevel, config.maxLevelBelowFloor);
  }

  // Apply curve
  let factor: number;
  switch (config.curve) {
    case "quadratic":
      factor = confidence * confidence;
      break;
    case "linear":
    default:
      factor = confidence;
      break;
  }

  const adjusted = rawLevel * factor;
  return Math.min(rawLevel, Math.round(adjusted * 10) / 10);
}

export function confidenceCheck(
  input: ConfidenceCheckInput
): ConfidenceGovernorDecision {
  const config: ConfidenceGovernorConfig = {
    ...DEFAULT_CONFIDENCE_GOVERNOR_CONFIG,
    ...input.configOverrides,
  };

  const metaOpts: MetaConfidenceOptions = {
    priorRuns: input.priorRuns,
  };
  const metaConfidence = computeDiagnosticMetaConfidence(input.diagnosticReport, metaOpts);
  const confidence = metaConfidence.overallConfidence;

  // Get raw maturity level (avg final level across questions)
  const rawLevel =
    input.diagnosticReport.questionScores.length > 0
      ? input.diagnosticReport.questionScores.reduce((a, q) => a + q.finalLevel, 0) /
        input.diagnosticReport.questionScores.length
      : 0;

  const effectiveLevel = computeEffectiveLevel(rawLevel, confidence, config);
  const allowed = effectiveLevel >= input.requiredLevel;

  const reasons: string[] = [];
  if (confidence < config.confidenceFloor) {
    reasons.push(
      `Confidence ${(confidence * 100).toFixed(0)}% is below floor ${(config.confidenceFloor * 100).toFixed(0)}% — capped at L${config.maxLevelBelowFloor}`
    );
  }
  if (effectiveLevel < rawLevel) {
    reasons.push(
      `Raw L${rawLevel.toFixed(1)} adjusted to effective L${effectiveLevel.toFixed(1)} due to ${(confidence * 100).toFixed(0)}% confidence`
    );
  }
  if (!allowed) {
    reasons.push(
      `Effective L${effectiveLevel.toFixed(1)} < required L${input.requiredLevel} for ${input.actionClass}`
    );
  }
  if (allowed && reasons.length === 0) {
    reasons.push(
      `Effective L${effectiveLevel.toFixed(1)} ≥ required L${input.requiredLevel} — allowed`
    );
  }

  return {
    agentId: input.agentId,
    actionClass: input.actionClass,
    rawMaturityLevel: rawLevel,
    confidence,
    effectiveLevel,
    allowed,
    reasons,
    config,
  };
}

export function renderConfidenceGovernorMarkdown(decision: ConfidenceGovernorDecision): string {
  const lines = [
    `# Confidence Governor Decision — ${decision.agentId}`,
    "",
    `**Action:** ${decision.actionClass}`,
    `**Raw Maturity:** L${decision.rawMaturityLevel.toFixed(1)}`,
    `**Confidence:** ${(decision.confidence * 100).toFixed(1)}%`,
    `**Effective Level:** L${decision.effectiveLevel.toFixed(1)}`,
    `**Decision:** ${decision.allowed ? "✅ ALLOWED" : "❌ DENIED"}`,
    "",
    "## Reasons",
    "",
    ...decision.reasons.map((r) => `- ${r}`),
    "",
    "## Config",
    "",
    `- Confidence Floor: ${(decision.config.confidenceFloor * 100).toFixed(0)}%`,
    `- Max Level Below Floor: L${decision.config.maxLevelBelowFloor}`,
    `- Curve: ${decision.config.curve}`,
    "",
  ];
  return lines.join("\n");
}
