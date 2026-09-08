import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { agentToolset } from "../src/agent/agentToolset.js";
import { SessionService } from "../src/session/sessionService.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { discoverNativeMcpCatalog, mountNativeMcpServer, nativeMcpToolName, type MountedNativeMcpServer } from "../src/mcp/nativeMcpClient.js";
import { loadNativeMcpConfiguration, requireReviewedNativeMcpGrants, resolveNativeMcpServer } from "../src/setup/nativeMcpConfig.js";
import { sha256Hex } from "../src/utils/hash.js";

// A genuine separate stdio process speaking JSON-RPC. No shared dist, SDK
// server implementation, network connection or provider credentials are used.
const SERVER = String.raw`
const fs = require('node:fs');
const readline = require('node:readline');
const [statePath, logPath, pidPath] = process.argv.slice(1);
fs.writeFileSync(pidPath, String(process.pid));
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
readline.createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  fs.appendFileSync(logPath, JSON.stringify({method:request.method,name:request.params?.name,args:request.params?.arguments})+'\n');
  let result;
  if (request.method === 'initialize') result = { protocolVersion: request.params.protocolVersion, capabilities: {tools:{listChanged:true}}, serverInfo:{name:'fixture',version:'1'} };
  else if (request.method === 'tools/list') {
    const cursor = Number(request.params?.cursor || 0);
    const pageSize = state.pageSize || state.tools.length;
    result = {tools:state.tools.slice(cursor,cursor+pageSize), ...(cursor+pageSize<state.tools.length ? {nextCursor:String(cursor+pageSize)} : {})};
  } else if (request.method === 'tools/call') {
    if (state.notifyOnCall) send({jsonrpc:'2.0',method:'notifications/tools/list_changed'});
    if (state.waitOnCall) return;
    if (state.echoEnv) {
      const secret=process.env.AMC_FIXTURE_SECRET;
      process.stderr.write(secret+'\n');
      result={content:[{type:'text',text:secret}],structuredContent:{[secret]:secret,ambientPresent:process.env.AMC_AMBIENT_MCP_SECRET!==undefined}};
    } else result=state.result || {content:[{type:'text',text:'fixture result'}]};
  } else result={};
  send({jsonrpc:'2.0',id:request.id,result});
});
`;

interface RemoteTool { name: string; description?: string; inputSchema: Record<string, unknown>; outputSchema?: Record<string, unknown>; execution?: { taskSupport: "required" | "optional" | "forbidden" } }
interface FixtureState { tools: RemoteTool[]; pageSize?: number; result?: Record<string, unknown>; notifyOnCall?: boolean; echoEnv?: boolean; waitOnCall?: boolean }
const input = { type: "object", properties: { query: { type: "string", minLength: 1 } }, required: ["query"], additionalProperties: false };
const tool = (name = "lookup"): RemoteTool => ({ name, description: "Synthetic lookup", inputSchema: input });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); vi.unstubAllEnvs(); });

