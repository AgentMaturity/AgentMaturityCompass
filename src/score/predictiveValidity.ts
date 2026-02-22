import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ValidityPredictionEntry {
  predictionId: string;
  timestamp: Date;
  agentId: string;
  predictedOutcome: string;
  confidence: number; // 0..1
  actualOutcome?: string;
  wasCorrect?: boolean;
  evaluatorId?: string;
  runId?: string;
  score?: number; // 0..100 (optional run/evaluator score)
}

export interface CalibrationBin {
  index: number;
  minConfidence: number;
  maxConfidence: number;
  sampleCount: number;
  avgConfidence: number;
  accuracy: number;
  gap: number; // avgConfidence - accuracy
}

export interface CalibrationScore {
  totalPredictions: number;
  resolvedPredictions: number;
  unresolvedPredictions: number;
  expectedCalibrationError: number; // ECE
  maximumCalibrationError: number; // MCE
  brierScore: number;
  calibrationBias: number;
  overconfidenceRate: number;
  underconfidenceRate: number;
  bins: CalibrationBin[];
  quality: "excellent" | "good" | "fair" | "poor" | "insufficient-data";
}

export interface InterRaterScore {
  agentId: string;
  evaluatorId: string;
  score: number;
  runId?: string;
}

export interface InterRaterTargetAgreement {
  targetId: string;
  raterCount: number;
  minScore: number;
  maxScore: number;
  scoreRange: number;
  stdDeviation: number;
}

export interface InterRaterReliabilityReport {
  totalRatings: number;
  totalTargets: number;
  targetsWithMultipleRaters: number;
  totalRaters: number;
  averageRatersPerTarget: number;
  multiRaterCoverage: number;
  averagePairwiseDifference: number;
  agreementScore: number; // 0..1
  intraclassCorrelation: number; // -1..1
  quality: "excellent" | "good" | "moderate" | "poor" | "insufficient-data";
  perTargetAgreement: InterRaterTargetAgreement[];
}

export interface ScoreObservation {
  agentId: string;
  score: number; // 0..100
  timestamp: Date | string | number;
  runId?: string;
  evaluatorId?: string;
}

export interface ScoreStabilityReport {
  agentId: string;
  sampleSize: number;
  meanScore: number;
  standardDeviation: number;
  coefficientOfVariation: number;
  meanAbsoluteDelta: number;
  maxDelta: number;
  stabilityIndex: number; // 0..1
  stabilityBand: "high" | "medium" | "low" | "insufficient-data";
}

export interface LongitudinalDriftReport {
  agentId: string;
  sampleSize: number;
  baselineMean: number;
  recentMean: number;
  delta: number;
  deltaPercent: number;
  slopePerDay: number;
  slopePer30Days: number;
  predictedScore30Days: number;
  recentVolatility: number;
  direction: "improving" | "degrading" | "stable" | "insufficient-data";
  severity: "none" | "low" | "medium" | "high";
}

export interface PredictionLogAnalysis {
  totalEntries: number;
  resolvedEntries: number;
  unresolvedEntries: number;
  resolutionRate: number;
  calibration: CalibrationScore;
  interRaterReliability: InterRaterReliabilityReport;
  stabilityByAgent: Record<string, ScoreStabilityReport>;
  driftByAgent: Record<string, LongitudinalDriftReport>;
  improvingAgents: string[];
  degradingAgents: string[];
}

export interface PredictionLogTrackingReport {
  sourcePath: string;
  fileFound: boolean;
  entries: ValidityPredictionEntry[];
  analysis: PredictionLogAnalysis;
  warnings: string[];
}

interface ResolvedPrediction {
  confidence: number;
  outcome: number;
}

interface ParsedRow {
  predictionId?: string;
  timestamp?: Date;
  agentId?: string;
  predictedOutcome?: string;
  confidence?: number;
  actualOutcome?: string;
  wasCorrect?: boolean;
  evaluatorId?: string;
  runId?: string;
  score?: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseBoolean(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  const normalized = normalizeText(raw);
  if (["true", "yes", "y", "1", "correct", "pass", "passed"].includes(normalized)) return true;
  if (["false", "no", "n", "0", "incorrect", "fail", "failed"].includes(normalized)) return false;
  return undefined;
}

function parseTimestamp(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber) && trimmed.match(/^\d+$/)) {
    // Support unix seconds and unix milliseconds.
    const ms = trimmed.length <= 10 ? asNumber * 1000 : asNumber;
    const asDate = new Date(ms);
    if (!Number.isNaN(asDate.getTime())) return asDate;
  }
  const asDate = new Date(trimmed);
  if (Number.isNaN(asDate.getTime())) return undefined;
  return asDate;
}

