/**
 * autoTestGen.ts — Automatic test-case generation from production failures.
 *
 * Analyses failed traces, flagged samples, and error logs to automatically
 * synthesise regression test-cases that prevent recurrence. Integrates with
 * RunHistoryStore for persistence and with MetricRegistry for evaluation.
 *
 * Gap #8: "Auto testcase generation from production failures"
 */

import { randomUUID } from 'node:crypto';

/* ── Types ──────────────────────────────────────────────────────── */

export type FailureSource = 'trace' | 'monitor' | 'user_report' | 'regression' | 'sim_agent';

export interface FailureSignal {
  id: string;
  source: FailureSource;
  timestamp: number;
  agentId: string;
  input: string;
  output: string;
  expectedOutput?: string;
  errorMessage?: string;
  metricScores?: Record<string, number>;
  context?: Record<string, unknown>;
  tags?: string[];
}

export interface GeneratedTestCase {
  id: string;
  name: string;
  sourceFailureId: string;
  sourceType: FailureSource;
  agentId: string;
  input: string;
  expectedOutput?: string;
  /** Assertions to verify against the output */
  assertions: TestAssertion[];
  priority: 'critical' | 'high' | 'medium' | 'low';
  tags: string[];
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export type AssertionType =
  | 'contains'
  | 'not_contains'
  | 'matches_regex'
  | 'min_length'
  | 'max_length'
  | 'metric_above'
  | 'metric_below'
  | 'no_pii'
  | 'no_hallucination'
  | 'sentiment_positive'
  | 'custom';

export interface TestAssertion {
  type: AssertionType;
  value: string | number;
  metricName?: string;
  description: string;
}

export interface TestGenConfig {
  /** Minimum number of assertions per test case */
  minAssertions: number;
  /** Whether to generate negative test cases (inputs that should be rejected) */
  generateNegativeTests: boolean;
  /** Whether to cluster similar failures */
  clusterSimilarFailures: boolean;
  /** Similarity threshold for clustering (0–1) */
  similarityThreshold: number;
  /** Maximum test cases to generate per batch */
  maxTestCases: number;
  /** Auto-assign priority based on failure frequency */
  autoPrioritize: boolean;
}

export interface TestGenResult {
  testCases: GeneratedTestCase[];
  clusteredFailures: FailureCluster[];
  stats: {
    totalFailures: number;
    uniqueClusters: number;
    testCasesGenerated: number;
    coverageEstimate: number;
  };
}

export interface FailureCluster {
  clusterId: string;
  failures: FailureSignal[];
  pattern: string;
  frequency: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

/* ── Default config ─────────────────────────────────────────────── */

const DEFAULT_CONFIG: TestGenConfig = {
  minAssertions: 1,
  generateNegativeTests: true,
  clusterSimilarFailures: true,
  similarityThreshold: 0.6,
  maxTestCases: 50,
  autoPrioritize: true,
};

/* ── Helpers ────────────────────────────────────────────────────── */

/** Jaccard similarity between two strings (word-level) */
function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  // Identical empty token sets have similarity 1; this is set equality, not evaluated evidence coverage.
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) if (wordsB.has(w)) intersection++;
  return intersection / (wordsA.size + wordsB.size - intersection);
}

/** Detect PII patterns in text */
function containsPII(text: string): boolean {
  const patterns = [
    /\b\d{3}-\d{2}-\d{4}\b/,             // SSN
    /\b\d{16}\b/,                          // credit card
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,  // email
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/,      // phone
  ];
  return patterns.some(p => p.test(text));
}

/** Generate assertions from a failure signal */
function generateAssertions(failure: FailureSignal): TestAssertion[] {
  const assertions: TestAssertion[] = [];

  // If output contained PII, add no_pii assertion
  if (containsPII(failure.output)) {
    assertions.push({
      type: 'no_pii',
      value: 1,
      description: 'Output must not contain personally identifiable information',
    });
  }

  // If there was an expected output, add contains/regex assertions
  if (failure.expectedOutput) {
    // Extract key phrases from expected output for contains checks
    const keyPhrases = failure.expectedOutput
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 10);
    for (const phrase of keyPhrases.slice(0, 3)) {
      assertions.push({
        type: 'contains',
        value: phrase,
        description: `Output should contain key phrase from expected response`,
      });
    }
  }

  // If metric scores are available, add metric assertions
  if (failure.metricScores) {
    for (const [metric, score] of Object.entries(failure.metricScores)) {
      if (score < 0.5) {
        assertions.push({
          type: 'metric_above',
          value: 0.5,
          metricName: metric,
          description: `Metric "${metric}" should score above 0.5 (was ${score.toFixed(2)})`,
        });
      }
    }
  }

  // Output should have some minimum length (not empty)
  if (failure.output.length < 10) {
    assertions.push({
      type: 'min_length',
      value: 20,
      description: 'Output must be at least 20 characters (previous failure had near-empty response)',
    });
  }

  // If error message mentions hallucination
  if (failure.errorMessage?.toLowerCase().includes('hallucin')) {
    assertions.push({
      type: 'no_hallucination',
      value: 1,
      description: 'Output must not contain hallucinated content',
    });
  }

  // Always add at least a min_length assertion
  if (assertions.length === 0) {
    assertions.push({
      type: 'min_length',
      value: 1,
      description: 'Output must not be empty',
    });
  }

  return assertions;
}

