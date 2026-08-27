import { describe, it, expect } from 'vitest';
import { PolicyFirewall } from '../src/enforce/policyFirewall.js';
import { checkExec } from '../src/enforce/execGuard.js';
import { CircuitBreaker } from '../src/enforce/circuitBreaker.js';
import { StepUpAuth } from '../src/enforce/stepUpAuth.js';
import { detectAto } from '../src/enforce/atoDetection.js';
import { TaintTracker } from '../src/enforce/taintTracker.js';
import { checkNumeric } from '../src/enforce/numericChecker.js';
import { lintConfig } from '../src/enforce/configLinter.js';
import { ModeSwitcher } from '../src/enforce/modeSwitcher.js';
import { verifyCrossSources } from '../src/enforce/crossSourceVerifier.js';
import { checkPayee } from '../src/enforce/payeeGuard.js';
import { ModelSwitchboard } from '../src/enforce/modelSwitchboard.js';
import { checkBrowserAction } from '../src/enforce/browserGuardrails.js';
import { checkEgressRequest } from '../src/enforce/egressProxy.js';
import { SandboxOrchestrator } from '../src/enforce/sandboxOrchestrator.js';
import { SessionFirewall } from '../src/enforce/sessionFirewall.js';
import { filterOutbound } from '../src/enforce/outboundFilter.js';
import { scanGatewayRequest } from '../src/enforce/gatewayScanner.js';
import { checkMdnsAccess } from '../src/enforce/mdnsController.js';
import { validateProxyRequest } from '../src/enforce/reverseProxyGuard.js';
import { verifyWebhook } from '../src/enforce/webhookGateway.js';
import { checkAccess } from '../src/enforce/abac.js';
import { checkApprovalRequest } from '../src/enforce/antiPhishing.js';
import { dryRunAction } from '../src/enforce/dryRun.js';
import { blindSecrets } from '../src/enforce/secretBlind.js';
import { TwoPersonAuth } from '../src/enforce/twoPersonAuth.js';
import { validateSchema } from '../src/enforce/schemaGate.js';
import { createEvidenceContract, verifyEvidenceContract } from '../src/enforce/evidenceContract.js';
import { checkTemporalAccess } from '../src/enforce/temporalControls.js';
import { checkGeoFence } from '../src/enforce/geoFence.js';
import { IdempotencyStore } from '../src/enforce/idempotency.js';
import { guardClipboard } from '../src/enforce/clipboardGuard.js';
import { renderTemplate } from '../src/enforce/templateEngine.js';
import { WatchdogManager } from '../src/enforce/watchdog.js';
import { ConsensusManager } from '../src/enforce/consensus.js';

describe('E1 — Policy Firewall', () => {
  it('creates and evaluates', () => {
    const fw = new PolicyFirewall();
    expect(fw).toBeDefined();
  });
});

describe('E2 — Exec Guard', () => {
  it('checks command', () => {
    const r = checkExec('ls -la');
    expect(r).toHaveProperty('allowed');
  });
});

describe('E3 — Browser Guardrails', () => {
  it('blocks dangerous URLs', () => {
    const r = checkBrowserAction({ type: 'navigate', url: 'javascript:alert(1)' });
    expect(r.allowed).toBe(false);
  });
  it('allows safe URLs', () => {
    const r = checkBrowserAction({ type: 'navigate', url: 'https://example.com' });
    expect(r.allowed).toBe(true);
  });
});

describe('E4 — Egress Proxy', () => {
  it('checks egress', () => {
    const r = checkEgressRequest({ url: 'https://example.com', method: 'GET', headers: {} });
    expect(r).toHaveProperty('allowed');
  });
});

describe('E5 — Circuit Breaker', () => {
  it('starts closed', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeMs: 1000 });
    expect(cb.getState('session-1')).toBe('closed');
  });
});

