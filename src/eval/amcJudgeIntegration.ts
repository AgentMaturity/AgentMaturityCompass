/**
 * LLM-as-Judge Integration with AMC Test Harness
 * 
 * Integrates LLM-as-Judge metrics into the existing AMC testing framework.
 * Provides seamless evaluation of agent outputs during test runs.
 * 
 * Issue: AMC-48 — BUILD: LLM-as-Judge Metrics (Test Integration)
 */

import { ExtendedLLMJudgeEngine, JudgeContext, JudgeResult, MetricSummary, aggregateMetricsByCategory } from './extendedLLMJudge.js';
import { incCounter, setGauge, observeHistogram } from '../ops/metrics/metricsRegistry.js';

// ---------------------------------------------------------------------------
// Test Integration Types
// ---------------------------------------------------------------------------

export interface JudgeTestConfig {
  /** Enable LLM-as-Judge evaluation */
  enabled: boolean;
  /** Metrics to evaluate */
  metrics: string[];
  /** Categories to evaluate */
  categories: string[];
  /** Judge model configuration */
  judgeModel: 'gpt-4' | 'claude-3-opus' | 'claude-3-sonnet';
  /** Minimum score threshold for pass/fail */
  minScoreThreshold: number;
  /** Enable detailed reporting */
  detailedReporting: boolean;
  /** Cache judge responses */
  enableCache: boolean;
}

export interface JudgeTestResult {
  /** Test identifier */
  testId: string;
  /** Judge evaluation results */
  judgeResults: JudgeResult[];
  /** Category summaries */
  categorySummaries: MetricSummary[];
  /** Overall score */
  overallScore: number;
  /** Pass/fail status */
  passed: boolean;
  /** Execution time */
  executionTimeMs: number;
}

export interface TestContext {
  /** Test identifier */
  testId: string;
  /** Test description */
  description: string;
  /** Agent input */
  input: string;
  /** Agent output */
  output: string;
  /** Expected output */
  expected?: string;
  /** Context for RAG tests */
  context?: string;
  /** Test metadata */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// AMC Judge Test Runner
// ---------------------------------------------------------------------------

export class AMCJudgeTestRunner {
  private engine: ExtendedLLMJudgeEngine;
  private config: JudgeTestConfig;

  constructor(config: Partial<JudgeTestConfig> = {}) {
    this.config = {
      enabled: true,
      metrics: [],
      categories: ['rag', 'safety', 'quality'],
      judgeModel: 'claude-3-sonnet',
      minScoreThreshold: 0.7,
      detailedReporting: true,
      enableCache: true,
      ...config
    };

    this.engine = new ExtendedLLMJudgeEngine({
      model: this.config.judgeModel,
      temperature: 0.1,
      enableCache: this.config.enableCache,
      batchSize: 3
    });
  }

  /**
   * Run LLM-as-Judge evaluation for a single test
   */
  async evaluateTest(testContext: TestContext): Promise<JudgeTestResult> {
    const startTime = Date.now();

    if (!this.config.enabled) {
      return this.createEmptyResult(testContext.testId, startTime);
    }

    const judgeContext: JudgeContext = {
      input: testContext.input,
      output: testContext.output,
      expected: testContext.expected,
      context: testContext.context,
      metadata: testContext.metadata
    };

    let judgeResults: JudgeResult[] = [];

    try {
      // Evaluate specific metrics if configured
      if (this.config.metrics.length > 0) {
        for (const metric of this.config.metrics) {
          const result = await this.engine.evaluateExtendedMetric(metric as any, judgeContext);
          judgeResults.push(result);
        }
      }

      // Evaluate categories if configured
      if (this.config.categories.length > 0) {
        for (const category of this.config.categories) {
          const categoryResults = await this.engine.evaluateByCategory(category, judgeContext);
          judgeResults.push(...categoryResults);
        }
      }

      // If no specific metrics or categories, run comprehensive evaluation
      if (this.config.metrics.length === 0 && this.config.categories.length === 0) {
        judgeResults = await this.engine.evaluateComprehensive(judgeContext);
      }

      // Remove duplicates
      judgeResults = this.deduplicateResults(judgeResults);

      const categorySummaries = aggregateMetricsByCategory(judgeResults);
      const overallScore = judgeResults.reduce((sum, r) => sum + r.score, 0) / judgeResults.length;
      const passed = overallScore >= this.config.minScoreThreshold;

      // Record metrics
      this.recordMetrics(testContext.testId, judgeResults, overallScore, passed);

      const executionTimeMs = Date.now() - startTime;

      return {
        testId: testContext.testId,
        judgeResults,
        categorySummaries,
        overallScore,
        passed,
        executionTimeMs
      };

    } catch (error) {
      console.error(`Judge evaluation failed for test ${testContext.testId}:`, error);
      
      // Record failure metrics
      incCounter('amc_judge_evaluation_errors_total', 'Judge evaluation errors', {
        test_id: testContext.testId,
        error_type: error instanceof Error ? error.constructor.name : 'unknown'
      });

      return this.createEmptyResult(testContext.testId, startTime);
    }
  }

  /**
   * Run batch evaluation for multiple tests
   */
  async evaluateTestBatch(testContexts: TestContext[]): Promise<JudgeTestResult[]> {
    const results: JudgeTestResult[] = [];
    
    console.log(`Running LLM-as-Judge evaluation for ${testContexts.length} tests...`);
    
    for (let i = 0; i < testContexts.length; i++) {
      const testContext = testContexts[i];
      const result = await this.evaluateTest(testContext);
      results.push(result);
      
      if ((i + 1) % 10 === 0) {
        console.log(`Completed ${i + 1}/${testContexts.length} judge evaluations`);
      }
    }

    return results;
  }

