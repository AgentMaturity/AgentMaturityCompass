import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initToolsConfigAsync, listAllowedTools, loadToolsConfig, prepareToolsConfigPair, toolsConfigPath, ToolsConfigPublicationError,
  verifyToolsConfigSignature } from "../src/toolhub/toolhubValidators.js";
import { defaultToolsConfig } from "../src/toolhub/toolsSchema.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

/** The signed tools pair (.amc/tools.yaml and its .sig): read, re-initialised and published with each member reported. */
const dirs: string[] = [];
let workspace: string;
beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "tools-config-publication");
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-tools-pair-")));
  dirs.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
});
afterEach(() => {
  for (const dir of dirs.splice(0)) { try { lockVault(dir); } catch { /* not a workspace */ } rmSync(dir, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});

const changedConfig = (): Buffer => {
  const config = defaultToolsConfig();
  config.tools.allowedTools = config.tools.allowedTools.slice(0, 1);
  return Buffer.from(YAML.stringify(config), "utf8");
};

describe("the tools config pair", () => {
  it("reads the allowed tools of the signed config, and names a missing file", () => {
    expect(listAllowedTools(workspace).map((tool) => tool.name)).toEqual(defaultToolsConfig().tools.allowedTools.map((tool) => tool.name));
    expect(() => loadToolsConfig(workspace, "missing-tools.yaml")).toThrow(`Tools config not found: ${join(workspace, "missing-tools.yaml")}`);
  });

  it("initialising only when missing refuses a config that is already there, changing nothing", async () => {
    const before = readFileSync(toolsConfigPath(workspace));
    await expect(initToolsConfigAsync(workspace, undefined, { onlyIfMissing: true })).rejects.toThrow("tools config appeared while initializing; retry");
    expect(readFileSync(toolsConfigPath(workspace)).equals(before)).toBe(true);
  });

  it("publishes a replacement config and then its signature, reporting each member as it lands", async () => {
    const recorded: string[] = [];
    const prepared = await prepareToolsConfigPair(workspace, changedConfig());
    const paths = prepared.publish((path) => recorded.push(path));
    expect(paths).toEqual({ configPath: toolsConfigPath(workspace), sigPath: `${toolsConfigPath(workspace)}.sig` });
    expect(recorded).toEqual([paths.configPath, paths.sigPath]);
    expect(listAllowedTools(workspace)).toHaveLength(1);
    expect(verifyToolsConfigSignature(workspace).valid).toBe(true);
  });

  it("a re-signature reports only the signature", async () => {
    const recorded: string[] = [];
    const paths = (await prepareToolsConfigPair(workspace)).publish((path) => recorded.push(path));
    expect(recorded).toEqual([paths.sigPath]);
    expect(verifyToolsConfigSignature(workspace).valid).toBe(true);
  });

  it("a publication that stops after the config names what was already committed and leaves the old signature to refuse it", async () => {
    const prepared = await prepareToolsConfigPair(workspace, changedConfig());
    let thrown: unknown;
    try { prepared.publish(() => { throw new Error("recorder stopped"); }); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(ToolsConfigPublicationError);
    const partial = thrown as ToolsConfigPublicationError;
    expect(partial).toMatchObject({ code: "TOOLS_CONFIG_PARTIAL", name: "ToolsConfigPublicationError", publishedPaths: [toolsConfigPath(workspace)],
      attemptedPath: toolsConfigPath(workspace), message: "tools pair publication is incomplete; earlier members remain committed" });
    expect((partial.cause as Error).message).toBe("recorder stopped");
    expect(verifyToolsConfigSignature(workspace).valid).toBe(false);
  });
});