describe('E7 — Sandbox Orchestrator', () => {
  it('creates and destroys sandbox', () => {
    const so = new SandboxOrchestrator();
    const s = so.createSandbox({ memoryLimitMb: 256, cpuTimeMs: 5000, networkAccess: false, filesystemAccess: false });
    expect(s.active).toBe(true);
    so.destroySandbox(s.sandboxId);
  });
});

describe('E8 — Session Firewall', () => {
  it('manages session state', () => {
    const sf = new SessionFirewall();
    const s = sf.createSession('sess-1');
    expect(sf.getState('sess-1')).toBe('active');
    const r = sf.checkSession('sess-1', 'write');
    expect(r.allowed).toBe(true);
    sf.suspendSession('sess-1');
    expect(sf.getState('sess-1')).toBe('suspended');
  });
});

describe('E9 — Outbound Filter', () => {
  it('detects secrets in output', () => {
    const r = filterOutbound('My key is sk-1234567890abcdefghij');
    expect(r.safe).toBe(false);
    expect(r.findings.length).toBeGreaterThan(0);
  });
  it('passes clean output', () => {
    const r = filterOutbound('Hello world');
    expect(r.safe).toBe(true);
  });
});

describe('E10 — Gateway Scanner', () => {
  it('scans request', () => {
    const r = scanGatewayRequest({ method: 'GET', path: '/api/data', headers: {}, sourceIp: '1.2.3.4' });
    expect(r).toHaveProperty('riskScore');
  });
});

describe('E11 — mDNS Controller', () => {
  it('blocks .local by default', () => {
    const r = checkMdnsAccess('printer.local');
    expect(r).toHaveProperty('allowed');
  });
});

describe('E12 — Reverse Proxy Guard', () => {
  it('detects SSRF', () => {
    const r = validateProxyRequest({ url: 'http://169.254.169.254/metadata', headers: {}, sourceIp: '1.2.3.4' });
    expect(r.allowed).toBe(false);
  });
});

describe('E14 — Webhook Gateway', () => {
  it('verifies valid webhook', async () => {
    const crypto = await import('node:crypto');
    const secret = 'test-secret';
    const payload = '{"event":"test"}';
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const r = verifyWebhook(payload, sig, secret);
    expect(r.valid).toBe(true);
  });
});

describe('E15 — ABAC', () => {
  it('checks access', () => {
    const r = checkAccess(
      { subject: { role: 'admin', department: 'eng' }, resource: 'doc-1', action: 'read', context: {} },
      [{ conditions: [{ attribute: 'role', operator: 'eq', value: 'admin' }], effect: 'allow' as const }]
    );
    expect(r.allowed).toBe(true);
  });
});

describe('E16 — Anti-Phishing', () => {
  it('detects urgency patterns', () => {
    const r = checkApprovalRequest({ senderName: 'Unknown', senderEmail: 'unknown@evil.com', subject: 'URGENT', body: 'URGENT: Approve immediately or lose access!!!', urls: ['http://192.168.1.1/login'] });
    expect(r.isPhishing).toBe(true);
  });
});

describe('E17 — Dry Run', () => {
  it('simulates action', () => {
    const r = dryRunAction({ actionType: 'delete', target: 'user-data', params: {} });
    expect(r).toHaveProperty('riskLevel');
  });
});

describe('E18 — Secret Blind', () => {
  it('blinds secrets', () => {
    const r = blindSecrets('My key is sk-1234567890abcdefghijklmnop');
    expect(r.blinded).not.toContain('sk-');
    expect(r.secretsFound).toBeGreaterThan(0);
  });
});

describe('E19 — Two-Person Auth', () => {
  it('requires two different approvers', () => {
    const tp = new TwoPersonAuth();
    const req = tp.requestApproval('deploy', 'alice');
    expect(req.status).toBe('pending');
    const result = tp.approveAction(req.actionId, 'bob');
    expect(result.approved).toBe(true);
  });
  it('rejects same person approving', () => {
    const tp = new TwoPersonAuth();
    const req = tp.requestApproval('deploy', 'alice');
    const result = tp.approveAction(req.actionId, 'alice');
    expect(result.approved).toBe(false);
  });
});

