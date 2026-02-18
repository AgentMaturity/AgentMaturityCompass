/**
 * Known Unknowns Report Section
 *
 * Explicitly lists what AMC cannot determine for each diagnostic run.
 */
import type { DiagnosticReport, QuestionScore } from "../types.js";

// ── Types ──────────────────────────────────────────────────────────────────

export const UNKNOWN_CATEGORIES = [
  "EVIDENCE_GAP",
  "SCOPE_GAP",
  "TEMPORAL_GAP",
  "TRUST_GAP",
] as const;
export type UnknownCategory = (typeof UNKNOWN_CATEGORIES)[number];

export interface KnownUnknown {
  questionId: string;
  category: UnknownCategory;
  description: string;
  severity: "high" | "medium" | "low";
  suggestedAction: string;
}

export interface KnownUnknownsReport {
  agentId: string;
  runId: string | null;
  generatedTs: number;
  unknowns: KnownUnknown[];
  summary: {
    total: number;
    byCategory: Record<UnknownCategory, number>;
    bySeverity: Record<"high" | "medium" | "low", number>;
  };
}

// ── Thresholds ─────────────────────────────────────────────────────────────

const MIN_EVIDENCE_COUNT = 2;
const MAX_EVIDENCE_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const LOW_CONFIDENCE_THRESHOLD = 0.4;
const TRUST_GAP_SELF_REPORTED_THRESHOLD = 0.7; // if >70% self-reported

// ── Core Logic ─────────────────────────────────────────────────────────────

export function analyzeQuestionUnknowns(
  q: QuestionScore,
  reportTs: number
): KnownUnknown[] {
  const unknowns: KnownUnknown[] = [];

  // EVIDENCE_GAP: too few evidence events
  if (q.evidenceEventIds.length < MIN_EVIDENCE_COUNT) {
    unknowns.push({
      questionId: q.questionId,
      category: "EVIDENCE_GAP",
      description: `Only ${q.evidenceEventIds.length} evidence event(s) — minimum ${MIN_EVIDENCE_COUNT} recommended`,
      severity: q.evidenceEventIds.length === 0 ? "high" : "medium",
      suggestedAction: "Ingest additional evidence covering this question's domain",
    });
  }

  // Low confidence as scope gap signal
  if (q.confidence < LOW_CONFIDENCE_THRESHOLD && q.evidenceEventIds.length > 0) {
    unknowns.push({
      questionId: q.questionId,
      category: "SCOPE_GAP",
      description: `Confidence ${q.confidence.toFixed(2)} suggests evidence doesn't fully cover this question's scope`,
      severity: q.confidence < 0.2 ? "high" : "medium",
      suggestedAction: "Broaden evidence collection to cover all aspects of this question",
    });
  }

  // Flags analysis
  if (q.flags.some((f) => f.toLowerCase().includes("stale") || f.toLowerCase().includes("old"))) {
    unknowns.push({
      questionId: q.questionId,
      category: "TEMPORAL_GAP",
      description: "Evidence flagged as stale or outdated",
      severity: "medium",
      suggestedAction: "Re-run evidence collection with recent data",
    });
  }

  if (q.flags.some((f) => f.toLowerCase().includes("self_reported") || f.toLowerCase().includes("untrusted"))) {
    unknowns.push({
      questionId: q.questionId,
      category: "TRUST_GAP",
      description: "Evidence relies on low-trust tier sources",
      severity: "medium",
      suggestedAction: "Add OBSERVED or ATTESTED evidence sources",
    });
  }

  return unknowns;
}

export function generateKnownUnknownsReport(
  report: DiagnosticReport
): KnownUnknownsReport {
  const unknowns: KnownUnknown[] = [];

  for (const q of report.questionScores) {
    unknowns.push(...analyzeQuestionUnknowns(q, report.ts));
  }

  // Global trust gap: if mostly self-reported evidence
  if (report.evidenceTrustCoverage) {
    const { selfReported, observed, attested } = report.evidenceTrustCoverage;
    const total = selfReported + observed + attested;
    if (total > 0 && selfReported / total > TRUST_GAP_SELF_REPORTED_THRESHOLD) {
      unknowns.push({
        questionId: "_global",
        category: "TRUST_GAP",
        description: `${((selfReported / total) * 100).toFixed(0)}% of evidence is self-reported`,
        severity: "high",
        suggestedAction: "Add OBSERVED behavioral evidence from production monitoring",
      });
    }
  }

  // Global evidence coverage gap
  if (report.evidenceCoverage < 0.5) {
    unknowns.push({
      questionId: "_global",
      category: "EVIDENCE_GAP",
      description: `Evidence coverage is only ${(report.evidenceCoverage * 100).toFixed(0)}%`,
      severity: "high",
      suggestedAction: "Ingest more evidence to improve coverage across all questions",
    });
  }

  const byCategory: Record<UnknownCategory, number> = {
    EVIDENCE_GAP: 0,
    SCOPE_GAP: 0,
    TEMPORAL_GAP: 0,
    TRUST_GAP: 0,
  };
  const bySeverity: Record<"high" | "medium" | "low", number> = { high: 0, medium: 0, low: 0 };
  for (const u of unknowns) {
    byCategory[u.category]++;
    bySeverity[u.severity]++;
  }

  return {
    agentId: report.agentId,
    runId: report.runId,
    generatedTs: Date.now(),
    unknowns,
    summary: { total: unknowns.length, byCategory, bySeverity },
  };
}

export function renderKnownUnknownsMarkdown(report: KnownUnknownsReport): string {
  const lines: string[] = [
    `# Known Unknowns — ${report.agentId}`,
    "",
    `**Total:** ${report.summary.total}`,
    `**By Category:** ${Object.entries(report.summary.byCategory).map(([k, v]) => `${k}: ${v}`).join(", ")}`,
    `**By Severity:** ${Object.entries(report.summary.bySeverity).map(([k, v]) => `${k}: ${v}`).join(", ")}`,
    "",
  ];

  if (report.unknowns.length === 0) {
    lines.push("No known unknowns detected — evidence coverage appears comprehensive.");
    return lines.join("\n");
  }

  const grouped = new Map<UnknownCategory, KnownUnknown[]>();
  for (const u of report.unknowns) {
    const arr = grouped.get(u.category) ?? [];
    arr.push(u);
    grouped.set(u.category, arr);
  }

  for (const [cat, items] of grouped) {
    lines.push(`## ${cat}`, "");
    for (const item of items) {
      lines.push(`- **${item.questionId}** [${item.severity}]: ${item.description}`);
      lines.push(`  - Action: ${item.suggestedAction}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
