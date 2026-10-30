import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NativeExtensionSnapshot } from "../src/extensions/nativeExtensionStore.js";
import type { SandboxOutcome, SandboxPolicy } from "../src/sandbox/sandboxTypes.js";
import type { NativeExecutableDeclaration } from "../src/plugins/nativeExecutableSchema.js";

// These authority/launcher seams prove control flow, not signatures or OS confinement.
const seams = vi.hoisted(() => ({ read: vi.fn(), installed: vi.fn(), approval: vi.fn(), module: vi.fn(), run: vi.fn(), available: true }));
vi.mock("../src/extensions/nativeExtensionStore.js", () => ({ readNativeExtension: seams.read }));
vi.mock("../src/plugins/nativeExecutablePackage.js", () => ({ assertNativeExecutableInstalled: seams.installed }));
vi.mock("../src/plugins/nativeExecutablePolicy.js", () => ({ assertNativeExecutableApproval: seams.approval }));
vi.mock("../src/plugins/pluginLoader.js", () => ({ loadInstalledPluginExecutable: seams.module }));
vi.mock("../src/sandbox/sandboxRunner.js", () => ({ SandboxRunner: class {
  select() { return seams.available ? { kind: "bwrap" } : null; }
  run(argv: readonly string[], cwd: string, policy: SandboxPolicy): Promise<SandboxOutcome> { return seams.run(argv, cwd, policy); }
} }));

import { NATIVE_EXECUTABLE_BOOTSTRAP } from "../src/plugins/nativeExecutableBootstrap.js";
import { NativeExecutableRunner } from "../src/plugins/nativeExecutableRunner.js";
import { NativeExecutableError, nativeExecutableDeclarationSchema } from "../src/plugins/nativeExecutableSchema.js";

const observed = ["turn-start", "turn-end", "step-start", "step-end", "tool-start", "tool-end"] as const;
const hooks = Object.fromEntries([...observed, "pre-tool"].map(name => [name, { export: "observe" }]));
function declaration() {
  return { apiVersion: 1, pluginId: "hook-fixture", version: "1.0.0", packageSha256: "a".repeat(64),
    publisherFingerprint: "b".repeat(64), entrypoint: "content/extensions/hooks.mjs", contexts: [], commands: {},
    capabilities: ["hook.observe", "hook.deny"], hooks,
    limits: { timeoutMs: 1_000, maxOutputBytes: 1_000, maxCalls: 10, maxLifetimeMs: 30_000 } };
}
function requestAt(cwd: string) { return JSON.parse(readFileSync(join(cwd, "request.json"), "utf8")); }
function outcome(cwd: string, output = "", patch: Partial<SandboxOutcome> = {}): SandboxOutcome {
  return { confined: true, backend: "bwrap", failure: null, exitCode: 0, timedOut: false,
    stdout: JSON.stringify({ protocol: "amc-executable/1", invocationId: requestAt(cwd).invocationId, ok: true, output }),
    stderr: "", writableRoots: [], treeExitProven: true, droppedBytes: 0,
    enforcement: { boundary: "linux-bwrap", hostWrites: "declared-roots-only", reads: "workspace-ro-and-runtime", network: "denied",
      allowHosts: [], processLimit: null, readonlyRoots: [cwd], privateWritableRoots: ["/tmp", "/dev"],
      launcherStatus: "command-exited", sourcePolicySha256: "c".repeat(64), limitations: [] }, ...patch };
}
let snapshot: NativeExtensionSnapshot;
const staged: string[] = [];
beforeEach(() => {
  vi.resetAllMocks(); seams.available = true; staged.length = 0;
  snapshot = { workspace: "/simulated/workspace", root: "/simulated/workspace", manifestPath: "/simulated/workspace/hooks.json",
    manifestDigest: "d".repeat(64), signatureValid: true, totalContentBytes: 0, contents: new Map(),
    manifestBytes: Buffer.from("simulated declaration"), signatureBytes: Buffer.from("simulated signature"),
    manifest: { schemaVersion: 2, id: "hooks", contexts: [], commands: {}, executable: declaration() as unknown as NativeExecutableDeclaration } };
  seams.read.mockReturnValue(snapshot); seams.installed.mockReturnValue(Buffer.from("simulated package"));
  seams.approval.mockReturnValue({ policyDigest: "c".repeat(64), expiresAt: Date.now() + 60_000 });
  seams.module.mockReturnValue({ reference: snapshot.manifest.schemaVersion === 2 ? snapshot.manifest.executable : {},
    moduleSha256: "e".repeat(64), source: "export function observe() { return ''; }" });
  seams.run.mockImplementation(async (_argv: readonly string[], cwd: string) => { staged.push(cwd); return outcome(cwd); });
});
afterEach(() => {
  vi.useRealTimers(); vi.restoreAllMocks();
  for (const directory of staged) expect(existsSync(directory)).toBe(false);
});
const runner = () => new NativeExecutableRunner(snapshot.workspace, snapshot.manifestPath, snapshot.manifestDigest);

