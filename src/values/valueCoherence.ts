/**
 * Value Coherence Engine
 * Measures structural coherence of revealed preferences from decision traces.
 * Uses Kendall's tau-based rank correlation for pairwise preference consistency.
 */

import { createHash } from "node:crypto";
import type {
  RevealedPreference,
  PreferenceInversion,
  ValueCoherenceReport,
  ValueDriftPoint
} from "./valueTypes.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function sign(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function stableId(parts: string[]): string {
  return sign(parts.join("|")).slice(0, 24);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Compute Kendall's tau-b coefficient for two ranked lists.
 * Returns value in [-1, 1]; we map to [0, 1] for VCI.
 */
function kendallTauB(rankA: number[], rankB: number[]): number {
  const n = rankA.length;
  if (n < 2) return 1;

  let concordant = 0;
  let discordant = 0;
  let tiedA = 0;
  let tiedB = 0;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const diffA = rankA[i]! - rankA[j]!;
      const diffB = rankB[i]! - rankB[j]!;
      const product = diffA * diffB;

      if (product > 0) concordant++;
      else if (product < 0) discordant++;
      else {
        if (diffA === 0) tiedA++;
        if (diffB === 0) tiedB++;
      }
    }
  }

  const totalPairs = (n * (n - 1)) / 2;
  const denominator = Math.sqrt((totalPairs - tiedA) * (totalPairs - tiedB));
  if (denominator === 0) return 1;

  return (concordant - discordant) / denominator;
}

// ── Value dimensions & ranking ───────────────────────────────────────────────

const VALUE_DIMENSIONS = [
  "safety", "speed", "accuracy", "cost", "privacy",
  "transparency", "autonomy", "fairness", "reliability", "compliance"
] as const;

type ValueDimension = (typeof VALUE_DIMENSIONS)[number];

function normalizeValue(v: string): string {
  return v.trim().toLowerCase();
}

function isKnownValue(v: string): v is ValueDimension {
  return (VALUE_DIMENSIONS as readonly string[]).includes(normalizeValue(v));
}

function sanitizePreference(pref: RevealedPreference): RevealedPreference | null {
  if (!pref.preferenceId || !Number.isFinite(pref.ts)) {
    return null;
  }
  const impliedValue = normalizeValue(pref.impliedValue);
  if (!isKnownValue(impliedValue)) {
    return null;
  }

  const alternatives = [...new Set((pref.alternatives ?? []).map(normalizeValue).filter(isKnownValue))]
    .filter((value) => value !== impliedValue);

  return {
    ...pref,
    impliedValue,
    alternatives
  };
}

function sanitizePreferences(preferences: RevealedPreference[]): RevealedPreference[] {
  const deduped = new Map<string, RevealedPreference>();
  for (const pref of preferences) {
    const clean = sanitizePreference(pref);
    if (!clean) continue;
    deduped.set(clean.preferenceId, clean);
  }
  return [...deduped.values()].sort((a, b) => a.ts - b.ts);
}

function contextFamily(context: string): string {
  return context.trim().toLowerCase().replace(/\s+/g, " ");
}

const MAX_PAIR_COMPARISONS = 20_000;

export interface ValueDriftAnalytics {
  maxDelta: number;
  meanDelta: number;
  shiftingCount: number;
  driftingCount: number;
  stableCount: number;
}

/**
 * Build a value-priority ranking from a set of preferences.
 * Each preference "reveals" a ranking: chosen value > alternative values.
 * We count wins per value dimension to derive a rank ordering.
 */
function buildValueRanking(preferences: RevealedPreference[]): Map<string, number> {
  const wins = new Map<string, number>();

  for (const pref of preferences) {
    const v = normalizeValue(pref.impliedValue);
    wins.set(v, (wins.get(v) ?? 0) + 1);
  }

  const sorted = [...wins.entries()].sort((a, b) => b[1] - a[1]);
  const ranking = new Map<string, number>();
  sorted.forEach(([key], idx) => ranking.set(key, idx + 1));
  return ranking;
}

// ── Preference Inversion Detection ───────────────────────────────────────────

export function detectInversions(preferences: RevealedPreference[]): PreferenceInversion[] {
  const inversions: PreferenceInversion[] = [];
  const sorted = sanitizePreferences(preferences);

  let comparisons = 0;
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      comparisons += 1;
      if (comparisons > MAX_PAIR_COMPARISONS) {
        return inversions;
      }

      const a = sorted[i]!;
      const b = sorted[j]!;

      const aValue = normalizeValue(a.impliedValue);
      const bValue = normalizeValue(b.impliedValue);
      const contextMatch = contextFamily(a.context) === contextFamily(b.context);

      // Inversion: A picked X over Y then B picked Y over X in same context family.
      if (
        a.preferenceId !== b.preferenceId &&
        aValue !== bValue &&
        a.alternatives.includes(bValue) &&
        b.alternatives.includes(aValue) &&
        a.chosenOption !== b.chosenOption &&
        contextMatch
      ) {
        const timeDelta = Math.abs(b.ts - a.ts);
        const severity =
          timeDelta < 3_600_000 ? "CRITICAL" as const :
          timeDelta < 86_400_000 ? "HIGH" as const :
          timeDelta < 604_800_000 ? "MEDIUM" as const : "LOW" as const;

        const detectedTs = Math.max(a.ts, b.ts);
        inversions.push({
          inversionId: stableId(["inversion", a.preferenceId, b.preferenceId, `${detectedTs}`]),
          preferenceA: a.preferenceId,
          preferenceB: b.preferenceId,
          valueA: aValue,
          valueB: bValue,
          contextA: a.context,
          contextB: b.context,
          severity,
          explanation: `Agent preferred ${aValue} over ${bValue} in "${a.context}" but later reversed in "${b.context}"`,
          detectedTs
        });
      }
    }
  }

  return inversions;
}