/** Determine priority from failure frequency and source */
function determinePriority(
  frequency: number,
  source: FailureSource,
): 'critical' | 'high' | 'medium' | 'low' {
  if (source === 'user_report') return frequency >= 3 ? 'critical' : 'high';
  if (source === 'regression') return 'critical';
  if (frequency >= 5) return 'critical';
  if (frequency >= 3) return 'high';
  if (frequency >= 2) return 'medium';
  return 'low';
}

/* ── AutoTestGenerator class ────────────────────────────────────── */

export class AutoTestGenerator {
  private config: TestGenConfig;
  private failures: FailureSignal[] = [];
  private generatedTests: GeneratedTestCase[] = [];

  constructor(config?: Partial<TestGenConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Ingest a failure signal */
  addFailure(failure: Omit<FailureSignal, 'id' | 'timestamp'>): FailureSignal {
    const signal: FailureSignal = {
      ...failure,
      id: randomUUID(),
      timestamp: Date.now(),
    };
    this.failures.push(signal);
    return signal;
  }

  /** Ingest multiple failures at once */
  addFailures(failures: Omit<FailureSignal, 'id' | 'timestamp'>[]): FailureSignal[] {
    return failures.map(f => this.addFailure(f));
  }

  /** Cluster similar failures together */
  clusterFailures(): FailureCluster[] {
    if (!this.config.clusterSimilarFailures) {
      // Each failure is its own cluster
      return this.failures.map(f => ({
        clusterId: randomUUID(),
        failures: [f],
        pattern: f.input.slice(0, 100),
        frequency: 1,
        priority: determinePriority(1, f.source),
      }));
    }

    const clusters: FailureCluster[] = [];
    const assigned = new Set<string>();

    for (const failure of this.failures) {
      if (assigned.has(failure.id)) continue;

      // Find similar failures
      const similar = this.failures.filter(f => {
        if (assigned.has(f.id) || f.id === failure.id) return false;
        const inputSim = jaccardSimilarity(failure.input, f.input);
        const outputSim = jaccardSimilarity(failure.output, f.output);
        return (inputSim + outputSim) / 2 >= this.config.similarityThreshold;
      });

      const clusterMembers = [failure, ...similar];
      for (const m of clusterMembers) assigned.add(m.id);

      // Find most common source
      const sourceCounts = new Map<FailureSource, number>();
      for (const m of clusterMembers) {
        sourceCounts.set(m.source, (sourceCounts.get(m.source) ?? 0) + 1);
      }
      let dominantSource: FailureSource = failure.source;
      let maxCount = 0;
      for (const [src, cnt] of sourceCounts) {
        if (cnt > maxCount) { dominantSource = src; maxCount = cnt; }
      }

      clusters.push({
        clusterId: randomUUID(),
        failures: clusterMembers,
        pattern: failure.input.slice(0, 100),
        frequency: clusterMembers.length,
        priority: this.config.autoPrioritize
          ? determinePriority(clusterMembers.length, dominantSource)
          : 'medium',
      });
    }

    return clusters;
  }

  /** Generate test cases from all ingested failures */
  generate(): TestGenResult {
    const clusters = this.clusterFailures();
    const testCases: GeneratedTestCase[] = [];

    for (const cluster of clusters) {
      if (testCases.length >= this.config.maxTestCases) break;

      // Use the first (or most representative) failure in the cluster
      const representative = cluster.failures[0]!;
      if (!representative) continue;

      // Generate positive test case
      const assertions = generateAssertions(representative);

      // Ensure minimum assertions
      while (assertions.length < this.config.minAssertions) {
        assertions.push({
          type: 'min_length',
          value: 1,
          description: 'Output must not be empty',
        });
      }

      const testCase: GeneratedTestCase = {
        id: randomUUID(),
        name: `auto_${representative.source}_${cluster.clusterId.slice(0, 8)}`,
        sourceFailureId: representative.id,
        sourceType: representative.source,
        agentId: representative.agentId,
        input: representative.input,
        expectedOutput: representative.expectedOutput,
        assertions,
        priority: cluster.priority,
        tags: [
          `source:${representative.source}`,
          `agent:${representative.agentId}`,
          ...(representative.tags ?? []),
          ...(cluster.frequency > 1 ? ['recurring'] : []),
        ],
        createdAt: Date.now(),
        metadata: {
          clusterSize: cluster.frequency,
          clusterPattern: cluster.pattern,
        },
      };

      testCases.push(testCase);

      // Generate negative test case if enabled
      if (this.config.generateNegativeTests && testCases.length < this.config.maxTestCases) {
        // If the failure was a safety issue, generate a test that should be blocked
        if (
          representative.metricScores?.['content_safety'] !== undefined &&
          representative.metricScores['content_safety'] < 0.5
        ) {
          const negativeTest: GeneratedTestCase = {
            id: randomUUID(),
            name: `auto_negative_${cluster.clusterId.slice(0, 8)}`,
            sourceFailureId: representative.id,
            sourceType: representative.source,
            agentId: representative.agentId,
            input: representative.input,
            assertions: [
              {
                type: 'not_contains',
                value: representative.output.slice(0, 100),
                description: 'Output must not reproduce the unsafe response',
              },
              {
                type: 'metric_above',
                value: 0.7,
                metricName: 'content_safety',
                description: 'Content safety must be above 0.7',
              },
            ],
            priority: 'high',
            tags: ['negative_test', `source:${representative.source}`, `agent:${representative.agentId}`],
            createdAt: Date.now(),
            metadata: {
              negativeTestOf: testCase.id,
            },
          };
          testCases.push(negativeTest);
        }
      }
    }

    this.generatedTests.push(...testCases);

    // Compute coverage estimate (unique clusters with tests / total clusters)
    const coverage = clusters.length > 0 ? Math.min(1, testCases.length / clusters.length) : 0;

    return {
      testCases,
      clusteredFailures: clusters,
      stats: {
        totalFailures: this.failures.length,
        uniqueClusters: clusters.length,
        testCasesGenerated: testCases.length,
        coverageEstimate: Math.round(coverage * 100) / 100,
      },
    };
  }

  /** Run assertions against an output string */
  evaluateTestCase(testCase: GeneratedTestCase, actualOutput: string, metricScores?: Record<string, number>): {
    passed: boolean;
    results: Array<{ assertion: TestAssertion; passed: boolean; actual?: string | number }>;
  } {
    const results: Array<{ assertion: TestAssertion; passed: boolean; actual?: string | number }> = [];

    for (const assertion of testCase.assertions) {
      let passed = false;
      let actual: string | number | undefined;

      switch (assertion.type) {
        case 'contains':
          passed = actualOutput.toLowerCase().includes(String(assertion.value).toLowerCase());
          actual = passed ? 'found' : 'not found';
          break;
        case 'not_contains':
          passed = !actualOutput.toLowerCase().includes(String(assertion.value).toLowerCase());
          actual = passed ? 'not found (good)' : 'found (bad)';
          break;
        case 'matches_regex':
          try {
            passed = new RegExp(String(assertion.value), 'i').test(actualOutput);
          } catch { passed = false; }
          actual = passed ? 'matched' : 'no match';
          break;
        case 'min_length':
          actual = actualOutput.length;
          passed = actualOutput.length >= Number(assertion.value);
          break;
        case 'max_length':
          actual = actualOutput.length;
          passed = actualOutput.length <= Number(assertion.value);
          break;
        case 'metric_above':
          if (assertion.metricName && metricScores) {
            actual = metricScores[assertion.metricName] ?? 0;
            passed = actual >= Number(assertion.value);
          }
          break;
        case 'metric_below':
          if (assertion.metricName && metricScores) {
            actual = metricScores[assertion.metricName] ?? 0;
            passed = actual <= Number(assertion.value);
          }
          break;
        case 'no_pii':
          passed = !containsPII(actualOutput);
          actual = passed ? 'clean' : 'PII detected';
          break;
        case 'no_hallucination':
          // Heuristic: check for common hallucination indicators
          const hallucinationPatterns = [
            /as an ai/i,
            /i don't have access/i,
            /my training data/i,
          ];
          passed = !hallucinationPatterns.some(p => p.test(actualOutput));
          actual = passed ? 'clean' : 'potential hallucination detected';
          break;
        case 'sentiment_positive':
          // Simple heuristic
          const positiveWords = ['thank', 'great', 'good', 'happy', 'pleased', 'excellent', 'wonderful'];
          const negativeWords = ['sorry', 'unfortunately', 'cannot', 'unable', 'fail', 'error', 'wrong'];
          const posCount = positiveWords.filter(w => actualOutput.toLowerCase().includes(w)).length;
          const negCount = negativeWords.filter(w => actualOutput.toLowerCase().includes(w)).length;
          passed = posCount >= negCount;
          actual = `positive:${posCount} negative:${negCount}`;
          break;
        case 'custom':
          // Custom assertions are always manually verified
          passed = true;
          actual = 'manual verification required';
          break;
      }

      results.push({ assertion, passed, actual });
    }

    return {
      passed: results.every(r => r.passed),
      results,
    };
  }

  /** Get all generated test cases */
  getTestCases(): GeneratedTestCase[] {
    return [...this.generatedTests];
  }

  /** Get all ingested failures */
  getFailures(): FailureSignal[] {
    return [...this.failures];
  }

  /** Clear all state */
  reset(): void {
    this.failures = [];
    this.generatedTests = [];
  }

  /** Export test cases as a portable JSON-compatible object */
  export(): { testCases: GeneratedTestCase[]; failures: FailureSignal[] } {
    return {
      testCases: [...this.generatedTests],
      failures: [...this.failures],
    };
  }

  /** Import previously exported test cases */
  import(data: { testCases: GeneratedTestCase[]; failures: FailureSignal[] }): void {
    this.generatedTests.push(...data.testCases);
    this.failures.push(...data.failures);
  }
}
