/**
 * scorecardInspired.test.ts — Tests for agent evaluation improvements:
 *   1. MetricTemplates — pre-built evaluation metrics
 *   2. SimAgent — multi-turn simulation testing
 *   3. RunHistory — A/B comparison, regression tracking, testcase management
 *   4. ProductionMonitor — configurable production monitoring
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MetricRegistry, getMetricRegistry, resetMetricRegistry,
  type MetricInput,
} from '../src/agents/metricTemplates.js';
import {
  SimRunner,
  type SimPersona,
} from '../src/agents/simAgent.js';
import {
  RunHistoryStore,
  type Testcase,
} from '../src/agents/runHistory.js';
import {
  ProductionMonitor,
} from '../src/agents/monitor.js';
import { CustomerSupportBot } from '../src/agents/customerSupportBot.js';
import { ContentModerationBot } from '../src/agents/contentModerationBot.js';
import { HarnessRunner } from '../src/agents/harnessRunner.js';

/* ══════════════════════════════════════════════════════════════════
   1. METRIC TEMPLATES
   ══════════════════════════════════════════════════════════════════ */

describe('MetricTemplates', () => {
  let registry: MetricRegistry;

  beforeEach(() => {
    registry = new MetricRegistry();
  });

  describe('PII Leakage Detection', () => {
    it('should detect email PII in output', () => {
      const result = registry.evaluate('pii_leakage', {
        output: 'Your email is john@example.com, we have it on file.',
      });
      expect(result).toBeDefined();
      expect(result!.passed).toBe(false);
      expect(result!.score).toBe(0);
      expect(result!.details).toContain('email');
    });

    it('should detect SSN PII in output', () => {
      const result = registry.evaluate('pii_leakage', {
        output: 'Your SSN is 123-45-6789.',
      });
      expect(result).toBeDefined();
      expect(result!.passed).toBe(false);
      expect(result!.metadata?.detectedTypes).toContain('ssn');
    });

    it('should detect credit card PII in output', () => {
      const result = registry.evaluate('pii_leakage', {
        output: 'Card ending in 4111 1111 1111 1111.',
      });
      expect(result).toBeDefined();
      expect(result!.passed).toBe(false);
      expect(result!.metadata?.detectedTypes).toContain('credit_card');
    });

    it('should pass when no PII is present', () => {
      const result = registry.evaluate('pii_leakage', {
        output: 'Thank you for contacting us. How can I help you today?',
      });
      expect(result).toBeDefined();
      expect(result!.passed).toBe(true);
      expect(result!.score).toBe(1);
    });
  });

  describe('Hallucination Detection', () => {
    it('should detect high grounding when output matches input', () => {
      const result = registry.evaluate('hallucination', {
        input: 'The premium subscription product costs forty nine dollars and ships within three business days from our warehouse.',
        output: 'The premium subscription product costs forty nine dollars and ships within three business days from the warehouse.',
      });
      expect(result).toBeDefined();
      expect(result!.score).toBeGreaterThan(0.5);
    });

    it('should detect low grounding when output diverges from input', () => {
      const result = registry.evaluate('hallucination', {
        input: 'The weather is sunny today.',
        output: 'The quantum computing revolution will transform healthcare through molecular simulation and protein folding analysis.',
      });
      expect(result).toBeDefined();
      expect(result!.score).toBeLessThan(0.5);
    });
  });

  describe('Content Safety', () => {
    it('should detect unsafe content', () => {
      const result = registry.evaluate('content_safety', {
        output: 'I will stalk you and threaten your family.',
      });
      expect(result).toBeDefined();
      expect(result!.passed).toBe(false);
      expect(result!.metadata?.violations).toBeDefined();
    });

    it('should pass safe content', () => {
      const result = registry.evaluate('content_safety', {
        output: 'Thank you for your patience. I will look into this billing issue for you.',
      });
      expect(result).toBeDefined();
      expect(result!.passed).toBe(true);
    });
  });

  describe('Coherency', () => {
    it('should score well-structured responses highly', () => {
      const result = registry.evaluate('coherency', {
        output: 'I understand your concern about the billing issue. First, let me check your account details. Additionally, I can offer a credit for the inconvenience.',
      });
      expect(result).toBeDefined();
      expect(result!.score).toBeGreaterThanOrEqual(0.6);
      expect(result!.passed).toBe(true);
    });

    it('should score empty responses low', () => {
      const result = registry.evaluate('coherency', {
        output: '',
      });
      expect(result).toBeDefined();
      expect(result!.score).toBe(0);
    });
  });

  describe('Conciseness', () => {
    it('should score concise responses well', () => {
      const result = registry.evaluate('conciseness', {
        output: 'Your subscription renews on March 15th. The monthly cost is $29.99.',
      });
      expect(result).toBeDefined();
      expect(result!.score).toBeGreaterThan(0.5);
    });

    it('should penalize filler words', () => {
      const result = registry.evaluate('conciseness', {
        output: 'So basically, actually, I literally really quite sort of kind of think that you know your subscription might, I mean, renew.',
      });
      expect(result).toBeDefined();
      expect(result!.score).toBeLessThan(0.8);
    });
  });

  describe('Bias Detection', () => {
    it('should detect stereotyping patterns', () => {
      const result = registry.evaluate('bias_detection', {
        output: 'All women are naturally better at caregiving.',
      });
      expect(result).toBeDefined();
      expect(result!.passed).toBe(false);
    });

    it('should pass neutral content', () => {
      const result = registry.evaluate('bias_detection', {
        output: 'Our support team is available 24/7 to help you.',
      });
      expect(result).toBeDefined();
      expect(result!.passed).toBe(true);
    });
  });

  describe('Governance Compliance', () => {
    it('should pass when all governance checks satisfied', () => {
      const result = registry.evaluate('governance_compliance', {
        output: 'Action completed',
        context: { actionTracked: true, governanceEnabled: true, decisionLogged: true },
      });
      expect(result).toBeDefined();
      expect(result!.passed).toBe(true);
    });

    it('should fail when governance is disabled', () => {
      const result = registry.evaluate('governance_compliance', {
        output: 'Action completed',
        context: { governanceEnabled: false },
      });
      expect(result).toBeDefined();
      expect(result!.passed).toBe(false);
    });
  });

  describe('Metric Groups', () => {
    it('should evaluate safety group', () => {
      const result = registry.evaluateGroup('safety', {
        output: 'Thank you for your patience. We will resolve this quickly.',
      });
      expect(result).toBeDefined();
      expect(result!.groupId).toBe('safety');
      expect(result!.results.length).toBe(3); // PII, safety, bias
      expect(result!.passRate).toBeGreaterThan(0);
    });

    it('should evaluate quality group', () => {
      const result = registry.evaluateGroup('quality', {
        input: 'How much does the product cost?',
        output: 'The product costs $49.99 with free shipping. Additionally, we offer a 30-day money-back guarantee.',
      });
      expect(result).toBeDefined();
      expect(result!.groupId).toBe('quality');
      expect(result!.results.length).toBe(4); // coherency, completeness, conciseness, intent
    });

    it('should evaluate all metrics at once', () => {
      const result = registry.evaluateAll({
        input: 'I need help with my billing',
        output: 'I understand your billing concern. Let me check your account.',
      });
      expect(result.results.length).toBe(10); // all built-in metrics
      expect(result.overallScore).toBeGreaterThan(0);
    });
  });

  describe('Registry operations', () => {
    it('should list all metrics', () => {
      expect(registry.getAllMetrics().length).toBe(10);
    });

    it('should get metrics by category', () => {
      const safety = registry.getMetricsByCategory('safety');
      expect(safety.length).toBe(2); // PII + content safety
    });

    it('should register custom metric', () => {
      registry.registerMetric({
        id: 'custom_test',
        name: 'Custom Test',
        description: 'A custom test metric',
        category: 'custom',
        outputType: 'binary',
        defaultThreshold: 1.0,
        evaluate: () => ({
          metricId: 'custom_test', metricName: 'Custom Test',
          score: 1, passed: true, details: 'Custom', category: 'custom', outputType: 'binary',
        }),
      });
      expect(registry.size).toBe(11);
      expect(registry.getMetric('custom_test')).toBeDefined();
    });
  });

  describe('Global registry', () => {
    it('should provide singleton', () => {
      resetMetricRegistry();
      const r1 = getMetricRegistry();
      const r2 = getMetricRegistry();
      expect(r1).toBe(r2);
    });
  });
});

