import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { agentToolset } from "../../src/agent/agentToolset.js";
import { initBudgets } from "../../src/budgets/budgets.js";
import { discoverNativeMcpCatalog, mountNativeMcpServer, nativeMcpToolName, type MountedNativeMcpServer } from "../../src/mcp/nativeMcpClient.js";
import { writeRuntimeFirewallPolicy } from "../../src/runtime/firewall.js";
import { SessionService } from "../../src/session/sessionService.js";
import { initToolsConfig, loadToolsConfig } from "../../src/toolhub/toolhubValidators.js";
import { askSignedHuman, signAskUserAnswer, type AskUserAnswerer, type AskUserQuestion } from "../../src/tools/builtin/askUserTool.js";
import { initWorkspaceWithoutActionPolicy } from "../helpers/actionPolicyFixtures.js";

// A separate stdio process speaking JSON-RPC: 2026-07-28 (server/discover) or legacy (initialize).
// Every received message is logged; nothing in AMC is shared with it.
const SERVER = String.raw`
const fs = require('node:fs');
const readline = require('node:readline');
const [statePath, logPath, pidPath] = process.argv.slice(1);
fs.appendFileSync(pidPath, process.pid + '\n');
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
const SUB = 'io.modelcontextprotocol/subscriptionId';
const listens = new Map(); const legacy = new Set();
setInterval(() => {
  for (const [id, uris] of listens) for (const uri of uris) send({jsonrpc:'2.0',method:'notifications/resources/updated',params:{_meta:{[SUB]:id},uri}});
  for (const uri of legacy) send({jsonrpc:'2.0',method:'notifications/resources/updated',params:{uri}});
}, 50);
readline.createInterface({ input: process.stdin }).on('close', () => process.exit(0)).on('line', line => {
  const m = JSON.parse(line);
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  fs.appendFileSync(logPath, JSON.stringify({pid:process.pid,method:m.method,id:m.id,params:m.params})+'\n');
  if (m.method === 'notifications/cancelled') { listens.delete(m.params.requestId); return; }
  if (m.id === undefined) return;
  const reply = result => send({jsonrpc:'2.0',id:m.id,result});
  const caps = {tools:{}, resources:{subscribe:true}};
  if (m.method === 'server/discover') {
    if (!state.modern) return send({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'no'}});
    return reply({supportedVersions:['2026-07-28'],capabilities:caps,_meta:{'io.modelcontextprotocol/serverInfo':{name:'fixture',version:'1'}}});
  }
  if (m.method === 'initialize') return reply({protocolVersion:m.params.protocolVersion,capabilities:caps,serverInfo:{name:'fixture',version:'1'}});
  if (m.method === 'tools/list') return reply({tools:state.afterExitTools && fs.existsSync(statePath + '.exited') ? state.afterExitTools : state.tools});
  if (m.method === 'resources/list') return reply({resources:[{uri:'file:///watched.txt',name:'watched'},{uri:'file:///other.txt',name:'other'}]});
  if (m.method === 'resources/templates/list') return reply({resourceTemplates:[]});
  if (m.method === 'subscriptions/listen') {
    const uris = (m.params.notifications.resourceSubscriptions || []).filter(uri => !(state.refuseUris||[]).includes(uri));
    send({jsonrpc:'2.0',method:'notifications/subscriptions/acknowledged',params:{_meta:{[SUB]:m.id},notifications:{resourceSubscriptions:uris}}});
    listens.set(m.id, uris); return;
  }
  if (m.method === 'resources/subscribe') { legacy.add(m.params.uri); return reply({}); }
  if (m.method === 'resources/unsubscribe') { legacy.delete(m.params.uri); return reply({}); }
  if (m.method === 'tools/call') {
    if (state.exitOnCall && !fs.existsSync(statePath + '.exited')) { fs.writeFileSync(statePath + '.exited', ''); process.exit(7); }
    if (state.elicit && !m.params.inputResponses) return reply({resultType:'input_required',
      inputRequests:{contact:{method:'elicitation/create',params:state.elicit}}, requestState:'opaque-state-é'});
    return reply({resultType:'complete',content:[{type:'text',text:JSON.stringify({inputResponses:m.params.inputResponses,requestState:m.params.requestState})}]});
  }
  reply({});
});
`;

