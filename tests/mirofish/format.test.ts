import { describe, expect, test } from "vitest";
import { runSimulation, runStressTest } from "../../src/mirofish/engine.js";
import {
  formatSimulationText,
  formatSimulationMarkdown,
  formatComparisonText,
  formatStressText,
  formatScenarioList,
} from "../../src/mirofish/format.js";
import type { Scenario, SimulationOptions } from "../../src/mirofish/types.js";

const scenario: Scenario = {
  name: "format-test",
  description: "test",
  version: "1.0.0",
  behavior: {
    autonomy: 0.5,
    errorRate: 0.1,
    escalationFrequency: 0.3,
    toolUsage: 0.5,
    responseLatency: 0.3,
    hallucinationRate: 0.05,
    complianceAdherence: 0.75,
  },
};

const opts: SimulationOptions = { iterations: 100, seed: 42 };

describe("formatSimulationText", () => {
  test("produces non-empty output", () => {
    const result = runSimulation(scenario, opts);
    const text = formatSimulationText(result);
    expect(text.length).toBeGreaterThan(100);
  });

  test("includes scenario name", () => {
    const result = runSimulation(scenario, opts);
    const text = formatSimulationText(result);
    expect(text).toContain("format-test");
  });

  test("includes Mirofish branding", () => {
    const result = runSimulation(scenario, opts);
    const text = formatSimulationText(result);
    expect(text).toContain("Mirofish");
  });

  test("includes all layer names", () => {
    const result = runSimulation(scenario, opts);
    const text = formatSimulationText(result);
    expect(text).toContain("Strategic Agent Operations");
    expect(text).toContain("Leadership & Autonomy");
    expect(text).toContain("Culture & Alignment");
    expect(text).toContain("Resilience");
    expect(text).toContain("Skills");
  });

  test("includes governance status", () => {
    const result = runSimulation(scenario, opts);
    const text = formatSimulationText(result);
    expect(text).toMatch(/Governance gates/);
  });
});

describe("formatSimulationMarkdown", () => {
  test("produces valid markdown with header", () => {
    const result = runSimulation(scenario, opts);
    const md = formatSimulationMarkdown(result);
    expect(md).toContain("# Mirofish Simulation");
    expect(md).toContain("## Layer Scores");
  });

  test("includes table header", () => {
    const result = runSimulation(scenario, opts);
    const md = formatSimulationMarkdown(result);
    expect(md).toContain("| Layer | Mean |");
  });

  test("includes iteration count", () => {
    const result = runSimulation(scenario, opts);
    const md = formatSimulationMarkdown(result);
    expect(md).toContain("100");
  });
});

describe("formatComparisonText", () => {
  test("shows both scenario names", () => {
    const s2: Scenario = { ...scenario, name: "compare-b" };
    const r1 = runSimulation(scenario, opts);
    const r2 = runSimulation(s2, opts);
    const text = formatComparisonText(r1, r2);
    expect(text).toContain("format-test");
    expect(text).toContain("compare-b");
  });

  test("includes delta column", () => {
    const s2: Scenario = {
      ...scenario,
      name: "compare-different",
      behavior: { ...scenario.behavior, autonomy: 0.9 },
    };
    const r1 = runSimulation(scenario, opts);
    const r2 = runSimulation(s2, opts);
    const text = formatComparisonText(r1, r2);
    expect(text).toContain("Comparison");
  });
});

describe("formatStressText", () => {
  test("produces output with scenario name", () => {
    const result = runStressTest(scenario, opts);
    const text = formatStressText(result);
    expect(text).toContain("format-test");
    expect(text).toContain("Stress Test");
  });
});

describe("formatScenarioList", () => {
  test("formats scenario list with names and descriptions", () => {
    const scenarios = [
      { name: "test-a", description: "First scenario", tags: ["tag1"] as readonly string[] },
      { name: "test-b", description: "Second scenario", tags: ["tag2", "tag3"] as readonly string[] },
    ];
    const text = formatScenarioList(scenarios);
    expect(text).toContain("test-a");
    expect(text).toContain("test-b");
    expect(text).toContain("First scenario");
    expect(text).toContain("#tag1");
    expect(text).toContain("#tag2");
  });

  test("handles empty list", () => {
    const text = formatScenarioList([]);
    expect(text).toContain("Scenarios");
  });
});
