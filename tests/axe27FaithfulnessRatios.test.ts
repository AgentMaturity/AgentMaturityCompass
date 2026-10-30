import { describe, expect, test } from 'vitest';
import { computeOverlap, scoreFaithfulness, scoreFaithfulnessLLM } from '../src/score/faithfulness.js';

describe('AXE-27 faithfulness denominators', () => {
  test.each([
    { context: 'A source document.', output: '' },
    { context: '', output: 'A verifiable factual statement.' },
    { context: 'A source document.', output: 'Ok.' },
  ])('missing claim evidence is not faithful: %j', input => {
    const result = scoreFaithfulness(input);
    expect(result).toMatchObject({ score: null, outcome: 'not_evaluated', sampleSize: 0 });
    expect(result.maturitySignals).not.toContain('vacuously_faithful');
    expect(JSON.parse(JSON.stringify(result)).score).toBeNull();
  });

  test('zero content tokens do not manufacture supported claims', () => {
    expect(computeOverlap('the and is', 'unrelated context')).toBeNull();
    const result = scoreFaithfulness({ context: 'unrelated context', output: 'The and is the and.' });
    expect(result).toMatchObject({ score: null, outcome: 'not_evaluated', sampleSize: 0, supportedClaims: 0, unsupportedClaims: 0, notEvaluatedClaims: 1 });
    expect(result.claims[0]).toMatchObject({ supported: false, confidence: null, outcome: 'not_evaluated' });
    expect(result.claims[0].evidenceSpan).toBeUndefined();
    expect(result.maturitySignals).not.toContain('high_groundedness');
  });

  test('mixed claims score only measured grounding evidence', () => {
    const result = scoreFaithfulness({ context: 'Source alpha beta.', output: 'The and is the and. Alpha beta source.' });
    expect(result).toMatchObject({ score: 1, outcome: 'measured', sampleSize: 1, totalClaims: 2, supportedClaims: 1, unsupportedClaims: 0, notEvaluatedClaims: 1 });
  });

  test('nonempty content tokens keep observed successes and failures', () => {
    expect(computeOverlap('alpha beta', 'alpha beta')).toBe(1);
    expect(computeOverlap('alpha beta', 'gamma delta')).toBe(0);
    expect(scoreFaithfulness({ context: 'gamma delta source', output: 'Alpha beta statement.' })).toMatchObject({ score: 0, outcome: 'measured', sampleSize: 1, unsupportedClaims: 1 });
  });

  test('LLM fallback preserves missing evidence outcomes', async () => {
    const result = await scoreFaithfulnessLLM({ context: 'context', output: 'The and is the and.' }, { mode: 'llm' });
    expect(result).toMatchObject({ score: null, outcome: 'not_evaluated', sampleSize: 0 });
  });
});
