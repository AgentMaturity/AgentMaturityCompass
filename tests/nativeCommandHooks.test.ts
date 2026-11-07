import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { registerAgentCommands } from "../src/cli-agent-commands.js";
import { sha256Hex } from "../src/utils/hash.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { SessionService } from "../src/session/sessionService.js";
import { ToolRegistry, defineTool } from "../src/tools/toolRegistry.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { agentToolset } from "../src/agent/agentToolset.js";
import { initWorkspaceWithoutActionPolicy } from "./helpers/actionPolicyFixtures.js";
import {
  commandHookMatches, loadNativeCommandHooks, parseNativeCommandHooks, trustNativeCommandHooks
} from "../src/extensions/nativeCommandHookConfig.js";
import { denyPromptByCommandHooks, NativeCommandHooks } from "../src/extensions/nativeCommandHooks.js";
import { workspaceNativeHooks } from "../src/extensions/nativeHookRuntime.js";

/**
 * SH-EXT-01: operator command hooks (.amc/hooks.json) on every platform. Hook processes are node one-liners, so the
 * suite is offline and the same on macOS, Linux and Windows.
 */
const directories: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

/** A workspace with its own AMC home, so trust marks never touch the developer's machine state. */
function workspace(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-command-hooks-")));
  directories.push(root);
  const home = realpathSync(mkdtempSync(join(tmpdir(), "amc-command-hooks-home-")));
  directories.push(home);
  vi.stubEnv("AMC_HOME", home);
  mkdirSync(join(root, ".amc"), { recursive: true });
  return root;
}
const node = (script: string) => [process.execPath, "-e", script];
const READ_STDIN = "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const i=JSON.parse(d);";
const hooksFile = (hooks: Record<string, unknown>) => JSON.stringify({ hooks });
function install(root: string, hooks: Record<string, unknown>, trust = true): string {
  writeFileSync(join(root, ".amc", "hooks.json"), hooksFile(hooks));
  const sha256 = sha256Hex(Buffer.from(hooksFile(hooks)));
  if (trust) trustNativeCommandHooks(root, sha256);
  return sha256;
}
const runtime = (root: string) => {
  const load = loadNativeCommandHooks(root);
  if (load.status === "absent") throw new Error("fixture has no hooks.json");
  return new NativeCommandHooks(load, { workspace: root, sessionId: () => "session-1" });
};
const execution = (name: string, args: Record<string, unknown> = { path: "x" }) => ({ token: "t", callId: "call-1", rootCallId: "call-1", name, agentId: "default",
  workspace: "/w", actionClass: "WRITE_LOW" as const, requestedMode: "EXECUTE" as const, effectiveMode: "EXECUTE" as const, arguments: args, parentToken: null });

describe("hooks.json parsing and matchers", () => {
  it("parses Claude's file shape into argv handlers and refuses regular expressions", () => {
    const handlers = parseNativeCommandHooks(hooksFile({ PreToolUse: [{ matcher: "fs.write|fs.edit", hooks: [{ type: "command", command: "node check.js --strict", timeout: 5 }] }],
      Stop: [{ hooks: [{ type: "command", command: ["node", "stop.js"] }] }] }));
    expect(handlers).toEqual([
      { event: "PreToolUse", matcher: "fs.write|fs.edit", argv: ["node", "check.js", "--strict"], timeoutMs: 5_000, acceptTruncatedInput: false, index: 1 },
      { event: "Stop", matcher: "", argv: ["node", "stop.js"], timeoutMs: 10_000, acceptTruncatedInput: false, index: 1 }]);
    expect(() => parseNativeCommandHooks(hooksFile({ PreToolUse: [{ matcher: "fs\\.(write|edit)", hooks: [{ type: "command", command: "x" }] }] }))).toThrow(/regular expressions are not supported/);
    expect(() => parseNativeCommandHooks(hooksFile({ BeforeModel: [{ hooks: [{ type: "command", command: "x" }] }] }))).toThrow(/not a valid hooks file/);
    expect(() => parseNativeCommandHooks(hooksFile({ PreToolUse: [{ hooks: [{ type: "http", url: "https://x" }] }] }))).toThrow(/not a valid hooks file/);
    expect(() => parseNativeCommandHooks("{")).toThrow(/not valid JSON/);
  });
  it.each([["", "fs.write", true], ["*", "bash", true], ["fs.write", "fs.write", true], ["fs.write", "fsXwrite", false], ["fs.write", "fs.writer", false],
    ["Write|fs.write", "fs.write", true], ["mcp_github_*", "mcp_github_ab12", true], ["mcp_github_*", "mcp_gitlab_ab12", false]])("matcher %j against %s", (matcher, tool, expected) => {
    expect(commandHookMatches(matcher, tool)).toBe(expected);
  });
});

