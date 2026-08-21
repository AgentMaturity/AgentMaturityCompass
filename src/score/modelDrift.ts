/**
 * modelDrift.ts — Model version drift detection for AMC
 *
 * Extends AMC's confidenceDrift.ts with model-version awareness.
 * When a provider silently updates GPT-4 or Claude, agent behavior
 * can drift without any code changes. AMC detects this by:
 *  1. Tagging every evidence artifact with the model version it was produced by
 *  2. Comparing score distributions before/after model version changes
 *  3. Issuing drift advisories (integrates with AMC advisory system)
 *
 * Integrates with: EvidenceArtifact, advisory system, AMC Score
 */

import type { EvidenceArtifact } from './formalSpec.js';
import { EVIDENCE_KIND_WEIGHTS } from "./trustWeights.js";

/* ── Types ────────────────────────────────────────────────────────── */

export interface ModelVersion {
  provider: string;       // 'openai' | 'anthropic' | 'google' | 'custom' | ...
  model: string;          // 'gpt-4o' | 'claude-opus-4-6' | 'gemini-2.0-flash' | ...
  version?: string;       // specific version/snapshot if known
  capturedAt: Date;
}

export interface ModelTaggedEvidence extends EvidenceArtifact {
  model?: ModelVersion;
}

export interface EvidenceSnapshot {
  agentId: string;
  capturedAt: Date;
  model: ModelVersion;
  dimensionScores: Record<string, number>;  // qid → score
  evidenceCount: number;
  avgTrust: number;
  sampleTraces?: string[];  // representative trace IDs
}

export interface DriftSignal {
  dimension: string;
  qid?: string;
  scoreBefore: number;
  scoreAfter: number;
  delta: number;
  percentChange: number;
  significance: 'low' | 'medium' | 'high' | 'critical';
}

export interface DriftReport {
  agentId: string;
  modelBefore: ModelVersion;
  modelAfter: ModelVersion;
  snapshotBefore: EvidenceSnapshot;
  snapshotAfter: EvidenceSnapshot;
  signals: DriftSignal[];
  overallDrift: number;       // 0–1, magnitude of change
  driftDirection: 'improved' | 'degraded' | 'mixed' | 'stable';
  recommendation: 'monitor' | 'investigate' | 'rollback' | 'approve';
  detectedAt: Date;
  summary: string;
}

/* ── Utilities ────────────────────────────────────────────────────── */

function modelVersionKey(m: ModelVersion): string {
  return `${m.provider}/${m.model}${m.version ? `@${m.version}` : ''}`;
}

function significanceFromDelta(delta: number): DriftSignal['significance'] {
  const abs = Math.abs(delta);
  if (abs >= 0.3) return 'critical';
  if (abs >= 0.15) return 'high';
  if (abs >= 0.05) return 'medium';
  return 'low';
}

/* ── Evidence tagging ─────────────────────────────────────────────── */

/** Tag an existing evidence artifact with model version metadata */
export function tagEvidenceWithModel(
  evidence: EvidenceArtifact,
  model: ModelVersion,
): ModelTaggedEvidence {
  return { ...evidence, model };
}

/** Extract model version from evidence artifact metadata if present */
export function extractModelFromEvidence(evidence: EvidenceArtifact): ModelVersion | undefined {
  const payload = evidence.payload as Record<string, unknown> | null;
  if (!payload || typeof payload !== 'object') return undefined;
  const m = payload['model'] as Record<string, unknown> | undefined;
  if (!m || typeof m.provider !== 'string' || typeof m.model !== 'string') return undefined;
  return {
    provider: m.provider,
    model: m.model,
    version: typeof m.version === 'string' ? m.version : undefined,
    capturedAt: m.capturedAt instanceof Date ? m.capturedAt : new Date(),
  };
}

/* ── Drift detection ──────────────────────────────────────────────── */

