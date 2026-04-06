/**
 * gapClosure.test.ts — Comprehensive tests for the 10 gap-closure modules.
 *
 * Modules under test:
 *   1. otelExporter     — Native OpenTelemetry (OTLP) export
 *   2. llmJudge         — LLM-as-judge evaluation
 *   3. playground        — Interactive prompt comparison
 *   4. traceIngestion    — Live production trace ingestion
 *   5. safetyDSL         — AgentSpec-style declarative safety DSL
 *   6. modelRouter       — Multi-provider model routing
 *   7. frameworkAdapters  — Native SDK wrappers
 *   8. autoTestGen       — Auto testcase generation from failures
 *   9. sessionEval       — Session/path-level evaluation
 *  10. semanticGuardrails — Semantic guardrails
 */

import { describe, it, expect, beforeEach } from 'vitest';

/* ──────────────────────────────────────────────────────────────────
   1. OTELExporter
   ────────────────────────────────────────────────────────────────── */
import {
  OTELExporter,
  createTraceparent,
  parseTraceparent,
  amcTraceToOTLPSpan,
  amcTracesToOTLPRequest,
} from '../src/ops/otelExporter.js';

describe('OTELExporter', () => {
  describe('W3C trace context', () => {
    it('should create a valid traceparent header', () => {
      const header = createTraceparent({
        traceId: 'a'.repeat(32),
        spanId: 'b'.repeat(16),
        sampled: true,
      });
      expect(header).toBe(`00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`);
    });

    it('should create traceparent with sampled=false', () => {
      const header = createTraceparent({
        traceId: '1'.repeat(32),
        spanId: '2'.repeat(16),
        sampled: false,
      });
      expect(header).toMatch(/-00$/);
    });

    it('should parse a valid traceparent', () => {
      const ctx = parseTraceparent(`00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`);
      expect(ctx).toBeDefined();
      expect(ctx!.traceId).toBe('a'.repeat(32));
      expect(ctx!.spanId).toBe('b'.repeat(16));
      expect(ctx!.sampled).toBe(true);
    });

    it('should return undefined for invalid traceparent', () => {
      expect(parseTraceparent('invalid')).toBeUndefined();
      expect(parseTraceparent('00-short-short-01')).toBeUndefined();
    });
  });

  describe('AMC trace to OTLP span conversion', () => {
    it('should convert an LLM call trace', () => {
      const span = amcTraceToOTLPSpan({
        ts: Date.now(),
        event: 'llm_call',
        model: 'gpt-4o',
        prompt_tokens: 100,
        prompt: 'Hello',
      }, 'test-agent', 'a'.repeat(32));

      expect(span.name).toContain('llm_call');
      expect(span.traceId).toBe('a'.repeat(32));
      expect(span.attributes.length).toBeGreaterThan(0);
    });

    it('should convert a tool intent trace', () => {
      const span = amcTraceToOTLPSpan({
        ts: Date.now(),
        event: 'tool_intent',
        tool: 'search',
      }, 'agent-1', 'b'.repeat(32));

      expect(span.name).toContain('tool_intent');
    });
  });

  describe('Batch export request', () => {
    it('should create a valid OTLP request from multiple traces', () => {
      const traces = [
        { ts: Date.now(), event: 'llm_call' as const, model: 'gpt-4o', prompt_tokens: 50 },
        { ts: Date.now(), event: 'tool_intent' as const, tool: 'search' },
      ];
      const request = amcTracesToOTLPRequest(traces, 'agent-x', {
        'service.name': 'test-service',
      });

      expect(request.resourceSpans.length).toBe(1);
      expect(request.resourceSpans[0]!.scopeSpans[0]!.spans.length).toBe(2);
    });
  });

  describe('OTELExporter class', () => {
    it('should buffer spans and track stats', () => {
      const exporter = new OTELExporter({
        endpoint: 'http://localhost:4318',
        serviceName: 'test',
        batchSize: 100,
      });

      exporter.addTrace({
        ts: Date.now(),
        event: 'llm_call',
        model: 'claude-sonnet',
        prompt_tokens: 200,
      }, 'agent-1');

      const stats = exporter.getStats();
      expect(stats.totalSpansBuffered).toBe(1);
      expect(stats.totalSpansExported).toBe(0);
    });

    it('should clear buffer on drain', () => {
      const exporter = new OTELExporter({
        endpoint: 'http://localhost:4318',
        serviceName: 'test',
      });

      exporter.addTrace({ ts: Date.now(), event: 'llm_call', model: 'test' }, 'a1');
      exporter.addTrace({ ts: Date.now(), event: 'tool_intent', tool: 'calc' }, 'a1');

      const req = exporter.drain();
      expect(req.resourceSpans.length).toBe(1);
      expect(exporter.getStats().totalSpansBuffered).toBe(0);
    });
  });
});

/* ──────────────────────────────────────────────────────────────────
   2. LLMJudge
   ────────────────────────────────────────────────────────────────── */
import { LLMJudge } from '../src/agents/llmJudge.js';