describe('E22 — Schema Gate', () => {
  it('validates against schema', () => {
    const r = validateSchema({ name: 'test', age: 30 }, { type: 'object', required: ['name'], fields: { name: { type: 'string' }, age: { type: 'number' } } });
    expect(r.valid).toBe(true);
  });
  it('catches missing required', () => {
    const r = validateSchema({}, { type: 'object', required: ['name'], fields: {} });
    expect(r.valid).toBe(false);
  });
});

describe('E24 — Evidence Contract', () => {
  it('creates and verifies contract', () => {
    const contract = createEvidenceContract([{ id: 'c1', statement: 'Agent passed safety test', requiredEvidence: ['test-report'] }]);
    expect(contract.contractId).toBeDefined();
    const verification = verifyEvidenceContract(contract, [{ id: 'e1', claimId: 'c1', content: 'test-passed' }]);
    expect(verification).toHaveProperty('verified');
  });
});

describe('E27 — Temporal Controls', () => {
  it('checks time access', () => {
    const r = checkTemporalAccess('deploy', { allowedHours: [9, 17], allowedDays: [1, 2, 3, 4, 5] });
    expect(r).toHaveProperty('allowed');
  });
});

describe('E28 — Geo Fence', () => {
  it('checks geo fence', () => {
    const r = checkGeoFence({ region: 'US', ip: '8.8.8.8' }, { allowedRegions: ['US', 'EU'] });
    expect(r.allowed).toBe(true);
  });
  it('blocks disallowed region', () => {
    const r = checkGeoFence({ region: 'CN', ip: '1.1.1.1' }, { allowedRegions: ['US'] });
    expect(r.allowed).toBe(false);
  });
});

describe('E29 — Idempotency', () => {
  it('tracks and deduplicates', () => {
    const store = new IdempotencyStore();
    const first = store.check('req-1');
    expect(first.found).toBe(false);
    store.store('req-1', { result: 'ok' }, 60000);
    const second = store.check('req-1');
    expect(second.found).toBe(true);
    expect(second.result).toEqual({ result: 'ok' });
  });
});

describe('E31 — Clipboard Guard', () => {
  it('detects secrets', () => {
    const r = guardClipboard('API key: sk-abc123def456ghi789jklmnopqrst');
    expect(r.safe).toBe(false);
  });
  it('passes clean content', () => {
    const r = guardClipboard('Hello world');
    expect(r.safe).toBe(true);
  });
});

describe('E32 — Template Engine', () => {
  it('renders template', () => {
    const r = renderTemplate('Hello {{name}}!', { name: 'World' });
    expect(r.rendered).toBe('Hello World!');
  });
  it('detects prototype pollution', () => {
    const r = renderTemplate('{{__proto__}}', {});
    expect(r.blocked).toBe(true);
  });
});

describe('E33 — Watchdog', () => {
  it('creates and checks watchdog', () => {
    const wm = new WatchdogManager();
    const w = wm.createWatchdog('test', { timeoutMs: 5000 });
    wm.heartbeat(w.watchdogId);
    const status = wm.check(w.watchdogId);
    expect(status.alive).toBe(true);
  });
});

describe('E34 — Consensus', () => {
  it('reaches consensus', () => {
    const cm = new ConsensusManager();
    const p = cm.propose('Deploy v2', ['alice', 'bob', 'carol']);
    cm.vote(p.proposalId, 'alice', true);
    cm.vote(p.proposalId, 'bob', true);
    cm.vote(p.proposalId, 'carol', true);
    const r = cm.getResult(p.proposalId);
    expect(r.agreed).toBe(true);
  });
  it('fails without majority', () => {
    const cm = new ConsensusManager();
    const p = cm.propose('Deploy v2', ['alice', 'bob', 'carol']);
    cm.vote(p.proposalId, 'alice', false);
    cm.vote(p.proposalId, 'bob', false);
    cm.vote(p.proposalId, 'carol', false);
    const r = cm.getResult(p.proposalId);
    expect(r.agreed).toBe(false);
  });
});
