import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { presetsPath, resolvePreset, savePresets, type AgentPreset } from "../src/presets/agentPresets.js";
import { signFileWithAuditor } from "../src/org/orgSigner.js";
import { registerAgentCommands } from "../src/cli-agent-commands.js";
import {
  assertNativeChatProfileCurrent, nativeChatProfileArgv, NativeChatProfileError,
  resolveNativeChatProfile, type NativeChatProfile
} from "../src/setup/nativeChatProfile.js";

// These tests exercise the actual Commander registrar and preflight, but never
// permit a provider process or terminal prompt to stand in for that boundary.
const ioEdges = vi.hoisted(() => ({
  spawn: vi.fn(() => { throw new Error("Preflight must not spawn a process"); }),
  createInterface: vi.fn(() => { throw new Error("Refused preflight must not open a terminal prompt"); })
}));
vi.mock("node:child_process", async importOriginal => ({
  ...await importOriginal<typeof import("node:child_process")>(), spawn: ioEdges.spawn
}));
vi.mock("node:readline", async importOriginal => ({
  ...await importOriginal<typeof import("node:readline")>(), createInterface: ioEdges.createInterface
}));

const directories: string[] = [];
const stdinTty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
const stdoutTty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
const fetchBoundary = vi.fn(() => { throw new Error("Preflight must not call a provider"); });
beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "native-chat-profile-fixture-passphrase");
  vi.stubGlobal("fetch", fetchBoundary);
  fetchBoundary.mockClear(); ioEdges.spawn.mockClear(); ioEdges.createInterface.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
  for (const [stream, descriptor] of [[process.stdin, stdinTty], [process.stdout, stdoutTty]] as const) {
    if (descriptor === undefined) Reflect.deleteProperty(stream, "isTTY");
    else Object.defineProperty(stream, "isTTY", descriptor);
  }
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function workspace(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-native-chat-profile-")));
  directories.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}
function reviewer(overrides: Partial<AgentPreset> = {}): AgentPreset {
  return {
    id: "reviewer", description: "A reviewed native composition", providerId: "anthropic", model: "chosen-review-model",
    tools: "workspace", maxSteps: 4, maxTokens: 256, persona: "Review carefully.", approveTools: "READ_ONLY",
    delegate: { enabled: true, provider: "in-process", scope: ["READ_ONLY"], maxDepth: 2 },
    ...overrides
  };
}
function registry(root: string) {
  vi.spyOn(process, "cwd").mockReturnValue(root);
  const output: string[] = [];
  const fail = vi.fn();
  const program = new Command().exitOverride().configureOutput({ writeErr: () => {} });
  registerAgentCommands(program, { log: line => output.push(line), error: line => output.push(line), fail });
  return { program, output, fail };
}
function tty(value: boolean): void {
  Object.defineProperty(process.stdin, "isTTY", { configurable: true, value });
  Object.defineProperty(process.stdout, "isTTY", { configurable: true, value });
}
function chatResumeArguments(profile: NativeChatProfile, sessionId: string): string[] {
  const options = profile.effectiveOptions;
  return ["agent-loop", "chat", "--provider", options.provider!, "--model", options.model!,
    "--credentials-file", join(options.workspace, "credentials with spaces.json"),
    "--tools", options.tools!, "--max-tokens", options.maxTokens!, "--max-steps", options.maxSteps!,
    "--approve-tools", options.approveTools!, ...nativeChatProfileArgv(profile, "chat"), "--session", sessionId];
}