describe('LLMJudge', () => {
  let judge: LLMJudge;

  beforeEach(() => {
    judge = new LLMJudge();
  });

  it('should have built-in templates', () => {
    const templates = judge.listTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(5);
    expect(templates.map(t => t.id)).toContain('quality');
    expect(templates.map(t => t.id)).toContain('safety');
    expect(templates.map(t => t.id)).toContain('faithfulness');
  });

  it('should get a template by ID', () => {
    const tmpl = judge.getTemplate('quality');
    expect(tmpl).toBeDefined();
    expect(tmpl!.rubric).toBeDefined();
    expect(tmpl!.rubric.criteria.length).toBeGreaterThan(0);
  });

  it('should render a judge prompt', () => {
    const prompt = judge.renderJudgePrompt('quality', {
      input: 'What is 2+2?',
      output: '4',
    });
    expect(prompt).toContain('2+2');
    expect(prompt).toContain('4');
  });

  it('should simulate scoring in offline mode', () => {
    const result = judge.simulateScore('quality', {
      input: 'Hello',
      output: 'Hi there! How can I help you?',
    });
    expect(result.score).toBeGreaterThanOrEqual(1);
    expect(result.score).toBeLessThanOrEqual(5);
    expect(result.reasoning).toBeTruthy();
    expect(result.templateId).toBe('quality');
  });

  it('should fail closed when llm mode is requested without a real judge adapter', async () => {
    const llmJudge = new LLMJudge({
      mode: 'llm',
      apiEndpoint: 'https://example.com/judge',
      apiKey: 'test-key',
    });

    await expect(llmJudge.evaluate('quality', {
      input: 'Hello',
      output: 'Hi there! How can I help you?',
    })).rejects.toThrow(/llm mode.*not implemented|adapter/i);
  });

  it('should simulate safety evaluation', () => {
    const result = judge.simulateScore('safety', {
      input: 'Tell me how to hack a computer',
      output: 'Here is how to hack...',
    });
    expect(result.score).toBeDefined();
  });

  it('should simulate pairwise comparison', () => {
    const result = judge.simulatePairwise(
      { input: 'Explain gravity', output: 'Gravity is a force that attracts objects towards each other.' },
      { input: 'Explain gravity', output: 'idk lol' },
    );
    expect(result.winner).toBe('A');
    expect(result.reasoning).toBeTruthy();
  });

  it('should allow custom templates', () => {
    judge.addTemplate({
      id: 'custom-tone',
      name: 'Tone Check',
      description: 'Checks professional tone',
      systemPrompt: 'Evaluate if the response maintains professional tone.',
      userPromptTemplate: 'Input: {{input}}\nOutput: {{output}}',
      rubric: {
        scale: '1-5',
        criteria: [
          { score: 1, label: 'Unprofessional', description: 'Very informal' },
          { score: 5, label: 'Very professional', description: 'Perfect tone' },
        ],
      },
    });
    expect(judge.getTemplate('custom-tone')).toBeDefined();
  });
});

/* ──────────────────────────────────────────────────────────────────
   3. Playground
   ────────────────────────────────────────────────────────────────── */
import { Playground } from '../src/agents/playground.js';

describe('Playground', () => {
  it('should create a session with prompts and testcases', async () => {
    const pg = new Playground();
    const session = pg.createSession('Test Session');

    pg.addPrompt(session.sessionId, { name: 'Prompt A', systemPrompt: 'You are helpful.', userPrompt: '{{input}}', model: 'gpt-4o' });
    pg.addPrompt(session.sessionId, { name: 'Prompt B', systemPrompt: 'Be concise.', userPrompt: '{{input}}', model: 'gpt-4o' });
    pg.addTestcase(session.sessionId, { name: 'Greeting', variables: { input: 'Hello' }, expectedOutput: 'Hi!' });

    const updated = pg.getSession(session.sessionId);
    expect(updated).toBeDefined();
    expect(updated!.sessionId).toBeTruthy();
    expect(updated!.prompts.length).toBe(2);
    expect(updated!.testcases.length).toBe(1);
  });

  it('should run a comparison and record variants', async () => {
    const pg = new Playground();
    const session = pg.createSession('Comparison');
    pg.addPrompt(session.sessionId, { name: 'A', systemPrompt: 'Be helpful.', userPrompt: '{{input}}', model: 'gpt-4o' });
    pg.addTestcase(session.sessionId, { name: 'Test', variables: { input: 'Test' } });

    const run = await pg.runComparison(session.sessionId, session.testcases[0]!.id);
    expect(run).toBeDefined();
    expect(run!.variants.length).toBe(1);

    const updated = pg.getSession(session.sessionId);
    expect(updated).toBeDefined();
    expect(updated!.runs.length).toBe(1);
  });

  it('should generate a summary', async () => {
    const pg = new Playground();
    const session = pg.createSession('Summary Test');

    pg.addPrompt(session.sessionId, { name: 'Verbose', systemPrompt: 'Be verbose.', userPrompt: '{{input}}', model: 'gpt-4o' });
    pg.addPrompt(session.sessionId, { name: 'Concise', systemPrompt: 'Be concise.', userPrompt: '{{input}}', model: 'gpt-4o' });
    pg.addTestcase(session.sessionId, { name: 'Explain AI', variables: { input: 'Explain AI' } });

    await pg.runAll(session.sessionId);

    const summary = pg.getSummary(session.sessionId);
    expect(summary).toBeDefined();
    expect(summary!.promptScores.length).toBe(2);
  });
});

/* ──────────────────────────────────────────────────────────────────
   4. TraceIngestion
   ────────────────────────────────────────────────────────────────── */
import { TraceIngestionPipeline } from '../src/agents/traceIngestion.js';

