import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import {
  runLiveScoreBehaviorDrift,
  type LiveDriftAlert,
  type LiveDriftMetricId,
  type LiveDriftReceipt,
  type LiveDriftSampleRow,
  type LiveDriftSeverity,
  type LiveDriftThresholds,
  type LiveDriftWindow,
} from "./liveDriftAlerts.js";
import {
  hasNonBlankEvidenceRef,
  normalizeEvidenceRefs,
} from "./evidenceRefs.js";

export type LlmFighterWinner = "agent" | "opponent" | "draw" | "unknown";

export interface LlmFighterLiveDriftRow {
  traceId: string;
  scenarioId: string;
  timestamp: string;
  benchmarkId: string;
  sourceRefHash: string;
  repositorySnapshotHash: string;
  licenseRefHash: string;
  homepageRefHash: string;
  readmeBlobHash: string;
  apiTreeHash: string;
  apiGameResultEndpointHash: string;
  apiPersistenceSchemaHash: string;
  uiTreeHash: string;
  gameEngineHash: string;
  gameRunnerHash: string;
  llmAdapterHash: string;
  yamlExportHash: string;
  gameUiComponentHash: string;
  baselineResultHash?: string;
  liveResultHash?: string;
  driftStatisticHash?: string;
  alertReceiptHash?: string;
  arenaId: string;
  gameId: string;
  rulesetId: string;
  modelRosterHash: string;
  playerModelId: string;
  opponentModelId: string;
  skillSetHash: string;
  combatLogHash: string;
  exportedLogHash: string;
  winner: LlmFighterWinner;
  gameScore0to1: number;
  actionValidityRate0to1: number;
  combatStability0to1: number;
  turnCount: number;
  latencyMs: number;
  costUsd: number;
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
}

export interface LlmFighterWindow {
  windowId: string;
  startedAt: string;
  endedAt: string;
  rows: LlmFighterLiveDriftRow[];
}

export interface LlmFighterLiveDriftThresholds {
  maxWinRateDrop0to1: number;
  maxGameScoreDrop0to1: number;
  maxCombatStabilityDrop0to1: number;
  maxActionValidityDrop0to1: number;
  minTraceCoverage0to1: number;
  minExportCoverage0to1: number;
  minEvidenceCoverage0to1: number;
  maxArenaDivergence0to1: number;
  maxModelRosterDivergence0to1: number;
  maxRulesetDivergence0to1: number;
  maxContextDivergence0to1: number;
  maxTurnCountShiftRatio: number;
  maxLatencyP95IncreaseRatio: number;
  maxCostIncreaseRatio: number;
}

export interface RunLlmFighterLiveDriftInput {
  agentId: string;
  baselineWindow: LlmFighterWindow;
  liveWindow: LlmFighterWindow;
  thresholds?: Partial<LlmFighterLiveDriftThresholds>;
  liveDriftThresholds?: Partial<LiveDriftThresholds>;
  sourceRefs?: string[];
  now?: Date;
}

export interface LlmFighterDistribution {
  rowCount: number;
  scoreMean0to1: number;
  winRate0to1: number;
  drawRate0to1: number;
  gameScoreMean0to1: number;
  actionValidityRateMean0to1: number;
  combatStabilityMean0to1: number;
  traceCoverage0to1: number;
  exportCoverage0to1: number;
  evidenceCoverage0to1: number;
  turnCountMean: number;
  latencyP95Ms: number;
  costUsdMean: number;
  arenaDistribution: Record<string, number>;
  modelRosterDistribution: Record<string, number>;
  rulesetDistribution: Record<string, number>;
  contextDistribution: Record<string, number>;
}

export interface LlmFighterScoreDrift {
  scoreDrop0to1: number;
  winRateDrop0to1: number;
  gameScoreDrop0to1: number;
  actionValidityDrop0to1: number;
  combatStabilityDrop0to1: number;
  traceCoverageDrop0to1: number;
  exportCoverageDrop0to1: number;
  evidenceCoverageDrop0to1: number;
  turnCountShiftRatio: number;
  latencyP95IncreaseRatio: number;
  costIncreaseRatio: number;
}

export interface LlmFighterBehaviorDrift {
  arenaDivergence0to1: number;
  modelRosterDivergence0to1: number;
  rulesetDivergence0to1: number;
  contextDivergence0to1: number;
}

