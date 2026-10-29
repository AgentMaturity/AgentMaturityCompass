import { describe, expect, test } from 'vitest';
import { TraceIngestionPipeline } from '../src/agents/traceIngestion.js';
import { ProductionMonitor } from '../src/agents/monitor.js';
import { RunHistoryStore } from '../src/agents/runHistory.js';
import { MetricRegistry } from '../src/agents/metricTemplates.js';
import { SessionEvaluator } from '../src/agents/sessionEval.js';
import { SessionCorrelator } from '../src/observability/sessionCorrelator.js';
import { buildJudgeCalibrationReceipt } from '../src/eval/judgeCalibration.js';
import type { NormalizedTrace } from '../src/watch/observabilityBridge.js';

const registry = new MetricRegistry();

describe('AXE-27 agent metric evidence', () => {
  test.each([
    ['hallucination', { input: 'meaningful context', output: 'the and is' }],
    ['intent_fulfillment', { input: 'the and is', output: 'meaningful answer' }],
    ['completeness', { expectedOutput: 'the and is', output: 'meaningful answer' }],
  ])('%s does not pass with zero evaluable terms', (id, input) => {
    const result = registry.evaluate(id, input)!;
    expect(result.score).toBeNull();
    expect(result.passed).toBe(false);
    expect(result.outcome).toBe('not_evaluated');
    expect(result.sampleSize).toBe(0);
  });

  test('nonempty terms preserve success and failure ratios', () => {
    const success = registry.evaluate('hallucination', { input: 'alpha beta', output: 'alpha beta' })!;
    const failure = registry.evaluate('hallucination', { input: 'gamma delta', output: 'alpha beta' })!;
    expect(success).toMatchObject({ score: 1, outcome: 'measured', sampleSize: 2 });
    expect(failure).toMatchObject({ score: 0, outcome: 'measured', sampleSize: 2, passed: false });
  });

  test('latency distinguishes absent duration, zero budget and observed zero duration', () => {
    expect(registry.evaluate('latency', {})).toMatchObject({ score: null, passed: false, outcome: 'not_evaluated' });
    expect(registry.evaluate('latency', { context: { durationMs: 20, maxAcceptableMs: 0 } })).toMatchObject({ score: null, passed: false, outcome: 'not_evaluated' });
    expect(registry.evaluate('latency', { context: { durationMs: 0, maxAcceptableMs: 5000 } })).toMatchObject({ score: 1, passed: true, outcome: 'measured' });
  });

  test('groups with only missing evidence keep aggregate scores null', () => {
    registry.registerGroup({ id: 'no-terms', name: 'No terms', description: '', metrics: [registry.getMetric('hallucination')!] });
    const result = registry.evaluateGroup('no-terms', { input: 'context', output: 'the and is' })!;
    expect(result).toMatchObject({ overallScore: null, passRate: null, outcome: 'not_evaluated', sampleSize: 0 });
  });

  test('ingestion ratios are absent before any observations', () => {
    expect(new TraceIngestionPipeline().getStats()).toMatchObject({ avgScoreOverall: null, flagRate: null });
  });

  test('run history preserves unknown scores without inventing regression or trends', () => {
    const store = new RunHistoryStore();
    const unknown = registry.evaluateGroup('no-terms', { input: 'context', output: 'the and is' })!;
    const missing = store.recordMetricRun('agent', unknown);
    expect(missing).toMatchObject({ score: null, outcome: 'not_evaluated' });
    expect(store.getTrend('agent')).toMatchObject({ avgScore: null, trendSlope: null, sampleSize: 0, outcome: 'not_evaluated' });
    const measured = store.recordMetricRun('agent', { ...unknown, overallScore: 0.5, outcome: 'measured' });
    expect(store.compareRuns(missing.runId, measured.runId)).toMatchObject({ scoreDelta: null, scoreImproved: null, outcome: 'not_evaluated' });
    expect(store.compareRuns(missing.runId, measured.runId)?.metricDeltas[0]).toMatchObject({ deltaA: null, deltaB: null, improved: null });
    store.recordMetricRun('agent', unknown);
    expect(store.getTrend('agent')).toMatchObject({ avgScore: 50, sampleSize: 1 });
    expect(store.getAlerts()).toEqual([]);
    const restored = new RunHistoryStore();
    restored.importJSON(store.exportJSON());
    expect(restored.getLatestRun('agent')).toBeDefined();
    expect(restored.getRunsByAgent('agent').find(run => run.runId === missing.runId)?.score).toBeNull();
  });

  test('empty testsets have no pass-rate denominator', async () => {
    const result = await new RunHistoryStore().runTestset('agent', { run: async () => '' });
    expect(result).toMatchObject({ passRate: null, avgScore: null, outcome: 'not_evaluated', sampleSize: 0 });
  });

  test('unsampled monitor statuses and dashboard stay unevaluated', () => {
    const monitor = new ProductionMonitor();
    const config = monitor.createMonitor({ name: 'quality', agentType: 'agent', metricGroupId: 'quality', alertThreshold: 0.7, windowSize: 10, enabled: true });
    expect(monitor.getMonitorStatus(config.id)).toMatchObject({ currentScore: null, windowAvg: null, outcome: 'not_evaluated', health: 'not_evaluated' });
    expect(monitor.getDashboard().overallHealth).toBe('not_evaluated');
  });
});