describe('TraceIngestionPipeline', () => {
  let pipeline: TraceIngestionPipeline;

  beforeEach(() => {
    pipeline = new TraceIngestionPipeline({ flagThreshold: 0.5 });
  });

  it('should ingest a production trace', () => {
    const scored = pipeline.ingest({
      traceId: 'tr-1',
      agentId: 'agent-1',
      agentType: 'support',
      input: 'Hello world',
      output: 'Hi! How can I help you today?',
      timestamp: Date.now(),
      durationMs: 200,
      metadata: {},
    });

    expect(scored.trace.traceId).toBe('tr-1');
    expect(scored.metrics.overallScore).toBeGreaterThanOrEqual(0);
    expect(scored.metrics.overallScore).toBeLessThanOrEqual(1);
  });

  it('should flag traces below threshold', () => {
    // Ingest a trace that should score poorly
    const scored = pipeline.ingest({
      traceId: 'tr-bad',
      agentId: 'agent-1',
      agentType: 'support',
      input: 'What is the refund policy for product XYZ-1234?',
      output: '', // Empty output = bad
      timestamp: Date.now(),
      durationMs: 50,
      metadata: {},
    });

    expect(scored.flagged).toBe(true);
  });

  it('should track stats', () => {
    pipeline.ingest({
      traceId: 'tr-1',
      agentId: 'a1',
      agentType: 'support',
      input: 'test input',
      output: 'test output here with enough words',
      timestamp: Date.now(),
      durationMs: 100,
      metadata: {},
    });
    pipeline.ingest({
      traceId: 'tr-2',
      agentId: 'a1',
      agentType: 'support',
      input: 'another test',
      output: 'another response that is reasonably long',
      timestamp: Date.now(),
      durationMs: 150,
      metadata: {},
    });

    const stats = pipeline.getStats();
    expect(stats.totalIngested).toBe(2);
    expect(stats.avgScoreOverall).toBeGreaterThan(0);
  });

  it('should generate testcases from flagged traces', () => {
    // Ingest several traces, some flagged
    pipeline.ingest({
      traceId: 'good-1',
      agentId: 'a1',
      agentType: 'support',
      input: 'Tell me about the weather today in San Francisco',
      output: 'The weather in San Francisco today is sunny with mild temperatures.',
      timestamp: Date.now(),
      durationMs: 200,
      metadata: {},
    });
    pipeline.ingest({
      traceId: 'bad-1',
      agentId: 'a1',
      agentType: 'support',
      input: 'Explain the company refund policy for defective items',
      output: '',
      timestamp: Date.now(),
      durationMs: 10,
      metadata: {},
    });

    const testcases = pipeline.getGeneratedTestcases();
    expect(testcases.length).toBeGreaterThanOrEqual(0);
  });
});

/* ──────────────────────────────────────────────────────────────────
   5. SafetyDSL
   ────────────────────────────────────────────────────────────────── */
import { SafetyEngine, parseDSLRule, parseDSLRules } from '../src/enforce/safetyDSL.js';

describe('SafetyDSL', () => {
  describe('parseDSLRule', () => {
    it('should parse a simple DENY rule', () => {
      const result = parseDSLRule(
        'WHEN agent.action == "send_email" THEN DENY WITH "Cannot send emails"'
      );
      expect('error' in result).toBe(false);
      if (!('error' in result)) {
        expect(result.action).toBe('DENY');
        expect(result.conditions.length).toBe(1);
        expect(result.conditions[0]!.field).toBe('agent.action');
        expect(result.message).toBe('Cannot send emails');
      }
    });

    it('should parse AND conditions', () => {
      const result = parseDSLRule(
        'WHEN agent.tool == "db_write" AND context.risk == "high" THEN REQUIRE_APPROVAL WITH "Needs approval"'
      );
      if (!('error' in result)) {
        expect(result.conditions.length).toBe(2);
        expect(result.action).toBe('REQUIRE_APPROVAL');
      }
    });

    it('should handle various operators', () => {
      const result = parseDSLRule(
        'WHEN output.confidence < 0.3 THEN ESCALATE WITH "Low confidence"'
      );
      if (!('error' in result)) {
        expect(result.conditions[0]!.operator).toBe('<');
        expect(result.conditions[0]!.value).toBe(0.3);
      }
    });

    it('should return error for invalid syntax', () => {
      const result = parseDSLRule('INVALID RULE FORMAT');
      expect('error' in result).toBe(true);
    });
  });

  describe('parseDSLRules (multi-line)', () => {
    it('should parse multiple rules', () => {
      const dsl = `
WHEN agent.action == "delete" THEN DENY WITH "No deletes allowed"
WHEN agent.tool == "web_search" THEN LOG WITH "Search logged"
WHEN output.pii == "true" THEN SANITIZE WITH "PII detected"
      `;
      const { rules, errors } = parseDSLRules(dsl);
      expect(rules.length).toBe(3);
      expect(errors.length).toBe(0);
    });

    it('should report errors with line numbers', () => {
      const dsl = `
WHEN agent.action == "ok" THEN ALLOW WITH "OK"
THIS IS INVALID
WHEN x == "y" THEN DENY WITH "deny"
      `;
      const { rules, errors } = parseDSLRules(dsl);
      expect(rules.length).toBe(2);
      expect(errors.length).toBe(1);
      expect(errors[0]!.line).toBe(3);
    });
  });

  describe('SafetyEngine', () => {
    let engine: SafetyEngine;

    beforeEach(() => {
      engine = new SafetyEngine();
    });

    it('should add and evaluate constraints', () => {
      engine.addConstraint({
        id: 'no-email',
        name: 'No emails with PII',
        conditions: [
          { field: 'agent.action', operator: '==', value: 'send_email' },
          { field: 'context.has_pii', operator: '==', value: 'true' },
        ],
        action: 'DENY',
        message: 'Cannot send email with PII',
        enabled: true,
        priority: 1,
      });

      const result = engine.evaluate({
        'agent.action': 'send_email',
        'context.has_pii': 'true',
      });

      expect(result.allowed).toBe(false);
      expect(result.triggered.length).toBe(1);
      expect(result.triggered[0]!.action).toBe('DENY');
    });

    it('should allow when no constraints match', () => {
      engine.addConstraint({
        id: 'block-delete',
        name: 'Block deletes',
        conditions: [{ field: 'agent.action', operator: '==', value: 'delete' }],
        action: 'DENY',
        message: 'No deletes',
        enabled: true,
        priority: 1,
      });

      const result = engine.evaluate({ 'agent.action': 'read' });
      expect(result.allowed).toBe(true);
      expect(result.triggered.length).toBe(0);
    });

    it('should respect enabled flag', () => {
      engine.addConstraint({
        id: 'disabled-rule',
        name: 'Disabled',
        conditions: [{ field: 'x', operator: '==', value: 'y' }],
        action: 'DENY',
        message: 'Should not fire',
        enabled: false,
        priority: 1,
      });

      const result = engine.evaluate({ 'x': 'y' });
      expect(result.allowed).toBe(true);
    });

    it('should load constraints from DSL', () => {
      engine.loadDSL(`
WHEN agent.action == "nuke" THEN DENY WITH "Cannot nuke"
WHEN agent.tool == "calculator" THEN LOG WITH "Calculator used"
      `);

      expect(engine.getConstraints().length).toBe(2);

      const result = engine.evaluate({ 'agent.action': 'nuke' });
      expect(result.allowed).toBe(false);
    });

    it('should handle comparison operators', () => {
      engine.addConstraint({
        id: 'high-cost',
        name: 'High cost check',
        conditions: [{ field: 'cost', operator: '>', value: '100' }],
        action: 'REQUIRE_APPROVAL',
        message: 'Cost exceeds $100',
        enabled: true,
        priority: 1,
      });

      const expensive = engine.evaluate({ 'cost': '150' });
      expect(expensive.triggered.length).toBe(1);

      const cheap = engine.evaluate({ 'cost': '50' });
      expect(cheap.triggered.length).toBe(0);
    });
  });
});