describe("trust on this machine", () => {
  it("is absent, then untrusted, then trusted for exactly those bytes, and untrusted again after a change", () => {
    const root = workspace();
    expect(loadNativeCommandHooks(root).status).toBe("absent");
    const sha256 = install(root, { Stop: [{ hooks: [{ type: "command", command: "true" }] }] }, false);
    const untrusted = loadNativeCommandHooks(root);
    expect(untrusted).toMatchObject({ status: "untrusted", sha256 });
    expect(untrusted.status === "untrusted" && untrusted.reason).toContain(`hooks trust --sha256 ${sha256}`);
    expect(() => trustNativeCommandHooks(root, "0".repeat(64))).toThrow(/pass exactly that digest/);
    expect(trustNativeCommandHooks(root, sha256)).toMatchObject({ sha256, handlers: 1 });
    expect(loadNativeCommandHooks(root)).toMatchObject({ status: "trusted", sha256 });
    install(root, { Stop: [{ hooks: [{ type: "command", command: "false" }] }] }, false);
    const changed = loadNativeCommandHooks(root);
    expect(changed.status).toBe("untrusted");
    expect(changed.status === "untrusted" && changed.reason).toContain(`changed since this machine trusted sha256 ${sha256}`);
  });
  it("never trusts bytes that do not parse", () => {
    const root = workspace();
    writeFileSync(join(root, ".amc", "hooks.json"), "{\"hooks\":{\"Nope\":[]}}");
    expect(() => trustNativeCommandHooks(root, sha256Hex(Buffer.from("{\"hooks\":{\"Nope\":[]}}")))).toThrow(/not a valid hooks file/);
    expect(loadNativeCommandHooks(root).status).toBe("untrusted");
  });
});