describe("signed native chat composition admission", () => {
  it("retains an explicit agent and provider origin for the guide and interactive session", () => {
    const profile = resolveNativeChatProfile({ workspace: workspace(), agentId: "reviewer", baseUrl: "http://127.0.0.1:43123" });
    expect(profile.guideOptions).toMatchObject({ agentId: "reviewer", baseUrl: "http://127.0.0.1:43123" });
    expect(profile.effectiveOptions).toMatchObject({ agentId: "reviewer", baseUrl: "http://127.0.0.1:43123" });
    expect(fetchBoundary).not.toHaveBeenCalled();
  });

  it("keeps provider/model intent absent when neither a flag nor a signed profile selects it", () => {
    const profile = resolveNativeChatProfile({ workspace: workspace() });
    expect(profile.guideOptions.provider).toBeUndefined();
    expect(profile.guideOptions.model).toBeUndefined();
    expect(profile.guideOptions.credential).toBeUndefined();
    expect(profile.presetId).toBeNull();
    expect(fetchBoundary).not.toHaveBeenCalled();
  });

  it("resolves explicit overrides before signed defaults while retaining approval and delegation bounds", () => {
    const root = workspace();
    savePresets(root, [reviewer()]);
    const profile = resolveNativeChatProfile({ workspace: root, preset: "reviewer", provider: "openai-responses",
      model: "explicit-model", credential: "REVIEW_API_KEY", persona: "Explicit persona", maxSteps: "2" });
    expect(profile.guideOptions).toMatchObject({ provider: "openai-responses", model: "explicit-model", credential: "REVIEW_API_KEY" });
    expect(profile.effectiveOptions).toMatchObject({ tools: "workspace", persona: "Explicit persona", maxSteps: "2",
      maxTokens: "256", approveTools: "READ_ONLY", delegate: true, delegateScope: "READ_ONLY", maxDelegationDepth: "2" });
    expect(() => assertNativeChatProfileCurrent(profile)).not.toThrow();
    expect(fetchBoundary).not.toHaveBeenCalled();
  });

  it("retains signed child stops and accepts a complete explicit replacement", () => {
    const root = workspace();
    savePresets(root, [reviewer({ delegate: { enabled: true, stopConditions: ["max-turns:3", "timeout-ms:9000"] } })]);
    const inherited = resolveNativeChatProfile({ workspace: root, preset: "reviewer" });
    expect(inherited.effectiveOptions.delegateStop).toEqual(["max-turns:3", "timeout-ms:9000"]);
    const explicit = resolveNativeChatProfile({ workspace: root, preset: "reviewer", delegateStop: ["max-turns:1"] });
    expect(explicit.effectiveOptions.delegateStop).toEqual(["max-turns:1"]);
    expect(nativeChatProfileArgv(explicit)).toContain("--delegate-stop=max-turns:1");
    expect(nativeChatProfileArgv(explicit).join(" ")).not.toContain("timeout-ms:9000");
    expect(fetchBoundary).not.toHaveBeenCalled();
  });

  it.each([{ reset: false as const }, { reset: [] as string[] }])("preserves an explicit empty stop reset through captured argv: $reset", ({ reset }) => {
    const root = workspace();
    savePresets(root, [reviewer({ delegate: { enabled: true, stopConditions: ["max-turns:3"] } })]);
    const profile = resolveNativeChatProfile({ workspace: root, preset: "reviewer", delegateStop: reset });
    expect(profile.effectiveOptions.delegateStop).toEqual([]);
    expect(nativeChatProfileArgv(profile, "run")).toContain("--no-delegate-stop");
    expect(nativeChatProfileArgv(profile, "chat")).toContain("--no-delegate-stop");
    expect(() => assertNativeChatProfileCurrent(profile)).not.toThrow();
  });

  it("does not invent a reset or a stop when the operator has configured neither", () => {
    const profile = resolveNativeChatProfile({ workspace: workspace(), delegate: true, tools: "workspace" });
    expect(profile.effectiveOptions.delegateStop).toBeUndefined();
    expect(nativeChatProfileArgv(profile).some(arg => arg.startsWith("--delegate-stop") || arg === "--no-delegate-stop")).toBe(false);
  });

  it("refuses a newly signed stop policy before the next chat turn even when an explicit override was captured", () => {
    const root = workspace();
    savePresets(root, [reviewer({ delegate: { enabled: true, stopConditions: ["max-turns:3"] } })]);
    const profile = resolveNativeChatProfile({ workspace: root, preset: "reviewer", delegateStop: ["max-turns:1"] });
    savePresets(root, [reviewer({ delegate: { enabled: true, stopConditions: ["max-turns:4"] } })]);
    expect(resolvePreset(root, "reviewer").ok).toBe(true);
    expect(() => assertNativeChatProfileCurrent(profile)).toThrow(/changed|no longer verifies/i);
    expect(profile.effectiveOptions.delegateStop).toEqual(["max-turns:1"]);
  });

  it.each([
    ["max-steps:1"], ["max-turns:0"], ["max-turns:01"], ["max-turns:9007199254740992"],
    ["timeout-ms:2147483648"], ["max-turns:1", "max-turns:2"]
  ].map(conditions => ({ conditions })))("refuses bad stops in both explicit options and signed preset admission: $conditions", ({ conditions }) => {
    const root = workspace();
    expect(() => resolveNativeChatProfile({ workspace: root, tools: "workspace", delegate: true, delegateStop: conditions })).toThrow(/--delegate-stop/);
    const invalid = reviewer({ delegate: { enabled: true, stopConditions: conditions } });
    expect(() => savePresets(root, [invalid])).toThrow(/stopConditions/);
    // Sign externally authored invalid bytes as an operator could. Signature
    // validity must not turn an invalid stop vocabulary into a runnable preset.
    writeFileSync(presetsPath(root), JSON.stringify({ presets: [invalid] }));
    signFileWithAuditor(root, presetsPath(root));
    expect(resolvePreset(root, "reviewer").ok).toBe(false);
    expect(() => resolveNativeChatProfile({ workspace: root, preset: "reviewer" })).toThrow(/missing, invalid|unverifiable/);
    expect(ioEdges.spawn).not.toHaveBeenCalled();
    expect(fetchBoundary).not.toHaveBeenCalled();
  });

  it("refuses unused stops when delegation is disabled without reinterpreting the legacy foreign timeout", () => {
    const root = workspace();
    expect(() => resolveNativeChatProfile({ workspace: root, delegateStop: ["max-turns:1"] })).toThrow(/require --delegate/);
    expect(() => resolveNativeChatProfile({ workspace: root, delegateStop: false })).toThrow(/require --delegate/);
    expect(() => savePresets(root, [reviewer({ delegate: { enabled: false, stopConditions: ["max-turns:1"] } })])).toThrow(/delegate.enabled/);
    savePresets(root, [reviewer({ delegate: { enabled: true, provider: "in-process", timeoutMs: 1000, stopConditions: ["timeout-ms:5000"] } })]);
    expect(() => resolveNativeChatProfile({ workspace: root, preset: "reviewer" })).toThrow(/foreign-process delegation timeout/);
  });

  it("refuses later changed policy even after the new bytes receive a valid workspace signature", () => {
    const root = workspace();
    savePresets(root, [reviewer()]);
    const profile = resolveNativeChatProfile({ workspace: root, preset: "reviewer" });
    savePresets(root, [reviewer({ approveTools: "WRITE_HIGH", maxTokens: 4096 })]);
    expect(resolvePreset(root, "reviewer").ok).toBe(true);
    expect(() => assertNativeChatProfileCurrent(profile)).toThrow(/changed|no longer verifies/i);
    expect(profile.effectiveOptions.approveTools).toBe("READ_ONLY");
    expect(profile.effectiveOptions.maxTokens).toBe("256");
  });

  it("permits a re-signed edit to another profile without replacing the selected composition", () => {
    const root = workspace();
    savePresets(root, [reviewer(), reviewer({ id: "other", model: "other-before" })]);
    const profile = resolveNativeChatProfile({ workspace: root, preset: "reviewer" });
    savePresets(root, [reviewer(), reviewer({ id: "other", model: "other-after" })]);
    expect(() => assertNativeChatProfileCurrent(profile)).not.toThrow();
    expect(profile.guideOptions.model).toBe("chosen-review-model");
  });

  it("refuses a removed signature for an unchanged selected profile", () => {
    const root = workspace(); savePresets(root, [reviewer()]);
    const profile = resolveNativeChatProfile({ workspace: root, preset: "reviewer" });
    rmSync(`${presetsPath(root)}.sig`);
    expect(() => assertNativeChatProfileCurrent(profile)).toThrow(/no longer verifies/i);
  });

  it.each(["missing", "unsigned", "tampered", "signed-malformed"] as const)(
    "refuses %s profile source through real CLI preflight before prompts or providers", async state => {
      const root = workspace();
      const secretCanary = "private-preset-content-must-not-be-printed";
      if (state !== "missing") {
        savePresets(root, [reviewer()]);
        if (state === "unsigned") rmSync(`${presetsPath(root)}.sig`);
        if (state === "tampered") writeFileSync(presetsPath(root), `${readFileSync(presetsPath(root), "utf8")}\n# ${secretCanary}\n`);
        if (state === "signed-malformed") {
          writeFileSync(presetsPath(root), `presets: [\n${secretCanary}`);
          signFileWithAuditor(root, presetsPath(root));
        }
      }
      tty(true);
      const { program, output, fail } = registry(root);
      await program.parseAsync(["agent-loop", "chat", "--preset", "reviewer", "--provider", "openai-responses", "--model", "explicit-model"], { from: "user" });
      expect(fail).toHaveBeenCalledOnce();
      expect(output.join("\n")).toMatch(/missing, invalid|unverifiable signature/i);
      expect(output.join("\n")).not.toContain(secretCanary);
      expect(ioEdges.createInterface).not.toHaveBeenCalled();
      expect(ioEdges.spawn).not.toHaveBeenCalled();
      expect(fetchBoundary).not.toHaveBeenCalled();
    }
  );

  it.each([
    reviewer({ toolMode: "code" }),
    reviewer({ delegate: { enabled: true, provider: "claude-cli" } }),
    reviewer({ tools: "none" })
  ])("refuses a signed unsupported composition instead of weakening it %#", preset => {
    const root = workspace(); savePresets(root, [preset]);
    expect(() => resolveNativeChatProfile({ workspace: root, preset: "reviewer" })).toThrow(NativeChatProfileError);
    expect(ioEdges.spawn).not.toHaveBeenCalled();
    expect(fetchBoundary).not.toHaveBeenCalled();
  });
});

