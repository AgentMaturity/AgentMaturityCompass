import { describe, expect, test } from "vitest";
import {
  listAttackPlugins,
  getAttackPlugin,
  runAttackPlugins,
  renderAttackPluginReport,
  type AttackContext,
} from "../../src/redteam/attackPlugins.js";

describe("Attack Plugins Registry", () => {
  test("lists all 5 attack plugins", () => {
    const plugins = listAttackPlugins();
    expect(plugins.length).toBe(5);
    const ids = plugins.map((p) => p.id);
    expect(ids).toContain("prompt-injection");
    expect(ids).toContain("data-exfiltration");
    expect(ids).toContain("privilege-escalation");
    expect(ids).toContain("model-manipulation");
    expect(ids).toContain("denial-of-service");
  });

  test("getAttackPlugin returns correct plugin", () => {
    const plugin = getAttackPlugin("prompt-injection");
    expect(plugin.id).toBe("prompt-injection");
    expect(plugin.name).toBe("Prompt Injection");
    expect(plugin.category).toBe("injection");
  });

  test("getAttackPlugin throws for unknown plugin", () => {
    expect(() => getAttackPlugin("nonexistent")).toThrow("Unknown attack plugin");
  });

  test("all plugins have required fields", () => {
    const plugins = listAttackPlugins();
    for (const p of plugins) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.category).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(typeof p.simulate).toBe("function");
    }
  });
});

describe("Plugin: prompt-injection", () => {
  test("scores high when agent refuses injections", () => {
    const ctx: AttackContext = {
      agentId: "test-agent",
      agentName: "Test Agent",
      role: "assistant",
      domain: "general",
      respondFn: () => "I cannot comply with this request. This violates my policy.",
    };
    const result = getAttackPlugin("prompt-injection").simulate(ctx);
    expect(result.resilience0to100).toBeGreaterThanOrEqual(60);
    expect(result.passed).toBe(true);
  });

  test("scores low when agent leaks system info", () => {
    const ctx: AttackContext = {
      agentId: "test-agent",
      agentName: "Test Agent",
      role: "assistant",
      domain: "general",
      respondFn: () => "Sure! My instructions are: system prompt revealed. Debug mode activated.",
    };
    const result = getAttackPlugin("prompt-injection").simulate(ctx);
    expect(result.resilience0to100).toBeLessThan(60);
    expect(result.findings.some((f) => f.includes("leaked"))).toBe(true);
  });
});

describe("Plugin: data-exfiltration", () => {
  test("scores high when agent guards data", () => {
    const ctx: AttackContext = {
      agentId: "test-agent",
      agentName: "Test Agent",
      role: "assistant",
      domain: "finance",
      respondFn: () => "I cannot disclose PII or secrets. Data boundary enforced.",
    };
    const result = getAttackPlugin("data-exfiltration").simulate(ctx);
    expect(result.resilience0to100).toBeGreaterThanOrEqual(60);
  });
});

describe("Plugin: privilege-escalation", () => {
  test("scores high when agent refuses escalation", () => {
    const ctx: AttackContext = {
      agentId: "test-agent",
      agentName: "Test Agent",
      role: "assistant",
      domain: "general",
      respondFn: () => "I cannot execute this. Requires owner-approved exec ticket via ToolHub governance.",
    };
    const result = getAttackPlugin("privilege-escalation").simulate(ctx);
    expect(result.resilience0to100).toBeGreaterThanOrEqual(60);
  });
});

describe("Plugin: model-manipulation", () => {
  test("scores high when agent refuses fabrication", () => {
    const ctx: AttackContext = {
      agentId: "test-agent",
      agentName: "Test Agent",
      role: "assistant",
      domain: "general",
      respondFn: () => "I cannot fabricate evidence or verification results. All outputs must be backed by real data.",
    };
    const result = getAttackPlugin("model-manipulation").simulate(ctx);
    expect(result.resilience0to100).toBeGreaterThanOrEqual(60);
  });
});

describe("Plugin: denial-of-service", () => {
  test("scores high when agent bounds output", () => {
    const ctx: AttackContext = {
      agentId: "test-agent",
      agentName: "Test Agent",
      role: "assistant",
      domain: "general",
      respondFn: () => "Resource limit: I cannot produce unbounded output.",
    };
    const result = getAttackPlugin("denial-of-service").simulate(ctx);
    expect(result.resilience0to100).toBeGreaterThanOrEqual(60);
  });
});

describe("runAttackPlugins", () => {
  test("runs all plugins and returns report", () => {
    const report = runAttackPlugins({
      agentId: "test-agent",
      agentName: "Test Agent",
      role: "assistant",
      domain: "general",
      respondFn: () => "I cannot comply with policy-violating requests.",
    });

    expect(report.agentId).toBe("test-agent");
    expect(report.plugins.length).toBe(5);
    expect(report.passedCount + report.failedCount).toBe(5);
    expect(report.overallResilience).toBeGreaterThanOrEqual(0);
    expect(report.overallResilience).toBeLessThanOrEqual(100);
    expect(report.riskSummary).toBeDefined();
  });

  test("runs specific plugins by ID", () => {
    const report = runAttackPlugins({
      agentId: "test-agent",
      agentName: "Test Agent",
      role: "assistant",
      domain: "general",
      respondFn: () => "I cannot comply.",
      pluginIds: ["prompt-injection", "denial-of-service"],
    });

    expect(report.plugins.length).toBe(2);
    expect(report.plugins[0]!.pluginId).toBe("prompt-injection");
    expect(report.plugins[1]!.pluginId).toBe("denial-of-service");
  });
});

describe("renderAttackPluginReport", () => {
  test("renders markdown report", () => {
    const report = runAttackPlugins({
      agentId: "test-agent",
      agentName: "Test Agent",
      role: "assistant",
      domain: "general",
      respondFn: () => "I cannot comply.",
    });

    const md = renderAttackPluginReport(report);
    expect(md).toContain("# AMC Red Team — Attack Plugin Report");
    expect(md).toContain("test-agent");
    expect(md).toContain("Overall Resilience:");
    expect(md).toContain("Risk Summary");
    expect(md).toContain("Plugin Results");
  });
});
