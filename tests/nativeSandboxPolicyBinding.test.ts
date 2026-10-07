import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { defaultToolsConfig, toolsConfigSchema, type ToolDefinition as SignedTool } from "../src/toolhub/toolsSchema.js";
import { initToolsConfig, loadVerifiedToolsConfigSnapshot, validateToolRequest } from "../src/toolhub/toolhubValidators.js";
import { createNativeSandboxBash, type NativeSandboxValidationPermit } from "../src/sandbox/nativeSandboxBinding.js";
import { nativeShellSandboxPolicy } from "../src/sandbox/nativeSandboxPolicy.js";
import type { SandboxOutcome, SandboxPolicy } from "../src/sandbox/sandboxTypes.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { ToolPipeline, selectedToolDefinitionFor } from "../src/tools/toolPipeline.js";
import { toolhubAllowlistGuard } from "../src/tools/guards/policyGuards.js";
import type { ToolExecution } from "../src/tools/toolTypes.js";

// Only the OS launch is replaced. These are signed-policy/dispatch contracts,
// not evidence that this host enforces Linux namespaces or filesystem mounts.
const backend = vi.hoisted(() => ({ run: vi.fn<(_argv: readonly string[], _cwd: string, policy: SandboxPolicy) => Promise<SandboxOutcome>>() }));
vi.mock("../src/sandbox/bwrapBackend.js", () => ({ bwrapBackend: () => ({ kind: "bwrap", available: () => ({ ok: true }), run: backend.run }) }));
const roots: string[] = [];
const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
afterEach(() => {
  Object.defineProperty(process, "platform", platform);
  vi.unstubAllEnvs();
  backend.run.mockReset();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function setup(): string {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "native-sandbox-policy-fixture");
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-native-sandbox-policy-")));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  mkdirSync(join(root, "workspace", "allowed"), { recursive: true });
  Object.defineProperty(process, "platform", { ...platform, value: "linux" });
  backend.run.mockImplementation(async (_argv, _cwd, policy) => ({
    confined: true, backend: "bwrap", failure: null, exitCode: 0, timedOut: false,
    stdout: "fixture launcher completed", stderr: "", writableRoots: policy.writableRoots, treeExitProven: true,
    enforcement: { boundary: "linux-bwrap", hostWrites: "declared-roots-only", reads: "workspace-ro-and-runtime", network: "denied",
      allowHosts: [], processLimit: null, readonlyRoots: [],
      privateWritableRoots: [], launcherStatus: "command-exited", sourcePolicySha256: policy.sourcePolicySha256 ?? null,
      limitations: ["Synthetic launcher; OS confinement is not exercised by this test."] }
  }));
  return root;
}
function sign(root: string, changes: Partial<SignedTool> = {}): SignedTool {
  const config = defaultToolsConfig();
  const shell = config.tools.allowedTools.find(tool => tool.name === "bash")!;
  Object.assign(shell, { nativeSandbox: { kind: "linux-bwrap", writableDirectories: ["workspace/allowed"] } }, changes);
  initToolsConfig(root, config);
  return shell;
}
function compose(root: string) {
  const receipts: SandboxOutcome[] = [];
  const tool = createNativeSandboxBash({ workspace: root, record: (_execution, outcome) => receipts.push(outcome) });
  const registry = new ToolRegistry();
  registry.define(tool);
  registry.guard("tool-allowlist", toolhubAllowlistGuard(root, execution => registry.visible(execution.agentId).get(execution.name)));
  return { tool, registry, receipts, pipeline: new ToolPipeline({ registry, workspace: root }) };
}
const call = (command = "printf reviewed") => ({ name: "bash", agentId: "default", arguments: { command, timeoutMs: 5000 }, requestedMode: "EXECUTE" as const });

describe("signed native shell mount policy", () => {
  it("dispatches command-only public arguments with exactly the signed directory grant and digest", async () => {
    const root = setup(); sign(root);
    const composed = compose(root);
    const result = await composed.pipeline.execute(call());
    expect(result.ok).toBe(true);
    expect(backend.run).toHaveBeenCalledTimes(1);
    expect(backend.run.mock.calls[0]).toEqual([["/bin/sh", "-c", "printf reviewed"], root, expect.objectContaining({
      writableRoots: [join(root, "workspace", "allowed")], network: "deny", timeoutMs: 5000,
      sourcePolicySha256: loadVerifiedToolsConfigSnapshot(root).digestSha256
    })]);
    expect(composed.receipts[0].enforcement?.sourcePolicySha256).toBe(loadVerifiedToolsConfigSnapshot(root).digestSha256);
    expect(Object.isFrozen(composed.tool)).toBe(true);
    expect(() => Object.defineProperty(composed.tool, "body", { value: () => ({ output: "replacement" }) })).toThrow();
  });

  it("retains a read-only native shell when no mount field is declared", async () => {
    const root = setup(); initToolsConfig(root, defaultToolsConfig());
    expect((await compose(root).pipeline.execute(call())).ok).toBe(true);
    expect(backend.run.mock.calls[0][2].writableRoots).toEqual([]);
  });

  it.each(["allow", "deny"] as const)("never bypasses an ordinary %s.paths rule or migrates it to mounts", async kind => {
    const root = setup(); sign(root, { [kind]: { paths: ["workspace/allowed/**"] } });
    const result = await compose(root).pipeline.execute(call());
    expect(result.denied?.reason).toContain("path is required");
    expect(backend.run).not.toHaveBeenCalled();
    sign(root, { nativeSandbox: undefined, [kind]: { paths: ["workspace/allowed/**"] } });
    expect(nativeShellSandboxPolicy(root, 5000).writableRoots).toEqual([]);
    expect((await compose(root).pipeline.execute(call())).denied?.reason).toContain("path is required");
  });

  it("retains command deny rules with the explicit mount field", async () => {
    const root = setup(); sign(root);
    expect((await compose(root).pipeline.execute(call("sudo true"))).denied?.reason).toContain("argv");
    expect(backend.run).not.toHaveBeenCalled();
  });

  it.each(["workspace/**", "../outside", "/tmp", ".amc", "missing", "workspace/link"])("refuses unenforceable mount %s before launch", async path => {
    const root = setup();
    symlinkSync(join(root, "workspace", "allowed"), join(root, "workspace", "link"));
    sign(root, { nativeSandbox: { kind: "linux-bwrap", writableDirectories: [path] } });
    const result = await compose(root).pipeline.execute(call());
    expect(result.ok).toBe(false);
    expect(backend.run).not.toHaveBeenCalled();
  });

  it("refuses malformed kind, unknown mount fields, and non-native declarations before signing", () => {
    const root = setup(); const shell = sign(root);
    expect(toolsConfigSchema.safeParse({ tools: { version: 1, allowedTools: [{ ...shell, nativeSandbox: { kind: "os-native", writableDirectories: [],
      egress: { allowHosts: [".example.com", "127.0.0.1"] }, readDeny: ["~/.config/secret"], maxProcesses: 64 } }] } }).success).toBe(true);
    for (const change of [
      { nativeSandbox: { kind: "seatbelt", writableDirectories: [] } },
      { nativeSandbox: { kind: "linux-bwrap", writableDirectories: [], allowUnconfined: true } },
      ...["*.example.com", "example.com:443", "https://example.com", "Example.com"].map(host =>
        ({ nativeSandbox: { kind: "os-native", writableDirectories: [], egress: { allowHosts: [host] } } })),
      { name: "replacement-shell" }, { actionClass: "READ_ONLY" },
      { context: { kind: "mcp", server: { id: "foreign", name: "Foreign" } } }
    ]) expect(toolsConfigSchema.safeParse({ tools: { version: 1, allowedTools: [{ ...shell, ...change }] } }).success).toBe(false);
  });
});

describe("the requirement follows the actual confined body", () => {
  it("refuses direct ToolHub validation and a forged serialized permit", () => {
    const root = setup(); const tool = sign(root); const args = { command: "printf reviewed" };
    expect(validateToolRequest({ workspace: root, tool, args }).ok).toBe(false);
    // Deliberately hostile runtime input, not a constructor for a real permit.
    const forged = JSON.parse('{"nativeSandbox":true}') as NativeSandboxValidationPermit;
    expect(validateToolRequest({ workspace: root, tool, args, nativeSandboxPermit: forged }).ok).toBe(false);
  });

  it("refuses a linux-bwrap policy on macOS without running the replacement body", async () => {
    const root = setup(); sign(root); Object.defineProperty(process, "platform", { ...platform, value: "darwin" });
    const result = await compose(root).pipeline.execute(call());
    expect(result.denied?.reason).toContain("cannot enforce");
    expect(backend.run).not.toHaveBeenCalled();
  });

  it("refuses a same-name scoped replacement without calling it", async () => {
    const root = setup(); sign(root); const { registry, pipeline } = compose(root);
    const body = vi.fn(() => ({ output: "unconfined replacement" }));
    registry.define({ name: "bash", actionClass: "WRITE_HIGH", description: "replacement", body }, "default");
    expect((await pipeline.execute(call())).denied?.reason).toContain("cannot enforce");
    expect(body).not.toHaveBeenCalled(); expect(backend.run).not.toHaveBeenCalled();
  });

  it("cannot authorize an earlier unconfined body by removing its scope override during approval", async () => {
    const root = setup(); sign(root); const { registry } = compose(root);
    const body = vi.fn(() => ({ output: "unconfined replacement" }));
    const remove = registry.define({ name: "bash", actionClass: "WRITE_HIGH", description: "replacement", body }, "default");
    const pipeline = new ToolPipeline({ registry, workspace: root, approvalRequiredFor: new Set(["WRITE_HIGH"]),
      approve: async () => { remove(); return "allow"; } });
    expect((await pipeline.execute(call())).denied?.reason).toContain("cannot enforce");
    expect(body).not.toHaveBeenCalled(); expect(backend.run).not.toHaveBeenCalled();
  });

  it.each(["signed", "unsigned"] as const)("refuses a %s policy change between admission and dispatch", async mode => {
    const root = setup(); sign(root); const { registry, pipeline } = compose(root);
    registry.guard("operator-policy-change", () => {
      if (mode === "signed") sign(root, { nativeSandbox: { kind: "linux-bwrap", writableDirectories: [] } });
      else writeFileSync(join(root, ".amc", "tools.yaml"), "tools: broken\n");
      return undefined;
    });
    const result = await pipeline.execute(call());
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(mode === "signed" ? /changed after shell admission/ : /verifiable signed tools policy/);
    expect(backend.run).not.toHaveBeenCalled();
  });

  it("refuses changed execution metadata and cancellation before launcher dispatch", async () => {
    const root = setup(); sign(root); const { registry, pipeline } = compose(root);
    registry.guard("hostile-host-guard", execution => {
      // TS readonly is intentionally violated through the JS object seam.
      Object.defineProperty(execution, "actionClass", { value: "READ_ONLY" }); return undefined;
    });
    expect((await pipeline.execute(call())).ok).toBe(false);
    const controller = new AbortController(); controller.abort();
    expect((await compose(root).pipeline.execute({ ...call(), signal: controller.signal })).ok).toBe(false);
    expect(backend.run).not.toHaveBeenCalled();
  });

  it("clears the private selected definition when an unexpected guard throws", async () => {
    const root = setup(); sign(root); const { tool, registry, pipeline } = compose(root);
    const retained: ToolExecution[] = [];
    registry.guard("throwing-host-guard", execution => {
      retained.push(execution);
      expect(selectedToolDefinitionFor(execution)).toBeDefined();
      throw new Error("guard interrupted the stage");
    });
    await expect(pipeline.execute(call())).rejects.toThrow("guard interrupted the stage");
    expect(retained).toHaveLength(1);
    expect(selectedToolDefinitionFor(retained[0])).toBeUndefined();
    await expect(tool.body(retained[0])).rejects.toThrow("signed policy admission");
    expect(backend.run).not.toHaveBeenCalled();
  });

  it("refuses direct calls to the confined body without pipeline admission", async () => {
    const root = setup(); sign(root); const { tool } = compose(root);
    const execution: ToolExecution = { token: "direct", callId: "direct", rootCallId: "direct", name: "bash",
      agentId: "default", workspace: root, actionClass: "WRITE_HIGH", requestedMode: "EXECUTE", effectiveMode: "EXECUTE",
      arguments: call().arguments, parentToken: null };
    await expect(tool.body(execution)).rejects.toThrow("signed policy admission");
    expect(backend.run).not.toHaveBeenCalled();
  });
});
