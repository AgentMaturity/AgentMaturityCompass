import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { createPersonaEnvironment, runPersona } from "../scripts/install-persona-qa.mjs";
import { cleanSourceRuntimeEnvironment, DOCUMENTED_SOURCE_COMMANDS } from "../scripts/clean-source-check.mjs";

const roots: string[] = [];
function temporary() { const dir = mkdtempSync(join(tmpdir(), "amc-persona-isolation-contract-")); roots.push(dir); return dir; }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const hostile = {
  PATH: "/usr/bin", HOME: "/operator-home", USERPROFILE: "/operator-profile",
  APPDATA: "/operator-data", LOCALAPPDATA: "/operator-local", XDG_CONFIG_HOME: "/operator-config",
  XDG_CACHE_HOME: "/operator-cache", XDG_DATA_HOME: "/operator-share",
  npm_config_global: "true", NPM_CONFIG_PREFIX: "/outside", NpM_CoNfIg_UserConfig: "/outside/.npmrc",
  npm_config_registry: "https://unintended.invalid", NODE_PATH: "/checkout/node_modules", NODE_OPTIONS: "--require=/loader.js",
  AMC_VAULT_PASSPHRASE: "operator-secret", AMC_NO_SIGN: "1", AMC_WORKSPACE_DIR: "/outside"
};

