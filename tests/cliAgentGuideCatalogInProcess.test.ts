/**
 * `agent-loop guide` and `agent-loop mcp-catalog` (src/cli-agent-guide-commands.ts) parsed in-process through
 * commander with a recording io, in a temporary workspace. The catalog fixture is a local stdio program; no network.
 */
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerAgentGuideCommands, selectedAgentOption } from "../src/cli-agent-guide-commands.js";
import type { AgentLoopCliIo } from "../src/cli-agent-options.js";

const SERVER = String.raw`
const readline = require('node:readline');
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
readline.createInterface({input:process.stdin}).on('line', line => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  let result = {};
  if (request.method === 'initialize') result = { protocolVersion: request.params.protocolVersion,
    serverInfo: {name:'guide-fixture', version:'1'}, capabilities: {tools:{}} };
  else if (request.method === 'tools/list') result = { tools: [{ name: 'lookup', description: 'Lookup documentation',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } }] };
  send({jsonrpc:'2.0', id:request.id, result});
});
`;

const roots: string[] = [];
let workspace: string;

function makeIo() {
  const logs: string[] = [];
  const errors: string[] = [];
  let failed = 0;
  const io: AgentLoopCliIo = { log: (line) => logs.push(line), error: (line) => errors.push(line), fail: () => { failed += 1; } };
  return { io, logs, errors, failed: () => failed };
}

async function run(args: string[]) {
  const recorded = makeIo();
  const program = new Command().name("amc").exitOverride().option("--agent <id>");
  registerAgentGuideCommands(program.command("agent-loop"), recorded.io);
  await program.parseAsync(["node", "amc", ...args]);
  return recorded;
}

function writeConfig(name: string, body: unknown): string {
  const path = join(workspace, name);
  writeFileSync(path, typeof body === "string" ? body : JSON.stringify(body));
  return path;
}

beforeEach(() => {
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-guide-catalog-")));
  roots.push(workspace);
  vi.spyOn(process, "cwd").mockReturnValue(workspace);
  vi.stubEnv("AMC_AGENT_ID", "");
  vi.stubEnv("HOME", workspace);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("selectedAgentOption", () => {
  it("prefers the subcommand's own --agent, then the global one", () => {
    const program = new Command().option("--agent <id>");
    const sub = program.command("guide").option("--agent <id>");
    program.parse(["node", "amc", "--agent", "global-one", "guide"]);
    expect(selectedAgentOption(sub)).toBe("global-one");
    const program2 = new Command().option("--agent <id>");
    const sub2 = program2.command("guide").option("--agent <id>");
    program2.parse(["node", "amc", "--agent", "global-one", "guide", "--agent", "local-one"]);
    expect(selectedAgentOption(sub2)).toBe("local-one");
  });
});

describe("agent-loop guide", () => {
  it("with no provider lists the choices as JSON for this folder and does not fail", async () => {
    const { logs, failed } = await run(["agent-loop", "guide", "--json"]);
    const guide = JSON.parse(logs[0]!) as { status: string; code: string; agentId: string; workspace: { path: string }; choices: { provider: string }[] };
    expect(guide).toMatchObject({ status: "choose-provider", code: "PROVIDER_REQUIRED", agentId: "default", workspace: { path: workspace } });
    expect(guide.choices.map((choice) => choice.provider)).toContain("stub");
    expect(failed()).toBe(0);
  });

  it("uses the global --agent for the next commands", async () => {
    const { logs } = await run(["--agent", "helper", "agent-loop", "guide", "--json"]);
    const guide = JSON.parse(logs[0]!) as { agentId: string; choices: { action: { argv: string[] } }[] };
    expect(guide.agentId).toBe("helper");
    expect(guide.choices[0]!.action.argv.slice(0, 4)).toEqual(["amc", "--agent", "helper", "agent-loop"]);
  });

  it("blocks an invalid provider origin in the plain rendering and marks the run failed", async () => {
    const { logs, failed } = await run(["agent-loop", "guide", "--base-url", "ftp://example.invalid"]);
    expect(logs.join("\n")).toContain("Use an HTTP(S) server origin without a path");
    expect(failed()).toBe(1);
  });
});

describe("agent-loop mcp-catalog", () => {
  it("refuses a missing config with the fixed message and leaves no SIGINT listener", async () => {
    const before = process.listenerCount("SIGINT");
    const { logs, errors, failed } = await run(["agent-loop", "mcp-catalog", "--config", join(workspace, "missing.json")]);
    expect(errors).toEqual(["Could not read the explicit MCP config file."]);
    expect(logs).toEqual([]);
    expect(failed()).toBe(1);
    expect(process.listenerCount("SIGINT")).toBe(before);
  });

  it("withholds the content of a config that is not JSON, and reports no diagnostics when there are none", async () => {
    const path = writeConfig("bad.json", "{ secret-looking: text");
    const { errors, failed } = await run(["agent-loop", "mcp-catalog", "--config", path, "--diagnostics"]);
    expect(errors).toEqual(["MCP config is not valid JSON. File content is withheld.", "MCP server produced no diagnostics."]);
    expect(errors.join("\n")).not.toContain("secret-looking");
    expect(failed()).toBe(1);
  });

  it("reads the catalog of a local stdio server, prints the allowlist names and creates no grant", async () => {
    const path = writeConfig("mcp.json", { schemaVersion: 1, server: { id: "fixture", command: process.execPath, args: ["-e", SERVER], timeoutMs: 5_000 } });
    const { logs, errors, failed } = await run(["agent-loop", "mcp-catalog", "--config", path]);
    expect(errors).toEqual([]);
    expect(failed()).toBe(0);
    expect(logs[0]).toBe("MCP catalog discovered; the configured server has been disposed. This command executed a local program and created no tool grants.");
    const receipt = JSON.parse(logs[1]!) as { serverStarted: boolean; grantsCreated: boolean; auth: unknown; allowlistNames: { remoteName: string; amcToolName: string }[] };
    expect(receipt).toMatchObject({ serverStarted: true, grantsCreated: false, auth: null });
    expect(receipt.allowlistNames.map((row) => row.remoteName)).toEqual(["lookup"]);
    // The AMC-side name is namespaced by server id and hashed, never the server's raw tool name.
    expect(receipt.allowlistNames[0]!.amcToolName).toMatch(/^mcp_fixture_[0-9a-f]+$/);
  }, 20_000);

  it("prints only the JSON receipt with --json", async () => {
    const path = writeConfig("mcp.json", { schemaVersion: 1, server: { id: "fixture", command: process.execPath, args: ["-e", SERVER], timeoutMs: 5_000 } });
    const { logs } = await run(["agent-loop", "mcp-catalog", "--config", path, "--json"]);
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0]!)).toHaveProperty("configSha256");
  }, 20_000);

  it("gives the generic refusal, not server text, when the server program fails", async () => {
    const path = writeConfig("mcp.json", { schemaVersion: 1, server: { id: "fixture", command: process.execPath,
      args: ["-e", "process.stderr.write('server-side detail'); process.exit(3)"], timeoutMs: 5_000 } });
    const { errors, failed } = await run(["agent-loop", "mcp-catalog", "--config", path]);
    expect(errors[0]).toBe("MCP discovery failed or was cancelled. Check the explicit config and credential references; no catalog or grant is accepted.");
    expect(errors.join("\n")).not.toContain("server-side detail");
    expect(failed()).toBe(1);
  }, 20_000);
});
