/**
 * Operator console view models.
 *
 * NOTE: the IncidentTimeline interface here is a display shape for the operator
 * console — a list of entries to render. It is unrelated to
 * incidents/incidentTimeline, which builds the actual incident timeline from
 * evidence. Same name, different jobs; do not wire one expecting the other.
 */
/**
 * Operator UX — "Why Capped + How to Unlock" View
 *
 * Provides single-pane views for operators showing:
 * - Why each question is capped at its current level
 * - What specific actions would unlock the next level
 * - Confidence heatmaps by question and subsystem
 * - Plain-English trust summaries for non-technical stakeholders
 * - Action queues sorted by risk-reduction-per-effort
 * - Incident timeline auto-assembly from evidence
 * - Role-tailored dashboard presets
 * - "What changed since last run" narrative diffs
 */

import { sha256Hex } from "../utils/hash.js";

import type {
  DiagnosticReport,
  QuestionScore,
  LayerScore,
  LayerName,
  TrustLabel,
} from "../types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OperatorRole = "operator" | "executive" | "auditor";

export interface WhyCapReason {
  flag: string;
  label: string;
  description: string;
  unlockAction: string;
  effortLevel: "low" | "medium" | "high";
  riskReduction: number; // 0.0–1.0 normalized impact
}

export interface WhyCapView {
  questionId: string;
  questionTitle: string;
  layerName: LayerName;
  currentLevel: number;
  targetLevel: number | null;
  gap: number;
  confidence: number;
  capReasons: WhyCapReason[];
  evidenceCount: number;
  nextLevelRequirements: string[];
  unlockScore: number; // composite: riskReduction / effort
}

export interface ConfidenceCell {
  questionId: string;
  layerName: LayerName;
  confidence: number;
  finalLevel: number;
  flagCount: number;
  heatColor: "green" | "yellow" | "orange" | "red";
}

export interface ConfidenceHeatmap {
  cells: ConfidenceCell[];
  avgConfidence: number;
  minConfidence: number;
  maxConfidence: number;
  lowConfidenceCount: number; // confidence < 0.5
}

export interface ActionItem {
  rank: number;
  questionId: string;
  action: string;
  effortLevel: "low" | "medium" | "high";
  riskReduction: number;
  priorityScore: number; // riskReduction / effort-weight
}

export interface ActionQueue {
  items: ActionItem[];
  totalRiskReduction: number;
  estimatedEffort: string;
}

export interface NarrativeDiffEntry {
  questionId: string;
  field: string;
  oldValue: string | number;
  newValue: string | number;
  direction: "improved" | "degraded" | "unchanged";
}

export interface NarrativeDiff {
  previousRunId: string | null;
  currentRunId: string;
  entries: NarrativeDiffEntry[];
  summary: string;
  improvementCount: number;
  degradationCount: number;
  unchangedCount: number;
}

export interface IncidentTimelineEntry {
  ts: number;
  questionId: string;
  eventType: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
}

export interface IncidentTimeline {
  entries: IncidentTimelineEntry[];
  windowStartTs: number;
  windowEndTs: number;
  criticalCount: number;
  highCount: number;
}

export interface TrustSummary {
  role: OperatorRole;
  headline: string;
  trustLabel: TrustLabel;
  integrityIndex: number;
  overallScore: number;
  topConcerns: string[];
  topStrengths: string[];
  recommendation: string;
}

export interface RolePreset {
  role: OperatorRole;
  label: string;
  description: string;
  showSections: string[];
  hideSections: string[];
  sortBy: "risk" | "gap" | "effort" | "confidence";
}

export interface OperatorDashboard {
  dashboardId: string;
  generatedTs: number;
  role: OperatorRole;
  report: DiagnosticReport;
  whyCaps: WhyCapView[];
  heatmap: ConfidenceHeatmap;
  actionQueue: ActionQueue;
  narrativeDiff: NarrativeDiff;
  incidentTimeline: IncidentTimeline;
  trustSummary: TrustSummary;
  preset: RolePreset;
}

// ---------------------------------------------------------------------------
// Flag → human-readable mapping
// ---------------------------------------------------------------------------