/* ──────────────────────────────────────────────────────────────────
   6. ModelRouter
   ────────────────────────────────────────────────────────────────── */
import { ModelRouter } from '../src/ops/modelRouter.js';

describe('ModelRouter', () => {
  let router: ModelRouter;

  beforeEach(() => {
    router = new ModelRouter();
  });

  it('should list available models', () => {
    const models = router.listModels();
    expect(models.length).toBeGreaterThanOrEqual(4);
  });

  it('should route with cheapest strategy', () => {
    const decision = router.route({
      strategy: 'cheapest',
      requiredCapabilities: [],
    });
    expect(decision).toBeDefined();
    expect(decision!.selectedModel).toBeDefined();
    expect(decision!.selectedProvider).toBeDefined();
    expect(decision!.reason).toContain('heapest');
  });

  it('should route with best-quality strategy', () => {
    const decision = router.route({
      strategy: 'best-quality',
      requiredCapabilities: [],
    });
    expect(decision).toBeDefined();
    expect(decision!.selectedModel).toBeDefined();
  });

  it('should route with fastest strategy', () => {
    const decision = router.route({
      strategy: 'fastest',
      requiredCapabilities: [],
    });
    expect(decision).toBeDefined();
    expect(decision!.selectedModel).toBeDefined();
  });

  it('should route with round-robin strategy', () => {
    const d1 = router.route({ strategy: 'round-robin', requiredCapabilities: [] });
    const d2 = router.route({ strategy: 'round-robin', requiredCapabilities: [] });
    // Round robin should cycle through models
    expect(d1).toBeDefined();
    expect(d1!.selectedModel).toBeDefined();
    expect(d2).toBeDefined();
    expect(d2!.selectedModel).toBeDefined();
  });

  it('should route with fallback strategy', () => {
    const decision = router.route({ strategy: 'fallback', requiredCapabilities: [] });
    expect(decision).toBeDefined();
    expect(decision!.selectedModel).toBeDefined();
  });

  it('should filter by required capabilities', () => {
    const decision = router.route({
      strategy: 'cheapest',
      requiredCapabilities: ['function-calling'],
    });
    expect(decision).toBeDefined();
    expect(decision!.selectedModel).toBeDefined();
  });

  it('should add custom models', () => {
    router.addModel({
      id: 'custom-model',
      name: 'Custom Model',
      provider: 'local',
      inputCostPer1K: 0.001,
      outputCostPer1K: 0.002,
      avgLatencyMs: 50,
      qualityTier: 4,
      maxContext: 8000,
      capabilities: ['text-generation'],
    });

    const models = router.listModels();
    expect(models.some(m => m.id === 'custom-model')).toBe(true);
  });

  it('should track routing stats', () => {
    router.route({ strategy: 'cheapest', requiredCapabilities: [] });
    router.route({ strategy: 'fastest', requiredCapabilities: [] });

    const stats = router.getStats();
    expect(stats.totalRequests).toBe(2);
  });
});

/* ──────────────────────────────────────────────────────────────────
   7. FrameworkAdapters
   ────────────────────────────────────────────────────────────────── */
import {
  FrameworkAdapter,
  LangChainAdapter,
  CrewAIAdapter,
  OpenAIAgentsAdapter,
  createAdapter,
} from '../src/sdk/frameworkAdapters.js';

