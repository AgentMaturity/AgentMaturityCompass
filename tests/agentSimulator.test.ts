/**
 * agentSimulator.test.ts — Unit tests for pre-deployment simulation engine
 */
import { describe, it, expect } from 'vitest';
import {
  runSimulation,
  getBuiltinScenarios,
  generateSimReport,
} from '../src/score/agentSimulator.js';
import type { SimScenario } from '../src/score/agentSimulator.js';

describe('getBuiltinScenarios', () => {
  it('returns at least 15 scenarios', async () => {
    const scenarios = getBuiltinScenarios();
    expect(scenarios.length).toBeGreaterThanOrEqual(15);
  });

  it('each scenario has required fields', async () => {
    const scenarios = getBuiltinScenarios();
    for (const s of scenarios) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(s.input).toBeTruthy();
      expect(s.expectedBehavior).toBeTruthy();
      expect(s.category).toBeTruthy();
      expect(['low', 'medium', 'high', 'critical']).toContain(s.severity);
    }
  });

  it('covers injection category', async () => {
    const scenarios = getBuiltinScenarios();
    expect(scenarios.some(s => s.category === 'injection')).toBe(true);
  });

  it('covers pii category', async () => {
    const scenarios = getBuiltinScenarios();
    expect(scenarios.some(s => s.category === 'pii')).toBe(true);
  });

  it('covers normal/safe category', async () => {
    const scenarios = getBuiltinScenarios();
    expect(scenarios.some(s => s.category === 'normal')).toBe(true);
  });

  it('covers governance category', async () => {
    const scenarios = getBuiltinScenarios();
    expect(scenarios.some(s => s.category === 'governance')).toBe(true);
  });

  it('has at least 4 distinct categories', async () => {
    const scenarios = getBuiltinScenarios();
    const categories = new Set(scenarios.map(s => s.category));
    expect(categories.size).toBeGreaterThanOrEqual(4);
  });

  it('has critical severity scenarios', async () => {
    const scenarios = getBuiltinScenarios();
    expect(scenarios.some(s => s.severity === 'critical')).toBe(true);
  });
});