export interface LlmFighterReceiptRow extends LlmFighterLiveDriftRow {
  receiptScore0to1: number;
  evidenceCoverage0to1: number;
  rowHash: string;
}

export interface LlmFighterLiveDriftResult {
  receipt: LiveDriftReceipt;
  llmFighterReceiptHash: string;
  baselineRows: LlmFighterReceiptRow[];
  liveRows: LlmFighterReceiptRow[];
  baselineDistribution: LlmFighterDistribution;
  liveDistribution: LlmFighterDistribution;
  scoreDrift: LlmFighterScoreDrift;
  behaviorDrift: LlmFighterBehaviorDrift;
}

const DEFAULT_SOURCE_REF = "https://github.com/neutree-ai/llm-fighter";
const DEFAULT_HOMEPAGE_REF = "https://llm-fighter.com/";

export const defaultLlmFighterLiveDriftThresholds: LlmFighterLiveDriftThresholds = {
  maxWinRateDrop0to1: 0.15,
  maxGameScoreDrop0to1: 0.08,
  maxCombatStabilityDrop0to1: 0.08,
  maxActionValidityDrop0to1: 0.05,
  minTraceCoverage0to1: 1,
  minExportCoverage0to1: 1,
  minEvidenceCoverage0to1: 1,
  maxArenaDivergence0to1: 0.35,
  maxModelRosterDivergence0to1: 0.25,
  maxRulesetDivergence0to1: 0.25,
  maxContextDivergence0to1: 0.25,
  maxTurnCountShiftRatio: 0.5,
  maxLatencyP95IncreaseRatio: 0.35,
  maxCostIncreaseRatio: 0.35,
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round(value: number, places = 6): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function nonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function unique(values: unknown): string[] {
  return normalizeEvidenceRefs(values);
}

function mean(values: number[], fallback = 0): number {
  return values.length === 0 ? fallback : round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function boolMean(values: boolean[]): number {
  return values.length === 0 ? 0 : round(values.filter(Boolean).length / values.length);
}

function labelDistribution<T>(rows: T[], labelFor: (row: T) => string): Record<string, number> {
  if (rows.length === 0) return {};
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = labelFor(row);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].map(([label, count]) => [label, round(count / rows.length)]));
}

function totalVariationDistance(left: Record<string, number>, right: Record<string, number>): number {
  const labels = new Set([...Object.keys(left), ...Object.keys(right)]);
  let total = 0;
  for (const label of labels) {
    total += Math.abs((left[label] ?? 0) - (right[label] ?? 0));
  }
  return round(total / 2);
}

function percentile(values: number[], p: number): number {
  const finite = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (finite.length === 0) return 0;
  const index = Math.min(finite.length - 1, Math.max(0, Math.ceil((p / 100) * finite.length) - 1));
  return round(finite[index]!);
}

function ratioIncrease(baseline: number, live: number): number {
  if (!Number.isFinite(baseline) || !Number.isFinite(live) || baseline <= 0) return live > baseline ? 1 : 0;
  return round(Math.max(0, (live - baseline) / baseline));
}

function ratioShift(baseline: number, live: number): number {
  if (!Number.isFinite(baseline) || !Number.isFinite(live) || baseline <= 0) return live !== baseline ? 1 : 0;
  return round(Math.abs(live - baseline) / baseline);
}

function winnerScore(winner: LlmFighterWinner): number {
  if (winner === "agent") return 1;
  if (winner === "draw") return 0.5;
  return 0;
}

function rowScore(row: LlmFighterLiveDriftRow): number {
  return mean([
    clamp01(row.gameScore0to1),
    winnerScore(row.winner),
    clamp01(row.actionValidityRate0to1),
    clamp01(row.combatStability0to1),
    nonEmpty(row.combatLogHash) ? 1 : 0,
    nonEmpty(row.exportedLogHash) ? 1 : 0,
  ]);
}

