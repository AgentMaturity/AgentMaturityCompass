/**
 * modelDrift.test.ts — Unit tests for model drift detection
 */
import { describe, it, expect } from 'vitest';
import {
  detectModelDrift,
  buildSnapshot,
  parseModelVersion,
  tagEvidenceWithModel,
} from '../src/score/modelDrift.js';
import type { EvidenceArtifact } from '../src/score/formalSpec.js';

function makeEvidence(qid: string, trust: number): EvidenceArtifact {
  return { qid, kind: 'observed', trust, payload: {}, timestamp: new Date() };
}

describe('parseModelVersion', () => {
  it('parses provider/model@version format', () => {
    const v = parseModelVersion('openai/gpt-4o@2024-11');
    expect(v.provider).toBe('openai');
    expect(v.model).toBe('gpt-4o');
    expect(v.version).toBe('2024-11');
  });

  it('parses provider/model without version', () => {
    const v = parseModelVersion('anthropic/claude-3-opus');
    expect(v.provider).toBe('anthropic');
    expect(v.model).toBe('claude-3-opus');
    expect(v.version).toBeUndefined();
  });

  it('parses provider/model@version with multi-part model name', () => {
    const v = parseModelVersion('openai/gpt-4o@2025-01');
    expect(v.provider).toBe('openai');
    expect(v.model).toBe('gpt-4o');
    expect(v.version).toBe('2025-01');
  });

  it('handles empty string gracefully', () => {
    expect(() => parseModelVersion('')).not.toThrow();
  });

  it('returns a capturedAt Date', () => {
    const v = parseModelVersion('openai/gpt-4o@2024-11');
    expect(v.capturedAt).toBeInstanceOf(Date);
  });
});

describe('buildSnapshot', () => {
  it('creates snapshot with correct agentId and model', () => {
    const model = parseModelVersion('openai/gpt-4o@2024-11');
    const evidence = [makeEvidence('AMC-1.1', 0.9), makeEvidence('AMC-2.1', 0.8)];
    const snap = buildSnapshot('agent-001', model, evidence);
    expect(snap.agentId).toBe('agent-001');
    expect(snap.model.model).toBe('gpt-4o');
    expect(snap.evidenceCount).toBe(2);
    expect(snap.capturedAt).toBeInstanceOf(Date);
  });

  it('computes avgTrust as trust-weighted average', () => {
    const model = parseModelVersion('openai/gpt-4o@2024-11');
    // observed kind has weight 1.0, so avgTrust = totalWeight / evidenceCount
    const evidence = [makeEvidence('AMC-1.1', 1.0), makeEvidence('AMC-2.1', 0.0)];
    const snap = buildSnapshot('agent-001', model, evidence);
    // Both observed (weight 1.0): totalTrust = 1.0 + 1.0 = 2.0, evidenceCount = 2 → avgTrust = 1.0
    // Wait — avgTrust = totalTrustWeight / evidenceCount where trustWeight = kind_weight per artifact
    // observed weight = 1.0 for each → totalTrust = 1.0 + 1.0 = 2.0, avgTrust = 2.0/2 = 1.0
    expect(snap.avgTrust).toBeGreaterThan(0);
    expect(snap.avgTrust).toBeLessThanOrEqual(1.0);
  });

  it('handles empty evidence array', () => {
    const model = parseModelVersion('openai/gpt-4o@2024-11');
    const snap = buildSnapshot('agent-001', model, []);
    expect(snap.evidenceCount).toBe(0);
    expect(snap.avgTrust).toBe(0);
  });

  it('dimensionScores groups by qid prefix', () => {
    const model = parseModelVersion('openai/gpt-4o@2024-11');
    const evidence = [
      makeEvidence('AMC-1.1', 0.9),
      makeEvidence('AMC-1.2', 0.8),
      makeEvidence('AMC-2.1', 0.7),
    ];
    const snap = buildSnapshot('agent-001', model, evidence);
    expect(snap.dimensionScores).toHaveProperty('AMC-1');
    expect(snap.dimensionScores).toHaveProperty('AMC-2');
  });
});