describe('runSimulation', () => {
  it('returns a SimReport with correct shape', async () => {
    const scenarios = getBuiltinScenarios();
    const report = await runSimulation(scenarios, { agentId: 'test-agent', requiredPassRate: 0.75 });
    expect(report.agentId).toBe('test-agent');
    expect(typeof report.totalScenarios).toBe('number');
    expect(typeof report.passed).toBe('number');
    expect(typeof report.failed).toBe('number');
    expect(typeof report.passRate).toBe('number');
    expect(typeof report.coverageScore).toBe('number');
    expect(typeof report.readyForProduction).toBe('boolean');
    expect(Array.isArray(report.criticalFailures)).toBe(true);
    expect(typeof report.byCategory).toBe('object');
  });

  it('totalScenarios equals passed + failed', async () => {
    const scenarios = getBuiltinScenarios();
    const report = await runSimulation(scenarios, { agentId: 'test-agent' });
    expect(report.passed + report.failed).toBe(report.totalScenarios);
  });

  it('passRate is between 0 and 1', async () => {
    const scenarios = getBuiltinScenarios();
    const report = await runSimulation(scenarios, { agentId: 'test-agent' });
    expect(report.passRate).toBeGreaterThanOrEqual(0);
    expect(report.passRate).toBeLessThanOrEqual(1);
  });

  it('coverageScore is between 0 and 100', async () => {
    const scenarios = getBuiltinScenarios();
    const report = await runSimulation(scenarios, { agentId: 'test-agent' });
    expect(report.coverageScore).toBeGreaterThanOrEqual(0);
    expect(report.coverageScore).toBeLessThanOrEqual(100);
  });

  it('byCategory contains entries for each category in scenarios', async () => {
    const scenarios = getBuiltinScenarios();
    const report = await runSimulation(scenarios, { agentId: 'test-agent' });
    const categories = new Set(scenarios.map(s => s.category));
    for (const cat of categories) {
      expect(report.byCategory).toHaveProperty(cat);
    }
  });

  it('byCategory totals sum to totalScenarios', async () => {
    const scenarios = getBuiltinScenarios();
    const report = await runSimulation(scenarios, { agentId: 'test-agent' });
    const catTotal = Object.values(report.byCategory).reduce((sum, c) => sum + c.total, 0);
    expect(catTotal).toBe(report.totalScenarios);
  });

  it('readyForProduction=false when passRate < requiredPassRate', async () => {
    const scenarios = getBuiltinScenarios();
    const report = await runSimulation(scenarios, { agentId: 'test-agent', requiredPassRate: 1.01 });
    expect(report.readyForProduction).toBe(false);
  });

  it('readyForProduction=false when there are critical failures', async () => {
    // critical failures always block production readiness
    const scenarios = getBuiltinScenarios();
    const report = await runSimulation(scenarios, { agentId: 'test-agent', requiredPassRate: 0 });
    // If any critical failures exist, readyForProduction must be false
    if (report.criticalFailures.length > 0) {
      expect(report.readyForProduction).toBe(false);
    }
  });

  it('handles empty scenario list gracefully', async () => {
    const report = await runSimulation([], { agentId: 'test-agent' });
    expect(report.totalScenarios).toBe(0);
    expect(report.passRate).toBe(0);
    expect(report.readyForProduction).toBe(false);
  });

  it('criticalFailures only contains failed scenarios', async () => {
    const scenarios = getBuiltinScenarios();
    const report = await runSimulation(scenarios, { agentId: 'test-agent' });
    for (const failure of report.criticalFailures) {
      expect(failure.passed).toBe(false);
    }
  });

  it('runAt is a Date', async () => {
    const scenarios = getBuiltinScenarios();
    const report = await runSimulation(scenarios, { agentId: 'test-agent' });
    expect(report.runAt).toBeInstanceOf(Date);
  });

  it('custom scenarios are included in results', async () => {
    const custom: SimScenario[] = [{
      id: 'custom-001',
      name: 'Basic greeting',
      description: 'Safe greeting scenario',
      input: 'Hello, how are you?',
      expectedBehavior: 'allow',
      category: 'normal',
      severity: 'low',
      tags: ['custom'],
    }];
    const report = await runSimulation(custom, { agentId: 'test-agent' });
    expect(report.totalScenarios).toBe(1);
    expect(report.byCategory).toHaveProperty('normal');
  });

  it('runId is set', async () => {
    const report = await runSimulation([], { agentId: 'test-agent' });
    expect(report.runId).toBeTruthy();
  });

  it('recommendations is an array', async () => {
    const scenarios = getBuiltinScenarios();
    const report = await runSimulation(scenarios, { agentId: 'test-agent' });
    expect(Array.isArray(report.recommendations)).toBe(true);
  });
});

describe('generateSimReport', () => {
  it('returns a non-empty markdown string', async () => {
    const scenarios = getBuiltinScenarios();
    const report = await runSimulation(scenarios, { agentId: 'test-agent' });
    const md = generateSimReport(report);
    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(100);
  });

  it('contains AMC Simulation Report header', async () => {
    const scenarios = getBuiltinScenarios();
    const report = await runSimulation(scenarios, { agentId: 'test-agent' });
    const md = generateSimReport(report);
    expect(md).toContain('AMC Simulation Report');
  });

  it('contains agentId in report', async () => {
    const scenarios = getBuiltinScenarios();
    const report = await runSimulation(scenarios, { agentId: 'my-special-agent' });
    const md = generateSimReport(report);
    expect(md).toContain('my-special-agent');
  });

  it('contains pass rate percentage', async () => {
    const scenarios = getBuiltinScenarios();
    const report = await runSimulation(scenarios, { agentId: 'test-agent' });
    const md = generateSimReport(report);
    expect(md).toMatch(/\d+(\.\d+)?%/);
  });

  it('contains category breakdown', async () => {
    const scenarios = getBuiltinScenarios();
    const report = await runSimulation(scenarios, { agentId: 'test-agent' });
    const md = generateSimReport(report);
    const categories = Object.keys(report.byCategory);
    expect(categories.some(cat => md.includes(cat))).toBe(true);
  });

  it('mentions production readiness', async () => {
    const scenarios = getBuiltinScenarios();
    const report = await runSimulation(scenarios, { agentId: 'test-agent' });
    const md = generateSimReport(report);
    expect(md.toLowerCase()).toMatch(/production|ready|deploy/);
  });
});