describe("decisions", () => {
  it("passes Claude-shaped JSON on stdin with the exact frozen arguments and a minimal environment", async () => {
    const root = workspace();
    const seen = join(root, "seen.json");
    install(root, { PreToolUse: [{ matcher: "fs.write", hooks: [{ type: "command", command: node(`${READ_STDIN}require('fs').writeFileSync(${JSON.stringify(seen)},JSON.stringify({i,env:Object.keys(process.env).sort()}));})`) }] }] });
    const hooks = runtime(root);
    const call = execution("fs.write", { path: "a.txt", content: "secret-looking sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij0123456789" });
    await hooks.prepare(call);
    expect(hooks.guard(call)).toBeUndefined();
    const { i, env } = JSON.parse(readFileSync(seen, "utf8"));
    expect(i).toMatchObject({ hook_event_name: "PreToolUse", session_id: "session-1", cwd: root, tool_name: "fs.write", tool_use_id: "call-1",
      action_class: "WRITE_LOW", requested_mode: "EXECUTE", tool_input: call.arguments, tool_input_truncated: false, tool_input_bytes: Buffer.byteLength(JSON.stringify(call.arguments)) });
    // macOS injects __CF_USER_TEXT_ENCODING into every child; nothing else reaches the hook.
    expect(env.filter((name: string) => !name.startsWith("__CF_"))).toEqual(["AMC_HOOK_EVENT", "AMC_WORKSPACE", "HOME", "PATH"]);
  });
  it.each([
    ["exit 2 with a stderr reason", "process.stderr.write('no writes on Friday');process.exit(2)", "no writes on Friday"],
    ["decision deny", "console.log(JSON.stringify({decision:'deny',reason:'review first'}))", "review first"],
    ["permissionDecision deny", "console.log(JSON.stringify({hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:'policy'}}))", "policy"],
    ["ask", "console.log(JSON.stringify({hookSpecificOutput:{permissionDecision:'ask'}}))", "human decision"],
    ["updatedInput", "console.log(JSON.stringify({hookSpecificOutput:{permissionDecision:'allow',updatedInput:{path:'other'}}}))", "authority AMC does not grant (updatedInput)"],
    ["additionalContext", "console.log(JSON.stringify({decision:'allow',additionalContext:'be nice'}))", "authority AMC does not grant (additionalContext)"],
    ["continue false", "console.log(JSON.stringify({continue:false,stopReason:'halt'}))", "halt"],
    ["exit 1", "process.exit(1)", "hook exited 1"]
  ])("denies PreToolUse on %s", async (_label, script, reason) => {
    const root = workspace();
    const sha256 = install(root, { PreToolUse: [{ hooks: [{ type: "command", command: node(`${READ_STDIN}${script}})`) }] }] });
    const hooks = runtime(root);
    const call = execution("fs.write");
    await hooks.prepare(call);
    expect(hooks.guard(call)).toContain(reason);
    expect(hooks.guard(call)).toContain(`hooks.json sha256 ${sha256} PreToolUse #1`);
  });
  it.each([
    ["allow is an abstention", "console.log(JSON.stringify({hookSpecificOutput:{permissionDecision:'allow'}}))"],
    ["plain stdout is ignored", "console.log('looks fine to me')"],
    ["empty output", ""]
  ])("abstains on %s", async (_label, script) => {
    const root = workspace();
    install(root, { PreToolUse: [{ hooks: [{ type: "command", command: node(`${READ_STDIN}${script}})`) }] }] });
    const hooks = runtime(root);
    const call = execution("fs.write");
    await hooks.prepare(call);
    expect(hooks.guard(call)).toBeUndefined();
  });
  it("denies on timeout, denies an unprepared call, and skips tools the matcher does not name", async () => {
    const root = workspace();
    install(root, { PreToolUse: [{ matcher: "bash", hooks: [{ type: "command", command: node("setTimeout(()=>{}, 30000)"), timeout: 1 }] }] });
    const hooks = runtime(root);
    const slow = execution("bash", { command: "ls" });
    await hooks.prepare(slow);
    expect(hooks.guard(slow)).toContain("timed out");
    expect(hooks.guard(execution("bash"))).toContain("were not evaluated");
    const other = execution("fs.read");
    await hooks.prepare(other);
    expect(hooks.guard(other)).toBeUndefined();
  }, 15_000);
  it("denies an over-cap input unless the handler accepts a truncated view", async () => {
    const root = workspace();
    const big = { content: "x".repeat(40_000) };
    install(root, { PreToolUse: [{ hooks: [{ type: "command", command: node(`${READ_STDIN}if(i.tool_input!==null||!i.tool_input_truncated)process.exit(2)})`) }] }] });
    const strict = runtime(root);
    const call = execution("fs.write", big);
    await strict.prepare(call);
    expect(strict.guard(call)).toContain("did not declare acceptTruncatedInput");
    install(root, { PreToolUse: [{ hooks: [{ type: "command", acceptTruncatedInput: true, command: node(`${READ_STDIN}if(i.tool_input!==null||!i.tool_input_truncated)process.exit(2)})`) }] }] });
    const lenient = runtime(root);
    const again = execution("fs.write", big);
    await lenient.prepare(again);
    expect(lenient.guard(again)).toBeUndefined();
  });
  it("observes PostToolUse with the result digest and Stop with the turn, reporting failures without vetoing", async () => {
    const root = workspace();
    const seen = join(root, "post.json");
    install(root, { PostToolUse: [{ matcher: "fs.*", hooks: [{ type: "command", command: node(`${READ_STDIN}require('fs').writeFileSync(${JSON.stringify(seen)},d);process.exit(2)})`) }] }],
      Stop: [{ hooks: [{ type: "command", command: node("process.exit(0)") }] }] });
    const hooks = runtime(root);
    const reports = await hooks.observe({ kind: "tool-end", turn: 1, step: 2, toolName: "fs.read", callId: "c9", ok: true, outputSha256: "a".repeat(64), outputBytes: 12 });
    expect(reports).toMatchObject([{ extensionId: "hooks.json", kind: "tool-end", code: "HOOK_FAILED" }]);
    expect(JSON.parse(readFileSync(seen, "utf8"))).toMatchObject({ hook_event_name: "PostToolUse", tool_name: "fs.read", tool_use_id: "c9",
      tool_response: { ok: true, output_sha256: "a".repeat(64), output_bytes: 12 } });
    expect(await hooks.observe({ kind: "turn-end", turn: 1 })).toEqual([]);
    expect(await hooks.observe({ kind: "step-start", turn: 1, step: 1 })).toEqual([]);
    expect(hooks.reports()).toHaveLength(1);
  });
  it("UserPromptSubmit can stop a turn and sees the prompt text", async () => {
    const root = workspace();
    install(root, { UserPromptSubmit: [{ hooks: [{ type: "command", command: node(`${READ_STDIN}if(/password/.test(i.prompt)){console.log(JSON.stringify({decision:'block',reason:'no secrets in prompts'}))}})`) }] }] });
    expect(await denyPromptByCommandHooks({ workspace: root, prompt: "paste my password here" })).toContain("no secrets in prompts");
    expect(await denyPromptByCommandHooks({ workspace: root, prompt: "hello" })).toBeUndefined();
    expect(await denyPromptByCommandHooks({ workspace: workspace(), prompt: "no hooks file" })).toBeUndefined();
  });
  it("fails closed while the file is present but not trusted or not valid", async () => {
    const root = workspace();
    install(root, { PreToolUse: [{ hooks: [{ type: "command", command: node("process.exit(0)") }] }] }, false);
    const hooks = runtime(root);
    const call = execution("fs.read");
    await hooks.prepare(call);
    expect(hooks.guard(call)).toContain("is not trusted on this machine");
    expect(await hooks.observe({ kind: "turn-end", turn: 1 })).toMatchObject([{ code: "HOOKS_UNTRUSTED" }]);
    expect(await denyPromptByCommandHooks({ workspace: root, prompt: "x" })).toContain("not trusted");
  });
});

