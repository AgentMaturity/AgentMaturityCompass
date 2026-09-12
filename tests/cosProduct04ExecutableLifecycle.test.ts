import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SandboxOutcome, SandboxPolicy } from "../src/sandbox/sandboxTypes.js";
import type { NativeExtensionSnapshot } from "../src/extensions/nativeExtensionStore.js";
import type { NativeExecutableDeclaration } from "../src/plugins/nativeExecutableSchema.js";

// Deliberately simulated authority and launcher seams. These unit regressions
// exercise lifecycle/control flow, not cryptographic or OS-enforcement claims.
// The companion file contains real signed-chain and opt-in isolated cases.
const seams = vi.hoisted(() => ({
  read: vi.fn(), describe: vi.fn(), installed: vi.fn(), approval: vi.fn(), module: vi.fn(),
  created: vi.fn(), available: true, run: vi.fn()
}));
vi.mock("../src/extensions/nativeExtensionStore.js", () => ({ readNativeExtension: seams.read, describeNativeExtension: seams.describe }));
vi.mock("../src/plugins/nativeExecutablePackage.js", () => ({ assertNativeExecutableInstalled: seams.installed }));
vi.mock("../src/plugins/nativeExecutablePolicy.js", () => ({ assertNativeExecutableApproval: seams.approval }));
vi.mock("../src/plugins/pluginLoader.js", () => ({ loadInstalledPluginExecutable: seams.module }));
vi.mock("../src/sandbox/sandboxRunner.js", () => ({ SandboxRunner: class {
  constructor(options: unknown) { seams.created(options); }
  select() { return seams.available ? { kind: "bwrap" } : null; }
  run(argv: readonly string[], cwd: string, policy: SandboxPolicy): Promise<SandboxOutcome> { return seams.run(argv, cwd, policy); }
} }));

import { NativeExecutableRunner } from "../src/plugins/nativeExecutableRunner.js";
import { NativeExecutableError } from "../src/plugins/nativeExecutableSchema.js";
import { NativeExtensionManager } from "../src/extensions/nativeExtensionRuntime.js";

let snapshot: NativeExtensionSnapshot;
let declaration: NativeExecutableDeclaration;
const staged: string[] = [];

function requestAt(cwd: string): { invocationId: string; extensionId: string; exportName: string; input: Record<string, unknown> } {
  return JSON.parse(readFileSync(join(cwd, "request.json"), "utf8"));
}
function outcome(cwd: string, output = "computed output", patch: Partial<SandboxOutcome> = {}): SandboxOutcome {
  return { confined: true, backend: "bwrap", failure: null, exitCode: 0, timedOut: false,
    stdout: JSON.stringify({ protocol: "amc-executable/1", invocationId: requestAt(cwd).invocationId, ok: true, output }),
    stderr: "", writableRoots: [], treeExitProven: true, droppedBytes: 0,
    enforcement: { hostWrites: "declared-roots-only", network: "socket-syscalls-denied", readonlyRoots: [cwd],
      privateWritableRoots: ["/tmp", "/dev"], launcherStatus: "command-exited", sourcePolicySha256: "c".repeat(64), limitations: [] }, ...patch };
}
function runner(): NativeExecutableRunner { return new NativeExecutableRunner(snapshot.workspace, snapshot.manifestPath, snapshot.manifestDigest); }