describe("fresh persona environments", () => {
  it("reuses the packed-install scrubber with empty npm configs and fresh platform-specific homes", () => {
    const tmp = temporary();
    const env = createPersonaEnvironment(hostile, tmp);
    expect(env.HOME.startsWith(tmp)).toBe(true);
    expect(env.USERPROFILE).toBe(env.HOME);
    for (const key of ["APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME"])
      expect(env[key].startsWith(env.HOME)).toBe(true);
    expect(env.AMC_VAULT_PASSPHRASE).toBe("packed-install-check");
    for (const key of ["NODE_PATH", "NODE_OPTIONS", "AMC_NO_SIGN", "AMC_WORKSPACE_DIR", "NPM_CONFIG_PREFIX", "NpM_CoNfIg_UserConfig", "npm_config_registry"])
      expect(env[key]).toBeUndefined();
    expect(env.npm_config_global).toBe("false");
    expect(env.npm_config_cache).toBe(join(env.HOME, ".npm"));
    expect(readFileSync(env.npm_config_userconfig, "utf8")).toBe("");
    expect(readFileSync(env.npm_config_globalconfig, "utf8")).toBe("");
    expect(readdirSync(env.HOME).sort()).toEqual([".npmrc", ".npmrc-global"]);
    expect(hostile.HOME).toBe("/operator-home");
    expect(hostile.AMC_VAULT_PASSPHRASE).toBe("operator-secret");
  });

  it("uses a different HOME for packing and each actual persona workflow, with no prior-persona marker", () => {
    const tmp = temporary();
    const packing = createPersonaEnvironment(hostile, tmp);
    writeFileSync(join(packing.HOME, "prior-persona"), "packing state");
    const homes: string[] = [];
    const workflows = new Map<string, string>();
    const execute = (command: string, args: string[], options: { cwd: string; env: Record<string, string> }) => {
      const home = options.env.HOME!;
      if (command === "npm") {
        expect(existsSync(join(home, "prior-persona"))).toBe(false);
        expect(readFileSync(options.env.npm_config_userconfig!, "utf8")).toBe("");
        expect(options.env.AMC_NO_SIGN).toBeUndefined();
        homes.push(home); workflows.set(options.cwd, home);
        writeFileSync(join(home, "prior-persona"), "this persona only");
        mkdirSync(join(options.cwd, "node_modules", ".bin"), { recursive: true });
        writeFileSync(join(options.cwd, "node_modules", ".bin", "amc"), "fixture; never executed");
      } else {
        expect(home).toBe(workflows.get(options.cwd));
        expect(command).toBe(join(options.cwd, "node_modules", ".bin", "amc"));
      }
      const payload = args[0] === "--agent"
        ? { ok: true, questionCount: 244, firstResultSla: { targetMs: 120000, elapsedMs: 100, met: true }, elapsedMs: 100 }
        : args[0] === "domain" ? { packs: Array.from({ length: 40 }, (_, i) => ({ packId: String(i) })) } : {};
      return { status: "passed", exitCode: 0, stdout: JSON.stringify(payload), stderr: "", startedAt: "fixture", endedAt: "fixture" };
    };
    for (const id of ["first", "second"]) {
      const result = runPersona({ id, name: id, agentId: `${id}-agent`, fixture: "node-cli", checks: [] }, "fixture.tgz", tmp, { baseEnv: hostile, execute });
      expect(result.steps.map((step: { id: string }) => step.id)).toEqual(["package-install", "version", "help", "full-score", "domain-packs", "runtime-create"]);
      expect(result.assertions.every((entry: { status: string }) => entry.status === "passed")).toBe(true);
    }
    expect(new Set([packing.HOME, ...homes]).size).toBe(3);
  });

  it("refuses to execute a bin left behind by a failed package install", () => {
    const tmp = temporary();
    const calls: string[] = [];
    const result = runPersona({ id: "failed", name: "Failed fixture", agentId: "failed-agent", fixture: "node-cli", checks: [] }, "fixture.tgz", tmp, {
      baseEnv: hostile,
      execute: (command: string, _args: string[], options: { cwd: string }) => {
        calls.push(command);
        mkdirSync(join(options.cwd, "node_modules", ".bin"), { recursive: true });
        writeFileSync(join(options.cwd, "node_modules", ".bin", "amc"), "partial installation");
        return { status: "failed", exitCode: 1, stdout: "", stderr: "dependency install failed", startedAt: "fixture", endedAt: "fixture" };
      }
    });
    expect(calls).toEqual(["npm"]);
    expect(result.steps).toHaveLength(6);
    expect(result.steps[0].status).toBe("failed");
    expect(result.steps.slice(1).every((step: { status: string }) => step.status === "skipped")).toBe(true);
    expect(result.checkCounts).toEqual({ planned: 9, executed: 1, passed: 0, failed: 1, skipped: 8 });
  });

  it("also isolates the clean-source runtime while retaining its documented source build commands", () => {
    const home = temporary();
    const env = cleanSourceRuntimeEnvironment(hostile, home);
    expect(env.HOME).toBe(home);
    expect(env.USERPROFILE).toBe(home);
    expect(env.AMC_VAULT_PASSPHRASE).toBe("clean-source-check");
    for (const key of ["NODE_PATH", "NODE_OPTIONS", "AMC_NO_SIGN", "AMC_WORKSPACE_DIR", "NPM_CONFIG_PREFIX", "NpM_CoNfIg_UserConfig", "npm_config_registry"])
      expect(env[key]).toBeUndefined();
    expect(env.npm_config_global).toBe("false");
    expect(readFileSync(env.npm_config_userconfig, "utf8")).toBe("");
    expect(readFileSync(env.npm_config_globalconfig, "utf8")).toBe("");
    expect(env.XDG_CONFIG_HOME).toBe(join(home, ".config"));
    expect(hostile.HOME).toBe("/operator-home");
    expect(DOCUMENTED_SOURCE_COMMANDS).toEqual(["pnpm install --frozen-lockfile", "pnpm run build"]);
  });

  it.each([false, true])("preserves a failed CLI result and respects --keep=%s during cleanup", (keep) => {
    const tmp = temporary();
    const preload = join(tmp, "synthetic-npm.mjs");
    writeFileSync(preload, `
import child from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
child.spawnSync = (_command, args) => {
  if (args[0] === "pack") {
    const out = args[args.indexOf("--pack-destination") + 1];
    writeFileSync(join(out, "fixture.tgz"), "fixture never installed");
    return { status: 0, stdout: JSON.stringify([{ filename: "fixture.tgz" }]), stderr: "" };
  }
  return { status: 1, stdout: "", stderr: "synthetic install failure" };
};
syncBuiltinESMExports();
`);
    const out = join(tmp, "receipt.json");
    const result = spawnSync(process.execPath, ["--import", preload, join(process.cwd(), "scripts/install-persona-qa.mjs"),
      "--json", "--out", out, ...(keep ? ["--keep"] : [])], {
      cwd: tmp, env: { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp }, encoding: "utf8", timeout: 15_000
    });
    expect(result.status, result.stderr).toBe(1);
    const receipt = JSON.parse(readFileSync(out, "utf8"));
    expect(receipt.status).toBe("failed");
    expect(receipt.personaCount).toBe(10);
    const remaining = readdirSync(tmp).filter((name) => name.startsWith("amc-install-persona-qa-"));
    expect(remaining).toHaveLength(keep ? 1 : 0);
    if (keep) expect(readdirSync(join(tmp, remaining[0]!)).filter((name) => name.startsWith("home-"))).toHaveLength(11);
  });
});