describe("signed executable hook declaration", () => {
  it("admits only declared observer/deny capabilities and preserves declarations without hooks", async () => {
    expect(nativeExecutableDeclarationSchema.safeParse(declaration()).success).toBe(true);
    const legacy = { ...declaration(), capabilities: ["command.invoke"], commands: { compute: { export: "compute" } } };
    delete (legacy as Partial<typeof legacy>).hooks;
    expect(nativeExecutableDeclarationSchema.parse(legacy)).not.toHaveProperty("hooks");
    const all = { ...declaration(), capabilities: ["context.generate", "command.invoke", "hook.observe", "hook.deny"],
      contexts: [{ name: "context", export: "context" }], commands: { compute: { export: "compute" } } };
    expect(nativeExecutableDeclarationSchema.safeParse(all).success).toBe(true);
    const { nativeExecutablePolicySchema } = await vi.importActual<typeof import("../src/plugins/nativeExecutablePolicy.js")>("../src/plugins/nativeExecutablePolicy.js");
    expect(nativeExecutablePolicySchema.safeParse({ schemaVersion: 1, grants: [{ manifestDigest: "d".repeat(64),
      capabilities: all.capabilities, approvedAt: 1, expiresAt: 2 }], revoked: [] }).success).toBe(true);
  });

  it.each([
    { capabilities: ["hook.observe"], hooks: { "turn-start": { export: "observe" } } },
    { capabilities: ["hook.deny"], hooks: { "pre-tool": { export: "observe" } } }
  ])("admits a sparse declared hook set with exactly its capability: %j", patch => {
    expect(nativeExecutableDeclarationSchema.safeParse({ ...declaration(), ...patch }).success).toBe(true);
  });

  it.each([
    { capabilities: ["hook.observe"] }, { capabilities: ["hook.deny"] },
    { capabilities: ["hook.observe", "hook.deny", "hook.observe"] },
    { hooks: { "turn-start": { export: "observe" } } }, { hooks: { "pre-tool": { export: "observe" } } },
    { hooks: { ...hooks, allow: { export: "observe" } } },
    { hooks: { ...hooks, "pre-tool": { export: "observe", rewriteArguments: true } } },
    { hooks: { ...hooks, "turn-start": { export: "onLoad" } } }
  ])("rejects capability mismatches and undeclared hook authority: %j", patch => {
    expect(nativeExecutableDeclarationSchema.safeParse({ ...declaration(), ...patch }).success).toBe(false);
  });
});

