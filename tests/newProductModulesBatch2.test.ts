import { describe, it, expect, vi } from 'vitest';

/* ── Python-ported modules ──────────────────────────────────────────── */

import { ChunkingPipeline, getChunkingPipeline } from '../src/product/chunkingPipeline.js';
import { APIWrapperGenerator, getApiWrapperGenerator } from '../src/product/apiWrapperGenerator.js';
import { AutoDocGenerator, getAutoDocGenerator } from '../src/product/autodocGenerator.js';
import { ClarificationOptimizer, getClarificationOptimizer } from '../src/product/clarificationOptimizer.js';

/* ── Enhanced stubs (batch 3) ───────────────────────────────────────── */

import { RolloutManager, checkRollout } from '../src/product/rolloutManager.js';
import { TaskSpecBuilder, createTaskSpec } from '../src/product/taskSpecBuilder.js';
import { ToolChainBuilder, buildToolChain } from '../src/product/toolChainBuilder.js';
import { ToolParallelizer, parallelizeTools } from '../src/product/toolParallelizer.js';
import { ApprovalManager, createApproval } from '../src/product/approvalWorkflow.js';
import { ContextPackBuilder, createContextPack } from '../src/product/contextPackBuilder.js';
import { DevSandboxManager, createDevSandbox, getDevSandboxManager } from '../src/product/devSandbox.js';
import { LongTermMemory, getLongTermMemory } from '../src/product/longTermMemory.js';

/* ── ChunkingPipeline ───────────────────────────────────────────────── */

describe('ChunkingPipeline', () => {
  it('chunks text by paragraph', () => {
    const pipeline = new ChunkingPipeline();
    const result = pipeline.chunk({
      docId: 'doc-1',
      content: 'This is the first paragraph with enough content to pass the minimum token threshold.\n\nThis is the second paragraph which also has sufficient text to be kept by the filter.\n\nThis is the third paragraph containing more than enough words to make it through.',
      strategy: 'paragraph',
      minChunkTokens: 1,
    });
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    expect(result.totalChunks).toBe(result.chunks.length);
  });

  it('chunks text by sentence', () => {
    const pipeline = new ChunkingPipeline();
    const result = pipeline.chunk({
      docId: 'doc-2',
      content: 'This is a complete first sentence with enough words to exceed the minimum token threshold. This is the second sentence that also contains sufficient text. And here is the third sentence that makes our test valid.',
      strategy: 'sentence',
      minChunkTokens: 1,
    });
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
  });

  it('chunks text by heading', () => {
    const pipeline = new ChunkingPipeline();
    const result = pipeline.chunk({
      docId: 'doc-3',
      content: '# Title\nThis section contains enough content to pass the minimum token threshold for chunking.\n## Section\nThis second section also has enough text to be included in the output.',
      strategy: 'heading',
      minChunkTokens: 1,
    });
    expect(result.chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('fixed-window chunking respects maxChunkTokens', () => {
    const pipeline = new ChunkingPipeline();
    // 500 chars ≈ 125 tokens at 4 chars/token; maxChunkTokens=25 → ~5 chunks
    const result = pipeline.chunk({
      docId: 'doc-4',
      content: 'word '.repeat(100), // 500 chars, ~100 words
      strategy: 'fixed',
      maxChunkTokens: 25,
      overlapTokens: 0,
    });
    expect(result.chunks.length).toBeGreaterThanOrEqual(3);
  });

  it('singleton works', () => {
    const a = getChunkingPipeline();
    const b = getChunkingPipeline();
    expect(a).toBe(b);
  });
});

/* ── APIWrapperGenerator ────────────────────────────────────────────── */

describe('APIWrapperGenerator', () => {
  const openApiSpec = JSON.stringify({
    openapi: '3.0.0',
    info: { title: 'Pet Store', version: '1.0.0' },
    servers: [{ url: 'https://api.petstore.io' }],
    paths: {
      '/pets': {
        get: {
          operationId: 'listPets',
          summary: 'List all pets',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer' }, required: false, description: 'Max items' },
          ],
          responses: { '200': { content: { 'application/json': { schema: { type: 'array' } } } } },
        },
        post: {
          operationId: 'createPet',
          summary: 'Create a pet',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { name: { type: 'string', description: 'Pet name' } },
                  required: ['name'],
                },
              },
            },
          },
          responses: { '201': {} },
        },
      },
    },
  });

  it('parses OpenAPI spec and generates endpoints', () => {
    const gen = new APIWrapperGenerator();
    const result = gen.generate({ specContent: openApiSpec });
    expect(result.endpointCount).toBe(2);
    expect(result.wrapper.endpoints[0]!.method).toBe('GET');
    expect(result.wrapper.endpoints[1]!.method).toBe('POST');
    expect(result.wrapper.generatedCode).toContain('class');
  });

  it('generates TypeScript code with typed methods', () => {
    const gen = new APIWrapperGenerator();
    const result = gen.generate({ specContent: openApiSpec, includeTypeHints: true });
    expect(result.wrapper.generatedCode).toContain('async listpets');
    expect(result.wrapper.generatedCode).toContain('Promise<Record<string, unknown>>');
  });

  it('handles invalid JSON gracefully', () => {
    const gen = new APIWrapperGenerator();
    const result = gen.generate({ specContent: 'not json' });
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('Could not parse');
  });

  it('tracks history', () => {
    const gen = new APIWrapperGenerator();
    gen.generate({ specContent: openApiSpec });
    gen.generate({ specContent: openApiSpec, toolName: 'second_tool' });
    expect(gen.getHistory().length).toBe(2);
  });

  it('singleton works', () => {
    expect(getApiWrapperGenerator()).toBe(getApiWrapperGenerator());
  });
});