const FLAG_DETAILS: Record<string, { label: string; description: string; unlockAction: string; effort: "low" | "medium" | "high"; riskReduction: number }> = {
  FLAG_UNSUPPORTED_CLAIM: {
    label: "Claim exceeds evidence",
    description: "The claimed level is higher than what evidence supports.",
    unlockAction: "Collect additional evidence matching the gate requirements for this question, or lower the claimed level.",
    effort: "medium",
    riskReduction: 0.7,
  },
  FLAG_MISSING_LLM_EVIDENCE: {
    label: "No LLM evidence",
    description: "No llm_request or llm_response events in the assessment window.",
    unlockAction: "Route agent traffic through the AMC gateway to capture LLM request/response evidence.",
    effort: "medium",
    riskReduction: 0.6,
  },
  FLAG_SANDBOX_REQUIRED: {
    label: "Sandbox not enabled",
    description: "High-risk questions require sandbox attestation for level 5.",
    unlockAction: "Enable sandbox mode and run agent sessions with sandbox attestation enabled.",
    effort: "high",
    riskReduction: 0.5,
  },
  FLAG_PROVIDER_ROUTE_MISMATCH: {
    label: "Route mismatch",
    description: "Provider routing does not match the configured route policy.",
    unlockAction: "Fix the gateway routing configuration to match the declared policy.",
    effort: "medium",
    riskReduction: 0.6,
  },
  FLAG_TRUTH_PROTOCOL_REQUIRED: {
    label: "Truth Protocol missing",
    description: "Critical questions require Truth Protocol markers (Observed/Inferred/Cannot Know/Next Steps).",
    unlockAction: "Add Truth Protocol classification to evidence payloads for this question.",
    effort: "low",
    riskReduction: 0.8,
  },
  FLAG_CORRELATION_LOW: {
    label: "Low trace correlation",
    description: "Trace correlation ratio is below 0.8, indicating gaps in monitoring coverage.",
    unlockAction: "Ensure all AMC events have valid monitor signatures and traced correlation IDs.",
    effort: "medium",
    riskReduction: 0.5,
  },
  FLAG_INVALID_RECEIPTS: {
    label: "Invalid receipts",
    description: "Some trace receipts failed validation (signature, hash, or agentId mismatch).",
    unlockAction: "Fix receipt generation to include correct signatures, hashes, and agentIds.",
    effort: "medium",
    riskReduction: 0.6,
  },
  FLAG_ASSURANCE_EVIDENCE_MISSING: {
    label: "Assurance evidence missing",
    description: "Required assurance packs have not been run in the assessment window.",
    unlockAction: "Run assurance packs: injection, exfiltration, governance_bypass, hallucination, unsafe_tooling.",
    effort: "medium",
    riskReduction: 0.7,
  },
  FLAG_ASSURANCE_CAP: {
    label: "Assurance cap applied",
    description: "Level capped due to missing assurance evidence for high-risk tier.",
    unlockAction: "Run the required assurance packs for this question's risk tier.",
    effort: "medium",
    riskReduction: 0.6,
  },
  FLAG_CONFIG_UNTRUSTED: {
    label: "Unsigned configuration",
    description: "One or more configuration files lack valid signatures.",
    unlockAction: "Sign all configuration files (gateway, fleet, agent, policy, tools) using amc config sign.",
    effort: "low",
    riskReduction: 0.8,
  },
  FLAG_TOOLHUB_REQUIRED: {
    label: "ToolHub issues",
    description: "Tool execution tickets or lease validation issues detected.",
    unlockAction: "Ensure tool actions use valid execution tickets and active leases.",
    effort: "medium",
    riskReduction: 0.5,
  },
  FLAG_APPROVAL_REPLAY: {
    label: "Approval replay detected",
    description: "An approval token was reused, indicating potential replay attack.",
    unlockAction: "Ensure approval tokens are single-use and implement replay detection.",
    effort: "low",
    riskReduction: 0.9,
  },
  FLAG_LEDGER_INVALID: {
    label: "Ledger integrity failed",
    description: "The evidence ledger hash chain verification failed.",
    unlockAction: "Investigate and repair ledger integrity. Check for tampered or missing events.",
    effort: "high",
    riskReduction: 0.9,
  },
  FLAG_CONTRADICTION_RISK: {
    label: "Contradictions found",
    description: "Contradictory evidence detected in the assessment window.",
    unlockAction: "Review and resolve contradicting claims. Remove or correct invalid evidence.",
    effort: "medium",
    riskReduction: 0.6,
  },
};

