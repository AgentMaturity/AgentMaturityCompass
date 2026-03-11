/**
 * Fleet Scoring — Multi-Agent Evaluation
 *
 * Score multiple agents in one run, aggregate scores,
 * identify weakest links, compare agents against each other.
 *
 * AMC-94: Enterprise fleet evaluation use case.
 */

import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { listAgents } from "./registry.js";
import { runDiagnostic } from "../diagnostic/runner.js";
import { openLedger } from "../ledger/ledger.js";
import { parseWindowToMs } from "../utils/time.js";
import { parseEvidenceEvent } from "../diagnostic/gates.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { DiagnosticReport, LayerScore, QuestionScore } from "../types.js";

/* ── Types ─────────────────────────────────────────── */

export interface AgentScoreSummary {
  agentId: string;
  overallScore: number;
  integrityIndex: number;
  trustLabel: string;
  layerScores: Record<string, number>;
  weakestQuestions: Array<{ questionId: string; level: number; gap: number }>;
  strongestQuestions: Array<{ questionId: string; level: number }>;
  evidenceCoverage: number;
  status: "VALID" | "INVALID";
}

export interface FleetAggregate {
  fleetMeanScore: number;
  fleetMedianScore: number;
  fleetMinScore: number;
  fleetMaxScore: number;
  fleetStdDev: number;
  layerAverages: Record<string, number>;
  layerWorst: Record<string, { agentId: string; score: number }>;
}

export interface WeakLink {
  agentId: string;
  overallScore: number;
  /** How many std devs below the fleet mean */
  deviationFromMean: number;
  criticalGaps: Array<{ questionId: string; level: number; fleetAvg: number }>;
  riskLabel: "critical" | "high" | "medium" | "low";
}

export interface AgentComparison {
  agentA: string;
  agentB: string;
  scoreDelta: number;
  /** Questions where A > B by ≥2 levels */
  aLeads: Array<{ questionId: string; aLevel: number; bLevel: number }>;
  /** Questions where B > A by ≥2 levels */
  bLeads: Array<{ questionId: string; aLevel: number; bLevel: number }>;
  /** Questions where both score ≤1 */
  sharedWeaknesses: string[];
}

export interface FleetScoringResult {
  runId: string;
  ts: number;
  window: string;
  agentCount: number;
  agents: AgentScoreSummary[];
  aggregate: FleetAggregate;
  weakLinks: WeakLink[];
  pairComparisons: AgentComparison[];
  diagnosticReports: DiagnosticReport[];
  reportSha256: string;
}

/* ── Helpers ───────────────────────────────────────── */

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(squaredDiffs.reduce((s, v) => s + v, 0) / values.length);
}

function overallFromLayers(layerScores: LayerScore[]): number {
  if (layerScores.length === 0) return 0;
  return layerScores.reduce((sum, l) => sum + l.avgFinalLevel, 0) / layerScores.length;
}

function summarizeAgent(report: DiagnosticReport): AgentScoreSummary {
  const overall = overallFromLayers(report.layerScores);
  const layers: Record<string, number> = {};
  for (const layer of report.layerScores) {
    layers[layer.layerName] = layer.avgFinalLevel;
  }

  const sorted = [...report.questionScores].sort((a, b) => a.finalLevel - b.finalLevel);
  const weakest = sorted.slice(0, 5).map((q) => ({
    questionId: q.questionId,
    level: q.finalLevel,
    gap: report.targetDiff.find((d) => d.questionId === q.questionId)?.gap ?? 0,
  }));
  const strongest = [...sorted].reverse().slice(0, 5).map((q) => ({
    questionId: q.questionId,
    level: q.finalLevel,
  }));

  return {
    agentId: report.agentId,
    overallScore: Number(overall.toFixed(3)),
    integrityIndex: report.integrityIndex,
    trustLabel: report.trustLabel,
    layerScores: layers,
    weakestQuestions: weakest,
    strongestQuestions: strongest,
    evidenceCoverage: report.evidenceCoverage,
    status: report.status,
  };
}

