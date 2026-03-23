import { describe, it, expect } from "vitest";
import { evaluateCIGate, generateGitHubAction, generateGitLabCI, generateConnectorConfig } from "../../src/integrations/ciGate.js";

describe("CI Gate", () => {
  it("passes when score meets threshold", () => {
    const result = evaluateCIGate(
      { workspace: "/tmp", minScore: 60 },
      { overallScore: 75, criticalCount: 0, warnings: [], dimensions: { observability: 80, reliability: 70 } },
    );
    expect(result.passed).toBe(true);
    expect(result.summary).toContain("PASSED");
  });

  it("fails when score below threshold", () => {
    const result = evaluateCIGate(
      { workspace: "/tmp", minScore: 80 },
      { overallScore: 55, criticalCount: 0, warnings: ["Low observability"], dimensions: { observability: 40 } },
    );
    expect(result.passed).toBe(false);
    expect(result.summary).toContain("FAILED");
  });

  it("fails on critical violations even with good score", () => {
    const result = evaluateCIGate(
      { workspace: "/tmp", minScore: 60, failOnCritical: true },
      { overallScore: 90, criticalCount: 2, warnings: [], dimensions: {} },
    );
    expect(result.passed).toBe(false);
    expect(result.criticalViolations).toBe(2);
  });

  it("generates GitHub annotations", () => {
    const result = evaluateCIGate(
      { workspace: "/tmp", minScore: 60 },
      { overallScore: 50, criticalCount: 1, warnings: ["Test warning"], dimensions: {} },
    );
    expect(result.annotations).toBeDefined();
    expect(result.annotations!.length).toBeGreaterThan(0);
  });
});

describe("GitHub Action Generator", () => {
  it("generates valid YAML with default config", () => {
    const yaml = generateGitHubAction({});
    expect(yaml).toContain("name: AMC Trust Gate");
    expect(yaml).toContain("amc run --auto");
    expect(yaml).toContain("actions/checkout@v4");
    expect(yaml).toContain("60"); // default threshold
  });

  it("respects custom min score", () => {
    const yaml = generateGitHubAction({ minScore: 80 });
    expect(yaml).toContain("80");
  });

  it("includes agent ID when specified", () => {
    const yaml = generateGitHubAction({ agentId: "my-agent" });
    expect(yaml).toContain("--agent my-agent");
  });
});

describe("GitLab CI Generator", () => {
  it("generates valid config", () => {
    const yaml = generateGitLabCI({});
    expect(yaml).toContain("amc-gate");
    expect(yaml).toContain("amc run --auto");
  });
});

describe("Connector Config Generator", () => {
  it("generates Langfuse config", () => {
    const config = generateConnectorConfig("langfuse");
    expect(config.envVars).toHaveProperty("AMC_LANGFUSE_PUBLIC_KEY");
    expect(config.configYaml).toContain("langfuse");
    expect(config.instructions).toContain("cloud.langfuse.com");
  });

  it("generates Helicone config", () => {
    const config = generateConnectorConfig("helicone");
    expect(config.envVars).toHaveProperty("AMC_HELICONE_API_KEY");
    expect(config.configYaml).toContain("helicone");
  });

  it("generates Datadog config", () => {
    const config = generateConnectorConfig("datadog");
    expect(config.envVars).toHaveProperty("AMC_DD_API_KEY");
  });
});
