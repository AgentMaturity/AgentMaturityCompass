import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, expect, test, vi } from "vitest";
import { registerAcpCommands } from "../src/acp/acpCli.js";
import { startAcpStdio, type AcpStdioHandle, type AcpStdioInit } from "../src/acp/acpStdioMain.js";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import * as mcp from "../src/mcp/nativeMcpClient.js";
import { openLedger } from "../src/ledger/ledger.js";
import { sha256Hex } from "../src/utils/hash.js";
import { STUB_PROVIDER_ID } from "../src/agent/stubProvider.js";

// A separate process for each reviewed server. No provider, network or shared dist.
const SERVER = String.raw`
const readline = require('node:readline');
readline.createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  let result;
  if (request.method === 'initialize') result = {protocolVersion:request.params.protocolVersion, capabilities:{tools:{}}, serverInfo:{name:'acp-fixture',version:'1'}};
  else if (request.method === 'tools/list') result = {tools:[{name:'lookup',description:'Reviewed fixture',inputSchema:{type:'object',properties:{},additionalProperties:false}}]};
  else if (request.method === 'tools/call') result = {content:[{type:'text',text:'fixture result'}]};
  else result = {};
  process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\n');
});
`;
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  try { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); }
  finally { vi.restoreAllMocks(); vi.unstubAllEnvs(); }
});

async function fixture() {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "acp-mcp-composition-fixture");
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-acp-mcp-")));
  cleanups.push(async () => rmSync(workspace, { recursive: true, force: true }));
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", `${workspace}-controls`);
  cleanups.push(async () => rmSync(`${workspace}-controls`, { recursive: true, force: true }));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(workspace, "default");
  writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
  const servers = ["first", "second"].map(id => ({ id, command: process.execPath, args: ["-e", SERVER], timeoutMs: 2000 }));
  const paths: string[] = [], pins: string[] = [];
  for (const [index, server] of servers.entries()) {
    const catalog = await mcp.discoverNativeMcpCatalog(server, workspace);
    const path = join(workspace, `${server.id}.json`);
    writeFileSync(path, JSON.stringify({ schemaVersion: 1, server, expectedCatalogDigest: catalog.digest,
      grants: [{ name: "lookup", actionClass: index === 0 ? "READ_ONLY" : "WRITE_HIGH" }] }));
    paths.push(path); pins.push(sha256Hex(readFileSync(path)));
  }
  const config = loadToolsConfig(workspace);
  initToolsConfig(workspace, { ...config, tools: { ...config.tools, allowedTools: [
    { name: "tool_search", actionClass: "READ_ONLY" },
    { name: mcp.nativeMcpToolName("first", "lookup"), actionClass: "READ_ONLY" },
    { name: mcp.nativeMcpToolName("second", "lookup"), actionClass: "WRITE_HIGH" }
  ] } });
  return { workspace, paths, pins };
}

interface Frame { id?: number; result?: { sessionId?: string }; error?: { message?: string } }
function client(f: Awaited<ReturnType<typeof fixture>>, patch: Partial<AcpStdioInit> = {}) {
  const stdin = new EventEmitter();
  const frames: Frame[] = [];
  const handle: AcpStdioHandle = startAcpStdio({ workspace: f.workspace, agentId: "default", providerId: STUB_PROVIDER_ID,
    systemPrompt: "MCP fixture", tools: "workspace", approveTools: "READ_ONLY", mcpConfig: f.paths, mcpConfigSha256: f.pins,
    credentialsMode: "operator-only", credentialsHome: join(f.workspace, "empty-home"),
    stdin, stdout: { write: bytes => { frames.push(JSON.parse(bytes.toString("utf8")) as Frame); return true; } },
    stderr: { write: () => true }, ...patch });
  cleanups.push(() => handle.close());
  let id = 0;
  const call = async (method: string, params: unknown) => {
    const requestId = ++id;
    stdin.emit("data", Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }) + "\n"));
    await vi.waitFor(() => expect(frames.find(frame => frame.id === requestId)).toBeDefined(), { timeout: 15_000 });
    return frames.find(frame => frame.id === requestId)!;
  };
  return { handle, call, open: async () => {
    const initialized = await call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    expect(initialized.error).toBeUndefined();
    return call("session/new", { cwd: f.workspace, mcpServers: [] });
  } };
}

function identity(workspace: string, sessionId: string) {
  const ledger = openLedger(workspace);
  try {
    const row = ledger.getAllEvents().find(event => event.session_id === sessionId && event.event_type === "session/open");
    if (!row) throw new Error("Missing session/open");
    return JSON.parse(row.meta_json) as { compositionDigest: string; policyDigest: string };
  } finally { ledger.close(); }
}