/* ── AutoDocGenerator ───────────────────────────────────────────────── */

describe('AutoDocGenerator', () => {
  const request = {
    workflowName: 'Data Pipeline',
    workflowDescription: 'Processes data from source to destination.',
    steps: [
      { name: 'Extract', description: 'Pull from source', inputs: ['source_url'], outputs: ['raw_data'], tools: ['http'] },
      { name: 'Transform', description: 'Clean and normalize', inputs: ['raw_data'], outputs: ['clean_data'], tools: [] },
    ],
    tests: [
      { name: 'Basic extraction', description: 'Tests basic extract', inputs: { url: 'http://test.com' }, expectedOutputs: { status: 'ok' }, testType: 'unit' },
    ],
    version: '2.0.0',
    author: 'TestBot',
    tags: ['etl', 'pipeline'],
    knownLimitations: ['No streaming support'],
  };

  it('generates markdown documentation', () => {
    const gen = new AutoDocGenerator();
    const result = gen.generate({ ...request, outputFormat: 'markdown' });
    expect(result.doc.format).toBe('markdown');
    expect(result.doc.content).toContain('# Data Pipeline');
    expect(result.doc.content).toContain('## Workflow Steps');
    expect(result.doc.content).toContain('Extract');
    expect(result.doc.sections).toContain('Overview');
  });

  it('generates HTML documentation', () => {
    const gen = new AutoDocGenerator();
    const result = gen.generate({ ...request, outputFormat: 'html' });
    expect(result.doc.format).toBe('html');
    expect(result.doc.content).toContain('<h1>');
    expect(result.doc.content).toContain('</html>');
  });

  it('generates RST documentation', () => {
    const gen = new AutoDocGenerator();
    const result = gen.generate({ ...request, outputFormat: 'rst' });
    expect(result.doc.format).toBe('rst');
    expect(result.doc.content).toContain('.. list-table::');
  });

  it('falls back to markdown for unknown format', () => {
    const gen = new AutoDocGenerator();
    const result = gen.generate({ ...request, outputFormat: 'docx' });
    expect(result.doc.format).toBe('markdown');
    expect(result.warnings.some(w => w.includes('Unknown'))).toBe(true);
  });

  it('warns when no steps provided', () => {
    const gen = new AutoDocGenerator();
    const result = gen.generate({ workflowName: 'Empty', workflowDescription: 'No steps' });
    expect(result.warnings.some(w => w.includes('No workflow steps'))).toBe(true);
  });

  it('tracks history', () => {
    const gen = new AutoDocGenerator();
    gen.generate(request);
    const history = gen.getHistory();
    expect(history.length).toBe(1);
    expect(history[0]!.workflowName).toBe('Data Pipeline');
  });

  it('includes changelog when requested', () => {
    const gen = new AutoDocGenerator();
    const result = gen.generate({ ...request, includeChangelog: true });
    expect(result.doc.sections).toContain('Changelog');
    expect(result.doc.content).toContain('Initial release');
  });

  it('singleton works', () => {
    expect(getAutoDocGenerator()).toBe(getAutoDocGenerator());
  });
});

/* ── ClarificationOptimizer ─────────────────────────────────────────── */