  /**
   * Generate comprehensive report
   */
  generateReport(results: JudgeTestResult[]): string {
    if (results.length === 0) {
      return 'No judge evaluation results to report';
    }

    const passedTests = results.filter(r => r.passed).length;
    const failedTests = results.length - passedTests;
    const averageScore = results.reduce((sum, r) => sum + r.overallScore, 0) / results.length;
    const averageExecutionTime = results.reduce((sum, r) => sum + r.executionTimeMs, 0) / results.length;

    let report = `LLM-as-Judge Evaluation Report\n`;
    report += `==============================\n\n`;
    report += `Total Tests: ${results.length}\n`;
    report += `Passed: ${passedTests} (${(passedTests / results.length * 100).toFixed(1)}%)\n`;
    report += `Failed: ${failedTests} (${(failedTests / results.length * 100).toFixed(1)}%)\n`;
    report += `Average Score: ${averageScore.toFixed(3)}\n`;
    report += `Average Execution Time: ${averageExecutionTime.toFixed(0)}ms\n`;
    report += `Score Threshold: ${this.config.minScoreThreshold}\n\n`;

    // Category breakdown
    const allCategorySummaries = results.flatMap(r => r.categorySummaries);
    const categoryMap = new Map<string, number[]>();
    
    for (const summary of allCategorySummaries) {
      if (!categoryMap.has(summary.category)) {
        categoryMap.set(summary.category, []);
      }
      categoryMap.get(summary.category)!.push(summary.averageScore);
    }

    report += `Category Performance:\n`;
    for (const [category, scores] of categoryMap.entries()) {
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      report += `  ${category}: ${avgScore.toFixed(3)} (${scores.length} tests)\n`;
    }

    // Failed tests details
    const failedTestResults = results.filter(r => !r.passed);
    if (failedTestResults.length > 0) {
      report += `\nFailed Tests:\n`;
      for (const result of failedTestResults.slice(0, 10)) { // Show first 10
        report += `  ${result.testId}: ${result.overallScore.toFixed(3)}\n`;
        
        // Show lowest scoring metrics
        const lowestMetrics = result.judgeResults
          .sort((a, b) => a.score - b.score)
          .slice(0, 3);
        
        for (const metric of lowestMetrics) {
          report += `    ${metric.metric}: ${metric.score.toFixed(3)}\n`;
        }
      }
      
      if (failedTestResults.length > 10) {
        report += `  ... and ${failedTestResults.length - 10} more\n`;
      }
    }

    return report;
  }

  private deduplicateResults(results: JudgeResult[]): JudgeResult[] {
    const seen = new Set<string>();
    return results.filter(result => {
      const key = result.metric;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private recordMetrics(testId: string, results: JudgeResult[], overallScore: number, passed: boolean): void {
    // Record overall metrics
    incCounter('amc_judge_evaluations_total', 'Total judge evaluations', {
      test_id: testId,
      passed: passed.toString()
    });

    setGauge('amc_judge_overall_score', 'Overall judge score', {
      test_id: testId
    }, overallScore);

    // Record individual metric scores
    for (const result of results) {
      setGauge('amc_judge_metric_score', 'Individual metric score', {
        test_id: testId,
        metric: result.metric
      }, result.score);

      observeHistogram('amc_judge_metric_score_distribution', 'Distribution of metric scores', {
        metric: result.metric
      }, result.score, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]);
    }
  }

  private createEmptyResult(testId: string, startTime: number): JudgeTestResult {
    return {
      testId,
      judgeResults: [],
      categorySummaries: [],
      overallScore: 0,
      passed: false,
      executionTimeMs: Date.now() - startTime
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<JudgeTestConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Recreate engine if model changed
    if (newConfig.judgeModel) {
      this.engine = new ExtendedLLMJudgeEngine({
        model: newConfig.judgeModel,
        temperature: 0.1,
        enableCache: this.config.enableCache,
        batchSize: 3
      });
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): JudgeTestConfig {
    return { ...this.config };
  }
}

// ---------------------------------------------------------------------------
// Test Harness Integration Helpers
// ---------------------------------------------------------------------------

/**
 * Create test context from AMC test case
 */
export function createTestContext(
  testId: string,
  description: string,
  input: string,
  output: string,
  expected?: string,
  context?: string,
  metadata?: Record<string, unknown>
): TestContext {
  return {
    testId,
    description,
    input,
    output,
    expected,
    context,
    metadata
  };
}

/**
 * Default judge configuration for AMC tests
 */
export function getDefaultJudgeConfig(): JudgeTestConfig {
  return {
    enabled: true,
    metrics: [],
    categories: ['rag', 'safety', 'quality', 'alignment'],
    judgeModel: 'claude-3-sonnet',
    minScoreThreshold: 0.7,
    detailedReporting: true,
    enableCache: true
  };
}

/**
 * Create judge runner with AMC defaults
 */
export function createAMCJudgeRunner(config?: Partial<JudgeTestConfig>): AMCJudgeTestRunner {
  const defaultConfig = getDefaultJudgeConfig();
  return new AMCJudgeTestRunner({ ...defaultConfig, ...config });
}