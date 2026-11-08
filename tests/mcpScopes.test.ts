import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { discoverNativeMcpCatalog, nativeMcpToolName } from "../src/mcp/nativeMcpClient.js";
import { registerAgentCommands } from "../src/cli-agent-commands.js";
import { loadNativeMcpConfiguration } from "../src/setup/nativeMcpConfig.js";
import {
  assertPrivateFile, listScopedMcpConfigs, mergeScopedMcpSelection, removeScopedMcpConfig, resolveScopedMcpSelection, scopedMcpDirs, scopedProjectSignatureValid, writeScopedMcpConfig
} from "../src/mcp/mcpScopes.js";

/** SH-EXT-02: user and project MCP config scopes, `amc mcp add|remove|list|get|sign`, and `--mcp <id>`. */
const directories: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
const temp = (prefix: string) => { const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix))); directories.push(dir); return dir; };
function fixture() {
  const workspace = temp("amc-mcp-scopes-ws-"), home = temp("amc-mcp-scopes-home-");
  chmodSync(home, 0o700);
  vi.stubEnv("AMC_HOME", home);
  const dirs = scopedMcpDirs(workspace);
  return { workspace, home, dirs };
}
const stdio = (id: string) => ({ schemaVersion: 1 as const, server: { id, command: process.execPath, args: ["-e", "0"] } });

describe("scoped files", () => {
  it("resolves the user scope from the AMC home and the project scope from the workspace", () => {
    const { workspace, home, dirs } = fixture();
    expect(dirs).toEqual({ user: join(home, "mcp"), project: join(workspace, ".amc", "mcp") });
    expect(scopedMcpDirs(workspace, join(workspace, "other-home")).user).toBe(join(workspace, "other-home", "mcp"));
  });
  it("writes one unreviewed file per server and refuses overwrites and cross-scope collisions without --force", () => {
    const { workspace, dirs } = fixture();
    const written = writeScopedMcpConfig(dirs, "project", stdio("fixture"));
    expect(written.path).toBe(join(dirs.project, "fixture.json"));
    expect(JSON.parse(readFileSync(written.path, "utf8"))).toEqual(stdio("fixture"));
    expect(() => writeScopedMcpConfig(dirs, "project", stdio("fixture"))).toThrow(/exists; pass --force/);
    expect(() => writeScopedMcpConfig(dirs, "user", stdio("fixture"))).toThrow(/already exists in the project scope/);
    expect(() => writeScopedMcpConfig(dirs, "user", stdio("bad id!"))).toThrow(/server id/);
    writeScopedMcpConfig(dirs, "user", stdio("fixture"), true);
    const listed = listScopedMcpConfigs(workspace, dirs);
    expect(listed.entries.map(entry => [entry.scope, entry.id, entry.reviewed, entry.signatureValid])).toEqual([["user", "fixture", false, null], ["project", "fixture", false, false]]);
    expect(listed.problems).toEqual([]);
    expect(removeScopedMcpConfig(dirs, "user", "fixture")).toBe(join(dirs.user, "fixture.json"));
    expect(existsSync(join(dirs.user, "fixture.json"))).toBe(false);
  });
  it("reports a file whose server id disagrees with its name, and a user file another uid owns", () => {
    const { workspace, dirs } = fixture();
    mkdirSync(dirs.project, { recursive: true }); mkdirSync(dirs.user, { recursive: true });
    writeFileSync(join(dirs.project, "alias.json"), JSON.stringify(stdio("real")));
    writeFileSync(join(dirs.user, "mine.json"), JSON.stringify(stdio("mine")), { mode: 0o600 });
    const listed = listScopedMcpConfigs(workspace, dirs, 424242);
    expect(listed.entries).toEqual([]);
    expect(listed.problems.map(problem => problem.reason)).toEqual([expect.stringContaining("is not owned by the current user"), expect.stringContaining("must be named exactly <id>.json")]);
    chmodSync(join(dirs.user, "mine.json"), 0o666);
    expect(() => assertPrivateFile(join(dirs.user, "mine.json"))).toThrow(/group- or world-writable/);
    chmodSync(join(dirs.user, "mine.json"), 0o600);
    expect(() => assertPrivateFile(join(dirs.user, "mine.json"))).not.toThrow();
  });
});

describe("--mcp resolution", () => {
  it("refuses a missing id, an id in both scopes, and an unsigned project file; admits a qualified or user file with its pin", () => {
    const { workspace, dirs } = fixture();
    expect(() => resolveScopedMcpSelection(workspace, ["nothere"], dirs)).toThrow(/no .*nothere\.json/);
    expect(() => resolveScopedMcpSelection(workspace, ["bad:x"], dirs)).toThrow(/scope must be project or user/);
    const user = writeScopedMcpConfig(dirs, "user", stdio("both"));
    writeScopedMcpConfig(dirs, "project", stdio("both"), true);
    expect(() => resolveScopedMcpSelection(workspace, ["both"], dirs)).toThrow(/exists in both scopes/);
    expect(() => resolveScopedMcpSelection(workspace, ["project:both"], dirs)).toThrow(/needs a valid BUNDLE signature/);
    expect(resolveScopedMcpSelection(workspace, ["user:both"], dirs)).toMatchObject({ paths: [user.path], pins: [user.sha256] });
    const merged = mergeScopedMcpSelection({ mcp: ["user:both"], mcpConfig: [user.path] }, workspace);
    expect(merged.mcpConfig).toEqual([user.path, user.path]);
    expect(merged.mcpConfigSha256).toEqual([user.sha256, user.sha256]);
    expect(mergeScopedMcpSelection({ mcpConfig: ["x"] }, workspace)).toEqual({ mcpConfig: ["x"] });
  });
});

