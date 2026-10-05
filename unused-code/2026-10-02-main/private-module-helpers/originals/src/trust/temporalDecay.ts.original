/**
 * Temporal Trust Decay
 *
 * Trust evidence has a half-life. Older evidence contributes less to current trust scores.
 * EffectiveTrust(t) = Σ(evidence_i.weight * e^(-λ * (t - t_i)))
 * where λ = ln(2) / half_life_days
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema & types
// ---------------------------------------------------------------------------

export const decayConfigSchema = z.object({
  behavioral: z.number().positive().default(14),
  assurance: z.number().positive().default(30),
  cryptographic: z.number().positive().default(90),
  selfReported: z.number().positive().default(7),
});

export type DecayConfig = z.infer<typeof decayConfigSchema>;

export type EvidenceCategory = keyof DecayConfig;

export interface TrustEvidence {
  id: string;
  category: EvidenceCategory;
  weight: number; // 0-1, nominal contribution
  timestamp: number; // epoch ms
  description?: string;
}

export interface DecayedEvidence extends TrustEvidence {
  ageInDays: number;
  decayFactor: number; // e^(-λ * age), 0-1
  effectiveWeight: number; // weight * decayFactor
}

export interface TemporalDecayReport {
  agentId: string;
  computedAt: number;
  config: DecayConfig;
  nominalTrust: number; // sum of raw weights (capped 0-1)
  effectiveTrust: number; // sum of decayed weights (capped 0-1)
  decayDelta: number; // nominal - effective
  freshnessRatio: number; // effective / nominal (0 when nominal is 0)
  staleTrustAlert: boolean;
  staleTrustThreshold: number;
  evidenceItems: DecayedEvidence[];
  freshnessBuckets: FreshnessBucket[];
  signature: string;
}

export interface TemporalDecaySourceRun {
  runId: string;
  ts: number;
  integrityIndex?: number;
  evidenceTrustCoverage?: {
    observed?: number;
    attested?: number;
    selfReported?: number;
  };
}

export interface FreshnessBucket {
  label: string;
  minDays: number;
  maxDays: number;
  count: number;
  totalWeight: number;
  totalEffectiveWeight: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_DECAY_CONFIG: DecayConfig = {
  behavioral: 14,
  assurance: 30,
  cryptographic: 90,
  selfReported: 7,
};

const STALE_TRUST_THRESHOLD = 0.2; // alert if effective drops >20% below nominal
const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Core math
// ---------------------------------------------------------------------------

export function lambdaForHalfLife(halfLifeDays: number): number {
  return Math.LN2 / halfLifeDays;
}

export function computeDecayFactor(ageDays: number, halfLifeDays: number): number {
  const lambda = lambdaForHalfLife(halfLifeDays);
  return Math.exp(-lambda * ageDays);
}

// ---------------------------------------------------------------------------
// Evidence processing
// ---------------------------------------------------------------------------

export function applyDecay(
  evidence: TrustEvidence[],
  config: DecayConfig = DEFAULT_DECAY_CONFIG,
  now: number = Date.now(),
): DecayedEvidence[] {
  return evidence.map((e) => {
    const ageDays = Math.max(0, (now - e.timestamp) / MS_PER_DAY);
    const halfLife = config[e.category];
    const decayFactor = computeDecayFactor(ageDays, halfLife);
    const effectiveWeight = e.weight * decayFactor;
    return {
      ...e,
      ageInDays: ageDays,
      decayFactor,
      effectiveWeight,
    };
  });
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round6(value: number): number {
  return Number(value.toFixed(6));
}

/**
 * Converts diagnostic run trust coverage into temporal evidence records.
 * Backward compatible: missing fields are treated as zero-weight evidence.
 */
