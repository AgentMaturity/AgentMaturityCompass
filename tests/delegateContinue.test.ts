import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import type { ToolDefinition as PolicyTool } from "../src/toolhub/toolsSchema.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { agentToolset } from "../src/agent/agentToolset.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { delegateTool } from "../src/agent/delegateTool.js";
import { delegateContinueTool, openDelegates } from "../src/agent/delegateContinuations.js";
import { createDriverRunner } from "../src/agent/subagentRunner.js";
import { listHandoffPackets } from "../src/fleet/handoffPacket.js";
import { SessionService } from "../src/session/sessionService.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { ANTHROPIC_CAPABILITIES } from "../src/llm/adapter/providerCapabilities.js";
import type { SubagentRunContext, SubagentRunResult } from "../src/agent/subagentSpawn.js";
import type { LoopEventRecord } from "../src/session/loopEventMeta.js";
import type { ToolExecution } from "../src/tools/toolTypes.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, scriptedAdapter, silentTransport, textStep, toolStep } from "./helpers/agentLoopHarness.js";

/**
 * Kept-open delegates and `delegate_continue` (SH-ORCH-05). A delegate kept
 * open answers more work in its own session, holds its slot until released,
 * defers `delegation-completed` until then, and never outlives the toolset that
 * holds it: shutdown releases it before the caller's session is sealed. The
 * option exists only where the composer says the runner can continue a child
 * and the signed policy offers `delegate_continue`.
 */
const dirs: string[] = [];
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

function workspace(allowed: PolicyTool[] = []): string {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "delegate-continue-synthetic-passphrase");
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-delegate-continue-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(dir, "default"); writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  if (allowed.length > 0) {
    const config = loadToolsConfig(dir);
    initToolsConfig(dir, { ...config, tools: { ...config.tools, allowedTools: [...config.tools.allowedTools, ...allowed] } });
  }
  return dir;
}

const DELEGATE: PolicyTool = { name: "delegate", actionClass: "READ_ONLY" };
const CONTINUE: PolicyTool = { name: "delegate_continue", actionClass: "READ_ONLY" };

function recorder() {
  const rows: LoopEventRecord[] = [];
  return { sessionId: "root-session", rows, recordLoopEvent: (row: LoopEventRecord) => { rows.push(row); return null; },
    recordProjectedEvidence: () => null,
    completed: () => rows.filter(row => row.kind === "delegation-completed") as Array<Extract<LoopEventRecord, { kind: "delegation-completed" }>> };
}

/** A child that answers each turn with its count and the text it was sent, and records every release. */
function continuable(released: string[] = []) {
  return vi.fn(async (ctx: SubagentRunContext): Promise<SubagentRunResult> => {
    let turn = 1;
    return { ok: true, text: `turn 1: ${ctx.identity.runAs}`, ...(ctx.continuable ? { continuation: {
      continue: async (text: string) => ({ ok: true, text: `turn ${++turn}: ${text}` }),
      close: () => { released.push(ctx.identity.runAs); }
    } } : {}) };
  });
}

function call(dir: string, args: Record<string, unknown>, signal?: AbortSignal): ToolExecution {
  return { workspace: dir, arguments: args, ...(signal === undefined ? {} : { signal }) } as unknown as ToolExecution;
}

function tools(dir: string, runner: ReturnType<typeof continuable>, over: { offered?: () => boolean; maxActiveChildren?: number; stopConditions?: string[]; continuable?: boolean } = {}) {
  const session = recorder();
  let n = 0;
  const open = openDelegates(over.offered ?? (() => true));
  const capability = { identity: rootIdentity("default"), runner, session, continuable: over.continuable ?? true, mintSessionId: () => `child-${++n}`,
    ...(over.maxActiveChildren === undefined ? {} : { maxActiveChildren: over.maxActiveChildren }),
    ...(over.stopConditions === undefined ? {} : { stopConditions: over.stopConditions }) };
  return { session, open, delegate: delegateTool(capability, open), proceed: delegateContinueTool(open) };
}