function rowEvidenceCoverage(row: LlmFighterLiveDriftRow, phase: "baseline" | "live"): number {
  const phaseProof = phase === "baseline"
    ? [nonEmpty(row.baselineResultHash)]
    : [nonEmpty(row.liveResultHash), nonEmpty(row.driftStatisticHash), nonEmpty(row.alertReceiptHash)];
  const checks = [
    nonEmpty(row.benchmarkId),
    nonEmpty(row.sourceRefHash),
    nonEmpty(row.repositorySnapshotHash),
    nonEmpty(row.licenseRefHash),
    nonEmpty(row.homepageRefHash),
    nonEmpty(row.readmeBlobHash),
    nonEmpty(row.apiTreeHash),
    nonEmpty(row.apiGameResultEndpointHash),
    nonEmpty(row.apiPersistenceSchemaHash),
    nonEmpty(row.uiTreeHash),
    nonEmpty(row.gameEngineHash),
    nonEmpty(row.gameRunnerHash),
    nonEmpty(row.llmAdapterHash),
    nonEmpty(row.yamlExportHash),
    nonEmpty(row.gameUiComponentHash),
    nonEmpty(row.arenaId),
    nonEmpty(row.gameId),
    nonEmpty(row.rulesetId),
    nonEmpty(row.modelRosterHash),
    nonEmpty(row.playerModelId),
    nonEmpty(row.opponentModelId),
    nonEmpty(row.skillSetHash),
    nonEmpty(row.combatLogHash),
    nonEmpty(row.exportedLogHash),
    row.winner !== "unknown",
    Number.isFinite(row.gameScore0to1),
    Number.isFinite(row.actionValidityRate0to1),
    Number.isFinite(row.combatStability0to1),
    Number.isFinite(row.turnCount),
    Number.isFinite(row.latencyMs),
    Number.isFinite(row.costUsd),
    hasNonBlankEvidenceRef(row.evidenceRefs),
    hasNonBlankEvidenceRef(row.signedEvidenceRefs),
    ...phaseProof,
  ];
  return round(checks.filter(Boolean).length / checks.length);
}

function contextLabel(row: LlmFighterLiveDriftRow): string {
  return [
    row.repositorySnapshotHash || "unknown-repo",
    row.apiTreeHash || "unknown-api",
    row.uiTreeHash || "unknown-ui",
    row.gameEngineHash || "unknown-engine",
    row.gameRunnerHash || "unknown-runner",
    row.llmAdapterHash || "unknown-llm",
    row.yamlExportHash || "unknown-yaml",
    row.arenaId || "unknown-arena",
    row.rulesetId || "unknown-ruleset",
    row.modelRosterHash || "unknown-roster",
  ].join("/");
}

function toReceiptRow(row: LlmFighterLiveDriftRow, phase: "baseline" | "live"): LlmFighterReceiptRow {
  const receiptScore0to1 = rowScore(row);
  const evidenceCoverage0to1 = rowEvidenceCoverage(row, phase);
  const withoutHash = {
    ...row,
    gameScore0to1: clamp01(row.gameScore0to1),
    actionValidityRate0to1: clamp01(row.actionValidityRate0to1),
    combatStability0to1: clamp01(row.combatStability0to1),
    turnCount: Number.isFinite(row.turnCount) ? row.turnCount : 0,
    latencyMs: Number.isFinite(row.latencyMs) ? row.latencyMs : 0,
    costUsd: Number.isFinite(row.costUsd) ? row.costUsd : 0,
    receiptScore0to1,
    evidenceCoverage0to1,
  };
  return {
    ...withoutHash,
    rowHash: sha256Hex(canonicalize(withoutHash)),
  };
}

function toLiveDriftRow(row: LlmFighterLiveDriftRow): LiveDriftSampleRow {
  const score0to1 = rowScore(row);
  return {
    traceId: row.traceId,
    scenarioId: row.scenarioId,
    timestamp: row.timestamp,
    score0to1,
    passed: row.winner === "agent" && score0to1 >= 0.75,
    refused: false,
    errored: !nonEmpty(row.combatLogHash) || row.actionValidityRate0to1 < 0.5,
    behaviorSignature: `llm-fighter:${row.arenaId}:${row.rulesetId}:${row.playerModelId}:${row.opponentModelId}:${row.winner}`,
    lifecycleStage: "deployment_maintenance",
    taskCategory: "llm fighter combat evaluation",
    domain: "agent evaluation",
    agentEvaluationDimension: "evaluation_frameworks",
    latencyMs: row.latencyMs,
    toolCallCount: row.turnCount,
    costUsd: row.costUsd,
    evidenceRefs: row.evidenceRefs,
    signedEvidenceRefs: row.signedEvidenceRefs,
  };
}

function toLiveDriftWindow(window: LlmFighterWindow): LiveDriftWindow {
  return {
    windowId: window.windowId,
    startedAt: window.startedAt,
    endedAt: window.endedAt,
    rows: window.rows.map(toLiveDriftRow),
  };
}

