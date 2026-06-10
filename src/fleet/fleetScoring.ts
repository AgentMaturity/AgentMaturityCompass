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
import { enforceResourceManifestRef, writeEnforceResourceManifest } from "../enforce/resourceManifest.js";
import { observeDecisionOutcomes, writeDecisionReceipts } from "../lifecycle/decisionReceipt.js";
import { writeEpisodeRecord } from "../lifecycle/episodeRecord.js";
import { writeFindingProofs } from "../lifecycle/findingProof.js";
import { writeLifecycleChangeReceipts } from "../lifecycle/changeReceipt.js";
import { writeLifecycleRunArtifact } from "../lifecycle/lifecycleRunArtifact.js";
import { writeObservabilityLaneRecord } from "../lifecycle/observabilityLane.js";
import type { DiagnosticReport, LayerScore, QuestionScore } from "../types.js";
import { detectFleetCascadeFailures, writeFleetLifecycleRunArtifact, type FleetCascadeFailure } from "./fleetLifecycle.js";
import {
  loadLatestTypedMultiAgentGraph,
  typedMultiAgentGraphRef,
  type TypedGraphValidationIssue,
  type TypedMultiAgentGraphRef
} from "./typedGraph.js";

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
  status: "VALID" | "INVALID" | "UNSIGNED";
  durationMs: number;
  firstResultMs: number;
  slaMs: number;
  slaStatus: "met" | "missed";
  lifecycleArtifactPath: string | null;
  episodePath: string | null;
  resourceManifestId: string | null;
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
  failures: FleetAgentScoreFailure[];
  aggregate: FleetAggregate;
  weakLinks: WeakLink[];
  cascadeFailures: FleetCascadeFailure[];
  typedGraph?: TypedMultiAgentGraphRef | null;
  graphRisks?: TypedGraphValidationIssue[];
  pairComparisons: AgentComparison[];
  diagnosticReports: DiagnosticReport[];
  progressEvents: FleetScoreProgressEvent[];
  fleetLifecycle: {
    fleetLifecycleRunId: string;
    parentRunId: string;
    artifactPath: string;
    signaturePath: string | null;
    status: "complete" | "partial" | "degraded";
    childRunCount: number;
    cascadeFailureCount: number;
    sharedResourceManifestId: string | null;
  } | null;
  reportSha256: string;
}

export type FleetScoreProgressStage =
  | "queued"
  | "initialized"
  | "scoring"
  | "scored"
  | "lifecycle-continuing"
  | "failed"
  | "skipped"
  | "complete";

export interface FleetScoreProgressEvent {
  runId: string;
  agentId: string | null;
  stage: FleetScoreProgressStage;
  ts: number;
  elapsedMs: number;
  message: string;
  score?: number;
  lifecycleArtifactPath?: string | null;
  error?: string;
}

