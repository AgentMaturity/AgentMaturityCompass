import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDeclarativeConfig } from "../dist/config/amcConfigLoader.js";
import { runFromConfig } from "../dist/config/amcConfigRunner.js";
import { captureRawConfigPairForAsync } from "../dist/config/configSignaturePair.js";
import { initWorkspace } from "../dist/workspace.js";
import { lockVault } from "../dist/vault/vault.js";
import { sha256Hex } from "../dist/utils/hash.js";

const roots: string[] = [];
function workspace() {
  const root = mkdtempSync(join(tmpdir(), "amc-overlays-"));
  roots.push(root);
  return root;
}
function write(root: string, name: string, value: unknown) {
  const file = join(root, name);
  writeFileSync(file, YAML.stringify(value));
  return file;
}
async function sign(root: string, file: string) {
  const prepared = await captureRawConfigPairForAsync(root, file).prepare();
  prepared.publish();
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    lockVault(root);
    rmSync(root, { recursive: true, force: true });
  }
});

describe("declarative config overlays", () => {
  it("orders defaults < workspace < user < explicit and records each final leaf's exact file digest", () => {
    const root = workspace();
    const base = write(root, "amcconfig.yaml", {
      agents: [{ id: "base" }], thresholds: { minOverallLevel: 3 },
      diagnostic: { window: "7d" }, env: { BASE: "yes", SAME: "same", "a/b~c": "escaped" },
    });
    const user = write(root, "user.yaml", { diagnostic: { window: "14d" }, env: { SAME: "same", USER: "yes" } });
    const explicit = write(root, "invocation.yaml", { diagnostic: { window: "2d" }, output: { formats: ["json"] } });
    const result = loadDeclarativeConfig(explicit, root, { userConfig: user });
    expect(result.config.diagnostic?.window).toBe("2d");
    expect(result.config.thresholds?.minOverallLevel).toBe(3);
    expect(result.config.thresholds?.minIntegrityIndex).toBe(0.5);
    expect(result.config.output?.formats).toEqual(["json"]);
    expect(result.config.env).toEqual({ BASE: "yes", SAME: "same", USER: "yes", "a/b~c": "escaped" });
    for (const [pointer, layer, path] of [
      ["/diagnostic/window", "explicit", explicit], ["/thresholds/minOverallLevel", "workspace", base],
      ["/env/SAME", "user", user], ["/env/a~1b~0c", "workspace", base],
    ] as const) {
      expect(result.provenance[pointer]).toEqual({ layer, path, sha256: sha256Hex(readFileSync(path)) });
    }
    expect(result.provenance["/thresholds/minIntegrityIndex"]).toEqual({ layer: "default", path: null, sha256: null });
    expect(result.provenance["/agents/0/runtime"]).toEqual({ layer: "default", path: null, sha256: null });
  });

  it("replaces arrays and retains explicit false/zero/empty values", () => {
    const root = workspace();
    write(root, "amcconfig.yaml", { agents: [{ id: "a" }, { id: "b" }], thresholds: { minOverallLevel: 3, denyIfLowTrust: true } });
    const explicit = write(root, "invocation.yaml", {
      agents: [{ id: "c" }], thresholds: { minOverallLevel: 0, denyIfLowTrust: false }, env: {},
    });
    const result = loadDeclarativeConfig(explicit, root, { userConfig: false });
    expect(result.config.agents.map(agent => agent.id)).toEqual(["c"]);
    expect(result.config.thresholds?.minOverallLevel).toBe(0);
    expect(result.config.thresholds?.denyIfLowTrust).toBe(false);
    expect(result.provenance["/agents/1/id"]).toBeUndefined();
  });

  it("validates partial layers before a later override can hide a malformed value", () => {
    const root = workspace();
    write(root, "amcconfig.yaml", { agents: [{ id: "a" }], thresholds: { minOverallLevel: "bad" } });
    const explicit = write(root, "override.yaml", { thresholds: { minOverallLevel: 2 } });
    expect(() => loadDeclarativeConfig(explicit, root, { userConfig: false })).toThrow(/Invalid.*layer/i);
  });

  it("requires a valid complete effective config and refuses empty files and cyclic YAML aliases", () => {
    const root = workspace();
    const base = write(root, "amcconfig.yaml", { description: "no agents" });
    expect(() => loadDeclarativeConfig(undefined, root, { userConfig: false })).toThrow();
    writeFileSync(base, "");
    expect(() => loadDeclarativeConfig(undefined, root, { userConfig: false })).toThrow(/empty/i);
    writeFileSync(base, "agents: [{ id: a }]\nunknown: &cycle { self: *cycle }\n");
    expect(() => loadDeclarativeConfig(undefined, root, { userConfig: false })).toThrow(/circular|cyclic/i);
  });

  it("preserves ordinary YAML aliases and attributes each resolved value to its file", () => {
    const root = workspace();
    const file = join(root, "amcconfig.yaml");
    writeFileSync(file, "agents: [{ id: a }]\ncommon: &vars { VALUE: data }\nenv: *vars\n");
    const result = loadDeclarativeConfig(undefined, root, { userConfig: false });
    expect(result.config.env).toEqual({ VALUE: "data" });
    expect(result.provenance["/env/VALUE"]).toEqual({ layer: "workspace", path: file, sha256: sha256Hex(readFileSync(file)) });
  });

  it("refuses explicitly empty or missing user and explicit file paths", () => {
    const root = workspace();
    write(root, "amcconfig.yaml", { agents: [{ id: "a" }] });
    expect(() => loadDeclarativeConfig("", root, { userConfig: false })).toThrow(root);
    expect(() => loadDeclarativeConfig(undefined, root, { userConfig: "" })).toThrow(root);
    expect(() => loadDeclarativeConfig(undefined, root, { userConfig: "missing.yaml" })).toThrow("not found");
  });

  it("exposes provenance and final invocation overrides in config run dry-run", async () => {
    const root = workspace();
    write(root, "amcconfig.yaml", { agents: [{ id: "a" }] });
    vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await runFromConfig({ workspace: root, userConfig: false, window: "4d", dryRun: true });
    expect(result.provenance["/diagnostic/window"]).toEqual({ layer: "flag", path: null, sha256: null });
  });

  it("prints effective config and provenance through the existing validate command", () => {
    const root = workspace();
    write(root, "amcconfig.yaml", { agents: [{ id: "a" }] });
    const user = write(root, "user.yaml", { thresholds: { minOverallLevel: 3 } });
    const explicit = write(root, "override.yaml", { diagnostic: { window: "2d" } });
    const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
    const child = spawnSync(process.execPath, [cli, "config", "validate", "--config", explicit, "--user-config", user, "--json"], {
      cwd: root, encoding: "utf8", env: { ...process.env, AMC_NO_AUTO_REBUILD: "1", NO_COLOR: "1" },
    });
    expect(child.status, child.stderr).toBe(0);
    const output = JSON.parse(child.stdout);
    expect(output.config.thresholds.minOverallLevel).toBe(3);
    expect(output.config.diagnostic.window).toBe("2d");
    expect(output.provenance["/diagnostic/window"]).toEqual({ layer: "explicit", path: explicit, sha256: sha256Hex(readFileSync(explicit)) });
  });

  it("keeps the workspace runtime policy separate from declarative overlays", () => {
    const root = workspace();
    initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
    const explicit = write(root, "evaluation.yaml", { agents: [{ id: "a" }] });
    expect(loadDeclarativeConfig(explicit, root, { userConfig: false }).config.agents[0]?.id).toBe("a");
    expect(() => loadDeclarativeConfig(undefined, root, { userConfig: false })).toThrow("No amcconfig.yaml found");
  });

  it("authenticates signed base and overlays through the current config purpose", async () => {
    const root = workspace();
    initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
    const base = write(root, "amcconfig.yaml", { agents: [{ id: "a" }] });
    const explicit = write(root, "override.yaml", { thresholds: { minOverallLevel: 4 } });
    await sign(root, base);
    await sign(root, explicit);
    const result = loadDeclarativeConfig(explicit, root, { userConfig: false });
    expect(result.config.thresholds?.minOverallLevel).toBe(4);
    expect(result.provenance["/thresholds/minOverallLevel"]?.sha256).toBe(sha256Hex(readFileSync(explicit)));
    writeFileSync(explicit, "thresholds: { minOverallLevel: 0 }\n");
    expect(() => loadDeclarativeConfig(explicit, root, { userConfig: false })).toThrow(/signature|digest/i);
  });

  it("refuses an unsigned user, explicit file or invocation value over a signed base", async () => {
    const root = workspace();
    initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
    const base = write(root, "amcconfig.yaml", { agents: [{ id: "a" }] });
    const overlay = write(root, "override.yaml", {});
    await sign(root, base);
    expect(() => loadDeclarativeConfig(undefined, root, { userConfig: overlay })).toThrow(/unsigned.*user/i);
    expect(() => loadDeclarativeConfig(overlay, root, { userConfig: false })).toThrow(/unsigned.*explicit/i);
    await sign(root, overlay);
    vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(runFromConfig({ workspace: root, userConfig: false, window: "4d", dryRun: true })).rejects.toThrow(/unsigned.*flag/i);
  });

  it("refuses tampered base bytes and a forged signature even with a matching digest", async () => {
    const root = workspace();
    initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
    const base = write(root, "amcconfig.yaml", { agents: [{ id: "a" }] });
    await sign(root, base);
    writeFileSync(base, "agents: [{ id: tampered }]\n");
    expect(() => loadDeclarativeConfig(undefined, root, { userConfig: false })).toThrow(/signature|digest/i);
    const digest = sha256Hex(readFileSync(base));
    writeFileSync(`${base}.sig`, JSON.stringify({ digestSha256: digest, signature: Buffer.alloc(64).toString("base64") }));
    expect(() => loadDeclarativeConfig(undefined, root, { userConfig: false })).toThrow(/signature/i);
    await sign(root, base);
    const sidecar = JSON.parse(readFileSync(`${base}.sig`, "utf8"));
    sidecar.digestSha256 = "0".repeat(64);
    writeFileSync(`${base}.sig`, JSON.stringify(sidecar));
    expect(() => loadDeclarativeConfig(undefined, root, { userConfig: false })).toThrow(/signature|digest/i);
  });
});
