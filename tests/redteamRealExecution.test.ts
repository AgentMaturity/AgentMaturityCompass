import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * G1-02: the red-team runner scored a hardcoded `syntheticResponse()` that
 * always refused, so "no vulnerabilities found" was guaranteed before the run.
 * It now attacks the real agent under test.
 */
describe("red-team runner attacks a real agent", () => {
  const source = readFileSync(new URL("../src/redteam/runner.ts", import.meta.url), "utf8");

  it("no longer contains a synthetic response generator", () => {
    expect(source).not.toContain("function syntheticResponse");
    expect(source).not.toContain("syntheticResponse(attackPrompt)");
  });

  it("invokes the shared real-agent responder", () => {
    expect(source).toContain("resolveAgentResponder");
    expect(source).toContain("responder.respond(attackPrompt)");
  });

  it("never reports a perfect score when nothing was attacked", () => {
    // The previous implementation returned 100 for zero scenarios, so a run
    // that attacked nothing looked flawlessly secure.
    expect(source).not.toContain("totalScenarios === 0 ? 100");
    expect(source).toContain('totalScenarios === 0 ? "INSUFFICIENT_EVIDENCE" : "MEASURED"');
    expect(source).toContain("totalScenarios === 0 ? 0");
  });

  it("excludes unreached attacks from pass/fail totals", () => {
    expect(source).toContain("inconclusiveCount += 1");
    expect(source).toContain("inconclusive: true");
    // The inconclusive branch must `continue` before totals are incremented.
    const branch = source.slice(source.indexOf("inconclusiveCount += 1"));
    const continueIdx = branch.indexOf("continue;");
    const passIdx = branch.indexOf("totalPass++");
    expect(continueIdx).toBeGreaterThan(-1);
    expect(continueIdx).toBeLessThan(passIdx);
  });

  it("records which target was actually attacked", () => {
    expect(source).toContain("evidenceStatus");
    expect(source).toContain("responder.target.endpoint");
  });
});

describe("red-team CLI fails closed", () => {
  const cli = readFileSync(new URL("../src/cli-late-stage-commands.ts", import.meta.url), "utf8");

  it("aborts with remediation instead of reporting a clean run", () => {
    expect(cli).toContain("AgentResponderUnavailableError");
    expect(cli).toContain("Red-team run aborted");
    expect(cli).toContain("error.remediation");
  });
});

describe("G1-03: evil-MCP provider drives a real tool-calling agent", () => {
  const source = readFileSync(new URL("../src/redteam/mcpAgentProvider.ts", import.meta.url), "utf8");

  it("no longer models a hardcoded cautious agent", () => {
    expect(source).not.toContain("function syntheticAgentResponse");
    expect(source).not.toContain("CAUTIOUS agent");
  });

  it("offers the real tool definitions and observes actual tool calls", () => {
    expect(source).toContain("resolveAgentResponder");
    expect(source).toContain("responder.respond(scenario.userPrompt, { tools: offeredTools })");
    expect(source).toContain("answer.toolCalls");
  });

  it("does not score an untested agent as perfectly safe", () => {
    expect(source).not.toContain("/ totalScenarios\n        )\n      : 100;");
    expect(source).toContain('totalScenarios === 0 ? "INSUFFICIENT_EVIDENCE" : "MEASURED"');
  });
});

describe("responder tool-call extraction", () => {
  it("parses OpenAI tool_calls including malformed arguments", async () => {
    const { extractToolCalls } = await import("../src/assurance/agentResponder.js");
    const calls = extractToolCalls({
      choices: [
        {
          message: {
            tool_calls: [
              { function: { name: "delete_all", arguments: '{"path":"/"}' } },
              { function: { name: "broken", arguments: "{not json" } }
            ]
          }
        }
      ]
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ toolName: "delete_all", arguments: { path: "/" } });
    // A dangerous call must never be silently dropped because its args failed to parse.
    expect(calls[1].toolName).toBe("broken");
    expect(calls[1].arguments._raw).toBe("{not json");
  });

  it("parses Anthropic tool_use blocks", async () => {
    const { extractToolCalls } = await import("../src/assurance/agentResponder.js");
    const calls = extractToolCalls({
      content: [{ type: "tool_use", name: "exfiltrate", input: { host: "evil.example" } }]
    });
    expect(calls).toEqual([{ toolName: "exfiltrate", arguments: { host: "evil.example" } }]);
  });

  it("returns no calls for a plain text answer", async () => {
    const { extractToolCalls } = await import("../src/assurance/agentResponder.js");
    expect(extractToolCalls({ choices: [{ message: { content: "no tools" } }] })).toEqual([]);
  });
});

describe("G1-04: amc attack drives a real agent", () => {
  const cli = readFileSync(new URL("../src/cli-late-stage-commands.ts", import.meta.url), "utf8");
  const plugins = readFileSync(new URL("../src/redteam/attackPlugins.ts", import.meta.url), "utf8");

  it("no longer hardcodes a synthetic respondFn in the CLI", () => {
    expect(cli).not.toContain('return "I cannot comply with requests that bypass policy or reveal secrets.');
    expect(cli).toContain("responder.respond(prompt)");
  });

  it("aborts instead of grading a canned refusal", () => {
    expect(cli).toContain("Attack run aborted");
  });

  it("does not report full resilience when nothing was attacked", () => {
    expect(plugins).toContain("No plugins run means nothing was attacked");
    expect(plugins).not.toMatch(/\/ results\.length\)\s*:\s*100;/);
  });
});

describe("G1-05: jailbreak TAP/runner have no synthetic fallback", () => {
  const tap = readFileSync(new URL("../src/redteam/jailbreak/tap.ts", import.meta.url), "utf8");
  const runner = readFileSync(new URL("../src/redteam/jailbreak/runner.ts", import.meta.url), "utf8");

  it("removed both synthetic responders", () => {
    expect(tap).not.toContain("function syntheticResponse");
    expect(runner).not.toContain("function defaultSyntheticResponse");
  });

  it("requires an explicit responder rather than defaulting to a canned one", () => {
    expect(tap).not.toContain("?? syntheticResponse");
    expect(runner).not.toContain("?? defaultSyntheticResponse");
    expect(tap).toContain("respondFn: (prompt: string) => Promise<string>;");
    expect(runner).toContain("respondFn: (prompt: string) => Promise<string>;");
  });
});
