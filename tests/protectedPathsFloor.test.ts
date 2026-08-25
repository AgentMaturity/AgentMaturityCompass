import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import YAML from "yaml";
import { initWorkspace } from "../src/workspace.js";
import {
  initToolsConfig,
  loadToolsConfig,
  pathAllowedByPatterns,
  signToolsConfig,
  toolsConfigPath,
  validateToolRequest
} from "../src/toolhub/toolhubValidators.js";
import { PROTECTED_WORKSPACE_PATHS, isProtectedPath, protectedPathGlobs } from "../src/toolhub/protectedPaths.js";
import { formatToolhubContextText } from "../src/toolhub/toolhubCli.js";
import { inspectToolhubContextForCli } from "../src/toolhub/toolhubCli.js";
import type { ToolDefinition } from "../src/toolhub/toolsSchema.js";

/**
 * `.amc` is declared, visible, and NOT removable.
 *
 * It used to be an unnamed branch inside `pathAllowedByPatterns`: correct,
 * unconditional, and invisible. An operator auditing their signed `tools.yaml`
 * was reading a complete list of the rules they control and an incomplete list
 * of the rules in force.
 *
 * Naming it is the fix. Making it EDITABLE would not be: these paths hold the
 * vault, the signing keys and the signed policies, so a tool that could reach
 * them could rewrite the allowlist governing it and re-sign it with the key it
 * just read. The config entry is documentation of a floor; these tests exist
 * to keep the two from being confused.
 */
const PASS = "protected-paths-floor-pass";
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  const prior = process.env["AMC_VAULT_PASSPHRASE"];
  process.env["AMC_VAULT_PASSPHRASE"] = prior ?? PASS;
  const dir = mkdtempSync(join(tmpdir(), "amc-floor-"));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

const openTool = (name: string): ToolDefinition =>
  ({ name, actionClass: "READ_ONLY", allow: { paths: ["**"] } } as ToolDefinition);

describe("the floor holds against configuration", () => {
  it("refuses .amc even when the tool allows everything and denies nothing", () => {
    // The most permissive entry an operator could write.
    const verdict = validateToolRequest({
      workspace: workspace(),
      tool: openTool("anything.at.all"),
      args: { path: ".amc/keys/auditor_ed25519.pub" }
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("always denied");
  });

  it("refuses .amc after the deny globs are DELETED from a signed config", () => {
    // The test this file exists for. An operator — or an agent that reached
    // the config — removes the protection and re-signs. The signature is
    // valid, the config verifies, and the floor is unchanged.
    const dir = workspace();
    initToolsConfig(dir);
    const config = loadToolsConfig(dir);
    for (const tool of config.tools.allowedTools) {
      if (tool.deny?.paths) tool.deny.paths = [];
      if (tool.allow?.paths) tool.allow.paths = ["**"];
    }
    writeFileSync(toolsConfigPath(dir), YAML.stringify(config));
    signToolsConfig(dir);

    const reloaded = loadToolsConfig(dir);
    const fsRead = reloaded.tools.allowedTools.find((tool) => tool.name === "fs.read");
    expect(fsRead?.deny?.paths, "precondition: the protection really is gone from the config").toEqual([]);

    const verdict = validateToolRequest({
      workspace: dir,
      tool: fsRead as ToolDefinition,
      args: { path: ".amc/vault.amcvault" }
    });
    expect(verdict.ok, "a signed config cannot lower the floor").toBe(false);
  });

  it("refuses the vault file by its own path", () => {
    const dir = workspace();
    const verdict = validateToolRequest({
      workspace: dir,
      tool: openTool("anything.at.all"),
      args: { path: ".amc/vault.amcvault" }
    });
    expect(verdict.ok).toBe(false);
  });

  it("refuses a path that climbs INTO .amc from elsewhere", () => {
    const dir = workspace();
    const verdict = validateToolRequest({
      workspace: dir,
      tool: openTool("anything.at.all"),
      args: { path: "src/../.amc/keys" }
    });
    expect(verdict.ok, "resolution decides, not the spelling").toBe(false);
  });

  it("leaves everything else alone", () => {
    const dir = workspace();
    writeFileSync(join(dir, "README.md"), "readme");
    const verdict = validateToolRequest({
      workspace: dir,
      tool: openTool("anything.at.all"),
      args: { path: "README.md" }
    });
    expect(verdict.ok, `denied: ${verdict.reason ?? ""}`).toBe(true);
  });

  it("does not refuse a sibling directory whose name merely starts the same way", () => {
    // `.amcx` is not inside `.amc`. A prefix comparison on the resolved string
    // would say otherwise, and would refuse a directory nobody protected.
    const dir = workspace();
    const verdict = validateToolRequest({
      workspace: dir,
      tool: openTool("anything.at.all"),
      args: { path: ".amcx/notes.txt" }
    });
    expect(verdict.ok, `denied: ${verdict.reason ?? ""}`).toBe(true);
  });
});

describe("the floor is visible", () => {
  it("carries a reason an operator can act on, not just a glob", () => {
    expect(PROTECTED_WORKSPACE_PATHS.length).toBeGreaterThan(0);
    for (const entry of PROTECTED_WORKSPACE_PATHS) {
      expect(entry.glob.length).toBeGreaterThan(0);
      expect(entry.reason.length, `${entry.glob} has no reason`).toBeGreaterThan(20);
    }
  });

  it("appears in the shipped config, where an operator reads their policy", () => {
    const dir = workspace();
    initToolsConfig(dir);
    const config = loadToolsConfig(dir);
    const fsRead = config.tools.allowedTools.find((tool) => tool.name === "fs.read");

    for (const glob of protectedPathGlobs()) {
      expect(fsRead?.deny?.paths, `the shipped config should name ${glob}`).toContain(glob);
    }
  });

  it("is printed by `amc tools list`, stated as unconditional", () => {
    // The complaint this whole change answers: an operator auditing their
    // configuration could not tell this rule existed.
    const dir = workspace();
    initToolsConfig(dir);
    const text = formatToolhubContextText(inspectToolhubContextForCli(dir));

    expect(text).toContain("Always denied, whatever the signed config says");
    expect(text).toContain(PROTECTED_WORKSPACE_PATHS[0]?.glob ?? "");
    expect(text, "and why, not only what").toContain("signing keys");
  });
});

describe("isProtectedPath, directly", () => {
  it("matches the directory itself, not only things under it", () => {
    const dir = workspace();
    expect(isProtectedPath(dir, join(dir, ".amc"))).toBe(true);
    expect(isProtectedPath(dir, join(dir, ".amc", "keys"))).toBe(true);
  });

  it("does not match a sibling with a shared prefix", () => {
    const dir = workspace();
    expect(isProtectedPath(dir, join(dir, ".amcx"))).toBe(false);
    expect(isProtectedPath(dir, join(dir, ".amc-backup", "x"))).toBe(false);
  });

  it("is what pathAllowedByPatterns consults before any list", () => {
    const dir = workspace();
    const verdict = pathAllowedByPatterns(dir, join(dir, ".amc", "keys"), ["**"], []);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("always denied");
  });
});
