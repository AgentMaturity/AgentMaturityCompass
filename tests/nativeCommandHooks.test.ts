import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";
import { Command } from "commander";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { resolveForeignRunner } from "../src/agent/providers/delegationProviders.js";
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
  commandHookMatches, loadNativeCommandHooks, parseNativeCommandHooks, trustNativeCommandHooks, untrustNativeCommandHooks
} from "../src/extensions/nativeCommandHookConfig.js";
import { denyPromptByCommandHooks, NativeCommandHooks } from "../src/extensions/nativeCommandHooks.js";
import { workspaceNativeHooks } from "../src/extensions/nativeHookRuntime.js";
import { hookChildPath } from "../src/extensions/nativeCommandHookArgv.js";
import { openAgentSession } from "../src/agent/agentSession.js";
import { credentialRef } from "../src/credentials/credentialRef.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, scriptedAdapter, silentTransport, textStep } from "./helpers/agentLoopHarness.js";
import { imageInput } from "./fixtures/nativeAcpImageRuntime.js";

/**
 * SH-EXT-01: operator command hooks (.amc/hooks.json). The fixtures run bound scripts using the test's Node executable.
 */
const directories: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
const scripts = realpathSync(mkdtempSync(join(tmpdir(), "amc-command-hook-scripts-")));
afterAll(() => rmSync(scripts, { recursive: true, force: true }));
let scriptCount = 0;

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
const node = (root: string, script: string) => {
  const file = `hook-${++scriptCount}.js`;
  const dir = join(root, ".amc", "hooks");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), script);
  return [process.execPath, `.amc/hooks/${file}`];
};
const direct = (name: string) => {
  const path = join(scripts, name);
  writeFileSync(path, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  return path;
};
const READ_STDIN = "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const i=JSON.parse(d);";
const hooksFile = (hooks: Record<string, unknown>) => JSON.stringify({ hooks });
/** The trust value the operator types: the file digest, or the digest bound to .amc/hooks/ when that tree has files. */
function markOf(root: string): string {
  const load = loadNativeCommandHooks(root);
  if (load.status !== "untrusted" && load.status !== "trusted") throw new Error(`fixture hooks.json is ${load.status}: ${"reason" in load ? load.reason : ""}`);
  return load.mark;
}
function install(root: string, hooks: Record<string, unknown>, trust = true): string {
  writeFileSync(join(root, ".amc", "hooks.json"), hooksFile(hooks));
  const sha256 = sha256Hex(Buffer.from(hooksFile(hooks)));
  if (trust) trustNativeCommandHooks(root, markOf(root));
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
    const handlers = parseNativeCommandHooks(hooksFile({ PreToolUse: [{ matcher: "fs.write|fs.edit", hooks: [{ type: "command", command: "node .amc/hooks/check.js strict", timeout: 5 }] }],
      Stop: [{ hooks: [{ type: "command", command: [process.execPath, ".amc/hooks/stop.js"] }] }] }));
    expect(handlers).toEqual([
      { event: "PreToolUse", matcher: "fs.write|fs.edit", argv: ["node", ".amc/hooks/check.js", "strict"], timeoutMs: 5_000, acceptTruncatedInput: false, index: 1 },
      { event: "Stop", matcher: "", argv: [process.execPath, ".amc/hooks/stop.js"], timeoutMs: 10_000, acceptTruncatedInput: false, index: 1 }]);
    expect(() => parseNativeCommandHooks(hooksFile({ PreToolUse: [{ matcher: "fs\\.(write|edit)", hooks: [{ type: "command", command: "x" }] }] }))).toThrow(/regular expressions are not supported/);
    expect(() => parseNativeCommandHooks(hooksFile({ BeforeModel: [{ hooks: [{ type: "command", command: "x" }] }] }))).toThrow(/not a valid hooks file/);
    expect(() => parseNativeCommandHooks(hooksFile({ PreToolUse: [{ hooks: [{ type: "http", url: "https://x" }] }] }))).toThrow(/not a valid hooks file/);
    expect(() => parseNativeCommandHooks("{")).toThrow(/not valid JSON/);
  });
  it("refuses commands outside the two exact shapes (S6c/d)", () => {
    const script = ".amc/hooks/guard.js";
    const parse = (command: string[]) => parseNativeCommandHooks(hooksFile({ Stop: [{ hooks: [{ type: "command", command }] }] }));
    for (const argv of [
      ["./scripts/hook.sh"], ["unknown-program"], ["other", "node", script], [direct("plain-executable"), "node", script],
      ["env", "node", script], ["/usr/bin/env", "node", script], ["/usr/bin/env", "-S", "node -e 1"], ["nice", "node", script],
      ["timeout", "5", "node", script], ["sudo", "node", script], ["/bin/sh", "-c", "ls"], ["bash", "-oc", "posix", "x"],
      ["bash", "+oc", "posix", "x"], ["bash", "-O", "extglob", "-c", "x"], ["node", "-pe", "1"], ["node", "--require", script],
      ["node", "-"], ["node", "/dev/stdin"], ["python3"], ["python3", "-m", "project"], ["python3", "-W", "ignore"],
      ["pwsh", "-ec", "ZQBjAGgAbwA="], ["pwsh", "-cwa", "x"], ["node", script, "--flag"], ["node", script, "NAME=foo"],
      ["node", script, "a/b"], ["node", script, "a\\b"], ["node", script, "one two"], ["node", script, "/dev/fd/3"],
      ["node", script, ".amc/hooks/other.js"], ["node", "scripts/guard.js"], ["node", ".amc/hooks/../guard.js"], ["/proc/self/exe"]
    ]) {
      expect(() => parse(argv), argv.join(" ")).toThrow(/hook/);
    }
    expect(parse([direct("standalone")])).toHaveLength(1);
    expect(parse(["node", script, "operator-mode", "123"])).toHaveLength(1);
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
    const sha256 = install(root, { Stop: [{ hooks: [{ type: "command", command: [direct("trust-one")] }] }] }, false);
    const untrusted = loadNativeCommandHooks(root);
    expect(untrusted).toMatchObject({ status: "untrusted", sha256 });
    expect(untrusted.status === "untrusted" && untrusted.reason).toContain(`hooks trust --sha256 ${sha256}`);
    expect(() => trustNativeCommandHooks(root, "0".repeat(64))).toThrow(/pass exactly that value/);
    expect(trustNativeCommandHooks(root, sha256)).toMatchObject({ sha256, mark: sha256, handlers: 1 }); // no bound files: the value is the file digest
    expect(loadNativeCommandHooks(root)).toMatchObject({ status: "trusted", sha256 });
    install(root, { Stop: [{ hooks: [{ type: "command", command: [direct("trust-two")] }] }] }, false);
    const changed = loadNativeCommandHooks(root);
    expect(changed.status).toBe("untrusted");
    expect(changed.status === "untrusted" && changed.reason).toContain("changed since this machine trusted it");
    // A process that starts after the change names it, from the acceptance record kept beside the trust store.
    expect(changed.status === "untrusted" && changed.reason).toContain(".amc/hooks.json changed since this machine trusted it");
  });
  it("binds the whole .amc/hooks/ tree: an edited script or one of its local imports is refused, by name, until the new value is accepted (S6)", async () => {
    const root = workspace();
    mkdirSync(join(root, ".amc", "hooks", "lib"), { recursive: true });
    const script = join(root, ".amc", "hooks", "check.js"), policy = join(root, ".amc", "hooks", "lib", "policy.js");
    writeFileSync(script, "require('./lib/policy.js')"); writeFileSync(policy, "process.exit(0)");
    const sha256 = install(root, { PreToolUse: [{ hooks: [{ type: "command", command: [process.execPath, ".amc/hooks/check.js"] }] }] }, false);
    const untrusted = loadNativeCommandHooks(root);
    expect(untrusted).toMatchObject({ status: "untrusted", sha256, handlers: [{ event: "PreToolUse" }],
      references: [{ rel: ".amc/hooks/check.js", sha256: sha256Hex(Buffer.from("require('./lib/policy.js')")) }, { rel: ".amc/hooks/lib/policy.js", sha256: sha256Hex(Buffer.from("process.exit(0)")) }] });
    const mark = markOf(root);
    expect(mark).not.toBe(sha256);
    expect(untrusted.status === "untrusted" && untrusted.reason).toContain(`hooks trust --sha256 ${mark}`);
    // The typed value must be the mark, which commits to the bound digests; the file digest alone is refused.
    expect(() => trustNativeCommandHooks(root, sha256)).toThrow(/bound to 2 file\(s\)/);
    expect(trustNativeCommandHooks(root, mark)).toMatchObject({ mark, references: untrusted.status === "untrusted" ? untrusted.references : [] });
    const hooks = runtime(root);
    const first = execution("fs.write");
    await hooks.prepare(first);
    expect(hooks.guard(first)).toBeUndefined();
    writeFileSync(policy, "process.exit(2) // the import, not the named script, changed");
    const second = execution("fs.write");
    await hooks.prepare(second); // the same runtime instance re-checks the tree before every spawn
    expect(hooks.guard(second)).toContain(".amc/hooks/lib/policy.js changed since this machine trusted");
    expect(await hooks.observe({ kind: "turn-end", turn: 1 })).toMatchObject([{ code: "HOOKS_UNTRUSTED" }]);
    expect(loadNativeCommandHooks(root)).toMatchObject({ status: "untrusted", sha256, reason: expect.stringContaining(".amc/hooks/lib/policy.js changed since this machine trusted it") });
    expect(trustNativeCommandHooks(root, markOf(root)).references[1]?.sha256).toBe(sha256Hex(Buffer.from("process.exit(2) // the import, not the named script, changed")));
    expect(loadNativeCommandHooks(root).status).toBe("trusted");
  });
  it("re-checks the bound tree immediately before EVERY spawn, not once per decision (skeptic: TOCTOU)", async () => {
    const root = workspace();
    mkdirSync(join(root, ".amc", "hooks"), { recursive: true });
    const marker = join(root, "second-hook-ran");
    writeFileSync(join(root, ".amc", "hooks", "check.js"), `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`);
    // The first handler stands in for a concurrent writer: it rewrites the bound script the second handler is about to run.
    const writer = node(root, `require('fs').appendFileSync(require('path').join(process.env.AMC_WORKSPACE, '.amc/hooks/check.js'), '\\n// swapped');`);
    install(root, { PreToolUse: [{ hooks: [{ type: "command", command: writer }, { type: "command", command: [process.execPath, ".amc/hooks/check.js"] }] }] });
    const hooks = runtime(root), call = execution("fs.write");
    await hooks.prepare(call);
    expect(hooks.guard(call)).toContain(".amc/hooks/check.js changed since this machine trusted");
    expect(existsSync(marker)).toBe(false);
  });
  it("requires the exact spelling of an existing regular hook file (S6c/d)", () => {
    const root = workspace();
    const hooksDir = join(root, ".amc", "hooks");
    mkdirSync(join(hooksDir, "dir"), { recursive: true });
    writeFileSync(join(hooksDir, "guard.js"), "process.exit(0)");
    const invalid = (argv: string[], reason: RegExp) => {
      install(root, { PreToolUse: [{ hooks: [{ type: "command", command: argv }] }] }, false);
      expect(loadNativeCommandHooks(root), argv.join(" ")).toMatchObject({ status: "invalid", reason: expect.stringMatching(reason) });
    };
    for (const rel of ["missing.js", "Guard.js", "dir"]) invalid([process.execPath, `.amc/hooks/${rel}`], /existing regular file.*spelled exactly/);
    invalid([process.execPath, join(hooksDir, "guard.js")], /one exact/);
    symlinkSync(join(hooksDir, "guard.js"), join(hooksDir, "alias.js"));
    invalid([process.execPath, ".amc/hooks/alias.js"], /symlink/);
    rmSync(join(hooksDir, "alias.js"));
    install(root, { PreToolUse: [{ hooks: [{ type: "command", command: [process.execPath, ".amc/hooks/guard.js"] }] }] });
    expect(loadNativeCommandHooks(root)).toMatchObject({ status: "trusted", references: [{ rel: ".amc/hooks/guard.js" }] });
  });
  it.skipIf(process.platform === "win32")("runs an absolute external program and rejects workspace executables and wrapper aliases", async () => {
    const root = workspace();
    const bin = join(root, "bin");
    mkdirSync(bin);
    const executable = direct("external-direct");
    install(root, { Stop: [{ hooks: [{ type: "command", command: [executable] }] }] });
    expect(await runtime(root).observe({ kind: "turn-end", turn: 1 })).toEqual([]);
    const workspaceProgram = join(bin, "program");
    symlinkSync(executable, workspaceProgram);
    install(root, { Stop: [{ hooks: [{ type: "command", command: [workspaceProgram] }] }] }, false);
    expect(loadNativeCommandHooks(root)).toMatchObject({ status: "invalid", reason: expect.stringContaining("outside the workspace") });
    const wrapperAlias = join(scripts, "wrapper-alias");
    symlinkSync("/usr/bin/env", wrapperAlias);
    install(root, { Stop: [{ hooks: [{ type: "command", command: [wrapperAlias] }] }] }, false);
    expect(loadNativeCommandHooks(root)).toMatchObject({ status: "invalid", reason: expect.stringContaining("wrapper") });
  });
  it.skipIf(process.platform === "win32")("runs with only external PATH entries, from a private working directory", async () => {
    const root = workspace();
    mkdirSync(join(root, "bin")); const marker = join(root, "ran-workspace-binary");
    writeFileSync(join(root, "bin", "wsonly"), `#!/bin/sh\necho > "${marker}"\n`, { mode: 0o755 });
    const alias = realpathSync(mkdtempSync(join(tmpdir(), "amc-hooks-childpath-"))); directories.push(alias);
    symlinkSync(join(root, "bin"), join(alias, "linkbin"), "dir");
    const path = [join(root, "bin"), "bin", ".", join(alias, "linkbin"), "/usr/bin", "/bin"].join(delimiter);
    expect(hookChildPath(root, path)).toBe([realpathSync("/usr/bin"), realpathSync("/bin")].join(delimiter));
    writeFileSync(join(root, "workspace-only"), "not for the hook");
    mkdirSync(join(root, ".amc", "hooks"), { recursive: true });
    writeFileSync(join(root, ".amc", "hooks", "check.sh"), "wsonly; test ! -e workspace-only && test \"$PWD\" != \"$AMC_WORKSPACE\" && test \"$1\" = mode");
    install(root, { Stop: [{ hooks: [{ type: "command", command: ["/bin/sh", ".amc/hooks/check.sh", "mode"] }] }] });
    vi.stubEnv("PATH", path);
    expect(await runtime(root).observe({ kind: "turn-end", turn: 1 })).toEqual([]);
    expect(existsSync(marker)).toBe(false);
  });
  it("fails closed when a trusted hooks.json goes missing, until the operator restores it or retires the mark (skeptic)", async () => {
    const root = workspace();
    install(root, { PreToolUse: [{ hooks: [{ type: "command", command: node(root, "process.exit(0)") }] }] });
    rmSync(join(root, ".amc", "hooks.json"));
    const missing = loadNativeCommandHooks(root);
    expect(missing).toMatchObject({ status: "invalid", sha256: null, reason: expect.stringContaining("is missing but this machine trusts") });
    const hooks = workspaceNativeHooks(root, () => null)!;
    expect(hooks).toBeDefined();
    const call = execution("fs.write");
    await hooks.prepare(call);
    expect(hooks.guard(call)).toContain("is missing");
    expect(await hooks.observe({ kind: "turn-end", turn: 1 })).toMatchObject([{ code: "HOOKS_INVALID", manifestDigest: null }]);
    expect(await denyPromptByCommandHooks({ workspace: root, prompt: "x" })).toContain("is missing");
    expect(untrustNativeCommandHooks(root)).toMatchObject({ retired: true });
    expect(loadNativeCommandHooks(root).status).toBe("absent");
    expect(workspaceNativeHooks(root, () => null)).toBeUndefined();
    expect(untrustNativeCommandHooks(root)).toMatchObject({ retired: false });
    // Retirement is not deletion: trusting again works, and a later deletion fails closed again.
    install(root, { Stop: [{ hooks: [{ type: "command", command: node(root, "process.exit(0)") }] }] });
    expect(loadNativeCommandHooks(root).status).toBe("trusted");
  });
  it("reports a trust it could not record instead of claiming success (skeptic)", () => {
    const root = workspace();
    install(root, { Stop: [{ hooks: [{ type: "command", command: node(root, "process.exit(0)") }] }] }, false);
    const home = process.env["AMC_HOME"]!;
    chmodSync(home, 0o500);
    try { expect(() => trustNativeCommandHooks(root, markOf(root))).toThrow(/could not be recorded/); }
    finally { chmodSync(home, 0o700); }
    expect(loadNativeCommandHooks(root).status).toBe("untrusted");
    // The acceptance record is written before the mark: when only it cannot be written, nothing is accepted either.
    mkdirSync(join(home, "state"), { recursive: true }); writeFileSync(join(home, "state", "hooks-trusted"), "not a directory");
    expect(() => trustNativeCommandHooks(root, markOf(root))).toThrow(/could not be recorded/);
    expect(loadNativeCommandHooks(root).status).toBe("untrusted");
  });
  it("never trusts bytes that do not parse", () => {
    const root = workspace();
    writeFileSync(join(root, ".amc", "hooks.json"), "{\"hooks\":{\"Nope\":[]}}");
    expect(() => trustNativeCommandHooks(root, sha256Hex(Buffer.from("{\"hooks\":{\"Nope\":[]}}")))).toThrow(/not a valid hooks file/);
    expect(loadNativeCommandHooks(root)).toMatchObject({ status: "invalid", reason: expect.stringContaining("not a valid hooks file") }); // said as what it is, before any trust question
  });
});

