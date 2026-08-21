/**
 * False Positive Cost Tracking & Tuning Loop
 *
 * Tracks false-positive assurance scenario results, quantifies the cost of
 * over-blocking (developer time, user frustration, lost throughput), and
 * provides a tuning loop to calibrate thresholds per pack.
 *
 * Key concepts:
 * - FPReport: A developer-submitted report that a specific scenario result
 *   was a false positive (the agent was correct but the validator flagged it).
 * - FPCostModel: Configurable per-report cost estimate.
 * - TuningRecommendation: Suggestions for relaxing or tightening validators.
 */

import { randomUUID } from "node:crypto";
import { sha256Hex } from "../utils/hash.js";
import {
  saveWorkspaceRecord,
  loadWorkspaceRecords,
  updateWorkspaceRecord
} from "../storage/workspaceRecordStore.js";

/** Where false-positive reports live under .amc/. */
const FP_REPORTS_AT = { area: ["assurance"], kind: "false-positives" };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FalsePositiveReport {
  reportId: string;
  scenarioId: string;
  packId: string;
  assuranceRunId: string;
  /** The response that was incorrectly flagged */
  response: string;
  /** Why the reporter thinks this is a false positive */
  justification: string;
  /** Who filed the report */
  reportedBy: string;
  ts: number;
  /** Resolution status */
  status: "open" | "confirmed" | "rejected";
  resolution?: string;
}

export interface FPCostModel {
  /** Estimated developer-minutes per false positive investigation */
  devMinutesPerFP: number;
  /** Estimated cost per developer-minute in USD */
  costPerDevMinute: number;
  /** User frustration multiplier (1.0 = neutral, >1 = high-friction scenario) */
  frictionMultiplier: number;
  /** Throughput loss per block (requests/hour lost) */
  throughputLossPerBlock: number;
}

export interface FPCostSummary {
  packId: string;
  totalFPReports: number;
  confirmedFPs: number;
  rejectedFPs: number;
  openFPs: number;
  /** FP rate = confirmed / (confirmed + rejected) */
  fpRate: number;
  /** Total estimated cost of confirmed FPs */
  totalCostUsd: number;
  /** Total dev-minutes spent investigating */
  totalDevMinutes: number;
  /** Cost per scenario (avg across confirmed FPs in this pack) */
  avgCostPerFP: number;
}

export interface TuningRecommendation {
  packId: string;
  scenarioId: string;
  recommendation: "relax" | "tighten" | "keep";
  reason: string;
  fpCount: number;
  fpRate: number;
  estimatedCostSaved: number;
}

export interface FPTuningReport {
  reportId: string;
  ts: number;
  windowStartTs: number;
  windowEndTs: number;
  totalFPReports: number;
  totalConfirmed: number;
  totalCostUsd: number;
  packSummaries: FPCostSummary[];
  recommendations: TuningRecommendation[];
  reportHash: string;
}

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

/**
 * In-process cache over the durable store.
 *
 * This array was the only home for FP reports, so `amc fp-submit` handed back
 * a report ID that `amc fp-list`, `fp-resolve` and `fp-cost` could never find:
 *
 *   $ amc fp-submit --scenario s1 --pack testpack --run run-1 --justification x
 *   FP report submitted: fp_b94a2b65-e40
 *   $ amc fp-list
 *   No false positive reports found.
 *
 * Reports given a `workspace` now also live under .amc/assurance/false-positives/.
 */
let fpReports: FalsePositiveReport[] = [];
let costModel: FPCostModel = {
  devMinutesPerFP: 15,
  costPerDevMinute: 2.5,
  frictionMultiplier: 1.0,
  throughputLossPerBlock: 5,
};

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------

export function resetFPTrackerState(): void {
  fpReports = [];
  costModel = {
    devMinutesPerFP: 15,
    costPerDevMinute: 2.5,
    frictionMultiplier: 1.0,
    throughputLossPerBlock: 5,
  };
}

export function configureFPCostModel(model: Partial<FPCostModel>): FPCostModel {
  costModel = { ...costModel, ...model };
  return { ...costModel };
}

export function getFPCostModel(): FPCostModel {
  return { ...costModel };
}

// ---------------------------------------------------------------------------
// FP Report CRUD
// ---------------------------------------------------------------------------

export function submitFPReport(input: {
  scenarioId: string;
  packId: string;
  assuranceRunId: string;
  response: string;
  justification: string;
  reportedBy: string;
}, workspace?: string): FalsePositiveReport {
  const report: FalsePositiveReport = {
    reportId: `fp_${randomUUID().slice(0, 12)}`,
    scenarioId: input.scenarioId,
    packId: input.packId,
    assuranceRunId: input.assuranceRunId,
    response: input.response,
    justification: input.justification,
    reportedBy: input.reportedBy,
    ts: Date.now(),
    status: "open",
  };
  fpReports.push(report);
  if (workspace) {
    saveWorkspaceRecord(workspace, FP_REPORTS_AT, report.reportId, { ...report }, report.ts);
  }
  return report;
}

