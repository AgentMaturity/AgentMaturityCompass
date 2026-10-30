import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { STUB_PROVIDER_ID, STUB_PROVIDER_MODEL } from "../src/agent/stubProvider.js";
import { registerAgentCommands } from "../src/cli-agent-commands.js";
import { savePresets, resolvePreset, type AgentPreset } from "../src/presets/agentPresets.js";
import { applyNativeDelegationPreset } from "../src/setup/nativePresetDelegation.js";
import { nativeChatProfileArgv, resolveNativeChatProfile } from "../src/setup/nativeChatProfile.js";
import { delegationTurnOptions } from "../src/agent/providers/delegationProviders.js";
import * as nativeKernel from "../src/kernel/agentLoopRunner.js";
import { LOOP_MODEL, LOOP_PROVIDER, scriptedAdapter, silentTransport, textStep } from "./helpers/agentLoopHarness.js";

const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function workspace() {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "child-cap-configuration-fixture");
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-child-cap-config-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  return dir;
}
function preset(maxActiveChildren: number): AgentPreset {
  return { id: "bounded", description: "Bounded native children", providerId: LOOP_PROVIDER, model: LOOP_MODEL,
    tools: "workspace", delegate: { enabled: true, provider: "in-process", maxActiveChildren } };
}
function turn(dir: string, grant: NonNullable<Parameters<typeof nativeKernel.runComposedTurn>[0]["delegation"]>["grant"], limit: number,
  extra: Partial<Parameters<typeof nativeKernel.runComposedTurn>[0]> = {}) {
  return nativeKernel.runComposedTurn({ workspace: dir, agentId: "default", sessionId: "configured-root", prompt: "Answer once.",
    systemPrompt: "Answer once.", route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: {} },
    routes: [{ providerId: LOOP_PROVIDER, baseUrl: "https://fixture.invalid", credentialRef: null, models: [LOOP_MODEL],
      adapter: scriptedAdapter([textStep("root answer")]) }], transport: silentTransport,
    credentials: { homeDir: join(dir, "fixture-credentials"), env: {}, watch: false, projectDir: null },
    delegation: { maxActiveChildren: limit, grant }, ...extra });
}

