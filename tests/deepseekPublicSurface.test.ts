/** AUTHORED, UNEXECUTED. Actual source barrels, Commander registrations and
 * public SDK. Only process/stdio edges are substituted; no installed or live
 * provider acceptance is implied by these fixture definitions.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as root from "../src/index.js";
import * as sdk from "../src/sdk/index.js";
import * as native from "../src/sdk/nativeAgentClient.js";
import { deepseekAdapter } from "../src/llm/providers/deepseekAdapter.js";
import { deepseekChatEncoder } from "../src/llm/request/deepseekChatEncoder.js";
import { credentialRefName } from "../src/credentials/credentialRef.js";
import { registerAgentCommands } from "../src/cli-agent-commands.js";
import { paramsFor, routeFor, type AgentLoopCliIo, type RunOptions } from "../src/cli-agent-options.js";
import { registerAcpCommands } from "../src/acp/acpCli.js";
import { acpRouteFor, startAcpStdio, type AcpStdioInit } from "../src/acp/acpStdioMain.js";
import { inspectNativeFirstUse } from "../src/setup/nativeFirstUseGuide.js";

vi.mock("node:child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: vi.fn() };
});

const folders: string[] = [];
const clients = new Set<native.AMCNativeClient>();
const acpHandles = new Set<ReturnType<typeof startAcpStdio>>();
beforeEach(() => {
  vi.mocked(spawn).mockReset().mockImplementation(() => { throw new Error("Unexpected process creation"); });
});
afterEach(async () => {
  for (const client of clients) await client.close();
  clients.clear();
  for (const handle of acpHandles) await handle.close();
  acpHandles.clear();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function workspace(initialized = false): string {
  const path = mkdtempSync(join(tmpdir(), "amc-deepseek-public-"));
  folders.push(path);
  if (initialized) root.initWorkspace({ workspacePath: path, agentId: "default", trustBoundaryMode: "isolated" });
  return path;
}

function output() {
  const logs: string[] = [], errors: string[] = [];
  let failures = 0;
  const io: AgentLoopCliIo = { log: line => logs.push(line), error: line => errors.push(line), fail: () => { failures++; } };
  return { io, logs, errors, failures: () => failures };
}

function program(io: AgentLoopCliIo): Command {
  const command = new Command().name("amc").exitOverride();
  command.configureOutput({ writeOut: io.log, writeErr: io.error });
  // This also registers the real native-schedule commands. No replacement parsers.
  registerAgentCommands(command, io);
  registerAcpCommands(command);
  return command;
}

function commandAt(rootCommand: Command, path: readonly string[]): Command {
  return path.reduce((parent, name) => {
    const child = parent.commands.find(candidate => candidate.name() === name);
    if (!child) throw new Error(`Missing actual public command ${path.join(" ")}`);
    return child;
  }, rootCommand);
}

function parse(path: readonly string[], argv: string[]): RunOptions & Record<string, unknown> {
  const io = output();
  const command = commandAt(program(io.io), path);
  // Parse the ACTUAL registered option definitions, without invoking a task,
  // schedule signer, watcher or ACP server. Action refusals are exercised below.
  const parsed = command.parseOptions(argv);
  expect(parsed.unknown).toEqual([]);
  return command.opts<RunOptions & Record<string, unknown>>();
}

function acpInit(path: string, options: Partial<AcpStdioInit> = {}): AcpStdioInit {
  return { workspace: path, agentId: "default", providerId: "deepseek", model: "fixture-model",
    systemPrompt: "Fixture public surface.", credentialsHome: join(path, "empty-credentials"),
    credentialsMode: "operator-only", ...options };
}

/** Script only the child-process boundary. The real SDK sends initialize,
 * checks identity/protocol, constructs argv and observes an actual close event.
 */
function scriptedChild(): ChildProcessWithoutNullStreams {
  const child = new EventEmitter();
  const stdout = new PassThrough(), stderr = new PassThrough();
  let buffer = "", closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    stdout.end(); stderr.end(); child.emit("close", 0, null);
  };
  const stdin = new Writable({
    write(chunk, _encoding, done) {
      buffer += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        const request = JSON.parse(line) as { id: number; method: string };
        const reply = request.method === "initialize"
          ? { jsonrpc: "2.0", id: request.id, result: { protocolVersion: 1,
            agentInfo: { name: "agent-maturity-compass", version: "scripted-process-edge" }, agentCapabilities: {} } }
          : { jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Unexpected fixture method" } };
        queueMicrotask(() => stdout.write(JSON.stringify(reply) + "\n"));
      }
      done();
    },
    final(done) { done(); queueMicrotask(close); }
  });
  // The process-edge fixture deliberately implements only the public streams,
  // events and kill operation consumed by the real client, not a native PID.
  return Object.assign(child, { stdin, stdout, stderr, kill: () => { queueMicrotask(close); return true; } }) as unknown as ChildProcessWithoutNullStreams;
}