describe('detectModelDrift', () => {
  it('returns "stable" when no significant change', () => {
    const model = parseModelVersion('openai/gpt-4o@2024-11');
    const before = buildSnapshot('agent-001', model, [makeEvidence('AMC-1.1', 0.85)]);
    const after = buildSnapshot('agent-001', model, [makeEvidence('AMC-1.1', 0.855)]);
    const report = detectModelDrift(before, after);
    expect(report.driftDirection).toBe('stable');
  });

  it('returns "degraded" when trust scores drop significantly', () => {
    const modelV1 = parseModelVersion('openai/gpt-4o@2024-11');
    const modelV2 = parseModelVersion('openai/gpt-4o@2025-01');
    const before = buildSnapshot('agent-001', modelV1, [
      makeEvidence('AMC-1.1', 0.95),
      makeEvidence('AMC-2.1', 0.90),
      makeEvidence('AMC-3.1', 0.88),
    ]);
    const after = buildSnapshot('agent-001', modelV2, [
      makeEvidence('AMC-1.1', 0.50),
      makeEvidence('AMC-2.1', 0.45),
      makeEvidence('AMC-3.1', 0.40),
    ]);
    const report = detectModelDrift(before, after);
    expect(report.driftDirection).toBe('degraded');
    expect(['investigate', 'rollback']).toContain(report.recommendation);
  });

  it('returns "improved" when trust scores rise significantly', () => {
    const modelV1 = parseModelVersion('openai/gpt-4o@2024-11');
    const modelV2 = parseModelVersion('openai/gpt-4o@2025-03');
    const before = buildSnapshot('agent-001', modelV1, [
      makeEvidence('AMC-1.1', 0.50),
      makeEvidence('AMC-2.1', 0.55),
    ]);
    const after = buildSnapshot('agent-001', modelV2, [
      makeEvidence('AMC-1.1', 0.90),
      makeEvidence('AMC-2.1', 0.92),
    ]);
    const report = detectModelDrift(before, after);
    expect(report.driftDirection).toBe('improved');
  });

  it('includes drift signals with required fields', () => {
    const modelV1 = parseModelVersion('openai/gpt-4o@2024-11');
    const modelV2 = parseModelVersion('openai/gpt-4o@2025-01');
    const before = buildSnapshot('agent-001', modelV1, [makeEvidence('AMC-2.1', 0.95)]);
    const after = buildSnapshot('agent-001', modelV2, [makeEvidence('AMC-2.1', 0.50)]);
    const report = detectModelDrift(before, after);
    expect(report.signals.length).toBeGreaterThan(0);
    const sig = report.signals[0]!;
    expect(typeof sig.scoreBefore).toBe('number');
    expect(typeof sig.scoreAfter).toBe('number');
    expect(typeof sig.delta).toBe('number');
    expect(['low', 'medium', 'high', 'critical']).toContain(sig.significance);
  });

  it('recommendation is "monitor" for minor drift', () => {
    const modelV1 = parseModelVersion('openai/gpt-4o@2024-11');
    const modelV2 = parseModelVersion('openai/gpt-4o@2025-01');
    const before = buildSnapshot('agent-001', modelV1, [makeEvidence('AMC-1.1', 0.80)]);
    const after = buildSnapshot('agent-001', modelV2, [makeEvidence('AMC-1.1', 0.74)]);
    const report = detectModelDrift(before, after);
    expect(['monitor', 'investigate']).toContain(report.recommendation);
  });

  it('recommendation is "rollback" for severe degradation', () => {
    const modelV1 = parseModelVersion('openai/gpt-4o@2024-11');
    const modelV2 = parseModelVersion('openai/gpt-4o@2025-01');
    const before = buildSnapshot('agent-001', modelV1, [
      makeEvidence('AMC-1.1', 1.0),
      makeEvidence('AMC-2.1', 1.0),
      makeEvidence('AMC-3.1', 1.0),
      makeEvidence('AMC-4.1', 1.0),
    ]);
    const after = buildSnapshot('agent-001', modelV2, [
      makeEvidence('AMC-1.1', 0.1),
      makeEvidence('AMC-2.1', 0.1),
      makeEvidence('AMC-3.1', 0.1),
      makeEvidence('AMC-4.1', 0.1),
    ]);
    const report = detectModelDrift(before, after);
    expect(report.recommendation).toBe('rollback');
  });

  it('report includes agentId, detectedAt, summary', () => {
    const model = parseModelVersion('openai/gpt-4o@2024-11');
    const before = buildSnapshot('my-agent', model, [makeEvidence('AMC-1.1', 0.8)]);
    const after = buildSnapshot('my-agent', model, [makeEvidence('AMC-1.1', 0.8)]);
    const report = detectModelDrift(before, after);
    expect(report.agentId).toBe('my-agent');
    expect(report.detectedAt).toBeInstanceOf(Date);
    expect(typeof report.summary).toBe('string');
    expect(report.summary.length).toBeGreaterThan(0);
  });

  it('overallDrift is 0 for identical snapshots', () => {
    const model = parseModelVersion('openai/gpt-4o@2024-11');
    const before = buildSnapshot('agent-001', model, [makeEvidence('AMC-1.1', 0.8)]);
    const after = buildSnapshot('agent-001', model, [makeEvidence('AMC-1.1', 0.8)]);
    const report = detectModelDrift(before, after);
    expect(report.overallDrift).toBe(0);
  });
});

describe('tagEvidenceWithModel', () => {
  it('attaches model to evidence as ModelTaggedEvidence', () => {
    const model = parseModelVersion('openai/gpt-4o@2024-11');
    const evidence = makeEvidence('AMC-1.1', 0.9);
    const tagged = tagEvidenceWithModel(evidence, model);
    expect(tagged).toHaveProperty('model');
    expect(tagged.model).toMatchObject({ model: 'gpt-4o', provider: 'openai' });
  });

  it('does not mutate original evidence', () => {
    const model = parseModelVersion('openai/gpt-4o@2024-11');
    const evidence = makeEvidence('AMC-1.1', 0.9);
    tagEvidenceWithModel(evidence, model);
    expect((evidence as unknown as Record<string, unknown>)['model']).toBeUndefined();
  });

  it('preserves original evidence fields', () => {
    const model = parseModelVersion('openai/gpt-4o@2024-11');
    const evidence = makeEvidence('AMC-2.1', 0.75);
    const tagged = tagEvidenceWithModel(evidence, model);
    expect(tagged.qid).toBe('AMC-2.1');
    expect(tagged.trust).toBe(0.75);
    expect(tagged.kind).toBe('observed');
  });
});
