import { describe, expect, test } from "vitest";
import {
  listBuiltInScenarios,
  listScenariosWithMeta,
  loadScenario,
  parseScenarioYaml,
} from "../../src/mirofish/scenarios.js";
import { scenarioSchema } from "../../src/mirofish/types.js";

/* ── Built-in scenario discovery ──────────────────── */

describe("listBuiltInScenarios", () => {
  test("finds all 6 built-in scenarios", () => {
    const names = listBuiltInScenarios();
    expect(names.length).toBe(6);
    expect(names).toContain("junior-copilot");
    expect(names).toContain("senior-autonomous");
    expect(names).toContain("compliance-heavy");
    expect(names).toContain("speed-demon");
    expect(names).toContain("adversarial");
    expect(names).toContain("fleet-mixed");
  });

  test("returns sorted names", () => {
    const names = listBuiltInScenarios();
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });
});

/* ── Scenario loading ─────────────────────────────── */

describe("loadScenario", () => {
  test("loads each built-in scenario successfully", () => {
    const names = listBuiltInScenarios();
    for (const name of names) {
      const scenario = loadScenario(name);
      expect(scenario.name).toBe(name);
      expect(scenario.description.length).toBeGreaterThan(0);
    }
  });

  test("throws for unknown scenario name", () => {
    expect(() => loadScenario("nonexistent-scenario-xyz")).toThrow(/Unknown scenario/);
  });

  test("throws for nonexistent file path", () => {
    expect(() => loadScenario("/tmp/does-not-exist-abc123.yml")).toThrow(/not found/);
  });
});

/* ── Scenario validation ──────────────────────────── */

describe("scenario schema validation", () => {
  const builtIns = listBuiltInScenarios();

  test.each(builtIns as unknown as string[])("scenario '%s' passes Zod validation", (name) => {
    const scenario = loadScenario(name);
    const result = scenarioSchema.safeParse(scenario);
    expect(result.success).toBe(true);
  });

  test.each(builtIns as unknown as string[])("scenario '%s' has all 7 behavior dimensions", (name) => {
    const scenario = loadScenario(name);
    const dims = ["autonomy", "errorRate", "escalationFrequency", "toolUsage", "responseLatency", "hallucinationRate", "complianceAdherence"] as const;
    for (const dim of dims) {
      expect(typeof scenario.behavior[dim]).toBe("number");
      expect(scenario.behavior[dim]).toBeGreaterThanOrEqual(0);
      expect(scenario.behavior[dim]).toBeLessThanOrEqual(1);
    }
  });

  test("fleet-mixed scenario has fleet members", () => {
    const scenario = loadScenario("fleet-mixed");
    expect(scenario.fleet).toBeDefined();
    expect(scenario.fleet!.length).toBeGreaterThanOrEqual(2);
    for (const member of scenario.fleet!) {
      expect(member.name.length).toBeGreaterThan(0);
      expect(member.weight).toBeGreaterThan(0);
    }
  });
});

/* ── YAML parsing ─────────────────────────────────── */

describe("parseScenarioYaml", () => {
  test("parses valid YAML string", () => {
    const yaml = `
name: test-inline
description: An inline test scenario
version: "1.0.0"
behavior:
  autonomy: 0.5
  errorRate: 0.1
  escalationFrequency: 0.3
  toolUsage: 0.5
  responseLatency: 0.3
  hallucinationRate: 0.05
  complianceAdherence: 0.8
`;
    const scenario = parseScenarioYaml(yaml);
    expect(scenario.name).toBe("test-inline");
    expect(scenario.behavior.autonomy).toBe(0.5);
  });

  test("rejects YAML with missing required fields", () => {
    const yaml = `
name: incomplete
description: missing behavior
`;
    expect(() => parseScenarioYaml(yaml)).toThrow();
  });

  test("rejects behavior values outside [0, 1]", () => {
    const yaml = `
name: bad-range
description: out of range
behavior:
  autonomy: 1.5
  errorRate: 0.1
  escalationFrequency: 0.3
  toolUsage: 0.5
  responseLatency: 0.3
  hallucinationRate: 0.05
  complianceAdherence: 0.8
`;
    expect(() => parseScenarioYaml(yaml)).toThrow();
  });

  test("rejects negative behavior values", () => {
    const yaml = `
name: negative
description: negative value
behavior:
  autonomy: -0.1
  errorRate: 0.1
  escalationFrequency: 0.3
  toolUsage: 0.5
  responseLatency: 0.3
  hallucinationRate: 0.05
  complianceAdherence: 0.8
`;
    expect(() => parseScenarioYaml(yaml)).toThrow();
  });
});

/* ── Metadata listing ─────────────────────────────── */

describe("listScenariosWithMeta", () => {
  test("returns metadata for all scenarios", () => {
    const metas = listScenariosWithMeta();
    expect(metas.length).toBe(6);
    for (const meta of metas) {
      expect(meta.name.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(0);
    }
  });

  test("all scenarios have tags", () => {
    const metas = listScenariosWithMeta();
    for (const meta of metas) {
      expect(meta.tags.length).toBeGreaterThan(0);
    }
  });
});