beforeEach(() => {
  vi.resetAllMocks(); seams.available = true; staged.length = 0;
  declaration = { apiVersion: 1, pluginId: "unit-plugin", version: "1.0.0", packageSha256: "a".repeat(64),
    publisherFingerprint: "b".repeat(64), entrypoint: "content/extensions/main.mjs",
    capabilities: ["context.generate", "command.invoke"], contexts: [{ name: "computed", export: "context" }],
    commands: { compute: { export: "command" } }, limits: { timeoutMs: 1_000, maxOutputBytes: 100, maxCalls: 3, maxLifetimeMs: 30_000 } };
  snapshot = { workspace: "/simulated/workspace", root: "/simulated/workspace", manifestPath: "/simulated/workspace/extension.json",
    manifestDigest: "d".repeat(64), signatureValid: true, totalContentBytes: 0, contents: new Map(),
    manifestBytes: Buffer.from("unit fixture"), signatureBytes: Buffer.from("simulated authority"),
    manifest: { schemaVersion: 2, id: "computed", contexts: [], commands: {}, executable: declaration } };
  seams.read.mockReturnValue(snapshot);
  seams.describe.mockReturnValue({ id: snapshot.manifest.id, manifestDigest: snapshot.manifestDigest });
  seams.installed.mockReturnValue(Buffer.from("simulated package"));
  seams.approval.mockReturnValue({ policyDigest: "c".repeat(64), expiresAt: Date.now() + 60_000 });
  seams.module.mockReturnValue({ reference: { pluginId: declaration.pluginId, version: declaration.version,
    publisherFingerprint: declaration.publisherFingerprint, packageSha256: declaration.packageSha256, entrypoint: declaration.entrypoint },
    moduleSha256: "e".repeat(64), source: "export function command() { return 'unit'; }" });
  seams.run.mockImplementation(async (_argv: readonly string[], cwd: string) => { staged.push(cwd); return outcome(cwd); });
});
afterEach(() => {
  vi.useRealTimers(); vi.restoreAllMocks();
  for (const directory of staged) expect(existsSync(directory)).toBe(false);
});