export interface FleetAgentScoreFailure {
  agentId: string;
  status: "failed" | "skipped";
  durationMs: number;
  firstResultMs: number | null;
  error: string;
  actionableReason: string;
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

function summarizeAgent(
  report: DiagnosticReport,
  timing: { durationMs: number; firstResultMs: number; slaMs: number },
  lifecycle: { lifecycleArtifactPath: string | null; episodePath: string | null; resourceManifestId: string | null }
): AgentScoreSummary {
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
    durationMs: timing.durationMs,
    firstResultMs: timing.firstResultMs,
    slaMs: timing.slaMs,
    slaStatus: timing.firstResultMs <= timing.slaMs ? "met" : "missed",
    lifecycleArtifactPath: lifecycle.lifecycleArtifactPath,
    episodePath: lifecycle.episodePath,
    resourceManifestId: lifecycle.resourceManifestId,
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
  if (scores.length === 0) {
    return {
      fleetMeanScore: 0,
      fleetMedianScore: 0,
      fleetMinScore: 0,
      fleetMaxScore: 0,
      fleetStdDev: 0,
      layerAverages: {},
      layerWorst: {}
    };
  }
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
  /** Target first-result SLA per agent. Defaults to 120 seconds. */
  slaMs?: number;
  /** Max concurrent agent diagnostics. Defaults to 4 or agent count. */
  concurrency?: number;
  /** Emit progress events as agents move through the full-score lifecycle. */
  onProgress?: (event: FleetScoreProgressEvent) => void;
}

export async function evaluateFleet(opts: FleetScoringOptions): Promise<FleetScoringResult> {
  const { workspace, window: windowStr } = opts;
  const maxComparisons = opts.maxComparisons ?? 50;
  const slaMs = opts.slaMs ?? 120_000;
  const runId = randomUUID();
  const runStarted = Date.now();
  const progressEvents: FleetScoreProgressEvent[] = [];

  const emit = (event: Omit<FleetScoreProgressEvent, "runId" | "ts" | "elapsedMs">): void => {
    const full: FleetScoreProgressEvent = {
      runId,
      ts: Date.now(),
      elapsedMs: Date.now() - runStarted,
      ...event
    };
    progressEvents.push(full);
    opts.onProgress?.(full);
  };

  // Determine which agents to evaluate
  let targetAgentIds: string[];
  if (opts.agentIds && opts.agentIds.length > 0) {
    targetAgentIds = opts.agentIds;
  } else {
    const listed = listAgents(workspace);
    targetAgentIds = listed.length > 0 ? listed.map((a) => a.id) : ["default"];
  }

  for (const agentId of targetAgentIds) {
    emit({ agentId, stage: "queued", message: "Agent queued for full score." });
  }

  // Run full diagnostics for all agents. This intentionally uses runDiagnostic, not quickscore.
  const diagnosticReports: DiagnosticReport[] = [];
  const agents: AgentScoreSummary[] = [];
  const failures: FleetAgentScoreFailure[] = [];
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 4, targetAgentIds.length || 1));
  let cursor = 0;

  const writeLifecycleRefs = (report: DiagnosticReport): {
    lifecycleArtifactPath: string | null;
    episodePath: string | null;
    resourceManifestId: string | null;
  } => {
    const resourceManifest = writeEnforceResourceManifest({ workspace, agentId: report.agentId });
    const resourceRef = enforceResourceManifestRef(resourceManifest);
    const decisions = writeDecisionReceipts({
      workspace,
      report,
      command: "amc fleet score",
      resourceManifestIds: [resourceRef.manifestId]
    });
    const findingProofs = writeFindingProofs({
      workspace,
      report,
      command: "amc fleet score",
      episodeIds: [`episode-${report.runId}`],
      resourceManifestIds: [resourceRef.manifestId],
      decisionReceipts: decisions.receipts
    });
    const lifecycleReceipts = writeLifecycleChangeReceipts({
      workspace,
      report,
      command: "amc fleet score",
      resourceManifestIds: [resourceRef.manifestId],
      decisionReceipts: decisions.receipts,
      findingProofs: [findingProofs.proofSetRef]
    });
    const observed = observeDecisionOutcomes({
      workspace,
      agentId: report.agentId,
      report
    });
    const observability = writeObservabilityLaneRecord({
      workspace,
      report,
      source: "cli",
      command: "amc fleet score",
      episodeIds: [`episode-${report.runId}`],
      lifecycleReceiptIds: lifecycleReceipts.receipts.map((receipt) => receipt.receiptId),
      resourceManifests: [resourceRef],
      decisionReceipts: [...observed.updatedReceipts, ...decisions.receipts],
      observedDecisionReceiptIds: observed.updatedReceipts.map((receipt) => receipt.receiptId)
    });
    const episode = writeEpisodeRecord({
      workspace,
      report,
      source: "cli",
      command: "amc fleet score",
      resourceManifestIds: [resourceRef.manifestId],
      receipts: [
        ...decisions.receipts.map((receipt) => receipt.receiptId),
        ...lifecycleReceipts.refs.map((receipt) => receipt.receiptId)
      ],
      observabilityRecords: [observability.ref]
    });
    const lifecycle = writeLifecycleRunArtifact({
      workspace,
      report,
      source: "cli",
      command: "amc fleet score",
      episodeRecords: [{ episodeId: episode.episode.episodeId, path: episode.episodePath }],
      decisionReceipts: decisions.receipts.map((receipt) => ({ receiptId: receipt.receiptId, path: decisions.receiptsPath })),
      lifecycleReceipts: lifecycleReceipts.refs,
      findingProofs: [findingProofs.proofSetRef],
      observabilityRecords: [observability.ref],
      resourceManifests: [resourceRef]
    });
    return {
      lifecycleArtifactPath: lifecycle.artifactPath,
      episodePath: episode.episodePath,
      resourceManifestId: resourceRef.manifestId
    };
  };

  const scoreAgent = async (agentId: string): Promise<void> => {
    const agentStarted = Date.now();
    emit({ agentId, stage: "initialized", message: "Agent full-score lifecycle initialized." });
    try {
      emit({ agentId, stage: "scoring", message: "Running full diagnostic score." });
      const report = await runDiagnostic({
        workspace,
        window: windowStr,
        targetName: "default",
        claimMode: "auto",
        agentId,
      });
      diagnosticReports.push(report);
      const firstResultMs = Date.now() - agentStarted;
      emit({
        agentId,
        stage: "scored",
        message: `Full diagnostic score generated in ${firstResultMs}ms.`,
        score: Number(overallFromLayers(report.layerScores).toFixed(3))
      });
      emit({ agentId, stage: "lifecycle-continuing", message: "Writing lifecycle artifacts and evidence refs." });
      const lifecycle = writeLifecycleRefs(report);
      agents.push(summarizeAgent(report, {
        durationMs: Date.now() - agentStarted,
        firstResultMs,
        slaMs
      }, lifecycle));
      emit({
        agentId,
        stage: "complete",
        message: "Agent full-score lifecycle complete.",
        lifecycleArtifactPath: lifecycle.lifecycleArtifactPath
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({
        agentId,
        status: "failed",
        durationMs: Date.now() - agentStarted,
        firstResultMs: null,
        error: message,
        actionableReason: `Score this agent individually with 'amc --agent ${agentId} --json' and inspect the error before rerunning the fleet.`
      });
      emit({ agentId, stage: "failed", message: "Agent full score failed; continuing fleet.", error: message });
    }
  };

  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < targetAgentIds.length) {
      const nextIndex = cursor;
      cursor += 1;
      const agentId = targetAgentIds[nextIndex];
      if (!agentId) continue;
      await scoreAgent(agentId);
    }
  });
  await Promise.all(workers);

  agents.sort((a, b) => targetAgentIds.indexOf(a.agentId) - targetAgentIds.indexOf(b.agentId));
  diagnosticReports.sort((a, b) => targetAgentIds.indexOf(a.agentId) - targetAgentIds.indexOf(b.agentId));

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
  const latestGraph = loadLatestTypedMultiAgentGraph(workspace);
  const typedGraph = latestGraph ? typedMultiAgentGraphRef({ workspace, graph: latestGraph }) : null;
  const graphRisks = typedGraph?.validation.issues ?? [];
  if (typedGraph) {
    emit({
      agentId: null,
      stage: "scored",
      message: typedGraph.validation.valid
        ? `Typed multi-agent graph ${typedGraph.graphId} validated successfully.`
        : `Typed multi-agent graph ${typedGraph.graphId} has ${typedGraph.validation.issueCount} validation issue(s).`
    });
  } else {
    emit({
      agentId: null,
      stage: "skipped",
      message: "No typed multi-agent graph found; fleet score continues without graph-level topology evidence."
    });
  }

  const cascadeFailures = detectFleetCascadeFailures({
    runId,
    ts: Date.now(),
    window: windowStr,
    agentCount: targetAgentIds.length,
    agents,
    failures,
    aggregate,
    weakLinks,
    cascadeFailures: [],
    typedGraph,
    graphRisks,
    pairComparisons,
    diagnosticReports,
    progressEvents,
    fleetLifecycle: null,
    reportSha256: ""
  });

  const result: FleetScoringResult = {
    runId,
    ts: Date.now(),
    window: windowStr,
    agentCount: targetAgentIds.length,
    agents,
    failures,
    aggregate,
    weakLinks,
    cascadeFailures,
    typedGraph,
    graphRisks,
    pairComparisons,
    diagnosticReports,
    progressEvents,
    fleetLifecycle: null,
    reportSha256: "",
  };

  // Seal
  const { diagnosticReports: _dr, reportSha256: _s, ...forHash } = result;
  result.reportSha256 = sha256Hex(Buffer.from(canonicalize(forHash), "utf8"));

  const sharedResource = writeEnforceResourceManifest({ workspace, agentId: "default" });
  const sharedResourceRef = enforceResourceManifestRef(sharedResource);
  const fleetLifecycle = writeFleetLifecycleRunArtifact({
    workspace,
    result,
    sharedResourceManifest: sharedResourceRef
  });
  result.fleetLifecycle = {
    fleetLifecycleRunId: fleetLifecycle.artifact.fleetLifecycleRunId,
    parentRunId: fleetLifecycle.artifact.parentRunId,
    artifactPath: fleetLifecycle.artifactPath,
    signaturePath: fleetLifecycle.signaturePath,
    status: fleetLifecycle.artifact.status,
    childRunCount: fleetLifecycle.artifact.childRuns.length,
    cascadeFailureCount: fleetLifecycle.artifact.cascadeFailures.length,
    sharedResourceManifestId: sharedResourceRef.manifestId
  };
  emit({
    agentId: null,
    stage: "complete",
    message: `Fleet lifecycle parent artifact written with ${result.fleetLifecycle.childRunCount} child run(s).`,
    lifecycleArtifactPath: fleetLifecycle.artifactPath
  });

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
    `- **Agents scored:** ${result.agents.length}`,
    `- **Failures:** ${result.failures.length}`,
    `- **Report hash:** \`${result.reportSha256.slice(0, 16)}…\``,
    `- **Fleet lifecycle:** ${result.fleetLifecycle?.fleetLifecycleRunId ?? "not written"}`,
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
  lines.push("| Agent | Overall | First Result | SLA | Integrity | Trust | Evidence Coverage | Status |");
  lines.push("|-------|--------:|-------------:|-----|----------:|-------|------------------:|--------|");
  for (const a of result.agents) {
    lines.push(
      `| ${a.agentId} | ${a.overallScore} | ${a.firstResultMs}ms | ${a.slaStatus} | ${a.integrityIndex.toFixed(3)} | ${a.trustLabel} | ${(a.evidenceCoverage * 100).toFixed(1)}% | ${a.status} |`
    );
  }

  if (result.failures.length > 0) {
    lines.push("", "## Partial Failures", "");
    lines.push("| Agent | Duration | Reason |");
    lines.push("|-------|---------:|--------|");
    for (const failure of result.failures) {
      lines.push(`| ${failure.agentId} | ${failure.durationMs}ms | ${failure.actionableReason} |`);
    }
  }

  if (result.fleetLifecycle) {
    lines.push("", "## Fleet Lifecycle Evidence", "");
    lines.push(`- Parent run: \`${result.fleetLifecycle.parentRunId}\``);
    lines.push(`- Artifact: \`${result.fleetLifecycle.artifactPath}\``);
    lines.push(`- Child runs: ${result.fleetLifecycle.childRunCount}`);
    lines.push(`- Cascade failures: ${result.fleetLifecycle.cascadeFailureCount}`);
    lines.push(`- Shared resource manifest: \`${result.fleetLifecycle.sharedResourceManifestId ?? "none"}\``);
  }

  if (result.cascadeFailures.length > 0) {
    lines.push("", "## Cross-Agent Cascade Failures", "");
    lines.push("| Severity | Type | Agents | Questions | Summary |");
    lines.push("|----------|------|--------|-----------|---------|");
    for (const failure of result.cascadeFailures.slice(0, 12)) {
      lines.push(`| ${failure.severity} | ${failure.type} | ${failure.agentIds.join(", ") || "graph"} | ${failure.questionIds.join(", ") || "-"} | ${failure.summary} |`);
    }
  }

  if (result.typedGraph) {
    lines.push("", "## Typed Multi-Agent Graph", "");
    lines.push(`- Graph: \`${result.typedGraph.graphId}\``);
    lines.push(`- Digest: \`${result.typedGraph.digestSha256.slice(0, 16)}…\``);
    lines.push(`- Nodes: ${result.typedGraph.nodeCount}`);
    lines.push(`- Edges: ${result.typedGraph.edgeCount}`);
    lines.push(`- Validation: ${result.typedGraph.validation.summary}`);
    if ((result.graphRisks ?? []).length > 0) {
      lines.push("", "| Severity | Code | Target | Message |");
      lines.push("|----------|------|--------|---------|");
      for (const risk of (result.graphRisks ?? []).slice(0, 12)) {
        lines.push(`| ${risk.severity} | ${risk.code} | ${risk.nodeId ?? risk.edgeId ?? "graph"} | ${risk.message} |`);
      }
    }
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
