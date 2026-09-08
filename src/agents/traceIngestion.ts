/**
 * traceIngestion.ts — Live production trace ingestion and scoring pipeline.
 *
 * Ingests agent execution traces from production, scores them in real-time
 * against metric templates and LLM judges, and feeds results into the
 * monitoring and run history systems.
 *
 * Features:
 *   - Continuous trace ingestion from multiple sources
 *   - Real-time metric evaluation on each trace
 *   - Automatic testcase extraction from failures
 *   - Configurable scoring pipeline (metrics → judge → monitor)
 *   - Backpressure handling with configurable buffer limits
 *   - Trace grouping by session, agent, or custom attribute
 */

import { randomUUID } from 'node:crypto';
import { MetricRegistry, type MetricInput, type MetricGroupResult } from './metricTemplates.js';

/* ── Types ──────────────────────────────────────────────────────── */

export interface ProductionTrace {
  traceId: string;
  agentId: string;
  agentType: string;
  /** The input that triggered this trace */
  input: unknown;
  /** The agent output */
  output: unknown;
  /** Duration of the agent run in ms, or null when the source recorded none. Never a fabricated 0. */
  durationMs: number | null;
  /** Source event time in milliseconds, or null when unknown. */
  timestamp: number | null;
  /** Span count in the trace */
  spanCount?: number;
  /** Session/group identifier */
  sessionId?: string;
  /** Whether the trace ended in error */
  error?: boolean;
  /** Error message if applicable */
  errorMessage?: string;
  /** Arbitrary metadata */
  metadata: Record<string, unknown>;
}

export interface ScoredTrace {
  trace: ProductionTrace;
  /** Metric evaluation results */
  metrics: MetricGroupResult;
  /** Whether this trace was flagged as problematic */
  flagged: boolean;
  /** Reasons for flagging */
  flagReasons: string[];
  /** Whether a testcase was auto-generated from this trace */
  testcaseGenerated: boolean;
  /** Scoring timestamp */
  scoredAt: number;
}

export interface IngestionConfig {
  /** Metric group to evaluate against */
  metricGroupId: string;
  /** Score threshold below which traces are flagged */
  flagThreshold: number;
  /** Whether to auto-generate testcases from flagged traces */
  autoGenerateTestcases: boolean;
  /** Max traces to buffer before dropping */
  maxBufferSize: number;
  /** Whether to score error traces */
  scoreErrors: boolean;
}

export interface IngestionStats {
  totalIngested: number;
  totalScored: number;
  totalFlagged: number;
  totalTestcasesGenerated: number;
  totalErrors: number;
  avgScoreOverall: number;
  /** Lifetime mean of finite nonnegative measured samples, or null when none exist. */
  avgLatencyMs: number | null;
  tracesByAgent: Record<string, number>;
  flagRate: number;
}

export interface GeneratedTestcase {
  testcaseId: string;
  sourceTraceId: string;
  agentType: string;
  input: unknown;
  output: unknown;
  failureReason: string;
  score: number;
  generatedAt: number;
}

/* ── Ingestion pipeline ──────────────────────────────────────────── */

export class TraceIngestionPipeline {
  private config: IngestionConfig;
  private metricRegistry: MetricRegistry;
  private scoredTraces: ScoredTrace[] = [];
  private generatedTestcases: GeneratedTestcase[] = [];
  private stats: IngestionStats;
  private measuredLatencyCount = 0;

  constructor(config?: Partial<IngestionConfig>) {
    this.config = {
      metricGroupId: config?.metricGroupId ?? 'safety',
      flagThreshold: config?.flagThreshold ?? 0.6,
      autoGenerateTestcases: config?.autoGenerateTestcases ?? true,
      maxBufferSize: config?.maxBufferSize ?? 10000,
      scoreErrors: config?.scoreErrors ?? true,
    };
    this.metricRegistry = new MetricRegistry();
    this.stats = this.createEmptyStats();
  }

  private createEmptyStats(): IngestionStats {
    return {
      totalIngested: 0,
      totalScored: 0,
      totalFlagged: 0,
      totalTestcasesGenerated: 0,
      totalErrors: 0,
      avgScoreOverall: 0,
      avgLatencyMs: null,
      tracesByAgent: {},
      flagRate: 0,
    };
  }

