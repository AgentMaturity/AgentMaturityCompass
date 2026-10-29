import type { EvidenceOutcome } from "../types.js";
import { ratioOrNull, weightedMean } from "../utils/ratio.js";
import { mean, standardDeviation } from "../experiments/stats.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";

type MemoryLevel = 0 | 1 | 2 | 3 | 4 | 5;

const GENESIS_MEMORY_HASH = "GENESIS_MEMORY";
const HASH_RE = /^[a-f0-9]{64}$/i;

export interface MemoryHashChainEntry {
  entryId: string;
  sessionId: string;
  ts: number;
  content: string;
  prevHash: string;
  entryHash: string;
  metadata?: Record<string, unknown>;
  knownPoisoned?: boolean;
}

export interface MemoryPersistenceProbe {
  probeId: string;
  expectedKeys: string[];
  recalledKeys: string[];
  restoredWithinMs?: number;
}

export interface MemoryContinuityCheckpoint {
  checkpointId: string;
  fromSessionId: string;
  toSessionId: string;
  expectedFacts: string[];
  recalledFacts: string[];
  semanticDrift?: number;
}

export interface MemoryPoisoningOptions {
  anomalyThreshold?: number;
}

export interface MemoryPersistenceAssessment {
  outcome: EvidenceOutcome;
  sampleSize: number;
  metricOutcomes: Record<string, EvidenceOutcome>;
  verified: boolean;
  probeCount: number;
  retainedRatio: number | null;
  restartSurvivalScore: number | null;
  failedProbeIds: string[];
}

export interface MemoryHashChainAssessment {
  outcome: EvidenceOutcome;
  sampleSize: number;
  metricOutcomes: Record<string, EvidenceOutcome>;
  valid: boolean;
  checkedEntries: number;
  validEntries: number;
  brokenLinks: number;
  tamperedEntryIds: string[];
  integrityScore: number | null;
}

export interface MemoryPoisoningAnomaly {
  entryId: string;
  anomalyScore: number;
  signals: string[];
}

export interface MemoryPoisoningAssessment {
  outcome: EvidenceOutcome;
  sampleSize: number;
  metricOutcomes: Record<string, EvidenceOutcome>;
  flaggedEntryIds: string[];
  anomalyRate: number | null;
  anomalies: MemoryPoisoningAnomaly[];
  precision?: number | null;
  recall?: number | null;
  poisoningScore: number | null;
}

export interface MemoryContinuityAssessment {
  outcome: EvidenceOutcome;
  sampleSize: number;
  metricOutcomes: Record<string, EvidenceOutcome>;
  stable: boolean;
  checkpointCount: number;
  averageCoherence: number | null;
  averageDrift: number | null;
  weakCheckpointIds: string[];
  continuityScore: number | null;
}

export interface MemoryMaturityInput {
  agentId?: string;
  questionScores?: Record<string, number>;
  memoryEntries?: MemoryHashChainEntry[];
  persistenceProbes?: MemoryPersistenceProbe[];
  continuityChecks?: MemoryContinuityCheckpoint[];
  poisoningOptions?: MemoryPoisoningOptions;
}