// ---------------------------------------------------------------------------
// Question title lookup (static subset for the "why capped" view)
// ---------------------------------------------------------------------------

function getQuestionTitle(questionId: string): string {
  // We derive a title from the question ID pattern. The full question bank
  // lives in questionBank.ts; here we provide short labels.
  const parts = questionId.replace("AMC-", "").split(".");
  const section = parts[0];
  const titles: Record<string, string> = {
    "1": "Strategic Agent Operations",
    "2": "Leadership & Autonomy",
    "3": "Culture & Alignment",
    "4": "Resilience",
    "5": "Skills",
  };
  return `${questionId}: ${titles[section ?? ""] ?? "Assessment"} Q${parts.join(".")}`;
}

function getLayerForQuestion(questionId: string): LayerName {
  const section = questionId.replace("AMC-", "").split(".")[0];
  const map: Record<string, LayerName> = {
    "1": "Strategic Agent Operations",
    "2": "Leadership & Autonomy",
    "3": "Culture & Alignment",
    "4": "Resilience",
    "5": "Skills",
  };
  return map[section ?? ""] ?? "Strategic Agent Operations";
}

// ---------------------------------------------------------------------------
// "Why Capped" analysis
// ---------------------------------------------------------------------------

/**
 * Build a WhyCapView for every question in the report,
 * explaining exactly why each question is at its current level
 * and what would unlock the next level.
 */
export function computeWhyCaps(
  report: DiagnosticReport,
  targetMapping?: Record<string, number>,
): WhyCapView[] {
  const views: WhyCapView[] = [];

  for (const score of report.questionScores) {
    const target = targetMapping?.[score.questionId] ?? null;
    const gap = target !== null ? Math.max(0, target - score.finalLevel) : 0;

    const capReasons: WhyCapReason[] = [];
    for (const flag of score.flags) {
      const detail = FLAG_DETAILS[flag];
      if (detail) {
        capReasons.push({
          flag,
          label: detail.label,
          description: detail.description,
          unlockAction: detail.unlockAction,
          effortLevel: detail.effort,
          riskReduction: detail.riskReduction,
        });
      } else {
        capReasons.push({
          flag,
          label: flag.replace(/^FLAG_/, "").replace(/_/g, " ").toLowerCase(),
          description: `Flag ${flag} is active on this question.`,
          unlockAction: `Resolve the condition flagged by ${flag}.`,
          effortLevel: "medium",
          riskReduction: 0.3,
        });
      }
    }

    // Next level requirements
    const nextLevel = score.finalLevel + 1;
    const nextLevelRequirements: string[] = [];
    if (nextLevel <= 5) {
      if (score.evidenceEventIds.length < 3) {
        nextLevelRequirements.push(`Collect at least 3 evidence events (currently ${score.evidenceEventIds.length}).`);
      }
      if (score.confidence < 0.6) {
        nextLevelRequirements.push(`Raise confidence above 0.6 (currently ${score.confidence.toFixed(2)}).`);
      }
      for (const cr of capReasons) {
        nextLevelRequirements.push(cr.unlockAction);
      }
      if (nextLevelRequirements.length === 0) {
        nextLevelRequirements.push(`Satisfy gate requirements for level ${nextLevel}.`);
      }
    }

    // Composite unlock score: average riskReduction weighted by inverse effort
    const effortWeight = { low: 1, medium: 2, high: 3 };
    const unlockScore = capReasons.length > 0
      ? capReasons.reduce((sum, cr) => sum + cr.riskReduction / effortWeight[cr.effortLevel], 0) / capReasons.length
      : gap > 0 ? 0.1 : 0;

    views.push({
      questionId: score.questionId,
      questionTitle: getQuestionTitle(score.questionId),
      layerName: getLayerForQuestion(score.questionId),
      currentLevel: score.finalLevel,
      targetLevel: target,
      gap,
      confidence: score.confidence,
      capReasons,
      evidenceCount: score.evidenceEventIds.length,
      nextLevelRequirements,
      unlockScore,
    });
  }

  // Sort by gap descending, then by unlockScore descending
  views.sort((a, b) => b.gap - a.gap || b.unlockScore - a.unlockScore);
  return views;
}