describe('ClarificationOptimizer', () => {
  it('selects highest-information questions', () => {
    const optimizer = new ClarificationOptimizer();
    const result = optimizer.optimize({
      candidates: [
        'Who is the project owner?',
        'What format should the output be?',
        'When is the deadline?',
        'How should we approach this?',
        'What constraints apply?',
      ],
    });
    expect(result.selected.length).toBeLessThanOrEqual(3);
    expect(result.selected.length).toBeGreaterThanOrEqual(1);
    expect(result.sessionId).toBeDefined();
  });

  it('deduplicates questions', () => {
    const optimizer = new ClarificationOptimizer();
    const result = optimizer.optimize({
      candidates: [
        'Who is the owner?',
        'who is the owner?',
        'Who is the Owner?',
      ],
    });
    expect(result.selected.length).toBe(1);
  });

  it('skips questions already answered by context', () => {
    const optimizer = new ClarificationOptimizer();
    const result = optimizer.optimize({
      candidates: [
        'What is the project deadline?',
        'Who is the responsible team?',
      ],
      context: {
        deadline: '2024-12-31',
        project: 'The project deadline is December 31st 2024',
      },
    });
    // The deadline question should be skipped or scored lower
    const deadlineQ = result.selected.find(q => q.text.includes('deadline'));
    const teamQ = result.selected.find(q => q.text.includes('team'));
    if (deadlineQ && teamQ) {
      expect(teamQ.score).toBeGreaterThanOrEqual(deadlineQ.score);
    }
  });

  it('records resolutions', () => {
    const optimizer = new ClarificationOptimizer();
    const session = optimizer.optimize({
      candidates: ['What is the budget?'],
    });
    const resolution = optimizer.recordResolution(session.sessionId, 'What is the budget?', '$10,000');
    expect(resolution.answer).toBe('$10,000');
    expect(optimizer.listResolutions(session.sessionId).length).toBe(1);
  });

  it('retrieves session by ID', () => {
    const optimizer = new ClarificationOptimizer();
    const result = optimizer.optimize({ candidates: ['Test?'], taskSummary: 'My task' });
    const session = optimizer.getSession(result.sessionId);
    expect(session).toBeDefined();
    expect(session!.taskSummary).toBe('My task');
  });

  it('lists sessions with tenant filter', () => {
    const optimizer = new ClarificationOptimizer();
    optimizer.optimize({ candidates: ['Q1?'], tenantId: 'tenant-a' });
    optimizer.optimize({ candidates: ['Q2?'], tenantId: 'tenant-b' });
    const aOnly = optimizer.listSessions('tenant-a');
    expect(aOnly.length).toBe(1);
    expect(aOnly[0]!.tenantId).toBe('tenant-a');
  });

  it('singleton works', () => {
    expect(getClarificationOptimizer()).toBe(getClarificationOptimizer());
  });
});

/* ── RolloutManager ─────────────────────────────────────────────────── */

describe('RolloutManager', () => {
  it('creates and checks rollout', () => {
    const rm = new RolloutManager();
    rm.createRollout('feat-1', 100);
    const decision = rm.checkRollout('feat-1', 'user-1');
    expect(decision.feature).toBe('feat-1');
    expect(decision.enabled).toBe(true);
  });

  it('deterministic user bucketing', () => {
    const rm = new RolloutManager();
    rm.createRollout('feat-2', 50);
    const d1 = rm.checkRollout('feat-2', 'user-x');
    const d2 = rm.checkRollout('feat-2', 'user-x');
    expect(d1.enabled).toBe(d2.enabled);
  });

  it('backward-compat checkRollout function', () => {
    const result = checkRollout('some-feature', 50);
    expect(result.feature).toBe('some-feature');
    expect(typeof result.enabled).toBe('boolean');
  });
});

/* ── TaskSpecBuilder ────────────────────────────────────────────────── */

describe('TaskSpecBuilder', () => {
  it('builds spec with fluent API', () => {
    const spec = new TaskSpecBuilder()
      .withDescription('Analyze data')
      .withConstraints(['max 10 items', 'no PII'])
      .withPriority(8)
      .build();
    expect(spec.description).toBe('Analyze data');
    expect(spec.constraints).toHaveLength(2);
    expect(spec.priority).toBe(8);
    expect(spec.specId).toBeDefined();
  });

  it('backward-compat createTaskSpec function', () => {
    const spec = createTaskSpec('Test task', ['c1']);
    expect(spec.description).toBe('Test task');
    expect(spec.constraints).toEqual(['c1']);
  });
});

/* ── ToolChainBuilder ───────────────────────────────────────────────── */