/* ══════════════════════════════════════════════════════════════════
   2. SIM AGENTS
   ══════════════════════════════════════════════════════════════════ */

describe('SimAgent', () => {
  let runner: SimRunner;
  let supportBot: CustomerSupportBot;

  beforeEach(() => {
    runner = new SimRunner();
    supportBot = new CustomerSupportBot();
  });

  describe('Persona management', () => {
    it('should have built-in personas', () => {
      const personas = runner.listPersonas();
      expect(personas.length).toBeGreaterThanOrEqual(6);
      expect(personas.map(p => p.id)).toContain('angry-customer');
      expect(personas.map(p => p.id)).toContain('pii-sharer');
      expect(personas.map(p => p.id)).toContain('vague-requester');
      expect(personas.map(p => p.id)).toContain('adversarial-tester');
      expect(personas.map(p => p.id)).toContain('happy-customer');
      expect(personas.map(p => p.id)).toContain('cancellation-retention');
    });

    it('should register custom persona', () => {
      const custom: SimPersona = {
        id: 'custom-test',
        name: 'Custom Persona',
        description: 'Test persona',
        systemPrompt: 'You are a test.',
        messageTemplates: ['Hello, I need help.', 'Thank you!'],
        behavior: { intensity: 0.5, escalationRate: 0, includesPII: false, adversarial: false },
        stopConditions: { maxTurns: 3 },
      };
      runner.registerPersona(custom);
      expect(runner.getPersona('custom-test')).toBeDefined();
    });
  });

  describe('Single simulation', () => {
    it('should simulate angry customer conversation', async () => {
      const result = await runner.simulate('angry-customer', supportBot);
      expect(result.conversationId).toBeDefined();
      expect(result.conversation.messages.length).toBeGreaterThan(0);
      expect(result.conversation.personaId).toBe('angry-customer');
      expect(result.conversation.agentType).toBe('customer-support');
      expect(result.conversation.turnCount).toBeGreaterThan(0);
      expect(result.qualityScore).toBeGreaterThanOrEqual(0);
      expect(['pass', 'fail', 'partial']).toContain(result.scenarioOutcome);
      expect(result.summary).toBeDefined();
    });

    it('should simulate happy customer conversation', async () => {
      const result = await runner.simulate('happy-customer', supportBot);
      expect(result.conversation.turnCount).toBeGreaterThan(0);
      expect(result.conversation.messages.length).toBeGreaterThan(0);
    });

    it('should simulate PII sharing scenario', async () => {
      const result = await runner.simulate('pii-sharer', supportBot);
      expect(result.findings.length).toBeGreaterThan(0);
      // The bot detects PII but the sim should check agent response
      expect(result.conversation.messages.some(m => m.role === 'agent')).toBe(true);
    });

    it('should simulate adversarial testing', async () => {
      const result = await runner.simulate('adversarial-tester', supportBot);
      expect(result.conversation.turnCount).toBeGreaterThan(0);
      expect(result.findings.length).toBeGreaterThan(0);
    });

    it('should stop on escalation when configured', async () => {
      const result = await runner.simulate('angry-customer', supportBot);
      // Angry customer should trigger escalation, stopping the sim
      if (result.conversation.stopReason === 'agent_done') {
        expect(result.conversation.turnCount).toBeLessThanOrEqual(8);
      }
    });

    it('should apply variable substitution', async () => {
      const result = await runner.simulate('angry-customer', supportBot, {
        variables: { amount: '299.99', expected: '49.99' },
      });
      const firstMsg = result.conversation.messages[0]!;
      expect(firstMsg.content).toContain('299.99');
      expect(firstMsg.content).toContain('49.99');
    });

    it('should include metrics when requested', async () => {
      const result = await runner.simulate('happy-customer', supportBot, {
        metricGroupId: 'safety',
      });
      expect(result.metrics).toBeDefined();
      expect(result.metrics!.results.length).toBe(3);
    });
  });

  describe('Batch simulation', () => {
    it('should run multiple personas in batch', async () => {
      const result = await runner.simulateBatch(
        ['angry-customer', 'happy-customer', 'vague-requester'],
        supportBot,
      );
      expect(result.results.length).toBe(3);
      expect(result.summary.totalConversations).toBe(3);
      expect(result.summary.avgQualityScore).toBeGreaterThan(0);
      expect(result.summary.avgTurns).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle errors in batch gracefully', async () => {
      // Register a persona that causes unknown persona error
      const result = await runner.simulateBatch(
        ['happy-customer', 'nonexistent-persona'],
        supportBot,
      );
      // Should have 2 results: 1 success + 1 error
      expect(result.results.length).toBe(2);
      expect(result.summary.failed).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Results storage', () => {
    it('should store and retrieve results', async () => {
      await runner.simulate('happy-customer', supportBot);
      await runner.simulate('angry-customer', supportBot);
      expect(runner.getResults().length).toBe(2);
    });

    it('should clear results', async () => {
      await runner.simulate('happy-customer', supportBot);
      runner.clearResults();
      expect(runner.getResults().length).toBe(0);
    });
  });
});

/* ══════════════════════════════════════════════════════════════════
   3. RUN HISTORY
   ══════════════════════════════════════════════════════════════════ */

describe('RunHistory', () => {
  let store: RunHistoryStore;

  beforeEach(() => {
    store = new RunHistoryStore();
  });

  describe('Harness run recording', () => {
    it('should record a harness run', () => {
      const harnessResult = createMockHarnessResult(85);
      const record = store.recordHarnessRun(harnessResult);
      expect(record.runId).toBeDefined();
      expect(record.agentType).toBe('customer-support');
      expect(record.score).toBe(85);
      expect(record.runType).toBe('harness');
    });

    it('should support tags and metadata', () => {
      const record = store.recordHarnessRun(
        createMockHarnessResult(80),
        { agentVersion: '2.0', tags: ['release', 'v2'], metadata: { buildId: '123' } },
      );
      expect(record.agentVersion).toBe('2.0');
      expect(record.tags).toContain('release');
      expect(record.metadata.buildId).toBe('123');
    });
  });

  describe('A/B comparison', () => {
    it('should compare two runs and detect improvement', () => {
      const runA = store.recordHarnessRun(createMockHarnessResult(70));
      const runB = store.recordHarnessRun(createMockHarnessResult(85, ['pii_awareness', 'sla_monitoring']));

      const comparison = store.compareRuns(runA.runId, runB.runId);
      expect(comparison).toBeDefined();
      expect(comparison!.scoreImproved).toBe(true);
      expect(comparison!.scoreDelta).toBe(15);
      expect(comparison!.summary).toContain('improved');
    });

    it('should detect regression between runs', () => {
      const runA = store.recordHarnessRun(createMockHarnessResult(90));
      const runB = store.recordHarnessRun(createMockHarnessResult(70));

      const comparison = store.compareRuns(runA.runId, runB.runId);
      expect(comparison).toBeDefined();
      expect(comparison!.scoreImproved).toBe(false);
      expect(comparison!.scoreDelta).toBe(-20);
      expect(comparison!.summary).toContain('regressed');
    });

    it('should return undefined for invalid run IDs', () => {
      expect(store.compareRuns('bad-id', 'also-bad')).toBeUndefined();
    });
  });

  describe('Regression alerts', () => {
    it('should generate alert when score drops significantly', () => {
      store.recordHarnessRun(createMockHarnessResult(90));
      store.recordHarnessRun(createMockHarnessResult(75));

      const alerts = store.getAlerts();
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0]!.scoreDrop).toBe(15);
      expect(alerts[0]!.severity).toBe('high');
    });

    it('should not alert for small score changes', () => {
      store.recordHarnessRun(createMockHarnessResult(85));
      store.recordHarnessRun(createMockHarnessResult(84));

      const alerts = store.getAlerts();
      expect(alerts.length).toBe(0);
    });

    it('should classify alert severity correctly', () => {
      store.recordHarnessRun(createMockHarnessResult(95));
      store.recordHarnessRun(createMockHarnessResult(70)); // -25 = critical

      const alerts = store.getAlerts();
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0]!.severity).toBe('critical');
    });
  });

  describe('Trend analysis', () => {
    it('should compute improving trend', () => {
      store.recordHarnessRun(createMockHarnessResult(50));
      store.recordHarnessRun(createMockHarnessResult(60));
      store.recordHarnessRun(createMockHarnessResult(70));
      store.recordHarnessRun(createMockHarnessResult(80));

      const trend = store.getTrend('customer-support');
      expect(trend.trend).toBe('improving');
      expect(trend.trendSlope).toBeGreaterThan(0);
      expect(trend.minScore).toBe(50);
      expect(trend.maxScore).toBe(80);
    });

    it('should compute declining trend', () => {
      store.recordHarnessRun(createMockHarnessResult(90));
      store.recordHarnessRun(createMockHarnessResult(80));
      store.recordHarnessRun(createMockHarnessResult(70));
      store.recordHarnessRun(createMockHarnessResult(60));

      const trend = store.getTrend('customer-support');
      expect(trend.trend).toBe('declining');
      expect(trend.trendSlope).toBeLessThan(0);
    });

    it('should compute stable trend', () => {
      store.recordHarnessRun(createMockHarnessResult(80));
      store.recordHarnessRun(createMockHarnessResult(80));
      store.recordHarnessRun(createMockHarnessResult(80));

      const trend = store.getTrend('customer-support');
      expect(trend.trend).toBe('stable');
    });
  });

  describe('Testcase management', () => {
    it('should create testcase from simulation', async () => {
      const simRunner = new SimRunner();
      const bot = new CustomerSupportBot();
      const simResult = await simRunner.simulate('angry-customer', bot);

      const testcase = store.testcaseFromSimulation(simResult);
      expect(testcase.testcaseId).toBeDefined();
      expect(testcase.source).toBe('from_simulation');
      expect(testcase.agentType).toBe('customer-support');
      expect(testcase.tags).toContain('from_simulation');
      expect(testcase.input).toBeDefined();
    });

    it('should create testcase from failure', () => {
      const testcase = store.testcaseFromFailure(
        'customer-support',
        { customerId: 'fail-1', message: 'this caused an error' },
        'Unhandled edge case in priority assignment',
      );
      expect(testcase.testcaseId).toBeDefined();
      expect(testcase.source).toBe('from_failure');
      expect(testcase.tags).toContain('from_failure');
    });

    it('should add manual testcases', () => {
      const testcase = store.addTestcase({
        name: 'Billing inquiry happy path',
        agentType: 'customer-support',
        input: { customerId: 'test-1', message: 'What is my balance?' },
        expectedOutput: 'billing response',
        tags: ['manual', 'billing'],
        source: 'manual',
        metadata: {},
      });
      expect(testcase.testcaseId).toBeDefined();
      expect(store.getTestcases().length).toBe(1);
    });

    it('should run testset against agent', async () => {
      const bot = new CustomerSupportBot();
      store.addTestcase({
        name: 'Test 1',
        agentType: 'customer-support',
        input: { customerId: 'test-1', message: 'What is my balance?' },
        expectedOutput: undefined,
        tags: ['manual'],
        source: 'manual',
        metadata: {},
      });
      store.addTestcase({
        name: 'Test 2',
        agentType: 'customer-support',
        input: { customerId: 'test-2', message: 'I want a refund for my last order' },
        expectedOutput: undefined,
        tags: ['manual'],
        source: 'manual',
        metadata: {},
      });

      const result = await store.runTestset('customer-support', bot);
      expect(result.testcases.length).toBe(2);
      expect(result.passRate).toBeGreaterThanOrEqual(0);
    });

    it('should filter testcases by agent type', () => {
      store.addTestcase({ name: 'A', agentType: 'customer-support', input: {}, expectedOutput: null, tags: [], source: 'manual', metadata: {} });
      store.addTestcase({ name: 'B', agentType: 'content-moderation', input: {}, expectedOutput: null, tags: [], source: 'manual', metadata: {} });

      expect(store.getTestcases('customer-support').length).toBe(1);
      expect(store.getTestcases('content-moderation').length).toBe(1);
      expect(store.getTestcases().length).toBe(2);
    });
  });

  describe('Export/Import', () => {
    it('should export and import runs', () => {
      store.recordHarnessRun(createMockHarnessResult(80));
      store.recordHarnessRun(createMockHarnessResult(85));
      store.addTestcase({ name: 'TC1', agentType: 'test', input: {}, expectedOutput: null, tags: [], source: 'manual', metadata: {} });

      const json = store.exportJSON();
      expect(json).toBeDefined();

      const newStore = new RunHistoryStore();
      const { runsImported, testcasesImported } = newStore.importJSON(json);
      expect(runsImported).toBe(2);
      expect(testcasesImported).toBe(1);
    });
  });

  describe('Run queries', () => {
    it('should get latest run', () => {
      store.recordHarnessRun(createMockHarnessResult(70));
      store.recordHarnessRun(createMockHarnessResult(80));

      const latest = store.getLatestRun('customer-support');
      expect(latest).toBeDefined();
      // Latest is sorted by timestamp descending; both may have same ms timestamp
      expect([70, 80]).toContain(latest!.score);
    });

    it('should get runs by type', () => {
      store.recordHarnessRun(createMockHarnessResult(80));

      const harnessRuns = store.getRunsByType('harness');
      expect(harnessRuns.length).toBe(1);
      expect(store.getRunsByType('simulation').length).toBe(0);
    });

    it('should track run count', () => {
      store.recordHarnessRun(createMockHarnessResult(80));
      store.recordHarnessRun(createMockHarnessResult(85));
      expect(store.runCount).toBe(2);
    });
  });
});

