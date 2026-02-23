/**
 * runHistory.ts — Persists harness run results for regression tracking and A/B comparison.
 *
 * Run history and A/B comparison module.
 * Tracks all harness runs over time to detect regressions, compare
 * agent versions, and visualize maturity trends.
 *
 * Key features:
 *   - Persistent run storage (in-memory with JSON export/import)
 *   - A/B comparison between two runs
 *   - Regression detection (score dropped vs previous run)
 *   - Trend analysis over time
 *   - Testcase management (trace-to-testcase conversion)
 */

import { randomUUID } from 'node:crypto';
import type { HarnessResult, CapabilityProbe } from './harnessRunner.js';
import type { SimResult, SimBatchResult } from './simAgent.js';
import type { MetricGroupResult } from './metricTemplates.js';

/* ── Types ──────────────────────────────────────────────────────── */

export interface RunRecord {
  runId: string;
  agentType: string;
  agentVersion?: string;
  runType: 'harness' | 'simulation' | 'metric_eval';
  timestamp: number;
  /** Harness result (if runType = 'harness') */
  harnessResult?: HarnessResult;
  /** Simulation result (if runType = 'simulation') */
  simResult?: SimBatchResult;
  /** Metric evaluation result */
  metricResult?: MetricGroupResult;
  /** Overall score for this run (normalized 0-100) */
  score: number;
  /** Tags for filtering */
  tags: string[];
  /** Arbitrary metadata */
  metadata: Record<string, unknown>;
}

export interface ABComparison {
  runA: RunRecord;
  runB: RunRecord;
  scoreDelta: number;
  scoreImproved: boolean;
  /** Capabilities gained between A and B */
  capabilitiesGained: string[];
  /** Capabilities lost between A and B */
  capabilitiesLost: string[];
  /** Metric changes */
  metricDeltas: Array<{ metric: string; deltaA: number; deltaB: number; improved: boolean }>;
  summary: string;
}

export interface RegressionAlert {
  alertId: string;
  runId: string;
  previousRunId: string;
  agentType: string;
  timestamp: number;
  scoreDrop: number;
  /** Which capabilities regressed */
  regressions: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
}

export interface TrendPoint {
  runId: string;
  timestamp: number;
  score: number;
  maturityLevel?: string;
  runType: string;
}

export interface TrendAnalysis {
  agentType: string;
  points: TrendPoint[];
  trend: 'improving' | 'stable' | 'declining';
  avgScore: number;
  minScore: number;
  maxScore: number;
  volatility: number;
  trendSlope: number;
}

/* ── Testcase management ─────────────────────────────────────────── */

export interface Testcase {
  testcaseId: string;
  name: string;
  description?: string;
  agentType: string;
  input: unknown;
  expectedOutput: unknown;
  tags: string[];
  /** Source of this testcase (manual, from_trace, from_simulation, from_failure) */
  source: 'manual' | 'from_trace' | 'from_simulation' | 'from_failure';
  /** Reference to original run/trace */
  sourceRef?: string;
  createdAt: number;
  metadata: Record<string, unknown>;
}

export interface TestsetResult {
  testsetName: string;
  testcases: Array<{
    testcaseId: string;
    passed: boolean;
    actualOutput: unknown;
    score: number;
    details: string;
  }>;
  passRate: number;
  avgScore: number;
}

/* ── RunHistoryStore ─────────────────────────────────────────────── */

export class RunHistoryStore {
  private runs = new Map<string, RunRecord>();
  private alerts: RegressionAlert[] = [];
  private testcases = new Map<string, Testcase>();
  private maxRuns: number;

  constructor(maxRuns = 500) {
    this.maxRuns = maxRuns;
  }

  /* ── Run management ──────────────────────────────────────────── */

  /** Record a harness run */
  recordHarnessRun(result: HarnessResult, options?: { agentVersion?: string; tags?: string[]; metadata?: Record<string, unknown> }): RunRecord {
    const record: RunRecord = {
      runId: randomUUID(),
      agentType: result.agentType,
      agentVersion: options?.agentVersion,
      runType: 'harness',
      timestamp: Date.now(),
      harnessResult: result,
      score: result.finalScore,
      tags: options?.tags ?? [],
      metadata: options?.metadata ?? {},
    };

    this.addRun(record);
    this.checkForRegression(record);
    return record;
  }

