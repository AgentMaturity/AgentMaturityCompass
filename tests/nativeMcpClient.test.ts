import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, test, vi } from "vitest";
import { registerAgentCommands } from "../src/cli-agent-commands.js";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { agentToolset, checkToolsetReadiness } from "../src/agent/agentToolset.js";
import { SessionService } from "../src/session/sessionService.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { NATIVE_MCP_DIAGNOSTICS_BYTES, discoverNativeMcpCatalog, mountNativeMcpServer, nativeMcpFailureDiagnostics, nativeMcpToolName, type MountedNativeMcpServer } from "../src/mcp/nativeMcpClient.js";
import { loadNativeMcpConfiguration, requireReviewedNativeMcpGrants, resolveNativeMcpServer } from "../src/setup/nativeMcpConfig.js";
import { sha256Hex } from "../src/utils/hash.js";
import { openActionJournal } from "../src/actions/actionJournal.js";
import { initProcessorRegistry } from "../src/dataflow/processorRegistry.js";

// A genuine separate stdio process speaking JSON-RPC. No shared dist, SDK
// server implementation, network connection or provider credentials are used.
const SERVER = String.raw`
const fs = require('node:fs');
const readline = require('node:readline');
const [statePath, logPath, pidPath] = process.argv.slice(1);
fs.writeFileSync(pidPath, String(process.pid));
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
const boot = JSON.parse(fs.readFileSync(statePath, 'utf8'));
if (boot.stderrAndExit) process.stderr.write(boot.stderrAndExit, () => process.exit(3));
if (boot.grandchildPidPath) {
  // Not detached: the grandchild joins the server's own process group, as a wrapper's child would.
  const child = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  fs.writeFileSync(boot.grandchildPidPath, String(child.pid));
}
if (!boot.stderrAndExit) readline.createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  fs.appendFileSync(logPath, JSON.stringify({method:request.method,name:request.params?.name,args:request.params?.arguments})+'\n');
  let result;
  if (request.method === 'initialize') result = { protocolVersion: request.params.protocolVersion, capabilities: {tools:{listChanged:true}}, serverInfo:{name:'fixture',version:'1'}, ...(state.instructions ? {instructions: state.instructions} : {}) };
  else if (request.method === 'tools/list') {
    const cursor = Number(request.params?.cursor || 0);
    const pageSize = state.pageSize || state.tools.length;
    result = {tools:state.tools.slice(cursor,cursor+pageSize), ...(cursor+pageSize<state.tools.length ? {nextCursor:String(cursor+pageSize)} : {})};
  } else if (request.method === 'tools/call') {
    if (state.notifyOnCall) send({jsonrpc:'2.0',method:'notifications/tools/list_changed'});
    if (state.waitOnCall || state.waitFor === request.params.name) return;
    if (state.lateFor === request.params.name) {
      const token = request.params._meta && request.params._meta.progressToken;
      setTimeout(() => { send({jsonrpc:'2.0',method:'notifications/progress',params:{progressToken:token,progress:1}});
        send({jsonrpc:'2.0',id:request.id,result:{content:[{type:'text',text:'late'}]}}); }, state.lateMs);
      return;
    }
    if (state.progress) {
      const token = request.params._meta && request.params._meta.progressToken;
      let sent = 0;
      const timer = setInterval(() => {
        if (sent < state.progress.count) { send({jsonrpc:'2.0',method:'notifications/progress',params:{progressToken:token,progress:++sent}}); return; }
        clearInterval(timer); send({jsonrpc:'2.0',id:request.id,result:{content:[{type:'text',text:'long result'}]}});
      }, state.progress.intervalMs);
      return;
    }
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
interface FixtureState { tools: RemoteTool[]; pageSize?: number; result?: Record<string, unknown>; notifyOnCall?: boolean; echoEnv?: boolean; waitOnCall?: boolean;
  waitFor?: string; lateFor?: string; lateMs?: number; progress?: { count: number; intervalMs: number }; stderrAndExit?: string; grandchildPidPath?: string; instructions?: string }
const input = { type: "object", properties: { query: { type: "string", minLength: 1 } }, required: ["query"], additionalProperties: false };
const tool = (name = "lookup"): RemoteTool => ({ name, description: "Synthetic lookup", inputSchema: input });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); vi.unstubAllEnvs(); });

function setup(state: FixtureState, permitted = state.tools.map(remote => remote.name), actionClass: "READ_ONLY" | "WRITE_HIGH" = "READ_ONLY") {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "mcp-fixture-vault-passphrase");
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-native-mcp-")));
  cleanups.push(async () => { rmSync(workspace, { recursive: true, force: true }); });
  const statePath = join(workspace, "fixture-state.json"), logPath = join(workspace, "fixture-calls.jsonl"), pidPath = join(workspace, "fixture-pid");
  writeFileSync(statePath, JSON.stringify(state));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(workspace, "default"); writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
  const config = loadToolsConfig(workspace);
  initToolsConfig(workspace, { ...config, tools: { ...config.tools, allowedTools: [...config.tools.allowedTools,
    { name: "tool_search", actionClass: "READ_ONLY" as const }, ...permitted.map(name => ({ name: nativeMcpToolName("fixture", name), actionClass }))] } });
  const session = new SessionService(workspace);
  session.open({ sessionId: "native-mcp-fixture", agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
  session.startTurn({ trigger: "user" }); session.startStep();
  const tools = agentToolset({ workspace, agentId: "default", sessionId: session.sessionId, recorder: session,
    additionalCapabilities: permitted.map(name => ({ name: nativeMcpToolName("fixture", name), actionClass })) });
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
        expectedCatalogDigest: reviewed.digest, grants: state.tools.map(remote => ({ name: remote.name, actionClass })), ...overrides });
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
    // The result arrived and was discarded: the remote tool ran, so its outcome is typed unknown, not an error.
    expect(outcome.outcome).toBe("TOOL_OUTCOME_UNKNOWN"); expect(fixture.calls()).toHaveLength(1);
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
    expect((await fixture.call("first", { query: "fixture" })).outcome).toBe("TOOL_OUTCOME_UNKNOWN");
  });
  test("remote errors retain structured details and timeouts retain their separate failure fact", async () => {
    const fixture = setup({ tools: [tool()], result: { isError: true,
      content: [{ type: "text", text: "lookup refused" }], structuredContent: { code: "SYNTHETIC_REFUSAL" } } });
    await fixture.mount(); const failed = await fixture.call("lookup", { query: "fixture" });
    expect(failed).toMatchObject({ outcome: "ERROR", exitCode: 1, timedOut: false });
    expect(JSON.parse(String(failed.content))).toMatchObject({ isError: true, structuredContent: { code: "SYNTHETIC_REFUSAL" } });
    fixture.change({ tools: [tool()], waitOnCall: true });
    const timedOut = await fixture.call("lookup", { query: "wait" });
    expect(timedOut).toMatchObject({ outcome: "TOOL_OUTCOME_UNKNOWN", exitCode: 1, timedOut: true });
    expect(String(timedOut.content)).toContain("may have executed");
    // PXB-02: a request timeout cancels that request only; the reviewed mount stays.
    expect(fixture.tools.registry.visible("default").has(nativeMcpToolName("fixture", "lookup"))).toBe(true);
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
  test("a call's cancellation ends that request only; the mount signal disposes the connection and prevents later calls", async () => {
    const fixture = setup({ tools: [tool()], waitOnCall: true });
    const mountAbort = new AbortController(); await fixture.mount({ signal: mountAbort.signal });
    const controller = new AbortController(), running = fixture.call("lookup", { query: "wait" }, controller.signal);
    await vi.waitFor(() => expect(fixture.calls()).toHaveLength(1)); controller.abort();
    expect((await running).outcome).toBe("CANCELLED");
    fixture.change({ tools: [tool()] });
    expect((await fixture.call("lookup", { query: "after request abort" })).outcome).toBe("OK"); expect(fixture.calls()).toHaveLength(2);
    mountAbort.abort();
    await vi.waitFor(() => expect(fixture.tools.registry.visible("default").has(nativeMcpToolName("fixture", "lookup"))).toBe(false));
    expect((await fixture.call("lookup", { query: "after mount abort" })).outcome).toBe("DENIED"); expect(fixture.calls()).toHaveLength(2);
  });
  test.each([
    ["a tools/call that never answers", { waitOnCall: true }],
    ["a result the output schema discards", { result: { content: [{ type: "text", text: "invalid output" }], structuredContent: { count: "not-an-integer" } } }]
  ] as const)("a journaled WRITE_HIGH call after %s is outcome_unknown and blocks an identical re-dispatch", async (_case, behaviour) => {
    const fixture = setup({ tools: [{ ...tool(), outputSchema: { type: "object", properties: { count: { type: "integer" } }, required: ["count"] } }],
      ...behaviour }, undefined, "WRITE_HIGH");
    await fixture.mount();
    const first = await fixture.call("lookup", { query: "fixture" });
    expect(first.outcome).toBe("TOOL_OUTCOME_UNKNOWN"); expect(fixture.calls()).toHaveLength(1);
    const journal = openActionJournal(fixture.workspace);
    let blocking: string[] = [];
    try {
      blocking = journal.blockingExecutions({ workspaceId: journal.workspaceId, agentId: "default" });
      expect(blocking.map(id => journal.get(id)?.state)).toEqual(["outcome_unknown"]);
    } finally { journal.close(); }
    // A timeout keeps the mount (PXB-02); a discarded result disposed it, so mount afresh. Either way the same call must
    // not dispatch again: the unknown execution blocks this agent's journaled calls first (blocked_by_unreconciled).
    if (!fixture.tools.registry.visible("default").has(nativeMcpToolName("fixture", "lookup"))) await fixture.mount();
    const second = await fixture.call("lookup", { query: "fixture" });
    expect(second.outcome).toBe("DENIED"); expect(String(second.content)).toContain(`blocked_by_unreconciled:${blocking[0]}`);
    expect(fixture.calls()).toHaveLength(1);
  });
  test("P2-02: a stdio call carrying a token has no destination to restore to, so it is refused before tools/call", async () => {
    const fixture = setup({ tools: [tool()] }, undefined, "WRITE_HIGH");
    // A bound record whose purpose is the signed run purpose: the refusal is the missing destination, not the purpose.
    initProcessorRegistry(fixture.workspace, { schemaVersion: "amc.dataflow-processors/v1", experimental: true,
      processors: [{ processorId: "proc-chart", legalName: "Fixture Chart Processor",
        contracts: [{ kind: "BAA", reference: "BAA-CHART-1", effective: "2026-01-01", expires: null, dataClasses: ["phi"] }] }],
      purposes: [{ purposeId: "chart-lookup", allowedDataClasses: ["phi"], allowedTools: [nativeMcpToolName("fixture", "lookup")],
        allowedProcessors: ["proc-chart"] }],
      bindings: [], runPurpose: "chart-lookup" });
    await fixture.mount();
    const refused = await fixture.call("lookup", { query: "[[amc:phi:0123456789abcdef]]" });
    expect(refused).toMatchObject({ outcome: "ERROR", content: "Protected data egress refused: processor_not_allowlisted" });
    expect(fixture.calls(), "the stdio log shows no tools/call").toEqual([]);
    expect((await fixture.call("lookup", { query: "fixture" })).outcome).toBe("OK");
    expect(fixture.calls()).toHaveLength(1);
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

describe("WP41 native MCP mount lifecycle", () => {
  test("PXB-01: progress notifications renew the inactivity timeout so a call longer than timeoutMs completes", async () => {
    const fixture = setup({ tools: [tool()], progress: { count: 6, intervalMs: 300 } });
    const server = { ...fixture.server, timeoutMs: 800 };
    const reviewed = await discoverNativeMcpCatalog(server, fixture.workspace);
    await fixture.mount({ server, expectedCatalogDigest: reviewed.digest });
    const started = Date.now();
    const outcome = await fixture.call("lookup", { query: "long" });
    expect(Date.now() - started).toBeGreaterThan(800);
    expect(outcome).toMatchObject({ outcome: "OK", timedOut: false });
    expect(JSON.parse(String(outcome.content))).toMatchObject({ content: [{ type: "text", text: "long result" }], amcProgressNotifications: 6 });
  });
  test("PXB-01: maxTotalMs still bounds a call that keeps reporting progress", async () => {
    const fixture = setup({ tools: [tool()], progress: { count: 20, intervalMs: 200 } });
    const server = { ...fixture.server, timeoutMs: 500, maxTotalMs: 1_000 };
    const reviewed = await discoverNativeMcpCatalog(server, fixture.workspace);
    await fixture.mount({ server, expectedCatalogDigest: reviewed.digest });
    expect(await fixture.call("lookup", { query: "long" })).toMatchObject({ outcome: "TOOL_OUTCOME_UNKNOWN", timedOut: true });
  });
  test("PXB-02: a timed-out call leaves sibling tools on the same mount usable", async () => {
    const fixture = setup({ tools: [tool("slow"), tool("fast")], waitFor: "slow" });
    const server = { ...fixture.server, timeoutMs: 500 };
    const reviewed = await discoverNativeMcpCatalog(server, fixture.workspace);
    const mounted = await fixture.mount({ server, expectedCatalogDigest: reviewed.digest });
    const pid = Number(readFileSync(fixture.pidPath, "utf8"));
    const slow = await fixture.call("slow", { query: "wait" });
    expect(slow).toMatchObject({ outcome: "TOOL_OUTCOME_UNKNOWN", timedOut: true });
    expect(String(slow.content)).toContain("mount remains active");
    expect(String(slow.content)).toContain("may have executed");
    expect(await fixture.call("fast", { query: "sibling" })).toMatchObject({ outcome: "OK" });
    expect(fixture.calls().map(call => call.name)).toEqual(["slow", "fast"]);
    expect(mounted.toolNames.every(name => fixture.tools.registry.visible("default").has(name))).toBe(true);
    expect(() => process.kill(pid, 0)).not.toThrow();
  });
  test("PXB-02: a late response and progress for a cancelled request do not tear down the mount", async () => {
    const fixture = setup({ tools: [tool("slow"), tool("fast")], lateFor: "slow", lateMs: 900 });
    const server = { ...fixture.server, timeoutMs: 400, maxTotalMs: 400 };
    const reviewed = await discoverNativeMcpCatalog(server, fixture.workspace);
    await fixture.mount({ server, expectedCatalogDigest: reviewed.digest });
    expect(await fixture.call("slow", { query: "late" })).toMatchObject({ outcome: "TOOL_OUTCOME_UNKNOWN", timedOut: true });
    await new Promise(resolve => setTimeout(resolve, 900));
    expect(fixture.tools.registry.visible("default").has(nativeMcpToolName("fixture", "fast"))).toBe(true);
    expect(await fixture.call("fast", { query: "after late echo" })).toMatchObject({ outcome: "OK" });
  });
  test.skipIf(process.platform === "win32")("PXB-03: closing a stdio mount terminates the server's grandchild", async () => {
    const fixture = setup({ tools: [tool()] });
    const grandchildPidPath = join(fixture.workspace, "grandchild-pid");
    fixture.change({ tools: [tool()], grandchildPidPath });
    const mounted = await fixture.mount();
    await vi.waitFor(() => expect(existsSync(grandchildPidPath)).toBe(true));
    const grandchild = Number(readFileSync(grandchildPidPath, "utf8"));
    expect(() => process.kill(grandchild, 0)).not.toThrow();
    await mounted.close();
    expect(() => process.kill(grandchild, 0)).toThrow();
  });
  test("PXB-04: a failing server's stderr tail is available to the operator, redacted and bounded; the refusal is unchanged", async () => {
    const secret = "synthetic-mcp-stderr-secret-77c1d0";
    const fixture = setup({ tools: [tool()], stderrAndExit: "x".repeat(40 * 1024) + "\nboot failed with " + secret + "\n" });
    const server = { ...fixture.server, env: { AMC_FIXTURE_SECRET: secret } };
    const failure = await discoverNativeMcpCatalog(server, fixture.workspace).then(() => null, (error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("MCP catalog discovery failed; no tool grant was created");
    const tail = nativeMcpFailureDiagnostics(failure);
    expect(tail).toContain("boot failed with [REDACTED]");
    expect(tail).not.toContain(secret);
    expect(Buffer.byteLength(tail ?? "")).toBeLessThanOrEqual(NATIVE_MCP_DIAGNOSTICS_BYTES);
    expect(JSON.stringify(failure)).not.toContain("boot failed");
  });
  test("PI-044: image content stays typed with its digest instead of base64 text; instructions are typed and bounded", async () => {
    const image = Buffer.from("synthetic-png-bytes").toString("base64");
    const secret = "synthetic-mcp-instruction-secret-31aa";
    const fixture = setup({ tools: [tool()], instructions: "Use lookup carefully. " + secret,
      result: { content: [{ type: "text", text: "caption" }, { type: "image", data: image, mimeType: "image/png" }] } });
    const mounted = await fixture.mount({ server: { ...fixture.server, env: { AMC_FIXTURE_SECRET: secret } } });
    expect(mounted.serverInstructions).toEqual({ kind: "mcp-server-instructions", serverId: "fixture",
      text: "Use lookup carefully. [REDACTED]", truncated: false });
    const outcome = await fixture.call("lookup", { query: "picture" });
    expect(outcome.outcome).toBe("OK");
    expect(String(outcome.content)).not.toContain(image);
    expect(JSON.parse(String(outcome.content)).content).toEqual([{ type: "text", text: "caption" },
      { type: "image", mimeType: "image/png", byteLength: 19, sha256: sha256Hex(Buffer.from("synthetic-png-bytes")), dataOmitted: true }]);
  });
});

describe("native MCP configuration admission", () => {
  test("a reviewed MCP policy offers discovery and keeps the mounted tool deferred but executable", async () => {
    const fixture = setup({ tools: [tool()] });
    const config = loadToolsConfig(fixture.workspace);
    config.tools.allowedTools = config.tools.allowedTools.filter(entry => entry.name === nativeMcpToolName("fixture", "lookup") || entry.name === "tool_search");
    initToolsConfig(fixture.workspace, config);
    const discovered = await discoverNativeMcpCatalog(fixture.server, fixture.workspace);
    const path = join(fixture.workspace, "mcp-only.json");
    writeFileSync(path, JSON.stringify({ schemaVersion: 1, server: fixture.server, expectedCatalogDigest: discovered.digest,
      grants: [{ name: "lookup", actionClass: "READ_ONLY" }] }));
    const review = requireReviewedNativeMcpGrants(loadNativeMcpConfiguration(path), fixture.workspace, "READ_ONLY");
    expect(checkToolsetReadiness(fixture.workspace).ready).toBe(true);
    expect(checkToolsetReadiness(fixture.workspace, { additionalCapabilities: review.capabilities }).ready).toBe(true);
    expect(fixture.tools.seam.schemas()?.map(schema => schema.name)).toEqual(["tool_search"]);
    await fixture.mount();
    expect(fixture.tools.seam.schemas()?.map(schema => schema.name)).toEqual(["tool_search"]);
    expect(fixture.tools.registry.catalog("default").map(schema => schema.name)).toContain(nativeMcpToolName("fixture", "lookup"));
    const discovery = await fixture.tools.pipeline.execute({ name: "tool_search", agentId: "default", arguments: { query: "lookup" }, requestedMode: "EXECUTE" });
    expect(discovery.ok).toBe(true);
    expect(JSON.parse(discovery.output).tools.map((entry: { name: string }) => entry.name)).toContain(nativeMcpToolName("fixture", "lookup"));
    expect((await fixture.call("lookup", { query: "only reviewed remote capability" })).outcome).toBe("OK");
    expect(fixture.calls()).toHaveLength(1);
  });
  test("an explicitly wrong MCP context cannot qualify a reviewed subset", () => {
    const fixture = setup({ tools: [tool()] });
    const path = join(fixture.workspace, "wrong-context.json");
    writeFileSync(path, JSON.stringify({ schemaVersion: 1, server: { id: "fixture", command: process.execPath },
      expectedCatalogDigest: "a".repeat(64), grants: [{ name: "lookup", actionClass: "READ_ONLY" }] }));
    const config = loadToolsConfig(fixture.workspace);
    config.tools.allowedTools = [{ name: nativeMcpToolName("fixture", "lookup"), actionClass: "READ_ONLY",
      context: { kind: "mcp", server: { id: "different", name: "Different", transport: "stdio" } } }];
    initToolsConfig(fixture.workspace, config);
    expect(() => requireReviewedNativeMcpGrants(loadNativeMcpConfiguration(path), fixture.workspace, "READ_ONLY")).toThrow(/context must match/);
    expect(fixture.calls()).toEqual([]);
  });
  test("agent-loop run takes several reviewed MCP configs only with distinct server ids and one pin per config", async () => {
    const fixture = setup({ tools: [tool()] });
    const path = join(fixture.workspace, "mcp-a.json"), twin = join(fixture.workspace, "mcp-b.json");
    const config = { schemaVersion: 1, server: { id: "fixture", command: process.execPath }, expectedCatalogDigest: "a".repeat(64), grants: [{ name: "lookup", actionClass: "READ_ONLY" }] };
    writeFileSync(path, JSON.stringify(config)); writeFileSync(twin, JSON.stringify(config));
    const runCli = async (argv: string[]) => {
      const errors: string[] = [], failures: number[] = [];
      const program = new Command(); program.exitOverride();
      registerAgentCommands(program, { log: () => {}, error: line => errors.push(line), fail: () => failures.push(1) });
      const cwd = process.cwd(); process.chdir(fixture.workspace);
      try { await program.parseAsync(["agent-loop", "run", "hello", "--tools", "workspace", "--approve-tools", "READ_ONLY", ...argv], { from: "user" }); }
      finally { process.chdir(cwd); }
      return { errors, failures };
    };
    const mismatched = await runCli(["--mcp-config", path, "--mcp-config", twin, "--mcp-config-sha256", sha256Hex(readFileSync(path))]);
    expect(mismatched.errors).toEqual(["Give one --mcp-config-sha256 per --mcp-config, in the same order."]);
    const duplicate = await runCli(["--mcp-config", path, "--mcp-config", twin]);
    expect(duplicate.errors).toEqual(["Each --mcp-config must name a distinct server id."]);
    expect(fixture.calls()).toEqual([]);
  });
  test("two reviewed servers mount into one toolset and each keeps its own grants", async () => {
    const fixture = setup({ tools: [tool()] });
    const config = loadToolsConfig(fixture.workspace);
    initToolsConfig(fixture.workspace, { ...config, tools: { ...config.tools, allowedTools: [...config.tools.allowedTools,
      { name: nativeMcpToolName("second", "lookup"), actionClass: "READ_ONLY" }] } });
    await fixture.mount();
    const second = { ...fixture.server, id: "second" };
    const reviewed = await discoverNativeMcpCatalog(second, fixture.workspace);
    const mounted = await mountNativeMcpServer({ server: second, workspace: fixture.workspace, agentId: "default", toolset: fixture.tools,
      expectedCatalogDigest: reviewed.digest, grants: [{ name: "lookup", actionClass: "READ_ONLY" }] });
    expect((await fixture.call("lookup", { query: "first" })).outcome).toBe("OK");
    await mounted.close();
    expect(fixture.tools.registry.visible("default").has(nativeMcpToolName("second", "lookup"))).toBe(false);
    expect((await fixture.call("lookup", { query: "first again" })).outcome).toBe("OK");
  });
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
    if (loaded.config.server.transport === "streamable-http") throw new Error("Expected the legacy stdio fixture configuration");
    await expect(resolveNativeMcpServer({ ...loaded.config, server: { ...loaded.config.server, envRefs: { AMC_FIXTURE_SECRET: "AMC_ABSENT_MCP_FIXTURE_REFERENCE_9B32" } } },
      { workspace: fixture.workspace, credentialsHome: join(fixture.workspace, "isolated-credentials") })).rejects.toThrow(/not configured/);
  });
});