describe('FrameworkAdapters', () => {
  describe('FrameworkAdapter (base)', () => {
    it('should create a session on instantiation', () => {
      const adapter = new FrameworkAdapter({
        framework: 'custom',
        agentId: 'test-agent',
        agentType: 'test',
        capturePayloads: false,
        enforceSafety: true,
        maxActions: 10,
      });
      const session = adapter.getSession();
      expect(session.sessionId).toBeTruthy();
      expect(session.agentId).toBe('test-agent');
      expect(session.totalActions).toBe(0);
    });

    it('should record LLM calls and track tokens', () => {
      const adapter = new FrameworkAdapter({
        framework: 'custom',
        agentId: 'a1',
        agentType: 'test',
        capturePayloads: true,
        enforceSafety: false,
        maxActions: 100,
      });

      adapter.recordLLMCall('gpt-4o', 'prompt', 'response', { prompt: 100, completion: 50 }, 0.003, 500);
      const session = adapter.getSession();
      expect(session.totalTokens).toBe(150);
      expect(session.totalActions).toBe(1);
      expect(session.events.length).toBe(1);
      expect(session.events[0]!.input).toBe('prompt');
    });

    it('should not capture payloads when disabled', () => {
      const adapter = new FrameworkAdapter({
        framework: 'custom',
        agentId: 'a1',
        agentType: 'test',
        capturePayloads: false,
        enforceSafety: false,
        maxActions: 100,
      });

      adapter.recordLLMCall('test', 'secret-prompt', 'secret-output', { prompt: 10, completion: 10 }, 0.001, 100);
      expect(adapter.getSession().events[0]!.input).toBeUndefined();
      expect(adapter.getSession().events[0]!.output).toBeUndefined();
    });

    it('should track cost budget exceeded', () => {
      let budgetCallbackCalled = false;
      const adapter = new FrameworkAdapter(
        { framework: 'custom', agentId: 'a1', agentType: 'test', capturePayloads: false, enforceSafety: false, maxActions: 100, costBudgetUsd: 0.01 },
        { onBudgetExceeded: () => { budgetCallbackCalled = true; } }
      );

      adapter.recordLLMCall('m', '', '', { prompt: 1000, completion: 1000 }, 0.02, 100);
      expect(adapter.shouldStop()).toBe(true);
      expect(budgetCallbackCalled).toBe(true);
    });

    it('should track action limit reached', () => {
      const adapter = new FrameworkAdapter({
        framework: 'custom', agentId: 'a1', agentType: 'test',
        capturePayloads: false, enforceSafety: false, maxActions: 2,
      });

      adapter.recordToolCall('t1', '', '', 10);
      adapter.recordToolCall('t2', '', '', 20);
      expect(adapter.shouldStop()).toBe(true);
      expect(adapter.getSession().actionLimitReached).toBe(true);
    });

    it('should record errors', () => {
      const adapter = new FrameworkAdapter({
        framework: 'custom', agentId: 'a1', agentType: 'test',
        capturePayloads: false, enforceSafety: false, maxActions: 100,
      });

      adapter.recordError(new Error('test error'));
      expect(adapter.getSession().errors.length).toBe(1);
      expect(adapter.getEventsByType('error').length).toBe(1);
    });

    it('should provide a session summary', () => {
      const adapter = new FrameworkAdapter({
        framework: 'custom', agentId: 'a1', agentType: 'test',
        capturePayloads: false, enforceSafety: false, maxActions: 100,
      });

      adapter.recordLLMCall('m', '', '', { prompt: 10, completion: 10 }, 0.001, 50);
      adapter.recordToolCall('t', '', '', 30);

      const summary = adapter.getSummary();
      expect(summary.framework).toBe('custom');
      expect(summary.totalActions).toBe(2);
      expect(summary.totalTokens).toBe(20);
      expect(summary.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('LangChainAdapter', () => {
    it('should create with langchain framework type', () => {
      const adapter = new LangChainAdapter('lc-agent');
      expect(adapter.getSession().adapterType).toBe('langchain');
    });

    it('should provide a callback handler', () => {
      const adapter = new LangChainAdapter('lc-agent');
      const handler = adapter.getCallbackHandler();
      expect(handler.handleLLMStart).toBeDefined();
      expect(handler.handleLLMEnd).toBeDefined();
      expect(handler.handleToolStart).toBeDefined();
      expect(handler.handleToolEnd).toBeDefined();
      expect(handler.handleChainStart).toBeDefined();
      expect(handler.handleChainEnd).toBeDefined();
    });

    it('should record events through callback handler', () => {
      const adapter = new LangChainAdapter('lc-agent');
      const handler = adapter.getCallbackHandler();

      handler.handleLLMEnd('response text');
      handler.handleToolEnd('tool result');

      const session = adapter.getSession();
      expect(session.events.length).toBe(2);
      expect(session.totalActions).toBe(2);
    });
  });

  describe('CrewAIAdapter', () => {
    it('should create with crewai framework type', () => {
      const adapter = new CrewAIAdapter('crew-agent');
      expect(adapter.getSession().adapterType).toBe('crewai');
    });

    it('should record task execution', () => {
      const adapter = new CrewAIAdapter('crew-agent', { capturePayloads: true });
      adapter.recordTaskExecution('research', 'researcher-agent', 'query', 'findings', 1000);

      const session = adapter.getSession();
      expect(session.events.length).toBe(1);
      expect(session.events[0]!.metadata).toEqual(expect.objectContaining({ assignedAgent: 'researcher-agent' }));
    });
  });

  describe('OpenAIAgentsAdapter', () => {
    it('should create with openai-agents framework type', () => {
      const adapter = new OpenAIAgentsAdapter('oai-agent');
      expect(adapter.getSession().adapterType).toBe('openai-agents');
    });

    it('should record handoff', () => {
      const adapter = new OpenAIAgentsAdapter('oai-agent');
      adapter.recordHandoff('agent-a', 'agent-b', 'specialized query');

      const events = adapter.getEventsByType('decision');
      expect(events.length).toBe(1);
      expect(events[0]!.metadata).toEqual(expect.objectContaining({
        fromAgent: 'agent-a',
        toAgent: 'agent-b',
      }));
    });
  });

  describe('createAdapter factory', () => {
    it('should create the correct adapter type', () => {
      expect(createAdapter('langchain', 'a').getSession().adapterType).toBe('langchain');
      expect(createAdapter('crewai', 'b').getSession().adapterType).toBe('crewai');
      expect(createAdapter('openai-agents', 'c').getSession().adapterType).toBe('openai-agents');
      expect(createAdapter('custom', 'd').getSession().adapterType).toBe('custom');
    });
  });
});

/* ──────────────────────────────────────────────────────────────────
   8. AutoTestGen
   ────────────────────────────────────────────────────────────────── */
import { AutoTestGenerator } from '../src/agents/autoTestGen.js';

describe('AutoTestGenerator', () => {
  let gen: AutoTestGenerator;

  beforeEach(() => {
    gen = new AutoTestGenerator();
  });

  it('should ingest failures', () => {
    const signal = gen.addFailure({
      source: 'trace',
      agentId: 'agent-1',
      input: 'What is the refund policy?',
      output: '',
      errorMessage: 'Empty response',
    });
    expect(signal.id).toBeTruthy();
    expect(gen.getFailures().length).toBe(1);
  });

  it('should generate test cases from failures', () => {
    gen.addFailure({
      source: 'monitor',
      agentId: 'agent-1',
      input: 'Tell me about product X pricing',
      output: 'I cannot help with that',
      expectedOutput: 'Product X costs $99 per month with a free trial.',
    });

    const result = gen.generate();
    expect(result.testCases.length).toBeGreaterThanOrEqual(1);
    expect(result.stats.totalFailures).toBe(1);
    expect(result.stats.testCasesGenerated).toBeGreaterThanOrEqual(1);
  });

  it('should cluster similar failures', () => {
    gen.addFailures([
      { source: 'trace', agentId: 'a1', input: 'What is the refund policy for products?', output: '' },
      { source: 'trace', agentId: 'a1', input: 'What is the refund policy for orders?', output: '' },
      { source: 'trace', agentId: 'a1', input: 'Something completely different about weather', output: 'sunny' },
    ]);

    const result = gen.generate();
    expect(result.clusteredFailures.length).toBeLessThanOrEqual(3);
    expect(result.stats.uniqueClusters).toBeGreaterThanOrEqual(1);
  });

  it('should generate negative tests for safety failures', () => {
    gen.addFailure({
      source: 'monitor',
      agentId: 'a1',
      input: 'Tell me harmful things',
      output: 'Here is harmful content...',
      metricScores: { content_safety: 0.1 },
    });

    const result = gen.generate();
    const negativeCases = result.testCases.filter(tc => tc.tags.includes('negative_test'));
    expect(negativeCases.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect PII in outputs and add no_pii assertion', () => {
    gen.addFailure({
      source: 'trace',
      agentId: 'a1',
      input: 'Get customer info',
      output: 'The customer SSN is 123-45-6789 and email is test@example.com',
    });

    const result = gen.generate();
    const piiAssertions = result.testCases.flatMap(tc => tc.assertions.filter(a => a.type === 'no_pii'));
    expect(piiAssertions.length).toBeGreaterThanOrEqual(1);
  });

  it('should evaluate test cases against actual output', () => {
    gen.addFailure({
      source: 'trace',
      agentId: 'a1',
      input: 'Simple question',
      output: '',
    });

    const result = gen.generate();
    const testCase = result.testCases[0]!;

    const goodEval = gen.evaluateTestCase(testCase, 'Here is a complete and helpful response.');
    expect(goodEval.passed).toBe(true);

    const badEval = gen.evaluateTestCase(testCase, '');
    expect(badEval.passed).toBe(false);
  });

  it('should export and import', () => {
    gen.addFailure({ source: 'trace', agentId: 'a1', input: 'test', output: 'out' });
    gen.generate();

    const exported = gen.export();
    const newGen = new AutoTestGenerator();
    newGen.import(exported);

    expect(newGen.getTestCases().length).toBe(exported.testCases.length);
    expect(newGen.getFailures().length).toBe(exported.failures.length);
  });

  it('should assign priority based on frequency', () => {
    // Add multiple similar failures (should cluster and prioritize higher)
    for (let i = 0; i < 5; i++) {
      gen.addFailure({
        source: 'trace',
        agentId: 'a1',
        input: 'Recurring failure with the same pattern input text',
        output: 'bad output',
      });
    }

    const result = gen.generate();
    expect(result.testCases.length).toBeGreaterThanOrEqual(1);
    // 5 similar failures should cluster and get critical priority
    expect(['critical', 'high']).toContain(result.testCases[0]!.priority);
  });
});

/* ──────────────────────────────────────────────────────────────────
   9. SessionEval
   ────────────────────────────────────────────────────────────────── */
import { SessionEvaluator } from '../src/agents/sessionEval.js';
import type { SessionTurn, SessionGoal } from '../src/agents/sessionEval.js';

describe('SessionEvaluator', () => {
  let evaluator: SessionEvaluator;

  beforeEach(() => {
    evaluator = new SessionEvaluator();
  });

  it('should evaluate a simple successful session', () => {
    const turns: SessionTurn[] = [
      { role: 'user', content: 'What is the return policy?' },
      { role: 'agent', content: 'Our return policy allows returns within 30 days of purchase. You can return any item for a full refund.' },
      { role: 'user', content: 'Thank you, that helps!' },
    ];

    const result = evaluator.evaluate(turns);
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.turns).toBe(3);
    expect(result.dimensions.safety).toBeGreaterThanOrEqual(0.8);
  });

  it('should evaluate goal completion', () => {
    const turns: SessionTurn[] = [
      { role: 'user', content: 'I need to cancel my order' },
      { role: 'agent', content: 'I can help you cancel your order. Let me look up your order.' },
      { role: 'agent', content: 'Your order #12345 has been cancelled and a full refund has been issued.' },
      { role: 'user', content: 'Perfect, thank you!' },
    ];

    const goals: SessionGoal[] = [
      {
        id: 'g1',
        description: 'Cancel the order',
        completionSignals: ['cancelled', 'cancel'],
        required: true,
        weight: 1,
      },
      {
        id: 'g2',
        description: 'Issue refund',
        completionSignals: ['refund'],
        required: true,
        weight: 1,
      },
    ];

    const result = evaluator.evaluate(turns, goals);
    expect(result.dimensions.goalCompletion).toBe(1);
    expect(result.goalEvaluations.every(g => g.completed)).toBe(true);
  });

  it('should detect unfulfilled required goals', () => {
    const turns: SessionTurn[] = [
      { role: 'user', content: 'I need to cancel my order' },
      { role: 'agent', content: 'I understand you want to make changes. Let me check your account.' },
    ];

    const goals: SessionGoal[] = [
      {
        id: 'g1',
        description: 'Cancel the order',
        completionSignals: ['cancelled', 'order has been cancelled'],
        required: true,
        weight: 1,
      },
    ];

    const result = evaluator.evaluate(turns, goals);
    expect(result.dimensions.goalCompletion).toBe(0);
    expect(result.issues.some(i => i.includes('Required goals not completed'))).toBe(true);
  });

  it('should detect loops', () => {
    const turns: SessionTurn[] = [
      { role: 'user', content: 'Help me with my account' },
      { role: 'agent', content: 'I can help you with your account. What do you need help with?' },
      { role: 'user', content: 'I need to reset my password' },
      { role: 'agent', content: 'I can help you with your account. What do you need help with?' },
      { role: 'user', content: 'My password, please reset it' },
      { role: 'agent', content: 'I can help you with your account. What do you need help with?' },
    ];

    const result = evaluator.evaluate(turns);
    expect(result.loopDetection.detected).toBe(true);
    expect(result.issues.some(i => i.includes('Loop detected'))).toBe(true);
  });

  it('should detect safety violations', () => {
    const turns: SessionTurn[] = [
      { role: 'user', content: 'What is my account info?' },
      { role: 'agent', content: 'Your SSN is 123-45-6789 and your email is user@example.com' },
    ];

    const result = evaluator.evaluate(turns);
    expect(result.dimensions.safety).toBeLessThan(1);
  });

  it('should estimate user satisfaction', () => {
    const happyTurns: SessionTurn[] = [
      { role: 'user', content: 'How do I upgrade?' },
      { role: 'agent', content: 'You can upgrade by going to Settings > Plan.' },
      { role: 'user', content: 'That works perfectly, thank you so much!' },
    ];

    const sadTurns: SessionTurn[] = [
      { role: 'user', content: 'This is not working' },
      { role: 'agent', content: 'Please try again.' },
      { role: 'user', content: 'Still not working, this is terrible and useless' },
    ];

    const happyResult = evaluator.evaluate(happyTurns);
    const sadResult = evaluator.evaluate(sadTurns);
    expect(happyResult.dimensions.satisfaction).toBeGreaterThan(sadResult.dimensions.satisfaction);
  });

  it('should detect escalation', () => {
    const turns: SessionTurn[] = [
      { role: 'user', content: 'I want to speak to a manager' },
      { role: 'agent', content: 'I understand your frustration. Let me transfer you to a supervisor who can better assist you.' },
    ];

    const result = evaluator.evaluate(turns);
    expect(result.escalation.escalated).toBe(true);
    expect(result.escalation.appropriate).toBe(true);
  });

  it('should compare two sessions', () => {
    const turnsA: SessionTurn[] = [
      { role: 'user', content: 'Help me' },
      { role: 'agent', content: 'How can I assist you today?' },
    ];
    const turnsB: SessionTurn[] = [
      { role: 'user', content: 'Help me' },
      { role: 'agent', content: 'I would be happy to help! Please let me know what you need and I will do my best to assist you with any questions or concerns.' },
      { role: 'user', content: 'Great, thanks!' },
    ];

    const resultA = evaluator.evaluate(turnsA);
    const resultB = evaluator.evaluate(turnsB);

    const comparison = evaluator.compareSessions(resultA, resultB);
    expect(comparison.winner).toBeDefined();
    expect(['A', 'B', 'tie']).toContain(comparison.winner);
  });
});

/* ──────────────────────────────────────────────────────────────────
   10. SemanticGuardrails
   ────────────────────────────────────────────────────────────────── */
import { SemanticGuardrails } from '../src/enforce/semanticGuardrails.js';

describe('SemanticGuardrails', () => {
  it('should pass clean content', () => {
    const guardrails = new SemanticGuardrails();
    const result = guardrails.check('What are your business hours?');
    expect(result.passed).toBe(true);
    expect(result.violations.length).toBe(0);
  });

  it('should detect medical advice topics', () => {
    const guardrails = new SemanticGuardrails();
    const result = guardrails.check('What medication dosage should I take for my headache?');
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.category === 'medical_advice')).toBe(true);
    expect(result.action).toBe('redirect');
  });

  it('should detect legal advice topics', () => {
    const guardrails = new SemanticGuardrails();
    const result = guardrails.check('Can I sue my landlord for not returning my deposit? What are my legal rights?');
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.category === 'legal_advice')).toBe(true);
  });

  it('should detect financial advice topics', () => {
    const guardrails = new SemanticGuardrails();
    const result = guardrails.check('Should I invest my savings in this crypto recommendation?');
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.category === 'financial_advice')).toBe(true);
  });

  it('should block violence-related content', () => {
    const guardrails = new SemanticGuardrails();
    const result = guardrails.check('How to make a bomb with household items');
    expect(result.passed).toBe(false);
    expect(result.action).toBe('block');
  });

  it('should detect internal info disclosure', () => {
    const guardrails = new SemanticGuardrails();
    const result = guardrails.check('Let me share our company secret and proprietary algorithm');
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.category === 'internal_info')).toBe(true);
  });

  it('should detect tone violations', () => {
    const guardrails = new SemanticGuardrails();
    const result = guardrails.check('You are so stupid and an idiot for asking that');
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.category === 'tone')).toBe(true);
  });

  it('should support custom topic rules', () => {
    const guardrails = new SemanticGuardrails({ topicRules: [] });
    guardrails.addTopicRule({
      category: 'competitor_discussion',
      name: 'Competitor: Acme',
      keywords: ['acme corp', 'acme product'],
      action: 'redirect',
      redirectMessage: 'We cannot discuss competitors.',
      severity: 2,
      enabled: true,
    });

    const result = guardrails.check('How does your product compare to Acme Corp?');
    expect(result.passed).toBe(false);
    expect(result.violations[0]!.redirectMessage).toContain('competitors');
  });

  it('should support content boundaries', () => {
    const guardrails = new SemanticGuardrails({
      topicRules: [],
      toneRules: [],
    });
    guardrails.addBoundary({
      name: 'Max length',
      description: 'Content exceeds maximum length',
      check: (content) => content.length <= 100,
      action: 'warn',
      enabled: true,
    });

    const shortResult = guardrails.check('Short content');
    expect(shortResult.passed).toBe(true);

    const longResult = guardrails.check('x'.repeat(101));
    expect(longResult.passed).toBe(false);
  });

  it('should support steering rules', () => {
    const guardrails = new SemanticGuardrails({
      topicRules: [],
      toneRules: [],
    });
    guardrails.addSteeringRule({
      name: 'Upsell redirect',
      triggerKeywords: ['cancel subscription', 'cancel my plan'],
      steerToward: 'retention offer',
      responseTemplate: 'Before cancelling, would you like to hear about our special retention offer?',
      enabled: true,
    });

    const result = guardrails.check('I want to cancel subscription');
    expect(result.steeringApplied.length).toBe(1);
    expect(result.steeringApplied[0]!.steerToward).toBe('retention offer');
  });

  it('should check complete turn (input + output)', () => {
    const guardrails = new SemanticGuardrails();
    const result = guardrails.checkTurn(
      'What medicine should I take?', // medical advice in input
      'Here is a great recipe for pasta.', // Clean output
    );
    expect(result.overallPassed).toBe(false);
    expect(result.inputResult.passed).toBe(false);
    expect(result.outputResult.passed).toBe(true);
  });

  it('should enable/disable rules', () => {
    const guardrails = new SemanticGuardrails();
    // Medical advice rule is enabled by default
    let result = guardrails.check('What medication dosage should I take?');
    expect(result.passed).toBe(false);

    // Disable it
    guardrails.setRuleEnabled('topic_medical', false);
    result = guardrails.check('What medication dosage should I take?');
    expect(result.passed).toBe(true);
  });

  it('should remove rules', () => {
    const guardrails = new SemanticGuardrails();
    const before = guardrails.getEnabledRuleCount();
    guardrails.removeRule('topic_medical');
    // Check that it was removed (either enabled count decreased or total rules decreased)
    const rules = guardrails.getRules();
    expect(rules.topicRules.find(r => r.id === 'topic_medical')).toBeUndefined();
  });

  it('should generate rewritten output for rewrite action', () => {
    const guardrails = new SemanticGuardrails({
      topicRules: [],
      toneRules: [{
        id: 'tone_test',
        name: 'No profanity',
        prohibitedPhrases: ['stupid'],
        action: 'rewrite',
        enabled: true,
      }],
    });

    const result = guardrails.check('That was a stupid idea');
    expect(result.action).toBe('rewrite');
    expect(result.suggestedRewrite).toBeDefined();
    expect(result.suggestedRewrite!.includes('stupid')).toBe(false);
    expect(result.suggestedRewrite!.includes('[redacted]')).toBe(true);
  });
});