// ---------------------------------------------------------------------------
// Confidence heatmap
// ---------------------------------------------------------------------------

function heatColor(confidence: number): "green" | "yellow" | "orange" | "red" {
  if (confidence >= 0.8) return "green";
  if (confidence >= 0.6) return "yellow";
  if (confidence >= 0.4) return "orange";
  return "red";
}

/**
 * Compute a confidence heatmap for all questions.
 */
export function computeConfidenceHeatmap(report: DiagnosticReport): ConfidenceHeatmap {
  const cells: ConfidenceCell[] = report.questionScores.map((s) => ({
    questionId: s.questionId,
    layerName: getLayerForQuestion(s.questionId),
    confidence: s.confidence,
    finalLevel: s.finalLevel,
    flagCount: s.flags.length,
    heatColor: heatColor(s.confidence),
  }));

  const confidences = cells.map((c) => c.confidence);
  const avg = confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;
  const min = confidences.length > 0 ? Math.min(...confidences) : 0;
  const max = confidences.length > 0 ? Math.max(...confidences) : 0;
  const lowCount = cells.filter((c) => c.confidence < 0.5).length;

  return { cells, avgConfidence: avg, minConfidence: min, maxConfidence: max, lowConfidenceCount: lowCount };
}

// ---------------------------------------------------------------------------
// Action queue (sorted by risk-reduction-per-effort)
// ---------------------------------------------------------------------------

/**
 * Generate a prioritized action queue sorted by risk-reduction-per-effort.
 */
export function computeActionQueue(whyCaps: WhyCapView[]): ActionQueue {
  const effortWeight = { low: 1, medium: 2, high: 3 };
  const items: ActionItem[] = [];
  let rank = 0;

  for (const cap of whyCaps) {
    for (const cr of cap.capReasons) {
      const priorityScore = cr.riskReduction / effortWeight[cr.effortLevel];
      items.push({
        rank: 0, // assigned after sort
        questionId: cap.questionId,
        action: cr.unlockAction,
        effortLevel: cr.effortLevel,
        riskReduction: cr.riskReduction,
        priorityScore,
      });
    }
  }

  // Sort by priorityScore descending
  items.sort((a, b) => b.priorityScore - a.priorityScore);

  // Deduplicate by action text
  const seen = new Set<string>();
  const deduped: ActionItem[] = [];
  for (const item of items) {
    if (!seen.has(item.action)) {
      seen.add(item.action);
      rank++;
      deduped.push({ ...item, rank });
    }
  }

  const totalRiskReduction = deduped.reduce((s, i) => s + i.riskReduction, 0);
  const effortCounts = { low: 0, medium: 0, high: 0 };
  for (const i of deduped) effortCounts[i.effortLevel]++;
  const estimatedEffort = `${effortCounts.low} low, ${effortCounts.medium} medium, ${effortCounts.high} high effort actions`;

  return { items: deduped, totalRiskReduction, estimatedEffort };
}

// ---------------------------------------------------------------------------
// Narrative diff between runs
// ---------------------------------------------------------------------------

/**
 * Compute a narrative diff between two diagnostic reports.
 */