export function detectModelDrift(
  before: EvidenceSnapshot,
  after: EvidenceSnapshot,
): DriftReport {
  const signals: DriftSignal[] = [];

  // Compare dimension scores
  const allDimensions = new Set([
    ...Object.keys(before.dimensionScores),
    ...Object.keys(after.dimensionScores),
  ]);

  for (const dim of allDimensions) {
    const scoreBefore = before.dimensionScores[dim] ?? 0;
    const scoreAfter = after.dimensionScores[dim] ?? 0;
    const delta = scoreAfter - scoreBefore;
    const percentChange = scoreBefore > 0 ? (delta / scoreBefore) * 100 : 0;

    if (Math.abs(delta) < 0.01) continue; // ignore noise

    signals.push({
      dimension: dim,
      scoreBefore,
      scoreAfter,
      delta,
      percentChange,
      significance: significanceFromDelta(delta),
    });
  }

  // Compare trust averages
  const trustDelta = after.avgTrust - before.avgTrust;
  if (Math.abs(trustDelta) >= 0.01) {
    signals.push({
      dimension: 'avg_trust',
      scoreBefore: before.avgTrust,
      scoreAfter: after.avgTrust,
      delta: trustDelta,
      percentChange: before.avgTrust > 0 ? (trustDelta / before.avgTrust) * 100 : 0,
      significance: significanceFromDelta(trustDelta),
    });
  }

  // Overall drift magnitude (RMS of deltas)
  const overallDrift = signals.length > 0
    ? Math.sqrt(signals.reduce((s, sig) => s + sig.delta ** 2, 0) / signals.length)
    : 0;

  // Direction
  const positiveSignals = signals.filter(s => s.delta > 0).length;
  const negativeSignals = signals.filter(s => s.delta < 0).length;
  const driftDirection: DriftReport['driftDirection'] =
    signals.length === 0 ? 'stable'
    : positiveSignals > 0 && negativeSignals === 0 ? 'improved'
    : negativeSignals > 0 && positiveSignals === 0 ? 'degraded'
    : 'mixed';

  // Recommendation
  const hasCritical = signals.some(s => s.significance === 'critical');
  const hasHigh = signals.some(s => s.significance === 'high');
  const recommendation: DriftReport['recommendation'] =
    hasCritical && driftDirection === 'degraded' ? 'rollback'
    : hasCritical || hasHigh ? 'investigate'
    : signals.length > 0 ? 'monitor'
    : 'approve';

  const modelBeforeKey = modelVersionKey(before.model);
  const modelAfterKey = modelVersionKey(after.model);
  const sameModel = modelBeforeKey === modelAfterKey;

  const summary = sameModel
    ? `Behavioral drift detected within same model (${modelAfterKey}): ${signals.length} dimension(s) changed, overall magnitude ${(overallDrift * 100).toFixed(1)}%`
    : `Model change detected (${modelBeforeKey} → ${modelAfterKey}): ${signals.length} dimension(s) changed, ${driftDirection}, overall drift ${(overallDrift * 100).toFixed(1)}%`;

  return {
    agentId: after.agentId,
    modelBefore: before.model,
    modelAfter: after.model,
    snapshotBefore: before,
    snapshotAfter: after,
    signals,
    overallDrift,
    driftDirection,
    recommendation,
    detectedAt: new Date(),
    summary,
  };
}

/* ── Snapshot builder ─────────────────────────────────────────────── */

export function buildSnapshot(
  agentId: string,
  model: ModelVersion,
  evidence: EvidenceArtifact[],
): EvidenceSnapshot {
  const dimensionScores: Record<string, number> = {};
  let totalTrust = 0;

  const trustWeights: Record<EvidenceArtifact['kind'], number> = {
    ...EVIDENCE_KIND_WEIGHTS,
  };

  // Group by dimension (qid prefix)
  const byDim = new Map<string, EvidenceArtifact[]>();
  for (const e of evidence) {
    const dim = e.qid.split('.')[0] ?? e.qid;
    const arr = byDim.get(dim) ?? [];
    arr.push(e);
    byDim.set(dim, arr);
  }

  for (const [dim, artifacts] of byDim) {
    let dimScore = 0;
    let dimWeight = 0;
    for (const a of artifacts) {
      const tw = trustWeights[a.kind];
      dimScore += a.trust * tw;
      dimWeight += tw;
      totalTrust += tw;
    }
    dimensionScores[dim] = dimWeight > 0 ? dimScore / dimWeight : 0;
  }

  const avgTrust = evidence.length > 0 ? totalTrust / evidence.length : 0;

  return {
    agentId,
    capturedAt: new Date(),
    model,
    dimensionScores,
    evidenceCount: evidence.length,
    avgTrust,
  };
}

/* ── Model version parser ─────────────────────────────────────────── */

/** Parse a model string like "openai/gpt-4o" or "anthropic/claude-opus-4-6" */
export function parseModelVersion(modelStr: string): ModelVersion {
  const [provider, ...rest] = modelStr.split('/');
  const modelAndVersion = rest.join('/');
  const [model, version] = modelAndVersion.includes('@')
    ? modelAndVersion.split('@') as [string, string]
    : [modelAndVersion, undefined];

  return {
    provider: provider ?? 'unknown',
    model: model ?? modelStr,
    version,
    capturedAt: new Date(),
  };
}