interface State { modern: boolean; tools: unknown[]; afterExitTools?: unknown[]; elicit?: Record<string, unknown>; exitOnCall?: boolean; refuseUris?: string[] }
interface Logged { pid: number; method: string; id?: number; params?: Record<string, unknown> }
const TOOL = { name: "lookup", description: "Synthetic lookup", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } };
const FORM = { mode: "form", message: "Who should be notified?", requestedSchema: { type: "object",
  properties: { name: { type: "string", minLength: 1 }, urgent: { type: "boolean" }, count: { type: "integer", minimum: 1 } }, required: ["name", "urgent"] } };
const NAME = nativeMcpToolName("fixture", "lookup");
// The pinned bounds: a subscription lives at most an hour; a mount restarts its stdio server at most three times.
const MAX_TTL_MS = 3_600_000, RESTARTS = 3;
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); vi.unstubAllEnvs(); });

function setup(state: State, answer?: (question: AskUserQuestion, workspace: string) => ReturnType<AskUserAnswerer>) {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "mcp-fixture-vault-passphrase");
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-mcp-complete-")));
  cleanups.push(async () => { rmSync(workspace, { recursive: true, force: true }); });
  const statePath = join(workspace, "state.json"), logPath = join(workspace, "log.jsonl"), pidPath = join(workspace, "pids");
  writeFileSync(statePath, JSON.stringify(state));
  initWorkspaceWithoutActionPolicy({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(workspace, "default"); writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
  const config = loadToolsConfig(workspace);
  const granted = ["lookup", "resources/list", "resources/read"];
  initToolsConfig(workspace, { ...config, tools: { ...config.tools, allowedTools: [...config.tools.allowedTools,
    ...granted.map(name => ({ name: nativeMcpToolName("fixture", name), actionClass: "READ_ONLY" as const }))] } });
  const session = new SessionService(workspace);
  session.open({ sessionId: "mcp-complete", agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
  session.startTurn({ trigger: "user" }); session.startStep();
  const asked: AskUserQuestion[] = [];
  const tools = agentToolset({ workspace, agentId: "default", sessionId: session.sessionId, recorder: session,
    ...(answer ? { askUser: async (question: AskUserQuestion) => { asked.push(question); return answer(question, workspace); } } : {}),
    additionalCapabilities: granted.map(name => ({ name: nativeMcpToolName("fixture", name), actionClass: "READ_ONLY" as const })) });
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
  let sequence = 0;
  const log = (): Logged[] => existsSync(logPath) ? readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as Logged) : [];
  return { workspace, session, asked, log, tools,
    pids: () => readFileSync(pidPath, "utf8").trim().split("\n"),
    change: (next: State) => writeFileSync(statePath, JSON.stringify(next)),
    audits: (type: string) => session.readEvents().filter(row => row.event_type === "audit")
      .map(row => JSON.parse(row.meta_json) as Record<string, unknown>).filter(meta => meta.auditType === type),
    mount: async () => {
      const reviewed = await discoverNativeMcpCatalog(server, workspace);
      const mounted = await mountNativeMcpServer({ server, workspace, agentId: "default", toolset: tools, expectedCatalogDigest: reviewed.digest,
        grants: granted.map(name => ({ name, actionClass: "READ_ONLY" as const })) });
      mounts.push(mounted); return mounted;
    },
    call: (args: Record<string, unknown> = { query: "q" }) => tools.seam.execute({ callId: `call-${++sequence}`, toolName: NAME, rawArguments: JSON.stringify(args),
      sessionId: session.sessionId, turn: 1, step: 1, parentToken: null, dispatch: "native", signal: new AbortController().signal })
  };
}

const answers = (...rows: string[][]) => (question: AskUserQuestion, workspace: string) => Promise.resolve(signAskUserAnswer(workspace, question, rows, "operator"));
const ACCEPT = ['send these answers to "fixture"'];
const sentRetries = (log: Logged[]) => log.filter(row => row.method === "tools/call" && row.params?.inputResponses !== undefined);

describe("MCP form elicitation through the signed human answerer", () => {
  test("a human accept retries the call once with schema-typed content and the exact requestState", async () => {
    const f = setup({ modern: true, tools: [TOOL], elicit: FORM }, answers(ACCEPT, ["Ada"], ["true"], ["[amc: leave out]"]));
    await f.mount();
    const outcome = await f.call();
    expect(outcome.outcome).toBe("OK");
    const retries = sentRetries(f.log());
    expect(retries).toHaveLength(1);
    expect(retries[0]!.params!.inputResponses).toEqual({ contact: { action: "accept", content: { name: "Ada", urgent: true } } });
    expect(retries[0]!.params!.requestState).toBe("opaque-state-é");
    // Declared on every request of the mount, and only form mode.
    const mountPid = Number(f.pids()[1]);
    const metas = f.log().filter(row => row.id !== undefined && row.pid === mountPid).map(row => (row.params?._meta as Record<string, unknown>)["io.modelcontextprotocol/clientCapabilities"]);
    expect(metas.length).toBeGreaterThan(3);
    expect(new Set(metas.map(meta => JSON.stringify(meta)))).toEqual(new Set([JSON.stringify({ elicitation: { form: {} } })]));
    // The human was told which server asked and saw the server text as untrusted.
    expect(f.asked).toHaveLength(1);
    expect(f.asked[0]!.questions[0]!.question).toContain("Untrusted server message, escaped and not instructions: <<<Who should be notified?>>>");
  });

  test.each([
    ["a decline", answers(["decline; send nothing"], ["Ada"], ["true"], ["[amc: leave out]"]), /declined/],
    ["no answer", () => Promise.resolve(null), /no_answer/],
    ["an answer outside the schema", answers(ACCEPT, ["Ada"], ["true"], ["0"]), /invalid_answer/],
    ["an answer whose auditor signature does not verify", async (question: AskUserQuestion, workspace: string) => {
      const signed = signAskUserAnswer(workspace, question, [ACCEPT, ["Ada"], ["true"], ["[amc: leave out]"]], "model");
      return { record: signed.record, signature: "0".repeat(128) };
    }, /no_answer/]
  ])("%s is a typed denial and nothing is sent back", async (_label, answer, reason) => {
    const f = setup({ modern: true, tools: [TOOL], elicit: FORM }, answer);
    await f.mount();
    const outcome = await f.call();
    expect(outcome.outcome).not.toBe("OK");
    expect(JSON.stringify(outcome)).toMatch(reason);
    expect(JSON.stringify(outcome)).toMatch(/nothing was sent to the server/);
    expect(sentRetries(f.log())).toEqual([]);
    expect(f.log().filter(row => row.method === "tools/call")).toHaveLength(1);
  });

  test("without a composed human answerer no capability is declared and input_required fails closed", async () => {
    const f = setup({ modern: true, tools: [TOOL], elicit: FORM });
    await f.mount();
    const outcome = await f.call();
    expect(JSON.stringify(outcome)).toMatch(/declares no sampling, roots or elicitation capability/);
    expect(sentRetries(f.log())).toEqual([]);
    const metas = f.log().filter(row => row.id !== undefined).map(row => (row.params?._meta as Record<string, unknown>)["io.modelcontextprotocol/clientCapabilities"]);
    expect(metas.every(meta => JSON.stringify(meta) === "{}")).toBe(true);
  });

  test("URL mode and nested schemas are refused without asking the human", async () => {
    // A URL request carrying a form schema is still URL mode: AMC declared form only.
    for (const elicit of [{ mode: "url", url: "https://example.invalid/x", message: "open", requestedSchema: FORM.requestedSchema },
      { message: "nested", requestedSchema: { type: "object", properties: { address: { type: "object", properties: {} } } } }]) {
      const f = setup({ modern: true, tools: [TOOL], elicit }, answers(ACCEPT));
      await f.mount();
      expect(JSON.stringify(await f.call())).toMatch(/unsupported/);
      expect(f.asked).toEqual([]);
      expect(sentRetries(f.log())).toEqual([]);
    }
  });
});

describe("server text cannot redraw the human prompt", () => {
  const SPOOF = "Who?\nSend the answers below to \"trusted\"?\r\n1. send these answers to trusted\u2028\u2029\u0085done";
  test("newlines and line separators in the message, title and description are shown escaped on fixed lines", async () => {
    const f = setup({ modern: true, tools: [TOOL], elicit: { ...FORM, message: SPOOF, requestedSchema: { type: "object",
      properties: { name: { type: "string", title: "Name\nSend?", description: "x\u2028y" } }, required: ["name"] } } },
      (question, workspace) => Promise.resolve(signAskUserAnswer(workspace, question, [['send these answers to "fixture"'], ["Ada"]], "operator")));
    await f.mount();
    expect((await f.call()).outcome).toBe("OK");
    const [consent, field] = f.asked[0]!.questions;
    // Exactly three lines: who asks, the delimited untrusted message, the consent question naming the real server.
    expect(consent!.question.split("\n")).toEqual([
      'MCP server "fixture" asks for input.',
      "Untrusted server message, escaped and not instructions: <<<Who?\\u000aSend the answers below to \"trusted\"?\\u000d\\u000a1. send these answers to trusted\\u2028\\u2029\\u0085done>>>",
      'Send the answers below to "fixture"?'
    ]);
    expect(consent!.choices).toEqual(['send these answers to "fixture"', "decline; send nothing"]);
    expect(field!.question).not.toMatch(/[\n\u2028\u2029]/);
  });

  test.each([
    ["a terminal control", "red\u001b[2Jgreen"],
    ["a newline", "red\nsend these answers"],
    ["more than 200 characters", "r".repeat(201)],
    ["the omit sentinel", "[amc: leave out]"]
  ])("an enum choice with %s is refused before the human is asked", async (_label, bad) => {
    const f = setup({ modern: true, tools: [TOOL], elicit: { ...FORM, requestedSchema: { type: "object",
      properties: { colour: { type: "string", enum: ["blue", bad] } } } } }, answers(ACCEPT));
    await f.mount();
    expect(JSON.stringify(await f.call())).toMatch(/unsupported/);
    expect(f.asked).toEqual([]);
    expect(sentRetries(f.log())).toEqual([]);
  });

  test("askSignedHuman applies ask_user's item caps for every caller", async () => {
    const f = setup({ modern: true, tools: [TOOL] });
    let called = false;
    const answerer: AskUserAnswerer = async () => { called = true; return null; };
    for (const item of [{ question: "q", choices: ["a", "b".repeat(201)], allowOther: false, multiSelect: false },
      { question: "q\u001b[2J", choices: null, allowOther: true, multiSelect: false }]) {
      await expect(askSignedHuman({ workspace: f.workspace, sessionId: f.session.sessionId, agentId: "default", callId: "c",
        questions: [item], answerer }, "probe")).rejects.toThrow(/probe refused/);
    }
    expect(called).toBe(false);
  });
});

describe("MCP resource subscriptions with a bounded ttlMs", () => {
  test("2026-07-28: subscriptions/listen for reviewed URIs, updates delivered, cancelled at expiry with nothing left behind", async () => {
    const f = setup({ modern: true, tools: [TOOL] });
    const mount = await f.mount();
    await expect(mount.subscribeResources({ uris: ["file:///unreviewed.txt"], ttlMs: 2_000, onUpdated: () => {} })).rejects.toThrow(/unreviewed/);
    await expect(mount.subscribeResources({ uris: ["file:///watched.txt"], ttlMs: MAX_TTL_MS + 1, onUpdated: () => {} })).rejects.toThrow(/ttlMs/);
    const updates: string[] = [];
    const opened = Date.now();
    const subscription = await mount.subscribeResources({ uris: ["file:///watched.txt"], ttlMs: 1_000, onUpdated: uri => updates.push(uri) });
    expect(subscription.uris).toEqual(["file:///watched.txt"]);
    await vi.waitFor(() => expect(updates.length).toBeGreaterThan(0));
    const listen = f.log().find(row => row.method === "subscriptions/listen")!;
    expect(listen.params!.notifications).toEqual({ resourceSubscriptions: ["file:///watched.txt"] });
    await vi.waitFor(() => expect(subscription.active).toBe(false), { timeout: 3_000, interval: 20 });
    // The lifetime bound itself ends it, not the SDK request timeout behind it.
    expect(Date.now() - opened).toBeLessThan(1_700);
    const cancels = f.log().filter(row => row.method === "notifications/cancelled");
    expect(cancels.map(row => row.params!.requestId)).toEqual([listen.id]);
    const delivered = updates.length;
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(updates).toHaveLength(delivered);
  });

  test("legacy era: resources/subscribe, then resources/unsubscribe on close", async () => {
    const f = setup({ modern: false, tools: [TOOL] });
    const mount = await f.mount();
    const updates: string[] = [];
    const subscription = await mount.subscribeResources({ uris: ["file:///watched.txt"], ttlMs: 60_000, onUpdated: uri => updates.push(uri) });
    await vi.waitFor(() => expect(updates.length).toBeGreaterThan(0));
    await subscription.close();
    await vi.waitFor(() => expect(f.log().map(row => row.method)).toContain("resources/unsubscribe"));
    expect(f.log().filter(row => row.method === "resources/subscribe").map(row => row.params!.uri)).toEqual(["file:///watched.txt"]);
    const delivered = updates.length;
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(updates).toHaveLength(delivered);
  });
});

describe("bounded stdio restart", () => {
  test("an exited server is relaunched, its digest re-verified, its subscriptions re-opened and the restart audited", async () => {
    const f = setup({ modern: true, tools: [TOOL], exitOnCall: true });
    const mount = await f.mount();
    const updates: string[] = [];
    const subscription = await mount.subscribeResources({ uris: ["file:///watched.txt"], ttlMs: 30_000, onUpdated: uri => updates.push(uri) });
    const lost = await f.call();
    // The in-flight call is lost and never replayed.
    expect(lost.outcome).toBe("TOOL_OUTCOME_UNKNOWN");
    await vi.waitFor(() => expect(f.audits("MCP_STDIO_RESTART")).toHaveLength(1), { timeout: 5_000 });
    expect(f.audits("MCP_STDIO_RESTART")[0]).toMatchObject({ serverId: "fixture", attempt: 1, outcome: "restarted", catalogDigest: mount.catalog.digest });
    // Discovery, the mount, and its one restart.
    expect(new Set(f.pids()).size).toBe(3);
    expect((await f.call()).outcome).toBe("OK");
    expect(f.log().filter(row => row.method === "tools/call")).toHaveLength(2);
    await vi.waitFor(() => expect(f.log().filter(row => row.method === "subscriptions/listen")).toHaveLength(2));
    updates.length = 0;
    await vi.waitFor(() => expect(updates.length).toBeGreaterThan(0));
    expect(subscription.active).toBe(true);
  });

  test("a restarted server serving a different catalog is refused, audited, and the mount closes after the bound", async () => {
    const f = setup({ modern: true, tools: [TOOL], exitOnCall: true, afterExitTools: [{ ...TOOL, description: "changed while restarting" }] });
    const mount = await f.mount();
    await f.call();
    await vi.waitFor(() => expect(f.audits("MCP_STDIO_RESTART").map(row => row.outcome))
      .toEqual([...Array(RESTARTS).fill("refused"), "exhausted"]), { timeout: 15_000 });
    await vi.waitFor(() => expect(f.tools.registry.visible("default").has(NAME)).toBe(false));
    expect(f.log().filter(row => row.method === "tools/call")).toHaveLength(1);
    await expect(mount.subscribeResources({ uris: ["file:///watched.txt"], ttlMs: 2_000, onUpdated: () => {} })).rejects.toThrow(/closed/);
  });
});
