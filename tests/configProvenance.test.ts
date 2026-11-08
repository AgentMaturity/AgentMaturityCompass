import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDeclarativeConfig } from "../src/config/amcConfigLoader.js";
import { sha256Hex } from "../src/utils/hash.js";
import { registerConfigProvenanceCommand } from "../src/cli-config-commands.js";

/** SH-EXT-07: shadowed values are tracked per leaf and shown by `amc config provenance`. */
const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
const workspace = () => { const dir = mkdtempSync(join(tmpdir(), "amc-config-provenance-")); directories.push(dir); return dir; };

describe("config provenance", () => {
  it("records every value a leaf was given, in layer order, with the winner last", () => {
    const root = workspace();
    const base = join(root, "amcconfig.yaml"); writeFileSync(base, "agents: [{ id: a }]\nthresholds: { minOverallLevel: 1 }\n");
    const user = join(root, "user.yaml"); writeFileSync(user, "thresholds: { minOverallLevel: 2 }\n");
    const result = loadDeclarativeConfig(undefined, root, { userConfig: user, overrides: { thresholds: { minOverallLevel: 3 } } });
    expect(result.config.thresholds?.minOverallLevel).toBe(3);
    expect(result.history["/thresholds/minOverallLevel"]).toEqual([
      { layer: "workspace", path: base, sha256: sha256Hex(readFileSync(base)), value: 1 },
      { layer: "user", path: user, sha256: sha256Hex(readFileSync(user)), value: 2 },
      { layer: "flag", path: null, sha256: null, value: 3 }]);
    expect(result.provenance["/thresholds/minOverallLevel"]).toEqual({ layer: "flag", path: null, sha256: null });
    // An untouched default has no history and a default provenance.
    expect(result.history["/version"]).toBeUndefined();
    expect(result.provenance["/version"]?.layer).toBe("default");
    // Arrays replace whole: a layer that replaces one is remembered at the array, and the elements it shadows stay in the leaves' history.
    expect(result.history["/agents"]).toBeUndefined();
    const agents = join(root, "agents.yaml"); writeFileSync(agents, "agents: [{ id: b }]\n");
    const replaced = loadDeclarativeConfig(undefined, root, { userConfig: agents });
    expect(replaced.history["/agents"]).toEqual([{ layer: "user", path: agents, sha256: sha256Hex(readFileSync(agents)), value: [{ id: "b" }] }]);
    expect(replaced.history["/agents/0/id"]?.map(entry => entry.value)).toEqual(["a", "b"]);
    expect(replaced.provenance["/agents/0/id"]?.layer).toBe("user");
  });
  it("prints the resolved value for a leaf that fell back to its default after a subtree replacement, and for an untouched default (skeptic)", () => {
    const root = workspace();
    writeFileSync(join(root, "amcconfig.yaml"), "agents: [{ id: a, riskTier: high }]\n");
    const user = join(root, "user.yaml"); writeFileSync(user, "agents: [{ id: b }]\n");
    const resolved = loadDeclarativeConfig(undefined, root, { userConfig: user });
    const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
    const amc = (...args: string[]) => spawnSync(process.execPath, [cli, "config", "provenance", ...args], { cwd: root, encoding: "utf8", env: { ...process.env, AMC_NO_AUTO_REBUILD: "1", NO_COLOR: "1" } });
    const tier = JSON.parse(amc("/agents/0/riskTier", "--user-config", user, "--json").stdout);
    expect(tier.winner).toMatchObject({ layer: "default", value: resolved.config.agents[0]!.riskTier });
    expect(tier.winner.value).not.toBe("high");
    expect(tier.shadowed).toEqual([expect.objectContaining({ layer: "workspace", value: "high" })]);
    expect(amc("/agents/0/riskTier", "--user-config", user).stdout).toContain(`/agents/0/riskTier: ${JSON.stringify(resolved.config.agents[0]!.riskTier)} from default`);
    const version = JSON.parse(amc("/version", "--json").stdout);
    expect(version.winner).toEqual({ layer: "default", path: null, sha256: null, value: resolved.config.version });
    expect(amc("/version").stdout).not.toContain("undefined");
  }, 120_000);

  it("in process: the winner value comes from the resolved config, and a default winner shadows every recorded value in both views", async () => {
    const root = workspace();
    writeFileSync(join(root, "amcconfig.yaml"), "agents: [{ id: a, riskTier: high }]\n");
    const user = join(root, "user.yaml"); writeFileSync(user, "agents: [{ id: b }]\n");
    const resolved = loadDeclarativeConfig(undefined, root, { userConfig: user });
    const run = async (...args: string[]) => {
      const lines: string[] = [], spy = vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => { lines.push(parts.join(" ")); });
      const cwd = process.cwd(); process.chdir(root);
      try {
        const program = new Command(); program.exitOverride();
        registerConfigProvenanceCommand(program.command("config"));
        await program.parseAsync(["node", "amc", "config", "provenance", ...args, "--user-config", user, "--json"]);
      } finally { process.chdir(cwd); spy.mockRestore(); }
      return JSON.parse(lines.join("\n"));
    };
    const tier = await run("/agents/0/riskTier");
    expect(tier.winner).toMatchObject({ layer: "default", value: resolved.config.agents[0]!.riskTier });
    expect(tier.shadowed).toEqual([expect.objectContaining({ layer: "workspace", value: "high" })]);
    const leaves = (await run()).leaves as { pointer: string; layer: string; shadowed: number }[];
    expect(leaves.find(leaf => leaf.pointer === "/agents/0/riskTier")).toMatchObject({ layer: "default", shadowed: 1 });
    expect(leaves.find(leaf => leaf.pointer === "/agents/0/id")).toMatchObject({ layer: "user", shadowed: 1 });
  });

  it("amc config provenance shows the winner and the shadowed values through the built CLI", () => {
    const root = workspace();
    writeFileSync(join(root, "amcconfig.yaml"), "agents: [{ id: a }]\nthresholds: { minOverallLevel: 1 }\n");
    const user = join(root, "user.yaml"); writeFileSync(user, "thresholds: { minOverallLevel: 4 }\n");
    const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
    const amc = (...args: string[]) => spawnSync(process.execPath, [cli, "config", "provenance", ...args], { cwd: root, encoding: "utf8", env: { ...process.env, AMC_NO_AUTO_REBUILD: "1", NO_COLOR: "1" } });
    const one = amc("/thresholds/minOverallLevel", "--user-config", user, "--json");
    expect(one.status, one.stderr).toBe(0);
    expect(JSON.parse(one.stdout)).toMatchObject({ ok: true, pointer: "/thresholds/minOverallLevel", winner: { layer: "user", path: user, value: 4 }, shadowed: [{ layer: "workspace", value: 1 }] });
    const all = amc("--user-config", user, "--json");
    expect(JSON.parse(all.stdout).leaves).toEqual(expect.arrayContaining([expect.objectContaining({ pointer: "/thresholds/minOverallLevel", layer: "user", shadowed: 1 }), expect.objectContaining({ pointer: "/agents/0/id", layer: "workspace", shadowed: 0 })]));
    const text = amc("/thresholds/minOverallLevel", "--user-config", user);
    expect(text.stdout).toContain("/thresholds/minOverallLevel: 4 from user"); expect(text.stdout).toContain("shadowed: 1 from workspace");
    expect(amc("/no/such/leaf", "--json").status).toBe(1);
  }, 120_000);
});
