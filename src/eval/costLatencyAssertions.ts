import { nearestRank } from "../experiments/stats.js";
/**
 * Cost & Latency Tracking Assertions
 *
 * Per-eval cost tracking, latency measurement, token usage counting,
 * and threshold-based assertions for eval pipelines.
 *
 * Usage:
 *   const tracker = new EvalMetricsTracker();
 *   tracker.recordEval({ evalId: "e1", costUsd: 0.05, latencyMs: 1200, tokensUsed: 3500 });
 *   tracker.assertCostBelow(0.10);        // throws if any eval > $0.10
 *   tracker.assertLatencyBelow(2000);      // throws if any eval > 2000ms
 *   tracker.assertTokenUsageBelow(5000);   // throws if any eval > 5000 tokens
 *   tracker.assertTotalCostBelow(1.00);    // throws if aggregate > $1.00
 *   const report = tracker.summary();
 *
 * Issue: AMC-74 — BUILD: Cost & Latency Tracking Assertions
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EvalMetricsRecord {
  evalId: string;
  /** Model used for this eval (optional, for per-model breakdowns) */
  model?: string;
  /** Cost in USD for this single evaluation */
  costUsd: number;
  /** Wall-clock latency in milliseconds */
  latencyMs: number;
  /** Total tokens consumed (input + output) */
  tokensUsed: number;
  /** Input tokens (optional breakdown) */
  inputTokens?: number;
  /** Output tokens (optional breakdown) */
  outputTokens?: number;
  /** Timestamp of the eval (defaults to Date.now()) */
  ts?: number;
  /** Arbitrary metadata (eval name, scenario, etc.) */
  meta?: Record<string, unknown>;
}

export interface ThresholdViolation {
  evalId: string;
  metric: "cost" | "latency" | "tokens" | "inputTokens" | "outputTokens";
  observed: number;
  threshold: number;
  model?: string;
}

export interface EvalMetricsSummary {
  evalCount: number;
  totalCostUsd: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgCostUsd: number;
  avgLatencyMs: number;
  avgTokens: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  minCostUsd: number;
  maxCostUsd: number;
  byModel: Record<string, ModelMetricsSummary>;
}

export interface ModelMetricsSummary {
  evalCount: number;
  totalCostUsd: number;
  totalTokens: number;
  avgCostUsd: number;
  avgLatencyMs: number;
  avgTokens: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
}

export class CostThresholdError extends Error {
  constructor(
    public readonly violations: ThresholdViolation[],
    message?: string,
  ) {
    super(message ?? `Cost threshold exceeded: ${violations.length} violation(s)`);
    this.name = "CostThresholdError";
  }
}

export class LatencyThresholdError extends Error {
  constructor(
    public readonly violations: ThresholdViolation[],
    message?: string,
  ) {
    super(message ?? `Latency threshold exceeded: ${violations.length} violation(s)`);
    this.name = "LatencyThresholdError";
  }
}