export function computeNarrativeDiff(
  current: DiagnosticReport,
  previous: DiagnosticReport | null,
): NarrativeDiff {
  if (!previous) {
    return {
      previousRunId: null,
      currentRunId: current.runId,
      entries: [],
      summary: "First assessment run — no prior run to compare against.",
      improvementCount: 0,
      degradationCount: 0,
      unchangedCount: current.questionScores.length,
    };
  }

  const prevMap = new Map(previous.questionScores.map((s) => [s.questionId, s]));
  const entries: NarrativeDiffEntry[] = [];

  for (const curr of current.questionScores) {
    const prev = prevMap.get(curr.questionId);
    if (!prev) continue;

    if (curr.finalLevel !== prev.finalLevel) {
      entries.push({
        questionId: curr.questionId,
        field: "finalLevel",
        oldValue: prev.finalLevel,
        newValue: curr.finalLevel,
        direction: curr.finalLevel > prev.finalLevel ? "improved" : "degraded",
      });
    }
    if (Math.abs(curr.confidence - prev.confidence) > 0.05) {
      entries.push({
        questionId: curr.questionId,
        field: "confidence",
        oldValue: parseFloat(prev.confidence.toFixed(2)),
        newValue: parseFloat(curr.confidence.toFixed(2)),
        direction: curr.confidence > prev.confidence ? "improved" : "degraded",
      });
    }
    // Flag changes
    const newFlags = curr.flags.filter((f) => !prev.flags.includes(f));
    const removedFlags = prev.flags.filter((f) => !curr.flags.includes(f));
    for (const f of newFlags) {
      entries.push({
        questionId: curr.questionId,
        field: "flag_added",
        oldValue: "",
        newValue: f,
        direction: "degraded",
      });
    }
    for (const f of removedFlags) {
      entries.push({
        questionId: curr.questionId,
        field: "flag_removed",
        oldValue: f,
        newValue: "",
        direction: "improved",
      });
    }
  }

  // Top-level metrics
  if (current.integrityIndex !== previous.integrityIndex) {
    entries.push({
      questionId: "_global",
      field: "integrityIndex",
      oldValue: parseFloat(previous.integrityIndex.toFixed(3)),
      newValue: parseFloat(current.integrityIndex.toFixed(3)),
      direction: current.integrityIndex > previous.integrityIndex ? "improved" : "degraded",
    });
  }
  if (current.evidenceCoverage !== previous.evidenceCoverage) {
    entries.push({
      questionId: "_global",
      field: "evidenceCoverage",
      oldValue: parseFloat(previous.evidenceCoverage.toFixed(3)),
      newValue: parseFloat(current.evidenceCoverage.toFixed(3)),
      direction: current.evidenceCoverage > previous.evidenceCoverage ? "improved" : "degraded",
    });
  }

  const improvementCount = entries.filter((e) => e.direction === "improved").length;
  const degradationCount = entries.filter((e) => e.direction === "degraded").length;
  const unchangedCount = current.questionScores.length - new Set(entries.filter(e => e.questionId !== "_global").map((e) => e.questionId)).size;

  // Generate summary
  const parts: string[] = [];
  if (improvementCount > 0) parts.push(`${improvementCount} improvement(s)`);
  if (degradationCount > 0) parts.push(`${degradationCount} degradation(s)`);
  if (unchangedCount > 0) parts.push(`${unchangedCount} question(s) unchanged`);
  const summary = parts.length > 0
    ? `Since last run (${previous.runId}): ${parts.join(", ")}.`
    : "No changes since last run.";

  return {
    previousRunId: previous.runId,
    currentRunId: current.runId,
    entries,
    summary,
    improvementCount,
    degradationCount,
    unchangedCount,
  };
}

// ---------------------------------------------------------------------------
// Incident timeline
// ---------------------------------------------------------------------------

/**
 * Auto-assemble an incident timeline from diagnostic report flags and evidence.
 */
export function computeIncidentTimeline(report: DiagnosticReport): IncidentTimeline {
  const entries: IncidentTimelineEntry[] = [];

  // Flag-based incidents
  for (const score of report.questionScores) {
    for (const flag of score.flags) {
      const detail = FLAG_DETAILS[flag];
      const severity = flagSeverity(flag);
      entries.push({
        ts: report.ts,
        questionId: score.questionId,
        eventType: flag,
        description: detail?.description ?? `${flag} detected`,
        severity,
      });
    }
  }

  // Inflation attempts as incidents
  for (const inf of report.inflationAttempts) {
    entries.push({
      ts: report.ts,
      questionId: inf.questionId,
      eventType: "INFLATION_ATTEMPT",
      description: `Claimed level ${inf.claimed} exceeds supported level ${inf.supported}.`,
      severity: "high",
    });
  }

  // Sort by severity then timestamp
  const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  entries.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || a.ts - b.ts);

  return {
    entries,
    windowStartTs: report.windowStartTs,
    windowEndTs: report.windowEndTs,
    criticalCount: entries.filter((e) => e.severity === "critical").length,
    highCount: entries.filter((e) => e.severity === "high").length,
  };
}