/* ══════════════════════════════════════════════════════════════════
   4. PRODUCTION MONITOR
   ══════════════════════════════════════════════════════════════════ */

describe('ProductionMonitor', () => {
  let monitor: ProductionMonitor;

  beforeEach(() => {
    monitor = new ProductionMonitor();
  });

  describe('Monitor configuration', () => {
    it('should create a monitor', () => {
      const config = monitor.createMonitor({
        name: 'Support Bot Safety',
        agentType: 'customer-support',
        metricGroupId: 'safety',
        alertThreshold: 0.8,
        windowSize: 50,
        enabled: true,
      });
      expect(config.id).toBeDefined();
      expect(config.name).toBe('Support Bot Safety');
    });

    it('should update a monitor', () => {
      const config = monitor.createMonitor({
        name: 'Test Monitor',
        agentType: 'test',
        metricGroupId: 'safety',
        alertThreshold: 0.8,
        windowSize: 50,
        enabled: true,
      });

      const updated = monitor.updateMonitor(config.id, { alertThreshold: 0.9 });
      expect(updated).toBeDefined();
      expect(updated!.alertThreshold).toBe(0.9);
    });

    it('should delete a monitor', () => {
      const config = monitor.createMonitor({
        name: 'Delete Me',
        agentType: 'test',
        metricGroupId: 'safety',
        alertThreshold: 0.8,
        windowSize: 50,
        enabled: true,
      });

      expect(monitor.deleteMonitor(config.id)).toBe(true);
      expect(monitor.monitorCount).toBe(0);
    });

    it('should get monitors for agent type', () => {
      monitor.createMonitor({ name: 'M1', agentType: 'support', metricGroupId: 'safety', alertThreshold: 0.8, windowSize: 50, enabled: true });
      monitor.createMonitor({ name: 'M2', agentType: 'support', metricGroupId: 'quality', alertThreshold: 0.7, windowSize: 50, enabled: true });
      monitor.createMonitor({ name: 'M3', agentType: 'moderation', metricGroupId: 'safety', alertThreshold: 0.9, windowSize: 50, enabled: true });

      expect(monitor.getMonitorsForAgent('support').length).toBe(2);
      expect(monitor.getMonitorsForAgent('moderation').length).toBe(1);
    });
  });

  describe('Sample scoring', () => {
    it('should score a sample and track it', () => {
      const config = monitor.createMonitor({
        name: 'Safety Monitor',
        agentType: 'test',
        metricGroupId: 'safety',
        alertThreshold: 0.8,
        windowSize: 50,
        enabled: true,
      });

      const sample = monitor.scoreSample(config.id, {
        output: 'Thank you for your patience. We will resolve this.',
      });

      expect(sample).toBeDefined();
      expect(sample!.overallScore).toBeGreaterThan(0);
      expect(sample!.result.results.length).toBe(3); // PII, safety, bias
    });

    it('should trigger alert when score below threshold', () => {
      const config = monitor.createMonitor({
        name: 'Strict Monitor',
        agentType: 'test',
        metricGroupId: 'safety',
        alertThreshold: 1.0, // Impossible to always meet
        windowSize: 50,
        enabled: true,
      });

      monitor.scoreSample(config.id, {
        output: 'Your SSN is 123-45-6789.', // PII leakage → score < 1
      });

      const alerts = monitor.getAlerts();
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0]!.monitorName).toBe('Strict Monitor');
      expect(alerts[0]!.failedMetrics).toContain('pii_leakage');
    });

    it('should not score disabled monitors', () => {
      const config = monitor.createMonitor({
        name: 'Disabled',
        agentType: 'test',
        metricGroupId: 'safety',
        alertThreshold: 0.8,
        windowSize: 50,
        enabled: false,
      });

      const sample = monitor.scoreSample(config.id, { output: 'test' });
      expect(sample).toBeUndefined();
    });

    it('should score batch of samples', () => {
      const config = monitor.createMonitor({
        name: 'Batch Monitor',
        agentType: 'test',
        metricGroupId: 'safety',
        alertThreshold: 0.5,
        windowSize: 100,
        enabled: true,
      });

      const results = monitor.scoreBatch(config.id, [
        { output: 'Safe response one.' },
        { output: 'Safe response two.' },
        { output: 'Your SSN is 123-45-6789.' },
      ]);

      expect(results.length).toBe(3);
    });

    it('should maintain window size limit', () => {
      const config = monitor.createMonitor({
        name: 'Small Window',
        agentType: 'test',
        metricGroupId: 'safety',
        alertThreshold: 0.5,
        windowSize: 3,
        enabled: true,
      });

      for (let i = 0; i < 10; i++) {
        monitor.scoreSample(config.id, { output: `Response ${i}` });
      }

      const samples = monitor.getSamples(config.id);
      expect(samples.length).toBe(3); // Window limited to 3
    });
  });

  describe('Monitor status', () => {
    it('should report monitor health', () => {
      const config = monitor.createMonitor({
        name: 'Health Monitor',
        agentType: 'test',
        metricGroupId: 'safety',
        alertThreshold: 0.8,
        windowSize: 50,
        enabled: true,
      });

      // Score a good sample
      monitor.scoreSample(config.id, { output: 'A perfectly safe and helpful response.' });

      const status = monitor.getMonitorStatus(config.id);
      expect(status).toBeDefined();
      expect(status!.monitorName).toBe('Health Monitor');
      expect(status!.sampleCount).toBe(1);
      expect(status!.enabled).toBe(true);
      expect(['healthy', 'warning', 'critical']).toContain(status!.health);
    });

    it('should return undefined for unknown monitor', () => {
      expect(monitor.getMonitorStatus('unknown')).toBeUndefined();
    });
  });

  describe('Dashboard', () => {
    it('should generate dashboard with all monitors', () => {
      monitor.createMonitor({ name: 'M1', agentType: 'test', metricGroupId: 'safety', alertThreshold: 0.8, windowSize: 50, enabled: true });
      monitor.createMonitor({ name: 'M2', agentType: 'test', metricGroupId: 'quality', alertThreshold: 0.7, windowSize: 50, enabled: true });

      const dashboard = monitor.getDashboard();
      expect(dashboard.monitors.length).toBe(2);
      expect(['healthy', 'warning', 'critical']).toContain(dashboard.overallHealth);
    });
  });

  describe('Alert management', () => {
    it('should classify alert severity', () => {
      const config = monitor.createMonitor({
        name: 'Severity Test',
        agentType: 'test',
        metricGroupId: 'safety',
        alertThreshold: 0.95,
        windowSize: 50,
        enabled: true,
      });

      // Score something that triggers PII alert (score drops significantly)
      monitor.scoreSample(config.id, { output: 'SSN: 123-45-6789, email: a@b.com' });

      const alerts = monitor.getAlerts();
      expect(alerts.length).toBeGreaterThan(0);
      expect(['low', 'medium', 'high', 'critical']).toContain(alerts[0]!.severity);
    });

    it('should clear alerts', () => {
      const config = monitor.createMonitor({
        name: 'Clear Test',
        agentType: 'test',
        metricGroupId: 'safety',
        alertThreshold: 1.0,
        windowSize: 50,
        enabled: true,
      });

      monitor.scoreSample(config.id, { output: 'SSN: 123-45-6789' });
      expect(monitor.alertCount).toBeGreaterThan(0);

      monitor.clearAlerts();
      expect(monitor.alertCount).toBe(0);
    });

    it('should clear alerts by monitor', () => {
      const m1 = monitor.createMonitor({ name: 'M1', agentType: 'test', metricGroupId: 'safety', alertThreshold: 1.0, windowSize: 50, enabled: true });
      const m2 = monitor.createMonitor({ name: 'M2', agentType: 'test', metricGroupId: 'safety', alertThreshold: 1.0, windowSize: 50, enabled: true });

      monitor.scoreSample(m1.id, { output: 'SSN: 123-45-6789' });
      monitor.scoreSample(m2.id, { output: 'SSN: 123-45-6789' });

      const totalBefore = monitor.alertCount;
      monitor.clearAlerts(m1.id);
      expect(monitor.alertCount).toBeLessThan(totalBefore);
    });
  });
});

