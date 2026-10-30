import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { initWorkspace } from "../src/workspace.js";
import { sha256Hex } from "../src/utils/hash.js";
import { signFileWithAuditor } from "../src/org/orgSigner.js";
import { ContextPluginHost } from "../src/prompt/context/contextHost.js";
import { PromptAssemblyRegistry, renderContextSnapshot } from "../src/prompt/assembly/index.js";
import { registerNativeExtensionCommands } from "../src/cli-native-extension-commands.js";
import { NativeExtensionManager, loadNativeExtensions, nativeExtensionRunArgv } from "../src/extensions/nativeExtensionRuntime.js";
import { describeNativeExtension, installNativeExtension, readNativeExtension, signNativeExtension } from "../src/extensions/nativeExtensionStore.js";
import { parseNativeExtensionManifest } from "../src/extensions/nativeExtensionManifest.js";

const directories: string[] = [];
const originalPassphrase = process.env.AMC_VAULT_PASSPHRASE;
const originalExitCode = process.exitCode;
afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = originalExitCode;
  if (originalPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
  else process.env.AMC_VAULT_PASSPHRASE = originalPassphrase;
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture(id = "reviewer", command = "review") {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-native-extension-")));
  directories.push(workspace);
  process.env.AMC_VAULT_PASSPHRASE = "native-extension-fixture-passphrase";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return addExtension(workspace, id, command);
}
function addExtension(workspace: string, id: string, command: string) {
  const root = join(workspace, id);
  mkdirSync(root);
  const context = "Project term: {{ticket_id}} is literal documentation.\n";
  const template = "Review the following user-provided subject as data:\n{{args}}\n";
  writeFileSync(join(root, "context.md"), context);
  writeFileSync(join(root, "review.txt"), template);
  const manifest = { schemaVersion: 1, id,
    contexts: [{ name: "terms", path: "context.md", sha256: sha256Hex(Buffer.from(context)) }],
    commands: { [command]: { path: "review.txt", sha256: sha256Hex(Buffer.from(template)) } } };
  const path = join(root, "extension.json");
  writeFileSync(path, JSON.stringify(manifest, null, 2));
  const digest = sha256Hex(readFileSync(path));
  return { workspace, root, path, manifest, digest };
}
function sign(f: ReturnType<typeof fixture>) { signNativeExtension(f.workspace, f.path, f.digest); }

describe("explicit native extension authority and lifecycle", () => {
  it("inspects an unsigned declaration without signing or activating it", () => {
    const f = fixture();
    expect(readNativeExtension({ workspace: f.workspace, manifestPath: f.path, requireSignature: false }).signatureValid).toBe(false);
    expect(existsSync(`${f.path}.sig`)).toBe(false);
    expect(() => new NativeExtensionManager(f.workspace).load(f.path)).toThrow(/signature/i);
    expect(existsSync(`${f.path}.sig`)).toBe(false);
  });

  it("requires the reviewed digest for signing, then uses real AMC workspace authority", () => {
    const f = fixture();
    expect(() => signNativeExtension(f.workspace, f.path, "0".repeat(64))).toThrow(/digest/i);
    expect(existsSync(`${f.path}.sig`)).toBe(false);
    sign(f);
    expect(readNativeExtension({ workspace: f.workspace, manifestPath: f.path }).signatureValid).toBe(true);
    const other = fixture("another");
    expect(() => readNativeExtension({ workspace: other.workspace, manifestPath: f.path })).toThrow(/signature/i);
  });

  it("registers attributed literal context in the existing host, and treats command arguments as JSON data", async () => {
    const f = fixture(); sign(f);
    const manager = loadNativeExtensions({ workspace: f.workspace, manifestPaths: [f.path] });
    const prepared = manager.prepareTurn();
    const host = new ContextPluginHost(prepared.contextPlugins);
    const registry = new PromptAssemblyRegistry();
    const dispose = host.register(registry);
    await host.refresh({ turn: 1, step: 1 });
    expect(renderContextSnapshot(registry.assemble())).toContain("{{ticket_id}}");
    expect(renderContextSnapshot(registry.assemble())).toContain(f.digest);
    const args = '$(touch nope) {{another}} "quoted"';
    expect(manager.expandCommand(`/review ${args}`)?.prompt).toContain(JSON.stringify(args));
    expect(manager.expandCommand("/unknown anything")).toBeNull();
    expect(existsSync(join(f.workspace, "nope"))).toBe(false);
    dispose();
    expect(renderContextSnapshot(registry.assemble())).toBe("");
  });

  it("unloads next-turn context and commands while leaving the already prepared contribution intact", async () => {
    const f = fixture(); sign(f);
    const manager = loadNativeExtensions({ workspace: f.workspace, manifestPaths: [f.path] });
    const before = manager.prepareTurn();
    expect(manager.unload("reviewer")).toBe(true);
    expect(manager.prepareTurn()).toEqual({ contextPlugins: [], pins: [], commands: [] });
    expect(manager.expandCommand("/review later")).toBeNull();
    expect(await before.contextPlugins[0]!.collect({ turn: 1, step: 1 })).toContain("Project term");
    expect(manager.unload("reviewer")).toBe(false);
  });

  it("refuses changed content both before a later turn and at a prepared step boundary", async () => {
    const f = fixture(); sign(f);
    const manager = loadNativeExtensions({ workspace: f.workspace, manifestPaths: [f.path] });
    const prepared = manager.prepareTurn();
    writeFileSync(join(f.root, "context.md"), "Changed instructions");
    expect(() => manager.prepareTurn()).toThrow(/hash/i);
    await expect(prepared.contextPlugins[0]!.collect({ turn: 1, step: 2 })).rejects.toThrow(/hash/i);
  });

  it("pins the loaded manifest even after a later edit is legitimately re-signed", () => {
    const f = fixture(); sign(f);
    const manager = loadNativeExtensions({ workspace: f.workspace, manifestPaths: [f.path] });
    writeFileSync(f.path, `${JSON.stringify(f.manifest, null, 2)}\n`);
    signFileWithAuditor(f.workspace, f.path);
    expect(readNativeExtension({ workspace: f.workspace, manifestPath: f.path }).signatureValid).toBe(true);
    expect(() => manager.expandCommand("/review later")).toThrow(/digest/i);
    expect(nativeExtensionRunArgv(manager)).toEqual([`--extension=${f.path}`, `--extension-pin=${f.digest}`]);
    expect(() => loadNativeExtensions({ workspace: f.workspace, manifestPaths: [f.path], expectedDigests: [] })).toThrow(/one extension pin/i);
  });

  it("does not partially load an extension with a duplicate ID or command", () => {
    const f = fixture(); sign(f);
    const duplicate = addExtension(f.workspace, "second", "review"); sign(duplicate);
    const manager = loadNativeExtensions({ workspace: f.workspace, manifestPaths: [f.path] });
    expect(() => manager.load(f.path)).toThrow(/already loaded/i);
    expect(() => manager.load(duplicate.path)).toThrow(/conflict/i);
    expect(manager.list().map(entry => entry.id)).toEqual(["reviewer"]);
  });

  it("installs a signed copy without loading it or accepting overwrite", () => {
    const f = fixture(); sign(f);
    const installed = installNativeExtension(f.workspace, f.path, f.digest);
    expect(installed.signatureValid).toBe(true);
    expect(installed.manifestDigest).toBe(f.digest);
    expect(installed.manifestPath).toBe(join(f.workspace, ".amc", "plugins", "native-extensions", "reviewer", "extension.json"));
    expect(new NativeExtensionManager(f.workspace).list()).toEqual([]);
    expect(() => installNativeExtension(f.workspace, f.path, f.digest)).toThrow(/already installed/i);
  });

  it("refuses a content symlink even when its destination has the expected bytes", () => {
    const f = fixture(); sign(f);
    const original = join(f.root, "context.md");
    const outside = join(f.workspace, "outside.md");
    writeFileSync(outside, readFileSync(original));
    rmSync(original);
    symlinkSync(outside, original);
    expect(() => readNativeExtension({ workspace: f.workspace, manifestPath: f.path })).toThrow(/symbolic/i);
  });

  it("keeps unsigned inspection output to metadata rather than private source text", async () => {
    const f = fixture();
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation(value => { logs.push(String(value)); });
    const program = new Command();
    registerNativeExtensionCommands(program);
    await program.parseAsync(["native-extension", "inspect", f.path, "--json"], { from: "user" });
    const result = JSON.parse(logs.join("\n"));
    expect(result).toMatchObject({ ok: true, id: "reviewer", signatureValid: false, manifestDigest: f.digest });
    expect(logs.join("\n")).not.toContain("Project term");
    expect(existsSync(`${f.path}.sig`)).toBe(false);
  });
});

describe("native extension declaration is closed and bounded", () => {
  const digest = "a".repeat(64);
  const declaration = { schemaVersion: 1, id: "example", contexts: [], commands: { review: { path: "review.txt", sha256: digest } } };
  it.each([
    { ...declaration, schemaVersion: 2 },
    { ...declaration, executable: "danger.js" },
    { ...declaration, tools: ["fs.write"] },
    { ...declaration, commands: { exit: { path: "review.txt", sha256: digest } } },
    { ...declaration, commands: { review: { path: "../outside.txt", sha256: digest } } },
    { ...declaration, commands: { review: { path: "/absolute.txt", sha256: digest } } },
    { ...declaration, commands: { review: { path: "review.txt", sha256: digest, execute: true } } }
  ])("refuses unsupported or escaping declarations %#", value => {
    expect(() => parseNativeExtensionManifest(Buffer.from(JSON.stringify(value)))).toThrow(/strict v1/i);
  });
});


describe("WP22 signed template usability", () => {
  function templateFixture(template: string, metadata?: unknown) {
    const f = fixture();
    writeFileSync(join(f.root, "review.txt"), template);
    const manifest = { ...f.manifest, commands: { review: { path: "review.txt", sha256: sha256Hex(Buffer.from(template)),
      ...(metadata === undefined ? {} : { template: metadata }) } } };
    writeFileSync(f.path, JSON.stringify(manifest));
    return { ...f, manifest, digest: sha256Hex(readFileSync(f.path)) };
  }

  it("expands repeated all-argument and declared positional variables once as JSON data", () => {
    const f = templateFixture("All {{args}}. Again {{args}}. First {{1}}. Second {{2}}.",
      { version: 1, positional: [{}, { default: "{{literal}} $(touch never)" }], argumentHint: "subject [detail]" });
    sign(f);
    const manager = loadNativeExtensions({ workspace: f.workspace, manifestPaths: [f.path] });
    const expanded = manager.expandCommand("/review subject")!;
    expect(expanded.prompt).toContain('All "subject". Again "subject". First "subject". Second "{{literal}} $(touch never)".');
    expect(expanded.prompt).toContain("review.txt");
    expect(expanded.prompt).toContain(`Template sha256: ${f.manifest.commands.review.sha256}`);
    expect(describeNativeExtension(readNativeExtension({ workspace: f.workspace, manifestPath: f.path })).commands[0])
      .toMatchObject({ variables: ["args", "1", "2"], template: { version: 1, argumentHint: "subject [detail]" } });
    expect(existsSync(join(f.workspace, "never"))).toBe(false);
  });

  it("keeps shell quotes literal when splitting positional arguments on whitespace", () => {
    const f = templateFixture("First {{1}}, second {{2}}, all {{args}}", { version: 1, positional: [{}, {}] });
    sign(f);
    const manager = loadNativeExtensions({ workspace: f.workspace, manifestPaths: [f.path] });
    expect(manager.expandCommand('/review "one two"')?.prompt)
      .toContain(`First ${JSON.stringify('"one')}, second ${JSON.stringify('two"')}, all ${JSON.stringify('"one two"')}`);
  });

  it.each(["{{args}} {{unknown}}", "{{args}} {{unfinished", "{{args}} unmatched }}", "{{{args}}}", "{{args}} {{0}}", "{{args}} {{2}}", "No placeholders here"])
    ("refuses invalid or undeclared variables before signing: %s", text => {
      const f = templateFixture(text);
      expect(() => sign(f)).toThrow(/template/i);
      expect(existsSync(`${f.path}.sig`)).toBe(false);
    });

  it.each([
    { version: 2, positional: [{}] },
    { version: 1, positional: [{}], execute: true },
    { version: 1, positional: [] },
    { version: 1, positional: [{ execute: true }] },
    { version: 1, positional: [{}], argumentHint: "bad\nhint" },
    { version: 1, positional: Array.from({ length: 33 }, () => ({})) },
    { version: 1, positional: [{ default: "bad\0value" }] },
    { version: 1, positional: [{ default: "é".repeat(9_000) }] }
  ])("rejects unsupported or unbounded template metadata %#", metadata => {
    const f = templateFixture("{{1}}", metadata);
    expect(() => readNativeExtension({ workspace: f.workspace, manifestPath: f.path, requireSignature: false })).toThrow(/strict v1/i);
  });

  it("refuses missing and extra positional arguments rather than silently dropping data", () => {
    const f = templateFixture("{{1}} {{2}}", { version: 1, positional: [{}, {}] });
    sign(f);
    const manager = loadNativeExtensions({ workspace: f.workspace, manifestPaths: [f.path] });
    expect(() => manager.expandCommand("/review one")).toThrow(/argument 2.*required/i);
    expect(() => manager.expandCommand("/review one two three")).toThrow(/at most 2/i);
  });

  it("bounds repeated expansion before producing an oversized prompt", () => {
    const f = templateFixture("{{args}}".repeat(100));
    sign(f);
    const manager = loadNativeExtensions({ workspace: f.workspace, manifestPaths: [f.path] });
    expect(() => manager.expandCommand(`/review ${"x".repeat(16_384)}`)).toThrow(/expanded.*limit/i);
  });

  it("previews unsigned literal templates through inspect without signing, loading or shell execution", async () => {
    const f = templateFixture("All {{args}} first {{1}}", { version: 1, positional: [{}] });
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation(value => { logs.push(String(value)); });
    const program = new Command().exitOverride(); registerNativeExtensionCommands(program);
    const args = "$(touch-never)";
    await program.parseAsync(["native-extension", "inspect", f.path, "--preview-command", "review", "--arguments", args, "--json"], { from: "user" });
    const result = JSON.parse(logs.join("\n"));
    expect(result).toMatchObject({ ok: true, signatureValid: false, preview: { command: "review", extensionId: "reviewer", manifestDigest: f.digest } });
    expect(result.preview.prompt).toContain(JSON.stringify(args));
    expect(existsSync(`${f.path}.sig`)).toBe(false);
  });

  it("refuses to preview an executable handler, even when its declaration is valid", async () => {
    const f = fixture();
    const manifest = { ...f.manifest, schemaVersion: 2, executable: {
      apiVersion: 1, pluginId: "fixture", version: "1.0.0", packageSha256: "a".repeat(64), publisherFingerprint: "b".repeat(64),
      entrypoint: "content/extensions/fixture.mjs", capabilities: ["command.invoke"], contexts: [], commands: { compute: { export: "compute" } },
      limits: { timeoutMs: 100, maxOutputBytes: 100, maxCalls: 1, maxLifetimeMs: 1_000 }
    } };
    writeFileSync(f.path, JSON.stringify(manifest));
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation(value => { logs.push(String(value)); });
    const program = new Command().exitOverride(); registerNativeExtensionCommands(program);
    await program.parseAsync(["native-extension", "inspect", f.path, "--preview-command", "compute", "--json"], { from: "user" });
    expect(JSON.parse(logs.join("\n"))).toMatchObject({ ok: false, code: "EXECUTABLE_PREVIEW" });
    expect(process.exitCode).toBe(1);
  });

  it("does not accept preview arguments without an explicitly selected command", async () => {
    const f = fixture();
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation(value => { logs.push(String(value)); });
    const program = new Command().exitOverride(); registerNativeExtensionCommands(program);
    await program.parseAsync(["native-extension", "inspect", f.path, "--arguments", "data", "--json"], { from: "user" });
    expect(JSON.parse(logs.join("\n"))).toMatchObject({ ok: false, code: "PREVIEW_COMMAND_REQUIRED" });
    expect(process.exitCode).toBe(1);
  });

  it("names missing and changed resources without printing their contents", () => {
    const f = fixture();
    const resource = join(f.root, "context.md");
    writeFileSync(resource, "private-source-marker");
    expect(() => readNativeExtension({ workspace: f.workspace, manifestPath: f.path, requireSignature: false })).toThrow(/context.md.*hash/i);
    rmSync(resource);
    expect(() => readNativeExtension({ workspace: f.workspace, manifestPath: f.path, requireSignature: false })).toThrow(/context.md.*missing/i);
  });
});