/* ── Weak Link Detection ──────────────────────────── */

function detectWeakLinks(
  agents: AgentScoreSummary[],
  questionAverages: Map<string, number>,
  fleetMean: number,
  fleetSD: number
): WeakLink[] {
  const links: WeakLink[] = [];

  for (const agent of agents) {
    const deviation = fleetSD > 0 ? (fleetMean - agent.overallScore) / fleetSD : 0;

    // Agents below the mean by ≥0.5 std devs are potential weak links
    if (deviation < 0.5 && agents.length > 1) continue;

    const criticalGaps: WeakLink["criticalGaps"] = [];
    for (const wq of agent.weakestQuestions) {
      const fleetAvg = questionAverages.get(wq.questionId) ?? 0;
      if (wq.level < fleetAvg - 0.5) {
        criticalGaps.push({
          questionId: wq.questionId,
          level: wq.level,
          fleetAvg: Number(fleetAvg.toFixed(2)),
        });
      }
    }

    let riskLabel: WeakLink["riskLabel"];
    if (agent.overallScore < 1.5 || deviation >= 2) riskLabel = "critical";
    else if (agent.overallScore < 2.5 || deviation >= 1.5) riskLabel = "high";
    else if (deviation >= 1) riskLabel = "medium";
    else riskLabel = "low";

    links.push({
      agentId: agent.agentId,
      overallScore: agent.overallScore,
      deviationFromMean: Number(deviation.toFixed(2)),
      criticalGaps,
      riskLabel,
    });
  }

  return links.sort((a, b) => b.deviationFromMean - a.deviationFromMean);
}

/* ── Pairwise Comparison ──────────────────────────── */

function compareAgents(
  a: DiagnosticReport,
  b: DiagnosticReport
): AgentComparison {
  const aMap = new Map(a.questionScores.map((q) => [q.questionId, q.finalLevel]));
  const bMap = new Map(b.questionScores.map((q) => [q.questionId, q.finalLevel]));
  const allIds = new Set([...aMap.keys(), ...bMap.keys()]);

  const aLeads: AgentComparison["aLeads"] = [];
  const bLeads: AgentComparison["bLeads"] = [];
  const sharedWeaknesses: string[] = [];

  for (const qid of allIds) {
    const aLvl = aMap.get(qid) ?? 0;
    const bLvl = bMap.get(qid) ?? 0;
    if (aLvl - bLvl >= 2) aLeads.push({ questionId: qid, aLevel: aLvl, bLevel: bLvl });
    if (bLvl - aLvl >= 2) bLeads.push({ questionId: qid, aLevel: aLvl, bLevel: bLvl });
    if (aLvl <= 1 && bLvl <= 1) sharedWeaknesses.push(qid);
  }

  const overallA = overallFromLayers(a.layerScores);
  const overallB = overallFromLayers(b.layerScores);

  return {
    agentA: a.agentId,
    agentB: b.agentId,
    scoreDelta: Number((overallA - overallB).toFixed(3)),
    aLeads,
    bLeads,
    sharedWeaknesses,
  };
}

/* ── Aggregate ─────────────────────────────────────── */

function computeAggregate(
  agents: AgentScoreSummary[],
  reports: DiagnosticReport[]
): FleetAggregate {
  const scores = agents.map((a) => a.overallScore);
  const allLayers = new Set<string>();
  for (const a of agents) {
    for (const l of Object.keys(a.layerScores)) allLayers.add(l);
  }

  const layerAverages: Record<string, number> = {};
  const layerWorst: Record<string, { agentId: string; score: number }> = {};
  for (const layer of allLayers) {
    const vals = agents.map((a) => ({ agentId: a.agentId, score: a.layerScores[layer] ?? 0 }));
    layerAverages[layer] = Number(mean(vals.map((v) => v.score)).toFixed(3));
    const worst = vals.reduce((min, v) => (v.score < min.score ? v : min), vals[0]!);
    layerWorst[layer] = worst;
  }

  return {
    fleetMeanScore: Number(mean(scores).toFixed(3)),
    fleetMedianScore: Number(median(scores).toFixed(3)),
    fleetMinScore: Number(Math.min(...scores).toFixed(3)),
    fleetMaxScore: Number(Math.max(...scores).toFixed(3)),
    fleetStdDev: Number(stdDev(scores).toFixed(3)),
    layerAverages,
    layerWorst,
  };
}

