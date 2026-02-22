/**
 * apiRouters.test.ts — Tests for API helpers and route dispatch.
 */

import { describe, expect, test } from 'vitest';

import { queryParam, pathParam } from '../src/api/apiHelpers.js';

/* ── queryParam ──────────────────────────────────────────────────── */

describe('apiHelpers — queryParam', () => {
  test('extracts existing parameter', () => {
    expect(queryParam('/api/v1/foo?bar=baz', 'bar')).toBe('baz');
  });

  test('returns undefined for missing parameter', () => {
    expect(queryParam('/api/v1/foo?bar=baz', 'qux')).toBeUndefined();
  });

  test('returns undefined when no query string', () => {
    expect(queryParam('/api/v1/foo', 'bar')).toBeUndefined();
  });

  test('handles multiple parameters', () => {
    expect(queryParam('/api?a=1&b=2&c=3', 'b')).toBe('2');
  });

  test('handles encoded parameters', () => {
    expect(queryParam('/api?q=hello%20world', 'q')).toBe('hello world');
  });
});

/* ── pathParam ───────────────────────────────────────────────────── */

describe('apiHelpers — pathParam', () => {
  test('extracts single path parameter', () => {
    const params = pathParam('/api/v1/watch/receipts/agent-123', '/api/v1/watch/receipts/:agentId');
    expect(params).not.toBeNull();
    expect(params!.agentId).toBe('agent-123');
  });

  test('extracts multiple path parameters', () => {
    const params = pathParam('/api/v1/score/session/s1/question/q2', '/api/v1/score/session/:sessionId/question/:questionId');
    expect(params).not.toBeNull();
    expect(params!.sessionId).toBe('s1');
    expect(params!.questionId).toBe('q2');
  });

  test('returns null for non-matching paths', () => {
    expect(pathParam('/api/v1/foo/bar', '/api/v1/baz/:id')).toBeNull();
  });

  test('returns null for different segment counts', () => {
    expect(pathParam('/api/v1/foo', '/api/v1/foo/bar/:id')).toBeNull();
  });

  test('matches exact path with no params', () => {
    const params = pathParam('/api/v1/health', '/api/v1/health');
    expect(params).not.toBeNull();
    expect(Object.keys(params!).length).toBe(0);
  });
});

/* ── Note on router tests ────────────────────────────────────────── */

// The routers (shieldRouter, enforceRouter, vaultRouter, watchRouter,
// scoreRouter, productRouter) depend on the full AMC runtime (shield,
// enforce, vault modules). Testing them end-to-end requires mocking
// HTTP IncomingMessage/ServerResponse. Below we test that the imports
// resolve and export the expected functions.

describe('API Router imports', () => {
  test('apiHelpers exports all functions', async () => {
    const mod = await import('../src/api/apiHelpers.js');
    expect(typeof mod.bodyJson).toBe('function');
    expect(typeof mod.queryParam).toBe('function');
    expect(typeof mod.pathParam).toBe('function');
    expect(typeof mod.apiSuccess).toBe('function');
    expect(typeof mod.apiError).toBe('function');
    expect(typeof mod.requireMethod).toBe('function');
  });

  test('shieldRouter exports handleShieldRoute', async () => {
    const mod = await import('../src/api/shieldRouter.js');
    expect(typeof mod.handleShieldRoute).toBe('function');
  });

  test('enforceRouter exports handleEnforceRoute', async () => {
    const mod = await import('../src/api/enforceRouter.js');
    expect(typeof mod.handleEnforceRoute).toBe('function');
  });

  test('vaultRouter exports handleVaultRoute', async () => {
    const mod = await import('../src/api/vaultRouter.js');
    expect(typeof mod.handleVaultRoute).toBe('function');
  });

  test('watchRouter exports handleWatchRoute', async () => {
    const mod = await import('../src/api/watchRouter.js');
    expect(typeof mod.handleWatchRoute).toBe('function');
  });

  test('scoreRouter exports handleScoreRoute', async () => {
    const mod = await import('../src/api/scoreRouter.js');
    expect(typeof mod.handleScoreRoute).toBe('function');
  });

  test('productRouter exports handleProductRoute', async () => {
    const mod = await import('../src/api/productRouter.js');
    expect(typeof mod.handleProductRoute).toBe('function');
  });

  test('assuranceRouter exports handleAssuranceRoute', async () => {
    const mod = await import('../src/api/assuranceRouter.js');
    expect(typeof mod.handleAssuranceRoute).toBe('function');
  });

  test('api/index exports handleApiRoute', async () => {
    const mod = await import('../src/api/index.js');
    expect(typeof mod.handleApiRoute).toBe('function');
  });
});
