import { describe, it, expect } from 'vitest';
import { ApprovalManager } from '../src/product/approvalWorkflow.js';
import { CallbackRegistry } from '../src/product/asyncCallback.js';
import { CompensationLog } from '../src/product/compensation.js';
import { assembleDocument } from '../src/product/documentAssembler.js';
import { translateError } from '../src/product/errorTranslator.js';
import { EscalationManager } from '../src/product/escalation.js';
import { EventRouter } from '../src/product/eventRouter.js';
import { GoalTracker } from '../src/product/goalTracker.js';
import { suggestImprovement } from '../src/product/improvement.js';
import { formatInstruction } from '../src/product/instructionFormatter.js';
import { KnowledgeGraph } from '../src/product/knowledgeGraph.js';
import { LongTermMemory } from '../src/product/longTermMemory.js';
import { OnboardingWizard } from '../src/product/onboardingWizard.js';
import { correctOutput } from '../src/product/outputCorrector.js';
import { coachReasoning } from '../src/product/reasoningCoach.js';
import { ReplayDebugger } from '../src/product/replayDebugger.js';
import { RolloutManager } from '../src/product/rolloutManager.js';
import { SyncManager } from '../src/product/syncConnector.js';
import { splitTask } from '../src/product/taskSplitter.js';
import { ToolChainBuilder } from '../src/product/toolChainBuilder.js';
import { RateLimiter } from '../src/product/toolRateLimiter.js';
import { generateDocs } from '../src/product/toolSemanticDocs.js';
import { WhiteLabelManager } from '../src/product/whiteLabel.js';

describe('Product — Approval Workflow', () => {
  it('creates and approves', () => {
    const mgr = new ApprovalManager();
    const req = mgr.createRequest('deploy', 'alice');
    expect(req.status).toBe('pending');
    const r = mgr.approve(req.requestId, 'bob');
    expect(r.status).toBe('approved');
  });
});

describe('Product — Async Callback', () => {
  it('registers and triggers', () => {
    const reg = new CallbackRegistry();
    let called = false;
    reg.registerCallback('test', () => { called = true; });
    reg.triggerEvent('test', {});
    expect(called).toBe(true);
  });
});

describe('Product — Compensation', () => {
  it('records and compensates', () => {
    const log = new CompensationLog();
    let compensated = false;
    log.recordAction('a1', 'create', () => { compensated = true; });
    log.compensate('a1');
    expect(compensated).toBe(true);
  });
});

describe('Product — Knowledge Graph', () => {
  it('adds entities and finds path', () => {
    const kg = new KnowledgeGraph();
    const a = kg.addEntity('generic', 'A');
    const b = kg.addEntity('generic', 'B');
    const c = kg.addEntity('generic', 'C');
    kg.addRelationship(a.entityId, b.entityId, 'relates_to');
    kg.addRelationship(b.entityId, c.entityId, 'relates_to');
    const path = kg.shortestPath(a.entityId, c.entityId);
    expect(path).toBeDefined();
    expect(path!.nodes.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Product — Long-Term Memory', () => {
  it('stores and retrieves', () => {
    const mem = new LongTermMemory();
    mem.store_entry('k1', 'hello', { importance: 0.8, tags: ['test'] });
    const r = mem.retrieve('k1');
    expect(r).toBeDefined();
    expect(r?.value).toBe('hello');
  });
});


describe('Product — Rollout Manager', () => {
  it('creates rollout and checks user', () => {
    const rm = new RolloutManager();
    rm.createRollout('feature-x', 50);
    const decision = rm.checkRollout('feature-x', 'user-1');
    expect(decision.feature).toBe('feature-x');
    expect(typeof decision.enabled).toBe('boolean');
  });
});

describe('Product — Task Splitter', () => {
  it('splits task', () => {
    const r = splitTask('Build a website and deploy it and monitor it', 5);
    expect(r.length).toBeGreaterThan(1);
  });
});

describe('Product — Tool Rate Limiter', () => {
  it('tracks rate limits', () => {
    const rl = new RateLimiter();
    expect(rl.checkLimit('tool-1', 'user-1').allowed).toBe(true);
    rl.recordUsage('tool-1', 'user-1');
  });
});

describe('Product — Error Translator', () => {
  it('translates error for user', () => {
    const r = translateError(new Error('ECONNREFUSED'), 'user');
    expect(r.userMessage).toBeDefined();
    expect(r.userMessage).not.toContain('ECONNREFUSED');
  });
});