describe("native chat resume arguments target the actual chat grammar", () => {
  it.each([
    { explicit: undefined, expected: ["max-turns:3", "timeout-ms:9000"] },
    { explicit: ["max-turns:1"], expected: ["max-turns:1"] },
    { explicit: [] as string[], expected: [] as string[] }
  ])("round-trips child stop selection through actual chat grammar: $expected", async ({ explicit, expected }) => {
    const root = workspace();
    savePresets(root, [reviewer({ delegate: { enabled: true, stopConditions: ["max-turns:3", "timeout-ms:9000"] } })]);
    const profile = resolveNativeChatProfile({ workspace: root, preset: "reviewer", ...(explicit === undefined ? {} : { delegateStop: explicit }) });
    tty(false);
    const { program, output, fail } = registry(root);
    await program.parseAsync(chatResumeArguments(profile, "existing-session-reference"), { from: "user" });
    const chat = program.commands.find(command => command.name() === "agent-loop")!.commands.find(command => command.name() === "chat")!;
    expect(chat.opts().delegateStop).toEqual(expected.length === 0 ? false : expected);
    const reconstructed = resolveNativeChatProfile({ ...chat.opts(), workspace: root });
    expect(reconstructed.effectiveOptions.delegateStop).toEqual(expected);
    expect(output.join("\n")).toContain("Interactive chat requires a terminal");
    expect(fail).toHaveBeenCalledOnce();
    expect(ioEdges.spawn).not.toHaveBeenCalled();
    expect(fetchBoundary).not.toHaveBeenCalled();
  });

  it.each([
    ["--delegate-stop", "max-turns:1", "--no-delegate-stop"],
    ["--no-delegate-stop", "--delegate-stop", "max-turns:1"]
  ].map(flags => ({ flags })))("refuses conflicting chat stop/reset flags before preflight: $flags", async ({ flags }) => {
    const root = workspace(); tty(true);
    const { program, fail } = registry(root);
    await expect(program.parseAsync(["agent-loop", "chat", "--delegate", "--tools", "workspace", ...flags], { from: "user" }))
      .rejects.toMatchObject({ code: "commander.invalidArgument" });
    expect(fail).not.toHaveBeenCalled();
    expect(ioEdges.createInterface).not.toHaveBeenCalled();
    expect(ioEdges.spawn).not.toHaveBeenCalled();
    expect(fetchBoundary).not.toHaveBeenCalled();
  });

  it("parses a delegated signed resume command with exact free-text persona, then stops at the non-terminal boundary", async () => {
    const root = workspace();
    const persona = "--provider=stub $(touch nothing) 'quoted'\nKeep this as persona text.";
    savePresets(root, [reviewer({ persona })]);
    const profile = resolveNativeChatProfile({ workspace: root, preset: "reviewer" });
    tty(false);
    const { program, output, fail } = registry(root);
    await program.parseAsync(chatResumeArguments(profile, "existing-session-reference"), { from: "user" });
    const chat = program.commands.find(command => command.name() === "agent-loop")!.commands.find(command => command.name() === "chat")!;
    expect(chat.opts()).toMatchObject({ preset: "reviewer", persona, delegate: true, delegateScope: "READ_ONLY",
      maxDelegationDepth: "2", provider: "anthropic", model: "chosen-review-model", tools: "workspace",
      approveTools: "READ_ONLY", session: "existing-session-reference", credentialsFile: join(root, "credentials with spaces.json") });
    expect(output.join("\n")).toContain("Interactive chat requires a terminal");
    expect(fail).toHaveBeenCalledOnce();
    expect(ioEdges.createInterface).not.toHaveBeenCalled();
    expect(ioEdges.spawn).not.toHaveBeenCalled();
    expect(fetchBoundary).not.toHaveBeenCalled();
  });

  it("demonstrates why the run surface arguments cannot be used as a chat resume command", async () => {
    const root = workspace(); savePresets(root, [reviewer()]);
    const profile = resolveNativeChatProfile({ workspace: root, preset: "reviewer" });
    tty(false);
    const { program, fail } = registry(root);
    await expect(program.parseAsync(["agent-loop", "chat", ...nativeChatProfileArgv(profile, "run"),
      "--session", "existing-session-reference"], { from: "user" })).rejects.toMatchObject({ code: "commander.unknownOption" });
    expect(fail).not.toHaveBeenCalled();
    expect(ioEdges.createInterface).not.toHaveBeenCalled();
    expect(ioEdges.spawn).not.toHaveBeenCalled();
  });

  it("parses a persona-only resume without inventing a preset or delegation", async () => {
    const root = workspace();
    const profile = resolveNativeChatProfile({ workspace: root, provider: "openai-responses", model: "chosen-model",
      persona: "Literal {{user_data}}; no interpolation." });
    tty(false);
    const { program, output } = registry(root);
    await program.parseAsync(["agent-loop", "chat", "--provider", "openai-responses", "--model", "chosen-model",
      ...nativeChatProfileArgv(profile, "chat"), "--session", "prior-session"], { from: "user" });
    const chat = program.commands.find(command => command.name() === "agent-loop")!.commands.find(command => command.name() === "chat")!;
    expect(chat.opts()).toMatchObject({ provider: "openai-responses", model: "chosen-model", persona: "Literal {{user_data}}; no interpolation.", session: "prior-session" });
    expect(chat.opts().preset).toBeUndefined();
    expect(chat.opts().delegate).toBeUndefined();
    expect(output.join("\n")).toContain("requires a terminal");
    expect(fetchBoundary).not.toHaveBeenCalled();
  });
});