function distribution(rows: LlmFighterReceiptRow[]): LlmFighterDistribution {
  return {
    rowCount: rows.length,
    scoreMean0to1: mean(rows.map((row) => row.receiptScore0to1)),
    winRate0to1: boolMean(rows.map((row) => row.winner === "agent")),
    drawRate0to1: boolMean(rows.map((row) => row.winner === "draw")),
    gameScoreMean0to1: mean(rows.map((row) => row.gameScore0to1)),
    actionValidityRateMean0to1: mean(rows.map((row) => row.actionValidityRate0to1)),
    combatStabilityMean0to1: mean(rows.map((row) => row.combatStability0to1)),
    traceCoverage0to1: boolMean(rows.map((row) => nonEmpty(row.combatLogHash))),
    exportCoverage0to1: boolMean(rows.map((row) => nonEmpty(row.exportedLogHash))),
    evidenceCoverage0to1: mean(rows.map((row) => row.evidenceCoverage0to1), rows.length === 0 ? 1 : 0),
    turnCountMean: mean(rows.map((row) => row.turnCount)),
    latencyP95Ms: percentile(rows.map((row) => row.latencyMs), 95),
    costUsdMean: mean(rows.map((row) => row.costUsd)),
    arenaDistribution: labelDistribution(rows, (row) => row.arenaId || "unknown"),
    modelRosterDistribution: labelDistribution(rows, (row) => row.modelRosterHash || "unknown"),
    rulesetDistribution: labelDistribution(rows, (row) => row.rulesetId || "unknown"),
    contextDistribution: labelDistribution(rows, contextLabel),
  };
}

function buildAlert(
  input: RunLlmFighterLiveDriftInput,
  metricId: LiveDriftMetricId,
  observed: number,
  threshold: number,
  message: string,
  severity: LiveDriftSeverity,
): LiveDriftAlert {
  const evidenceRefs = unique([
    ...(input.sourceRefs ?? []),
    DEFAULT_SOURCE_REF,
    DEFAULT_HOMEPAGE_REF,
    ...input.baselineWindow.rows.flatMap((row) => normalizeEvidenceRefs(row.evidenceRefs)),
    ...input.liveWindow.rows.flatMap((row) => normalizeEvidenceRefs(row.evidenceRefs)),
  ]);
  const signedEvidenceRefs = unique([
    ...input.baselineWindow.rows.flatMap((row) => normalizeEvidenceRefs(row.signedEvidenceRefs)),
    ...input.liveWindow.rows.flatMap((row) => normalizeEvidenceRefs(row.signedEvidenceRefs)),
  ]);
  return {
    alertId: `llm-fighter:${metricId}:${sha256Hex(canonicalize({ metricId, observed, threshold, message })).slice(0, 12)}`,
    metricId,
    severity,
    message,
    threshold,
    observed: round(observed),
    evidenceRefs,
    signedEvidenceRefs,
  };
}

function withAdditionalAlerts(receipt: LiveDriftReceipt, additionalAlerts: LiveDriftAlert[]): LiveDriftReceipt {
  if (additionalAlerts.length === 0) return receipt;
  const { receiptHash: _receiptHash, ...withoutHash } = receipt;
  const alerts = [...receipt.alerts, ...additionalAlerts];
  const updatedWithoutHash = {
    ...withoutHash,
    alerts,
    recommendation: "alert" as const,
    failClosed: true,
    summary: `${alerts.length} live drift alert(s), recommendation=alert`,
  };
  return {
    ...updatedWithoutHash,
    receiptHash: sha256Hex(canonicalize(updatedWithoutHash)),
  };
}

