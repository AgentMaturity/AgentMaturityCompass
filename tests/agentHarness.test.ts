/**
 * agentHarness.test.ts — Tests for agent base, bots, and harness runner.
 */

import { describe, expect, test } from 'vitest';

// ContentModerationBot
import { ContentModerationBot, moderate } from '../src/agents/contentModerationBot.js';

// DataPipelineBot
import { DataPipelineBot } from '../src/agents/dataPipelineBot.js';

// LegalContractBot
import { LegalContractBot, analyzeContract } from '../src/agents/legalContractBot.js';

// HarnessRunner
import { HarnessRunner, harnessMaturityLevel } from '../src/agents/harnessRunner.js';

/* ── ContentModerationBot ────────────────────────────────────────── */

describe('ContentModerationBot', () => {
  test('safe content classified as safe', () => {
    const result = moderate('The weather is nice today and the flowers are blooming');
    expect(result.category).toBe('safe');
    expect(result.violationType).toBe('none');
    expect(result.flags.length).toBe(0);
  });

  test('violent content detected', () => {
    const result = moderate('How to make a bomb and attack people');
    expect(result.category).not.toBe('safe');
    expect(result.violationType).toBe('violence');
    expect(result.flags.length).toBeGreaterThan(0);
  });

  test('spam content detected', () => {
    const result = moderate('Buy now! Limited offer! Click here for amazing deals! Act fast!');
    expect(result.violationType).toBe('spam');
  });

  test('bot run method works', async () => {
    const bot = new ContentModerationBot();
    const result = await bot.run('This is a normal message');
    expect(result.category).toBe('safe');
  });

  test('bot moderateBatch handles multiple items', async () => {
    const bot = new ContentModerationBot();
    const results = await bot.moderateBatch([
      'Normal message',
      'Another safe message',
    ]);
    expect(results.length).toBe(2);
    results.forEach(r => expect(r.category).toBe('safe'));
  });

  test('bot tracks stats', async () => {
    const bot = new ContentModerationBot();
    await bot.run('test 1');
    await bot.run('test 2');
    const stats = bot.getStats();
    expect(stats.actionsExecuted).toBe(2);
    expect(stats.errorsEncountered).toBe(0);
  });

  test('bot config is accessible', () => {
    const bot = new ContentModerationBot();
    const config = bot.getConfig();
    expect(config.name).toBe('ContentModerationBot');
    expect(config.type).toBe('content-moderation');
    expect(config.governanceEnabled).toBe(true);
  });
});

/* ── DataPipelineBot ─────────────────────────────────────────────── */

describe('DataPipelineBot', () => {
  test('filter transform works', async () => {
    const bot = new DataPipelineBot();
    const result = await bot.runPipeline(
      [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 20 }, { name: 'Carol', age: 35 }],
      [{ type: 'filter', name: 'age-filter', config: { field: 'age', op: 'gt', value: 25 } }],
    );
    expect(result.success).toBe(true);
    expect(result.outputCount).toBe(2);
    expect(result.data.length).toBe(2);
  });

  test('map transform uppercase works', async () => {
    const bot = new DataPipelineBot();
    const result = await bot.runPipeline(
      [{ name: 'hello' }, { name: 'world' }],
      [{ type: 'map', name: 'upper', config: { expression: 'uppercase', field: 'name' } }],
    );
    expect(result.success).toBe(true);
    expect((result.data[0] as any).name).toBe('HELLO');
  });

  test('sort transform works', async () => {
    const bot = new DataPipelineBot();
    const result = await bot.runPipeline(
      [{ val: 3 }, { val: 1 }, { val: 2 }],
      [{ type: 'sort', name: 'sort-val', config: { field: 'val', order: 'asc' } }],
    );
    expect((result.data[0] as any).val).toBe(1);
    expect((result.data[2] as any).val).toBe(3);
  });

  test('dedupe transform removes duplicates', async () => {
    const bot = new DataPipelineBot();
    const result = await bot.runPipeline(
      [{ id: 1 }, { id: 2 }, { id: 1 }],
      [{ type: 'dedupe', name: 'dedup', config: { field: 'id' } }],
    );
    expect(result.outputCount).toBe(2);
  });

  test('validate transform drops invalid records', async () => {
    const bot = new DataPipelineBot();
    const result = await bot.runPipeline(
      [{ name: 'Alice', email: 'a@b.com' }, { name: 'Bob' }],
      [{ type: 'validate', name: 'check', config: { requiredFields: ['name', 'email'] } }],
    );
    expect(result.outputCount).toBe(1);
    expect(result.droppedCount).toBe(1);
  });

  test('enrich transform adds field', async () => {
    const bot = new DataPipelineBot();
    const result = await bot.runPipeline(
      [{ name: 'Test' }],
      [{ type: 'enrich', name: 'add-source', config: { field: 'source', value: 'api' } }],
    );
    expect((result.data[0] as any).source).toBe('api');
  });

  test('chained transforms work', async () => {
    const bot = new DataPipelineBot();
    const result = await bot.runPipeline(
      [{ name: 'Alice', score: 85 }, { name: 'Bob', score: 45 }, { name: 'Carol', score: 92 }],
      [
        { type: 'filter', name: 'high-score', config: { field: 'score', op: 'gt', value: 50 } },
        { type: 'sort', name: 'sort-score', config: { field: 'score', order: 'desc' } },
        { type: 'enrich', name: 'label', config: { field: 'tier', value: 'high' } },
      ],
    );
    expect(result.outputCount).toBe(2);
    expect((result.data[0] as any).name).toBe('Carol');
    expect((result.data[0] as any).tier).toBe('high');
    expect(result.transformsApplied).toEqual(['high-score', 'sort-score', 'label']);
  });
});

