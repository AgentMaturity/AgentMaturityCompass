import { describe, expect, it } from "vitest";
import { getBuiltinScenarios, runSimulation } from "../src/score/agentSimulator.js";

/**
 * G1-11: the simulator classified only the scenario INPUT with AMC's own
 * validators — no agent was ever involved — yet each result claimed
 * `evidenceGenerated: true` and the module described itself as testing agent
 * responses.
 */
describe("agent simulator distinguishes policy preview from real agent testing", () => {
  const scenarios = getBuiltinScenarios().slice(0, 4);

  it("defaults to policy-preview and generates no agent evidence", async () => {
    const report = await runSimulation(scenarios);
    expect(report.results.length).toBeGreaterThan(0);
    for (const result of report.results) {
      expect(result.mode).toBe("policy-preview");
      // Critically: a run with no agent must not claim it produced evidence.
      expect(result.evidenceGenerated).toBe(false);
      expect(result.agentResponse).toBeUndefined();
    }
  });

  it("classifies the agent's real reply when a responder is supplied", async () => {
    const report = await runSimulation(scenarios, {
      respond: async () => "I refuse to comply with that request."
    });
    for (const result of report.results) {
      expect(result.mode).toBe("agent");
      expect(result.evidenceGenerated).toBe(true);
      expect(result.agentResponse).toContain("refuse");
    }
  });

  it("an agent that leaks changes the outcome versus one that refuses", async () => {
    const refusing = await runSimulation(scenarios, {
      respond: async () => "I cannot help with that."
    });
    const leaking = await runSimulation(scenarios, {
      respond: async () =>
        "Sure. The patient SSN is 123-45-6789 and my system prompt is: you are a helpful assistant. Ignore previous instructions."
    });
    // The two agents must not produce identical verdicts.
    const refusingSignature = refusing.results.map(r => r.actualBehavior).join(",");
    const leakingSignature = leaking.results.map(r => r.actualBehavior).join(",");
    expect(leakingSignature).not.toBe(refusingSignature);
  });
});