describe("decisions", () => {
  it("passes Claude-shaped JSON on stdin with the exact frozen arguments and a minimal environment", async () => {
    const root = workspace();
    const seen = join(root, "seen.json");
    const command = node(root, `${READ_STDIN}require('fs').writeFileSync(${JSON.stringify(seen)},JSON.stringify({i,workingDirectory:process.cwd(),script:__filename,env:Object.keys(process.env).sort()}));})`);
    const nodeScriptPath = command[1]!;
    install(root, { PreToolUse: [{ matcher: "fs.write", hooks: [{ type: "command", command }] }] });
    const hooks = runtime(root);
    const call = execution("fs.write", { path: "a.txt", content: "secret-looking sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij0123456789" });
    await hooks.prepare(call);
    expect(hooks.guard(call)).toBeUndefined();
    const { i, env, workingDirectory, script } = JSON.parse(readFileSync(seen, "utf8"));
    expect(workingDirectory).not.toBe(root);
    expect(script).toBe(join(workingDirectory, ...nodeScriptPath.split("/")));
    expect(existsSync(workingDirectory)).toBe(false);
    expect(i).toMatchObject({ hook_event_name: "PreToolUse", session_id: "session-1", cwd: root, tool_name: "fs.write", tool_use_id: "call-1",
      action_class: "WRITE_LOW", requested_mode: "EXECUTE", tool_input: call.arguments, tool_input_truncated: false, tool_input_bytes: Buffer.byteLength(JSON.stringify(call.arguments)) });
    // macOS injects __CF_USER_TEXT_ENCODING into every child; nothing else reaches the hook.
    expect(env.filter((name: string) => !name.startsWith("__CF_"))).toEqual(["AMC_HOOK_EVENT", "AMC_WORKSPACE", "HOME", "PATH"]);
  });
  it.each([
    ["exit 2 with a stderr reason", "process.stderr.write('no writes on Friday');process.exit(2)", "no writes on Friday"],
    ["a deny written past the 64 KiB stdout capture (fail closed, not abstain)", "process.stdout.write(JSON.stringify({decision:'deny',reason:'writes need review',detail:'x'.repeat(70000)}))", "output exceeded 65536 bytes"],
    ["decision deny", "console.log(JSON.stringify({decision:'deny',reason:'review first'}))", "review first"],
    ["permissionDecision deny", "console.log(JSON.stringify({hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:'policy'}}))", "policy"],
    ["ask", "console.log(JSON.stringify({hookSpecificOutput:{permissionDecision:'ask'}}))", "human decision"],
    ["updatedInput", "console.log(JSON.stringify({hookSpecificOutput:{permissionDecision:'allow',updatedInput:{path:'other'}}}))", "authority AMC does not grant (updatedInput)"],
    ["additionalContext", "console.log(JSON.stringify({decision:'allow',additionalContext:'be nice'}))", "authority AMC does not grant (additionalContext)"],
    ["continue false", "console.log(JSON.stringify({continue:false,stopReason:'halt'}))", "halt"],
    ["exit 1", "process.exit(1)", "hook exited 1"]
  ])("denies PreToolUse on %s", async (_label, script, reason) => {
    const root = workspace();
    const sha256 = install(root, { PreToolUse: [{ hooks: [{ type: "command", command: node(root, `${READ_STDIN}${script}})`) }] }] });
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
    install(root, { PreToolUse: [{ hooks: [{ type: "command", command: node(root, `${READ_STDIN}${script}})`) }] }] });
    const hooks = runtime(root);
    const call = execution("fs.write");
    await hooks.prepare(call);
    expect(hooks.guard(call)).toBeUndefined();
  });
  it("denies on timeout, denies an unprepared call, and skips tools the matcher does not name", async () => {
    const root = workspace();
    install(root, { PreToolUse: [{ matcher: "bash", hooks: [{ type: "command", command: node(root, "setTimeout(()=>{}, 30000)"), timeout: 1 }] }] });
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
    install(root, { PreToolUse: [{ hooks: [{ type: "command", command: node(root, `${READ_STDIN}if(i.tool_input!==null||!i.tool_input_truncated)process.exit(2)})`) }] }] });
    const strict = runtime(root);
    const call = execution("fs.write", big);
    await strict.prepare(call);
    expect(strict.guard(call)).toContain("did not declare acceptTruncatedInput");
    install(root, { PreToolUse: [{ hooks: [{ type: "command", acceptTruncatedInput: true, command: node(root, `${READ_STDIN}if(i.tool_input!==null||!i.tool_input_truncated)process.exit(2)})`) }] }] });
    const lenient = runtime(root);
    const again = execution("fs.write", big);
    await lenient.prepare(again);
    expect(lenient.guard(again)).toBeUndefined();
  });
  it("observes PostToolUse with the result digest and Stop with the turn, reporting failures without vetoing", async () => {
    const root = workspace();
    const seen = join(root, "post.json");
    install(root, { PostToolUse: [{ matcher: "fs.*", hooks: [{ type: "command", command: node(root, `${READ_STDIN}require('fs').writeFileSync(${JSON.stringify(seen)},d);process.exit(2)})`) }] }],
      Stop: [{ hooks: [{ type: "command", command: node(root, "process.exit(0)") }] }] });
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
    install(root, { UserPromptSubmit: [{ hooks: [{ type: "command", command: node(root, `${READ_STDIN}if(/password/.test(i.prompt)){console.log(JSON.stringify({decision:'block',reason:'no secrets in prompts'}))}})`) }] }] });
    expect(await denyPromptByCommandHooks({ workspace: root, prompt: "paste my password here" })).toContain("no secrets in prompts");
    expect(await denyPromptByCommandHooks({ workspace: root, prompt: "hello" })).toBeUndefined();
    expect(await denyPromptByCommandHooks({ workspace: workspace(), prompt: "no hooks file" })).toBeUndefined();
  });
  it("records no digest, rather than a fabricated one, for a file it could not read", async () => {
    const root = workspace();
    install(root, { Stop: [{ hooks: [{ type: "command", command: node(root, "process.exit(0)") }] }] });
    rmSync(join(root, ".amc", "hooks.json")); writeFileSync(join(root, "elsewhere.json"), hooksFile({})); symlinkSync(join(root, "elsewhere.json"), join(root, ".amc", "hooks.json"));
    const hooks = runtime(root);
    expect(hooks.sha256).toBeNull();
    expect(await hooks.observe({ kind: "turn-end", turn: 1 })).toEqual([{ extensionId: "hooks.json", manifestDigest: null, kind: "turn-end", code: "HOOKS_INVALID" }]);
  });
  it("fails closed while the file is present but not trusted or not valid", async () => {
    const root = workspace();
    install(root, { PreToolUse: [{ hooks: [{ type: "command", command: node(root, "process.exit(0)") }] }] }, false);
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
    const sha256 = install(root, { PreToolUse: [{ matcher: "read", hooks: [{ type: "command", command: node(root, "process.stderr.write('reads are off');process.exit(2)") }] }] });
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
    const sha256 = install(root, { PreToolUse: [{ matcher: "fs.write", hooks: [{ type: "command", command: node(root, "process.exit(2)") }] }] });
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
  it("fires UserPromptSubmit on shared sessions (ACP, SDK, Studio) too: the typed text, every text part and the skill name, before anything is queued", async () => {
    const root = workspace();
    initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
    mkdirSync(join(root, ".amc", "commands"), { recursive: true });
    writeFileSync(join(root, ".amc", "commands", "deploy.md"), "---\ndescription: deploy something\n---\nDeploy $ARGUMENTS.\n");
    install(root, { UserPromptSubmit: [{ hooks: [{ type: "command", command: node(root, `${READ_STDIN}if(/password/.test(i.prompt)){process.stderr.write('no secrets in prompts');process.exit(2)}if(i.skill==='deploy'){process.stderr.write('no deploys: '+i.prompt);process.exit(2)}})`) }] }] });
    const registry = new AdapterRegistry();
    let requests = 0;
    registry.register({ providerId: LOOP_PROVIDER, adapter: scriptedAdapter([textStep("first"), textStep("second")]), baseUrl: "https://api.anthropic.invalid",
      credentialRef: credentialRef("AMC_LOOP_TEST_KEY"), models: [LOOP_MODEL] });
    const session = openAgentSession({ workspace: root, agentId: "default", tools: "none", systemPrompt: "You are a careful assistant.", harnessVersion: "3.2.0",
      compositionDigest: "hooks-session-fixture", policyDigest: "hooks-session-fixture", route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
      makeLlm: own => new LlmRuntime({ session: own, registry, credentials: new FixedCredentials(), transport: async request => { requests++; return silentTransport(request); } }) });
    try {
      expect(await session.prompt("my password is hunter2")).toMatchObject({ ok: false, reason: expect.stringContaining("prompt refused by hook: hooks.json sha256") });
      expect(await session.prompt("/deploy prod")).toMatchObject({ ok: false, reason: expect.stringContaining("no deploys: /deploy prod") });
      // A secret in a later text part, after an image, is still submitted: the hook sees every text part.
      expect(await session.promptParts!([{ type: "image", image: imageInput() }, { type: "text", text: "the password is x" }])).toMatchObject({ ok: false, reason: expect.stringContaining("no secrets in prompts") });
      expect(await session.promptParts!([{ type: "text", text: "summarise" }, { type: "image", image: imageInput() }, { type: "text", text: "password" }])).toMatchObject({ ok: false, reason: expect.stringContaining("no secrets in prompts") });
      expect(requests).toBe(0);
      expect(await session.prompt("hello")).toMatchObject({ ok: true });
      expect(requests).toBe(1);
    } finally { session.close(); }
  }, 60_000);
  it("agent-loop run stops on a UserPromptSubmit denial before any session exists, and runs otherwise", async () => {
    const root = workspace();
    const home = realpathSync(mkdtempSync(join(tmpdir(), "amc-hooks-cred-home-"))); directories.push(home);
    initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
    mkdirSync(join(root, ".amc", "commands"), { recursive: true });
    writeFileSync(join(root, ".amc", "commands", "deploy.md"), "---\ndescription: deploy something\n---\nDeploy $ARGUMENTS.\n");
    install(root, { UserPromptSubmit: [{ hooks: [{ type: "command", command: node(root, `${READ_STDIN}if(/password/.test(i.prompt)){process.stderr.write('no secrets in prompts');process.exit(2)}if(i.skill==='deploy'){process.stderr.write('no deploys: '+i.prompt);process.exit(2)}})`) }] }] });
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
      // The hook sees the line as typed and the resolved skill name, so it can deny a command by name (skeptic).
      const command = await invoke("/deploy prod");
      expect(command.failures).toHaveLength(1);
      expect(command.errors.join("\n")).toContain("no deploys: /deploy prod");
    } finally { process.chdir(cwd); }
  }, 60_000);
  it("refuses a foreign delegate while a hooks.json is present, because the foreign child never runs it (skeptic)", () => {
    const root = workspace();
    install(root, { PreToolUse: [{ matcher: "fs.write|bash", hooks: [{ type: "command", command: node(root, "process.exit(2)") }] }] });
    expect(resolveForeignRunner({ providerId: "claude-cli", workspace: root, agentId: "default" })).toMatchObject({ ok: false, reason: expect.stringContaining("hooks.json is present") });
    rmSync(join(root, ".amc", "hooks.json")); untrustNativeCommandHooks(root);
    const without = resolveForeignRunner({ providerId: "claude-cli", workspace: root, agentId: "default" });
    expect(without.ok === false && without.reason).not.toContain("hooks.json"); // the next refusal is Studio's, not the hooks'
  });
  it("amc native-extension hooks inspect, trust and test through the built CLI", () => {
    const root = workspace();
    const sha256 = install(root, { PreToolUse: [{ matcher: "fs.write|Write", hooks: [{ type: "command", command: node(root, "process.stderr.write('writes need review');process.exit(2)") }] }],
      SessionStart: [{ hooks: [{ type: "command", command: [direct("trust-one")] }] }] }, false);
    const cli = join(process.cwd(), "dist", "cli.js");
    const amc = (...args: string[]) => spawnSync(process.execPath, [cli, "native-extension", "hooks", ...args], { cwd: root, encoding: "utf8",
      env: { ...process.env, AMC_HOME: process.env.AMC_HOME, AMC_NO_AUTO_REBUILD: "1", NO_COLOR: "1" } });
    const untrusted = JSON.parse(amc("inspect", "--json").stdout);
    // Review happens BEFORE acceptance: the untrusted view shows the handlers, the bound files and the value to type.
    expect(untrusted).toMatchObject({ status: "untrusted", sha256, mark: expect.stringMatching(/^[0-9a-f]{64}$/), references: [{ rel: expect.stringMatching(/^\.amc\/hooks\/hook-/) }], handlers: [{ event: "PreToolUse", matchesBuiltinTools: ["fs.write"] }, { event: "SessionStart" }] });
    expect(amc("test", "PreToolUse", "--json").status).toBe(1);
    expect(amc("trust", "--sha256", "f".repeat(64)).status).toBe(1);
    expect(amc("trust", "--sha256", untrusted.mark).status).toBe(0);
    const inspected = JSON.parse(amc("inspect", "--json").stdout);
    expect(inspected.status).toBe("trusted");
    expect(inspected.handlers).toMatchObject([{ event: "PreToolUse", matchesBuiltinTools: ["fs.write"], denyCapable: true, emitted: true }, { event: "SessionStart", emitted: false }]);
    const tested = JSON.parse(amc("test", "PreToolUse", "--tool", "fs.write", "--json").stdout);
    expect(tested).toMatchObject({ outcome: "deny", runs: [{ decision: "deny", reason: "writes need review", exitCode: 2 }] });
    expect(JSON.parse(amc("test", "PreToolUse", "--tool", "fs.read", "--json").stdout).runs).toEqual([]);
    expect(JSON.parse(amc("untrust", "--json").stdout)).toMatchObject({ ok: true, retired: true });
    expect(JSON.parse(amc("inspect", "--json").stdout).status).toBe("untrusted");
  }, 60_000);
});