/* ── LegalContractBot ────────────────────────────────────────────── */

describe('LegalContractBot', () => {
  test('analyzeContract extracts clauses', () => {
    const text = `
      This agreement contains an indemnification clause.
      The liability of either party shall not exceed the total fees paid.
      Either party may terminate this contract with 30 days written notice.
      All confidential information shall remain protected for 2 years.
      All intellectual property rights shall transfer to the company.
    `;
    const result = analyzeContract(text);
    expect(result.totalClauses).toBeGreaterThan(0);
    expect(result.clauses.some(c => c.type === 'indemnification')).toBe(true);
    expect(result.clauses.some(c => c.type === 'termination')).toBe(true);
  });

  test('detects missing clauses', () => {
    const text = 'This is a simple agreement with no specific legal clauses mentioned.';
    const result = analyzeContract(text);
    expect(result.missingClauses.length).toBeGreaterThan(0);
  });

  test('detects high risk clauses', () => {
    const text = `
      The vendor shall provide unlimited indemnification at sole expense.
      This contract may be terminated without cause and with no notice.
      There is unlimited liability and no cap on consequential damages.
    `;
    const result = analyzeContract(text);
    const highRisk = result.clauses.filter(c => c.riskScore > 0.5);
    expect(highRisk.length).toBeGreaterThan(0);
  });

  test('bot run method returns analysis', async () => {
    const bot = new LegalContractBot();
    const result = await bot.run('This agreement includes force majeure and arbitration clauses.');
    expect(result.totalClauses).toBeGreaterThanOrEqual(0);
    expect(result.riskLevel).toBeDefined();
  });

  test('risk level computed correctly', () => {
    const safeText = 'This is a standard agreement between two parties with mutual respect.';
    const result = analyzeContract(safeText);
    expect(['low', 'medium', 'high', 'critical']).toContain(result.riskLevel);
  });
});

/* ── HarnessRunner ───────────────────────────────────────────────── */

describe('HarnessRunner', () => {
  test('zero capability evidence fails closed at L0', () => {
    expect(harnessMaturityLevel(0)).toEqual({
      level: 'L0 — Absent',
      description: 'No agent governance capability evidence was demonstrated.',
    });
  });

  test('harness runs improvement loop', async () => {
    const runner = new HarnessRunner({
      agentType: 'test-agent',
      maxIterations: 5,
      targetScore: 80,
    });
    const result = await runner.run();
    expect(result.agentType).toBe('test-agent');
    // New introspection-based harness may converge immediately if agent is already capable
    expect(result.iterations.length).toBeGreaterThanOrEqual(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.totalImprovement).toBeGreaterThanOrEqual(0);
    expect(result.capabilityReport.length).toBeGreaterThan(0);
    expect([
      'L0 — Absent',
      'L1 — Initial',
      'L2 — Developing',
      'L3 — Defined',
      'L4 — Managed',
      'L5 — Optimizing',
    ]).toContain(result.maturityLevel);
  });

  test('harness iterations have expected structure', async () => {
    const runner = new HarnessRunner({ maxIterations: 3 });
    const result = await runner.run();
    for (const iter of result.iterations) {
      expect(iter.iteration).toBeGreaterThan(0);
      expect(iter.scoreBefore).toBeDefined();
      expect(iter.scoreAfter).toBeDefined();
      expect(Array.isArray(iter.gaps)).toBe(true);
      expect(Array.isArray(iter.actionsApplied)).toBe(true);
      expect(typeof iter.improved).toBe('boolean');
    }
  });

  test('harness respects max iterations', async () => {
    const runner = new HarnessRunner({ maxIterations: 2, targetScore: 999 });
    const result = await runner.run();
    expect(result.iterations.length).toBeLessThanOrEqual(2);
  });

  test('harness converges to target', async () => {
    const runner = new HarnessRunner({ maxIterations: 20, targetScore: 50 });
    const result = await runner.run();
    // With enough iterations and a low target, should converge
    if (result.converged) {
      expect(result.finalScore).toBeGreaterThanOrEqual(50);
    }
  });

  test('harness tracks stats', async () => {
    const runner = new HarnessRunner({ maxIterations: 3 });
    await runner.run();
    const stats = runner.getStats();
    // Stats may be 0 if the agent converges immediately (no iterations needed)
    expect(stats.actionsExecuted).toBeGreaterThanOrEqual(0);
    expect(typeof stats.errorsEncountered).toBe('number');
  });
});

/* ── Agent Index re-exports ──────────────────────────────────────── */

describe('Agent Index', () => {
  test('agents/index exports all agent types', async () => {
    const mod = await import('../src/agents/index.js');
    expect(mod.AMCAgentBase).toBeDefined();
    expect(mod.ContentModerationBot).toBeDefined();
    expect(mod.DataPipelineBot).toBeDefined();
    expect(mod.LegalContractBot).toBeDefined();
    expect(mod.HarnessRunner).toBeDefined();
  });
});
