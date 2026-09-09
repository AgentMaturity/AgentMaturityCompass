import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import { registerAgentCommands } from "../src/cli-agent-commands.js";
import { applyNativeDelegationPreset, NativeDelegationSelectionError, type NativeDelegationOptions } from "../src/setup/nativePresetDelegation.js";
import type { AgentPreset } from "../src/presets/agentPresets.js";

const preset: NonNullable<AgentPreset["delegate"]> = { enabled: true, provider: "in-process", scope: ["READ_ONLY"], maxDepth: 2,
  timeoutMs: 5_000, stopConditions: ["max-turns:3", "timeout-ms:9000"] };

describe("explicit disabled native delegation composition", () => {
  it("does not re-enable a disabled capability or inherit its child parameters", () => {
    const original = { delegate: false, approveTools: "WRITE_HIGH", maxTokens: "128" };
    const result = applyNativeDelegationPreset(original, preset);
    expect(result).toEqual({ ...original, delegateScope: undefined, delegateStop: undefined, maxDelegationDepth: undefined,
      delegateProvider: undefined, delegateTimeout: undefined });
    expect(original).toEqual({ delegate: false, approveTools: "WRITE_HIGH", maxTokens: "128" });
    expect(preset.enabled).toBe(true);
  });
  it("retains all normal enabled inherited bounds and explicit overrides", () => {
    const result = applyNativeDelegationPreset({ delegate: true, delegateScope: "WRITE_LOW", maxDelegationDepth: "1" }, preset);
    expect(result).toMatchObject({ delegate: true, delegateScope: "WRITE_LOW", maxDelegationDepth: "1", delegateProvider: "in-process",
      delegateStop: ["max-turns:3", "timeout-ms:9000"], delegateTimeout: "5000" });
    expect(applyNativeDelegationPreset({}, preset).delegate).toBe(true);
    expect(applyNativeDelegationPreset({}, undefined).delegate).toBeUndefined();
  });
  it.each([
    { delegateScope: "READ_ONLY" }, { maxDelegationDepth: "1" }, { delegateProvider: "in-process" }, { delegateTimeout: "1000" },
    { delegateStop: ["max-turns:1"] }, { delegateStop: false as const }, { delegateStop: [] as string[] }
  ])("refuses contradictory explicit child options rather than silently dropping them: %j", child => {
    expect(() => applyNativeDelegationPreset({ delegate: false, ...child }, preset)).toThrow(NativeDelegationSelectionError);
  });
  it.each(["run", "chat"] as const)("the actual %s grammar distinguishes absent, enabled and disabled flags", async surface => {
    // Replace only the action to isolate real parsing from runtime/provider work.
    // This is grammar/composition coverage, not a dispatched child acceptance.
    for (const [flag, expected] of [[undefined, undefined], ["--delegate", true], ["--no-delegate", false]] as const) {
      const program = new Command().exitOverride().configureOutput({ writeErr: () => {} });
      const io = { log: vi.fn(), error: vi.fn(), fail: vi.fn() };
      registerAgentCommands(program, io);
      const command = program.commands.find(item => item.name() === "agent-loop")!.commands.find(item => item.name() === surface)!;
      const action = vi.fn(); command.action(action);
      await program.parseAsync(["agent-loop", surface, "--preset", "signed-delegator", ...(flag ? [flag] : [])], { from: "user" });
      expect(action).toHaveBeenCalledOnce();
      expect(command.opts().delegate).toBe(expected);
      const effective = applyNativeDelegationPreset(command.opts() as NativeDelegationOptions, preset);
      expect(effective.delegate).toBe(expected === false ? false : true);
      if (expected === false) expect(effective.delegateProvider).toBeUndefined();
      expect(io.fail).not.toHaveBeenCalled();
    }
  });
});
