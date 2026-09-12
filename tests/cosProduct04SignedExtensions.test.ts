import { generateKeyPairSync } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { sha256Hex } from "../src/utils/hash.js";
import { parseNativeExtensionManifest } from "../src/extensions/nativeExtensionManifest.js";
import { NativeExtensionManager, nativeExtensionRunArgv } from "../src/extensions/nativeExtensionRuntime.js";
import { describeNativeExtension, installNativeExtension, readNativeExtension, signNativeExtension } from "../src/extensions/nativeExtensionStore.js";
import { pluginPack } from "../src/plugins/pluginPackage.js";
import { loadInstalledPluginAssets, loadInstalledPluginExecutable } from "../src/plugins/pluginLoader.js";
import { defaultInstalledPluginsLock, pluginInstalledPackagePath, saveInstalledPluginsLock } from "../src/plugins/pluginStore.js";
import { approveNativeExecutableExtension, assertNativeExecutableApproval, nativeExecutablePolicyPath, readNativeExecutablePolicy, revokeNativeExecutableExtension } from "../src/plugins/nativeExecutablePolicy.js";
import type { NativeExecutableDeclaration } from "../src/plugins/nativeExecutableSchema.js";
import { SandboxRunner } from "../src/sandbox/sandboxRunner.js";
import { ContextPluginHost } from "../src/prompt/context/contextHost.js";
import { PromptAssemblyRegistry, renderContextSnapshot } from "../src/prompt/assembly/index.js";

