/**
 * Compliance framework coverage matrix and gap analysis.
 *
 * Generates a multi-framework coverage matrix showing which compliance
 * categories are satisfied, partial, missing, or not evaluated across all
 * supported regulatory frameworks.
 */

import { complianceFrameworkFamilies, type ComplianceFramework, type ComplianceFrameworkFamily } from "./frameworks.js";
import { generateComplianceReport } from "./complianceEngine.js";
import type { ComplianceCategoryResult, ComplianceReportJson } from "./mappingSchema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FrameworkCoverage {
  framework: ComplianceFramework;
  displayName: string;
  /** Null when no category in this framework was evaluated. */
  score: number | null;
  satisfied: number;
  partial: number;
  missing: number;
  unknown: number;
  notEvaluated: number;
  total: number;
  categories: ComplianceCategoryResult[];
}

export interface ComplianceCoverageMatrix {
  agentId: string;
  ts: number;
  window: string;
  frameworks: FrameworkCoverage[];
  /** Mean of the evaluated frameworks' scores; null when none was evaluated. */
  overallScore: number | null;
  /** Failed categories (MISSING, PARTIAL). */
  gaps: ComplianceGap[];
  /** Categories without trusted control-bound evidence: listed apart from gaps, never scored as one. */
  notEvaluated: NotEvaluatedCategory[];
}

export interface NotEvaluatedCategory {
  framework: ComplianceFramework;
  category: string;
  reasons: string[];
}

export interface ComplianceGap {
  framework: ComplianceFramework;
  category: string;
  status: string;
  severity: "critical" | "high" | "medium" | "low";
  neededToSatisfy: string[];
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

const PRIMARY_FRAMEWORKS: ComplianceFramework[] = [
  "EU_AI_ACT", "NIST_AI_RMF", "ISO_42001", "SOC2",
];

function gapSeverity(status: string, framework: ComplianceFramework): ComplianceGap["severity"] {
  if (status === "MISSING") {
    return framework === "EU_AI_ACT" ? "critical" : "high";
  }
  if (status === "PARTIAL") return "medium";
  return "low";
}

export function generateCoverageMatrix(params: {
  workspace: string;
  agentId?: string;
  window: string;
  frameworks?: ComplianceFramework[];
}): ComplianceCoverageMatrix {
  const frameworks = params.frameworks ?? PRIMARY_FRAMEWORKS;
  const results: FrameworkCoverage[] = [];
  const gaps: ComplianceGap[] = [];
  const notEvaluated: NotEvaluatedCategory[] = [];

  for (const fw of frameworks) {
    try {
      const report = generateComplianceReport({
        workspace: params.workspace,
        agentId: params.agentId,
        window: params.window,
        framework: fw,
      });

      const fwFamily = complianceFrameworkFamilies.find((f) => f.framework === fw);
      results.push({
        framework: fw,
        displayName: fwFamily?.displayName ?? fw,
        score: report.coverage.score,
        satisfied: report.coverage.satisfied,
        partial: report.coverage.partial,
        missing: report.coverage.missing,
        unknown: report.coverage.unknown,
        notEvaluated: report.coverage.notEvaluated,
        total: report.categories.length,
        categories: report.categories,
      });

      for (const cat of report.categories) {
        if (cat.status === "NOT_EVALUATED") {
          notEvaluated.push({ framework: fw, category: cat.category, reasons: cat.notEvaluatedReasons });
        } else if (cat.status === "MISSING" || cat.status === "PARTIAL") {
          gaps.push({
            framework: fw,
            category: cat.category,
            status: cat.status,
            severity: gapSeverity(cat.status, fw),
            neededToSatisfy: cat.neededToSatisfy,
          });
        }
      }
    } catch {
      results.push({
        framework: fw,
        displayName: fw,
        score: null,
        satisfied: 0,
        partial: 0,
        missing: 0,
        unknown: 0,
        notEvaluated: 0,
        total: 0,
        categories: [],
      });
    }
  }

  const scores = results.flatMap((r) => (r.score === null ? [] : [r.score]));
  const overallScore = scores.length > 0
    ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(4))
    : null;