describe('AXE-27 session evaluation evidence', () => {
  test('empty sessions do not claim completed goals, coherence or safety', () => {
    const result = new SessionEvaluator().evaluate([]);
    expect(result.overallScore).toBeNull();
    expect(result.outcome).toBe('not_evaluated');
    expect(result.dimensions).toMatchObject({ goalCompletion: null, coherence: null, safety: null });
    expect(result.metricOutcomes).toMatchObject({ goalCompletion: 'not_evaluated', coherence: 'not_evaluated', safety: 'not_evaluated' });
  });

  test('one observed agent turn supplies safety but no cross-turn coherence or goals', () => {
    const result = new SessionEvaluator().evaluate([{ role: 'agent', content: 'A useful response.' }]);
    expect(result.dimensions.goalCompletion).toBeNull();
    expect(result.dimensions.coherence).toBeNull();
    expect(result.dimensions.safety).toBe(1);
    expect(result.metricOutcomes.safety).toBe('measured');
  });

  test('one user-agent pair has no cross-turn agent coherence', () => {
    const result = new SessionEvaluator().evaluate([{ role: 'user', content: 'A question' }, { role: 'agent', content: 'An answer' }]);
    expect(result.dimensions.coherence).toBeNull();
  });

  test('all-zero goal weights do not create perfect completion', () => {
    const result = new SessionEvaluator().evaluate([{ role: 'agent', content: 'done' }], [
      { id: 'goal', description: 'Goal', completionSignals: ['done'], required: true, weight: 0 },
    ]);
    expect(result.dimensions.goalCompletion).toBeNull();
    expect(result.metricOutcomes.goalCompletion).toBe('not_evaluated');
  });

  test('missing user response pairs do not add perfect responsiveness', () => {
    const result = new SessionEvaluator().evaluate([
      { role: 'agent', content: 'alpha beta gamma' }, { role: 'agent', content: 'delta epsilon zeta' },
    ]);
    expect(result.dimensions.coherence).toBe(0);
  });

  test('comparisons involving unmeasured sessions have no winner or numerical delta', () => {
    const evaluator = new SessionEvaluator();
    const result = evaluator.compareSessions(evaluator.evaluate([]), evaluator.evaluate([{ role: 'agent', content: 'Observed response' }]));
    expect(result).toMatchObject({ overallDelta: null, winner: 'not_evaluated', outcome: 'not_evaluated' });
    expect(result.dimensionDeltas.safety).toBeNull();
  });
});

describe('AXE-27 session trace evidence', () => {
  test('sessions without tools expose unknown tool reliability', () => {
    const correlator = new SessionCorrelator({ workspace: '/tmp/axe27-session', agentId: 'agent' });
    const trace: NormalizedTrace = {
      traceId: 'trace', sessionId: 'session', startTimeMs: 0, endTimeMs: 1000, durationMs: 1000,
      status: 'ok', spans: [], totalTokens: 0, totalCostUsd: 0, modelBreakdown: {}, errorCount: 0,
      toolCallCount: 0, llmCallCount: 0,
    };
    correlator.ingestTrace(trace);
    const result = correlator.getSession('session')!;
    expect(result.qualityFactors.toolReliabilityScore).toBeNull();
    expect(result.metricOutcomes.toolReliabilityScore).toBe('not_evaluated');
    expect(result.qualityFactors.errorFreeRate).toBe(1);
  });
});

describe('AXE-27 judge calibration evidence', () => {
  test('absent optional quality and OCR samples remain unknown', () => {
    const receipt = buildJudgeCalibrationReceipt({
      agentId: 'agent', runId: 'run', mode: 'ci',
      rubric: { rubricId: 'rubric', version: '1', criteria: [] },
      calibrationSet: { setId: 'set', version: '1', rows: [] }, judgments: [],
    });
    expect(receipt.stabilitySummary.meanDataQuality0to1).toBeNull();
    expect(receipt.stabilitySummary.meanOcrReadability0to1).toBeNull();
    expect(receipt.stabilitySummary.metricOutcomes).toMatchObject({ meanDataQuality0to1: 'not_evaluated', meanOcrReadability0to1: 'not_evaluated' });
  });
});
