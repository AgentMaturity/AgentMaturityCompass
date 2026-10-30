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
  const { AMCNativeClient: Client } = await import(pathToFileURL(resolve("dist/sdk/nativeAgentClient.js")).href) as typeof import("../src/sdk/nativeAgentClient.js");
  const start = async () => {
    const client = await Client.start({ workspace, provider: "stub", tools: "workspace", approveTools: "READ_ONLY",
      mcpConfig: paths, mcpConfigSha256: pins, credentialsMode: "operator-only", credentialsHome: home, timeoutMs: 30_000,
      command: [process.execPath, cli], env: { HOME: home, AMC_VAULT_PASSPHRASE: pass, AMC_CONTROL_CHECKPOINT_DIR: controls } });
    clients.push(client); return client;
  };
  const received = () => logs.map(log => readFileSync(log, "utf8").split("\n").filter(Boolean));
  return { paths, pins, start, received };
}

test("the SDK opens one session over several reviewed MCP servers, each actually mounted", async () => {
  const f = await fixture();
  const session = await (await f.start()).newSession();
  expect(session.sessionId).toBeTypeOf("string");
  for (const requests of f.received()) expect(requests).toEqual(expect.arrayContaining(["initialize", "tools/list"]));
}, 60_000);

test.each([
  ["tampered", (f: Awaited<ReturnType<typeof fixture>>) => writeFileSync(f.paths[1]!, readFileSync(f.paths[1]!, "utf8") + "\n")],
  ["unreviewed", (f: Awaited<ReturnType<typeof fixture>>) => {
    writeFileSync(f.paths[1]!, readFileSync(f.paths[1]!, "utf8").replace("WRITE_HIGH", "READ_ONLY")); f.pins[1] = sha256Hex(readFileSync(f.paths[1]!));
  }]
])("the SDK refuses a %s server before any reviewed server starts", async (_case, damage) => {
  const f = await fixture(); damage(f);
  const opened = (async () => (await f.start()).newSession())();
  // The runtime refuses at startup review; the SDK surfaces it as a failed start, never a session.
  await expect(opened).rejects.toThrow();
  expect(f.received()).toEqual([[], []]);
}, 60_000);
