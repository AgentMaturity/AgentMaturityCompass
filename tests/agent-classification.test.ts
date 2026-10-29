import { describe, it, expect } from "vitest";
import { classifyAgentVsWorkflow } from "../src/score/agentVsWorkflow.js";

describe("classifyAgentVsWorkflow", () => {
  it("returns required fields", () => {
    const result = classifyAgentVsWorkflow({});
    expect(result).toHaveProperty("classification");
    expect(result).toHaveProperty("amcLevel");
    expect(result).toHaveProperty("marketingLabel");
    expect(result).toHaveProperty("governanceUrgency");
  });

  it("workflow classified at avg < 2", () => {
    const result = classifyAgentVsWorkflow({ a: 1, b: 1, c: 1 });
    expect(result.classification).toBe("workflow");
    expect(result.amcLevel).toBe("L1");
  });

  it("agent classified at avg >= 4", () => {
    const result = classifyAgentVsWorkflow({ a: 4, b: 5, c: 4, d: 4 });
    expect(result.classification).toBe("agent");
    expect(result.amcLevel).toBe("L4");
  });

  it("smart-workflow at avg ~2.5", () => {
    const result = classifyAgentVsWorkflow({ a: 2, b: 3, c: 2 });
    expect(result.classification).toBe("smart-workflow");
  });

  it("advanced-agent at avg 5", () => {
    const result = classifyAgentVsWorkflow({ a: 5, b: 5, c: 5 });
    expect(result.classification).toBe("advanced-agent");
    expect(result.governanceUrgency).toBe("critical");
  });

  it("governance urgency is 'none' for workflow", () => {
    const result = classifyAgentVsWorkflow({ a: 0, b: 0 });
    expect(result.governanceUrgency).toBe("none");
  });

  it("governance required for proto-agent (L3+)", () => {
    const result = classifyAgentVsWorkflow({ a: 3, b: 3, c: 3 });
    expect(result.governanceRequired).toBe(true);
    expect(result.governanceUrgency).toBe("required");
  });

  it("marketingLabel is a non-empty string", () => {
    const result = classifyAgentVsWorkflow({});
    expect(typeof result.marketingLabel).toBe("string");
    expect(result.marketingLabel.length).toBeGreaterThan(0);
  });

  it("empty input has no classification", () => {
    const result = classifyAgentVsWorkflow({});
    expect(result.classification).toBeNull();
    expect(result.outcome).toBe("not_evaluated");
  });
});