describe("native DeepSeek actual public source surfaces (authored, unexecuted)", () => {
  test("root, SDK barrel and declared sdk/native source expose the same native LLM implementations", () => {
    for (const surface of [root, sdk, native]) {
      expect(surface.llm.deepseekAdapter).toBe(deepseekAdapter);
      expect(surface.llm.deepseekChatEncoder).toBe(deepseekChatEncoder);
      expect(surface.llm.DEFAULT_REQUEST_ENCODERS.get("deepseek-chat", 1)).toBe(deepseekChatEncoder);
      expect(surface.llm.DEEPSEEK_CAPABILITIES.thinking).toBe("full-text-replay-with-tools");
      expect(surface.llm.DEEPSEEK_WIRE_CONTRACT.integration).toBe("native-runtime");
    }
    expect(root.AMCNativeClient).toBe(native.AMCNativeClient);
    expect(sdk.AMCNativeClient).toBe(native.AMCNativeClient);
    const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(manifest.exports["."].import).toBe("./dist/index.js");
    expect(manifest.exports["./sdk/native"].import).toBe("./dist/sdk/nativeAgentClient.js");
    // Manifest paths plus source imports do not assert that a built tarball works.
    expect(spawn).not.toHaveBeenCalled();
  });

  test.each([
    { path: ["agent-loop", "run"] }, { path: ["agent-loop", "chat"] }, { path: ["acp"] },
    { path: ["native-schedule", "run-due"] }, { path: ["native-schedule", "watch"] }
  ])("actual $path flags preserve exact thinking/effort into native route parameters", ({ path }) => {
    const options = parse(path, ["--provider", "deepseek", "--model", "fixture-model", "--max-tokens", "64",
      "--thinking", "enabled", "--reasoning-effort", "max", "--credential", "FIXTURE_DEEPSEEK_REF",
      "--base-url", "https://deepseek.invalid"]);
    expect(options).toMatchObject({ provider: "deepseek", model: "fixture-model", maxTokens: "64",
      thinking: "enabled", reasoningEffort: "max", credential: "FIXTURE_DEEPSEEK_REF" });
    expect(paramsFor(options.provider!, Number(options.maxTokens), options)).toEqual({
      max_tokens: 64, thinking: { type: "enabled" }, reasoning_effort: "max" });
    const io = output();
    const route = routeFor(io.io, options.provider!, options, options.model);
    expect(route?.adapter).toBe(deepseekAdapter);
    expect(route?.baseUrl).toBe("https://deepseek.invalid");
    expect(credentialRefName(route!.credentialRef!)).toBe("FIXTURE_DEEPSEEK_REF");
    expect(io.failures()).toBe(0);
  });

  test("CLI, ACP and schedule defaults name a reference and never invent a model or credential value", () => {
    const io = output();
    for (const path of [["agent-loop", "run"], ["acp"], ["native-schedule", "run-due"], ["native-schedule", "watch"]]) {
      const options = parse(path, ["--provider", "deepseek", "--model", "fixture-model"]);
      const route = routeFor(io.io, options.provider!, options, options.model)!;
      expect(route.adapter).toBe(deepseekAdapter);
      expect(route.baseUrl).toBe("https://api.deepseek.com");
      expect(credentialRefName(route.credentialRef!)).toBe("DEEPSEEK_API_KEY");
      expect(paramsFor("deepseek", Number(options.maxTokens ?? "1024"), options)).toMatchObject({
        thinking: { type: "enabled" }, reasoning_effort: "high" });
    }
    const route = acpRouteFor(acpInit(workspace()));
    expect("error" in route).toBe(false);
    if ("error" in route) throw new Error(route.error);
    expect(route.adapter).toBe(deepseekAdapter);
    expect(route.baseUrl).toBe("https://api.deepseek.com");
    expect(credentialRefName(route.credentialRef!)).toBe("DEEPSEEK_API_KEY");
    expect(routeFor(io.io, "deepseek", {}, undefined)).toBeNull();
    expect(acpRouteFor({ ...acpInit(workspace()), model: "" })).toMatchObject({ error: expect.stringMatching(/--model is required/) });
    expect(spawn).not.toHaveBeenCalled();
  });

  test("guide registration, provider choice and missing-credential action use the DeepSeek reference", async () => {
    const path = workspace(true);
    const options = { workspace: path, agentId: "default", env: {}, credentialsHome: join(path, "empty-credentials"),
      userEnvPath: join(path, "absent-user-env") };
    const choice = await inspectNativeFirstUse(options);
    const deepseek = choice.choices.find(item => item.provider === "deepseek")!;
    expect(deepseek.action.argv).toContain("deepseek");
    const parsed = parse(["agent-loop", "guide"], ["--provider", "deepseek", "--model", "fixture-model"]);
    const guide = await inspectNativeFirstUse({ ...options, provider: parsed.provider, model: parsed.model });
    expect(guide.status).toBe("needs-credential");
    expect(guide.credential).toMatchObject({ ref: "DEEPSEEK_API_KEY", configured: false });
    expect(guide.nextAction?.argv.slice(0, 4)).toEqual(["amc", "credentials", "set", "DEEPSEEK_API_KEY"]);
    expect(guide.recheck?.argv).toContain("DEEPSEEK_API_KEY");
    expect(spawn).not.toHaveBeenCalled();
  });

  test.each([
    { thinking: "invalid" }, { reasoningEffort: "medium" },
    { thinking: "disabled", reasoningEffort: "high" }, { maxTokens: 0 },
    { providerId: "openai", thinking: "enabled" }
  ])("actual ACP startup refuses invalid native options before binding stdio: %j", options => {
    const input = new PassThrough(), outputStream = new PassThrough();
    const init = acpInit(workspace(), { ...options, stdin: input, stdout: outputStream, stderr: outputStream });
    expect(() => startAcpStdio(init)).toThrow(/DeepSeek|deepseek|positive integer/);
    expect(input.listenerCount("data")).toBe(0);
    expect(input.listenerCount("end")).toBe(0);
    expect(spawn).not.toHaveBeenCalled();
    input.destroy(); outputStream.destroy();
  });

  test("actual ACP accepts explicit disabled thinking and releases its stdio listeners", async () => {
    const path = workspace(true), input = new PassThrough(), outputStream = new PassThrough();
    const handle = startAcpStdio(acpInit(path, { thinking: "disabled", stdin: input, stdout: outputStream, stderr: outputStream }));
    acpHandles.add(handle);
    expect(input.listenerCount("data")).toBe(1);
    await handle.close(); acpHandles.delete(handle);
    expect(input.listenerCount("data")).toBe(0);
    expect(input.listenerCount("end")).toBe(0);
    expect(spawn).not.toHaveBeenCalled();
    input.destroy(); outputStream.destroy();
  });

  test("actual CLI run action rejects invalid DeepSeek effort before process creation", async () => {
    const path = workspace(true), io = output();
    vi.spyOn(process, "cwd").mockReturnValue(path);
    await program(io.io).parseAsync(["agent-loop", "run", "Fixture prompt", "--agent", "default",
      "--provider", "deepseek", "--model", "fixture-model", "--reasoning-effort", "medium",
      "--credentials-home", join(path, "empty-credentials")], { from: "user" });
    expect(io.failures()).toBe(1);
    expect(io.errors.join("\n")).toMatch(/reasoning_effort.*low\/high\/max/);
    expect(spawn).not.toHaveBeenCalled();
  });

  test.each([
    { thinking: "enabled", reasoningEffort: "low" },
    { thinking: "enabled", reasoningEffort: "max" },
    { thinking: "disabled" }, {}
  ] as const)("actual native SDK forwards argv and closes the scripted process: %j", async thinkingOptions => {
    const path = workspace();
    vi.mocked(spawn).mockReturnValue(scriptedChild());
    const client = await native.AMCNativeClient.start({ workspace: path, provider: "deepseek", model: "fixture-model",
      command: ["fixture-node", "fixture-cli.js"], baseUrl: "https://deepseek.invalid",
      credential: "FIXTURE_DEEPSEEK_REF", maxTokens: 64, ...thinkingOptions });
    clients.add(client);
    expect(spawn).toHaveBeenCalledTimes(1);
    const [executable, argv, options] = vi.mocked(spawn).mock.calls[0]!;
    expect(executable).toBe("fixture-node");
    expect(argv).toEqual(["fixture-cli.js", "acp", "--provider", "deepseek", "--model", "fixture-model",
      "--credential", "FIXTURE_DEEPSEEK_REF", "--base-url", "https://deepseek.invalid",
      ...("thinking" in thinkingOptions ? ["--thinking", thinkingOptions.thinking] : []),
      ...("reasoningEffort" in thinkingOptions ? ["--reasoning-effort", thinkingOptions.reasoningEffort] : []),
      "--max-tokens", "64"]);
    expect(options).toMatchObject({ cwd: realpathSync(path), shell: false, stdio: "pipe" });
    expect(client.agentInfo.name).toBe("agent-maturity-compass");
    await client.close(); clients.delete(client);
    expect(client.processClosed).toBe(true);
  });

  test.each([
    { thinking: "invalid" }, { reasoningEffort: "medium" }, { reasoningEffort: "xhigh" },
    { thinking: "disabled", reasoningEffort: "high" }, { thinking: null }, { maxTokens: 0 },
    { maxTokens: Number.NaN }, { provider: "openai", thinking: "enabled" },
    { provider: "stub", reasoningEffort: "high" }
  ])("invalid SDK flags fail before ANY child exists, including untyped callers: %j", async invalid => {
    const options = { workspace: workspace(), provider: "deepseek", model: "fixture-model",
      command: ["fixture-node"], ...invalid } as unknown as native.AMCNativeClientOptions;
    await expect(native.AMCNativeClient.start(options)).rejects.toThrow(/DeepSeek|deepseek|positive/);
    expect(spawn).not.toHaveBeenCalled();
  });
});
