// WP21d: the reviewed two-server MCP workspace tests/nativeSdkMcpServers.test.ts builds, for the Python SDK
// tests. Built from the same dist modules the CLI under test ships: node mcp_workspace_fixture.mjs <dist> <base>
// with AMC_VAULT_PASSPHRASE and AMC_CONTROL_CHECKPOINT_DIR set. Prints {workspace, home, paths, pins, logs}.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [dist, base] = process.argv.slice(2);
const load = path => import(pathToFileURL(join(dist, path)).href);
const { initWorkspace } = await load("workspace.js");
const { initBudgets } = await load("budgets/budgets.js");
const { writeRuntimeFirewallPolicy } = await load("runtime/firewall.js");
const { initToolsConfig, loadToolsConfig } = await load("toolhub/toolhubValidators.js");
const { discoverNativeMcpCatalog, nativeMcpToolName } = await load("mcp/nativeMcpClient.js");

const SERVER = String.raw`
const fs = require('node:fs');
require('node:readline').createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line); fs.appendFileSync(process.argv[1], request.method + '\n');
  if (request.id === undefined) return;
  const result = request.method === 'initialize' ? {protocolVersion:request.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'sdk-fixture',version:'1'}}
    : request.method === 'tools/list' ? {tools:[{name:'lookup',inputSchema:{type:'object',properties:{},additionalProperties:false}}]} : {};
  process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\n');
});`;
const workspace = join(base, "project"), home = join(base, "home");
mkdirSync(workspace); mkdirSync(home, { mode: 0o700 });
initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
initBudgets(workspace, "default"); writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
const paths = [], pins = [], logs = [];
for (const [id, actionClass] of [["first", "READ_ONLY"], ["second", "WRITE_HIGH"]]) {
  const log = join(base, `${id}.log`), server = { id, command: process.execPath, args: ["-e", SERVER, log], timeoutMs: 5_000 };
  const catalog = await discoverNativeMcpCatalog(server, workspace);
  const path = join(workspace, `${id}.json`);
  writeFileSync(path, JSON.stringify({ schemaVersion: 1, server, expectedCatalogDigest: catalog.digest, grants: [{ name: "lookup", actionClass }] }));
  writeFileSync(log, ""); paths.push(path); pins.push(createHash("sha256").update(readFileSync(path)).digest("hex")); logs.push(log);
}
const config = loadToolsConfig(workspace);
initToolsConfig(workspace, { ...config, tools: { ...config.tools, allowedTools: [{ name: "tool_search", actionClass: "READ_ONLY" },
  { name: nativeMcpToolName("first", "lookup"), actionClass: "READ_ONLY" }, { name: nativeMcpToolName("second", "lookup"), actionClass: "WRITE_HIGH" }] } });
process.stdout.write(JSON.stringify({ workspace, home, paths, pins, logs }));