// These fixtures are authored, not pre-generated. No key, package or plugin
// operation occurs until this regression file is explicitly executed.
const roots: string[] = [];
const originalPassphrase = process.env.AMC_VAULT_PASSPHRASE;
afterEach(() => {
  vi.restoreAllMocks();
  if (originalPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
  else process.env.AMC_VAULT_PASSPHRASE = originalPassphrase;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const exampleModule = `
export function onLoad(api) { return { prefix: "activated", id: api.extensionId }; }
export function context(input, api, state) { return state.prefix + ":turn-" + input.turn + ":" + state.id; }
export function command(input, api, state) { return state.prefix + ":" + input.arguments; }
export function onUnload(api, state) { if (state.id !== api.extensionId) throw new Error("bad lifecycle"); }
`;

function fixture(source = exampleModule) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-cos-product04-"))); roots.push(root);
  const workspace = join(root, "workspace"); mkdirSync(workspace);
  process.env.AMC_VAULT_PASSPHRASE = "cos-product04-fixture-passphrase";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const input = join(root, "package-input"); mkdirSync(join(input, "content", "extensions"), { recursive: true });
  writeFileSync(join(input, "content", "extensions", "example.mjs"), source);
  writeFileSync(join(input, "manifest.json"), JSON.stringify({ v: 1,
    plugin: { id: "cos-product04", name: "P04 fixture", version: "1.0.0", description: "Signed executable regression fixture",
      publisher: { org: "AMC fixture", contact: "fixture@example.invalid", website: "https://example.invalid", pubkeyFingerprint: "0".repeat(64) },
      compatibility: { amcMinVersion: "0.0.1", nodeMinVersion: "20.0.0",
        schemaVersions: { policyPacks: 1, assurancePacks: 1, complianceMaps: 1, adapters: 1, outcomes: 1, casebooks: 1, transform: 1 } },
      risk: { category: "HIGH", notes: "Explicit executable fixture", touches: ["extensions"] } },
    artifacts: [], generatedTs: 0, signing: { algorithm: "ed25519", pubkeyFingerprint: "0".repeat(64) } }));
  const publisher = generateKeyPairSync("ed25519");
  const key = join(root, "fixture-publisher.key");
  writeFileSync(key, publisher.privateKey.export({ format: "pem", type: "pkcs8" }), { mode: 0o600 });
  const archive = join(root, "package.amcplug");
  const packed = pluginPack({ inputDir: input, keyPath: key, outFile: archive });
  const packageFile = pluginInstalledPackagePath(workspace, "cos-product04", "1.0.0");
  mkdirSync(dirname(packageFile), { recursive: true }); copyFileSync(archive, packageFile);
  const lock = defaultInstalledPluginsLock(workspace);
  lock.installed.push({ id: "cos-product04", version: "1.0.0", sha256: sha256Hex(readFileSync(archive)),
    registryFingerprint: "a".repeat(64), publisherFingerprint: packed.manifest.plugin.publisher.pubkeyFingerprint, installedTs: Date.now() });
  saveInstalledPluginsLock(workspace, lock);
  const executable: NativeExecutableDeclaration = { apiVersion: 1, pluginId: "cos-product04", version: "1.0.0",
    packageSha256: lock.installed[0]!.sha256, publisherFingerprint: lock.installed[0]!.publisherFingerprint,
    entrypoint: "content/extensions/example.mjs", capabilities: ["context.generate", "command.invoke"],
    contexts: [{ name: "computed", export: "context" }], commands: { compute: { export: "command" } },
    limits: { timeoutMs: 5_000, maxOutputBytes: 16_000, maxCalls: 10, maxLifetimeMs: 60_000 } };
  const manifest = { schemaVersion: 2 as const, id: "computed", contexts: [], commands: {}, executable };
  const manifestPath = join(workspace, "extension.json");
  writeFileSync(manifestPath, JSON.stringify(manifest));
  const digest = sha256Hex(readFileSync(manifestPath));
  signNativeExtension(workspace, manifestPath, digest);
  return { root, workspace, manifest, manifestPath, digest, packageFile, lock };
}

function approve(f: ReturnType<typeof fixture>) {
  return approveNativeExecutableExtension({ workspace: f.workspace, manifestPath: f.manifestPath,
    expectedDigest: f.digest, capabilities: f.manifest.executable.capabilities, expiresAt: Date.now() + 60_000, expectedPolicyDigest: null });
}

describe("P04 real signed authority chain without module execution", () => {
  it("signing, inspection, package discovery and declaration installation do not approve or import code", () => {
    const f = fixture('throw new Error("must not import into AMC");\n' + exampleModule);
    const run = vi.spyOn(SandboxRunner.prototype, "run");
    const inspected = describeNativeExtension(readNativeExtension({ workspace: f.workspace, manifestPath: f.manifestPath }));
    expect(inspected).toMatchObject({ schemaVersion: 2, signatureValid: true });
    expect(JSON.stringify(inspected)).not.toContain("must not import into AMC");
    const assets = loadInstalledPluginAssets(f.workspace);
    expect(assets.ok).toBe(true);
    expect(assets.assets.executableModules?.size).toBe(1);
    expect(assets.statuses[0]?.executableCode).toBe("not-started");
    expect(installNativeExtension(f.workspace, f.manifestPath, f.digest).signatureValid).toBe(true);
    expect(() => new NativeExtensionManager(f.workspace).load(f.manifestPath, f.digest)).toThrow(/separate valid workspace-signed/i);
    expect(existsSync(nativeExecutablePolicyPath(f.workspace))).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("admits an explicitly approved pinned module without evaluating its top-level code", () => {
    const f = fixture('throw new Error("not at load time");\n' + exampleModule); approve(f);
    const run = vi.spyOn(SandboxRunner.prototype, "run");
    const manager = new NativeExtensionManager(f.workspace);
    expect(manager.load(f.manifestPath, f.digest)).toMatchObject({ id: "computed", manifestDigest: f.digest });
    expect(manager.listCommands()).toEqual([{ name: "compute", extensionId: "computed" }]);
    expect(manager.prepareTurn().contextPlugins).toHaveLength(1);
    expect(nativeExtensionRunArgv(manager)).toEqual([`--extension=${f.manifestPath}`, `--extension-pin=${f.digest}`]);
    expect(() => manager.expandCommand("/compute hello")).toThrow(/invokeCommand/);
    expect(run).not.toHaveBeenCalled(); manager.unloadAll();
  });

  it("refuses an unsigned native declaration even when its package is installed", () => {
    const f = fixture(); rmSync(`${f.manifestPath}.sig`);
    expect(() => new NativeExtensionManager(f.workspace).load(f.manifestPath, f.digest)).toThrow(/signature/i);
    expect(existsSync(nativeExecutablePolicyPath(f.workspace))).toBe(false);
  });

  it("checks executable command collisions before adding any part of a second extension", () => {
    const f = fixture(); approve(f);
    const manager = new NativeExtensionManager(f.workspace); manager.load(f.manifestPath, f.digest);
    const second = join(f.workspace, "second-extension.json");
    writeFileSync(second, JSON.stringify({ ...f.manifest, id: "second" }));
    const digest = sha256Hex(readFileSync(second)); signNativeExtension(f.workspace, second, digest);
    expect(() => manager.load(second, digest)).toThrow(/command conflicts/i);
    expect(manager.list()).toHaveLength(1); expect(manager.listCommands()).toEqual([{ name: "compute", extensionId: "computed" }]);
    manager.unloadAll();
  });

  it("refuses unsigned execution approval and a mismatched capability set", () => {
    const f = fixture();
    expect(() => approveNativeExecutableExtension({ workspace: f.workspace, manifestPath: f.manifestPath,
      expectedDigest: f.digest, capabilities: ["command.invoke"], expiresAt: Date.now() + 60_000, expectedPolicyDigest: null })).toThrow(/exactly the capability set/i);
    approve(f); rmSync(`${nativeExecutablePolicyPath(f.workspace)}.sig`);
    expect(() => new NativeExtensionManager(f.workspace).load(f.manifestPath, f.digest)).toThrow(/execution-policy/);
  });

  it("refuses package-byte changes and symbolic-link package aliases", () => {
    const f = fixture(); approve(f);
    const original = readFileSync(f.packageFile);
    writeFileSync(f.packageFile, Buffer.concat([original, Buffer.from("tamper")]));
    expect(() => new NativeExtensionManager(f.workspace).load(f.manifestPath, f.digest)).toThrow(/differs from its reviewed pin/i);
    const outside = join(f.root, "alias.amcplug"); writeFileSync(outside, original);
    rmSync(f.packageFile); symlinkSync(outside, f.packageFile);
    expect(() => new NativeExtensionManager(f.workspace).load(f.manifestPath, f.digest)).toThrow(/nonsymlink/i);
  });

  it("refuses an invalid installed-lock signature and returns no executable descriptors", () => {
    const f = fixture(); approve(f);
    writeFileSync(join(f.workspace, ".amc", "plugins", "installed.lock.json.sig"), "{}");
    expect(() => new NativeExtensionManager(f.workspace).load(f.manifestPath, f.digest)).toThrow(/signature/i);
    const assets = loadInstalledPluginAssets(f.workspace);
    expect(assets.ok).toBe(false); expect(assets.assets.executableModules?.size).toBe(0);
  });

  it("bounds executable archive expansion before loading a highly compressible oversized entry", () => {
    const f = fixture(`/*${"x".repeat(1_048_576)}*/\n${exampleModule}`);
    expect(() => loadInstalledPluginExecutable(f.workspace, f.manifest.executable)).toThrow(/verified or decoded safely/i);
    expect(existsSync(nativeExecutablePolicyPath(f.workspace))).toBe(false);
  });

  it("binds the verified publisher to the signed lock as well as the manifest", () => {
    const f = fixture(); approve(f);
    f.lock.installed[0]!.publisherFingerprint = "b".repeat(64); saveInstalledPluginsLock(f.workspace, f.lock);
    expect(() => new NativeExtensionManager(f.workspace).load(f.manifestPath, f.digest)).toThrow(/publisher.*signed installation lock/i);
  });

  it("still verifies the package publisher after workspace authority pins a different publisher's archive", () => {
    const f = fixture(); const other = fixture();
    copyFileSync(other.packageFile, f.packageFile);
    f.lock.installed[0]!.sha256 = sha256Hex(readFileSync(f.packageFile)); saveInstalledPluginsLock(f.workspace, f.lock);
    expect(() => loadInstalledPluginExecutable(f.workspace, { ...f.manifest.executable,
      packageSha256: f.lock.installed[0]!.sha256 })).toThrow(/pinned publisher/i);
  });

  it("suppresses stale prepared code contexts after persistent revocation and refuses reapproval", async () => {
    const f = fixture(); const approved = approve(f);
    const manager = new NativeExtensionManager(f.workspace); manager.load(f.manifestPath, f.digest);
    const prepared = manager.prepareTurn();
    const revoked = revokeNativeExecutableExtension({ workspace: f.workspace, manifestDigest: f.digest, expectedPolicyDigest: approved.digest });
    expect(() => manager.prepareTurn()).toThrow(/revoked/i);
    await expect(prepared.contextPlugins[0]!.collect({ turn: 1, step: 1 })).rejects.toMatchObject({ code: "EXECUTABLE_REVOKED" });
    expect(() => approveNativeExecutableExtension({ workspace: f.workspace, manifestPath: f.manifestPath,
      expectedDigest: f.digest, capabilities: f.manifest.executable.capabilities, expiresAt: Date.now() + 60_000,
      expectedPolicyDigest: revoked.digest })).toThrow(/revoked manifest/i);
    manager.unloadAll();
  });

  it("rejects stale policy writes and expired grants without silently changing approval", () => {
    const f = fixture(); const approved = approve(f);
    expect(() => revokeNativeExecutableExtension({ workspace: f.workspace, manifestDigest: f.digest, expectedPolicyDigest: "0".repeat(64) })).toThrow(/reviewed digest/i);
    expect(readNativeExecutablePolicy(f.workspace).digest).toBe(approved.digest);
    expect(() => assertNativeExecutableApproval(f.workspace, f.digest, f.manifest.executable.capabilities, Date.now() + 86_400_000)).toThrow(/unexpired/i);
  });

  it("retains v1 literal prompt commands and the prepared-context unload contract", async () => {
    const f = fixture();
    writeFileSync(join(f.workspace, "terms.md"), "Literal {{ticket}} context");
    writeFileSync(join(f.workspace, "template.txt"), "Review {{args}}");
    const v1 = { schemaVersion: 1, id: "declarative", contexts: [{ name: "terms", path: "terms.md", sha256: sha256Hex("Literal {{ticket}} context") }],
      commands: { review: { path: "template.txt", sha256: sha256Hex("Review {{args}}") } } };
    writeFileSync(f.manifestPath, JSON.stringify(v1)); const digest = sha256Hex(readFileSync(f.manifestPath));
    signNativeExtension(f.workspace, f.manifestPath, digest);
    const manager = new NativeExtensionManager(f.workspace); manager.load(f.manifestPath, digest);
    const prepared = manager.prepareTurn();
    expect((await manager.invokeCommand('/review $(not-a-shell) "quoted"'))?.prompt).toContain(JSON.stringify('$(not-a-shell) "quoted"'));
    manager.unloadAll();
    expect(manager.prepareTurn()).toEqual({ contextPlugins: [], pins: [], commands: [] });
    expect(await prepared.contextPlugins[0]!.collect({ turn: 1, step: 1 })).toContain("{{ticket}}");
  });
});

describe("P04 strict executable declaration", () => {
  const executable: NativeExecutableDeclaration = { apiVersion: 1, pluginId: "example", version: "1.0.0",
    packageSha256: "a".repeat(64), publisherFingerprint: "b".repeat(64), entrypoint: "content/extensions/main.mjs",
    capabilities: ["command.invoke"], contexts: [], commands: { compute: { export: "command" } },
    limits: { timeoutMs: 1_000, maxOutputBytes: 100, maxCalls: 1, maxLifetimeMs: 10_000 } };
  const base = { schemaVersion: 2, id: "example", contexts: [], commands: {}, executable };
  it.each([
    { ...base, schemaVersion: 1 },
    { ...base, executable: { ...executable, entrypoint: "../escape.mjs" } },
    { ...base, executable: { ...executable, entrypoint: "content/extensions/main.ts" } },
    { ...base, executable: { ...executable, capabilities: ["network.access"] } },
    { ...base, executable: { ...executable, capabilities: ["context.generate"] } },
    { ...base, executable: { ...executable, capabilities: ["command.invoke", "command.invoke"] } },
    { ...base, executable: { ...executable, commands: { exit: { export: "command" } } } },
    { ...base, executable: { ...executable, limits: { ...executable.limits, timeoutMs: 60_000 } } },
    { ...base, executable: { ...executable, approved: true } }
  ])("rejects unsupported authority, capabilities or lifecycle declarations %#", value => {
    expect(() => parseNativeExtensionManifest(Buffer.from(JSON.stringify(value)))).toThrow(/strict v1 declaration or strict v2/);
  });
});

// Opt-in, real Linux execution regressions. The authoring phase does not set
// this variable or execute this file. Binary presence is not an acceptance
// claim: once selected, an unusable backend causes a real failure, not a skip.
if (process.env.AMC_TEST_NATIVE_EXECUTABLE === "1" && process.platform === "linux") describe("P04 isolated execution integration", () => {
  it("runs publisher-signed handlers and lifecycle through the actual context host and async command path", async () => {
    const f = fixture(); approve(f);
    const manager = new NativeExtensionManager(f.workspace); manager.load(f.manifestPath, f.digest);
    const host = new ContextPluginHost(manager.prepareTurn().contextPlugins);
    const registry = new PromptAssemblyRegistry(); const dispose = host.register(registry);
    try {
      await host.refresh({ turn: 1, step: 1 });
      expect(renderContextSnapshot(registry.assemble())).toContain("activated:turn-1:computed");
      expect((await manager.invokeCommand("/compute hello"))?.prompt).toContain("activated:hello");
    } finally { dispose(); manager.unloadAll(); }
  });

  it("rejects an onUnload failure instead of admitting the handler's earlier text", async () => {
    const f = fixture(exampleModule.replace('if (state.id !== api.extensionId) throw new Error("bad lifecycle");', 'throw new Error("private teardown failure");')); approve(f);
    const manager = new NativeExtensionManager(f.workspace); manager.load(f.manifestPath, f.digest);
    await expect(manager.invokeCommand("/compute hello")).rejects.toMatchObject({ code: "EXECUTABLE_HANDLER_FAILED" });
    manager.unloadAll();
  });

  it("does not expose the host workspace or environment, and denies socket creation", async () => {
    const f = fixture(`
      export function context() { return "context"; }
      export async function command(input) {
        const fs = await import("node:fs"); const net = await import("node:net");
        let readable = false; try { fs.readFileSync(input.arguments); readable = true; } catch {}
        const socketError = await new Promise(resolve => {
          const socket = net.createConnection({ host: "127.0.0.1", port: 9 });
          socket.once("error", error => resolve(error.code));
          socket.once("connect", () => { socket.destroy(); resolve("CONNECTED"); });
        });
        return JSON.stringify({ readable, socketError, leaked: process.env.AMC_VAULT_PASSPHRASE !== undefined });
      }
    `); approve(f);
    const sentinel = join(f.workspace, "private-sentinel.txt"); writeFileSync(sentinel, "must stay outside the invocation mount");
    const manager = new NativeExtensionManager(f.workspace); manager.load(f.manifestPath, f.digest);
    const result = await manager.invokeCommand(`/compute ${sentinel}`);
    expect(result?.prompt).toContain('"readable":false');
    expect(result?.prompt).toContain('"leaked":false');
    expect(result?.prompt).toMatch(/"socketError":"(?:EPERM|EACCES)"/);
    manager.unloadAll();
  });
});