/* ══════════════════════════════════════════════════════════════════
   5. INTEGRATION — Full Pipeline
   ══════════════════════════════════════════════════════════════════ */

describe('Full Scorecard-Inspired Pipeline', () => {
  it('should run harness → record → simulate → compare → monitor', async () => {
    const bot = new CustomerSupportBot();
    const store = new RunHistoryStore();

    // Step 1: Run harness assessment
    const harness = new HarnessRunner({ agentType: 'customer-support' });
    const harnessResult = await harness.runWithAgent(bot);
    const run1 = store.recordHarnessRun(harnessResult, { agentVersion: '1.0', tags: ['baseline'] });

    expect(run1.score).toBeGreaterThan(0);
    expect(harnessResult.maturityLevel).toBeDefined();

    // Step 2: Run simulations
    const simRunner = new SimRunner();
    const simBatch = await simRunner.simulateBatch(
      ['angry-customer', 'happy-customer', 'pii-sharer'],
      bot,
    );
    const run2 = store.recordSimulationRun('customer-support', simBatch, { agentVersion: '1.0', tags: ['simulation'] });

    expect(run2.score).toBeGreaterThan(0);
    expect(simBatch.summary.totalConversations).toBe(3);

    // Step 3: Create testcases from simulations
    for (const result of simBatch.results) {
      store.testcaseFromSimulation(result);
    }
    expect(store.testcaseCount).toBe(3);

    // Step 4: Compare runs
    const comparison = store.compareRuns(run1.runId, run2.runId);
    expect(comparison).toBeDefined();
    expect(comparison!.summary).toBeDefined();

    // Step 5: Set up production monitor
    const prodMonitor = new ProductionMonitor();
    const monitorConfig = prodMonitor.createMonitor({
      name: 'Support Bot Safety Monitor',
      agentType: 'customer-support',
      metricGroupId: 'safety',
      alertThreshold: 0.8,
      windowSize: 100,
      enabled: true,
    });

    // Step 6: Score some production samples
    prodMonitor.scoreSample(monitorConfig.id, {
      output: 'I understand your billing concern. Let me check your account.',
    });
    prodMonitor.scoreSample(monitorConfig.id, {
      output: 'Thank you for contacting support. How can I help?',
    });

    const dashboard = prodMonitor.getDashboard();
    expect(dashboard.monitors.length).toBe(1);
    expect(dashboard.totalSamples).toBe(2);

    // Step 7: Check trends
    const trend = store.getTrend('customer-support');
    expect(trend.points.length).toBe(2); // harness + simulation
    expect(trend.agentType).toBe('customer-support');
  });
});

/* ── Helpers ─────────────────────────────────────────────────────── */

function createMockHarnessResult(score: number, extraCaps?: string[]): any {
  const caps: any[] = [
    { capability: 'agent_identity', present: true, evidence: 'OK', scoreContribution: 3 },
    { capability: 'governance_enabled', present: true, evidence: 'OK', scoreContribution: 5 },
    { capability: 'action_tracking', present: true, evidence: 'OK', scoreContribution: 5 },
    { capability: 'error_handling', present: true, evidence: 'OK', scoreContribution: 5 },
    { capability: 'run_method', present: true, evidence: 'OK', scoreContribution: 5 },
  ];

  for (const cap of extraCaps ?? []) {
    caps.push({ capability: cap, present: true, evidence: 'Added', scoreContribution: 5 });
  }

  return {
    agentType: 'customer-support',
    iterations: [],
    finalScore: score,
    totalImprovement: 0,
    converged: true,
    durationMs: 10,
    capabilityReport: caps,
    maturityLevel: score >= 80 ? 'L5 — Optimizing' : 'L4 — Managed',
    levelDescription: 'Mock result',
  };
}
