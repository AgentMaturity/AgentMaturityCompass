import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { discoverNativeMcpCatalog, nativeMcpToolName } from "../src/mcp/nativeMcpClient.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { AMCNativeClient } from "../src/sdk/nativeAgentClient.js";

// WP21c: the built SDK starts the built `amc acp`, which reviews and mounts each
// config. Each fixture server records the requests it actually received.
const SERVER = String.raw`
const fs = require('node:fs');
require('node:readline').createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line); fs.appendFileSync(process.argv[1], request.method + '\n');
  if (request.id === undefined) return;
  const result = request.method === 'initialize' ? {protocolVersion:request.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'sdk-fixture',version:'1'}}
    : request.method === 'tools/list' ? {tools:[{name:'lookup',inputSchema:{type:'object',properties:{},additionalProperties:false}}]} : {};
  process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\n');
});`;
const roots: string[] = [], clients: AMCNativeClient[] = [];
afterEach(async () => {
  for (const client of clients.splice(0)) await client.close().catch(() => undefined);
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

async function fixture() {
  const cli = resolve("dist/cli.js");
  if (!existsSync(cli)) throw new Error("Build before the SDK multi-server MCP regression.");
  const pass = "wp21c-sdk-mcp";
  vi.stubEnv("AMC_VAULT_PASSPHRASE", pass);
  const base = realpathSync(mkdtempSync(join(tmpdir(), "amc-wp21c-sdk-mcp-"))); roots.push(base);
  const workspace = join(base, "project"), home = join(base, "home"), controls = join(base, "controls");
  mkdirSync(workspace); mkdirSync(home, { mode: 0o700 });
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", controls);
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(workspace, "default"); writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
  const paths: string[] = [], pins: string[] = [], logs: string[] = [];
  for (const [id, actionClass] of [["first", "READ_ONLY"], ["second", "WRITE_HIGH"]] as const) {
    const log = join(base, `${id}.log`), server = { id, command: process.execPath, args: ["-e", SERVER, log], timeoutMs: 5_000 };
    const catalog = await discoverNativeMcpCatalog(server, workspace);
    const path = join(workspace, `${id}.json`);
    writeFileSync(path, JSON.stringify({ schemaVersion: 1, server, expectedCatalogDigest: catalog.digest, grants: [{ name: "lookup", actionClass }] }));
    writeFileSync(log, ""); paths.push(path); pins.push(sha256Hex(readFileSync(path))); logs.push(log);
  }
  const config = loadToolsConfig(workspace);
  initToolsConfig(workspace, { ...config, tools: { ...config.tools, allowedTools: [{ name: "tool_search", actionClass: "READ_ONLY" },
    { name: nativeMcpToolName("first", "lookup"), actionClass: "READ_ONLY" }, { name: nativeMcpToolName("second", "lookup"), actionClass: "WRITE_HIGH" }] } });
  const sdk = await import(pathToFileURL(resolve("dist/sdk/nativeAgentClient.js")).href) as typeof import("../src/sdk/nativeAgentClient.js");
  const Client = sdk.AMCNativeClient;
  const start = async () => {
    const client = await Client.start({ workspace, provider: "stub", tools: "workspace", approveTools: "READ_ONLY",
      mcpConfig: paths, mcpConfigSha256: pins, credentialsMode: "operator-only", credentialsHome: home, timeoutMs: 30_000,
      command: [process.execPath, cli], env: { HOME: home, AMC_VAULT_PASSPHRASE: pass, AMC_CONTROL_CHECKPOINT_DIR: controls } });
    clients.push(client); return client;
  };
  const received = () => logs.map(log => readFileSync(log, "utf8").split("\n").filter(Boolean));
  return { paths, pins, start, received, sdk, logs };
}

test("the SDK opens one session over several reviewed MCP servers, each actually mounted", async () => {
  const f = await fixture();
  const session = await (await f.start()).newSession();
  expect(session.sessionId).toBeTypeOf("string");
  for (const requests of f.received()) expect(requests).toEqual(expect.arrayContaining(["initialize", "tools/list"]));
}, 60_000);

// WP21d: the bound per-mount status, through the same projection /mcp shows.
test("the SDK reads each mounted server's status without its config content or secrets", async () => {
  const f = await fixture();
  const client = await f.start();
  const session = await client.newSession();
  const status = await client.mcpStatus(session.sessionId);
  expect(status).toMatchObject({ format: "amc-mcp-status-v1", refused: 0,
    servers: [{ serverId: "first", state: "registered", execution: "not-evaluated", auth: null, protocol: { serverInfo: { name: "sdk-fixture" } } },
      { serverId: "second", state: "registered", execution: "not-evaluated" }] });
  expect(status.servers?.map(server => server.toolNames)).toEqual([[nativeMcpToolName("first", "lookup")], [nativeMcpToolName("second", "lookup")]]);
  const wire = JSON.stringify(status);
  for (const secret of ["readline", "wp21c-sdk-mcp", "command", "args", "envRefs", ...f.logs]) expect(wire).not.toContain(secret);
  await expect(client.mcpStatus("not-owned")).rejects.toBeInstanceOf(f.sdk.AMCNativeInputError);
}, 60_000);

const unreviewed = (f: Awaited<ReturnType<typeof fixture>>) => {
  const config = JSON.parse(readFileSync(f.paths[1]!, "utf8")) as Record<string, unknown>;
  delete config.grants;
  writeFileSync(f.paths[1]!, JSON.stringify(config)); f.pins[1] = sha256Hex(readFileSync(f.paths[1]!));
};
test.each([
  ["tampered", "mcp-config-tampered", (f: Awaited<ReturnType<typeof fixture>>) => writeFileSync(f.paths[1]!, readFileSync(f.paths[1]!, "utf8") + "\n")],
  ["class-mismatched", "mcp-grant-class-mismatch", (f: Awaited<ReturnType<typeof fixture>>) => {
    writeFileSync(f.paths[1]!, readFileSync(f.paths[1]!, "utf8").replace("WRITE_HIGH", "READ_ONLY")); f.pins[1] = sha256Hex(readFileSync(f.paths[1]!));
  }],
  ["unreviewed", "mcp-config-unreviewed", unreviewed],
  ["duplicate", "mcp-config-duplicate", (f: Awaited<ReturnType<typeof fixture>>) => { f.paths[1] = f.paths[0]!; f.pins[1] = f.pins[0]!; }]
])("the SDK refuses a %s server before any reviewed server starts, with the runtime's reason", async (_case, reason, damage) => {
  const f = await fixture(); damage(f);
  const opened = (async () => (await f.start()).newSession())();
  // The runtime refuses at startup review and answers initialize with its coded refusal; never a session.
  const error = await opened.then(() => undefined, (failure: unknown) => failure);
  expect(error).toBeInstanceOf(f.sdk.AMCNativeStartupRefusedError);
  expect(error).toMatchObject({ reason, code: -32003, data: { reason } });
  for (const secret of ["readline", "wp21c-sdk-mcp", ...f.logs, ...f.pins]) expect((error as Error).message).not.toContain(secret);
  expect(f.received()).toEqual([[], []]);
}, 60_000);
