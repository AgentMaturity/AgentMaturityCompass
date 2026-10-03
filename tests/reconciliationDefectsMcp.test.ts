// AMC-1515: two defects in src/mcp/nativeMcpClient.ts, which is another
// session's uncommitted work and is not edited here. Each defect has a pinned
// observation of today's behaviour and a `test.fails` stating the intended
// property; when the patch in the S7 receipt lands, the `test.fails` cases turn
// red and must become ordinary tests. A genuine separate stdio JSON-RPC process
// plays the server; no network, provider or credential is involved.
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { agentToolset } from "../src/agent/agentToolset.js";
import { SessionService } from "../src/session/sessionService.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { discoverNativeMcpCatalog, mountNativeMcpServer, nativeMcpToolName } from "../src/mcp/nativeMcpClient.js";

// On tools/call the server can announce a catalog change BEFORE its result line.
const SERVER = String.raw`
const fs = require('node:fs');
const readline = require('node:readline');
const [statePath, logPath] = process.argv.slice(1);
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
readline.createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  let result = {};
  if (request.method === 'initialize') result = { protocolVersion: request.params.protocolVersion, capabilities: { tools: { listChanged: true } }, serverInfo: { name: 'fixture', version: '1' } };
  else if (request.method === 'tools/list') result = { tools: state.tools };
  else if (request.method === 'tools/call') {
    fs.appendFileSync(logPath, 'call\n');
    if (state.notifyOnCall) send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
    result = { content: [{ type: 'text', text: 'remote side effect committed' }] };
  }
  send({ jsonrpc: '2.0', id: request.id, result });
});
`;
const tool = { name: "lookup", description: "Synthetic lookup",
  inputSchema: { type: "object", properties: { query: { type: "string", minLength: 1 } }, required: ["query"], additionalProperties: false } };
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); vi.unstubAllEnvs(); });

async function mounted(notifyOnCall: boolean) {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "mcp-reconcile-fixture-passphrase");
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-reconcile-mcp-")));
  cleanups.push(async () => { rmSync(workspace, { recursive: true, force: true }); });
  const statePath = join(workspace, "state.json"), logPath = join(workspace, "calls.log");
  writeFileSync(statePath, JSON.stringify({ tools: [tool], notifyOnCall })); writeFileSync(logPath, "");
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(workspace, "default"); writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
  const name = nativeMcpToolName("fixture", "lookup"), config = loadToolsConfig(workspace);
  initToolsConfig(workspace, { ...config, tools: { ...config.tools, allowedTools: [...config.tools.allowedTools, { name, actionClass: "READ_ONLY" as const }] } });
  const session = new SessionService(workspace);
  session.open({ sessionId: "reconcile-mcp", agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
  session.startTurn({ trigger: "user" }); session.startStep();
  const tools = agentToolset({ workspace, agentId: "default", sessionId: session.sessionId, recorder: session });
  const server = { id: "fixture", command: process.execPath, args: ["-e", SERVER, statePath, logPath], timeoutMs: 2_000 };
  const reviewed = await discoverNativeMcpCatalog(server, workspace);
  const mount = await mountNativeMcpServer({ server, workspace, agentId: "default", toolset: tools,
    expectedCatalogDigest: reviewed.digest, grants: [{ name: "lookup", actionClass: "READ_ONLY" }] });
  cleanups.push(async () => {
    try { await mount.close(); } finally {
      tools.close();
      try { session.endStep({ stopReason: "end_turn", usage: null }); session.endTurn({ reason: "complete" }); session.sealTurn(); session.close({ reason: "completed" }); }
      finally { session.disposeWithoutClosing(); }
    }
  });
  const body = tools.registry.visible("default").get(name)!.body;
  return {
    remoteCalls: () => readFileSync(logPath, "utf8").split("\n").filter(Boolean).length,
    call: () => tools.seam.execute({ callId: "reconcile-call", toolName: name, rawArguments: JSON.stringify({ query: "fixture" }),
      sessionId: session.sessionId, turn: 1, step: 1, parentToken: null, dispatch: "native", signal: new AbortController().signal }),
    simulate: (args: Record<string, unknown>) => body({ agentId: "default", workspace, effectiveMode: "SIMULATE", arguments: args } as never)
  };
}

describe("AMC-1515 nativeMcpClient.ts:253 — a received result discarded after grant disposal", () => {
  test("observed today: the remote call ran but the refusal omits any execution notice", async () => {
    const fixture = await mounted(true);
    const outcome = await fixture.call();
    expect(fixture.remoteCalls()).toBe(1);
    expect(outcome.outcome).toBe("ERROR");
    expect(String(outcome.content)).toBe("MCP call failed or catalog changed; review and mount again");
  });
  test.fails("intended: a discarded received result says the remote tool executed and was not replayed", async () => {
    const fixture = await mounted(true);
    expect(String((await fixture.call()).content)).toMatch(/remote tool (?:may have )?executed/);
  });
});

describe("AMC-1515 nativeMcpClient.ts:235 — simulation precedes schema validation", () => {
  test("observed today: a non-EXECUTE run reports success for arguments EXECUTE would refuse", async () => {
    const fixture = await mounted(false);
    await expect(fixture.simulate({ query: 12 })).resolves.toMatchObject({ exitCode: 0, output: "MCP call simulated; the remote tool was not invoked." });
    expect(fixture.remoteCalls()).toBe(0);
  });
  test.fails("intended: simulation refuses arguments that the reviewed schema refuses", async () => {
    const fixture = await mounted(false);
    await expect(fixture.simulate({ query: 12 })).rejects.toThrow("MCP arguments do not match the reviewed tool schema");
  });
});