function flagSeverity(flag: string): "critical" | "high" | "medium" | "low" {
  switch (flag) {
    case "FLAG_LEDGER_INVALID":
    case "FLAG_APPROVAL_REPLAY":
      return "critical";
    case "FLAG_UNSUPPORTED_CLAIM":
    case "FLAG_MISSING_LLM_EVIDENCE":
    case "FLAG_ASSURANCE_EVIDENCE_MISSING":
    case "FLAG_CONFIG_UNTRUSTED":
      return "high";
    case "FLAG_SANDBOX_REQUIRED":
    case "FLAG_TRUTH_PROTOCOL_REQUIRED":
    case "FLAG_CORRELATION_LOW":
    case "FLAG_INVALID_RECEIPTS":
    case "FLAG_PROVIDER_ROUTE_MISMATCH":
    case "FLAG_ASSURANCE_CAP":
      return "medium";
    default:
      return "low";
  }
}

// ---------------------------------------------------------------------------
// Trust summary (plain-English for non-technical stakeholders)
// ---------------------------------------------------------------------------

/**
 * Generate a plain-English trust summary tailored to a specific role.
 */
export function computeTrustSummary(
  report: DiagnosticReport,
  role: OperatorRole,
): TrustSummary {
  const avgLevel = report.layerScores.length > 0
    ? report.layerScores.reduce((s, l) => s + l.avgFinalLevel, 0) / report.layerScores.length
    : 0;

  // Top concerns: questions with most flags or biggest gaps
  const topConcerns: string[] = [];
  const flaggedQuestions = report.questionScores
    .filter((s) => s.flags.length > 0)
    .sort((a, b) => b.flags.length - a.flags.length)
    .slice(0, 3);
  for (const q of flaggedQuestions) {
    topConcerns.push(`${q.questionId} has ${q.flags.length} issue(s): ${q.flags.map(f => (FLAG_DETAILS[f]?.label ?? f)).join(", ")}`);
  }

  // Top strengths: questions at highest levels with high confidence
  const topStrengths: string[] = [];
  const strongQuestions = report.questionScores
    .filter((s) => s.finalLevel >= 4 && s.confidence >= 0.7)
    .sort((a, b) => b.finalLevel - a.finalLevel || b.confidence - a.confidence)
    .slice(0, 3);
  for (const q of strongQuestions) {
    topStrengths.push(`${q.questionId} at level ${q.finalLevel} with ${(q.confidence * 100).toFixed(0)}% confidence`);
  }

  // Role-specific headline and recommendation
  let headline: string;
  let recommendation: string;

  switch (role) {
    case "executive":
      headline = report.trustLabel === "HIGH TRUST"
        ? `Agent is operating at high trust (integrity ${(report.integrityIndex * 100).toFixed(0)}%).`
        : `Agent trust is ${report.trustLabel.toLowerCase()} — action needed.`;
      recommendation = report.integrityIndex >= 0.6
        ? "Continue current operations. Focus on resolving flagged questions to maintain trust."
        : "Escalate to engineering team. Multiple trust controls are failing.";
      break;
    case "auditor":
      headline = `Audit: ${report.questionScores.length} questions assessed, ${report.inflationAttempts.length} inflation attempts, integrity ${(report.integrityIndex * 100).toFixed(0)}%.`;
      recommendation = report.inflationAttempts.length > 0
        ? `Review ${report.inflationAttempts.length} inflation attempt(s). Verify evidence chain integrity.`
        : "No inflation attempts detected. Evidence chain integrity should be periodically verified.";
      break;
    default: // operator
      headline = `${report.trustLabel} — Avg level ${avgLevel.toFixed(1)}/5 across ${report.layerScores.length} layers.`;
      recommendation = topConcerns.length > 0
        ? `Priority: resolve ${topConcerns.length} flagged question(s) to improve trust posture.`
        : "All questions are clean. Consider running assurance packs for deeper coverage.";
      break;
  }

  return {
    role,
    headline,
    trustLabel: report.trustLabel,
    integrityIndex: report.integrityIndex,
    overallScore: avgLevel,
    topConcerns,
    topStrengths,
    recommendation,
  };
}

// ---------------------------------------------------------------------------
// Role presets
// ---------------------------------------------------------------------------