describe('ToolChainBuilder', () => {
  it('builds chain with validation', () => {
    const chain = new ToolChainBuilder()
      .addStep('search', 'search-tool')
      .addStep('summarize', 'summarize-tool')
      .withDependency('summarize', 'search')
      .build();
    expect(chain.tools).toEqual(['search-tool', 'summarize-tool']);
    expect(chain.validation.valid).toBe(true);
  });

  it('detects circular dependencies', () => {
    const builder = new ToolChainBuilder()
      .addStep('a', 'tool-a')
      .addStep('b', 'tool-b')
      .withDependency('a', 'b')
      .withDependency('b', 'a');
    const validation = builder.validate();
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.includes('ircular'))).toBe(true);
  });

  it('backward-compat buildToolChain function', () => {
    const chain = buildToolChain(['t1', 't2']);
    expect(chain.tools).toEqual(['t1', 't2']);
    expect(chain.chainId).toBeDefined();
  });
});

/* ── ToolParallelizer ───────────────────────────────────────────────── */

describe('ToolParallelizer', () => {
  it('runs tasks in parallel', async () => {
    const p = new ToolParallelizer();
    p.addTask('a', async () => 1);
    p.addTask('b', async () => 2);
    const result = await p.run();
    expect(result.results).toEqual([1, 2]);
    expect(result.totalMs).toBeGreaterThanOrEqual(0);
  });

  it('handles task errors', async () => {
    const p = new ToolParallelizer();
    p.addTask('fail', async () => { throw new Error('boom'); });
    const result = await p.run();
    expect(result.tasks[0]!.status).toBe('rejected');
    expect(result.tasks[0]!.error).toBe('boom');
  });

  it('backward-compat parallelizeTools function', async () => {
    const result = await parallelizeTools([
      async () => 'a',
      async () => 'b',
    ]);
    expect(result.results).toEqual(['a', 'b']);
  });
});

/* ── ApprovalManager ────────────────────────────────────────────────── */

describe('ApprovalManager', () => {
  it('creates and approves request', () => {
    const mgr = new ApprovalManager();
    const req = mgr.createRequest('deploy', 'alice');
    expect(req.status).toBe('pending');
    const approved = mgr.approve(req.requestId, 'bob');
    expect(approved.status).toBe('approved');
  });

  it('creates and denies request', () => {
    const mgr = new ApprovalManager();
    const req = mgr.createRequest('deploy', 'alice');
    const denied = mgr.deny(req.requestId, 'bob', 'Not ready');
    expect(denied.status).toBe('denied');
    expect(denied.reason).toBe('Not ready');
  });

  it('multi-stage chain approval', () => {
    const mgr = new ApprovalManager();
    const req = mgr.createRequest('deploy', 'alice', { stages: ['manager', 'director'] });
    expect(req.chain!.currentStage).toBe(0);
    const r1 = mgr.approve(req.requestId, 'manager');
    expect(r1.chain!.currentStage).toBe(1); // advanced to next stage
    expect(r1.status).toBe('pending'); // still pending
    const r2 = mgr.approve(req.requestId, 'director');
    expect(r2.status).toBe('approved'); // final stage
  });

  it('backward-compat createApproval function', () => {
    const req = createApproval('test');
    expect(req.status).toBe('pending');
    expect(req.requestId).toBeDefined();
  });
});

/* ── ContextPackBuilder ─────────────────────────────────────────────── */

describe('ContextPackBuilder', () => {
  it('builds pack with entries', () => {
    const pack = new ContextPackBuilder()
      .addEntry('key1', 'value1', 'source-a', 5)
      .addEntry('key2', 'value2', 'source-b', 3)
      .build();
    expect(pack.entries.key1).toBe('value1');
    expect(pack.items.length).toBe(2);
    expect(pack.totalTokens).toBeGreaterThan(0);
  });

  it('respects token budget', () => {
    const builder = new ContextPackBuilder()
      .addEntry('big', 'A'.repeat(400), 'src', 1)
      .addEntry('small', 'B'.repeat(20), 'src', 10);
    const pack = builder.build(10); // very small budget
    expect(pack.items.length).toBe(1);
    expect(pack.entries.small).toBe('B'.repeat(20)); // higher priority kept
  });

  it('prunes expired entries', () => {
    const builder = new ContextPackBuilder()
      .addEntry('expired', 'old', 'src')
      .setExpiry('expired', Date.now() - 1000)
      .addEntry('valid', 'new', 'src');
    builder.prune();
    const pack = builder.build();
    expect(pack.items.length).toBe(1);
    expect(pack.entries.valid).toBe('new');
  });

  it('backward-compat createContextPack function', () => {
    const pack = createContextPack({ a: 1, b: 2 });
    expect(pack.entries.a).toBe(1);
    expect(pack.packId).toBeDefined();
  });
});

