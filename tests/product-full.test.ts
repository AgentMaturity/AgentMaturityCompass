import { describe, it, expect } from 'vitest';
import { ABTestManager } from '../src/product/abTesting.js';
import { ApprovalManager } from '../src/product/approvalWorkflow.js';
import { CallbackRegistry } from '../src/product/asyncCallback.js';
import { CollaborationManager } from '../src/product/collaboration.js';
import { CompensationLog } from '../src/product/compensation.js';
import { scoreConfidence } from '../src/product/confidence.js';
import { buildContextPack, compressContext, extractKeyContext } from '../src/product/contextPack.js';
import { ConversationManager } from '../src/product/conversationState.js';
import { assessQuality, flagAnomalies } from '../src/product/dataQuality.js';
import { DevSandboxManager } from '../src/product/devSandbox.js';
import { DocumentIngester } from '../src/product/docsIngestion.js';
import { assembleDocument } from '../src/product/documentAssembler.js';
import { translateError } from '../src/product/errorTranslator.js';
import { EscalationManager } from '../src/product/escalation.js';
import { EventRouter } from '../src/product/eventRouter.js';
import { extractStructured } from '../src/product/extractor.js';
import { FailureClusterer } from '../src/product/failureClustering.js';
import { GoalTracker } from '../src/product/goalTracker.js';
import { suggestImprovement } from '../src/product/improvement.js';
import { formatInstruction } from '../src/product/instructionFormatter.js';
import { JobQueue } from '../src/product/jobs.js';
import { KnowledgeBaseBuilder } from '../src/product/kbBuilder.js';
import { KnowledgeGraph } from '../src/product/knowledgeGraph.js';
import { LongTermMemory } from '../src/product/longTermMemory.js';
import { consolidate } from '../src/product/memoryConsolidation.js';
import { OnboardingWizard } from '../src/product/onboardingWizard.js';
import { calculateOutcomePrice, estimateROI } from '../src/product/outcomePricing.js';
import { correctOutput } from '../src/product/outputCorrector.js';
import { autofillParams } from '../src/product/paramAutofiller.js';
import { PersonaManager } from '../src/product/persona.js';
import { ReminderManager } from '../src/product/proactiveReminders.js';
import { coachReasoning } from '../src/product/reasoningCoach.js';
import { ReplayDebugger } from '../src/product/replayDebugger.js';
import { validateResponse } from '../src/product/responseValidator.js';
import { identifyAtRisk } from '../src/product/retentionAutopilot.js';
import { RolloutManager } from '../src/product/rolloutManager.js';
import { scaffoldAgent, listArchetypes } from '../src/product/scaffolding.js';
import { compileSop } from '../src/product/sopCompiler.js';
import { SyncManager } from '../src/product/syncConnector.js';
import { createTaskSpec, estimateComplexity } from '../src/product/taskSpec.js';
import { splitTask } from '../src/product/taskSplitter.js';
import { ToolChainBuilder } from '../src/product/toolChainBuilder.js';
import { ToolDiscovery } from '../src/product/toolDiscovery.js';
import { RateLimiter } from '../src/product/toolRateLimiter.js';
import { generateDocs } from '../src/product/toolSemanticDocs.js';
import { VersionControl } from '../src/product/versionControl.js';
import { WhiteLabelManager } from '../src/product/whiteLabel.js';
import { WorkflowTemplateRegistry } from '../src/product/workflowTemplates.js';

describe('Product — A/B Testing', () => {
  it('creates experiment and assigns variant', () => {
    const mgr = new ABTestManager();
    const exp = mgr.createExperiment('test', ['A', 'B']);
    const variant = mgr.assignVariant(exp.id, 'user-1');
    expect(['A', 'B']).toContain(variant);
  });
});

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

describe('Product — Collaboration', () => {
  it('creates session and adds contribution', () => {
    const mgr = new CollaborationManager();
    const s = mgr.createSession(['alice', 'bob']);
    mgr.addContribution(s.id, 'alice', 'Hello');
    expect(mgr.getHistory(s.id).length).toBe(1);
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

describe('Product — Confidence', () => {
  it('scores confidence', () => {
    const r = scoreConfidence('answer', [{ source: 's1', content: 'evidence' }]);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(1);
  });
});

describe('Product — Context Pack', () => {
  it('builds context pack', () => {
    const r = buildContextPack('a1', 'research', [{ role: 'user', content: 'hello' }]);
    expect(r.packId).toBeDefined();
  });
  it('extracts key context', () => {
    const r = extractKeyContext('Email me at test@example.com on 2024-01-15');
    expect(r.entities.length).toBeGreaterThan(0);
  });
});

describe('Product — Conversation State', () => {
  it('tracks conversation', () => {
    const mgr = new ConversationManager();
    const id = mgr.createConversation('agent-1');
    mgr.addTurn(id, 'user', 'Hello');
    const state = mgr.getState(id);
    expect(state.turns.length).toBe(1);
  });
});

describe('Product — Data Quality', () => {
  it('assesses quality', () => {
    const r = assessQuality([{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }]);
    expect(r.score).toBeGreaterThan(0);
  });
});

describe('Product — Knowledge Graph', () => {
  it('adds entities and finds path', () => {
    const kg = new KnowledgeGraph();
    const a = kg.addEntity('entity', 'A');
    const b = kg.addEntity('entity', 'B');
    const c = kg.addEntity('entity', 'C');
    kg.addRelationship(a.entityId, b.entityId, 'knows');
    kg.addRelationship(b.entityId, c.entityId, 'knows');
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

describe('Product — Jobs', () => {
  it('creates and processes jobs', () => {
    const q = new JobQueue();
    const job = q.createJob({ type: 'test', payload: {}, priority: 1 });
    q.enqueueJob(job.id);
    expect(q.getJobStatus(job.id)?.status).toBe('queued');
    q.processJob(job.id);
    expect(q.getJobStatus(job.id)?.status).toBe('completed');
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

describe('Product — Scaffolding', () => {
  it('scaffolds agent', () => {
    const r = scaffoldAgent('chatbot', 'my-agent');
    expect(Object.keys(r.files).length).toBeGreaterThan(0);
  });
  it('lists archetypes', () => {
    const r = listArchetypes();
    expect(r.length).toBeGreaterThan(0);
  });
});

describe('Product — SOP Compiler', () => {
  it('compiles SOP text', () => {
    const r = compileSop('1. Check inventory\n2. If low, reorder\n3. Verify delivery');
    expect(r.steps.length).toBeGreaterThan(0);
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

describe('Product — Version Control', () => {
  it('commits and logs', () => {
    const vc = new VersionControl();
    vc.commit('agent-1', { model: 'gpt-4' }, 'initial');
    const log = vc.log('agent-1');
    expect(log.length).toBe(1);
  });
});

describe('Product — Error Translator', () => {
  it('translates error for user', () => {
    const r = translateError(new Error('ECONNREFUSED'), 'user');
    expect(r.userMessage).toBeDefined();
    expect(r.userMessage).not.toContain('ECONNREFUSED');
  });
});

describe('Product — Extractor', () => {
  it('extracts fields', () => {
    const r = extractStructured('Contact me at test@example.com or 555-1234', [
      { name: 'email', type: 'email' },
      { name: 'phone', type: 'phone' },
    ]);
    expect(Object.keys(r.fields).length).toBeGreaterThan(0);
  });
});

describe('Product — Workflow Templates', () => {
  it('lists templates', () => {
    const reg = new WorkflowTemplateRegistry();
    const templates = reg.listTemplates();
    expect(templates.length).toBeGreaterThan(0);
  });
});
