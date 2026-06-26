import { describe, expect, it } from 'vitest';
import { analyzeRuntimeAction } from '../src/shield/runtimeAnalyzer.js';

describe('Shield runtime action analysis', () => {
  it('wraps the trust pipeline with runtime evidence and stage summaries', async () => {
    const report = await analyzeRuntimeAction({
      agentId: 'runtime-agent-001',
      action: 'read customer support ticket summary',
      toolName: 'ticket-search',
      parameters: { ticketId: 'T-100' },
      sessionId: 'runtime-session-001',
      workspaceId: 'runtime-workspace-001',
    });

    expect(report.mode).toBe('runtime-action-analysis');
    expect(report.agentId).toBe('runtime-agent-001');
    expect(report.allowed).toBe(true);
    expect(report.blocked).toBe(false);
    expect(report.score0to100).toBeGreaterThanOrEqual(0);
    expect(report.score0to100).toBeLessThanOrEqual(100);
    expect(report.evidence.chainLength).toBe(report.evidenceChain.length);
    expect(report.evidenceChain.length).toBeGreaterThanOrEqual(2);
    expect(report.evidence.firstHash).toBe(report.evidenceChain[0]);
    expect(report.evidence.lastHash).toBe(report.evidenceChain.at(-1));
    expect(report.stages.shieldGate.checks.credentialFreshness).toBe('valid');
  });

  it('blocks a stale tool-sourced external action with sensitive fields', async () => {
    const report = await analyzeRuntimeAction({
      agentId: 'runtime-agent-002',
      action: 'export customer data to vendor webhook',
      toolName: 'external-api-webhook',
      parameters: {
        customerEmail: 'user@example.com',
        ssn: '123-45-6789',
        cardToken: 'tok_test',
        authSecret: 'secret',
      },
      sessionId: 'runtime-session-002',
      workspaceId: 'runtime-workspace-001',
      instructionSource: 'tool',
      sensitiveDataFields: ['customerEmail', 'ssn', 'cardToken', 'authSecret'],
      lastVerifiedAt: Date.now() - 25 * 60 * 60 * 1000,
      cumulativeConfidence: 0.4,
    });

    expect(report.allowed).toBe(false);
    expect(report.blocked).toBe(true);
    expect(report.riskLevel).toBe('critical');
    expect(report.shieldTrustScore0to100).toBe(0);
    expect(report.stages.shieldGate.checks.instructionHierarchyValid).toBe(false);
    expect(report.stages.shieldGate.checks.dataLeakageRisk).toBe('high');
    expect(report.stages.shieldGate.checks.credentialFreshness).toBe('expired');
    expect(report.stages.shieldGate.checks.uncertaintyAcceptable).toBe(false);
    expect(report.recommendations.join('\n')).toContain('Do not execute');
    expect(report.evidenceChain).toHaveLength(2);
  });
});