export class TokenThresholdError extends Error {
  constructor(
    public readonly violations: ThresholdViolation[],
    message?: string,
  ) {
    super(message ?? `Token usage threshold exceeded: ${violations.length} violation(s)`);
    this.name = "TokenThresholdError";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function percentile(values: number[], p: number): number {
  // All callers request fixed 50th, 95th or 99th percentiles within the shared nearest-rank domain.
  return nearestRank(values, p / 100);
}

function safeNum(v: number | undefined, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

// ---------------------------------------------------------------------------
// EvalMetricsTracker
// ---------------------------------------------------------------------------

export class EvalMetricsTracker {
  private records: EvalMetricsRecord[] = [];
  private violations: ThresholdViolation[] = [];

  /**
   * Record metrics for a single eval execution.
   */
  recordEval(record: EvalMetricsRecord): void {
    const cleaned: EvalMetricsRecord = {
      evalId: record.evalId,
      model: record.model,
      costUsd: safeNum(record.costUsd),
      latencyMs: safeNum(record.latencyMs),
      tokensUsed: safeNum(record.tokensUsed),
      inputTokens: record.inputTokens != null ? safeNum(record.inputTokens) : undefined,
      outputTokens: record.outputTokens != null ? safeNum(record.outputTokens) : undefined,
      ts: record.ts ?? Date.now(),
      meta: record.meta,
    };
    this.records.push(cleaned);
  }

  /**
   * Convenience: wrap an async eval function, automatically tracking
   * latency and recording provided cost/token info.
   */
  async trackEval<T>(
    evalId: string,
    fn: () => Promise<{ result: T; costUsd: number; tokensUsed: number; inputTokens?: number; outputTokens?: number; model?: string }>,
  ): Promise<T> {
    const start = performance.now();
    const out = await fn();
    const latencyMs = performance.now() - start;
    this.recordEval({
      evalId,
      model: out.model,
      costUsd: out.costUsd,
      latencyMs,
      tokensUsed: out.tokensUsed,
      inputTokens: out.inputTokens,
      outputTokens: out.outputTokens,
    });
    return out.result;
  }

  // -----------------------------------------------------------------------
  // Per-eval assertions (fail if ANY eval exceeds threshold)
  // -----------------------------------------------------------------------

  /**
   * Assert that every recorded eval's cost is below maxCostUsd.
   * @throws CostThresholdError with details of all violating evals
   */
  assertCostBelow(maxCostUsd: number): void {
    const vs: ThresholdViolation[] = [];
    for (const r of this.records) {
      if (r.costUsd > maxCostUsd) {
        vs.push({
          evalId: r.evalId,
          metric: "cost",
          observed: r.costUsd,
          threshold: maxCostUsd,
          model: r.model,
        });
      }
    }
    if (vs.length > 0) {
      this.violations.push(...vs);
      throw new CostThresholdError(
        vs,
        `${vs.length} eval(s) exceeded cost threshold of $${maxCostUsd}: ${vs.map((v) => `${v.evalId}=$${v.observed.toFixed(4)}`).join(", ")}`,
      );
    }
  }

  /**
   * Assert that every recorded eval's latency is below maxLatencyMs.
   * @throws LatencyThresholdError with details of all violating evals
   */
  assertLatencyBelow(maxLatencyMs: number): void {
    const vs: ThresholdViolation[] = [];
    for (const r of this.records) {
      if (r.latencyMs > maxLatencyMs) {
        vs.push({
          evalId: r.evalId,
          metric: "latency",
          observed: r.latencyMs,
          threshold: maxLatencyMs,
          model: r.model,
        });
      }
    }
    if (vs.length > 0) {
      this.violations.push(...vs);
      throw new LatencyThresholdError(
        vs,
        `${vs.length} eval(s) exceeded latency threshold of ${maxLatencyMs}ms: ${vs.map((v) => `${v.evalId}=${v.observed.toFixed(0)}ms`).join(", ")}`,
      );
    }
  }

  /**
   * Assert that every recorded eval's token usage is below maxTokens.
   * @throws TokenThresholdError with details of all violating evals
   */
  assertTokenUsageBelow(maxTokens: number): void {
    const vs: ThresholdViolation[] = [];
    for (const r of this.records) {
      if (r.tokensUsed > maxTokens) {
        vs.push({
          evalId: r.evalId,
          metric: "tokens",
          observed: r.tokensUsed,
          threshold: maxTokens,
          model: r.model,
        });
      }
    }
    if (vs.length > 0) {
      this.violations.push(...vs);
      throw new TokenThresholdError(
        vs,
        `${vs.length} eval(s) exceeded token threshold of ${maxTokens}: ${vs.map((v) => `${v.evalId}=${v.observed}`).join(", ")}`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Aggregate assertions
  // -----------------------------------------------------------------------

  /**
   * Assert that total cost across all evals is below maxTotalCostUsd.
   */
  assertTotalCostBelow(maxTotalCostUsd: number): void {
    const total = this.records.reduce((s, r) => s + r.costUsd, 0);
    if (total > maxTotalCostUsd) {
      const v: ThresholdViolation = {
        evalId: "__aggregate__",
        metric: "cost",
        observed: total,
        threshold: maxTotalCostUsd,
      };
      this.violations.push(v);
      throw new CostThresholdError(
        [v],
        `Total cost $${total.toFixed(4)} exceeds threshold of $${maxTotalCostUsd}`,
      );
    }
  }

  /**
   * Assert that total tokens across all evals is below maxTotalTokens.
   */
  assertTotalTokensBelow(maxTotalTokens: number): void {
    const total = this.records.reduce((s, r) => s + r.tokensUsed, 0);
    if (total > maxTotalTokens) {
      const v: ThresholdViolation = {
        evalId: "__aggregate__",
        metric: "tokens",
        observed: total,
        threshold: maxTotalTokens,
      };
      this.violations.push(v);
      throw new TokenThresholdError(
        [v],
        `Total tokens ${total} exceeds threshold of ${maxTotalTokens}`,
      );
    }
  }

  /**
   * Assert P95 latency across all evals is below the given threshold.
   */
  assertP95LatencyBelow(maxP95Ms: number): void {
    const latencies = this.records.map((r) => r.latencyMs);
    const p95 = percentile(latencies, 95);
    if (p95 > maxP95Ms) {
      const v: ThresholdViolation = {
        evalId: "__p95__",
        metric: "latency",
        observed: p95,
        threshold: maxP95Ms,
      };
      this.violations.push(v);
      throw new LatencyThresholdError(
        [v],
        `P95 latency ${p95.toFixed(0)}ms exceeds threshold of ${maxP95Ms}ms`,
      );
    }
  }

  /**
   * Assert average cost per eval is below a threshold.
   */
  assertAvgCostBelow(maxAvgCostUsd: number): void {
    const avg = this.records.length > 0
      ? this.records.reduce((s, r) => s + r.costUsd, 0) / this.records.length
      : 0;
    if (avg > maxAvgCostUsd) {
      const v: ThresholdViolation = {
        evalId: "__avg__",
        metric: "cost",
        observed: avg,
        threshold: maxAvgCostUsd,
      };
      this.violations.push(v);
      throw new CostThresholdError(
        [v],
        `Average cost $${avg.toFixed(4)} exceeds threshold of $${maxAvgCostUsd}`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Summary & Reporting
  // -----------------------------------------------------------------------

  /**
   * Get all recorded violations (accumulated across assertions).
   */
  getViolations(): ThresholdViolation[] {
    return [...this.violations];
  }

  /**
   * Get all raw records.
   */
  getRecords(): EvalMetricsRecord[] {
    return [...this.records];
  }

  /**
   * Build a summary report of all tracked eval metrics.
   */
  summary(): EvalMetricsSummary {
    const n = this.records.length;
    if (n === 0) {
      return {
        evalCount: 0,
        totalCostUsd: 0,
        totalTokens: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        avgCostUsd: 0,
        avgLatencyMs: 0,
        avgTokens: 0,
        p50LatencyMs: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
        minLatencyMs: 0,
        maxLatencyMs: 0,
        minCostUsd: 0,
        maxCostUsd: 0,
        byModel: {},
      };
    }

    const costs = this.records.map((r) => r.costUsd);
    const latencies = this.records.map((r) => r.latencyMs);
    const tokens = this.records.map((r) => r.tokensUsed);
    const totalInputTokens = this.records.reduce((s, r) => s + safeNum(r.inputTokens), 0);
    const totalOutputTokens = this.records.reduce((s, r) => s + safeNum(r.outputTokens), 0);

    // Per-model breakdown
    const byModel: Record<string, ModelMetricsSummary> = {};
    const modelGroups = new Map<string, EvalMetricsRecord[]>();
    for (const r of this.records) {
      const key = r.model ?? "__unknown__";
      if (!modelGroups.has(key)) modelGroups.set(key, []);
      modelGroups.get(key)!.push(r);
    }
    for (const [model, recs] of modelGroups) {
      const mc = recs.map((r) => r.costUsd);
      const ml = recs.map((r) => r.latencyMs);
      const mt = recs.map((r) => r.tokensUsed);
      byModel[model] = {
        evalCount: recs.length,
        totalCostUsd: mc.reduce((s, v) => s + v, 0),
        totalTokens: mt.reduce((s, v) => s + v, 0),
        avgCostUsd: mc.reduce((s, v) => s + v, 0) / recs.length,
        avgLatencyMs: ml.reduce((s, v) => s + v, 0) / recs.length,
        avgTokens: mt.reduce((s, v) => s + v, 0) / recs.length,
        p50LatencyMs: percentile(ml, 50),
        p95LatencyMs: percentile(ml, 95),
      };
    }

    return {
      evalCount: n,
      totalCostUsd: costs.reduce((s, v) => s + v, 0),
      totalTokens: tokens.reduce((s, v) => s + v, 0),
      totalInputTokens,
      totalOutputTokens,
      avgCostUsd: costs.reduce((s, v) => s + v, 0) / n,
      avgLatencyMs: latencies.reduce((s, v) => s + v, 0) / n,
      avgTokens: tokens.reduce((s, v) => s + v, 0) / n,
      p50LatencyMs: percentile(latencies, 50),
      p95LatencyMs: percentile(latencies, 95),
      p99LatencyMs: percentile(latencies, 99),
      minLatencyMs: Math.min(...latencies),
      maxLatencyMs: Math.max(...latencies),
      minCostUsd: Math.min(...costs),
      maxCostUsd: Math.max(...costs),
      byModel,
    };
  }

  /**
   * Render a human-readable markdown report.
   */
  renderReport(): string {
    const s = this.summary();
    const lines = [
      "# Eval Cost & Latency Report",
      "",
      `- Evals: ${s.evalCount}`,
      `- Total cost: $${s.totalCostUsd.toFixed(4)}`,
      `- Total tokens: ${s.totalTokens} (in: ${s.totalInputTokens}, out: ${s.totalOutputTokens})`,
      `- Avg cost/eval: $${s.avgCostUsd.toFixed(4)}`,
      `- Avg latency: ${s.avgLatencyMs.toFixed(0)}ms`,
      `- P50/P95/P99 latency: ${s.p50LatencyMs.toFixed(0)}ms / ${s.p95LatencyMs.toFixed(0)}ms / ${s.p99LatencyMs.toFixed(0)}ms`,
      `- Cost range: $${s.minCostUsd.toFixed(4)} – $${s.maxCostUsd.toFixed(4)}`,
      `- Latency range: ${s.minLatencyMs.toFixed(0)}ms – ${s.maxLatencyMs.toFixed(0)}ms`,
      "",
    ];

    const models = Object.keys(s.byModel);
    if (models.length > 0) {
      lines.push("## By Model");
      lines.push("");
      lines.push("| Model | Evals | Total Cost | Avg Cost | Avg Latency | P95 Latency | Total Tokens |");
      lines.push("|-------|------:|-----------:|---------:|------------:|------------:|-------------:|");
      for (const model of models) {
        const m = s.byModel[model]!;
        lines.push(
          `| ${model} | ${m.evalCount} | $${m.totalCostUsd.toFixed(4)} | $${m.avgCostUsd.toFixed(4)} | ${m.avgLatencyMs.toFixed(0)}ms | ${m.p95LatencyMs.toFixed(0)}ms | ${m.totalTokens} |`,
        );
      }
      lines.push("");
    }

    const vs = this.violations;
    if (vs.length > 0) {
      lines.push("## Threshold Violations");
      lines.push("");
      lines.push("| Eval | Metric | Observed | Threshold |");
      lines.push("|------|--------|----------|-----------|");
      for (const v of vs) {
        const obsStr = v.metric === "cost" ? `$${v.observed.toFixed(4)}` :
                       v.metric === "latency" ? `${v.observed.toFixed(0)}ms` :
                       `${v.observed}`;
        const thrStr = v.metric === "cost" ? `$${v.threshold.toFixed(4)}` :
                       v.metric === "latency" ? `${v.threshold.toFixed(0)}ms` :
                       `${v.threshold}`;
        lines.push(`| ${v.evalId} | ${v.metric} | ${obsStr} | ${thrStr} |`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Reset all tracked data and violations.
   */
  reset(): void {
    this.records.length = 0;
    this.violations.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Standalone assertion functions (for one-shot use without tracker)
// ---------------------------------------------------------------------------

/**
 * Assert a single eval's cost is below threshold.
 */
export function assertEvalCostBelow(evalId: string, costUsd: number, maxCostUsd: number): void {
  if (costUsd > maxCostUsd) {
    throw new CostThresholdError([{
      evalId, metric: "cost", observed: costUsd, threshold: maxCostUsd,
    }], `Eval "${evalId}" cost $${costUsd.toFixed(4)} exceeds $${maxCostUsd}`);
  }
}

/**
 * Assert a single eval's latency is below threshold.
 */
export function assertEvalLatencyBelow(evalId: string, latencyMs: number, maxLatencyMs: number): void {
  if (latencyMs > maxLatencyMs) {
    throw new LatencyThresholdError([{
      evalId, metric: "latency", observed: latencyMs, threshold: maxLatencyMs,
    }], `Eval "${evalId}" latency ${latencyMs.toFixed(0)}ms exceeds ${maxLatencyMs}ms`);
  }
}

/**
 * Assert a single eval's token usage is below threshold.
 */
export function assertEvalTokensBelow(evalId: string, tokensUsed: number, maxTokens: number): void {
  if (tokensUsed > maxTokens) {
    throw new TokenThresholdError([{
      evalId, metric: "tokens", observed: tokensUsed, threshold: maxTokens,
    }], `Eval "${evalId}" tokens ${tokensUsed} exceeds ${maxTokens}`);
  }
}