export function resolveFPReport(
  reportId: string,
  resolution: { status: "confirmed" | "rejected"; reason: string },
  workspace?: string
): FalsePositiveReport | null {
  const live = fpReports.find((r) => r.reportId === reportId);
  const report = live ?? allFPReports(workspace).find((r) => r.reportId === reportId);
  if (!report || report.status !== "open") return null;
  report.status = resolution.status;
  report.resolution = resolution.reason;
  if (live) {
    live.status = resolution.status;
    live.resolution = resolution.reason;
  }
  if (workspace) {
    updateWorkspaceRecord(workspace, FP_REPORTS_AT, report.reportId, { ...report }, Date.now());
  }
  return { ...report };
}

/** Live reports plus any persisted by an earlier process, deduped by id. */
function allFPReports(workspace?: string): FalsePositiveReport[] {
  if (!workspace) return [...fpReports];
  const stored = loadWorkspaceRecords<FalsePositiveReport>(workspace, FP_REPORTS_AT);
  const seen = new Set(fpReports.map((r) => r.reportId));
  return [...fpReports, ...stored.filter((r) => !seen.has(r.reportId))];
}

export function getFPReport(reportId: string, workspace?: string): FalsePositiveReport | null {
  return allFPReports(workspace).find((r) => r.reportId === reportId) ?? null;
}

