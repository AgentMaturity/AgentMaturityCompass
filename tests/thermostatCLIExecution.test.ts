/**
 * AMC-442: Thermostat CLI — real commands that execute
 */
import { describe, expect, test, vi } from "vitest";
import {
  executeSteerCommand,
  parseSteerCommandArgs,
  createSteerRuntime,
} from "../src/steer/thermostatCLI.js";

describe("parseSteerCommandArgs", () => {
  test("parses boolean, string, and number flags", () => {
    const parsed = parseSteerCommandArgs("steer race --models gpt-4,claude-3 --prompt hello --fastest 0.7 --timeout 5000");
    expect(parsed.command).toBe("steer race");
    expect(parsed.flags).toEqual({
      models: "gpt-4,claude-3",
      prompt: "hello",
      fastest: 0.7,
      timeout: 5000,
    });
  });

  test("parses booleans expressed as explicit values", () => {
    const parsed = parseSteerCommandArgs("steer enable --agent a1 --hygiene=false --autotune=true");
    expect(parsed.flags).toMatchObject({
      agent: "a1",
      hygiene: false,
      autotune: true,
    });
  });
});

describe("executeSteerCommand", () => {
  test("steer enable updates runtime state", async () => {
    const runtime = createSteerRuntime();
    const result = await executeSteerCommand(runtime, "steer enable --agent alpha --hygiene=false --feedback=true");

    expect(result.ok).toBe(true);
    expect(runtime.getAgentConfig("alpha")).toMatchObject({
      enabled: true,
      hygiene: false,
      feedback: true,
    });
  });

  test("steer disable turns off runtime state for agent", async () => {
    const runtime = createSteerRuntime();
    await executeSteerCommand(runtime, "steer enable --agent alpha");
    const result = await executeSteerCommand(runtime, "steer disable --agent alpha");

    expect(result.ok).toBe(true);
    expect(runtime.getAgentConfig("alpha")?.enabled).toBe(false);
  });

  test("steer status returns JSON when requested", async () => {
    const runtime = createSteerRuntime();
    await executeSteerCommand(runtime, "steer enable --agent alpha --micro-score=false");
    const result = await executeSteerCommand(runtime, "steer status --agent alpha --json=true");

    expect(result.ok).toBe(true);
    expect(result.output).toContain('"agent":"alpha"');
    expect(result.output).toContain('"microScore":false');
  });

  test("steer micro-score executes scorer on inline text", async () => {
    const runtime = createSteerRuntime();
    const result = await executeSteerCommand(runtime, "steer micro-score --text 'This is a useful answer with concrete detail.' --json=true");

    expect(result.ok).toBe(true);
    expect(result.output).toContain('"composite"');
  });

  test("steer micro-score can read from --file", async () => {
    const runtime = createSteerRuntime();
    const result = await executeSteerCommand(runtime, "steer micro-score --file package.json --json=true");

    expect(result.ok).toBe(true);
    expect(result.output).toContain('"composite"');
  });

  test("steer race executes runtime racer", async () => {
    const runtime = createSteerRuntime({
      race: vi.fn(async () => ({
        winnerId: "claude-3",
        winnerScore: { composite: 0.91 },
        candidates: [{ id: "gpt-4", score: { composite: 0.72 } }, { id: "claude-3", score: { composite: 0.91 } }],
        totalLatencyMs: 123,
      })),
    });

    const result = await executeSteerCommand(runtime, "steer race --models gpt-4,claude-3 --prompt 'Explain recursion' --fastest 0.7");

    expect(result.ok).toBe(true);
    expect(result.output).toContain("claude-3");
    expect(runtime.handlers.race).toHaveBeenCalledTimes(1);
  });

  test("steer matrix executes runtime matrix runner", async () => {
    const runtime = createSteerRuntime({
      matrix: vi.fn(async () => ({
        best: { temperature: 0.3, topP: 0.9, score: 0.88 },
        totalRuns: 4,
      })),
    });

    const result = await executeSteerCommand(runtime, "steer matrix --model gpt-4 --prompt 'Explain AI safety' --temperature 0,0.3 --top-p 0.9,1.0 --max 4");

    expect(result.ok).toBe(true);
    expect(result.output).toContain("0.3");
    expect(runtime.handlers.matrix).toHaveBeenCalledTimes(1);
  });

  test("steer privacy updates runtime privacy tier", async () => {
    const runtime = createSteerRuntime();
    const result = await executeSteerCommand(runtime, "steer privacy --tier redacted --salt my-org-salt");

    expect(result.ok).toBe(true);
    expect(runtime.getPrivacyConfig()).toEqual({ tier: "redacted", salt: "my-org-salt" });
  });

  test("requires --agent for enable/disable/status commands", async () => {
    const runtime = createSteerRuntime();
    const enable = await executeSteerCommand(runtime, "steer enable");
    const disable = await executeSteerCommand(runtime, "steer disable");
    const status = await executeSteerCommand(runtime, "steer status");

    expect(enable.ok).toBe(false);
    expect(disable.ok).toBe(false);
    expect(status.ok).toBe(false);
    expect(enable.output).toContain("--agent");
  });

  test("returns error for unknown command", async () => {
    const runtime = createSteerRuntime();
    const result = await executeSteerCommand(runtime, "steer nonsense --foo bar");

    expect(result.ok).toBe(false);
    expect(result.output).toContain("Unknown steer command");
  });
});