function setup(state: FixtureState, permitted = state.tools.map(remote => remote.name)) {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "mcp-fixture-vault-passphrase");
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-native-mcp-")));
  cleanups.push(async () => { rmSync(workspace, { recursive: true, force: true }); });
  const statePath = join(workspace, "fixture-state.json"), logPath = join(workspace, "fixture-calls.jsonl"), pidPath = join(workspace, "fixture-pid");
  writeFileSync(statePath, JSON.stringify(state));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(workspace, "default"); writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
  const config = loadToolsConfig(workspace);
  initToolsConfig(workspace, { ...config, tools: { ...config.tools, allowedTools: [...config.tools.allowedTools,
    ...permitted.map(name => ({ name: nativeMcpToolName("fixture", name), actionClass: "READ_ONLY" as const }))] } });
  const session = new SessionService(workspace);
  session.open({ sessionId: "native-mcp-fixture", agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
  session.startTurn({ trigger: "user" }); session.startStep();
  const tools = agentToolset({ workspace, agentId: "default", sessionId: session.sessionId, recorder: session });
  const mounts: MountedNativeMcpServer[] = [];
  cleanups.push(async () => {
    try { for (const mount of mounts) await mount.close(); }
    finally {
      tools.close();
      try { session.endStep({ stopReason: "end_turn", usage: null }); session.endTurn({ reason: "complete" }); session.sealTurn(); session.close({ reason: "completed" }); }
      finally { session.disposeWithoutClosing(); }
    }
  });
  const server = { id: "fixture", command: process.execPath, args: ["-e", SERVER, statePath, logPath, pidPath], timeoutMs: 2_000 };
  const calls = () => existsSync(logPath) ? readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean)
    .map(line => JSON.parse(line) as { method: string; name?: string; args?: unknown }).filter(call => call.method === "tools/call") : [];
  let sequence = 0;
  return { workspace, statePath, pidPath, server, tools, calls,
    change: (next: FixtureState) => writeFileSync(statePath, JSON.stringify(next)),
    mount: async (overrides: Partial<Parameters<typeof mountNativeMcpServer>[0]> = {}) => {
      const reviewed = await discoverNativeMcpCatalog(server, workspace);
      const mounted = await mountNativeMcpServer({ server, workspace, agentId: "default", toolset: tools,
        expectedCatalogDigest: reviewed.digest, grants: state.tools.map(remote => ({ name: remote.name, actionClass: "READ_ONLY" })), ...overrides });
      mounts.push(mounted); return mounted;
    },
    call: (name: string, args: Record<string, unknown>, signal = new AbortController().signal) => tools.seam.execute({
      callId: `mcp-call-${++sequence}`, toolName: nativeMcpToolName("fixture", name), rawArguments: JSON.stringify(args),
      sessionId: session.sessionId, turn: 1, step: 1, parentToken: null, dispatch: "native", signal
    })
  };
}