export function listFPReports(filters?: {
  packId?: string;
  scenarioId?: string;
  status?: "open" | "confirmed" | "rejected";
}, workspace?: string): FalsePositiveReport[] {
  let results = allFPReports(workspace);
  if (filters?.packId) {
    results = results.filter((r) => r.packId === filters.packId);
  }
  if (filters?.scenarioId) {
    results = results.filter((r) => r.scenarioId === filters.scenarioId);
  }
  if (filters?.status) {
    results = results.filter((r) => r.status === filters.status);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Cost computation
// ---------------------------------------------------------------------------

export function computeFPCostSummary(packId?: string, workspace?: string): FPCostSummary[] {
  // Group by pack
  const byPack = new Map<string, FalsePositiveReport[]>();
  for (const report of allFPReports(workspace)) {
    if (packId && report.packId !== packId) continue;
    const existing = byPack.get(report.packId) ?? [];
    existing.push(report);
    byPack.set(report.packId, existing);
  }

  const summaries: FPCostSummary[] = [];
  for (const [pid, reports] of byPack) {
    const confirmed = reports.filter((r) => r.status === "confirmed").length;
    const rejected = reports.filter((r) => r.status === "rejected").length;
    const open = reports.filter((r) => r.status === "open").length;
    const resolved = confirmed + rejected;
    const fpRate = resolved > 0 ? confirmed / resolved : 0;
    const costPerFP =
      costModel.devMinutesPerFP * costModel.costPerDevMinute * costModel.frictionMultiplier;
    const totalCostUsd = confirmed * costPerFP;
    const totalDevMinutes = confirmed * costModel.devMinutesPerFP;

    summaries.push({
      packId: pid,
      totalFPReports: reports.length,
      confirmedFPs: confirmed,
      rejectedFPs: rejected,
      openFPs: open,
      fpRate: Number(fpRate.toFixed(4)),
      totalCostUsd: Number(totalCostUsd.toFixed(2)),
      totalDevMinutes,
      avgCostPerFP: confirmed > 0 ? Number((totalCostUsd / confirmed).toFixed(2)) : 0,
    });
  }

  return summaries.sort((a, b) => b.totalCostUsd - a.totalCostUsd);
}

// ---------------------------------------------------------------------------
// Tuning recommendations
// ---------------------------------------------------------------------------

export function generateTuningRecommendations(opts?: {
  fpRateThreshold?: number;
  minReportsForRecommendation?: number;
}): TuningRecommendation[] {
  const fpRateThreshold = opts?.fpRateThreshold ?? 0.3;
  const minReports = opts?.minReportsForRecommendation ?? 3;

  // Group by (packId, scenarioId)
  const byScenario = new Map<string, FalsePositiveReport[]>();
  for (const report of fpReports) {
    const key = `${report.packId}:${report.scenarioId}`;
    const existing = byScenario.get(key) ?? [];
    existing.push(report);
    byScenario.set(key, existing);
  }

  const recs: TuningRecommendation[] = [];
  for (const [key, reports] of byScenario) {
    const [packId, scenarioId] = key.split(":");
    const confirmed = reports.filter((r) => r.status === "confirmed").length;
    const rejected = reports.filter((r) => r.status === "rejected").length;
    const resolved = confirmed + rejected;

    if (resolved < minReports) continue;

    const fpRate = resolved > 0 ? confirmed / resolved : 0;
    const costPerFP =
      costModel.devMinutesPerFP * costModel.costPerDevMinute * costModel.frictionMultiplier;
    const estimatedCostSaved = confirmed * costPerFP;

    let recommendation: "relax" | "tighten" | "keep";
    let reason: string;

    if (fpRate >= fpRateThreshold) {
      recommendation = "relax";
      reason = `FP rate ${(fpRate * 100).toFixed(1)}% exceeds threshold ${(fpRateThreshold * 100).toFixed(1)}%. Consider relaxing validator to reduce false blocks.`;
    } else if (fpRate <= 0.05 && resolved >= minReports) {
      recommendation = "tighten";
      reason = `FP rate ${(fpRate * 100).toFixed(1)}% is very low. Validator may be too lenient — consider adding stricter checks.`;
    } else {
      recommendation = "keep";
      reason = `FP rate ${(fpRate * 100).toFixed(1)}% is within acceptable range.`;
    }

    recs.push({
      packId: packId!,
      scenarioId: scenarioId!,
      recommendation,
      reason,
      fpCount: confirmed,
      fpRate: Number(fpRate.toFixed(4)),
      estimatedCostSaved: Number(estimatedCostSaved.toFixed(2)),
    });
  }

  // Sort: relax first (highest cost savings), then tighten, then keep
  const order = { relax: 0, tighten: 1, keep: 2 };
  return recs.sort(
    (a, b) =>
      order[a.recommendation] - order[b.recommendation] ||
      b.estimatedCostSaved - a.estimatedCostSaved
  );
}

// ---------------------------------------------------------------------------
// FP Tuning Report
// ---------------------------------------------------------------------------

export function generateFPTuningReport(opts?: {
  windowStartTs?: number;
  windowEndTs?: number;
  fpRateThreshold?: number;
}): FPTuningReport {
  const windowEndTs = opts?.windowEndTs ?? Date.now();
  const windowStartTs = opts?.windowStartTs ?? windowEndTs - 30 * 24 * 60 * 60 * 1000; // 30 days

  const summaries = computeFPCostSummary();
  const recommendations = generateTuningRecommendations({
    fpRateThreshold: opts?.fpRateThreshold,
  });

  const windowReports = fpReports.filter(
    (r) => r.ts >= windowStartTs && r.ts <= windowEndTs
  );
  const totalConfirmed = windowReports.filter((r) => r.status === "confirmed").length;
  const costPerFP =
    costModel.devMinutesPerFP * costModel.costPerDevMinute * costModel.frictionMultiplier;

  const report: FPTuningReport = {
    reportId: `fpt_${randomUUID().slice(0, 12)}`,
    ts: Date.now(),
    windowStartTs,
    windowEndTs,
    totalFPReports: windowReports.length,
    totalConfirmed,
    totalCostUsd: Number((totalConfirmed * costPerFP).toFixed(2)),
    packSummaries: summaries,
    recommendations,
    reportHash: "",
  };

  report.reportHash = sha256Hex(JSON.stringify(report));
  return report;
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

export function renderFPTuningReportMarkdown(report: FPTuningReport): string {
  const lines: string[] = [];

  lines.push("# False Positive Tuning Report");
  lines.push("");
  lines.push(`**Report ID:** ${report.reportId}`);
  lines.push(`**Generated:** ${new Date(report.ts).toISOString()}`);
  lines.push(
    `**Window:** ${new Date(report.windowStartTs).toISOString()} → ${new Date(report.windowEndTs).toISOString()}`
  );
  lines.push(`**Total FP Reports:** ${report.totalFPReports}`);
  lines.push(`**Confirmed FPs:** ${report.totalConfirmed}`);
  lines.push(`**Estimated Total Cost:** $${report.totalCostUsd.toFixed(2)}`);
  lines.push("");

  // Pack summaries
  lines.push("## Pack Cost Summaries");
  lines.push("");
  if (report.packSummaries.length === 0) {
    lines.push("No false positive reports filed.");
  } else {
    lines.push("| Pack | Total | Confirmed | FP Rate | Cost (USD) | Avg/FP |");
    lines.push("|------|-------|-----------|---------|------------|--------|");
    for (const s of report.packSummaries) {
      lines.push(
        `| ${s.packId} | ${s.totalFPReports} | ${s.confirmedFPs} | ${(s.fpRate * 100).toFixed(1)}% | $${s.totalCostUsd.toFixed(2)} | $${s.avgCostPerFP.toFixed(2)} |`
      );
    }
  }
  lines.push("");

  // Recommendations
  lines.push("## Tuning Recommendations");
  lines.push("");
  if (report.recommendations.length === 0) {
    lines.push("No tuning recommendations (insufficient data or all within thresholds).");
  } else {
    for (const r of report.recommendations) {
      const emoji =
        r.recommendation === "relax" ? "⚠️" : r.recommendation === "tighten" ? "🔒" : "✅";
      lines.push(
        `- ${emoji} **${r.packId} / ${r.scenarioId}**: ${r.recommendation.toUpperCase()} — ${r.reason} (${r.fpCount} confirmed FPs, est. $${r.estimatedCostSaved.toFixed(2)} saved)`
      );
    }
  }
  lines.push("");

  lines.push(`**Report Hash:** \`${report.reportHash}\``);

  return lines.join("\n");
}