export function deriveTemporalEvidenceFromRuns(runs: TemporalDecaySourceRun[]): TrustEvidence[] {
  const out: TrustEvidence[] = [];
  for (const run of runs) {
    const integrity = clamp01(run.integrityIndex ?? 0);
    const coverage = run.evidenceTrustCoverage ?? {};
    const observed = clamp01(coverage.observed ?? 0);
    const attested = clamp01(coverage.attested ?? 0);
    const selfReported = clamp01(coverage.selfReported ?? 0);

    const pushEvidence = (category: EvidenceCategory, suffix: string, share: number) => {
      const weight = round6(share * integrity);
      if (weight <= 0) {
        return;
      }
      out.push({
        id: `${run.runId}:${suffix}`,
        category,
        weight,
        timestamp: run.ts,
        description: `derived from run ${run.runId}`
      });
    };

    pushEvidence("behavioral", "observed", observed);
    pushEvidence("assurance", "attested", attested);
    pushEvidence("selfReported", "self", selfReported);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Freshness buckets
// ---------------------------------------------------------------------------

const BUCKET_DEFS: Omit<FreshnessBucket, "count" | "totalWeight" | "totalEffectiveWeight">[] = [
  { label: "< 1 day", minDays: 0, maxDays: 1 },
  { label: "1-7 days", minDays: 1, maxDays: 7 },
  { label: "7-14 days", minDays: 7, maxDays: 14 },
  { label: "14-30 days", minDays: 14, maxDays: 30 },
  { label: "30-90 days", minDays: 30, maxDays: 90 },
  { label: "> 90 days", minDays: 90, maxDays: Infinity },
];

function buildFreshnessBuckets(items: DecayedEvidence[]): FreshnessBucket[] {
  return BUCKET_DEFS.map((def) => {
    const matching = items.filter(
      (e) => e.ageInDays >= def.minDays && e.ageInDays < def.maxDays,
    );
    return {
      ...def,
      count: matching.length,
      totalWeight: matching.reduce((s, e) => s + e.weight, 0),
      totalEffectiveWeight: matching.reduce((s, e) => s + e.effectiveWeight, 0),
    };
  });
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

export function computeTemporalDecayReport(
  agentId: string,
  evidence: TrustEvidence[],
  config: DecayConfig = DEFAULT_DECAY_CONFIG,
  now: number = Date.now(),
  staleTrustThreshold: number = STALE_TRUST_THRESHOLD,
): TemporalDecayReport {
  const decayed = applyDecay(evidence, config, now);
  const nominalTrust = clamp01(evidence.reduce((s, e) => s + e.weight, 0));
  const effectiveTrust = clamp01(decayed.reduce((s, e) => s + e.effectiveWeight, 0));
  const decayDelta = nominalTrust - effectiveTrust;
  const freshnessRatio = nominalTrust > 0 ? effectiveTrust / nominalTrust : 0;
  const staleTrustAlert = decayDelta > staleTrustThreshold;
  const freshnessBuckets = buildFreshnessBuckets(decayed);

  return {
    agentId,
    computedAt: now,
    config,
    nominalTrust,
    effectiveTrust,
    decayDelta,
    freshnessRatio: round6(freshnessRatio),
    staleTrustAlert,
    staleTrustThreshold,
    evidenceItems: decayed,
    freshnessBuckets,
    signature: `decay:${agentId}:${now}`,
  };
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

export function renderTemporalDecayMarkdown(report: TemporalDecayReport): string {
  const lines: string[] = [
    `# Temporal Trust Decay — ${report.agentId}`,
    "",
    `**Computed:** ${new Date(report.computedAt).toISOString()}`,
    "",
    "## Trust Summary",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Nominal Trust | ${report.nominalTrust.toFixed(3)} |`,
    `| Effective Trust | ${report.effectiveTrust.toFixed(3)} |`,
    `| Decay Delta | ${report.decayDelta.toFixed(3)} |`,
    `| Freshness Ratio | ${(report.freshnessRatio * 100).toFixed(1)}% |`,
    `| Stale Trust Alert | ${report.staleTrustAlert ? "⚠️ YES" : "✅ No"} |`,
    "",
    "## Decay Configuration",
    "",
    `| Evidence Type | Half-Life (days) |`,
    `|---------------|-----------------|`,
    `| Behavioral | ${report.config.behavioral} |`,
    `| Assurance | ${report.config.assurance} |`,
    `| Cryptographic | ${report.config.cryptographic} |`,
    `| Self-Reported | ${report.config.selfReported} |`,
    "",
    "## Evidence Freshness Distribution",
    "",
    `| Bucket | Count | Raw Weight | Effective Weight |`,
    `|--------|-------|------------|------------------|`,
  ];

  for (const b of report.freshnessBuckets) {
    lines.push(
      `| ${b.label} | ${b.count} | ${b.totalWeight.toFixed(3)} | ${b.totalEffectiveWeight.toFixed(3)} |`,
    );
  }

  if (report.evidenceItems.length > 0) {
    lines.push("", "## Evidence Items", "");
    lines.push(`| ID | Category | Age (d) | Raw Weight | Decay Factor | Effective |`);
    lines.push(`|----|----------|---------|------------|--------------|-----------|`);
    for (const e of report.evidenceItems.slice(0, 50)) {
      lines.push(
        `| ${e.id} | ${e.category} | ${e.ageInDays.toFixed(1)} | ${e.weight.toFixed(3)} | ${e.decayFactor.toFixed(3)} | ${e.effectiveWeight.toFixed(3)} |`,
      );
    }
    if (report.evidenceItems.length > 50) {
      lines.push(``, `*… ${report.evidenceItems.length - 50} more items omitted*`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Freshness report (for CLI amc trust freshness)
// ---------------------------------------------------------------------------

export function renderFreshnessMarkdown(report: TemporalDecayReport): string {
  const lines: string[] = [
    `# Evidence Freshness — ${report.agentId}`,
    "",
    `**Computed:** ${new Date(report.computedAt).toISOString()}`,
    "",
    `| Bucket | Count | % of Total | Effective Weight |`,
    `|--------|-------|-----------|------------------|`,
  ];

  const total = report.evidenceItems.length || 1;
  for (const b of report.freshnessBuckets) {
    const pct = ((b.count / total) * 100).toFixed(1);
    lines.push(
      `| ${b.label} | ${b.count} | ${pct}% | ${b.totalEffectiveWeight.toFixed(3)} |`,
    );
  }

  lines.push("", "## By Category", "");
  const cats: EvidenceCategory[] = ["behavioral", "assurance", "cryptographic", "selfReported"];
  lines.push(`| Category | Count | Avg Age (d) | Half-Life (d) |`);
  lines.push(`|----------|-------|-------------|---------------|`);
  for (const cat of cats) {
    const items = report.evidenceItems.filter((e) => e.category === cat);
    const avgAge = items.length > 0
      ? (items.reduce((s, e) => s + e.ageInDays, 0) / items.length).toFixed(1)
      : "N/A";
    lines.push(`| ${cat} | ${items.length} | ${avgAge} | ${report.config[cat]} |`);
  }

  return lines.join("\n");
}
