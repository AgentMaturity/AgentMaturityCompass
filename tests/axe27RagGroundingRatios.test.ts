import { describe, expect, test } from 'vitest';
import { buildRagGroundingEvalReceipt, renderRagGroundingEvalAuditExport } from '../src/score/ragGroundingEval.js';

const metricIds = ['faithfulnessScore', 'retrievedSupportQuality', 'unsupportedClaimRate', 'contradictionRate', 'staleChunkRate', 'poisoningSignalRate', 'provenanceCoverage', 'citationProvenanceCoverage'] as const;

describe('AXE-27 RAG grounding denominators', () => {
  test.each([{ cases: [] }, { cases: [{ queryId: 'query', query: 'A question', answer: 'An answer', retrievedChunks: [], claims: [] }] }])('absent claim and chunk evidence stays unevaluated: %j', ({ cases }) => {
    const receipt = buildRagGroundingEvalReceipt({ evaluationId: 'empty', agentId: 'agent', cases });
    for (const id of metricIds) {
      expect(receipt.metrics[id], id).toBeNull();
      expect(receipt.metrics.metricOutcomes[id], id).toBe('not_evaluated');
      expect(receipt.metrics.metricSampleSizes[id], id).toBe(0);
    }
    expect(receipt.metrics.outcome).toBe('not_evaluated');
    expect(receipt.findings).toEqual([]);
    expect(receipt.scoreImpact).toMatchObject({ penalty0to100: null, outcome: 'not_evaluated' });
    expect(receipt.failClosed).toBe(true);
    const markdown = renderRagGroundingEvalAuditExport(receipt);
    expect(markdown).toContain('Faithfulness score: not evaluated');
    expect(markdown).toContain('Score penalty: not evaluated');
  });

  test('observed claims do not imply observations of absent retrieved chunks or citation edges', () => {
    const receipt = buildRagGroundingEvalReceipt({ evaluationId: 'claim-only', agentId: 'agent', cases: [
      { queryId: 'query', query: 'A question', answer: 'An unsupported answer', retrievedChunks: [], claims: [
        { claimId: 'claim', text: 'Unsupported claim', label: 'unsupported', evidenceChunkIds: [], confidence: 1 },
      ] },
    ] });
    expect(receipt.metrics).toMatchObject({ faithfulnessScore: 0, unsupportedClaimRate: 1, retrievedSupportQuality: 0, staleChunkRate: null, poisoningSignalRate: null, provenanceCoverage: null, citationProvenanceCoverage: null });
    expect(receipt.metrics.metricOutcomes.faithfulnessScore).toBe('measured');
    expect(receipt.metrics.metricSampleSizes.faithfulnessScore).toBe(1);
    expect(receipt.failClosed).toBe(true);
  });

  test('measured complete support preserves perfect grounding and zero observed harm', () => {
    const receipt = buildRagGroundingEvalReceipt({ evaluationId: 'measured', agentId: 'agent', cases: [
      { queryId: 'query', query: 'A question', answer: 'Supported answer', retrievedChunks: [
        { chunkId: 'chunk', text: 'Source evidence', sourceId: 'source', sourceUri: 'https://example.com/source', documentVersion: '1', ingestedAt: '2026-01-01T00:00:00Z', retrievedAt: '2026-01-02T00:00:00Z', permissionStatus: 'allowed' },
      ], claims: [{ claimId: 'claim', text: 'Supported claim', label: 'supported', evidenceChunkIds: ['chunk'], confidence: 1 }] },
    ] });
    expect(receipt.metrics).toMatchObject({ faithfulnessScore: 1, retrievedSupportQuality: 1, unsupportedClaimRate: 0, contradictionRate: 0, staleChunkRate: 0, poisoningSignalRate: 0, provenanceCoverage: 1, citationProvenanceCoverage: 1 });
    expect(receipt.scoreImpact).toMatchObject({ penalty0to100: 0, outcome: 'measured' });
  });
});