  /** Ingest a single production trace */
  ingest(trace: ProductionTrace): ScoredTrace {
    this.stats.totalIngested++;
    if (typeof trace.durationMs === 'number' && Number.isFinite(trace.durationMs) && trace.durationMs >= 0) {
      this.measuredLatencyCount++;
      // Incremental mean avoids sum overflow and is independent of scoring/buffer retention.
      const mean = this.stats.avgLatencyMs ?? 0;
      this.stats.avgLatencyMs = mean + (trace.durationMs - mean) / this.measuredLatencyCount;
    }
    this.stats.tracesByAgent[trace.agentType] = (this.stats.tracesByAgent[trace.agentType] ?? 0) + 1;

    if (trace.error) this.stats.totalErrors++;

    // Skip scoring for error traces if not configured
    if (trace.error && !this.config.scoreErrors) {
      const result: ScoredTrace = {
        trace,
        metrics: { groupId: 'skipped', groupName: 'Skipped', results: [], overallScore: 0, passRate: 0, failedMetrics: [] },
        flagged: true,
        flagReasons: ['Error trace'],
        testcaseGenerated: false,
        scoredAt: Date.now(),
      };
      this.addScoredTrace(result);
      return result;
    }

    // Pre-check: empty output is always flagged regardless of metric group
    const outputStr = typeof trace.output === 'string' ? trace.output : JSON.stringify(trace.output ?? '');
    if (!outputStr || outputStr.trim().length === 0 || outputStr === '""' || outputStr === '{}') {
      this.stats.totalFlagged++;
      this.stats.totalScored++;
      const emptyResult: ScoredTrace = {
        trace,
        metrics: { groupId: this.config.metricGroupId, groupName: 'Empty Output', results: [], overallScore: 0, passRate: 0, failedMetrics: ['completeness'] },
        flagged: true,
        flagReasons: ['Empty or missing agent output'],
        testcaseGenerated: false,
        scoredAt: Date.now(),
      };
      if (this.config.autoGenerateTestcases) {
        this.generateTestcase(trace, 0, 'Empty or missing agent output');
        emptyResult.testcaseGenerated = true;
        this.stats.totalTestcasesGenerated++;
      }
      this.addScoredTrace(emptyResult);
      return emptyResult;
    }

    // Score the trace
    const metricInput: MetricInput = {
      input: typeof trace.input === 'string' ? trace.input : JSON.stringify(trace.input),
      output: typeof trace.output === 'string' ? trace.output : JSON.stringify(trace.output),
      context: {
        durationMs: trace.durationMs,
        agentId: trace.agentId,
        agentType: trace.agentType,
      },
    };

    const metrics = this.metricRegistry.evaluateGroup(this.config.metricGroupId, metricInput);
    if (!metrics) {
      const empty: ScoredTrace = {
        trace,
        metrics: { groupId: 'error', groupName: 'Error', results: [], overallScore: 0, passRate: 0, failedMetrics: [] },
        flagged: true,
        flagReasons: ['Invalid metric group'],
        testcaseGenerated: false,
        scoredAt: Date.now(),
      };
      this.addScoredTrace(empty);
      return empty;
    }

    this.stats.totalScored++;

    // Check if flagged
    const flagged = metrics.overallScore < this.config.flagThreshold;
    const flagReasons: string[] = [];
    if (flagged) {
      this.stats.totalFlagged++;
      if (metrics.failedMetrics.length > 0) {
        flagReasons.push(`Failed metrics: ${metrics.failedMetrics.join(', ')}`);
      }
      if (metrics.overallScore < this.config.flagThreshold) {
        flagReasons.push(`Score ${(metrics.overallScore * 100).toFixed(1)}% below threshold ${(this.config.flagThreshold * 100).toFixed(1)}%`);
      }
    }

    // Auto-generate testcase from flagged trace
    let testcaseGenerated = false;
    if (flagged && this.config.autoGenerateTestcases) {
      this.generateTestcase(trace, metrics.overallScore, flagReasons.join('; '));
      testcaseGenerated = true;
      this.stats.totalTestcasesGenerated++;
    }

    // Update running averages
    const totalScores = this.scoredTraces.reduce((s, t) => s + t.metrics.overallScore, 0) + metrics.overallScore;
    this.stats.avgScoreOverall = totalScores / (this.stats.totalScored);
    this.stats.flagRate = this.stats.totalFlagged / Math.max(this.stats.totalScored, 1);

    const result: ScoredTrace = {
      trace,
      metrics,
      flagged,
      flagReasons,
      testcaseGenerated,
      scoredAt: Date.now(),
    };

    this.addScoredTrace(result);
    return result;
  }

  /** Ingest a batch of traces */
  ingestBatch(traces: ProductionTrace[]): ScoredTrace[] {
    return traces.map(t => this.ingest(t));
  }

  private addScoredTrace(scored: ScoredTrace): void {
    this.scoredTraces.push(scored);
    // Enforce buffer limit
    while (this.scoredTraces.length > this.config.maxBufferSize) {
      this.scoredTraces.shift();
    }
  }

  private generateTestcase(trace: ProductionTrace, score: number, reason: string): void {
    this.generatedTestcases.push({
      testcaseId: randomUUID(),
      sourceTraceId: trace.traceId,
      agentType: trace.agentType,
      input: trace.input,
      output: trace.output,
      failureReason: reason,
      score,
      generatedAt: Date.now(),
    });
  }

  /** Get all scored traces */
  getScoredTraces(): ScoredTrace[] { return [...this.scoredTraces]; }

  /** Get flagged traces only */
  getFlaggedTraces(): ScoredTrace[] { return this.scoredTraces.filter(t => t.flagged); }

  /** Get traces by agent type */
  getTracesByAgent(agentType: string): ScoredTrace[] {
    return this.scoredTraces.filter(t => t.trace.agentType === agentType);
  }

  /** Get auto-generated testcases */
  getGeneratedTestcases(): GeneratedTestcase[] { return [...this.generatedTestcases]; }

  /** Get ingestion stats */
  getStats(): IngestionStats { return { ...this.stats }; }

  /** Update config */
  updateConfig(updates: Partial<IngestionConfig>): void {
    Object.assign(this.config, updates);
  }

  /** Clear all data */
  clear(): void {
    this.scoredTraces = [];
    this.generatedTestcases = [];
    this.measuredLatencyCount = 0;
    this.stats = this.createEmptyStats();
  }

  get traceCount(): number { return this.scoredTraces.length; }
  get testcaseCount(): number { return this.generatedTestcases.length; }
}
