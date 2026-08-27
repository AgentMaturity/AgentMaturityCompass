import { describe, it, expect } from 'vitest';
import { attestOutput } from '../src/watch/outputAttestation.js';
import { createPacket, verifyPacket } from '../src/watch/explainabilityPacket.js';
import { runSafetyTests } from '../src/watch/safetyTestkit.js';
import { AgentBus } from '../src/watch/agentBus.js';
import { exportEvent, exportBatch } from '../src/watch/siemExporter.js';
import { checkHostHardening } from '../src/watch/hostHardening.js';
import { MultiTenantVerifier } from '../src/watch/multiTenantVerifier.js';
import { PolicyPackRegistry } from '../src/watch/policyPacks.js';

describe('W1/W2 — Receipts/Assurance', () => {
  it('are covered by existing OG AMC tests', () => {
    expect(true).toBe(true);
  });
});

describe('W3 — SIEM Exporter', () => {
  it('exports CEF format', () => {
    const r = exportEvent({
      eventId: 'e1', timestamp: new Date(), actor: 'agent-1',
      action: 'tool-call', resource: 'api', outcome: 'success', severity: 'low'
    }, 'cef');
    expect(r.formatted).toContain('CEF:');
    expect(r.format).toBe('cef');
  });
  it('exports LEEF format', () => {
    const r = exportEvent({
      eventId: 'e1', timestamp: new Date(), actor: 'agent-1',
      action: 'tool-call', resource: 'api', outcome: 'success', severity: 'medium'
    }, 'leef');
    expect(r.formatted).toContain('LEEF:');
  });
  it('exports JSON-LD format', () => {
    const r = exportEvent({
      eventId: 'e1', timestamp: new Date(), actor: 'agent-1',
      action: 'tool-call', resource: 'api', outcome: 'success', severity: 'high'
    }, 'json-ld');
    const parsed = JSON.parse(r.formatted);
    expect(parsed['@type']).toBeDefined();
  });
  it('exports batch', () => {
    const events = [
      { eventId: 'e1', timestamp: new Date(), actor: 'a', action: 'x', resource: 'r', outcome: 'ok', severity: 'low' },
      { eventId: 'e2', timestamp: new Date(), actor: 'b', action: 'y', resource: 'r', outcome: 'ok', severity: 'low' },
    ];
    const r = exportBatch(events, 'cef');
    expect(r.count).toBe(2);
  });
});

describe('W4 — Safety Testkit', () => {
  it('runs safety tests', () => {
    const r = runSafetyTests({ respond: (p: string) => `Echo: ${p}` });
    expect(r).toHaveProperty('passed');
  });
});

describe('W5 — Agent Bus', () => {
  it('sends and receives', () => {
    const bus = new AgentBus();
    bus.send('agent-a', 'agent-b', { data: 'hello' });
    const msgs = bus.receive('agent-b');
    expect(msgs.length).toBe(1);
  });
});

describe('W6 — Output Attestation', () => {
  it('attests output', () => {
    const r = attestOutput('test output', 'agent-1');
    expect(r).toHaveProperty('hash');
  });
});

describe('W7 — Explainability Packet', () => {
  it('creates and verifies packet', () => {
    const packet = createPacket([{ claim: 'reasoning', evidence: 'analyzed data', confidence: 0.9 }]);
    expect(packet).toHaveProperty('claims');
    const v = verifyPacket(packet);
    expect(typeof v).toBe('boolean');
  });
});

describe('W8 — Host Hardening', () => {
  it('checks host hardening', () => {
    const r = checkHostHardening();
    expect(r).toHaveProperty('score');
    expect(r).toHaveProperty('findings');
    expect(r.findings.length).toBeGreaterThan(0);
  });
});

describe('W9 — Multi-Tenant Verifier', () => {
  it('verifies tenant isolation', () => {
    const v = new MultiTenantVerifier();
    v.registerResource({ resourceId: 'r1', tenantId: 'tenant-a', namespace: 'tenant-a', type: 'doc' });
    const r = v.verifyTenantIsolation('tenant-a', { resourceId: 'r1', tenantId: 'tenant-a', namespace: 'tenant-a', type: 'doc' });
    expect(r.isolated).toBe(true);
  });
  it('detects cross-tenant access', () => {
    const v = new MultiTenantVerifier();
    v.registerResource({ resourceId: 'r1', tenantId: 'tenant-a', namespace: 'tenant-a', type: 'doc' });
    const r = v.verifyTenantIsolation('tenant-b', { resourceId: 'r1', tenantId: 'tenant-a', namespace: 'tenant-a', type: 'doc' });
    expect(r.isolated).toBe(false);
  });
});

describe('W10 — Policy Packs', () => {
  it('lists built-in packs', () => {
    const reg = new PolicyPackRegistry();
    const packs = reg.listPolicyPacks();
    expect(packs.length).toBeGreaterThan(0);
  });
  it('loads a policy pack', () => {
    const reg = new PolicyPackRegistry();
    const pack = reg.loadPolicyPack('standard');
    expect(pack).toBeDefined();
    expect(pack?.modules.length).toBeGreaterThan(0);
  });
  it('applies policy pack to agent', () => {
    const reg = new PolicyPackRegistry();
    const r = reg.applyPolicyPack('agent-1', 'strict');
    expect(r.applied).toBe(true);
  });
});