// ── Value Drift Monitoring ───────────────────────────────────────────────────

export function computeValueDrift(
  preferences: RevealedPreference[],
  _windowMs: number
): ValueDriftPoint[] {
  const sorted = sanitizePreferences(preferences);
  if (sorted.length < 4) return [];

  const midIdx = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, midIdx);
  const secondHalf = sorted.slice(midIdx);
  if (firstHalf.length < 2 || secondHalf.length < 2) return [];

  const rankingFirst = buildValueRanking(firstHalf);
  const rankingSecond = buildValueRanking(secondHalf);

  const allValues = new Set([...rankingFirst.keys(), ...rankingSecond.keys()]);
  const driftPoints: ValueDriftPoint[] = [];

  for (const dim of allValues) {
    const rankA = rankingFirst.get(dim) ?? allValues.size;
    const rankB = rankingSecond.get(dim) ?? allValues.size;
    const delta = clamp01(Math.abs(rankA - rankB) / Math.max(1, allValues.size));

    const trend: ValueDriftPoint["trend"] =
      delta < 0.1 ? "STABLE" :
      delta < 0.3 ? "DRIFTING" : "SHIFTING";

    driftPoints.push({ dimension: dim, delta: Number(delta.toFixed(6)), trend });
  }

  return driftPoints.sort((a, b) => b.delta - a.delta || a.dimension.localeCompare(b.dimension));
}

export function computeValueDriftAnalytics(points: ValueDriftPoint[]): ValueDriftAnalytics {
  if (points.length === 0) {
    return {
      maxDelta: 0,
      meanDelta: 0,
      shiftingCount: 0,
      driftingCount: 0,
      stableCount: 0
    };
  }

  const maxDelta = Math.max(...points.map((point) => point.delta));
  const meanDelta = points.reduce((sum, point) => sum + point.delta, 0) / points.length;

  return {
    maxDelta: Number(clamp01(maxDelta).toFixed(6)),
    meanDelta: Number(clamp01(meanDelta).toFixed(6)),
    shiftingCount: points.filter((point) => point.trend === "SHIFTING").length,
    driftingCount: points.filter((point) => point.trend === "DRIFTING").length,
    stableCount: points.filter((point) => point.trend === "STABLE").length
  };
}

// ── VCI Computation ──────────────────────────────────────────────────────────

/**
 * Compute the Value Coherence Index (VCI) for a set of preferences.
 * VCI = (kendall_tau + 1) / 2, mapped to [0, 1].
 *
 * We split preferences into time-ordered segments and measure
 * consistency of value rankings across segments.
 */
export function computeVCI(preferences: RevealedPreference[]): number {
  const sorted = sanitizePreferences(preferences);
  if (sorted.length < 2) return 1;

  const midIdx = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, midIdx);
  const secondHalf = sorted.slice(midIdx);

  const rankingFirst = buildValueRanking(firstHalf);
  const rankingSecond = buildValueRanking(secondHalf);

  const allValues = [...new Set([...rankingFirst.keys(), ...rankingSecond.keys()])];
  if (allValues.length < 2) return 1;

  const ranksA = allValues.map((v) => rankingFirst.get(v) ?? allValues.length);
  const ranksB = allValues.map((v) => rankingSecond.get(v) ?? allValues.length);

  const tau = kendallTauB(ranksA, ranksB);
  return Number(clamp01((tau + 1) / 2).toFixed(6));
}

// ── Full Report ──────────────────────────────────────────────────────────────

export function generateValueCoherenceReport(
  agentId: string,
  preferences: RevealedPreference[],
  windowMs: number = 14 * 24 * 3600_000
): ValueCoherenceReport {
  const now = Date.now();
  const windowStart = now - windowMs;
  const filtered = sanitizePreferences(preferences).filter((p) => p.ts >= windowStart && p.ts <= now);

  const vci = computeVCI(filtered);
  const inversions = detectInversions(filtered);
  const valueDrift = computeValueDrift(filtered, windowMs);

  const report: Omit<ValueCoherenceReport, "signature"> = {
    agentId,
    windowStartTs: windowStart,
    windowEndTs: now,
    vci,
    preferenceCount: filtered.length,
    inversions,
    valueDrift
  };

  const signature = sign(JSON.stringify(report));
  return { ...report, signature };
}

// ── CLI helpers ──────────────────────────────────────────────────────────────

export function parseWindowString(windowStr: string): number {
  const match = windowStr.match(/^(\d+)(d|h|m)$/);
  if (!match) return 14 * 24 * 3600_000;
  const value = parseInt(match[1]!, 10);
  const unit = match[2]!;
  if (unit === "d") return value * 24 * 3600_000;
  if (unit === "h") return value * 3600_000;
  return value * 60_000;
}
