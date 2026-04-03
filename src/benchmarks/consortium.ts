/**
 * Consortium Benchmarking (AMC-434)
 *
 * Multi-organization collaborative benchmarking protocol.
 * Allows multiple orgs to contribute anonymized assessment data
 * to a shared benchmark pool, enabling cross-org comparisons
 * without revealing proprietary agent details.
 *
 * Protocol:
 * 1. Each org runs AMC assessments locally
 * 2. Results are pseudonymized and signed
 * 3. Signed contributions are submitted to the consortium pool
 * 4. Aggregate statistics are computed and shared back
 */

import { createHash, randomUUID } from "node:crypto";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ConsortiumMember {
  memberId: string;
  orgPseudonym: string;
  publicKey?: string;
  joinedAt: string;
  contributionCount: number;
}

export interface ConsortiumContribution {
  contributionId: string;
  memberId: string;
  /** Pseudonymized agent scores */
  entries: ConsortiumEntry[];
  /** SHA-256 digest of the contribution payload */
  digest: string;
  /** Optional digital signature */
  signature?: string;
  submittedAt: string;
}

export interface ConsortiumEntry {
  agentPseudonym: string;
  compositeScore: number;
  layerScores: Record<string, number>;
  trustLabel: string;
  questionsAnswered: number;
  amcVersion: string;
}

export interface ConsortiumAggregateStats {
  totalContributions: number;
  totalAgents: number;
  totalMembers: number;
  scoreDistribution: {
    mean: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
    p25: number;
    p75: number;
    p90: number;
  };
  layerDistributions: Record<
    string,
    {
      mean: number;
      median: number;
      stdDev: number;
    }
  >;
  trustLabelDistribution: Record<string, number>;
  generatedAt: string;
}

export interface ConsortiumPool {
  members: ConsortiumMember[];
  contributions: ConsortiumContribution[];
}

// ── Pool management ────────────────────────────────────────────────────────

export function createConsortiumPool(): ConsortiumPool {
  return { members: [], contributions: [] };
}

export function addMember(
  pool: ConsortiumPool,
  orgName: string,
  publicKey?: string,
): ConsortiumMember {
  const member: ConsortiumMember = {
    memberId: randomUUID(),
    orgPseudonym: pseudonymizeOrg(orgName),
    publicKey,
    joinedAt: new Date().toISOString(),
    contributionCount: 0,
  };
  pool.members.push(member);
  return member;
}

function pseudonymizeOrg(orgName: string): string {
  return (
    "org-" +
    createHash("sha256").update(orgName).digest("hex").slice(0, 10)
  );
}

// ── Contribution submission ────────────────────────────────────────────────

export function submitContribution(
  pool: ConsortiumPool,
  memberId: string,
  entries: ConsortiumEntry[],
  signature?: string,
): ConsortiumContribution {
  const member = pool.members.find((m) => m.memberId === memberId);
  if (!member) {
    throw new Error(`Unknown member: ${memberId}`);
  }

  const payload = JSON.stringify(entries);
  const digest = createHash("sha256").update(payload).digest("hex");

  const contribution: ConsortiumContribution = {
    contributionId: randomUUID(),
    memberId,
    entries,
    digest,
    signature,
    submittedAt: new Date().toISOString(),
  };

  pool.contributions.push(contribution);
  member.contributionCount++;

  return contribution;
}

// ── Aggregate statistics ───────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower);
}

function stdDev(values: number[], mean: number): number {
  if (values.length <= 1) return 0;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.round(Math.sqrt(variance) * 1000) / 1000;
}

export function computeAggregateStats(
  pool: ConsortiumPool,
): ConsortiumAggregateStats {
  const allEntries = pool.contributions.flatMap((c) => c.entries);
  const scores = allEntries
    .map((e) => e.compositeScore)
    .sort((a, b) => a - b);

  const mean =
    scores.length > 0
      ? Math.round(
          (scores.reduce((a, b) => a + b, 0) / scores.length) * 1000,
        ) / 1000
      : 0;

  // Trust label distribution
  const trustDist: Record<string, number> = {};
  for (const entry of allEntries) {
    trustDist[entry.trustLabel] = (trustDist[entry.trustLabel] ?? 0) + 1;
  }

  // Per-layer distributions
  const layers = new Set<string>();
  for (const entry of allEntries) {
    for (const layer of Object.keys(entry.layerScores)) {
      layers.add(layer);
    }
  }

  const layerDistributions: ConsortiumAggregateStats["layerDistributions"] =
    {};
  for (const layer of layers) {
    const layerScores = allEntries
      .map((e) => e.layerScores[layer])
      .filter((s): s is number => s !== undefined)
      .sort((a, b) => a - b);
    const layerMean =
      layerScores.length > 0
        ? Math.round(
            (layerScores.reduce((a, b) => a + b, 0) / layerScores.length) *
              1000,
          ) / 1000
        : 0;
    layerDistributions[layer] = {
      mean: layerMean,
      median: percentile(layerScores, 50),
      stdDev: stdDev(layerScores, layerMean),
    };
  }

  return {
    totalContributions: pool.contributions.length,
    totalAgents: allEntries.length,
    totalMembers: pool.members.length,
    scoreDistribution: {
      mean,
      median: percentile(scores, 50),
      stdDev: stdDev(scores, mean),
      min: scores[0] ?? 0,
      max: scores[scores.length - 1] ?? 0,
      p25: percentile(scores, 25),
      p75: percentile(scores, 75),
      p90: percentile(scores, 90),
    },
    layerDistributions,
    trustLabelDistribution: trustDist,
    generatedAt: new Date().toISOString(),
  };
}
