import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { nativeMcpToolName } from "../src/mcp/nativeMcpClient.js";
import { registerMcpCommands } from "../src/mcp/mcpCli.js";
import { reviewAndAllowMcpServer } from "../src/mcp/mcpAddReviewCli.js";
import { scopedMcpDirs } from "../src/mcp/mcpScopes.js";

/** `amc mcp config | list-tools | add | remove | list | get | sign` and the add review, run in-process (no child CLI). */
const directories: string[] = [];
const temp = (prefix: string) => { const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix))); directories.push(dir); return dir; };
const strip = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "");

let out: string[]; let err: string[]; let errStream: string[];
const cwd = process.cwd();
const ttyIn = process.stdin.isTTY;
beforeEach(() => {
  out = []; err = []; errStream = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => { out.push(strip(a.map(String).join(" "))); });
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => { err.push(strip(a.map(String).join(" "))); });
  vi.spyOn(process.stderr, "write").mockImplementation(((chunk: string | Uint8Array) => { errStream.push(String(chunk)); return true; }) as never);
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => { throw new Error(`exit ${code}`); }) as never);
  Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
  process.exitCode = undefined;
});
afterEach(() => {
  process.chdir(cwd);
  Object.defineProperty(process.stdin, "isTTY", { value: ttyIn, configurable: true });
  process.exitCode = undefined;
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

async function amc(...args: string[]): Promise<{ out: string; err: string; code: number }> {
  const start = { out: out.length, err: err.length };
  const program = new Command(); program.exitOverride();
  registerMcpCommands(program);
  process.exitCode = undefined;
  await program.parseAsync(["node", "amc", "mcp", ...args]);
  const code = Number(process.exitCode ?? 0);
  process.exitCode = undefined;
  return { out: out.slice(start.out).join("\n"), err: err.slice(start.err).join("\n"), code };
}

const SERVER = String.raw`
const fs = require('node:fs');
require('node:readline').createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line); fs.appendFileSync(process.argv[1], request.method + '\n');
  if (request.id === undefined) return;
  const result = request.method === 'initialize' ? {protocolVersion:request.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'scope-fixture',version:'1'}}
    : request.method === 'tools/list' ? {tools:[{name:'lookup',inputSchema:{type:'object',properties:{},additionalProperties:false}}]} : {};
  process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\n');
});`;

function workspaceFixture(init: boolean) {
  const workspace = temp("amc-mcp-inproc-ws-"), home = temp("amc-mcp-inproc-home-");
  chmodSync(home, 0o700);
  vi.stubEnv("AMC_HOME", home); vi.stubEnv("HOME", home);
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", temp("amc-mcp-inproc-controls-"));
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "mcp-inproc-fixture");
  if (init) {
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
    initBudgets(workspace, "default"); writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
  }
  const log = join(workspace, "fixture.log"); writeFileSync(log, "");
  process.chdir(workspace);
  return { workspace, home, log, dirs: scopedMcpDirs(workspace) };
}

describe("amc mcp config and list-tools", () => {
  it("config --json prints every IDE's file and config; Claude Code reads .mcp.json", async () => {
    const result = await amc("config", "--json");
    const configs = JSON.parse(result.out);
    expect(configs["Claude Code"]).toMatchObject({ file: ".mcp.json", config: { mcpServers: { amc: { command: "amc", args: ["mcp", "serve"] } } } });
    expect(Object.keys(configs)).toEqual(expect.arrayContaining(["Cursor", "Windsurf", "VS Code Copilot", "Kiro"]));
  });

  it("config prints all snippets with the quick start, or only the named IDE", async () => {
    const all = await amc("config");
    expect(all.out).toContain("── Claude Code");
    expect(all.out).toContain("File: .mcp.json (in the project's top folder)");
    expect(all.out).toContain("Or let Claude Code write that file for you: claude mcp add --transport stdio --scope project amc -- amc mcp serve");
    expect(all.out).toContain("File: .cursor/mcp.json");
    expect(all.out).toContain("Quick start:");
    expect(all.out).toMatch(/Available tools: amc_/);
    const cursor = await amc("config", "--ide", "Cursor");
    expect(cursor.out).toContain("── Cursor");
    expect(cursor.out).not.toContain("── Claude Code");
  });

  it("config refuses an unknown IDE and names the options", async () => {
    await expect(amc("config", "--ide", "emacs")).rejects.toThrow("exit 1");
    expect(err.join("\n")).toContain('Unknown IDE: "emacs". Options: claude-code, cursor, windsurf, vscode, kiro, generic');
  });

  it("list-tools prints each tool and the resource, or the metadata as JSON", async () => {
    const json = JSON.parse((await amc("list-tools", "--json")).out) as Array<{ name: string; description: string; input: string }>;
    expect(json.length).toBeGreaterThan(0);
    const text = (await amc("list-tools")).out;
    expect(text).toContain(json[0]!.name);
    expect(text).toContain("amc://agent/{agentId}");
    expect(text).toMatch(/Sector Packs available via amc_score_sector_pack: \d+ packs/);
  });
});

describe("amc mcp add refusals (nothing written)", () => {
  const cases: Array<[string, string[], RegExp]> = [
    ["an uppercase id", ["add", "Big", "--scope", "project", "--", "node"], /use a lowercase id/],
    ["a scope that is neither", ["add", "x", "--scope", "global", "--", "node"], /--scope must be user or project/],
    ["streamable-http without --url", ["add", "x", "--scope", "project", "--transport", "streamable-http", "--origin", "https://a.example"], /needs --url and --origin/],
    ["streamable-http with a command", ["add", "x", "--scope", "project", "--transport", "streamable-http", "--url", "https://a.example/mcp", "--origin", "https://a.example", "--", "node"], /takes no command or --env-ref/],
    ["legacy SSE", ["add", "x", "--scope", "project", "--transport", "sse", "--", "node"], /legacy SSE is not supported/],
    ["stdio without a command", ["add", "x", "--scope", "project"], /stdio needs the server command after --/],
    ["stdio with --url", ["add", "x", "--scope", "project", "--url", "https://a.example", "--", "node"], /stdio takes no --url, --origin or --header-ref/],
    ["an env ref without =", ["add", "x", "--scope", "project", "--env-ref", "TOKEN", "--", "node"], /TOKEN: expected NAME=credentialRef/],
    ["an unknown action class", ["add", "x", "--scope", "project", "--action-class", "ROOT", "--", "node"], /"ROOT" is not an action class/],
  ];
  for (const [name, args, message] of cases) {
    it(`refuses ${name}`, async () => {
      const { dirs } = workspaceFixture(false);
      const result = await amc(...args);
      expect(result.code).toBe(1);
      expect(result.err).toMatch(message);
      expect(existsSync(join(dirs.project, "x.json"))).toBe(false);
    });
  }

  it("--json carries the refusal code", async () => {
    workspaceFixture(false);
    const result = await amc("add", "x", "--scope", "nope", "--json", "--", "node");
    expect(result.code).toBe(1);
    expect(JSON.parse(result.out)).toMatchObject({ ok: false, message: "--scope must be user or project." });
  });
});

describe("amc mcp add without review, list, get, remove, sign", () => {
  it("writes an unreviewed stdio file and a streamable-http file, lists and shows them, and removes one", async () => {
    const { dirs } = workspaceFixture(false);
    const added = await amc("add", "local", "--scope", "project", "--env-ref", "TOKEN=AMC_INPROC_TOKEN_REF", "--timeout-ms", "5000", "--", "node", "server.mjs");
    expect(added.code, added.err).toBe(0);
    expect(added.out).toContain(`Wrote ${join(dirs.project, "local.json")}`);
    expect(added.out).toContain("not yet reviewed");
    expect(added.out).toContain("Sign it: amc mcp sign local --scope project");
    expect(JSON.parse(readFileSync(join(dirs.project, "local.json"), "utf8")).server)
      .toEqual({ id: "local", command: "node", args: ["server.mjs"], envRefs: { TOKEN: "AMC_INPROC_TOKEN_REF" }, timeoutMs: 5000 });

    const http = await amc("add", "remote", "--scope", "user", "--transport", "streamable-http", "--url", "https://mcp.example/mcp",
      "--origin", "https://mcp.example", "--header-ref", "Authorization=AMC_INPROC_AUTH_REF", "--json");
    expect(http.code).toBe(0);
    const httpResult = JSON.parse(http.out);
    expect(httpResult).toMatchObject({ ok: true, id: "remote", scope: "user", reviewed: false, path: join(dirs.user, "remote.json") });
    expect(httpResult.next.join("\n")).not.toContain("amc mcp sign");

    const listed = JSON.parse((await amc("list", "--json")).out);
    expect(listed.servers.map((s: { scope: string; id: string; reviewed: boolean; mountable: boolean }) => [s.scope, s.id, s.reviewed, s.mountable]))
      .toEqual(expect.arrayContaining([["project", "local", false, false], ["user", "remote", false, false]]));
    const text = await amc("list");
    expect(text.out).toContain(`project scope: ${dirs.project}`);
    expect(text.out).toMatch(/project:local stdio unreviewed unsigned /);
    expect(text.out).toMatch(/user:remote streamable-http unreviewed /);

    // An unsigned project file is not admitted, so get refuses it; a user file is shown as --mcp would admit it.
    const unsigned = await amc("get", "project:local");
    expect(unsigned.code).toBe(1);
    expect(unsigned.err).toMatch(/sign/i);
    const shown = await amc("get", "user:remote");
    expect(shown.out).toContain(`user:remote ${join(dirs.user, "remote.json")}`);
    expect(shown.out).toContain("unreviewed");
    expect(shown.out).toContain('"url": "https://mcp.example/mcp"');
    expect(JSON.parse((await amc("get", "user:remote", "--json")).out)).toMatchObject({ ok: true, id: "remote", scope: "user" });

    const removed = await amc("remove", "remote", "--scope", "user");
    expect(removed.out).toBe(`Removed ${join(dirs.user, "remote.json")}.`);
    expect(existsSync(join(dirs.user, "remote.json"))).toBe(false);
    expect(JSON.parse((await amc("remove", "local", "--scope", "project", "--json")).out)).toMatchObject({ ok: true, id: "local", scope: "project" });
    const empty = await amc("list");
    expect(empty.out).toContain("No scoped MCP servers.");
  });

  it("get of a missing id and remove with a bad scope fail with exit code 1", async () => {
    workspaceFixture(false);
    expect((await amc("get", "nothing")).code).toBe(1);
    const removed = await amc("remove", "x", "--scope", "both", "--json");
    expect(removed.code).toBe(1);
    expect(JSON.parse(removed.out).message).toBe("--scope must be user or project.");
  });

  it("sign refuses the user scope and a digest other than the file's, signing nothing", async () => {
    const { dirs } = workspaceFixture(false);
    expect((await amc("add", "local", "--scope", "project", "--", "node", "server.mjs")).code).toBe(0);
    const user = await amc("sign", "local", "--scope", "user", "--expect-digest", "0".repeat(64));
    expect(user.code).toBe(1);
    expect(user.err).toContain("Only the project scope is signed");
    const wrong = await amc("sign", "local", "--scope", "project", "--expect-digest", "0".repeat(64), "--json");
    expect(wrong.code).toBe(1);
    expect(JSON.parse(wrong.out)).toMatchObject({ ok: false, code: "mcp-scope-digest-mismatch" });
    expect(existsSync(join(dirs.project, "local.json.sig"))).toBe(false);
  });
});

describe("amc mcp add review (mcpAddReviewCli)", () => {
  it("refuses a folder without a tool policy and saves nothing", async () => {
    const { dirs } = workspaceFixture(false);
    const result = await amc("add", "fixture", "--scope", "project", "--yes", "--", process.execPath, "-e", SERVER, join(dirs.project, "..", "x.log"));
    expect(result.code).toBe(1);
    expect(result.err).toContain("This folder has no AMC tool policy (.amc/tools.yaml); run amc init --coding first. Nothing was saved.");
    expect(existsSync(join(dirs.project, "fixture.json"))).toBe(false);
  });

  it("--yes reviews, allows and signs a project server; then a failed --force re-add keeps it unchanged", async () => {
    const { workspace, dirs, log } = workspaceFixture(true);
    const added = await amc("add", "fixture", "--scope", "project", "--action-class", "READ_ONLY", "--yes", "--", process.execPath, "-e", SERVER, log);
    expect(added.code, added.err).toBe(0);
    expect(added.out).toContain("the server's own words");
    expect(added.out).toContain(`Allowed 1 tool. Saved ${join(dirs.project, "fixture.json")} and signed it; added to the signed tool policy.`);
    expect(added.out).toContain("Use it: amc agent-loop chat --mcp fixture --tools workspace --approve-tools READ_ONLY");
    expect(existsSync(join(dirs.project, "fixture.json.sig"))).toBe(true);
    expect(loadToolsConfig(workspace).tools.allowedTools.map((t) => [t.name, t.actionClass]))
      .toEqual(expect.arrayContaining([[nativeMcpToolName("fixture", "lookup"), "READ_ONLY"]]));
    expect(readFileSync(log, "utf8")).toContain("tools/list");

    const before = readFileSync(join(dirs.project, "fixture.json"));
    const broken = await amc("add", "fixture", "--scope", "project", "--force", "--yes", "--json", "--", join(workspace, "no-such-server"));
    expect(broken.code).toBe(1);
    const refusal = JSON.parse(broken.out);
    expect(refusal).toMatchObject({ ok: false, code: "mcp-add-discovery-failed", reviewed: false });
    expect(refusal.message).toContain("is unchanged");
    expect(readFileSync(join(dirs.project, "fixture.json"))).toEqual(before);

    const unknownTool = await amc("add", "fixture", "--scope", "project", "--force", "--yes", "--tool", "nope", "--", process.execPath, "-e", SERVER, log);
    expect(unknownTool.code).toBe(1);
    expect(unknownTool.err).toMatch(/no tool named/);
    expect(readFileSync(join(dirs.project, "fixture.json"))).toEqual(before);
  }, 120_000);

  it("a new id whose server does not start is saved unreviewed so the diagnostics can read it", async () => {
    const { workspace, dirs } = workspaceFixture(true);
    const result = await amc("add", "dead", "--scope", "project", "--yes", "--", join(workspace, "no-such-server"));
    expect(result.code).toBe(1);
    expect(result.err).toContain(`Saved ${join(dirs.project, "dead.json")} unreviewed, so nothing can use it yet.`);
    expect(JSON.parse(readFileSync(join(dirs.project, "dead.json"), "utf8"))).not.toHaveProperty("grants");
  }, 60_000);

  it("--json on a user-scope server prints the result without a signature", async () => {
    const { dirs, log } = workspaceFixture(true);
    const result = await amc("add", "mine", "--scope", "user", "--yes", "--json", "--", process.execPath, "-e", SERVER, log);
    expect(result.code, result.err).toBe(0);
    expect(JSON.parse(result.out)).toMatchObject({ ok: true, id: "mine", scope: "user", reviewed: true, signaturePath: null,
      actionClass: "WRITE_HIGH", allowed: [{ name: "lookup" }], path: join(dirs.user, "mine.json") });
    expect(errStream.join("")).toContain("Starting the server once to read its tools");
  }, 60_000);

  it("anything but yes at the question writes nothing and changes no policy", async () => {
    const { workspace, dirs, log } = workspaceFixture(true);
    const policyBefore = readFileSync(join(workspace, ".amc", "tools.yaml"));
    const input = new PassThrough();
    vi.spyOn(process, "stdin", "get").mockReturnValue(input as never);
    input.write("no\n");
    await reviewAndAllowMcpServer({ workspace, dirs, scope: "project", config: { schemaVersion: 1, server: { id: "asked", command: process.execPath, args: ["-e", SERVER, log] } },
      path: join(dirs.project, "asked.json"), actionClass: "WRITE_HIGH", only: undefined, yes: false, json: false });
    expect(process.exitCode).toBe(1);
    expect(err.join("\n")).toContain("Nothing was saved. To try again: amc mcp add asked --scope project ...");
    expect(existsSync(join(dirs.project, "asked.json"))).toBe(false);
    expect(readFileSync(join(workspace, ".amc", "tools.yaml"))).toEqual(policyBefore);
  }, 60_000);
});