describe("delegate({keepOpen}) and delegate_continue", () => {
  it("keeps the delegate, returns its own words to each continuation, and settles it once on release", async () => {
    const dir = workspace(), released: string[] = [];
    const t = tools(dir, continuable(released));
    const first = await t.delegate.body(call(dir, { runAs: "helper", goal: "count rows", keepOpen: true }));
    expect(first).toEqual({ ok: true, output: "turn 1: helper" });
    expect(t.session.rows.map(row => row.kind)).toEqual(["delegation-started"]);
    expect(t.open.names()).toEqual(["helper"]);
    expect(await t.proceed.body(call(dir, { runAs: "helper", text: "and columns" }))).toEqual({ ok: true, output: "turn 2: and columns" });
    expect(t.session.completed()).toEqual([]);
    expect(await t.proceed.body(call(dir, { runAs: "helper", release: true }))).toEqual({ ok: true, output: "[amc] delegate \"helper\" released" });
    expect(t.session.completed()).toEqual([expect.objectContaining({ childRunAs: "helper", settledAs: "reported", reason: "the caller released the delegate" })]);
    expect(released).toEqual(["helper"]);
    expect(await t.proceed.body(call(dir, { runAs: "helper", text: "again" }))).toMatchObject({ ok: false, output: expect.stringContaining("no open delegate is named \"helper\"; none is open") });
    expect(t.session.completed()).toHaveLength(1);
  });

  it("holds the delegation slot while open and frees it on release", async () => {
    const dir = workspace();
    const t = tools(dir, continuable(), { maxActiveChildren: 1 });
    expect((await t.delegate.body(call(dir, { runAs: "helper", goal: "stay", keepOpen: true }))).ok).toBe(true);
    expect(await t.delegate.body(call(dir, { runAs: "other", goal: "one shot" }))).toMatchObject({ ok: false, output: expect.stringContaining("maxActiveChildren=1") });
    await t.proceed.body(call(dir, { runAs: "helper", release: true }));
    expect(await t.delegate.body(call(dir, { runAs: "other", goal: "one shot" }))).toEqual({ ok: true, output: "turn 1: other" });
  });

  it("refuses keepOpen before any packet unless delegate_continue is offered and the runner can continue", async () => {
    const dir = workspace(), runner = continuable();
    const notOffered = tools(dir, runner, { offered: () => false });
    expect(await notOffered.delegate.body(call(dir, { runAs: "helper", goal: "stay", keepOpen: true })))
      .toMatchObject({ ok: false, output: expect.stringContaining("keepOpen needs delegate_continue") });
    const foreign = tools(dir, runner, { continuable: false });
    expect(Object.keys((foreign.delegate.parameters as { properties: object }).properties)).toEqual(["runAs", "goal", "agent"]);
    expect(await foreign.delegate.body(call(dir, { runAs: "helper", goal: "stay", keepOpen: true })))
      .toMatchObject({ ok: false, output: expect.stringContaining("keepOpen needs delegate_continue") });
    expect(runner).not.toHaveBeenCalled();
    expect(listHandoffPackets(dir)).toHaveLength(0);
    expect([...notOffered.session.rows, ...foreign.session.rows]).toEqual([]);
    // A plain delegate is unchanged: one shot, settled before it returns.
    expect(await foreign.delegate.body(call(dir, { runAs: "helper", goal: "once" }))).toEqual({ ok: true, output: "turn 1: helper" });
    expect(foreign.session.completed()).toHaveLength(1);
  });

  it("keeps one open delegate per name, claimed before the first await", async () => {
    const dir = workspace(), runner = continuable();
    const t = tools(dir, runner);
    const [a, b] = await Promise.all([t.delegate.body(call(dir, { runAs: "helper", goal: "one", keepOpen: true })),
      t.delegate.body(call(dir, { runAs: "helper", goal: "two", keepOpen: true }))]);
    expect([a.ok, b.ok]).toEqual([true, false]);
    expect(b.output).toMatch(/a delegate named "helper" is already kept open/);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("frees the name when the delegation settles at its max-turns ceiling", async () => {
    const dir = workspace(), released: string[] = [];
    const t = tools(dir, continuable(released), { stopConditions: ["max-turns:2"] });
    await t.delegate.body(call(dir, { runAs: "helper", goal: "count", keepOpen: true }));
    expect(await t.proceed.body(call(dir, { runAs: "helper", text: "last" }))).toEqual({ ok: true, output: "turn 2: last" });
    expect(t.session.completed()).toEqual([expect.objectContaining({ settledAs: "reported", reason: expect.stringContaining("max-turns:2 ceiling reached") })]);
    expect(await t.proceed.body(call(dir, { runAs: "helper", text: "more" }))).toMatchObject({ ok: false, output: expect.stringContaining("none is open") });
    expect((await t.delegate.body(call(dir, { runAs: "helper", goal: "count again", keepOpen: true }))).ok).toBe(true);
    expect(t.open.names()).toEqual(["helper"]);
  });

  it("stops the child when the caller cancels a continuation", async () => {
    const dir = workspace();
    const runner = vi.fn(async (ctx: SubagentRunContext): Promise<SubagentRunResult> => ({ ok: true, text: "first", continuation: {
      continue: () => new Promise<SubagentRunResult>(resolve => ctx.signal!.addEventListener("abort", () => resolve({ ok: false, text: "", reason: "stopped" }), { once: true })),
      close: () => undefined } }));
    const t = tools(dir, runner as unknown as ReturnType<typeof continuable>);
    await t.delegate.body(call(dir, { runAs: "helper", goal: "wait", keepOpen: true }));
    const abort = new AbortController();
    const pending = t.proceed.body(call(dir, { runAs: "helper", text: "wait forever" }, abort.signal));
    await new Promise(resolve => setTimeout(resolve, 20));
    abort.abort();
    expect(await pending).toMatchObject({ ok: false, output: expect.stringContaining("the caller cancelled the continuation") });
    expect(t.session.completed()).toEqual([expect.objectContaining({ settledAs: "cancelled", reason: expect.stringContaining("the caller cancelled the continuation") })]);
    expect(t.open.names()).toEqual([]);
  });

  it("releases every open delegate at shutdown, and waits for one still being kept when shutdown began (S23)", async () => {
    const dir = workspace(), released: string[] = [];
    let finish!: () => void;
    const late = new Promise<void>(resolve => { finish = resolve; });
    const inner = continuable(released);
    const runner = vi.fn(async (ctx: SubagentRunContext) => { if (ctx.identity.runAs === "late") await late; return inner(ctx); });
    const t = tools(dir, runner as unknown as ReturnType<typeof continuable>);
    await t.delegate.body(call(dir, { runAs: "early", goal: "stay", keepOpen: true }));
    const pending = t.delegate.body(call(dir, { runAs: "late", goal: "stay", keepOpen: true }));
    expect(t.open.hasOwnedWork()).toBe(true);
    const closing = t.open.closeAll();
    finish();
    // Shutdown resolves only after the in-flight reservation settled and its late release wrote its row, so a caller
    // that seals its session as soon as shutdown resolves seals after both completion rows.
    expect(await closing).toBe(true);
    expect(t.session.completed().map(row => row.childRunAs).sort()).toEqual(["early", "late"]);
    expect((await pending).ok).toBe(true);
    expect(t.session.completed().map(row => [row.childRunAs, row.settledAs, row.reason]).sort()).toEqual([
      ["early", "reported", "the caller's run ended; the open delegate was released"],
      ["late", "reported", "the caller's run ended; the open delegate was released"]]);
    expect(released.sort()).toEqual(["early", "late"]);
    expect(t.open.hasOwnedWork()).toBe(false);
  });

  it("refuses malformed continuation arguments and unknown names with the runtime's account", async () => {
    const dir = workspace();
    const t = tools(dir, continuable());
    expect((await t.proceed.body(call(dir, { runAs: "helper" }))).output).toMatch(/text must be a non-empty string/);
    expect((await t.proceed.body(call(dir, { runAs: "helper", text: "x", release: true }))).output).toMatch(/not both/);
    expect((await t.proceed.body(call(dir, { runAs: "", text: "x" }))).output).toMatch(/runAs must name/);
    expect((await t.delegate.body(call(dir, { runAs: "helper", goal: "g", keepOpen: "yes" }))).output).toMatch(/keepOpen, when given, must be true or false/);
    await t.delegate.body(call(dir, { runAs: "helper", goal: "stay", keepOpen: true }));
    expect((await t.proceed.body(call(dir, { runAs: "other", text: "x" }))).output).toMatch(/no open delegate is named "other"; open: helper/);
  });
});

/** The root composition path: the toolset defines the tools, the signed pipeline admits them, shutdown releases. */
function rootToolset(allowed: PolicyTool[], continuableRunner = true, wrap: (runner: ReturnType<typeof continuable>) => ReturnType<typeof continuable> = runner => runner) {
  const dir = workspace(allowed);
  const session = new SessionService(dir);
  session.open({ agentId: "default", harnessVersion: "continue-fixture", compositionDigest: "fixture", policyDigest: "fixture" });
  session.startTurn({ trigger: "user" }); session.startStep();
  const toolset = agentToolset({ workspace: dir, agentId: "default", sessionId: session.sessionId, recorder: session });
  cleanups.push(() => { void toolset.close(); try { session.disposeWithoutClosing(); } catch { /* already closed by the test */ } });
  const released: string[] = [];
  let n = 0;
  toolset.grantSubagents({ identity: rootIdentity("default"), runner: wrap(continuable(released)), session, continuable: continuableRunner, mintSessionId: () => `kept-${++n}` });
  let sequence = 0;
  const run = (name: string, args: object) => toolset.seam.execute({ callId: `continue-${++sequence}`, toolName: name,
    rawArguments: JSON.stringify(args), sessionId: session.sessionId, turn: 1, step: 1, parentToken: null,
    dispatch: "native", signal: new AbortController().signal });
  const names = () => toolset.seam.schemas()?.map(tool => tool.name).sort() ?? [];
  return { dir, session, toolset, released, run, names };
}

describe("a toolset granted delegation", () => {
  it("offers delegate_continue under the signed allowlist and releases open delegates at shutdown, before the seal", async () => {
    const f = rootToolset([DELEGATE, CONTINUE]);
    expect(f.names()).toEqual(expect.arrayContaining(["delegate", "delegate_continue"]));
    expect(await f.run("delegate", { runAs: "helper", goal: "count rows", keepOpen: true })).toMatchObject({ outcome: "OK", content: "turn 1: helper" });
    expect(await f.run("delegate_continue", { runAs: "helper", text: "and columns" })).toMatchObject({ outcome: "OK", content: "turn 2: and columns" });
    expect(f.toolset.hasOwnedWork()).toBe(true);
    expect(await f.toolset.seam.shutdown!()).toBe(true);
    expect(f.released).toEqual(["helper"]);
    expect(f.toolset.hasOwnedWork()).toBe(false);
    const completed = f.session.readEvents().filter(row => row.event_type === "agent_delegation_completed").map(row => JSON.parse(row.meta_json) as Record<string, unknown>);
    expect(completed).toEqual([expect.objectContaining({ childRunAs: "helper", settledAs: "reported", reason: "the caller's run ended; the open delegate was released" })]);
  });

  it("shuts down only after a delegate still being kept is released, so its row precedes the seal (S23)", async () => {
    let finish!: () => void;
    const held = new Promise<void>(resolve => { finish = resolve; });
    const f = rootToolset([DELEGATE, CONTINUE], true, runner => vi.fn(async (ctx: SubagentRunContext) => { await held; return runner(ctx); }) as unknown as typeof runner);
    const pending = f.run("delegate", { runAs: "late", goal: "stay", keepOpen: true });
    await vi.waitFor(() => expect(f.toolset.hasOwnedWork()).toBe(true));
    const shutdown = f.toolset.seam.shutdown!();
    finish();
    expect(await shutdown).toBe(true);
    f.session.endStep({ stopReason: "end_turn", usage: null }); f.session.endTurn({ reason: "complete" }); f.session.sealTurn();
    const sessionId = f.session.sessionId;
    f.session.close({ reason: "completed" });
    expect((await pending).outcome).toBe("OK");
    const db = new Database(join(f.dir, ".amc", "evidence.sqlite"), { readonly: true });
    const types = (() => { try {
      return (db.prepare("SELECT event_type FROM evidence_events WHERE session_id = ? ORDER BY rowid").all(sessionId) as Array<{ event_type: string }>).map(row => row.event_type);
    } finally { db.close(); } })();
    expect(types.indexOf("agent_delegation_completed")).toBeGreaterThan(-1);
    expect(types.indexOf("agent_delegation_completed")).toBeLessThan(types.indexOf("session/close"));
    expect(f.released).toEqual(["late"]);
  });

  it("refuses keepOpen and denies delegate_continue when the signed allowlist does not list it", async () => {
    const f = rootToolset([DELEGATE]);
    expect(f.names()).not.toContain("delegate_continue");
    expect(await f.run("delegate", { runAs: "helper", goal: "stay", keepOpen: true })).toMatchObject({ outcome: "ERROR", content: expect.stringContaining("keepOpen needs delegate_continue") });
    expect((await f.run("delegate_continue", { runAs: "helper", text: "x" })).outcome).toBe("DENIED");
    expect(f.released).toEqual([]);
  });

  it("does not define delegate_continue for a runner that cannot continue (a foreign delegate)", async () => {
    const f = rootToolset([DELEGATE, CONTINUE], false);
    expect(f.toolset.registry.visible("default").has("delegate_continue")).toBe(false);
    expect(f.names()).not.toContain("delegate_continue");
  });
});

/** A child composed by the real driver runner gets the same tools; its own release closes what it kept open. */
describe("a real child that keeps a delegate open", () => {
  it("continues its grandchild and releases it before its own session is sealed", async () => {
    const dir = workspace([DELEGATE, CONTINUE]);
    const released: string[] = [];
    const scripted = scriptedAdapter([
      toolStep("k1", "delegate", JSON.stringify({ runAs: "helper", goal: "count rows", keepOpen: true })),
      toolStep("k2", "delegate_continue", JSON.stringify({ runAs: "helper", text: "and columns" })),
      textStep("both counted")
    ]);
    const registry = new AdapterRegistry();
    registry.register({ providerId: LOOP_PROVIDER, baseUrl: "https://fixture.invalid", credentialRef: null, models: [LOOP_MODEL],
      adapter: { ...scripted, capabilities: ANTHROPIC_CAPABILITIES, envelope: input => ({ ...scripted.envelope(input), signal: input.signal }) } });
    const grandchild = continuable(released);
    const runner = createDriverRunner({
      workspace: dir, route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
      systemPrompt: "Delegate.", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture",
      config: { maxStepsPerTurn: 4 },
      makeLlm: session => new LlmRuntime({ session, registry, credentials: new FixedCredentials(), transport: silentTransport }),
      grantDelegation: { mintSessionId: () => "kept-grandchild", runner: grandchild }
    });
    const result = await runner({ childSessionId: "keeping-child", toolsetAgentId: "default", continuable: false, goal: "Count with a helper.",
      identity: { governedAs: "default", runAs: "child", parent: "default", depth: 1 } });
    expect(result.ok, result.reason).toBe(true);
    expect(result.text).toBe("both counted");
    expect(grandchild).toHaveBeenCalledTimes(1);
    expect(grandchild.mock.calls[0]![0].continuable).toBe(true);
    expect(released).toEqual(["helper"]);
    const db = new Database(join(dir, ".amc", "evidence.sqlite"), { readonly: true });
    try {
      const rows = db.prepare("SELECT event_type, meta_json FROM evidence_events WHERE session_id = ? ORDER BY rowid").all("keeping-child") as Array<{ event_type: string; meta_json: string }>;
      const completed = rows.findIndex(row => row.event_type === "agent_delegation_completed");
      const closed = rows.findIndex(row => row.event_type === "session/close" || JSON.parse(row.meta_json).kind === "session/close");
      expect(completed, "the kept-open delegation settled in the child's own log").toBeGreaterThan(-1);
      expect(JSON.parse(rows[completed]!.meta_json)).toMatchObject({ childRunAs: "helper", settledAs: "reported", reason: "the caller's run ended; the open delegate was released" });
      if (closed !== -1) expect(completed).toBeLessThan(closed);
      const denied = rows.filter(row => JSON.parse(row.meta_json).auditType === "TOOL_CALL_DENIED");
      expect(denied).toEqual([]);
    } finally { db.close(); }
  });
});