const SERVER = String.raw`
const fs = require('node:fs');
require('node:readline').createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line); fs.appendFileSync(process.argv[1], request.method + '\n');
  if (request.id === undefined) return;
  const result = request.method === 'initialize' ? {protocolVersion:request.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'scope-fixture',version:'1'}}
    : request.method === 'tools/list' ? {tools:[{name:'lookup',inputSchema:{type:'object',properties:{},additionalProperties:false}}]} : {};
  process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\n');
});`;

describe("real surfaces", () => {
  it("amc mcp add, review, sign and run --mcp mount a project-scope server; an unsigned file is refused", async () => {
    const { workspace, home, dirs } = fixture();
    const controls = temp("amc-mcp-scopes-controls-");
    vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", controls); vi.stubEnv("AMC_VAULT_PASSPHRASE", "mcp-scopes-fixture");
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
    initBudgets(workspace, "default"); writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
    const log = join(workspace, "fixture.log"); writeFileSync(log, "");
    const cli = join(process.cwd(), "dist", "cli.js");
    const amc = (...args: string[]) => spawnSync(process.execPath, [cli, "mcp", ...args], { cwd: workspace, encoding: "utf8",
      env: { ...process.env, AMC_HOME: home, HOME: home, AMC_VAULT_PASSPHRASE: "mcp-scopes-fixture", AMC_CONTROL_CHECKPOINT_DIR: controls, AMC_NO_AUTO_REBUILD: "1", NO_COLOR: "1" } });
    const added = amc("add", "fixture", "--scope", "project", "--timeout-ms", "5000", "--json", "--", process.execPath, "-e", SERVER, log);
    expect(added.status, added.stderr + added.stdout).toBe(0);
    const path = JSON.parse(added.stdout).path as string;
    expect(path).toBe(join(dirs.project, "fixture.json"));
    expect(amc("add", "fixture", "--scope", "project", "--", "x").status).toBe(1);
    // Review: discover the catalog, pin its digest and grant the tool, exactly as an explicit --mcp-config needs.
    const config = JSON.parse(readFileSync(path, "utf8"));
    const catalog = await discoverNativeMcpCatalog(config.server, workspace);
    writeFileSync(path, JSON.stringify({ ...config, expectedCatalogDigest: catalog.digest, grants: [{ name: "lookup", actionClass: "READ_ONLY" }] }));
    const tools = loadToolsConfig(workspace);
    initToolsConfig(workspace, { ...tools, tools: { ...tools.tools, allowedTools: [{ name: "tool_search", actionClass: "READ_ONLY" }, { name: nativeMcpToolName("fixture", "lookup"), actionClass: "READ_ONLY" }] } });
    const listed = JSON.parse(amc("list", "--json").stdout);
    expect(listed.servers).toMatchObject([{ id: "fixture", scope: "project", reviewed: true, signatureValid: false, mountable: false, transport: "stdio" }]);
    writeFileSync(log, ""); // discovery above talked to the server; the runs below start from an empty log
    const cwd = process.cwd(); process.chdir(workspace);
    const run = async (...extra: string[]) => {
      const out: string[] = [], errors: string[] = [], failures: number[] = [];
      const program = new Command(); program.exitOverride();
      registerAgentCommands(program, { log: line => out.push(line), error: line => errors.push(line), fail: () => failures.push(1) });
      await program.parseAsync(["node", "amc", "agent-loop", "run", "hello", "--tools", "workspace", "--approve-tools", "READ_ONLY", "--credentials-home", home, "--json", ...extra]);
      return { out, errors, failures };
    };
    try {
      const unsigned = await run("--mcp", "fixture");
      expect(unsigned.failures).toHaveLength(1); expect(unsigned.errors.join("\n")).toContain("needs a valid BUNDLE signature");
      expect(readFileSync(log, "utf8")).toBe("");
      const signed = amc("sign", "fixture", "--scope", "project", "--json");
      expect(signed.status, signed.stderr + signed.stdout).toBe(0);
      expect(JSON.parse(signed.stdout)).toMatchObject({ reviewed: true, signaturePath: `${path}.sig` });
      expect(JSON.parse(amc("get", "fixture", "--json").stdout)).toMatchObject({ scope: "project", signatureValid: true, reviewed: true });
      const mounted = await run("--mcp", "fixture");
      expect(mounted.failures, mounted.errors.join("\n")).toEqual([]);
      expect(JSON.parse(mounted.out.at(-1)!)).toMatchObject({ endings: [{ turn: 1 }] });
      expect(readFileSync(log, "utf8").split("\n").filter(Boolean)).toEqual(expect.arrayContaining(["initialize", "tools/list"]));
      // S13: the signature is verified over the bytes that were parsed and pinned, never a second read of the path.
      const signedBytes = readFileSync(path);
      writeFileSync(path, signedBytes.toString("utf8").replace("5000", "5002"));
      const swapped = loadNativeMcpConfiguration(path); // unsigned bytes, pinned
      writeFileSync(path, signedBytes); // the path shows the signed bytes again while `swapped` is what would mount
      expect(scopedProjectSignatureValid(workspace, swapped)).toBe(false);
      expect(scopedProjectSignatureValid(workspace, loadNativeMcpConfiguration(path))).toBe(true);
      // A changed file loses its pin and its signature at once.
      writeFileSync(path, readFileSync(path, "utf8").replace("5000", "5001"));
      const changed = await run("--mcp", "fixture");
      expect(changed.failures).toHaveLength(1); expect(changed.errors.join("\n")).toContain("BUNDLE signature");
    } finally { process.chdir(cwd); }
  }, 120_000);
});