describe("composition into every toolset", () => {
  function governed(root: string) {
    const checkpoints = realpathSync(mkdtempSync(join(tmpdir(), "amc-hook-checkpoints-")));
    directories.push(checkpoints); vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", checkpoints);
    initWorkspaceWithoutActionPolicy({ workspacePath: root, trustBoundaryMode: "isolated" });
    initBudgets(root, "default"); writeRuntimeFirewallPolicy({ workspace: root, mode: "observe" });
    mkdirSync(join(root, "workspace"), { recursive: true }); writeFileSync(join(root, "workspace", "file.txt"), "contents");
    const session = new SessionService(root);
    session.open({ agentId: "default", harnessVersion: "test", compositionDigest: "test", policyDigest: "test" });
    return session;
  }
  it("denies through the pipeline guard with the file identity in the recorded reason", async () => {
    const root = workspace();
    const sha256 = install(root, { PreToolUse: [{ matcher: "read", hooks: [{ type: "command", command: node("process.stderr.write('reads are off');process.exit(2)") }] }] });
    const hooks = workspaceNativeHooks(root, () => "s")!;
    const registry = new ToolRegistry(); const body = vi.fn(() => ({ ok: true, output: "must not run" }));
    registry.define(defineTool({ name: "read", description: "read", actionClass: "READ_ONLY", parameters: { type: "object" }, body }));
    registry.guard("native-extensions", hooks.guard);
    const records: unknown[] = [];
    const pipeline = new ToolPipeline({ registry, workspace: root, authorizeClasses: new Set(), prepareGuards: hooks.prepare, record: (execution, outcome) => records.push({ execution, outcome }) });
    const result = await pipeline.execute({ name: "read", agentId: "default", arguments: { path: "x" }, requestedMode: "EXECUTE" });
    expect(result.denied).toMatchObject({ stage: "guard", guardLabel: "native-extensions" });
    expect(result.denied?.reason).toContain(`hooks.json sha256 ${sha256}`); expect(result.denied?.reason).toContain("reads are off");
    expect(body).not.toHaveBeenCalled(); expect(JSON.stringify(records)).toContain("reads are off");
  });
  it("a toolset built with no extension hooks of its own (a delegated child, an ACP session) still carries the workspace guard", async () => {
    const root = workspace();
    const session = governed(root);
    const sha256 = install(root, { PreToolUse: [{ matcher: "fs.write", hooks: [{ type: "command", command: node("process.exit(2)") }] }] });
    const toolset = agentToolset({ workspace: root, agentId: "default", sessionId: session.sessionId, recorder: session });
    try {
      expect(toolset.seam.extensionHooks).toBeDefined();
      const request = (toolName: string, rawArguments: string) => ({ callId: `c-${toolName}`, toolName, rawArguments, sessionId: session.sessionId, turn: 1, step: 1,
        dispatch: "native" as const, parentToken: null, signal: new AbortController().signal });
      const denied = await toolset.seam.execute(request("fs.write", '{"path":"workspace/new.txt","content":"x"}'));
      expect(denied.denied).toBe(true); expect(String(denied.content)).toContain(`hooks.json sha256 ${sha256} PreToolUse #1`);
      expect(existsSync(join(root, "workspace", "new.txt"))).toBe(false);
      const read = await toolset.seam.execute(request("fs.read", '{"path":"workspace/file.txt"}'));
      expect(String(read.content)).not.toContain("hooks.json");
    } finally { toolset.close(); session.close({ reason: "completed" }); }
  });
  it("leaves a workspace without hooks.json exactly as before", () => {
    const root = workspace();
    const session = governed(root);
    const toolset = agentToolset({ workspace: root, agentId: "default", sessionId: session.sessionId, recorder: session });
    try { expect(toolset.seam.extensionHooks).toBeUndefined(); } finally { toolset.close(); session.close({ reason: "completed" }); }
    expect(workspaceNativeHooks(root, () => null)).toBeUndefined();
  });
});