describe("confined executable hook dispatch with a simulated launcher", () => {
  it.each([...observed, "pre-tool"])("dispatches %s through the pinned runner with a bounded flat view", async kind => {
    seams.run.mockImplementation(async (argv: readonly string[], cwd: string, policy: SandboxPolicy) => {
      staged.push(cwd);
      expect(argv).toEqual([join(cwd, "node"), "--max-old-space-size=64", join(cwd, "bootstrap.mjs")]);
      expect(policy).toMatchObject({ writableRoots: [], network: "deny", sourcePolicySha256: "c".repeat(64) });
      expect(requestAt(cwd)).toMatchObject({ exportName: "observe", input: { kind, turn: 1, step: 2,
        toolName: "fs.read", actionClass: "READ_ONLY", requestedMode: "EXECUTE" } });
      return outcome(cwd, kind === "pre-tool" ? '{"deny":"review required"}' : "ignored observer output");
    });
    const runtime = runner();
    expect(await runtime.invoke("hook", kind, Object.freeze({ kind, turn: 1, step: 2, toolName: "fs.read",
      actionClass: "READ_ONLY", requestedMode: "EXECUTE" }))).toBe(kind === "pre-tool" ? '{"deny":"review required"}' : "ignored observer output");
    expect(runtime.hookNames()).toEqual([...observed, "pre-tool"]);
    expect(seams.approval).toHaveBeenCalledWith(snapshot.workspace, snapshot.manifestDigest, ["hook.observe", "hook.deny"]);
  });

  it.each(["arguments", "output", "error", "sessionId", "credentials", "authorization"])("rejects private field %s before launch", async field => {
    await expect(runner().invoke("hook", "pre-tool", { kind: "pre-tool", [field]: "private" }))
      .rejects.toMatchObject({ code: "EXECUTABLE_INPUT_INVALID" });
    expect(seams.run).not.toHaveBeenCalled();
  });

  it.each([
    { kind: "turn-start" }, { kind: "pre-tool", turn: 0 }, { kind: "pre-tool", step: Number.MAX_SAFE_INTEGER + 1 },
    { kind: "pre-tool", toolName: "x".repeat(257) }, { kind: "pre-tool", actionClass: "READ\nONLY" },
    { kind: "pre-tool", requestedMode: "ALLOW" }
  ])("rejects event mismatch or invalid flat metadata: %j", async input => {
    await expect(runner().invoke("hook", "pre-tool", input)).rejects.toMatchObject({ code: "EXECUTABLE_INPUT_INVALID" });
    expect(seams.run).not.toHaveBeenCalled();
  });

  it("requires the selected hook and matching hook capability before launching", async () => {
    const executable = snapshot.manifest.schemaVersion === 2 ? snapshot.manifest.executable : undefined;
    executable!.capabilities = ["hook.observe"];
    await expect(runner().invoke("hook", "pre-tool", { kind: "pre-tool" })).rejects.toMatchObject({ code: "EXECUTABLE_CAPABILITY_DENIED" });
    await expect(runner().invoke("hook", "unknown", { kind: "turn-start" })).rejects.toMatchObject({ code: "EXECUTABLE_CAPABILITY_DENIED" });
    expect(seams.run).not.toHaveBeenCalled();
  });

  it("keeps context and commands usable after a verified observer handler throws", async () => {
    if (snapshot.manifest.schemaVersion !== 2) throw new Error("executable fixture required");
    snapshot.manifest.executable.capabilities.push("context.generate", "command.invoke");
    snapshot.manifest.executable.contexts.push({ name: "computed", export: "context" });
    snapshot.manifest.executable.commands.compute = { export: "command" };
    seams.run.mockImplementation(async (_argv: readonly string[], cwd: string) => {
      staged.push(cwd); const request = requestAt(cwd);
      return request.exportName === "observe" ? outcome(cwd, "", { exitCode: 1, stderr: "private failure",
        stdout: JSON.stringify({ protocol: "amc-executable/1", invocationId: request.invocationId,
          ok: false, code: "EXECUTABLE_HANDLER_FAILED" }) }) : outcome(cwd, "available contribution");
    });
    const runtime = runner();
    await expect(runtime.invoke("hook", "turn-start", { kind: "turn-start", turn: 1 }))
      .rejects.toMatchObject({ code: "EXECUTABLE_HANDLER_FAILED" });
    expect(runtime.inspect()).toMatchObject({ state: "loaded-not-running", failureCode: null, callsUsed: 1 });
    expect(await runtime.invoke("context", "computed", { turn: 1, step: 1 })).toBe("available contribution");
    expect(await runtime.invoke("command", "compute", { arguments: "hello" })).toBe("available contribution");
    await expect(runtime.invoke("hook", "pre-tool", { kind: "pre-tool" })).rejects.toMatchObject({ code: "EXECUTABLE_HANDLER_FAILED" });
    await expect(runtime.invoke("command", "compute", { arguments: "again" })).rejects.toMatchObject({ code: "EXECUTABLE_HANDLER_FAILED" });
    expect(seams.run).toHaveBeenCalledTimes(4);
  });

  it("retains fail-closed isolation and completion-boundary revocation for hooks", async () => {
    seams.available = false;
    await expect(runner().invoke("hook", "turn-start", { kind: "turn-start" })).rejects.toMatchObject({ code: "EXECUTABLE_ISOLATION_UNAVAILABLE" });
    expect(seams.run).not.toHaveBeenCalled(); seams.available = true;
    seams.run.mockImplementation(async (_argv: readonly string[], cwd: string) => {
      staged.push(cwd); const result = outcome(cwd, '{"deny":"withheld"}');
      seams.approval.mockImplementation(() => { throw new NativeExecutableError("EXECUTABLE_REVOKED", "revoked"); });
      return result;
    });
    await expect(runner().invoke("hook", "pre-tool", { kind: "pre-tool" })).rejects.toMatchObject({ code: "EXECUTABLE_REVOKED" });
    expect(seams.run).toHaveBeenCalledTimes(1);
  });

  it("cancels a timed-out hook and retains the terminal fault without retry", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    seams.run.mockImplementation((_argv: readonly string[], cwd: string, policy: SandboxPolicy) => {
      staged.push(cwd); const result = outcome(cwd, "late", { cancelled: true });
      return new Promise<SandboxOutcome>(resolve => {
        const settle = () => resolve(result); policy.signal!.addEventListener("abort", settle, { once: true });
        if (policy.signal!.aborted) settle();
      });
    });
    const runtime = runner(); const pending = runtime.invoke("hook", "tool-start", { kind: "tool-start" }).catch(error => error);
    await vi.advanceTimersByTimeAsync(1_001);
    expect(await pending).toMatchObject({ code: "EXECUTABLE_TIMEOUT" });
    await expect(runtime.invoke("hook", "tool-start", { kind: "tool-start" })).rejects.toMatchObject({ code: "EXECUTABLE_TIMEOUT" });
    expect(seams.run).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
});

describe("trusted bootstrap contract in a plain Node test child", () => {
  it("gives a hook a frozen flat input and preserves the text ABI", () => {
    // This executes trusted test source in a normal child; it makes no confinement claim.
    const directory = mkdtempSync(join(tmpdir(), "amc-hook-bootstrap-test-"));
    try {
      const input = { kind: "pre-tool", turn: 1, step: 2, toolName: "fs.read", actionClass: "READ_ONLY", requestedMode: "SIMULATE" };
      writeFileSync(join(directory, "request.json"), JSON.stringify({ invocationId: "test-hook", extensionId: "hooks", exportName: "observe",
        capabilities: ["hook.deny"], input, maxOutputBytes: 1_000 }));
      writeFileSync(join(directory, "bootstrap.mjs"), NATIVE_EXECUTABLE_BOOTSTRAP);
      writeFileSync(join(directory, "extension.mjs"), `export function observe(input, api) {
        let refused = false; try { input.requestedMode = "EXECUTE"; } catch { refused = true; }
        return JSON.stringify({ frozen: Object.isFrozen(input), apiFrozen: Object.isFrozen(api),
          capsFrozen: Object.isFrozen(api.capabilities), refused, input });
      }`);
      const child = spawnSync(process.execPath, [join(directory, "bootstrap.mjs")], { encoding: "utf8", timeout: 5_000, env: {} });
      expect(child.status).toBe(0); expect(child.stderr).toBe("");
      const response = JSON.parse(child.stdout);
      expect(response).toMatchObject({ protocol: "amc-executable/1", invocationId: "test-hook", ok: true });
      expect(JSON.parse(response.output)).toEqual({ frozen: true, apiFrozen: true, capsFrozen: true, refused: true, input });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