  return {
    agentId: params.agentId ?? "default",
    ts: Date.now(),
    window: params.window,
    frameworks: results,
    overallScore,
    notEvaluated,
    gaps: gaps.sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return sevOrder[a.severity] - sevOrder[b.severity];
    }),
  };
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function pctText(score: number | null): string {
  return score === null ? "not evaluated" : `${(score * 100).toFixed(1)}%`;
}

export function renderCoverageMatrixMarkdown(matrix: ComplianceCoverageMatrix): string {
  const lines: string[] = [];
  lines.push("# AMC Compliance Coverage Matrix");
  lines.push("");
  lines.push(`**Agent:** ${matrix.agentId}`);
  lines.push(`**Window:** ${matrix.window}`);
  lines.push(`**Overall Score:** ${pctText(matrix.overallScore)}`);
  lines.push(`**Generated:** ${new Date(matrix.ts).toISOString()}`);
  lines.push("");

  lines.push("## Framework Coverage");
  lines.push("");
  lines.push("| Framework | Score | Satisfied | Partial | Missing | Not Evaluated | Unknown | Total |");
  lines.push("|-----------|-------|-----------|---------|---------|---------------|---------|-------|");
  for (const fw of matrix.frameworks) {
    lines.push(`| ${fw.displayName} | ${pctText(fw.score)} | ${fw.satisfied} | ${fw.partial} | ${fw.missing} | ${fw.notEvaluated} | ${fw.unknown} | ${fw.total} |`);
  }
  lines.push("");

  if (matrix.gaps.length > 0) {
    lines.push("## Gap Analysis");
    lines.push("");
    lines.push("| Severity | Framework | Category | Status | Action Needed |");
    lines.push("|----------|-----------|----------|--------|---------------|");
    for (const gap of matrix.gaps.slice(0, 30)) {
      const action = gap.neededToSatisfy[0] ?? "Review evidence requirements";
      lines.push(`| ${gap.severity.toUpperCase()} | ${gap.framework} | ${gap.category} | ${gap.status} | ${action} |`);
    }
    if (matrix.gaps.length > 30) {
      lines.push(`| ... | ... | ... | ... | ${matrix.gaps.length - 30} more gaps |`);
    }
    lines.push("");
  }

  if (matrix.notEvaluated.length > 0) {
    lines.push("## Not Evaluated");
    lines.push("");
    lines.push("No trusted control-bound evidence; these are not gaps and not passes.");
    lines.push("");
    for (const row of matrix.notEvaluated.slice(0, 30)) {
      lines.push(`- ${row.framework} ${row.category}: ${row.reasons[0] ?? "not evaluated"}`);
    }
    if (matrix.notEvaluated.length > 30) {
      lines.push(`- ... ${matrix.notEvaluated.length - 30} more`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("*Generated by `amc compliance report`*");
  return lines.join("\n");
}

export function renderCoverageHeatmap(matrix: ComplianceCoverageMatrix): string {
  const lines: string[] = [];
  lines.push("AMC Compliance Coverage Heatmap");
  lines.push("═".repeat(60));
  lines.push("");

  for (const fw of matrix.frameworks) {
    const bar = fw.score === null ? "?".repeat(40) : buildBar(fw.score * 100, 40);
    lines.push(`${fw.framework.padEnd(14)} ${bar} ${pctText(fw.score)}`);

    if (fw.categories.length > 0) {
      for (const cat of fw.categories) {
        const icon = cat.status === "SATISFIED" ? "█"
          : cat.status === "PARTIAL" ? "▓"
          : cat.status === "MISSING" ? "░"
          : cat.status === "NOT_EVALUATED" ? "?"
          : "·";
        const shortCat = cat.category.length > 35
          ? cat.category.slice(0, 32) + "..."
          : cat.category;
        lines.push(`  ${icon} ${shortCat.padEnd(37)} ${cat.status}`);
      }
      lines.push("");
    }
  }

  lines.push("─".repeat(60));
  lines.push(`Overall: ${pctText(matrix.overallScore)} | Gaps: ${matrix.gaps.length} | Not evaluated: ${matrix.notEvaluated.length}`);
  lines.push("");
  lines.push("Legend: █ SATISFIED  ▓ PARTIAL  ░ MISSING  ? NOT_EVALUATED  · UNKNOWN");

  return lines.join("\n");
}

function buildBar(pct: number, width: number): string {
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}