describe("real surfaces", () => {
  it("agent-loop run stops on a UserPromptSubmit denial before any session exists, and runs otherwise", async () => {
    const root = workspace();
    const home = realpathSync(mkdtempSync(join(tmpdir(), "amc-hooks-cred-home-"))); directories.push(home);
    initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
    install(root, { UserPromptSubmit: [{ hooks: [{ type: "command", command: node(`${READ_STDIN}if(/password/.test(i.prompt)){process.stderr.write('no secrets in prompts');process.exit(2)}})`) }] }] });
    const cwd = process.cwd(); process.chdir(root);
    try {
      const invoke = async (prompt: string) => {
        const out: string[] = [], errors: string[] = [], failures: number[] = [];
        const program = new Command(); program.exitOverride();
        registerAgentCommands(program, { log: line => out.push(line), error: line => errors.push(line), fail: () => failures.push(1) });
        await program.parseAsync(["node", "amc", "agent-loop", "run", prompt, "--credentials-home", home, "--json"]);
        return { out, errors, failures };
      };
      const refused = await invoke("my password is hunter2");
      expect(refused.failures).toHaveLength(1);
      expect(refused.errors.join("\n")).toContain("prompt refused by hook"); expect(refused.errors.join("\n")).toContain("no secrets in prompts");
      expect(refused.out).toEqual([]);
      const ran = await invoke("hello");
      expect(ran.failures).toEqual([]);
      expect(JSON.parse(ran.out.at(-1)!)).toMatchObject({ endings: [{ turn: 1 }] });
    } finally { process.chdir(cwd); }
  }, 60_000);
  it("amc native-extension hooks inspect, trust and test through the built CLI", () => {
    const root = workspace();
    const sha256 = install(root, { PreToolUse: [{ matcher: "fs.write|Write", hooks: [{ type: "command", command: node("process.stderr.write('writes need review');process.exit(2)") }] }],
      SessionStart: [{ hooks: [{ type: "command", command: "true" }] }] }, false);
    const cli = join(process.cwd(), "dist", "cli.js");
    const amc = (...args: string[]) => spawnSync(process.execPath, [cli, "native-extension", "hooks", ...args], { cwd: root, encoding: "utf8",
      env: { ...process.env, AMC_HOME: process.env.AMC_HOME, AMC_NO_AUTO_REBUILD: "1", NO_COLOR: "1" } });
    const untrusted = JSON.parse(amc("inspect", "--json").stdout);
    expect(untrusted).toMatchObject({ status: "untrusted", sha256, handlers: [] });
    expect(amc("test", "PreToolUse", "--json").status).toBe(1);
    expect(amc("trust", "--sha256", "f".repeat(64)).status).toBe(1);
    expect(amc("trust", "--sha256", sha256).status).toBe(0);
    const inspected = JSON.parse(amc("inspect", "--json").stdout);
    expect(inspected.status).toBe("trusted");
    expect(inspected.handlers).toMatchObject([{ event: "PreToolUse", matchesBuiltinTools: ["fs.write"], denyCapable: true, emitted: true }, { event: "SessionStart", emitted: false }]);
    const tested = JSON.parse(amc("test", "PreToolUse", "--tool", "fs.write", "--json").stdout);
    expect(tested).toMatchObject({ outcome: "deny", runs: [{ decision: "deny", reason: "writes need review", exitCode: 2 }] });
    expect(JSON.parse(amc("test", "PreToolUse", "--tool", "fs.read", "--json").stdout).runs).toEqual([]);
  }, 60_000);
});
