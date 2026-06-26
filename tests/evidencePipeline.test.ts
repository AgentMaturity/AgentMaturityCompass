import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { emitGuardEvent, readGuardEvents, closeGuardDb } from '../src/enforce/evidenceEmitter.js';
import { collectEvidenceFromLedger } from '../src/score/evidenceCollector.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const previousGuardDbPath = process.env.AMC_GUARD_EVENTS_DB_PATH;
let tempDir: string | null = null;

beforeEach(() => {
  closeGuardDb();
  tempDir = mkdtempSync(join(tmpdir(), 'amc-guard-events-'));
  process.env.AMC_GUARD_EVENTS_DB_PATH = join(tempDir, 'guard_events.sqlite');
});

afterEach(() => {
  closeGuardDb();
  if (tempDir) {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch (_) { /* ok */ }
    tempDir = null;
  }
  if (previousGuardDbPath === undefined) {
    delete process.env.AMC_GUARD_EVENTS_DB_PATH;
  } else {
    process.env.AMC_GUARD_EVENTS_DB_PATH = previousGuardDbPath;
  }
});

afterAll(() => {
  closeGuardDb();
});

describe('evidenceEmitter', () => {
  it('emitGuardEvent writes to SQLite and readGuardEvents retrieves', () => {
    emitGuardEvent({
      agentId: 'agent-1',
      moduleCode: 'E1',
      decision: 'deny',
      reason: 'blocked dangerous command',
      severity: 'high',
    });
    emitGuardEvent({
      agentId: 'agent-1',
      moduleCode: 'E2',
      decision: 'allow',
      reason: 'passed policy check',
      severity: 'low',
    });
    const events = readGuardEvents('agent-1');
    expect(events.length).toBe(2);
    expect(events[0]!.module_code).toBe('E2'); // most recent first
  });

  it('emitGuardEvent never throws on bad input', () => {
    expect(() => emitGuardEvent({
      agentId: '', moduleCode: '', decision: 'allow', reason: '', severity: 'low',
    })).not.toThrow();
  });
});

describe('collectEvidenceFromLedger', () => {
  it('collects events from SQLite grouped by module', () => {
    emitGuardEvent({ agentId: 'agent-2', moduleCode: 'S1', decision: 'deny', reason: 'injection', severity: 'critical' });
    emitGuardEvent({ agentId: 'agent-2', moduleCode: 'S1', decision: 'warn', reason: 'suspicious', severity: 'medium' });
    emitGuardEvent({ agentId: 'agent-2', moduleCode: 'E5', decision: 'allow', reason: 'ok', severity: 'low' });

    const evidence = collectEvidenceFromLedger('agent-2', 1);
    expect(evidence.artifacts.length).toBeGreaterThanOrEqual(2);
    expect(evidence.totalTrust).toBeGreaterThan(0);
    // S1 events should have observed trust weight = 1.0
    const s1 = evidence.artifacts.find(a => a.qid === 'S1');
    expect(s1).toBeDefined();
    expect(s1!.trust).toBe(1.0);
  });
});