describe("P04 bounded lifecycle with a simulated launcher", () => {
  it("has no load-time execution and only passes the declared input into a private invocation", async () => {
    const runtime = runner(); expect(seams.run).not.toHaveBeenCalled();
    const args = '$(not-a-shell) {{literal}} "quoted"';
    seams.run.mockImplementation(async (argv: readonly string[], cwd: string, policy: SandboxPolicy) => {
      staged.push(cwd);
      expect(argv).toEqual([join(cwd, "node"), "--max-old-space-size=64", join(cwd, "bootstrap.mjs")]);
      expect(policy).toMatchObject({ writableRoots: [], network: "deny", sourcePolicySha256: "c".repeat(64) });
      expect(policy.signal).toBeInstanceOf(AbortSignal);
      expect(requestAt(cwd)).toMatchObject({ extensionId: "computed", exportName: "command", input: { arguments: args } });
      expect(existsSync(join(cwd, ".amc"))).toBe(true);
      expect(readFileSync(join(cwd, "extension.mjs"), "utf8")).toBe(seams.module.mock.results[0]!.value.source);
      expect(readFileSync(join(cwd, "bootstrap.mjs"), "utf8")).toContain("extension.onUnload");
      return outcome(cwd);
    });
    expect(await runtime.invoke("command", "compute", { arguments: args })).toBe("computed output");
    expect(seams.created).toHaveBeenCalledWith({ backends: [expect.objectContaining({ kind: "bwrap" })] });
    expect(runtime.inspect()).toMatchObject({ state: "loaded-not-running", callsUsed: 1 });
  });

  it("refuses unsupported isolation and does not try a weaker backend", async () => {
    seams.available = false; const runtime = runner();
    await expect(runtime.invoke("command", "compute", { arguments: "hello" })).rejects.toMatchObject({ code: "EXECUTABLE_ISOLATION_UNAVAILABLE" });
    await expect(runtime.invoke("command", "compute", { arguments: "again" })).rejects.toMatchObject({ code: "EXECUTABLE_ISOLATION_UNAVAILABLE" });
    expect(seams.run).not.toHaveBeenCalled(); expect(seams.created).toHaveBeenCalledTimes(1);
  });

  it("rejects undeclared handlers, extra context inputs, byte overflow and pre-cancelled calls before launch", async () => {
    const runtime = runner(); const signal = AbortSignal.abort();
    await expect(runtime.invoke("command", "unknown", { arguments: "x" })).rejects.toMatchObject({ code: "EXECUTABLE_CAPABILITY_DENIED" });
    await expect(runtime.invoke("context", "computed", { turn: 1, step: 1, credentials: "not allowed" })).rejects.toMatchObject({ code: "EXECUTABLE_INPUT_INVALID" });
    await expect(runtime.invoke("command", "compute", { arguments: "😀".repeat(8_000) })).rejects.toMatchObject({ code: "EXECUTABLE_INPUT_INVALID" });
    await expect(runtime.invoke("command", "compute", { arguments: "x" }, signal)).rejects.toMatchObject({ code: "EXECUTABLE_CANCELLED" });
    expect(seams.run).not.toHaveBeenCalled(); expect(runtime.inspect().callsUsed).toBe(0);
  });

  it("enforces per-load invocation count without automatically reloading", async () => {
    declaration.limits.maxCalls = 1; const runtime = runner();
    await runtime.invoke("command", "compute", { arguments: "one" });
    await expect(runtime.invoke("command", "compute", { arguments: "two" })).rejects.toMatchObject({ code: "EXECUTABLE_CALL_LIMIT" });
    expect(seams.run).toHaveBeenCalledTimes(1);
  });

  it("refuses an expired load before launching even when the authority seam still answers", async () => {
    const now = Date.now(); seams.approval.mockReturnValue({ policyDigest: "c".repeat(64), expiresAt: now + 50 });
    const runtime = runner(); vi.spyOn(Date, "now").mockReturnValue(now + 51);
    await expect(runtime.invoke("command", "compute", { arguments: "late" })).rejects.toMatchObject({ code: "EXECUTABLE_LIFETIME_EXPIRED" });
    expect(seams.run).not.toHaveBeenCalled();
  });

  it("refuses concurrent calls rather than creating an unbounded queue", async () => {
    let finish: (() => void) | undefined;
    seams.run.mockImplementation((_argv: readonly string[], cwd: string) => {
      staged.push(cwd); const result = outcome(cwd);
      return new Promise<SandboxOutcome>(resolve => { finish = () => resolve(result); });
    });
    const runtime = runner(); const pending = runtime.invoke("command", "compute", { arguments: "first" });
    await expect(runtime.invoke("command", "compute", { arguments: "second" })).rejects.toMatchObject({ code: "EXECUTABLE_BUSY" });
    finish!(); await pending; expect(seams.run).toHaveBeenCalledTimes(1);
  });

  it("unload aborts active execution and rejects a late successful response", async () => {
    let finish: (() => void) | undefined; let activeSignal: AbortSignal | undefined;
    seams.run.mockImplementation((_argv: readonly string[], cwd: string, policy: SandboxPolicy) => {
      staged.push(cwd); activeSignal = policy.signal; const result = outcome(cwd);
      return new Promise<SandboxOutcome>(resolve => { finish = () => resolve(result); });
    });
    const runtime = runner(); const pending = runtime.invoke("command", "compute", { arguments: "first" });
    runtime.revoke("unloaded"); expect(activeSignal?.aborted).toBe(true); finish!();
    await expect(pending).rejects.toMatchObject({ code: "EXECUTABLE_UNLOADED" });
    await expect(runtime.invoke("command", "compute", { arguments: "again" })).rejects.toMatchObject({ code: "EXECUTABLE_UNLOADED" });
    expect(seams.run).toHaveBeenCalledTimes(1);
  });

  function waitForAbort() {
    seams.run.mockImplementation((_argv: readonly string[], cwd: string, policy: SandboxPolicy) => {
      staged.push(cwd); const result = outcome(cwd, "late text", { cancelled: true });
      return new Promise<SandboxOutcome>(resolve => {
        const settle = () => resolve(result);
        policy.signal!.addEventListener("abort", settle, { once: true });
        if (policy.signal!.aborted) settle();
      });
    });
  }

  it("propagates caller cancellation to the actual invocation signal", async () => {
    waitForAbort(); const runtime = runner(); const controller = new AbortController();
    const pending = runtime.invoke("command", "compute", { arguments: "x" }, controller.signal);
    controller.abort(); await expect(pending).rejects.toMatchObject({ code: "EXECUTABLE_CANCELLED" });
  });

  it("observes revocation during a running call, latches it and cancels the child", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    waitForAbort(); const runtime = runner();
    const pending = runtime.invoke("command", "compute", { arguments: "x" }).catch(error => error as unknown);
    seams.approval.mockImplementation(() => { throw new NativeExecutableError("EXECUTABLE_REVOKED", "revoked by policy"); });
    await vi.advanceTimersByTimeAsync(250);
    expect(await pending).toMatchObject({ code: "EXECUTABLE_REVOKED" });
    expect(runtime.inspect().failureCode).toBe("EXECUTABLE_REVOKED"); expect(vi.getTimerCount()).toBe(0);
  });

  it("applies the parent deadline and stops the handle after a timeout", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    waitForAbort(); const runtime = runner();
    const pending = runtime.invoke("command", "compute", { arguments: "x" }).catch(error => error as unknown);
    await vi.advanceTimersByTimeAsync(1_001);
    expect(await pending).toMatchObject({ code: "EXECUTABLE_TIMEOUT" }); expect(vi.getTimerCount()).toBe(0);
  });

  it("does not publish a result when approval is revoked at the completion boundary", async () => {
    seams.run.mockImplementation(async (_argv: readonly string[], cwd: string) => {
      staged.push(cwd); const result = outcome(cwd);
      seams.approval.mockImplementation(() => { throw new NativeExecutableError("EXECUTABLE_REVOKED", "revoked before publish"); });
      return result;
    });
    await expect(runner().invoke("command", "compute", { arguments: "x" })).rejects.toMatchObject({ code: "EXECUTABLE_REVOKED" });
  });

  const invalidOutcomes: Array<[string, Partial<SandboxOutcome>]> = [
    ["EXECUTABLE_CONFINEMENT_UNCONFIRMED", { confined: false }],
    ["EXECUTABLE_CONFINEMENT_UNCONFIRMED", { enforcement: undefined }],
    ["EXECUTABLE_CLEANUP_UNCONFIRMED", { treeExitProven: false }],
    ["EXECUTABLE_TIMEOUT", { timedOut: true }],
    ["EXECUTABLE_OUTPUT_LIMIT", { droppedBytes: 1 }],
    ["EXECUTABLE_PROCESS_FAILED", { exitCode: 7 }],
    ["EXECUTABLE_PROTOCOL_INVALID", { stdout: "private malformed response" }]
  ];
  it.each(invalidOutcomes)("rejects %s without replaying the module", async (code, patch) => {
    seams.run.mockImplementation(async (_argv: readonly string[], cwd: string) => { staged.push(cwd); return outcome(cwd, "text", patch); });
    const runtime = runner();
    await expect(runtime.invoke("command", "compute", { arguments: "x" })).rejects.toMatchObject({ code });
    await expect(runtime.invoke("command", "compute", { arguments: "again" })).rejects.toMatchObject({ code });
    expect(seams.run).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized handler text independently of the launcher's capture limit", async () => {
    seams.run.mockImplementation(async (_argv: readonly string[], cwd: string) => { staged.push(cwd); return outcome(cwd, "😀".repeat(26)); });
    await expect(runner().invoke("command", "compute", { arguments: "x" })).rejects.toMatchObject({ code: "EXECUTABLE_OUTPUT_LIMIT" });
  });

  it("does not expose plugin stderr in a handler failure", async () => {
    seams.run.mockImplementation(async (_argv: readonly string[], cwd: string) => {
      staged.push(cwd);
      return outcome(cwd, "", { exitCode: 1, stderr: "private-path-and-input",
        stdout: JSON.stringify({ protocol: "amc-executable/1", invocationId: requestAt(cwd).invocationId, ok: false, code: "EXECUTABLE_HANDLER_FAILED" }) });
    });
    const error = await runner().invoke("command", "compute", { arguments: "secret argument" }).catch(value => value as Error);
    expect(error).toMatchObject({ code: "EXECUTABLE_HANDLER_FAILED" }); expect(String(error)).not.toContain("private-path-and-input");
    expect(String(error)).not.toContain("secret argument");
  });

  it("connects the manager's executable context and async command surfaces to this lifecycle", async () => {
    const manager = new NativeExtensionManager(snapshot.workspace); manager.load(snapshot.manifestPath, snapshot.manifestDigest);
    const prepared = manager.prepareTurn();
    expect(await prepared.contextPlugins[0]!.collect({ turn: 1, step: 1 })).toContain("untrusted, attributed extension data");
    expect((await manager.invokeCommand("/compute hello"))?.prompt).toContain("computed output");
    manager.unloadAll();
    await expect(prepared.contextPlugins[0]!.collect({ turn: 1, step: 2 })).rejects.toMatchObject({ code: "EXECUTABLE_UNLOADED" });
    expect(manager.prepareTurn()).toEqual({ contextPlugins: [], pins: [], commands: [] });
    expect(seams.run).toHaveBeenCalledTimes(2);
  });
});