  /** Record a simulation batch run */
  recordSimulationRun(agentType: string, result: SimBatchResult, options?: { agentVersion?: string; tags?: string[]; metadata?: Record<string, unknown> }): RunRecord {
    const score = result.summary.avgQualityScore * 100;
    const record: RunRecord = {
      runId: randomUUID(),
      agentType,
      agentVersion: options?.agentVersion,
      runType: 'simulation',
      timestamp: Date.now(),
      simResult: result,
      score,
      tags: options?.tags ?? [],
      metadata: options?.metadata ?? {},
    };

    this.addRun(record);
    this.checkForRegression(record);
    return record;
  }

  /** Record a metric evaluation run */
  recordMetricRun(agentType: string, result: MetricGroupResult, options?: { agentVersion?: string; tags?: string[]; metadata?: Record<string, unknown> }): RunRecord {
    const score = result.overallScore * 100;
    const record: RunRecord = {
      runId: randomUUID(),
      agentType,
      agentVersion: options?.agentVersion,
      runType: 'metric_eval',
      timestamp: Date.now(),
      metricResult: result,
      score,
      tags: options?.tags ?? [],
      metadata: options?.metadata ?? {},
    };

    this.addRun(record);
    this.checkForRegression(record);
    return record;
  }

  private addRun(record: RunRecord): void {
    this.runs.set(record.runId, record);
    // Evict old runs if at capacity
    if (this.runs.size > this.maxRuns) {
      const oldest = [...this.runs.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      if (oldest) this.runs.delete(oldest[0]);
    }
  }

  /** Get a run by ID */
  getRun(runId: string): RunRecord | undefined {
    return this.runs.get(runId);
  }

  /** Get all runs */
  getAllRuns(): RunRecord[] {
    return [...this.runs.values()].sort((a, b) => b.timestamp - a.timestamp);
  }

  /** Get runs for a specific agent type */
  getRunsByAgent(agentType: string): RunRecord[] {
    return [...this.runs.values()]
      .filter(r => r.agentType === agentType)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /** Get runs by type */
  getRunsByType(runType: RunRecord['runType']): RunRecord[] {
    return [...this.runs.values()]
      .filter(r => r.runType === runType)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /** Get the most recent run for an agent */
  getLatestRun(agentType: string, runType?: RunRecord['runType']): RunRecord | undefined {
    const runs = this.getRunsByAgent(agentType);
    if (runType) return runs.find(r => r.runType === runType);
    return runs[0];
  }

  /* ── A/B comparison ──────────────────────────────────────────── */

  /** Compare two runs */
  compareRuns(runIdA: string, runIdB: string): ABComparison | undefined {
    const runA = this.runs.get(runIdA);
    const runB = this.runs.get(runIdB);
    if (!runA || !runB) return undefined;

    const scoreDelta = runB.score - runA.score;
    const scoreImproved = scoreDelta > 0;

    // Compare capabilities (if harness runs)
    const capsA = new Set((runA.harnessResult?.capabilityReport ?? []).filter(p => p.present).map(p => p.capability));
    const capsB = new Set((runB.harnessResult?.capabilityReport ?? []).filter(p => p.present).map(p => p.capability));

    const capabilitiesGained = [...capsB].filter(c => !capsA.has(c));
    const capabilitiesLost = [...capsA].filter(c => !capsB.has(c));

    // Compare metrics (if metric eval runs)
    const metricDeltas: ABComparison['metricDeltas'] = [];
    if (runA.metricResult && runB.metricResult) {
      const metricsA = new Map(runA.metricResult.results.map(r => [r.metricId, r.score]));
      for (const result of runB.metricResult.results) {
        const scoreA = metricsA.get(result.metricId) ?? 0;
        metricDeltas.push({
          metric: result.metricId,
          deltaA: scoreA,
          deltaB: result.score,
          improved: result.score > scoreA,
        });
      }
    }

    const summary = scoreImproved
      ? `Run B improved by ${scoreDelta.toFixed(1)} points. ${capabilitiesGained.length} capabilities gained.`
      : scoreDelta === 0
        ? 'No score change between runs.'
        : `Run B regressed by ${Math.abs(scoreDelta).toFixed(1)} points. ${capabilitiesLost.length} capabilities lost.`;

    return { runA, runB, scoreDelta, scoreImproved, capabilitiesGained, capabilitiesLost, metricDeltas, summary };
  }

  /* ── Regression detection ────────────────────────────────────── */

  private checkForRegression(record: RunRecord): void {
    const previousRuns = this.getRunsByAgent(record.agentType)
      .filter(r => r.runId !== record.runId && r.runType === record.runType);

    if (previousRuns.length === 0) return;

    const previousRun = previousRuns[0]!; // Most recent
    const scoreDrop = previousRun.score - record.score;

    if (scoreDrop > 2) { // More than 2 points drop
      const regressions: string[] = [];

      // Identify specific regressions
      if (record.harnessResult && previousRun.harnessResult) {
        const prevCaps = new Set(previousRun.harnessResult.capabilityReport.filter(p => p.present).map(p => p.capability));
        const currCaps = record.harnessResult.capabilityReport.filter(p => !p.present).map(p => p.capability);
        for (const cap of currCaps) {
          if (prevCaps.has(cap)) regressions.push(cap);
        }
      }

      const severity: RegressionAlert['severity'] =
        scoreDrop >= 20 ? 'critical' :
        scoreDrop >= 10 ? 'high' :
        scoreDrop >= 5 ? 'medium' : 'low';

      this.alerts.push({
        alertId: randomUUID(),
        runId: record.runId,
        previousRunId: previousRun.runId,
        agentType: record.agentType,
        timestamp: Date.now(),
        scoreDrop,
        regressions,
        severity,
        message: `Score dropped by ${scoreDrop.toFixed(1)} (${previousRun.score.toFixed(1)} → ${record.score.toFixed(1)})${regressions.length > 0 ? `. Lost: ${regressions.join(', ')}` : ''}`,
      });
    }
  }

  /** Get all regression alerts */
  getAlerts(agentType?: string): RegressionAlert[] {
    if (agentType) return this.alerts.filter(a => a.agentType === agentType);
    return [...this.alerts];
  }

  /** Clear alerts */
  clearAlerts(): void {
    this.alerts = [];
  }

  /* ── Trend analysis ──────────────────────────────────────────── */

  /** Get trend data for an agent */
  getTrend(agentType: string, runType?: RunRecord['runType']): TrendAnalysis {
    let runs = this.getRunsByAgent(agentType);
    if (runType) runs = runs.filter(r => r.runType === runType);
    runs = runs.sort((a, b) => a.timestamp - b.timestamp); // chronological

    const points: TrendPoint[] = runs.map(r => ({
      runId: r.runId,
      timestamp: r.timestamp,
      score: r.score,
      maturityLevel: r.harnessResult?.maturityLevel,
      runType: r.runType,
    }));

    const scores = points.map(p => p.score);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const minScore = scores.length > 0 ? Math.min(...scores) : 0;
    const maxScore = scores.length > 0 ? Math.max(...scores) : 0;

    // Compute volatility (standard deviation)
    const variance = scores.length > 1
      ? scores.reduce((sum, s) => sum + Math.pow(s - avgScore, 2), 0) / (scores.length - 1)
      : 0;
    const volatility = Math.sqrt(variance);

    // Compute trend slope (simple linear regression)
    const trendSlope = computeSlope(scores);
    const trend: TrendAnalysis['trend'] =
      trendSlope > 0.5 ? 'improving' :
      trendSlope < -0.5 ? 'declining' : 'stable';

    return { agentType, points, trend, avgScore: round2(avgScore), minScore: round2(minScore), maxScore: round2(maxScore), volatility: round2(volatility), trendSlope: round2(trendSlope) };
  }

  /* ── Testcase management ─────────────────────────────────────── */

  /** Create a testcase from a simulation result */
  testcaseFromSimulation(simResult: SimResult, name?: string): Testcase {
    const firstPersonaMsg = simResult.conversation.messages.find(m => m.role === 'persona');
    const lastAgentMsg = [...simResult.conversation.messages].reverse().find(m => m.role === 'agent');

    const testcase: Testcase = {
      testcaseId: randomUUID(),
      name: name ?? `Sim: ${simResult.conversation.personaName} → ${simResult.scenarioOutcome}`,
      agentType: simResult.conversation.agentType,
      input: {
        customerId: `sim-${simResult.conversation.personaId}`,
        message: firstPersonaMsg?.content ?? '',
        channel: 'simulation',
      },
      expectedOutput: lastAgentMsg?.content,
      tags: ['from_simulation', simResult.scenarioOutcome, simResult.conversation.personaId],
      source: 'from_simulation',
      sourceRef: simResult.conversationId,
      createdAt: Date.now(),
      metadata: {
        personaId: simResult.conversation.personaId,
        turnCount: simResult.conversation.turnCount,
        qualityScore: simResult.qualityScore,
        findings: simResult.findings,
      },
    };

    this.testcases.set(testcase.testcaseId, testcase);
    return testcase;
  }

  /** Create a testcase from a failure */
  testcaseFromFailure(agentType: string, input: unknown, failureDetails: string, name?: string): Testcase {
    const testcase: Testcase = {
      testcaseId: randomUUID(),
      name: name ?? `Failure: ${failureDetails.slice(0, 50)}`,
      agentType,
      input,
      expectedOutput: undefined,
      tags: ['from_failure', 'needs_expected_output'],
      source: 'from_failure',
      createdAt: Date.now(),
      metadata: { failureDetails },
    };

    this.testcases.set(testcase.testcaseId, testcase);
    return testcase;
  }

  /** Create a manual testcase */
  addTestcase(testcase: Omit<Testcase, 'testcaseId' | 'createdAt'>): Testcase {
    const full: Testcase = {
      ...testcase,
      testcaseId: randomUUID(),
      createdAt: Date.now(),
    };

    this.testcases.set(full.testcaseId, full);
    return full;
  }

  /** Get all testcases */
  getTestcases(agentType?: string): Testcase[] {
    const all = [...this.testcases.values()];
    if (agentType) return all.filter(t => t.agentType === agentType);
    return all;
  }

  /** Get a testcase by ID */
  getTestcase(id: string): Testcase | undefined {
    return this.testcases.get(id);
  }

  /** Delete a testcase */
  deleteTestcase(id: string): boolean {
    return this.testcases.delete(id);
  }

  /** Run testcases against an agent */
  async runTestset(
    agentType: string,
    agent: { run: (input: unknown) => Promise<unknown> },
    testcaseIds?: string[],
  ): Promise<TestsetResult> {
    const testcases = testcaseIds
      ? testcaseIds.map(id => this.testcases.get(id)).filter((t): t is Testcase => !!t)
      : this.getTestcases(agentType);

    const results: TestsetResult['testcases'] = [];

    for (const tc of testcases) {
      try {
        const output = await agent.run(tc.input);
        const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
        const expectedStr = typeof tc.expectedOutput === 'string' ? tc.expectedOutput : JSON.stringify(tc.expectedOutput);

        // Simple similarity check
        const passed = tc.expectedOutput === undefined || outputStr.includes(expectedStr?.slice(0, 20) ?? '');
        const score = passed ? 1 : 0;

        results.push({
          testcaseId: tc.testcaseId,
          passed,
          actualOutput: output,
          score,
          details: passed ? 'Output matches expectation' : 'Output differs from expectation',
        });
      } catch (err) {
        results.push({
          testcaseId: tc.testcaseId,
          passed: false,
          actualOutput: { error: err instanceof Error ? err.message : String(err) },
          score: 0,
          details: `Error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    const passCount = results.filter(r => r.passed).length;
    return {
      testsetName: `${agentType}-testset`,
      testcases: results,
      passRate: results.length > 0 ? passCount / results.length : 0,
      avgScore: results.length > 0 ? results.reduce((s, r) => s + r.score, 0) / results.length : 0,
    };
  }

  /* ── Export/Import ───────────────────────────────────────────── */

  /** Export all data as JSON */
  exportJSON(): string {
    return JSON.stringify({
      runs: [...this.runs.values()],
      alerts: this.alerts,
      testcases: [...this.testcases.values()],
      exportedAt: Date.now(),
    }, null, 2);
  }

  /** Import from JSON */
  importJSON(json: string): { runsImported: number; testcasesImported: number } {
    const data = JSON.parse(json);
    let runsImported = 0;
    let testcasesImported = 0;

    if (Array.isArray(data.runs)) {
      for (const run of data.runs) {
        if (run.runId && !this.runs.has(run.runId)) {
          this.runs.set(run.runId, run as RunRecord);
          runsImported++;
        }
      }
    }

    if (Array.isArray(data.testcases)) {
      for (const tc of data.testcases) {
        if (tc.testcaseId && !this.testcases.has(tc.testcaseId)) {
          this.testcases.set(tc.testcaseId, tc as Testcase);
          testcasesImported++;
        }
      }
    }

    return { runsImported, testcasesImported };
  }

  /* ── Stats ───────────────────────────────────────────────────── */

  get runCount(): number { return this.runs.size; }
  get testcaseCount(): number { return this.testcases.size; }
  get alertCount(): number { return this.alerts.length; }
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function computeSlope(values: number[]): number {
  if (values.length < 2) return 0;
  const n = values.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i]!;
    sumXY += i * values[i]!;
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