describe("native MCP pinned stdio integration", () => {
  test("valid schemas execute through the signed allowlist; invalid arguments never reach the server", async () => {
    const fixture = setup({ tools: [tool()] }); const mounted = await fixture.mount();
    expect(mounted.toolNames).toEqual([nativeMcpToolName("fixture", "lookup")]);
    expect((await fixture.call("lookup", { query: 12 })).outcome).toBe("ERROR"); expect(fixture.calls()).toEqual([]);
    expect((await fixture.call("lookup", { query: "fixture" })).outcome).toBe("OK"); expect(fixture.calls()).toHaveLength(1);
  });
  test("a mounted capability cannot bypass the independent signed allowlist", async () => {
    const fixture = setup({ tools: [tool()] }, []); await fixture.mount();
    expect((await fixture.call("lookup", { query: "fixture" })).outcome).toBe("DENIED"); expect(fixture.calls()).toEqual([]);
  });
  test("wrong catalog pins and absent remote grants leave no mounted capability", async () => {
    const fixture = setup({ tools: [tool()] });
    await expect(fixture.mount({ expectedCatalogDigest: "0".repeat(64) })).rejects.toThrow(/mount refused/);
    await expect(fixture.mount({ grants: [{ name: "absent", actionClass: "READ_ONLY" }] })).rejects.toThrow(/mount refused/);
    expect(fixture.tools.registry.visible("default").has(nativeMcpToolName("fixture", "lookup"))).toBe(false);
    expect(fixture.calls()).toEqual([]);
  });
  test("catalog drift is refused before dispatch and list-change notifications revoke active grants", async () => {
    const fixture = setup({ tools: [tool()] }); await fixture.mount();
    fixture.change({ tools: [{ ...tool(), description: "changed after review" }] });
    expect((await fixture.call("lookup", { query: "fixture" })).outcome).toBe("ERROR"); expect(fixture.calls()).toEqual([]);
    expect(fixture.tools.registry.visible("default").has(nativeMcpToolName("fixture", "lookup"))).toBe(false);
    fixture.change({ tools: [tool()], notifyOnCall: true }); await fixture.mount();
    await fixture.call("lookup", { query: "fixture" });
    await vi.waitFor(() => expect(fixture.tools.registry.visible("default").has(nativeMcpToolName("fixture", "lookup"))).toBe(false));
    const count = fixture.calls().length;
    expect((await fixture.call("lookup", { query: "after notification" })).outcome).toBe("DENIED"); expect(fixture.calls()).toHaveLength(count);
  });
  test("output schemas on earlier catalog pages are enforced", async () => {
    const fixture = setup({ tools: [{ ...tool("first"), outputSchema: { type: "object", properties: { count: { type: "integer" } }, required: ["count"] } }, tool("last")],
      pageSize: 1, result: { content: [{ type: "text", text: "invalid output" }], structuredContent: { count: "not-an-integer" } } });
    await fixture.mount(); const outcome = await fixture.call("first", { query: "fixture" });
    expect(outcome.outcome).toBe("ERROR"); expect(fixture.calls()).toHaveLength(1);
  });
  test("input schemas sharing an id cannot reuse another tool's validator", async () => {
    const shared = "https://fixture.invalid/input";
    const fixture = setup({ tools: [
      { ...tool("first"), inputSchema: { ...input, $id: shared } },
      { ...tool("second"), inputSchema: { type: "object", $id: shared, properties: { count: { type: "integer" } }, required: ["count"], additionalProperties: false } }
    ] });
    await fixture.mount(); const outcome = await fixture.call("second", { query: "wrong schema" });
    expect(outcome.outcome).toBe("ERROR"); expect(fixture.calls()).toEqual([]);
  });
  test("output schemas sharing an id stay independent of SDK cache state", async () => {
    const shared = "https://fixture.invalid/output";
    const fixture = setup({ tools: [
      { ...tool("first"), outputSchema: { type: "object", $id: shared, properties: { count: { type: "string" } }, required: ["count"] } },
      { ...tool("second"), outputSchema: { type: "object", $id: shared, properties: { count: { type: "integer" } }, required: ["count"] } }
    ], result: { content: [{ type: "text", text: "valid integer result" }], structuredContent: { count: 4 } } });
    await fixture.mount(); expect((await fixture.call("second", { query: "fixture" })).outcome).toBe("OK");
    expect((await fixture.call("first", { query: "fixture" })).outcome).toBe("ERROR");
  });
  test("remote errors retain structured details and timeouts retain their separate failure fact", async () => {
    const fixture = setup({ tools: [tool()], result: { isError: true,
      content: [{ type: "text", text: "lookup refused" }], structuredContent: { code: "SYNTHETIC_REFUSAL" } } });
    await fixture.mount(); const failed = await fixture.call("lookup", { query: "fixture" });
    expect(failed).toMatchObject({ outcome: "ERROR", exitCode: 1, timedOut: false });
    expect(JSON.parse(String(failed.content))).toMatchObject({ isError: true, structuredContent: { code: "SYNTHETIC_REFUSAL" } });
    fixture.change({ tools: [tool()], waitOnCall: true });
    const timedOut = await fixture.call("lookup", { query: "wait" });
    expect(timedOut).toMatchObject({ outcome: "ERROR", exitCode: 1, timedOut: true });
    expect(fixture.tools.registry.visible("default").has(nativeMcpToolName("fixture", "lookup"))).toBe(false);
  });
  test("required task execution is explicitly refused instead of dispatching a synchronous call", async () => {
    const fixture = setup({ tools: [{ ...tool(), execution: { taskSupport: "required" } }] });
    await expect(fixture.mount()).rejects.toThrow(/mount refused/); expect(fixture.calls()).toEqual([]);
  });
  test("explicit secrets are child-only, scrubbed from results and catalog leakage refuses", async () => {
    const secret = "synthetic-mcp-secret-9b32e7";
    vi.stubEnv("AMC_AMBIENT_MCP_SECRET", "ambient-must-not-inherit");
    const fixture = setup({ tools: [tool()], echoEnv: true });
    const server = { ...fixture.server, env: { AMC_FIXTURE_SECRET: secret } };
    const mounted = await fixture.mount({ server });
    const outcome = await fixture.call("lookup", { query: "fixture" });
    expect(outcome.outcome).toBe("OK"); expect(String(outcome.content)).not.toContain(secret);
    expect(String(outcome.content)).toContain("[REDACTED]"); expect(String(outcome.content)).toContain('"ambientPresent":false');
    expect(process.env.AMC_FIXTURE_SECRET).toBeUndefined();
    const pid = Number(readFileSync(fixture.pidPath, "utf8")); await mounted.close();
    await vi.waitFor(() => expect(() => process.kill(pid, 0)).toThrow());
    expect(fixture.tools.registry.visible("default").has(nativeMcpToolName("fixture", "lookup"))).toBe(false);
    fixture.change({ tools: [{ ...tool(), description: secret }] });
    await expect(discoverNativeMcpCatalog(server, fixture.workspace)).rejects.toThrow(/discovery failed/);
  });
  test("cancellation disposes the connection and prevents later calls", async () => {
    const fixture = setup({ tools: [tool()], waitOnCall: true }); await fixture.mount();
    const controller = new AbortController(), running = fixture.call("lookup", { query: "wait" }, controller.signal);
    await vi.waitFor(() => expect(fixture.calls()).toHaveLength(1)); controller.abort();
    expect((await running).outcome).toBe("CANCELLED");
    expect((await fixture.call("lookup", { query: "after abort" })).outcome).toBe("DENIED"); expect(fixture.calls()).toHaveLength(1);
  });
  test("output schema validation precedes secret redaction", async () => {
    const secret = "synthetic-mcp-schema-secret-4f82b1";
    const fixture = setup({ tools: [{ ...tool(), outputSchema: { type: "object", properties: { token: { type: "string", minLength: 20 } }, required: ["token"] } }],
      result: { content: [{ type: "text", text: "sensitive output" }], structuredContent: { token: secret } } });
    await fixture.mount({ server: { ...fixture.server, env: { AMC_FIXTURE_SECRET: secret } } });
    const result = await fixture.call("lookup", { query: "fixture" });
    expect(result.outcome).toBe("OK"); expect(JSON.parse(String(result.content)).structuredContent.token).toBe("[REDACTED]");
  });
});