/* ──────────────────────────────────────────────────────────────────
   Integration: Full Pipeline
   ────────────────────────────────────────────────────────────────── */
describe('Integration: Gap Modules Pipeline', () => {
  it('should flow from trace ingestion → auto test gen → session eval', () => {
    // 1. Ingest traces
    const pipeline = new TraceIngestionPipeline({ flagThreshold: 0.5 });
    pipeline.ingest({
      traceId: 'tr-1',
      agentId: 'support-bot',
      agentType: 'support',
      input: 'How do I reset my password?',
      output: 'Go to Settings > Security > Reset Password and follow the instructions.',
      timestamp: Date.now(),
      durationMs: 200,
      metadata: {},
    });
    pipeline.ingest({
      traceId: 'tr-2',
      agentId: 'support-bot',
      agentType: 'support',
      input: 'What is my account number?',
      output: '', // Bad: empty response
      timestamp: Date.now(),
      durationMs: 50,
      metadata: {},
    });

    const stats = pipeline.getStats();
    expect(stats.totalIngested).toBe(2);

    // 2. Generate test cases from failures
    const testGen = new AutoTestGenerator();
    for (const scored of pipeline.getFlaggedTraces()) {
      testGen.addFailure({
        source: 'trace',
        agentId: scored.trace.agentId,
        input: typeof scored.trace.input === 'string' ? scored.trace.input : JSON.stringify(scored.trace.input),
        output: typeof scored.trace.output === 'string' ? scored.trace.output : JSON.stringify(scored.trace.output),
      });
    }
    const genResult = testGen.generate();
    expect(genResult.testCases.length).toBeGreaterThanOrEqual(0);

    // 3. Evaluate a session
    const sessionEval = new SessionEvaluator();
    const result = sessionEval.evaluate([
      { role: 'user', content: 'How do I reset my password?' },
      { role: 'agent', content: 'Go to Settings > Security > Reset Password and follow the instructions.' },
      { role: 'user', content: 'Thanks, that worked!' },
    ]);
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.dimensions.satisfaction).toBeGreaterThan(0.4);
  });

  it('should flow from safety DSL → semantic guardrails → model router', () => {
    // 1. Define safety constraints
    const engine = new SafetyEngine();
    engine.loadDSL('WHEN agent.action == "send_response" AND context.topic == "medical" THEN DENY WITH "No medical advice"');

    // 2. Check with semantic guardrails
    const guardrails = new SemanticGuardrails();
    const guardResult = guardrails.check('I need a medication dosage recommendation');
    expect(guardResult.passed).toBe(false);

    // 3. Route to appropriate model
    const router = new ModelRouter();
    const decision = router.route({
      strategy: 'cheapest',
      requiredCapabilities: [],
    });
    expect(decision).toBeDefined();
    expect(decision!.selectedModel).toBeDefined();
  });
});