/* ── Main Entry ────────────────────────────────────── */

export interface FleetScoringOptions {
  workspace: string;
  window: string;
  /** Subset of agent IDs to evaluate. If empty/undefined, evaluates all. */
  agentIds?: string[];
  /** Max pairwise comparisons (default: 50, set 0 to skip) */
  maxComparisons?: number;
  /** Output path for report JSON (optional) */
  outputPath?: string;
}

export async function evaluateFleet(opts: FleetScoringOptions): Promise<FleetScoringResult> {
  const { workspace, window: windowStr } = opts;
  const maxComparisons = opts.maxComparisons ?? 50;
  const runId = randomUUID();

  // Determine which agents to evaluate
  let targetAgentIds: string[];
  if (opts.agentIds && opts.agentIds.length > 0) {
    targetAgentIds = opts.agentIds;
  } else {
    const listed = listAgents(workspace);
    targetAgentIds = listed.length > 0 ? listed.map((a) => a.id) : ["default"];
  }

  // Run diagnostics for all agents
  const diagnosticReports: DiagnosticReport[] = [];
  for (const agentId of targetAgentIds) {
    const report = await runDiagnostic({
      workspace,
      window: windowStr,
      targetName: "default",
      claimMode: "auto",
      agentId,
    });
    diagnosticReports.push(report);
  }

  // Summarize each agent
  const agents = diagnosticReports.map(summarizeAgent);

  // Fleet aggregate
  const aggregate = computeAggregate(agents, diagnosticReports);

  // Per-question averages for weak-link detection
  const questionAverages = new Map<string, number>();
  const questionBuckets = new Map<string, number[]>();
  for (const report of diagnosticReports) {
    for (const q of report.questionScores) {
      const bucket = questionBuckets.get(q.questionId) ?? [];
      bucket.push(q.finalLevel);
      questionBuckets.set(q.questionId, bucket);
    }
  }
  for (const [qid, vals] of questionBuckets) {
    questionAverages.set(qid, mean(vals));
  }

  // Weak links
  const weakLinks = detectWeakLinks(
    agents,
    questionAverages,
    aggregate.fleetMeanScore,
    aggregate.fleetStdDev
  );

  // Pairwise comparisons (capped)
  const pairComparisons: AgentComparison[] = [];
  if (maxComparisons > 0) {
    let pairCount = 0;
    for (let i = 0; i < diagnosticReports.length && pairCount < maxComparisons; i++) {
      for (let j = i + 1; j < diagnosticReports.length && pairCount < maxComparisons; j++) {
        pairComparisons.push(compareAgents(diagnosticReports[i]!, diagnosticReports[j]!));
        pairCount++;
      }
    }
  }

  const result: FleetScoringResult = {
    runId,
    ts: Date.now(),
    window: windowStr,
    agentCount: targetAgentIds.length,
    agents,
    aggregate,
    weakLinks,
    pairComparisons,
    diagnosticReports,
    reportSha256: "",
  };

  // Seal
  const { diagnosticReports: _dr, reportSha256: _s, ...forHash } = result;
  result.reportSha256 = sha256Hex(Buffer.from(canonicalize(forHash), "utf8"));

  // Write output if requested
  if (opts.outputPath) {
    const dir = join(workspace, ".amc", "reports");
    ensureDir(dir);
    const outPath = opts.outputPath.startsWith("/")
      ? opts.outputPath
      : join(dir, opts.outputPath);
    writeFileAtomic(outPath, JSON.stringify(result, null, 2), 0o644);
  }

  return result;
}

/* ── Markdown Renderer ─────────────────────────────── */