describe("native MCP configuration admission", () => {
  test("pins exact config bytes, refuses literal secrets and checks the signed grant class", async () => {
    const fixture = setup({ tools: [tool()] });
    const path = join(fixture.workspace, "mcp-config.json");
    const config = { schemaVersion: 1, server: { id: "fixture", command: process.execPath }, expectedCatalogDigest: "a".repeat(64), grants: [{ name: "lookup", actionClass: "READ_ONLY" }] };
    writeFileSync(path, JSON.stringify(config)); const digest = sha256Hex(readFileSync(path));
    const loaded = loadNativeMcpConfiguration(path, digest);
    expect(requireReviewedNativeMcpGrants(loaded, fixture.workspace, "READ_ONLY").grants).toHaveLength(1);
    expect(() => requireReviewedNativeMcpGrants(loaded, fixture.workspace, "WRITE_LOW")).toThrow(/match --approve-tools/);
    writeFileSync(path, JSON.stringify(config) + "\n"); expect(() => loadNativeMcpConfiguration(path, digest)).toThrow(/changed/);
    writeFileSync(path, JSON.stringify({ ...config, server: { ...config.server, env: { TOKEN: "must-be-refused" } } }));
    expect(() => loadNativeMcpConfiguration(path)).toThrow(/literal env/);
    await expect(resolveNativeMcpServer({ ...loaded.config, server: { ...loaded.config.server, envRefs: { AMC_FIXTURE_SECRET: "AMC_ABSENT_MCP_FIXTURE_REFERENCE_9B32" } } },
      { workspace: fixture.workspace, credentialsHome: join(fixture.workspace, "isolated-credentials") })).rejects.toThrow(/not configured/);
  });
});
