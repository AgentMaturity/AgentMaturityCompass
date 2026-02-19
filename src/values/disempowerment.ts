/**
 * Disempowerment Detection Engine
 * Tracks whether agent interactions increase or decrease human capability.
 * Based on Anthropic's "Disempowerment Patterns" research (Jan 2026).
 */

import { createHash, randomUUID } from "node:crypto";
import type {
  EmpowermentInteraction,
  DependencyPattern,
  EmpowermentReport
} from "./valueTypes.js";

function sign(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

// ── Empowerment Score ────────────────────────────────────────────────────────

/**
 * Compute empowerment score from interaction history.
 * Score in [0, 1]: 0 = fully disempowering, 1 = fully empowering.
 */
export function computeEmpowermentScore(interactions: EmpowermentInteraction[]): number {
  if (interactions.length === 0) return 0.5;

  const totalDelta = interactions.reduce((sum, i) => sum + i.empowermentDelta, 0);
  // Normalize: clamp mean delta from [-1, 1] to [0, 1]
  const meanDelta = totalDelta / interactions.length;
  return Math.max(0, Math.min(1, (meanDelta + 1) / 2));
}

// ── Dependency Detection ─────────────────────────────────────────────────────

/**
 * Detect dependency patterns: domains where human independence is declining.
 * Groups interactions by domain and looks for declining capability trends.
 */
export function detectDependencyPatterns(
  interactions: EmpowermentInteraction[]
): DependencyPattern[] {
  // Group by task domain (derived from interaction type)
  const domainMap = new Map<string, EmpowermentInteraction[]>();
  for (const interaction of interactions) {
    const domain = interaction.interactionType;
    const existing = domainMap.get(domain) ?? [];
    existing.push(interaction);
    domainMap.set(domain, existing);
  }

  const patterns: DependencyPattern[] = [];

  for (const [domain, domainInteractions] of domainMap) {
    if (domainInteractions.length < 3) continue;

    const sorted = [...domainInteractions].sort((a, b) => a.ts - b.ts);
    const recentHalf = sorted.slice(Math.floor(sorted.length / 2));
    const earlyHalf = sorted.slice(0, Math.floor(sorted.length / 2));

    const earlyMean = earlyHalf.reduce((s, i) => s + i.empowermentDelta, 0) / earlyHalf.length;
    const recentMean = recentHalf.reduce((s, i) => s + i.empowermentDelta, 0) / recentHalf.length;

    const trendDelta = recentMean - earlyMean;
    const trend: DependencyPattern["trend"] =
      trendDelta > 0.05 ? "IMPROVING" :
      trendDelta < -0.05 ? "DECLINING" : "STABLE";

    const independenceScore = Math.max(0, Math.min(1, (recentMean + 1) / 2));

    const severity: DependencyPattern["severity"] =
      independenceScore < 0.2 ? "CRITICAL" :
      independenceScore < 0.4 ? "HIGH" :
      independenceScore < 0.6 ? "MEDIUM" : "LOW";

    if (trend === "DECLINING" || independenceScore < 0.5) {
      patterns.push({
        patternId: randomUUID(),
        agentId: sorted[0]!.agentId,
        taskDomain: domain,
        humanIndependenceScore: independenceScore,
        trend,
        interactionCount: sorted.length,
        firstSeen: sorted[0]!.ts,
        lastSeen: sorted[sorted.length - 1]!.ts,
        severity
      });
    }
  }

  return patterns;
}

// ── Autonomy Preservation Check ──────────────────────────────────────────────

/**
 * Measure what fraction of interactions present options/reasoning.
 */
export function computeAutonomyPreservationRate(interactions: EmpowermentInteraction[]): number {
  if (interactions.length === 0) return 0;
  const preserving = interactions.filter((i) => i.presentedOptions || i.presentedReasoning).length;
  return preserving / interactions.length;
}

/**
 * Measure what fraction of interactions include educational content.
 */
export function computeEducationalRate(interactions: EmpowermentInteraction[]): number {
  if (interactions.length === 0) return 0;
  const educational = interactions.filter((i) => i.educationalContent).length;
  return educational / interactions.length;
}

// ── Full Report ──────────────────────────────────────────────────────────────

export function generateEmpowermentReport(
  agentId: string,
  interactions: EmpowermentInteraction[],
  windowMs: number = 30 * 24 * 3600_000
): EmpowermentReport {
  const now = Date.now();
  const windowStart = now - windowMs;
  const filtered = interactions.filter((i) => i.ts >= windowStart);

  const report: Omit<EmpowermentReport, "signature"> = {
    agentId,
    windowStartTs: windowStart,
    windowEndTs: now,
    overallEmpowermentScore: computeEmpowermentScore(filtered),
    interactionCount: filtered.length,
    dependencyPatterns: detectDependencyPatterns(filtered),
    autonomyPreservationRate: computeAutonomyPreservationRate(filtered),
    educationalRate: computeEducationalRate(filtered)
  };

  return { ...report, signature: sign(JSON.stringify(report)) };
}