test("ACP CLI retains each reviewed MCP path and its matching pin", async () => {
  const program = new Command();
  registerAcpCommands(program);
  const command = program.commands.find(candidate => candidate.name() === "acp")!;
  command.action(() => {});
  await program.parseAsync(["acp", "--mcp-config", "first.json", "--mcp-config", "second.json",
    "--mcp-config-sha256", "a".repeat(64), "--mcp-config-sha256", "b".repeat(64)], { from: "user" });
  expect(command.opts()).toMatchObject({ mcpConfig: ["first.json", "second.json"], mcpConfigSha256: ["a".repeat(64), "b".repeat(64)] });
});

test("ACP mounts several reviewed servers with each tool's signed class and closes all registrations", async () => {
  const f = await fixture();
  const mount = vi.spyOn(mcp, "mountNativeMcpServer");
  const c = client(f);
  const opened = await c.open();
  expect(opened.error).toBeUndefined();
  expect(opened.result?.sessionId).toBeTypeOf("string");
  expect(mount.mock.calls.map(([options]) => options.grants[0]?.actionClass)).toEqual(["READ_ONLY", "WRITE_HIGH"]);
  const firstTools = mount.mock.calls[0]![0].toolset;
  expect(firstTools.registry.visible("default").has(mcp.nativeMcpToolName("first", "lookup"))).toBe(true);
  expect(firstTools.registry.visible("default").has(mcp.nativeMcpToolName("second", "lookup"))).toBe(true);
  await c.handle.close();
  expect(firstTools.registry.visible("default").has(mcp.nativeMcpToolName("first", "lookup"))).toBe(false);
  expect(firstTools.registry.visible("default").has(mcp.nativeMcpToolName("second", "lookup"))).toBe(false);
}, 30_000);

test("ACP rechecks every pinned config before opening a session or starting any mount", async () => {
  const f = await fixture();
  const mount = vi.spyOn(mcp, "mountNativeMcpServer");
  const c = client(f);
  writeFileSync(f.paths[1]!, readFileSync(f.paths[1]!, "utf8") + "\n");
  const opened = await c.open();
  expect(opened.error).toBeDefined();
  expect(mount).not.toHaveBeenCalled();
  const ledger = openLedger(f.workspace);
  try { expect(ledger.getAllEvents().some(event => event.event_type === "session/open")).toBe(false); }
  finally { ledger.close(); }
}, 30_000);

test("ACP removes earlier registrations when a later reviewed mount refuses its catalog", async () => {
  const f = await fixture();
  const config = JSON.parse(readFileSync(f.paths[1]!, "utf8")) as Record<string, unknown>;
  writeFileSync(f.paths[1]!, JSON.stringify({ ...config, expectedCatalogDigest: "0".repeat(64) }));
  f.pins[1] = sha256Hex(readFileSync(f.paths[1]!));
  const mount = vi.spyOn(mcp, "mountNativeMcpServer");
  const c = client(f);
  const opened = await c.open();
  expect(opened.error).toBeDefined();
  expect(mount).toHaveBeenCalledTimes(2);
  const tools = mount.mock.calls[0]![0].toolset;
  expect(tools.registry.visible("default").has(mcp.nativeMcpToolName("first", "lookup"))).toBe(false);
  expect(tools.registry.visible("default").has(mcp.nativeMcpToolName("second", "lookup"))).toBe(false);
}, 30_000);

test("ACP composition and policy identities bind every config pin, and the scalar startup API still works", async () => {
  const f = await fixture();
  const first = client(f);
  const firstOpen = await first.open();
  expect(firstOpen.error).toBeUndefined();
  const before = identity(f.workspace, firstOpen.result!.sessionId!);
  await first.handle.close();
  writeFileSync(f.paths[1]!, readFileSync(f.paths[1]!, "utf8") + "\n");
  f.pins[1] = sha256Hex(readFileSync(f.paths[1]!));
  const second = client(f);
  const secondOpen = await second.open();
  expect(secondOpen.error).toBeUndefined();
  const after = identity(f.workspace, secondOpen.result!.sessionId!);
  expect(after.compositionDigest).not.toBe(before.compositionDigest);
  expect(after.policyDigest).not.toBe(before.policyDigest);
  await second.handle.close();
  const scalar = client(f, { mcpConfig: f.paths[0], mcpConfigSha256: f.pins[0] });
  expect((await scalar.open()).error).toBeUndefined();
}, 30_000);