export function runLlmFighterLiveDrift(input: RunLlmFighterLiveDriftInput): LlmFighterLiveDriftResult {
  const thresholds = {
    ...defaultLlmFighterLiveDriftThresholds,
    ...(input.thresholds ?? {}),
  };
  const baselineRows = input.baselineWindow.rows.map((row) => toReceiptRow(row, "baseline"));
  const liveRows = input.liveWindow.rows.map((row) => toReceiptRow(row, "live"));
  const baselineDistribution = distribution(baselineRows);
  const liveDistribution = distribution(liveRows);
  const scoreDrift: LlmFighterScoreDrift = {
    scoreDrop0to1: round(Math.max(0, baselineDistribution.scoreMean0to1 - liveDistribution.scoreMean0to1)),
    winRateDrop0to1: round(Math.max(0, baselineDistribution.winRate0to1 - liveDistribution.winRate0to1)),
    gameScoreDrop0to1: round(Math.max(0, baselineDistribution.gameScoreMean0to1 - liveDistribution.gameScoreMean0to1)),
    actionValidityDrop0to1: round(Math.max(0, baselineDistribution.actionValidityRateMean0to1 - liveDistribution.actionValidityRateMean0to1)),
    combatStabilityDrop0to1: round(Math.max(0, baselineDistribution.combatStabilityMean0to1 - liveDistribution.combatStabilityMean0to1)),
    traceCoverageDrop0to1: round(Math.max(0, baselineDistribution.traceCoverage0to1 - liveDistribution.traceCoverage0to1)),
    exportCoverageDrop0to1: round(Math.max(0, baselineDistribution.exportCoverage0to1 - liveDistribution.exportCoverage0to1)),
    evidenceCoverageDrop0to1: round(Math.max(0, baselineDistribution.evidenceCoverage0to1 - liveDistribution.evidenceCoverage0to1)),
    turnCountShiftRatio: ratioShift(baselineDistribution.turnCountMean, liveDistribution.turnCountMean),
    latencyP95IncreaseRatio: ratioIncrease(baselineDistribution.latencyP95Ms, liveDistribution.latencyP95Ms),
    costIncreaseRatio: ratioIncrease(baselineDistribution.costUsdMean, liveDistribution.costUsdMean),
  };
  const behaviorDrift: LlmFighterBehaviorDrift = {
    arenaDivergence0to1: totalVariationDistance(baselineDistribution.arenaDistribution, liveDistribution.arenaDistribution),
    modelRosterDivergence0to1: totalVariationDistance(baselineDistribution.modelRosterDistribution, liveDistribution.modelRosterDistribution),
    rulesetDivergence0to1: totalVariationDistance(baselineDistribution.rulesetDistribution, liveDistribution.rulesetDistribution),
    contextDivergence0to1: totalVariationDistance(baselineDistribution.contextDistribution, liveDistribution.contextDistribution),
  };
  const additionalAlerts: LiveDriftAlert[] = [];
  if (scoreDrift.winRateDrop0to1 > thresholds.maxWinRateDrop0to1) {
    additionalAlerts.push(buildAlert(input, "llmFighterWinRate0to1", scoreDrift.winRateDrop0to1, thresholds.maxWinRateDrop0to1, "Live LLM Fighter win rate dropped beyond threshold.", "high"));
  }
  if (scoreDrift.gameScoreDrop0to1 > thresholds.maxGameScoreDrop0to1) {
    additionalAlerts.push(buildAlert(input, "llmFighterGameScoreMean0to1", scoreDrift.gameScoreDrop0to1, thresholds.maxGameScoreDrop0to1, "Live LLM Fighter game score dropped beyond threshold.", "high"));
  }
  if (scoreDrift.combatStabilityDrop0to1 > thresholds.maxCombatStabilityDrop0to1) {
    additionalAlerts.push(buildAlert(input, "llmFighterCombatStability0to1", scoreDrift.combatStabilityDrop0to1, thresholds.maxCombatStabilityDrop0to1, "Live LLM Fighter combat stability dropped beyond threshold.", "high"));
  }
  if (scoreDrift.actionValidityDrop0to1 > thresholds.maxActionValidityDrop0to1) {
    additionalAlerts.push(buildAlert(input, "llmFighterActionValidityRate0to1", scoreDrift.actionValidityDrop0to1, thresholds.maxActionValidityDrop0to1, "Live LLM Fighter action validity dropped beyond threshold.", "critical"));
  }
  if (liveDistribution.traceCoverage0to1 < thresholds.minTraceCoverage0to1) {
    additionalAlerts.push(buildAlert(input, "llmFighterTraceCoverage0to1", liveDistribution.traceCoverage0to1, thresholds.minTraceCoverage0to1, "Live LLM Fighter combat-log trace coverage dropped below threshold.", "critical"));
  }
  if (liveDistribution.exportCoverage0to1 < thresholds.minExportCoverage0to1) {
    additionalAlerts.push(buildAlert(input, "llmFighterExportCoverage0to1", liveDistribution.exportCoverage0to1, thresholds.minExportCoverage0to1, "Live LLM Fighter exported-log coverage dropped below threshold.", "critical"));
  }
  if (liveDistribution.evidenceCoverage0to1 < thresholds.minEvidenceCoverage0to1) {
    additionalAlerts.push(buildAlert(input, "llmFighterEvidenceCoverage0to1", liveDistribution.evidenceCoverage0to1, thresholds.minEvidenceCoverage0to1, "Live LLM Fighter rows are missing source snapshot, MIT license, homepage, README, API/UI tree, game-result endpoint, schema, engine, runner, LLM adapter, YAML export, UI component, baseline/live result, drift statistic, alert receipt, combat log, exported log, evidence, or signed evidence proof.", "critical"));
  }
  if (behaviorDrift.arenaDivergence0to1 > thresholds.maxArenaDivergence0to1) {
    additionalAlerts.push(buildAlert(input, "llmFighterArenaDistribution", behaviorDrift.arenaDivergence0to1, thresholds.maxArenaDivergence0to1, "Live LLM Fighter arena distribution diverged beyond threshold.", "medium"));
  }
  if (behaviorDrift.modelRosterDivergence0to1 > thresholds.maxModelRosterDivergence0to1) {
    additionalAlerts.push(buildAlert(input, "llmFighterModelRosterDistribution", behaviorDrift.modelRosterDivergence0to1, thresholds.maxModelRosterDivergence0to1, "Live LLM Fighter model-roster distribution diverged beyond threshold.", "medium"));
  }
  if (behaviorDrift.rulesetDivergence0to1 > thresholds.maxRulesetDivergence0to1) {
    additionalAlerts.push(buildAlert(input, "llmFighterRulesetDistribution", behaviorDrift.rulesetDivergence0to1, thresholds.maxRulesetDivergence0to1, "Live LLM Fighter ruleset distribution diverged beyond threshold.", "medium"));
  }
  if (behaviorDrift.contextDivergence0to1 > thresholds.maxContextDivergence0to1) {
    additionalAlerts.push(buildAlert(input, "llmFighterContextDistribution", behaviorDrift.contextDivergence0to1, thresholds.maxContextDivergence0to1, "Live LLM Fighter source, API, UI, engine, runner, LLM adapter, export, arena, ruleset, or model-roster context diverged beyond threshold.", "medium"));
  }
  if (scoreDrift.turnCountShiftRatio > thresholds.maxTurnCountShiftRatio) {
    additionalAlerts.push(buildAlert(input, "llmFighterTurnCountMean", scoreDrift.turnCountShiftRatio, thresholds.maxTurnCountShiftRatio, "Live LLM Fighter turn-count mean shifted beyond threshold.", "medium"));
  }
  if (scoreDrift.latencyP95IncreaseRatio > thresholds.maxLatencyP95IncreaseRatio) {
    additionalAlerts.push(buildAlert(input, "llmFighterLatencyP95Ms", scoreDrift.latencyP95IncreaseRatio, thresholds.maxLatencyP95IncreaseRatio, "Live LLM Fighter p95 latency increased beyond threshold.", "medium"));
  }
  if (scoreDrift.costIncreaseRatio > thresholds.maxCostIncreaseRatio) {
    additionalAlerts.push(buildAlert(input, "llmFighterCostUsdMean", scoreDrift.costIncreaseRatio, thresholds.maxCostIncreaseRatio, "Live LLM Fighter mean cost increased beyond threshold.", "medium"));
  }
  const receipt = withAdditionalAlerts(
    runLiveScoreBehaviorDrift({
      agentId: input.agentId,
      baselineWindow: toLiveDriftWindow(input.baselineWindow),
      liveWindow: toLiveDriftWindow(input.liveWindow),
      thresholds: input.liveDriftThresholds,
      sourceRefs: unique([...(input.sourceRefs ?? []), DEFAULT_SOURCE_REF, DEFAULT_HOMEPAGE_REF]),
      now: input.now,
    }),
    additionalAlerts,
  );
  const llmFighterReceiptHash = sha256Hex(canonicalize({
    baselineRows,
    liveRows,
    baselineDistribution,
    liveDistribution,
    scoreDrift,
    behaviorDrift,
    thresholds,
    receiptHash: receipt.receiptHash,
  }));
  return {
    receipt,
    llmFighterReceiptHash,
    baselineRows,
    liveRows,
    baselineDistribution,
    liveDistribution,
    scoreDrift,
    behaviorDrift,
  };
}
