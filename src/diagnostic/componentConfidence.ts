/**
 * Per-Component Confidence
 *
 * Breaks confidence out by subsystem: tool safety, route safety,
 * governance hygiene, evidence quality, memory integrity, identity consistency.
 */
import type { DiagnosticReport } from "../types.js";

// ── Types ──────────────────────────────────────────────────────────────────

export const CONFIDENCE_COMPONENTS = [
  "tool_safety",
  "route_safety",
  "governance_hygiene",
  "evidence_quality",
  "memory_integrity",
  "identity_consistency",
] as const;
export type ConfidenceComponentName = (typeof CONFIDENCE_COMPONENTS)[number];

export type ConfidenceTrend = "improving" | "stable" | "degrading";

export interface ConfidenceComponent {
  component: ConfidenceComponentName;
  score: number;            // 0-1
  evidenceCount: number;
  freshnessMs: number | null; // ms since last evidence
  trend: ConfidenceTrend;
}

export interface ComponentConfidenceReport {
  agentId: string;
  generatedTs: number;
  components: ConfidenceComponent[];
  overallScore: number;
  heatmapData: ComponentHeatmapCell[];
}

export interface ComponentHeatmapCell {
  component: ConfidenceComponentName;
  score: number;
  evidenceCount: number;
  trend: ConfidenceTrend;
}

// ── Question → Component Mapping ───────────────────────────────────────────

// Map question IDs to components based on common patterns
const COMPONENT_QUESTION_PATTERNS: Record<ConfidenceComponentName, RegExp[]> = {
  tool_safety: [/tool/i, /sandbox/i, /plugin/i, /execution/i],
  route_safety: [/route/i, /gateway/i, /model/i, /provider/i, /bridge/i],
  governance_hygiene: [/governance/i, /policy/i, /approval/i, /oversight/i, /guard/i],
  evidence_quality: [/evidence/i, /audit/i, /trace/i, /log/i, /receipt/i],
  memory_integrity: [/memory/i, /context/i, /state/i, /persist/i, /learning/i],
  identity_consistency: [/identity/i, /auth/i, /trust/i, /credential/i, /passport/i],
};

function classifyQuestionToComponent(questionId: string): ConfidenceComponentName | null {
  const lower = questionId.toLowerCase();
  for (const [component, patterns] of Object.entries(COMPONENT_QUESTION_PATTERNS)) {
    if (patterns.some((p) => p.test(lower))) {
      return component as ConfidenceComponentName;
    }
  }
  return null;
}

// ── Core Logic ─────────────────────────────────────────────────────────────

export function computeComponentConfidence(
  report: DiagnosticReport,
  priorReports?: DiagnosticReport[]
): ComponentConfidenceReport {
  const componentData = new Map<ConfidenceComponentName, { scores: number[]; evidenceCount: number }>();

  // Initialize
  for (const c of CONFIDENCE_COMPONENTS) {
    componentData.set(c, { scores: [], evidenceCount: 0 });
  }

  // Classify questions into components
  for (const q of report.questionScores) {
    const component = classifyQuestionToComponent(q.questionId);
    if (component) {
      const data = componentData.get(component)!;
      data.scores.push(q.confidence);
      data.evidenceCount += q.evidenceEventIds.length;
    } else {
      // Distribute unclassified across all components with lower weight
      for (const c of CONFIDENCE_COMPONENTS) {
        const data = componentData.get(c)!;
        data.scores.push(q.confidence * 0.3);
      }
    }
  }

  // Compute trends from prior reports
  function computeTrend(component: ConfidenceComponentName): ConfidenceTrend {
    if (!priorReports || priorReports.length < 2) return "stable";
    const priorScores: number[] = [];
    for (const pr of priorReports) {
      const relevant = pr.questionScores.filter(
        (q) => classifyQuestionToComponent(q.questionId) === component
      );
      if (relevant.length > 0) {
        priorScores.push(relevant.reduce((a, b) => a + b.confidence, 0) / relevant.length);
      }
    }
    if (priorScores.length < 2) return "stable";
    const recent = priorScores[priorScores.length - 1];
    const older = priorScores[0];
    const diff = recent - older;
    if (diff > 0.1) return "improving";
    if (diff < -0.1) return "degrading";
    return "stable";
  }

  const components: ConfidenceComponent[] = CONFIDENCE_COMPONENTS.map((c) => {
    const data = componentData.get(c)!;
    const score = data.scores.length > 0
      ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length
      : 0;
    return {
      component: c,
      score: Math.min(1, Math.max(0, score)),
      evidenceCount: data.evidenceCount,
      freshnessMs: Date.now() - report.ts,
      trend: computeTrend(c),
    };
  });

  const overallScore = components.length > 0
    ? components.reduce((a, b) => a + b.score, 0) / components.length
    : 0;

  const heatmapData: ComponentHeatmapCell[] = components.map((c) => ({
    component: c.component,
    score: c.score,
    evidenceCount: c.evidenceCount,
    trend: c.trend,
  }));

  return {
    agentId: report.agentId,
    generatedTs: Date.now(),
    components,
    overallScore,
    heatmapData,
  };
}

export function renderComponentConfidenceMarkdown(report: ComponentConfidenceReport): string {
  const lines: string[] = [
    `# Component Confidence — ${report.agentId}`,
    "",
    `**Overall:** ${(report.overallScore * 100).toFixed(1)}%`,
    "",
    "| Component | Score | Evidence | Freshness | Trend |",
    "|-----------|-------|----------|-----------|-------|",
  ];

  for (const c of report.components) {
    const freshness = c.freshnessMs !== null
      ? `${Math.round(c.freshnessMs / 3600000)}h ago`
      : "unknown";
    const trendIcon = c.trend === "improving" ? "📈" : c.trend === "degrading" ? "📉" : "➡️";
    lines.push(
      `| ${c.component} | ${(c.score * 100).toFixed(0)}% | ${c.evidenceCount} | ${freshness} | ${trendIcon} ${c.trend} |`
    );
  }

  lines.push("");
  return lines.join("\n");
}