function parseConfidence(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.endsWith("%")) {
    const asPercent = Number(trimmed.slice(0, -1));
    if (!Number.isFinite(asPercent)) return undefined;
    return clamp01(asPercent / 100);
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return undefined;
  if (value > 1 && value <= 100) return clamp01(value / 100);
  return clamp01(value);
}

function parseScore(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw.trim());
  if (!Number.isFinite(value)) return undefined;
  return clamp(value, 0, 100);
}

function canonicalColumnName(raw: string): string {
  const key = raw
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^a-z0-9]+/g, "");
  switch (key) {
    case "id":
    case "predictionid":
    case "predid":
      return "predictionId";
    case "timestamp":
    case "time":
    case "ts":
    case "date":
      return "timestamp";
    case "agent":
    case "agentid":
      return "agentId";
    case "predicted":
    case "prediction":
    case "predictedoutcome":
    case "expected":
    case "expectedoutcome":
      return "predictedOutcome";
    case "confidence":
    case "conf":
    case "probability":
      return "confidence";
    case "actual":
    case "actualoutcome":
    case "outcome":
    case "observedoutcome":
      return "actualOutcome";
    case "correct":
    case "wascorrect":
    case "iscorrect":
      return "wasCorrect";
    case "evaluator":
    case "evaluatorid":
    case "rater":
    case "raterid":
    case "reviewer":
      return "evaluatorId";
    case "run":
    case "runid":
      return "runId";
    case "score":
    case "amcscore":
    case "finalscore":
      return "score";
    default:
      return "";
  }
}

function splitMarkdownRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isMarkdownSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function buildEntry(row: ParsedRow, fallbackIndex: number): ValidityPredictionEntry {
  const predictionId = row.predictionId?.trim() || `pred-${fallbackIndex + 1}`;
  const timestamp = row.timestamp ?? new Date(0);
  const agentId = row.agentId?.trim() || "unknown-agent";
  const predictedOutcome = row.predictedOutcome?.trim() ?? "";
  const confidence = clamp01(row.confidence ?? 0.5);
  const actualOutcome = row.actualOutcome?.trim();
  const wasCorrect =
    row.wasCorrect ?? (
      predictedOutcome.length > 0 && actualOutcome && actualOutcome.length > 0
        ? normalizeText(predictedOutcome) === normalizeText(actualOutcome)
        : undefined
    );
  return {
    predictionId,
    timestamp,
    agentId,
    predictedOutcome,
    confidence,
    actualOutcome,
    wasCorrect,
    evaluatorId: row.evaluatorId?.trim(),
    runId: row.runId?.trim(),
    score: row.score,
  };
}

function parseTableEntries(markdown: string): ValidityPredictionEntry[] {
  const lines = markdown.split(/\r?\n/);
  const entries: ValidityPredictionEntry[] = [];

  for (let i = 0; i < lines.length - 1; i += 1) {
    const headerLine = lines[i];
    const separatorLine = lines[i + 1];
    if (!headerLine || !separatorLine) continue;
    if (!headerLine.includes("|") || !isMarkdownSeparator(separatorLine)) continue;

    const rawHeaders = splitMarkdownRow(headerLine);
    const headers = rawHeaders.map(canonicalColumnName);
    const hasUsefulColumns = headers.some((header) => header.length > 0);
    if (!hasUsefulColumns) continue;

    i += 2;
    while (i < lines.length) {
      const rowLine = lines[i];
      if (!rowLine || rowLine.trim().length === 0 || !rowLine.includes("|")) break;
      if (/^\s*\|?\s*:?[-\s|:]+$/.test(rowLine)) {
        i += 1;
        continue;
      }
      const rawCells = splitMarkdownRow(rowLine);
      const parsed: ParsedRow = {};
      for (let col = 0; col < headers.length; col += 1) {
        const header = headers[col];
        if (!header) continue;
        const value = rawCells[col];
        if (!value) continue;
        if (header === "predictionId") parsed.predictionId = value;
        else if (header === "timestamp") parsed.timestamp = parseTimestamp(value);
        else if (header === "agentId") parsed.agentId = value;
        else if (header === "predictedOutcome") parsed.predictedOutcome = value;
        else if (header === "confidence") parsed.confidence = parseConfidence(value);
        else if (header === "actualOutcome") parsed.actualOutcome = value;
        else if (header === "wasCorrect") parsed.wasCorrect = parseBoolean(value);
        else if (header === "evaluatorId") parsed.evaluatorId = value;
        else if (header === "runId") parsed.runId = value;
        else if (header === "score") parsed.score = parseScore(value);
      }

      entries.push(buildEntry(parsed, entries.length));
      i += 1;
    }

    i -= 1;
  }

  return entries;
}

