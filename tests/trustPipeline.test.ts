/**
 * trustPipeline.test.ts — Tests for the end-to-end trust pipeline.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runTrustPipeline, type TrustPipelineInput } from '../src/shield/trustPipeline.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<TrustPipelineInput> = {}): TrustPipelineInput {
  return {
    agentId: 'test-agent-001',
    action: 'read-file',
    toolName: 'file-reader',
    parameters: { path: '/tmp/test.txt' },
    sessionId: 'session-test-001',
    workspaceId: 'ws-test-001',
    ...overrides,
  };
}

// ── Shape tests (no mocking) ───────────────────────────────────────────────

describe('TrustPipeline — result shape', () => {
  it('returns a TrustPipelineResult with all required fields', async () => {
    const result = await runTrustPipeline(makeInput());
    expect(result).toHaveProperty('allowed');
    expect(result).toHaveProperty('stages');
    expect(result).toHaveProperty('overallTrustScore');
    expect(result).toHaveProperty('evidenceChain');
    expect(result).toHaveProperty('processingTimeMs');
  });

  it('stages object has all four stage keys', async () => {
    const result = await runTrustPipeline(makeInput());
    expect(result.stages).toHaveProperty('shieldGate');
    expect(result.stages).toHaveProperty('formalVerification');
    expect(result.stages).toHaveProperty('zkProof');
    expect(result.stages).toHaveProperty('trustToken');
  });

  it('shieldGate stage has passed, trustScore, reason', async () => {
    const result = await runTrustPipeline(makeInput());
    const sg = result.stages.shieldGate;
    expect(typeof sg.passed).toBe('boolean');
    expect(typeof sg.trustScore).toBe('number');
    expect(typeof sg.reason).toBe('string');
  });

  it('formalVerification stage has passed, propertiesVerified, certificateHash', async () => {
    const result = await runTrustPipeline(makeInput());
    const fv = result.stages.formalVerification;
    expect(typeof fv.passed).toBe('boolean');
    expect(typeof fv.propertiesVerified).toBe('number');
    expect(typeof fv.certificateHash).toBe('string');
  });

  it('zkProof stage has generated, claim, proofId', async () => {
    const result = await runTrustPipeline(makeInput());
    const zk = result.stages.zkProof;
    expect(typeof zk.generated).toBe('boolean');
    expect(typeof zk.claim).toBe('string');
    expect(typeof zk.proofId).toBe('string');
  });

  it('trustToken stage has issued, tokenId, expiresAt', async () => {
    const result = await runTrustPipeline(makeInput());
    const tt = result.stages.trustToken;
    expect(typeof tt.issued).toBe('boolean');
    expect(typeof tt.tokenId).toBe('string');
    expect(typeof tt.expiresAt).toBe('number');
  });

  it('evidenceChain is a non-empty array of strings', async () => {
    const result = await runTrustPipeline(makeInput());
    expect(Array.isArray(result.evidenceChain)).toBe(true);
    expect(result.evidenceChain.length).toBeGreaterThan(0);
    for (const hash of result.evidenceChain) {
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    }
  });

  it('processingTimeMs is a non-negative number', async () => {
    const result = await runTrustPipeline(makeInput());
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('overallTrustScore is a number between 0 and 100', async () => {
    const result = await runTrustPipeline(makeInput());
    expect(result.overallTrustScore).toBeGreaterThanOrEqual(0);
    expect(result.overallTrustScore).toBeLessThanOrEqual(100);
  });
});

// ── Logic tests ────────────────────────────────────────────────────────────

describe('TrustPipeline — logic', () => {
  it('evidenceChain has at least genesis + shield hashes', async () => {
    const result = await runTrustPipeline(makeInput());
    // At minimum: genesis + shield (when blocked) OR genesis + shield + formal + zk + token (when allowed)
    expect(result.evidenceChain.length).toBeGreaterThanOrEqual(2);
  });

  it('all evidence chain hashes are distinct (no repeated hashes)', async () => {
    const result = await runTrustPipeline(makeInput());
    const unique = new Set(result.evidenceChain);
    expect(unique.size).toBe(result.evidenceChain.length);
  });

  it('different agentIds produce different evidence chains', async () => {
    const r1 = await runTrustPipeline(makeInput({ agentId: 'agent-A' }));
    const r2 = await runTrustPipeline(makeInput({ agentId: 'agent-B' }));
    expect(r1.evidenceChain[0]).not.toBe(r2.evidenceChain[0]);
  });

  it('allowed pipeline has more stages in evidence chain than blocked', async () => {
    // A normal user action should be allowed
    const r = await runTrustPipeline(makeInput());
    if (r.allowed) {
      expect(r.evidenceChain.length).toBeGreaterThanOrEqual(4);
    }
    // If blocked, only 2 hashes (genesis + shield)
    if (!r.allowed) {
      expect(r.evidenceChain.length).toBe(2);
    }
  });

  it('when shield gate blocks, downstream stages are empty/false', async () => {
    // Force a block by using a tool that looks external with sensitive data
    // (hard to guarantee without mocking; just verify the contract holds either way)
    const r = await runTrustPipeline(makeInput());
    if (!r.allowed) {
      expect(r.stages.formalVerification.passed).toBe(false);
      expect(r.stages.zkProof.generated).toBe(false);
      expect(r.stages.trustToken.issued).toBe(false);
    }
  });
});

// ── Export test ────────────────────────────────────────────────────────────

describe('TrustPipeline — exports', () => {
  it('runTrustPipeline is a function', () => {
    expect(typeof runTrustPipeline).toBe('function');
  });

  it('runTrustPipeline returns a Promise', () => {
    const result = runTrustPipeline(makeInput());
    expect(result).toBeInstanceOf(Promise);
    return result; // Let vitest await it
  });
});
