import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadDeclarativeConfig } from "../src/config/amcConfigLoader.js";
import { sha256Hex } from "../src/utils/hash.js";

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