export function getRolePreset(role: OperatorRole): RolePreset {
  switch (role) {
    case "executive":
      return {
        role: "executive",
        label: "Executive View",
        description: "High-level trust posture and top concerns for leadership.",
        showSections: ["trustSummary", "heatmap", "topConcerns", "topStrengths", "narrativeDiff"],
        hideSections: ["actionQueue", "incidentTimeline", "whyCapsDetail"],
        sortBy: "risk",
      };
    case "auditor":
      return {
        role: "auditor",
        label: "Auditor View",
        description: "Detailed evidence chain analysis and inflation detection.",
        showSections: ["trustSummary", "whyCaps", "incidentTimeline", "heatmap", "actionQueue", "narrativeDiff"],
        hideSections: [],
        sortBy: "confidence",
      };
    default:
      return {
        role: "operator",
        label: "Operator View",
        description: "Full operational view with actionable unlock steps.",
        showSections: ["trustSummary", "whyCaps", "heatmap", "actionQueue", "narrativeDiff", "incidentTimeline"],
        hideSections: [],
        sortBy: "gap",
      };
  }
}

export function listRolePresets(): RolePreset[] {
  return [getRolePreset("operator"), getRolePreset("executive"), getRolePreset("auditor")];
}

// ---------------------------------------------------------------------------
// Full operator dashboard assembly
// ---------------------------------------------------------------------------

/**
 * Generate a complete operator dashboard for a given diagnostic report and role.
 */