function parseKeyValueEntries(markdown: string): ValidityPredictionEntry[] {
  const lines = markdown.split(/\r?\n/);
  const entries: ValidityPredictionEntry[] = [];
  const keyValuePattern = /([a-zA-Z_][a-zA-Z0-9_-]*)\s*=\s*("[^"]*"|'[^']*'|[^,\s]+)/g;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("-")) continue;
    const record: ParsedRow = {};
    let match = keyValuePattern.exec(trimmed);
    while (match) {
      const rawKey = match[1];
      const rawValue = match[2]?.replace(/^['"]|['"]$/g, "");
      const key = canonicalColumnName(rawKey ?? "");
      if (key === "predictionId") record.predictionId = rawValue;
      else if (key === "timestamp") record.timestamp = parseTimestamp(rawValue);
      else if (key === "agentId") record.agentId = rawValue;
      else if (key === "predictedOutcome") record.predictedOutcome = rawValue;
      else if (key === "confidence") record.confidence = parseConfidence(rawValue);
      else if (key === "actualOutcome") record.actualOutcome = rawValue;
      else if (key === "wasCorrect") record.wasCorrect = parseBoolean(rawValue);
      else if (key === "evaluatorId") record.evaluatorId = rawValue;
      else if (key === "runId") record.runId = rawValue;
      else if (key === "score") record.score = parseScore(rawValue);
      match = keyValuePattern.exec(trimmed);
    }
    keyValuePattern.lastIndex = 0;
    const hasCoreFields =
      record.confidence !== undefined ||
      record.predictedOutcome !== undefined ||
      record.score !== undefined;
    if (!hasCoreFields) continue;
    entries.push(buildEntry(record, entries.length));
  }

  return entries;
}

function dedupeEntries(entries: ValidityPredictionEntry[]): ValidityPredictionEntry[] {
  const deduped: ValidityPredictionEntry[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = `${entry.predictionId}|${entry.agentId}|${entry.timestamp.getTime()}|${entry.evaluatorId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }
  return deduped;
}

function toResolvedPredictions(entries: ValidityPredictionEntry[]): ResolvedPrediction[] {
  const resolved: ResolvedPrediction[] = [];
  for (const entry of entries) {
    const wasCorrect =
      typeof entry.wasCorrect === "boolean"
        ? entry.wasCorrect
        : (
          entry.actualOutcome &&
          entry.predictedOutcome &&
          normalizeText(entry.actualOutcome) === normalizeText(entry.predictedOutcome)
        );
    if (typeof wasCorrect !== "boolean") continue;
    resolved.push({
      confidence: clamp01(entry.confidence),
      outcome: wasCorrect ? 1 : 0,
    });
  }
  return resolved;
}

export function parsePredictionLogMarkdown(markdown: string): ValidityPredictionEntry[] {
  if (markdown.trim().length === 0) return [];
  const tableEntries = parseTableEntries(markdown);
  const keyValueEntries = parseKeyValueEntries(markdown);
  return dedupeEntries([...tableEntries, ...keyValueEntries]);
}

export function computeCalibrationScore(
  entries: ValidityPredictionEntry[],
  binCount: number = 10,
): CalibrationScore {
  const resolved = toResolvedPredictions(entries);
  const boundedBinCount = Math.max(2, Math.min(50, Math.floor(binCount)));

  if (resolved.length === 0) {
    return {
      totalPredictions: entries.length,
      resolvedPredictions: 0,
      unresolvedPredictions: entries.length,
      expectedCalibrationError: 0,
      maximumCalibrationError: 0,
      brierScore: 0,
      calibrationBias: 0,
      overconfidenceRate: 0,
      underconfidenceRate: 0,
      bins: [],
      quality: "insufficient-data",
    };
  }

  const bins = Array.from({ length: boundedBinCount }, (_, index) => ({
    index,
    minConfidence: index / boundedBinCount,
    maxConfidence: (index + 1) / boundedBinCount,
    confSum: 0,
    outcomeSum: 0,
    count: 0,
  }));

  for (const row of resolved) {
    const idx = Math.min(boundedBinCount - 1, Math.floor(row.confidence * boundedBinCount));
    const bin = bins[idx];
    if (!bin) continue;
    bin.confSum += row.confidence;
    bin.outcomeSum += row.outcome;
    bin.count += 1;
  }

  let ece = 0;
  let mce = 0;
  let brier = 0;
  let bias = 0;
  let overconfidenceCount = 0;
  let underconfidenceCount = 0;
  const publishedBins: CalibrationBin[] = [];

  for (const row of resolved) {
    const error = row.confidence - row.outcome;
    brier += error ** 2;
    bias += error;
    if (error > 0.2) overconfidenceCount += 1;
    if (error < -0.2) underconfidenceCount += 1;
  }

  for (const bin of bins) {
    if (bin.count === 0) continue;
    const avgConfidence = bin.confSum / bin.count;
    const accuracy = bin.outcomeSum / bin.count;
    const gap = avgConfidence - accuracy;
    const absGap = Math.abs(gap);
    ece += (bin.count / resolved.length) * absGap;
    mce = Math.max(mce, absGap);
    publishedBins.push({
      index: bin.index,
      minConfidence: Number(bin.minConfidence.toFixed(6)),
      maxConfidence: Number(bin.maxConfidence.toFixed(6)),
      sampleCount: bin.count,
      avgConfidence: Number(avgConfidence.toFixed(6)),
      accuracy: Number(accuracy.toFixed(6)),
      gap: Number(gap.toFixed(6)),
    });
  }

  const expectedCalibrationError = Number(ece.toFixed(6));
  const quality =
    resolved.length < 20
      ? "insufficient-data"
      : expectedCalibrationError <= 0.05
        ? "excellent"
        : expectedCalibrationError <= 0.1
          ? "good"
          : expectedCalibrationError <= 0.2
            ? "fair"
            : "poor";

  return {
    totalPredictions: entries.length,
    resolvedPredictions: resolved.length,
    unresolvedPredictions: Math.max(0, entries.length - resolved.length),
    expectedCalibrationError,
    maximumCalibrationError: Number(mce.toFixed(6)),
    brierScore: Number((brier / resolved.length).toFixed(6)),
    calibrationBias: Number((bias / resolved.length).toFixed(6)),
    overconfidenceRate: Number((overconfidenceCount / resolved.length).toFixed(6)),
    underconfidenceRate: Number((underconfidenceCount / resolved.length).toFixed(6)),
    bins: publishedBins,
    quality,
  };
}

function linearRegression(x: number[], y: number[]): { slope: number; intercept: number } {
  if (x.length < 2 || x.length !== y.length) return { slope: 0, intercept: y[0] ?? 0 };
  const n = x.length;
  const sumX = x.reduce((sum, value) => sum + value, 0);
  const sumY = y.reduce((sum, value) => sum + value, 0);
  const sumXY = x.reduce((sum, value, index) => sum + value * (y[index] ?? 0), 0);
  const sumX2 = x.reduce((sum, value) => sum + value * value, 0);
  const denominator = n * sumX2 - sumX * sumX;
  if (Math.abs(denominator) < 1e-12) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function toTargetKey(row: InterRaterScore): string {
  return row.runId ? `${row.agentId}::${row.runId}` : row.agentId;
}

export function computeInterRaterReliability(rows: InterRaterScore[]): InterRaterReliabilityReport {
  if (rows.length === 0) {
    return {
      totalRatings: 0,
      totalTargets: 0,
      targetsWithMultipleRaters: 0,
      totalRaters: 0,
      averageRatersPerTarget: 0,
      multiRaterCoverage: 0,
      averagePairwiseDifference: 0,
      agreementScore: 0,
      intraclassCorrelation: 0,
      quality: "insufficient-data",
      perTargetAgreement: [],
    };
  }

  const raters = new Set<string>();
  const byTarget = new Map<string, Map<string, number[]>>();
  for (const row of rows) {
    raters.add(row.evaluatorId);
    const targetKey = toTargetKey(row);
    const target = byTarget.get(targetKey) ?? new Map<string, number[]>();
    const raterScores = target.get(row.evaluatorId) ?? [];
    raterScores.push(clamp(row.score, 0, 100));
    target.set(row.evaluatorId, raterScores);
    byTarget.set(targetKey, target);
  }

  const perTargetAgreement: InterRaterTargetAgreement[] = [];
  const multiRaterMeans: number[][] = [];
  let pairDiffSum = 0;
  let pairCount = 0;
  let totalCollapsedRatings = 0;
  let targetsWithMultipleRaters = 0;

  for (const [targetId, targetMap] of byTarget.entries()) {
    const collapsedScores = Array.from(targetMap.values()).map((scores) => mean(scores));
    totalCollapsedRatings += collapsedScores.length;
    const targetStdDev = stdDev(collapsedScores);
    const minScore = collapsedScores.length > 0 ? Math.min(...collapsedScores) : 0;
    const maxScore = collapsedScores.length > 0 ? Math.max(...collapsedScores) : 0;
    const scoreRange = maxScore - minScore;

    perTargetAgreement.push({
      targetId,
      raterCount: collapsedScores.length,
      minScore: Number(minScore.toFixed(6)),
      maxScore: Number(maxScore.toFixed(6)),
      scoreRange: Number(scoreRange.toFixed(6)),
      stdDeviation: Number(targetStdDev.toFixed(6)),
    });

    if (collapsedScores.length >= 2) {
      targetsWithMultipleRaters += 1;
      multiRaterMeans.push(collapsedScores);
      for (let i = 0; i < collapsedScores.length; i += 1) {
        for (let j = i + 1; j < collapsedScores.length; j += 1) {
          pairDiffSum += Math.abs((collapsedScores[i] ?? 0) - (collapsedScores[j] ?? 0));
          pairCount += 1;
        }
      }
    }
  }

  const averagePairwiseDifference = pairCount > 0 ? pairDiffSum / pairCount : 0;
  const agreementScore = clamp01(1 - averagePairwiseDifference / 100);

  // ICC(1,1) approximation for uneven rater counts using k-bar.
  let intraclassCorrelation = 0;
  if (multiRaterMeans.length >= 2) {
    const targetMeans = multiRaterMeans.map((scores) => mean(scores));
    const n = multiRaterMeans.length;
    const N = multiRaterMeans.reduce((sum, scores) => sum + scores.length, 0);
    const flatScores = multiRaterMeans.flat();
    const grandMean = mean(flatScores);

    let ssBetween = 0;
    let ssWithin = 0;
    for (let targetIndex = 0; targetIndex < multiRaterMeans.length; targetIndex += 1) {
      const scores = multiRaterMeans[targetIndex] ?? [];
      const targetMean = targetMeans[targetIndex] ?? 0;
      ssBetween += scores.length * (targetMean - grandMean) ** 2;
      for (const score of scores) {
        ssWithin += (score - targetMean) ** 2;
      }
    }

    const bms = n > 1 ? ssBetween / (n - 1) : 0;
    const wms = N > n ? ssWithin / (N - n) : 0;
    const kBar = N / n;
    const denominator = bms + (kBar - 1) * wms;
    intraclassCorrelation = denominator > 0 ? (bms - wms) / denominator : 0;
    intraclassCorrelation = clamp(intraclassCorrelation, -1, 1);
  }

  const quality =
    targetsWithMultipleRaters < 2
      ? "insufficient-data"
      : intraclassCorrelation >= 0.9
        ? "excellent"
        : intraclassCorrelation >= 0.75
          ? "good"
          : intraclassCorrelation >= 0.5
            ? "moderate"
            : "poor";

  return {
    totalRatings: rows.length,
    totalTargets: byTarget.size,
    targetsWithMultipleRaters,
    totalRaters: raters.size,
    averageRatersPerTarget: Number((totalCollapsedRatings / Math.max(byTarget.size, 1)).toFixed(6)),
    multiRaterCoverage: Number((targetsWithMultipleRaters / Math.max(byTarget.size, 1)).toFixed(6)),
    averagePairwiseDifference: Number(averagePairwiseDifference.toFixed(6)),
    agreementScore: Number(agreementScore.toFixed(6)),
    intraclassCorrelation: Number(intraclassCorrelation.toFixed(6)),
    quality,
    perTargetAgreement: perTargetAgreement.sort((a, b) => b.scoreRange - a.scoreRange),
  };
}

function toTimestampMs(value: Date | string | number): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function computeScoreStability(observations: ScoreObservation[]): ScoreStabilityReport {
  if (observations.length === 0) {
    return {
      agentId: "unknown-agent",
      sampleSize: 0,
      meanScore: 0,
      standardDeviation: 0,
      coefficientOfVariation: 0,
      meanAbsoluteDelta: 0,
      maxDelta: 0,
      stabilityIndex: 0,
      stabilityBand: "insufficient-data",
    };
  }

  const sorted = [...observations].sort((a, b) => toTimestampMs(a.timestamp) - toTimestampMs(b.timestamp));
  const scores = sorted.map((row) => clamp(row.score, 0, 100));
  const scoreMean = mean(scores);
  const scoreStdDev = stdDev(scores);
  const deltas: number[] = [];
  for (let i = 1; i < scores.length; i += 1) {
    deltas.push(Math.abs((scores[i] ?? 0) - (scores[i - 1] ?? 0)));
  }

  const meanAbsoluteDelta = mean(deltas);
  const maxDelta = deltas.length > 0 ? Math.max(...deltas) : 0;

  const normalizedStd = Math.min(1, scoreStdDev / 15);
  const normalizedMad = Math.min(1, meanAbsoluteDelta / 12);
  const normalizedMax = Math.min(1, maxDelta / 25);
  const stabilityIndex = clamp01(1 - (0.5 * normalizedStd + 0.3 * normalizedMad + 0.2 * normalizedMax));
  const stabilityBand =
    scores.length < 3
      ? "insufficient-data"
      : stabilityIndex >= 0.85
        ? "high"
        : stabilityIndex >= 0.65
          ? "medium"
          : "low";

  return {
    agentId: sorted[0]?.agentId ?? "unknown-agent",
    sampleSize: scores.length,
    meanScore: Number(scoreMean.toFixed(6)),
    standardDeviation: Number(scoreStdDev.toFixed(6)),
    coefficientOfVariation: Number((scoreMean > 0 ? scoreStdDev / scoreMean : 0).toFixed(6)),
    meanAbsoluteDelta: Number(meanAbsoluteDelta.toFixed(6)),
    maxDelta: Number(maxDelta.toFixed(6)),
    stabilityIndex: Number(stabilityIndex.toFixed(6)),
    stabilityBand,
  };
}

export function detectLongitudinalDrift(observations: ScoreObservation[]): LongitudinalDriftReport {
  if (observations.length === 0) {
    return {
      agentId: "unknown-agent",
      sampleSize: 0,
      baselineMean: 0,
      recentMean: 0,
      delta: 0,
      deltaPercent: 0,
      slopePerDay: 0,
      slopePer30Days: 0,
      predictedScore30Days: 0,
      recentVolatility: 0,
      direction: "insufficient-data",
      severity: "none",
    };
  }

  const sorted = [...observations].sort((a, b) => toTimestampMs(a.timestamp) - toTimestampMs(b.timestamp));
  const agentId = sorted[0]?.agentId ?? "unknown-agent";
  if (sorted.length < 3) {
    const score = clamp(sorted.at(-1)?.score ?? 0, 0, 100);
    return {
      agentId,
      sampleSize: sorted.length,
      baselineMean: score,
      recentMean: score,
      delta: 0,
      deltaPercent: 0,
      slopePerDay: 0,
      slopePer30Days: 0,
      predictedScore30Days: score,
      recentVolatility: 0,
      direction: "insufficient-data",
      severity: "none",
    };
  }

  const firstTs = toTimestampMs(sorted[0]?.timestamp ?? 0);
  const x = sorted.map((row) => (toTimestampMs(row.timestamp) - firstTs) / 86_400_000);
  const y = sorted.map((row) => clamp(row.score, 0, 100));
  const { slope, intercept } = linearRegression(x, y);
  const lastX = x.at(-1) ?? 0;
  const predictedScore30Days = clamp(intercept + slope * (lastX + 30), 0, 100);

  const windowSize = Math.max(2, Math.floor(sorted.length / 3));
  const baselineScores = y.slice(0, windowSize);
  const recentScores = y.slice(-windowSize);
  const baselineMean = mean(baselineScores);
  const recentMean = mean(recentScores);
  const delta = recentMean - baselineMean;
  const deltaPercent = baselineMean > 0 ? (delta / baselineMean) * 100 : 0;
  const slopePer30Days = slope * 30;
  const recentVolatility = stdDev(y.slice(-Math.min(5, y.length)));

  const direction: LongitudinalDriftReport["direction"] =
    Math.abs(slopePer30Days) < 1 && Math.abs(delta) < 2
      ? "stable"
      : slopePer30Days > 0
        ? "improving"
        : "degrading";

  const absSlope30 = Math.abs(slopePer30Days);
  const absDelta = Math.abs(delta);
  const severity: LongitudinalDriftReport["severity"] =
    direction === "stable"
      ? "none"
      : (absSlope30 >= 5 || absDelta >= 15)
        ? "high"
        : (absSlope30 >= 2 || absDelta >= 8)
          ? "medium"
          : "low";

  return {
    agentId,
    sampleSize: sorted.length,
    baselineMean: Number(baselineMean.toFixed(6)),
    recentMean: Number(recentMean.toFixed(6)),
    delta: Number(delta.toFixed(6)),
    deltaPercent: Number(deltaPercent.toFixed(6)),
    slopePerDay: Number(slope.toFixed(6)),
    slopePer30Days: Number(slopePer30Days.toFixed(6)),
    predictedScore30Days: Number(predictedScore30Days.toFixed(6)),
    recentVolatility: Number(recentVolatility.toFixed(6)),
    direction,
    severity,
  };
}

export function analyzePredictionLog(entries: ValidityPredictionEntry[]): PredictionLogAnalysis {
  const calibration = computeCalibrationScore(entries);
  const resolvedEntries = calibration.resolvedPredictions;
  const unresolvedEntries = calibration.unresolvedPredictions;
  const resolutionRate =
    entries.length > 0 ? Number((resolvedEntries / entries.length).toFixed(6)) : 0;

  const interRaterRows: InterRaterScore[] = entries
    .filter((entry) => entry.evaluatorId && entry.score !== undefined)
    .map((entry) => ({
      agentId: entry.agentId,
      runId: entry.runId,
      evaluatorId: entry.evaluatorId ?? "unknown-evaluator",
      score: entry.score ?? 0,
    }));
  const interRaterReliability = computeInterRaterReliability(interRaterRows);

  const byAgent = new Map<string, ScoreObservation[]>();
  for (const entry of entries) {
    if (entry.score === undefined) continue;
    const rows = byAgent.get(entry.agentId) ?? [];
    rows.push({
      agentId: entry.agentId,
      score: entry.score,
      timestamp: entry.timestamp,
      runId: entry.runId,
      evaluatorId: entry.evaluatorId,
    });
    byAgent.set(entry.agentId, rows);
  }

  const stabilityByAgent: Record<string, ScoreStabilityReport> = {};
  const driftByAgent: Record<string, LongitudinalDriftReport> = {};
  const improvingAgents: string[] = [];
  const degradingAgents: string[] = [];

  for (const [agentId, observations] of byAgent.entries()) {
    const stability = computeScoreStability(observations);
    const drift = detectLongitudinalDrift(observations);
    stabilityByAgent[agentId] = stability;
    driftByAgent[agentId] = drift;
    if (drift.direction === "improving") improvingAgents.push(agentId);
    if (drift.direction === "degrading") degradingAgents.push(agentId);
  }

  improvingAgents.sort();
  degradingAgents.sort();

  return {
    totalEntries: entries.length,
    resolvedEntries,
    unresolvedEntries,
    resolutionRate,
    calibration,
    interRaterReliability,
    stabilityByAgent,
    driftByAgent,
    improvingAgents,
    degradingAgents,
  };
}

export function trackPredictionLog(
  cwd?: string,
  relativePath: string = ".amc/PREDICTION_LOG.md",
): PredictionLogTrackingReport {
  const root = cwd ?? process.cwd();
  const sourcePath = join(root, relativePath);
  const warnings: string[] = [];

  if (!existsSync(sourcePath)) {
    warnings.push(`Prediction log not found at ${relativePath}`);
    return {
      sourcePath,
      fileFound: false,
      entries: [],
      analysis: analyzePredictionLog([]),
      warnings,
    };
  }

  const markdown = readFileSync(sourcePath, "utf8");
  const entries = parsePredictionLogMarkdown(markdown);
  if (entries.length === 0) {
    warnings.push("Prediction log found but no parseable entries matched supported patterns.");
  }

  return {
    sourcePath,
    fileFound: true,
    entries,
    analysis: analyzePredictionLog(entries),
    warnings,
  };
}
