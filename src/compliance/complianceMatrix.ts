/**
 * Compliance framework coverage matrix and gap analysis.
 *
 * Generates a multi-framework coverage matrix showing which compliance
 * categories are satisfied, partial, missing, or unknown across all
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
  score: number;
  satisfied: number;
  partial: number;
  missing: number;
  unknown: number;
  total: number;
  categories: ComplianceCategoryResult[];
}

export interface ComplianceCoverageMatrix {
  agentId: string;
  ts: number;
  window: string;
  frameworks: FrameworkCoverage[];
  overallScore: number;
  gaps: ComplianceGap[];
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
        total: report.categories.length,
        categories: report.categories,
      });

      for (const cat of report.categories) {
        if (cat.status === "MISSING" || cat.status === "PARTIAL") {
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
        score: 0,
        satisfied: 0,
        partial: 0,
        missing: 0,
        unknown: 0,
        total: 0,
        categories: [],
      });
    }
  }

  const overallScore = results.length > 0
    ? Number((results.reduce((sum, r) => sum + r.score, 0) / results.length).toFixed(4))
    : 0;

  return {
    agentId: params.agentId ?? "default",
    ts: Date.now(),
    window: params.window,
    frameworks: results,
    overallScore,
    gaps: gaps.sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return sevOrder[a.severity] - sevOrder[b.severity];
    }),
  };
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

export function renderCoverageMatrixMarkdown(matrix: ComplianceCoverageMatrix): string {
  const lines: string[] = [];
  lines.push("# AMC Compliance Coverage Matrix");
  lines.push("");
  lines.push(`**Agent:** ${matrix.agentId}`);
  lines.push(`**Window:** ${matrix.window}`);
  lines.push(`**Overall Score:** ${(matrix.overallScore * 100).toFixed(1)}%`);
  lines.push(`**Generated:** ${new Date(matrix.ts).toISOString()}`);
  lines.push("");

  lines.push("## Framework Coverage");
  lines.push("");
  lines.push("| Framework | Score | Satisfied | Partial | Missing | Unknown | Total |");
  lines.push("|-----------|-------|-----------|---------|---------|---------|-------|");
  for (const fw of matrix.frameworks) {
    lines.push(`| ${fw.displayName} | ${(fw.score * 100).toFixed(1)}% | ${fw.satisfied} | ${fw.partial} | ${fw.missing} | ${fw.unknown} | ${fw.total} |`);
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
    const pct = (fw.score * 100);
    const bar = buildBar(pct, 40);
    lines.push(`${fw.framework.padEnd(14)} ${bar} ${pct.toFixed(1)}%`);

    if (fw.categories.length > 0) {
      for (const cat of fw.categories) {
        const icon = cat.status === "SATISFIED" ? "█"
          : cat.status === "PARTIAL" ? "▓"
          : cat.status === "MISSING" ? "░"
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
  lines.push(`Overall: ${(matrix.overallScore * 100).toFixed(1)}% | Gaps: ${matrix.gaps.length}`);
  lines.push("");
  lines.push("Legend: █ SATISFIED  ▓ PARTIAL  ░ MISSING  · UNKNOWN");

  return lines.join("\n");
}

function buildBar(pct: number, width: number): string {
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}
