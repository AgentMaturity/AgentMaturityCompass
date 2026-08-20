import { describe, expect, it } from "vitest";
import {
  AgentResponderInvocationError,
  AgentResponderUnavailableError,
  buildRequestBody,
  completionsPathFor,
  extractResponseText
} from "../src/assurance/agentResponder.js";
import { aggregatePackScore } from "../src/assurance/scorers.js";
import type { AssuranceScenarioResult } from "../src/types.js";

function scenario(overrides: Partial<AssuranceScenarioResult>): AssuranceScenarioResult {
  return {
    scenarioId: "s1",
    title: "t",
    category: "c",
    riskTier: "all",
    prompt: "p",
    response: "r",
    pass: true,
    score0to5: 5,
    score0to100: 100,
    reasons: [],
    correlatedRequestIds: [],
    evidenceEventIds: ["a", "b"],
    auditEventTypes: [],
    ...overrides
  };
}

describe("assurance agent responder — no synthetic fallback", () => {
  it("does not ship a synthetic response generator", async () => {
    const module = await import("../src/assurance/agentResponder.js");
    const exported = Object.keys(module);
    expect(exported.some((name) => /synthetic|mock|fake|simulate/i.test(name))).toBe(false);
  });

  it("assuranceRunner no longer contains a synthetic response path", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../src/assurance/assuranceRunner.ts", import.meta.url), "utf8");
    expect(source).not.toContain("function syntheticResponse");
    expect(source).toContain("responder.respond(prompt)");
  });

  it("carries actionable remediation when no target is reachable", () => {
    const error = new AgentResponderUnavailableError("gateway down", "Start the gateway with 'amc up'.");
    expect(error.code).toBe("AGENT_RESPONDER_UNAVAILABLE");
    expect(error.remediation).toContain("amc up");
    expect(error.message).toContain("gateway down");
  });
});

describe("response parsing", () => {
  it("extracts OpenAI-style content", () => {
    expect(
      extractResponseText({ choices: [{ message: { content: "hello" } }] })
    ).toBe("hello");
  });

  it("extracts Anthropic-style content", () => {
    expect(extractResponseText({ content: [{ text: "part1" }, { text: "part2" }] })).toBe("part1part2");
  });

  it("extracts array-of-parts content", () => {
    expect(
      extractResponseText({ choices: [{ message: { content: [{ text: "a" }, { text: "b" }] } }] })
    ).toBe("ab");
  });

  it("returns null for an empty or unrecognized payload so it is never scored as a pass", () => {
    expect(extractResponseText({})).toBeNull();
    expect(extractResponseText({ choices: [] })).toBeNull();
    expect(extractResponseText({ choices: [{ message: { content: "" } }] })).toBeNull();
    expect(extractResponseText(null)).toBeNull();
  });
});

describe("request shaping", () => {
  it("uses the OpenAI chat dialect when the provider is openai-compatible", () => {
    const body = buildRequestBody({ model: "gpt-x", prompt: "hi", openaiCompatible: true });
    expect(body.model).toBe("gpt-x");
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(completionsPathFor(true)).toBe("/v1/chat/completions");
  });

  it("uses the Anthropic messages dialect otherwise", () => {
    const body = buildRequestBody({ model: "claude-x", prompt: "hi", openaiCompatible: false });
    expect(body.max_tokens).toBe(1024);
    expect(completionsPathFor(false)).toBe("/v1/messages");
  });

  it("pins temperature to 0 so scans are reproducible", () => {
    expect(buildRequestBody({ model: "m", prompt: "p", openaiCompatible: true }).temperature).toBe(0);
  });
});

describe("inconclusive scenarios are excluded from scoring", () => {
  it("never counts an unreached scenario as a pass or a measured failure", () => {
    const result = aggregatePackScore([
      scenario({ scenarioId: "measured-pass", pass: true, score0to100: 100 }),
      scenario({ scenarioId: "unreached", pass: false, score0to100: 0, inconclusive: true })
    ]);
    expect(result.passCount).toBe(1);
    expect(result.failCount).toBe(0);
    expect(result.inconclusiveCount).toBe(1);
    // Score reflects only the measured scenario, not a 50% average with a zero.
    expect(result.score0to100).toBe(100);
  });

  it("reports a zero score with no measured scenarios when everything was inconclusive", () => {
    const result = aggregatePackScore([
      scenario({ pass: false, score0to100: 0, inconclusive: true }),
      scenario({ pass: false, score0to100: 0, inconclusive: true })
    ]);
    expect(result.passCount).toBe(0);
    expect(result.failCount).toBe(0);
    expect(result.inconclusiveCount).toBe(2);
    expect(result.score0to100).toBe(0);
  });

  it("scores a fully measured pack exactly as before", () => {
    const result = aggregatePackScore([
      scenario({ pass: true, score0to100: 100 }),
      scenario({ pass: false, score0to100: 30 })
    ]);
    expect(result.passCount).toBe(1);
    expect(result.failCount).toBe(1);
    expect(result.inconclusiveCount).toBe(0);
    expect(result.score0to100).toBe(65);
  });
});

describe("invocation failures are typed", () => {
  it("marks a failed invocation distinctly from an unavailable target", () => {
    const invocation = new AgentResponderInvocationError("boom", 500);
    expect(invocation.code).toBe("AGENT_RESPONDER_FAILED");
    expect(invocation.status).toBe(500);
  });
});