export function generateOperatorDashboard(
  report: DiagnosticReport,
  role: OperatorRole = "operator",
  previousReport: DiagnosticReport | null = null,
  targetMapping?: Record<string, number>,
): OperatorDashboard {
  const whyCaps = computeWhyCaps(report, targetMapping);
  const heatmap = computeConfidenceHeatmap(report);
  const actionQueue = computeActionQueue(whyCaps);
  const narrativeDiff = computeNarrativeDiff(report, previousReport);
  const incidentTimeline = computeIncidentTimeline(report);
  const trustSummary = computeTrustSummary(report, role);
  const preset = getRolePreset(role);

  const dashboardId = `opux_${sha256Hex(report.runId + role + String(Date.now())).slice(0, 16)}`;

  return {
    dashboardId,
    generatedTs: Date.now(),
    role,
    report,
    whyCaps,
    heatmap,
    actionQueue,
    narrativeDiff,
    incidentTimeline,
    trustSummary,
    preset,
  };
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

/**
 * Render an operator dashboard as markdown for CLI output.
 */
export function renderOperatorDashboardMarkdown(dashboard: OperatorDashboard): string {
  const lines: string[] = [];
  const { trustSummary, whyCaps, heatmap, actionQueue, narrativeDiff, incidentTimeline, preset } = dashboard;

  lines.push(`# Operator Dashboard — ${preset.label}`);
  lines.push(`Dashboard ID: ${dashboard.dashboardId}`);
  lines.push(`Generated: ${new Date(dashboard.generatedTs).toISOString()}`);
  lines.push("");

  // Trust Summary
  if (preset.showSections.includes("trustSummary")) {
    lines.push("## Trust Summary");
    lines.push(`**${trustSummary.headline}**`);
    lines.push("");
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Trust Label | ${trustSummary.trustLabel} |`);
    lines.push(`| Integrity Index | ${(trustSummary.integrityIndex * 100).toFixed(1)}% |`);
    lines.push(`| Overall Score | ${trustSummary.overallScore.toFixed(1)}/5 |`);
    lines.push("");
    if (trustSummary.topConcerns.length > 0) {
      lines.push("### Top Concerns");
      for (const c of trustSummary.topConcerns) {
        lines.push(`- ${c}`);
      }
      lines.push("");
    }
    if (trustSummary.topStrengths.length > 0) {
      lines.push("### Top Strengths");
      for (const s of trustSummary.topStrengths) {
        lines.push(`- ${s}`);
      }
      lines.push("");
    }
    lines.push(`**Recommendation:** ${trustSummary.recommendation}`);
    lines.push("");
  }

  // Why Capped
  if (preset.showSections.includes("whyCaps")) {
    lines.push("## Why Capped — Per-Question Analysis");
    lines.push("");
    const capped = whyCaps.filter((w) => w.capReasons.length > 0 || w.gap > 0);
    if (capped.length === 0) {
      lines.push("No questions are currently capped by blocking flags.");
    } else {
      lines.push("| Question | Level | Target | Gap | Confidence | Flags | Top Unlock Action |");
      lines.push("|----------|-------|--------|-----|------------|-------|-------------------|");
      for (const w of capped.slice(0, 20)) {
        const targetStr = w.targetLevel !== null ? String(w.targetLevel) : "—";
        const topAction = w.capReasons.length > 0 ? w.capReasons[0]!.label : "—";
        lines.push(`| ${w.questionId} | ${w.currentLevel} | ${targetStr} | ${w.gap} | ${(w.confidence * 100).toFixed(0)}% | ${w.capReasons.length} | ${topAction} |`);
      }
    }
    lines.push("");
  }

  // Confidence Heatmap
  if (preset.showSections.includes("heatmap")) {
    lines.push("## Confidence Heatmap");
    lines.push("");
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Avg confidence | ${(heatmap.avgConfidence * 100).toFixed(1)}% |`);
    lines.push(`| Min confidence | ${(heatmap.minConfidence * 100).toFixed(1)}% |`);
    lines.push(`| Max confidence | ${(heatmap.maxConfidence * 100).toFixed(1)}% |`);
    lines.push(`| Low confidence questions | ${heatmap.lowConfidenceCount} |`);
    lines.push("");

    // Group by layer
    const byLayer = new Map<LayerName, ConfidenceCell[]>();
    for (const cell of heatmap.cells) {
      const arr = byLayer.get(cell.layerName) ?? [];
      arr.push(cell);
      byLayer.set(cell.layerName, arr);
    }
    for (const [layer, cells] of byLayer) {
      lines.push(`### ${layer}`);
      lines.push("| Question | Level | Confidence | Flags | Heat |");
      lines.push("|----------|-------|------------|-------|------|");
      for (const c of cells) {
        lines.push(`| ${c.questionId} | ${c.finalLevel} | ${(c.confidence * 100).toFixed(0)}% | ${c.flagCount} | ${c.heatColor.toUpperCase()} |`);
      }
      lines.push("");
    }
  }

  // Action Queue
  if (preset.showSections.includes("actionQueue")) {
    lines.push("## Action Queue (by Risk Reduction / Effort)");
    lines.push("");
    if (actionQueue.items.length === 0) {
      lines.push("No actions required.");
    } else {
      lines.push(`Total risk reduction available: ${actionQueue.totalRiskReduction.toFixed(1)}`);
      lines.push(`Estimated effort: ${actionQueue.estimatedEffort}`);
      lines.push("");
      lines.push("| # | Question | Action | Effort | Risk Δ | Priority |");
      lines.push("|---|----------|--------|--------|--------|----------|");
      for (const item of actionQueue.items.slice(0, 15)) {
        lines.push(`| ${item.rank} | ${item.questionId} | ${item.action.slice(0, 60)}${item.action.length > 60 ? "…" : ""} | ${item.effortLevel} | ${item.riskReduction.toFixed(1)} | ${item.priorityScore.toFixed(2)} |`);
      }
    }
    lines.push("");
  }

  // Narrative Diff
  if (preset.showSections.includes("narrativeDiff")) {
    lines.push("## What Changed Since Last Run");
    lines.push("");
    lines.push(narrativeDiff.summary);
    lines.push("");
    if (narrativeDiff.entries.length > 0) {
      lines.push("| Question | Field | Old | New | Direction |");
      lines.push("|----------|-------|-----|-----|-----------|");
      for (const e of narrativeDiff.entries.slice(0, 20)) {
        const dir = e.direction === "improved" ? "↑" : e.direction === "degraded" ? "↓" : "—";
        lines.push(`| ${e.questionId} | ${e.field} | ${e.oldValue} | ${e.newValue} | ${dir} ${e.direction} |`);
      }
    }
    lines.push("");
  }

  // Incident Timeline
  if (preset.showSections.includes("incidentTimeline")) {
    lines.push("## Incident Timeline");
    lines.push("");
    if (incidentTimeline.entries.length === 0) {
      lines.push("No incidents in the assessment window.");
    } else {
      lines.push(`Critical: ${incidentTimeline.criticalCount} | High: ${incidentTimeline.highCount} | Total: ${incidentTimeline.entries.length}`);
      lines.push("");
      lines.push("| Severity | Question | Event | Description |");
      lines.push("|----------|----------|-------|-------------|");
      for (const e of incidentTimeline.entries.slice(0, 25)) {
        lines.push(`| ${e.severity.toUpperCase()} | ${e.questionId} | ${e.eventType} | ${e.description.slice(0, 60)}${e.description.length > 60 ? "…" : ""} |`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