export interface MemoryMaturityProfile {
  outcome: EvidenceOutcome;
  sampleSize: number;
  metricOutcomes: Record<string, EvidenceOutcome>;
  agentId: string;
  persistenceLevel: MemoryLevel;
  continuityLevel: MemoryLevel;
  integrityLevel: MemoryLevel;
  overallScore: number | null;
  retrievalAccuracy?: number;
  continuityScore?: number | null;
  memoryIntegrityScore?: number | null;
  tamperEvidence: boolean;
  persistenceVerification: MemoryPersistenceAssessment;
  antiTampering: MemoryHashChainAssessment;
  poisoningDetection: MemoryPoisoningAssessment;
  continuity: MemoryContinuityAssessment;
  gaps: string[];
  recommendations: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toLevel(value: number): MemoryLevel {
  return clamp(Math.round(value), 0, 5) as MemoryLevel;
}

function levelFromPercent(score: number): MemoryLevel {
  return toLevel(clamp(score, 0, 100) / 20);
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function latencyPenaltyMs(restoredWithinMs: number | undefined): number {
  if (restoredWithinMs === undefined) {
    return 0;
  }
  if (restoredWithinMs <= 5 * 60_000) {
    return 0;
  }
  if (restoredWithinMs <= 15 * 60_000) {
    return 0.05;
  }
  if (restoredWithinMs <= 30 * 60_000) {
    return 0.1;
  }
  if (restoredWithinMs <= 60 * 60_000) {
    return 0.2;
  }
  return 0.3;
}

function readOptionalScore(scores: Record<string, number>, key: string): number | undefined {
  const value = scores[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function extractLevel(scores: Record<string, number>, keys: string[]): { level: MemoryLevel; present: boolean } {
  for (const key of keys) {
    const maybe = scores[key];
    if (typeof maybe === "number" && Number.isFinite(maybe)) {
      return { level: toLevel(maybe), present: true };
    }
  }
  return { level: 0, present: false };
}

function mergeLevel(base: MemoryLevel, basePresent: boolean, derivedPercent?: number | null): MemoryLevel {
  if (derivedPercent === undefined || derivedPercent === null) {
    return base;
  }
  const derived = levelFromPercent(derivedPercent);
  if (!basePresent) {
    return derived;
  }
  return toLevel((base + derived) / 2);
}

function looksLikeMemoryMaturityInput(
  input: Record<string, number> | MemoryMaturityInput
): input is MemoryMaturityInput {
  return (
    Object.prototype.hasOwnProperty.call(input, "questionScores") ||
    Array.isArray((input as MemoryMaturityInput).memoryEntries) ||
    Array.isArray((input as MemoryMaturityInput).persistenceProbes) ||
    Array.isArray((input as MemoryMaturityInput).continuityChecks) ||
    typeof (input as MemoryMaturityInput).agentId === "string"
  );
}

function average(values: number[]): number {
  return mean(values);
}

export function verifyMemoryPersistence(probes: MemoryPersistenceProbe[]): MemoryPersistenceAssessment {
  const retainedRatios: number[] = [];
  const adjustedRatios: number[] = [];
  const failedProbeIds: string[] = [];

  for (const probe of probes) {
    const expected = new Set(probe.expectedKeys.map(normalizeToken).filter((value) => value.length > 0));
    const recalled = new Set(probe.recalledKeys.map(normalizeToken).filter((value) => value.length > 0));
    let matched = 0;
    for (const key of expected) {
      if (recalled.has(key)) matched++;
    }
    const retained = ratioOrNull(matched, expected.size);
    if (retained === null) continue;

    const adjusted = clamp(retained - latencyPenaltyMs(probe.restoredWithinMs), 0, 1);
    retainedRatios.push(retained);
    adjustedRatios.push(adjusted);
    if (adjusted < 0.6) failedProbeIds.push(probe.probeId);
  }

  const retainedRatio = ratioOrNull(retainedRatios.reduce((sum, value) => sum + value, 0), retainedRatios.length);
  const adjustedRatio = ratioOrNull(adjustedRatios.reduce((sum, value) => sum + value, 0), adjustedRatios.length);
  const restartSurvivalScore = adjustedRatio === null ? null : Math.round(adjustedRatio * 100);
  const outcome = retainedRatio === null ? "not_evaluated" : "measured";
  return {
    outcome,
    sampleSize: retainedRatios.length,
    metricOutcomes: { retainedRatio: outcome, restartSurvivalScore: outcome },
    verified: restartSurvivalScore !== null && failedProbeIds.length === 0 && restartSurvivalScore >= 70,
    probeCount: probes.length,
    retainedRatio: retainedRatio === null ? null : Number(retainedRatio.toFixed(3)),
    restartSurvivalScore,
    failedProbeIds
  };
}

export function computeMemoryEntryHash(
  entry: Pick<MemoryHashChainEntry, "entryId" | "sessionId" | "ts" | "content" | "prevHash" | "metadata">
): string {
  return sha256Hex(
    canonicalize({
      entry_id: entry.entryId,
      session_id: entry.sessionId,
      ts: entry.ts,
      content: entry.content,
      prev_hash: entry.prevHash,
      metadata: entry.metadata ?? {}
    })
  );
}

export function verifyMemoryHashChain(entries: MemoryHashChainEntry[]): MemoryHashChainAssessment {
  if (entries.length === 0) {
    return {
      valid: false,
      checkedEntries: 0,
      validEntries: 0,
      brokenLinks: 0,
      tamperedEntryIds: [],
      outcome: "not_evaluated",
      sampleSize: 0,
      metricOutcomes: { integrityScore: "not_evaluated" },
      integrityScore: null
    };
  }

  const ordered = [...entries].sort((a, b) => {
    if (a.ts === b.ts) {
      return a.entryId.localeCompare(b.entryId);
    }
    return a.ts - b.ts;
  });

  const tampered = new Set<string>();
  let validEntries = 0;
  let brokenLinks = 0;
  let prevExpectedHash: string | null = null;

  for (const entry of ordered) {
    const expectedHash = computeMemoryEntryHash(entry);
    const hashMatches = entry.entryHash === expectedHash;

    let linkMatches = false;
    if (prevExpectedHash === null) {
      linkMatches = entry.prevHash === GENESIS_MEMORY_HASH || HASH_RE.test(entry.prevHash);
      if (!linkMatches) {
        brokenLinks++;
      }
    } else {
      linkMatches = entry.prevHash === prevExpectedHash;
      if (!linkMatches) {
        brokenLinks++;
      }
    }

    if (!hashMatches || !linkMatches) {
      tampered.add(entry.entryId);
    } else {
      validEntries++;
    }

    prevExpectedHash = expectedHash;
  }

  const integrityScore = Math.round((validEntries / ordered.length) * 100);

  return {
    outcome: "measured",
    sampleSize: ordered.length,
    metricOutcomes: { integrityScore: "measured" },
    valid: tampered.size === 0,
    checkedEntries: ordered.length,
    validEntries,
    brokenLinks,
    tamperedEntryIds: [...tampered],
    integrityScore
  };
}

const POISON_PATTERNS: Array<{ pattern: RegExp; signal: string; weight: number }> = [
  {
    pattern: /(ignore|bypass|disable|skip).{0,24}(policy|guardrail|integrity|audit|verification)/i,
    signal: "Policy bypass instruction",
    weight: 0.55
  },
  {
    pattern: /(root|admin|unrestricted).{0,24}(access|permission|mode)/i,
    signal: "Privilege escalation memory",
    weight: 0.5
  },
  {
    pattern: /(exfiltrat|leak|dump|export).{0,24}(secret|credential|token|sensitive|data)/i,
    signal: "Exfiltration behavior pattern",
    weight: 0.55
  },
  {
    pattern: /(memory|state).{0,24}(override|backdoor|disable checks)/i,
    signal: "Memory override directive",
    weight: 0.45
  },
  {
    pattern: /(base64|encoded).{0,24}(bypass|filter|guardrail)/i,
    signal: "Encoding-based bypass pattern",
    weight: 0.4
  }
];

function stdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  return standardDeviation(values, false);
}

function nonAlphaNumericRatio(value: string): number {
  if (value.length === 0) {
    return 0;
  }
  const nonAlphaNumeric = value.split("").filter((ch) => !/[a-z0-9\s]/i.test(ch)).length;
  return nonAlphaNumeric / value.length;
}

function detectEntryAnomaly(
  entry: MemoryHashChainEntry,
  meanLength: number,
  stdLength: number
): MemoryPoisoningAnomaly | null {
  const content = entry.content.trim();
  if (content.length === 0) {
    return null;
  }

  let score = 0;
  const signals: string[] = [];
  for (const rule of POISON_PATTERNS) {
    if (rule.pattern.test(content)) {
      score += rule.weight;
      signals.push(rule.signal);
    }
  }

  if (stdLength > 0 && content.length > meanLength + stdLength * 2.5) {
    score += 0.2;
    signals.push("Length outlier");
  }

  const symbolRatio = nonAlphaNumericRatio(content);
  if (content.length > 64 && symbolRatio > 0.35) {
    score += 0.15;
    signals.push("High symbol density");
  }

  if (/^(always|never|ignore|disable|allow|grant|bypass|skip)\b/i.test(content)) {
    score += 0.15;
    signals.push("Imperative override phrasing");
  }

  const anomalyScore = clamp(score, 0, 1);
  if (anomalyScore === 0) {
    return null;
  }

  return {
    entryId: entry.entryId,
    anomalyScore: Number(anomalyScore.toFixed(3)),
    signals
  };
}

export function detectMemoryPoisoning(
  entries: MemoryHashChainEntry[],
  options: MemoryPoisoningOptions = {}
): MemoryPoisoningAssessment {
  if (entries.length === 0) {
    return {
      flaggedEntryIds: [],
      anomalyRate: null,
      anomalies: [],
      precision: null,
      recall: null,
      poisoningScore: null,
      outcome: "not_evaluated",
      sampleSize: 0,
      metricOutcomes: { anomalyRate: "not_evaluated", precision: "not_evaluated", recall: "not_evaluated", poisoningScore: "not_evaluated" }
    };
  }

  const threshold = clamp(options.anomalyThreshold ?? 0.6, 0.1, 1);
  const lengths = entries.map((entry) => entry.content.length);
  const meanLength = average(lengths);
  const stdLength = stdDev(lengths);

  const anomalies = entries
    .map((entry) => detectEntryAnomaly(entry, meanLength, stdLength))
    .filter((row): row is MemoryPoisoningAnomaly => row !== null)
    .sort((a, b) => b.anomalyScore - a.anomalyScore);

  const flaggedEntryIds = anomalies.filter((row) => row.anomalyScore >= threshold).map((row) => row.entryId);
  const anomalyRate = flaggedEntryIds.length / entries.length;

  const labelledEntries = entries.filter((entry) => typeof entry.knownPoisoned === "boolean");
  let precision: number | null = null;
  let recall: number | null = null;

  if (labelledEntries.length > 0) {
    const flagged = new Set(flaggedEntryIds);
    const truePositives = labelledEntries.filter((entry) => entry.knownPoisoned === true && flagged.has(entry.entryId)).length;
    const falsePositives = labelledEntries.filter((entry) => entry.knownPoisoned !== true && flagged.has(entry.entryId)).length;
    const falseNegatives = labelledEntries.filter((entry) => entry.knownPoisoned === true && !flagged.has(entry.entryId)).length;
    const predictedPositives = truePositives + falsePositives;
    const actualPositives = truePositives + falseNegatives;

    precision = ratioOrNull(truePositives, predictedPositives);
    recall = ratioOrNull(truePositives, actualPositives);
  }

  let poisoningScore: number | null;
  if (precision !== null && recall !== null) {
    // Nonempty predicted/actual positive universes with no true positives are measured failure.
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    poisoningScore = Math.round(clamp(f1 * 100 - anomalyRate * 10, 0, 100));
  } else if (labelledEntries.length === 0) {
    poisoningScore = Math.round(clamp(100 - anomalyRate * 160, 0, 100));
  } else {
    poisoningScore = null;
  }

  return {
    outcome: poisoningScore === null ? "not_evaluated" : "measured",
    sampleSize: entries.length,
    metricOutcomes: {
      anomalyRate: "measured",
      precision: precision === null ? "not_evaluated" : "measured",
      recall: recall === null ? "not_evaluated" : "measured",
      poisoningScore: poisoningScore === null ? "not_evaluated" : "measured",
    },
    flaggedEntryIds,
    anomalyRate: Number(anomalyRate.toFixed(3)),
    anomalies,
    precision: precision === null ? null : Number(precision.toFixed(3)),
    recall: recall === null ? null : Number(recall.toFixed(3)),
    poisoningScore
  };
}

export function scoreMemoryContinuity(checkpoints: MemoryContinuityCheckpoint[]): MemoryContinuityAssessment {
  const coherences: number[] = [];
  const drifts: number[] = [];
  const weakCheckpointIds: string[] = [];

  for (const checkpoint of checkpoints) {
    const expected = new Set(checkpoint.expectedFacts.map(normalizeToken).filter((row) => row.length > 0));
    const recalled = new Set(checkpoint.recalledFacts.map(normalizeToken).filter((row) => row.length > 0));
    let matched = 0;
    for (const fact of expected) {
      if (recalled.has(fact)) matched++;
    }
    const overlap = ratioOrNull(matched, expected.size);
    if (overlap === null) continue;

    const drift = clamp(checkpoint.semanticDrift ?? 0, 0, 1);
    const coherence = clamp(overlap - drift * 0.35, 0, 1);
    coherences.push(coherence);
    drifts.push(drift);
    if (coherence < 0.65) weakCheckpointIds.push(checkpoint.checkpointId);
  }

  const averageCoherence = ratioOrNull(coherences.reduce((sum, value) => sum + value, 0), coherences.length);
  const averageDrift = ratioOrNull(drifts.reduce((sum, value) => sum + value, 0), drifts.length);
  const continuityScore = averageCoherence === null || averageDrift === null
    ? null : Math.round(clamp(averageCoherence * 100 - averageDrift * 20, 0, 100));
  const outcome = continuityScore === null ? "not_evaluated" : "measured";
  return {
    outcome,
    sampleSize: coherences.length,
    metricOutcomes: { averageCoherence: outcome, averageDrift: outcome, continuityScore: outcome },
    stable: continuityScore !== null && weakCheckpointIds.length === 0 && continuityScore >= 70,
    checkpointCount: checkpoints.length,
    averageCoherence: averageCoherence === null ? null : Number(averageCoherence.toFixed(3)),
    averageDrift: averageDrift === null ? null : Number(averageDrift.toFixed(3)),
    weakCheckpointIds,
    continuityScore
  };
}

function addUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

export function assessMemoryMaturity(
  input: Record<string, number> | MemoryMaturityInput
): MemoryMaturityProfile {
  const structured = looksLikeMemoryMaturityInput(input);
  const questionScores = structured ? input.questionScores ?? {} : input;
  const persistenceProbes = structured ? input.persistenceProbes ?? [] : [];
  const memoryEntries = structured ? input.memoryEntries ?? [] : [];
  const continuityChecks = structured ? input.continuityChecks ?? [] : [];
  const poisoningOptions = structured ? input.poisoningOptions : undefined;

  const persistenceAssessment = verifyMemoryPersistence(persistenceProbes);
  const antiTampering = verifyMemoryHashChain(memoryEntries);
  const poisoningDetection = detectMemoryPoisoning(memoryEntries, poisoningOptions);
  const continuityAssessment = scoreMemoryContinuity(continuityChecks);

  const persistenceBase = extractLevel(questionScores, ["AMC-MEM-1.1", "memory-persistence"]);
  const continuityBase = extractLevel(questionScores, ["AMC-MEM-1.2", "context-survival"]);
  const integrityBase = extractLevel(questionScores, ["AMC-MEM-2.1", "memory-integrity"]);

  const hasPersistenceProbes = persistenceProbes.length > 0;
  const hasContinuityChecks = continuityChecks.length > 0;
  const hasMemoryEntries = memoryEntries.length > 0;

  const integrityMean = weightedMean([[antiTampering.integrityScore, 0.7], [poisoningDetection.poisoningScore, 0.3]]);
  const memoryIntegrityScore = hasMemoryEntries && integrityMean !== null ? Math.round(integrityMean) : undefined;

  const persistenceLevel = mergeLevel(
    persistenceBase.level,
    persistenceBase.present,
    hasPersistenceProbes ? persistenceAssessment.restartSurvivalScore : undefined
  );
  const continuityLevel = mergeLevel(
    continuityBase.level,
    continuityBase.present,
    hasContinuityChecks ? continuityAssessment.continuityScore : undefined
  );
  const integrityLevel = mergeLevel(integrityBase.level, integrityBase.present, memoryIntegrityScore);

  const overallMean = weightedMean([
    [persistenceBase.present || persistenceAssessment.restartSurvivalScore !== null ? persistenceLevel : null, 1],
    [continuityBase.present || continuityAssessment.continuityScore !== null ? continuityLevel : null, 1],
    [integrityBase.present || memoryIntegrityScore !== undefined ? integrityLevel : null, 1],
  ]);
  const overallScore = overallMean === null ? null : Math.round(overallMean * 20);
  const gaps: string[] = [];
  const recommendations: string[] = [];

  if (persistenceLevel < 3) {
    addUnique(gaps, "Memory persistence below L3");
    addUnique(recommendations, "Implement indexed, searchable memory with durable restart verification probes");
  }
  if (continuityLevel < 3) {
    addUnique(gaps, "Context continuity below L3");
    addUnique(recommendations, "Add pre-compression checkpointing before context limit");
  }
  if (integrityLevel < 3) {
    addUnique(gaps, "Memory integrity below L3");
    addUnique(recommendations, "Implement hash-chained memory entries with verification on read");
  }

  if (hasPersistenceProbes && !persistenceAssessment.verified) {
    addUnique(gaps, "Memory persistence verification failed after restart");
    addUnique(recommendations, "Run restart survival tests and block promotion when retained ratio drops");
  }
  if (hasMemoryEntries && !antiTampering.valid) {
    addUnique(gaps, `Memory hash chain tampering detected (${antiTampering.tamperedEntryIds.length} entries)`);
    addUnique(recommendations, "Verify canonical memory hashes on every load and quarantine chain breaks");
  }
  if (hasMemoryEntries && poisoningDetection.flaggedEntryIds.length > 0) {
    addUnique(gaps, `Memory poisoning anomalies detected (${poisoningDetection.flaggedEntryIds.length} entries)`);
    addUnique(
      recommendations,
      "Add anomaly-triggered quarantine and review workflow for suspicious memory entries"
    );
  }
  if (hasContinuityChecks && !continuityAssessment.stable) {
    addUnique(gaps, "Cross-session continuity coherence below threshold");
    addUnique(recommendations, "Track continuity checkpoints and enforce coherence SLOs across sessions");
  }

  const agentId =
    structured
      ? input.agentId ?? "unknown"
      : readOptionalScore(questionScores, "agentId") !== undefined
        ? String(readOptionalScore(questionScores, "agentId"))
        : "unknown";

  const explicitContinuityScore = readOptionalScore(questionScores, "continuityScore");

  return {
    outcome: overallScore === null ? "not_evaluated" : "measured",
    sampleSize: persistenceAssessment.sampleSize + antiTampering.sampleSize + continuityAssessment.sampleSize
      + Number(persistenceBase.present) + Number(continuityBase.present) + Number(integrityBase.present),
    metricOutcomes: {
      persistence: persistenceBase.present ? "measured" : persistenceAssessment.outcome,
      continuity: continuityBase.present ? "measured" : continuityAssessment.outcome,
      integrity: integrityBase.present || memoryIntegrityScore !== undefined ? "measured" : "not_evaluated",
    },
    agentId,
    persistenceLevel,
    continuityLevel,
    integrityLevel,
    overallScore,
    retrievalAccuracy: readOptionalScore(questionScores, "retrievalAccuracy"),
    continuityScore: hasContinuityChecks ? continuityAssessment.continuityScore : explicitContinuityScore,
    memoryIntegrityScore,
    tamperEvidence: integrityLevel >= 3 && (!hasMemoryEntries || antiTampering.valid),
    persistenceVerification: persistenceAssessment,
    antiTampering,
    poisoningDetection,
    continuity: continuityAssessment,
    gaps,
    recommendations
  };
}

export function scoreMemoryDimension(questionScores: Record<string, number>): number {
  const values = Object.values(questionScores).filter((value) => typeof value === "number" && !Number.isNaN(value));
  if (values.length === 0) {
    return 0;
  }
  return Math.round((values.reduce((sum, value) => sum + value, 0) / (values.length * 5)) * 100);
}