/* ── DevSandboxManager ──────────────────────────────────────────────── */

describe('DevSandboxManager', () => {
  it('creates and runs code in sandbox', () => {
    const mgr = new DevSandboxManager();
    const sb = mgr.createDevSandbox({ language: 'typescript', timeout: 5000 });
    expect(sb.active).toBe(true);
    const result = mgr.runCode(sb.id, 'console.log("hello")');
    expect(result.output).toContain('typescript');
    expect(result.hasErrors).toBe(false);
  });

  it('creates and rolls back snapshots', () => {
    const mgr = new DevSandboxManager();
    const sb = mgr.createDevSandbox();
    mgr.setState(sb.id, 'counter', 1);
    const snapshot = mgr.createSnapshot(sb.id, 'v1');
    expect(snapshot).toBeDefined();
    mgr.setState(sb.id, 'counter', 99);
    expect(mgr.getState(sb.id)!.counter).toBe(99);
    mgr.rollbackToSnapshot(sb.id, snapshot!.snapshotId);
    expect(mgr.getState(sb.id)!.counter).toBe(1);
  });

  it('destroys sandbox', () => {
    const mgr = new DevSandboxManager();
    const sb = mgr.createDevSandbox();
    expect(mgr.destroySandbox(sb.id)).toBe(true);
    expect(mgr.inspectSandbox(sb.id)!.active).toBe(false);
  });

  it('backward-compat createDevSandbox function', () => {
    const session = createDevSandbox();
    expect(session.sessionId).toBeDefined();
    expect(session.active).toBe(true);
  });

  it('singleton works', () => {
    expect(getDevSandboxManager()).toBe(getDevSandboxManager());
  });
});

/* ── LongTermMemory (enhanced) ──────────────────────────────────────── */

describe('LongTermMemory (enhanced)', () => {
  it('stores and retrieves with namespaces', () => {
    const mem = new LongTermMemory();
    mem.set('key1', 'val1', { namespace: 'ns1' });
    mem.set('key1', 'val2', { namespace: 'ns2' });
    expect(mem.get('key1', 'ns1')!.value).toBe('val1');
    expect(mem.get('key1', 'ns2')!.value).toBe('val2');
  });

  it('backward-compat store_entry/retrieve', () => {
    const mem = new LongTermMemory();
    mem.store_entry('k', 'hello', { importance: 0.8, tags: ['test'] });
    const r = mem.retrieve('k');
    expect(r).toBeDefined();
    expect(r!.value).toBe('hello');
    expect(r!.importance).toBe(0.8);
  });

  it('supports TTL expiry', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-06-21T00:00:00.000Z'));
      const mem = new LongTermMemory();
      mem.set('temp', 'data', { ttlMs: 1 });
      expect(mem.has('temp')).toBe(true);
      vi.advanceTimersByTime(2);
      expect(mem.get('temp')).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('searches by tag', () => {
    const mem = new LongTermMemory();
    mem.set('a', 1, { tags: ['important'] });
    mem.set('b', 2, { tags: ['trivial'] });
    const results = mem.searchByTag('important');
    expect(results.totalMatches).toBe(1);
    expect(results.entries[0]!.key).toBe('a');
  });

  it('searches by keyword', () => {
    const mem = new LongTermMemory();
    mem.set('config', 'database connection string');
    const results = mem.search('database');
    expect(results.length).toBe(1);
  });

  it('consolidates old low-importance entries', () => {
    const mem = new LongTermMemory();
    mem.set('old', 'data', { importance: 0.1 });
    // Manually backdate the entry
    const entry = mem.get('old');
    if (entry) entry.timestamp = new Date(Date.now() - 100000000);
    const removed = mem.consolidate(86400000);
    expect(removed).toBe(1);
  });

  it('gets stats', () => {
    const mem = new LongTermMemory();
    mem.set('a', 1, { namespace: 'ns1' });
    mem.set('b', 2, { namespace: 'ns2' });
    const stats = mem.getStats();
    expect(stats.totalEntries).toBe(2);
    expect(stats.namespaces).toHaveLength(2);
  });

  it('clears namespace', () => {
    const mem = new LongTermMemory();
    mem.set('a', 1, { namespace: 'temp' });
    mem.set('b', 2, { namespace: 'temp' });
    mem.set('c', 3, { namespace: 'keep' });
    const removed = mem.clearNamespace('temp');
    expect(removed).toBe(2);
    expect(mem.list('keep').length).toBe(1);
  });

  it('singleton works', () => {
    expect(getLongTermMemory()).toBe(getLongTermMemory());
  });
});