export function renderFleetScoringMarkdown(result: FleetScoringResult): string {
  const lines: string[] = [
    "# Fleet Scoring Report",
    "",
    `- **Run ID:** ${result.runId}`,
    `- **Timestamp:** ${new Date(result.ts).toISOString()}`,
    `- **Window:** ${result.window}`,
    `- **Agents evaluated:** ${result.agentCount}`,
    `- **Report hash:** \`${result.reportSha256.slice(0, 16)}…\``,
    "",
    "## Fleet Aggregate",
    "",
    `| Metric | Value |`,
    `|--------|------:|`,
    `| Mean Score | ${result.aggregate.fleetMeanScore} |`,
    `| Median Score | ${result.aggregate.fleetMedianScore} |`,
    `| Min Score | ${result.aggregate.fleetMinScore} |`,
    `| Max Score | ${result.aggregate.fleetMaxScore} |`,
    `| Std Dev | ${result.aggregate.fleetStdDev} |`,
    "",
    "### Layer Averages",
    "",
    "| Layer | Fleet Avg | Weakest Agent | Weakest Score |",
    "|-------|----------:|---------------|-------------:|",
  ];

  for (const [layer, avg] of Object.entries(result.aggregate.layerAverages)) {
    const worst = result.aggregate.layerWorst[layer];
    lines.push(
      `| ${layer} | ${avg} | ${worst?.agentId ?? "-"} | ${worst?.score ?? "-"} |`
    );
  }

  lines.push("", "## Per-Agent Scores", "");
  lines.push("| Agent | Overall | Integrity | Trust | Evidence Coverage | Status |");
  lines.push("|-------|--------:|----------:|-------|------------------:|--------|");
  for (const a of result.agents) {
    lines.push(
      `| ${a.agentId} | ${a.overallScore} | ${a.integrityIndex.toFixed(3)} | ${a.trustLabel} | ${(a.evidenceCoverage * 100).toFixed(1)}% | ${a.status} |`
    );
  }

  if (result.weakLinks.length > 0) {
    lines.push("", "## ⚠️ Weak Links", "");
    lines.push("| Agent | Score | Deviation | Risk | Critical Gaps |");
    lines.push("|-------|------:|----------:|------|---------------|");
    for (const wl of result.weakLinks) {
      const gaps = wl.criticalGaps
        .slice(0, 3)
        .map((g) => `${g.questionId}(${g.level} vs fleet ${g.fleetAvg})`)
        .join(", ");
      lines.push(
        `| ${wl.agentId} | ${wl.overallScore} | ${wl.deviationFromMean}σ | **${wl.riskLabel}** | ${gaps || "-"} |`
      );
    }
  }

  if (result.pairComparisons.length > 0) {
    lines.push("", "## Agent Comparisons", "");
    for (const cmp of result.pairComparisons.slice(0, 10)) {
      lines.push(`### ${cmp.agentA} vs ${cmp.agentB} (Δ ${cmp.scoreDelta > 0 ? "+" : ""}${cmp.scoreDelta})`);
      if (cmp.aLeads.length > 0) {
        lines.push(`- **${cmp.agentA} leads (≥2 levels):** ${cmp.aLeads.map((l) => `${l.questionId}(${l.aLevel}v${l.bLevel})`).join(", ")}`);
      }
      if (cmp.bLeads.length > 0) {
        lines.push(`- **${cmp.agentB} leads (≥2 levels):** ${cmp.bLeads.map((l) => `${l.questionId}(${l.bLevel}v${l.aLevel})`).join(", ")}`);
      }
      if (cmp.sharedWeaknesses.length > 0) {
        lines.push(`- **Shared weaknesses (both ≤1):** ${cmp.sharedWeaknesses.slice(0, 10).join(", ")}${cmp.sharedWeaknesses.length > 10 ? ` (+${cmp.sharedWeaknesses.length - 10} more)` : ""}`);
      }
      lines.push("");
    }
  }

  lines.push("");
  return lines.join("\n");
}
