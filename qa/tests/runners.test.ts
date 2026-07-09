import assert from 'node:assert/strict';
import test from 'node:test';
import { parseVitestOutput } from '../src/runners.js';

test('parseVitestOutput records a non-empty passing run', () => {
  const result = parseVitestOutput(
    'Test Files  2 passed (2)\nTests  7 passed (7)\n',
    125,
    0,
  );

  assert.deepEqual(result, {
    status: 'passed',
    totalTests: 7,
    passed: 7,
    failed: 0,
    skipped: 0,
    durationMs: 125,
    failures: [],
  });
});

test('parseVitestOutput records failed tests and names', () => {
  const result = parseVitestOutput(
    'Test Files  1 failed | 2 passed (3)\nTests  3 failed | 7 passed (10)\nFAIL  tests/example.test.ts > example suite > rejects bad input\n',
    250,
    1,
  );

  assert.equal(result.status, 'failed');
  assert.equal(result.totalTests, 10);
  assert.equal(result.passed, 7);
  assert.equal(result.failed, 3);
  assert.deepEqual(result.failures, [{
    testName: 'tests/example.test.ts > example suite > rejects bad input',
    errorMessage: 'example suite > rejects bad input',
  }]);
});

test('parseVitestOutput fails closed when no tests are discovered', () => {
  const result = parseVitestOutput('Test Files  0 passed (0)\nTests  0 passed (0)\n', 5, 0);

  assert.equal(result.status, 'error');
  assert.equal(result.totalTests, 0);
});

test('parseVitestOutput reports command errors without fabricated failures', () => {
  const result = parseVitestOutput('Unable to start Vitest\n', 10, 1);

  assert.equal(result.status, 'error');
  assert.equal(result.totalTests, 0);
  assert.deepEqual(result.failures, []);
});