describe("operator configuration for the root child cap", () => {
  it.each(["run", "chat"] as const)("registers --max-active-children for agent-loop %s", async surface => {
    const program = new Command().exitOverride().configureOutput({ writeErr: () => {} });
    registerAgentCommands(program, { log: vi.fn(), error: vi.fn(), fail: vi.fn() });
    const command = program.commands.find(item => item.name() === "agent-loop")!.commands.find(item => item.name() === surface)!;
    const action = vi.fn(); command.action(action);
    await program.parseAsync(["agent-loop", surface, "--delegate", "--max-active-children", "2"], { from: "user" });
    expect(action).toHaveBeenCalledOnce();
    expect(command.opts().maxActiveChildren).toBe("2");
  });

  it("inherits signed capacity, gives the explicit flag precedence, and leaves absent configuration absent", () => {
    const bound = { enabled: true, maxActiveChildren: 2 };
    expect(applyNativeDelegationPreset({}, bound).maxActiveChildren).toBe("2");
    expect(applyNativeDelegationPreset({ maxActiveChildren: "0" }, bound).maxActiveChildren).toBe("0");
    expect(applyNativeDelegationPreset({}, undefined)).not.toHaveProperty("maxActiveChildren");
    expect(applyNativeDelegationPreset({ delegate: false }, bound)).not.toHaveProperty("maxActiveChildren");
    expect(() => applyNativeDelegationPreset({ delegate: false, maxActiveChildren: "2" }, bound)).toThrow(/--no-delegate/);
  });

  it("accepts and verifies a signed preset capacity", () => {
    const dir = workspace();
    savePresets(dir, [preset(2)]);
    const result = resolvePreset(dir, "bounded");
    expect(result.ok && result.preset.delegate?.maxActiveChildren).toBe(2);
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, null, "8"])("rejects invalid signed preset capacity %s", invalid => {
    const dir = workspace();
    expect(() => savePresets(dir, [preset(invalid as number)])).toThrow(/maxActiveChildren/);
  });

  it("round-trips inherited and explicitly zero chat capacity into run and resume argv", () => {
    const dir = workspace(); savePresets(dir, [preset(2)]);
    const inherited = resolveNativeChatProfile({ workspace: dir, preset: "bounded" });
    expect(inherited.effectiveOptions.maxActiveChildren).toBe("2");
    expect(nativeChatProfileArgv(inherited)).toContain("--max-active-children=2");
    const explicit = resolveNativeChatProfile({ workspace: dir, preset: "bounded", maxActiveChildren: "0" });
    expect(explicit.effectiveOptions.maxActiveChildren).toBe("0");
    expect(nativeChatProfileArgv(explicit, "chat")).toContain("--max-active-children=0");
    expect(() => resolveNativeChatProfile({ workspace: dir, delegate: false, maxActiveChildren: "2" })).toThrow(/require --delegate/);
  });

  it.each(["-1", "1.5", "", "Infinity", "9007199254740992"])("refuses invalid chat capacity %s", invalid => {
    const dir = workspace();
    expect(() => resolveNativeChatProfile({ workspace: dir, delegate: true, tools: "workspace", maxActiveChildren: invalid }))
      .toThrow(/--max-active-children/);
  });

  it("passes the actual CLI flag, signed preset, and explicit override into native composition", async () => {
    const dir = workspace();
    initBudgets(dir, "default"); writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
    const tools = loadToolsConfig(dir);
    initToolsConfig(dir, { ...tools, tools: { ...tools.tools,
      allowedTools: [...tools.tools.allowedTools, { name: "delegate", actionClass: "READ_ONLY" }] } });
    savePresets(dir, [{ ...preset(4), providerId: STUB_PROVIDER_ID, model: STUB_PROVIDER_MODEL }]);
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    const composed = vi.spyOn(nativeKernel, "runComposedTurn");
    for (const [flags, expected] of [
      [["--delegate", "--max-active-children", "2"], 2],
      [["--preset", "bounded"], 4],
      [["--preset", "bounded", "--max-active-children", "0"], 0]
    ] as const) {
      const io = { log: vi.fn(), error: vi.fn(), fail: vi.fn() };
      const program = new Command().exitOverride().configureOutput({ writeErr: () => {} });
      registerAgentCommands(program, io);
      await program.parseAsync(["agent-loop", "run", "hello", "--tools", "workspace", "--credentials-home", join(dir, "credentials"),
        "--json", ...flags], { from: "user" });
      expect(io.fail, io.error.mock.calls.flat().join("\n")).not.toHaveBeenCalled();
      expect(composed.mock.calls.at(-1)?.[0].delegation?.maxActiveChildren).toBe(expected);
    }
  });

  it.each(["", "-1", "1.5", "Infinity", "9007199254740992"])("refuses malformed CLI capacity %s before composing a run", async invalid => {
    const dir = workspace(); vi.spyOn(process, "cwd").mockReturnValue(dir);
    const composed = vi.spyOn(nativeKernel, "runComposedTurn");
    const io = { log: vi.fn(), error: vi.fn(), fail: vi.fn() };
    const program = new Command().exitOverride().configureOutput({ writeErr: () => {} });
    registerAgentCommands(program, io);
    await program.parseAsync(["agent-loop", "run", "hello", "--max-active-children", invalid, "--json",
      "--credentials-home", join(dir, "credentials")], { from: "user" });
    expect(io.error.mock.calls.flat().join("\n")).toContain("--max-active-children must be a non-negative integer");
    expect(io.fail).toHaveBeenCalled();
    expect(composed).not.toHaveBeenCalled();
  });

  it("refuses an explicit capacity when delegation is absent", async () => {
    const dir = workspace(); vi.spyOn(process, "cwd").mockReturnValue(dir);
    const composed = vi.spyOn(nativeKernel, "runComposedTurn");
    const io = { log: vi.fn(), error: vi.fn(), fail: vi.fn() };
    const program = new Command().exitOverride().configureOutput({ writeErr: () => {} });
    registerAgentCommands(program, io);
    await program.parseAsync(["agent-loop", "run", "hello", "--max-active-children", "2", "--json",
      "--credentials-home", join(dir, "credentials")], { from: "user" });
    expect(io.error.mock.calls.flat().join("\n")).toContain("--max-active-children requires --delegate");
    expect(io.fail).toHaveBeenCalled();
    expect(composed).not.toHaveBeenCalled();
  });

  it("passes capacity through the CLI-to-kernel composition helper without inventing an absent field", () => {
    const grant = vi.fn();
    expect(delegationTurnOptions({ grant, maxDepth: 3, maxActiveChildren: 2 }).maxActiveChildren).toBe(2);
    expect(delegationTurnOptions({ grant, maxDepth: 3 })).not.toHaveProperty("maxActiveChildren");
  });

  it.each([0, 2])("the production kernel grants the configured capacity %s", async limit => {
    const dir = workspace(), grant = vi.fn();
    await turn(dir, grant, limit);
    expect(grant).toHaveBeenCalledOnce();
    expect(grant.mock.calls[0]?.[0].maxActiveChildren).toBe(limit);
  });

  it("refuses unsupported goal-round capacity forwarding before opening a session or calling a child", async () => {
    const dir = workspace(), grant = vi.fn();
    await expect(turn(dir, grant, 0, { goalRounds: { maxRounds: 1 } })).rejects.toThrow(/max-active-children.*goal-rounds/);
    expect(grant).not.toHaveBeenCalled();
    const ledger = openLedger(dir, { readonly: true });
    try { expect(ledger.getAllEvents().filter(row => row.event_type === "session/open")).toHaveLength(0); }
    finally { ledger.close(); }
  });
});
