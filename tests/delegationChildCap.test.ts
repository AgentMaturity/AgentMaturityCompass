import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { delegateTool } from "../src/agent/delegateTool.js";
import { workflowTool } from "../src/workflow/workflowTool.js";
import { SessionService } from "../src/session/sessionService.js";
import * as packets from "../src/fleet/delegationPacket.js";
import * as handoffs from "../src/fleet/handoffPacket.js";
import { spawnSubagent, type SpawnSubagentInit, type SubagentRunResult } from "../src/agent/subagentSpawn.js";
import type { LoopEventRecord } from "../src/session/loopEventMeta.js";
import type { ToolBodyResult, ToolExecution } from "../src/tools/toolTypes.js";

const dirs: string[] = [];
const sessions: SessionService[] = [];
afterEach(() => {
  for (const session of sessions.splice(0)) session.disposeWithoutClosing();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function workspace(): string {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "delegation-child-cap-fixture");
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-child-cap-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  return dir;
}
function recorder(sessionId = "root-session") {
  const rows: LoopEventRecord[] = [];
  const projected: Array<{ meta: Record<string, unknown> }> = [];
  return { sessionId, rows, projected,
    recordLoopEvent: (row: LoopEventRecord) => { rows.push(row); return null; },
    recordProjectedEvidence: (row: { meta: Record<string, unknown> }) => { projected.push(row); return null; } };
}
function nativeSession(dir: string, sessionId: string) {
  const session = new SessionService(dir);
  sessions.push(session);
  session.open({ sessionId, agentId: "default", harnessVersion: "test", compositionDigest: "composition", policyDigest: "policy" });
  return session;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
const answer = { ok: true, text: "child answer" };
type Init = Partial<SpawnSubagentInit>;
function spawn(dir: string, session: ReturnType<typeof recorder>, over: Init = {}) {
  return spawnSubagent({ workspace: dir, parent: rootIdentity("default"),
    request: { runAs: "child", goal: "bounded work" }, session,
    runner: async () => answer, mintSessionId: () => "child-session", ...over });
}
function held() {
  const entered = deferred<void>();
  const done = deferred<SubagentRunResult>();
  const runner = vi.fn(async () => { entered.resolve(); return done.promise; });
  return { entered, done, runner };
}

describe("root-wide active child admission", () => {
  it("reserves before signing, admits eight of twelve, and records refusals without queuing", async () => {
    const dir = workspace(), session = recorder(), child = held();
    const mint = vi.spyOn(packets, "mintDelegationPacketAsync");
    const pending = Array.from({ length: 12 }, (_, index) => spawn(dir, session, {
      request: { runAs: `child-${index}`, goal: "bounded work" }, runner: child.runner,
      mintSessionId: () => `session-${index}` }));
    const signedCallsBeforeAwait = mint.mock.calls.length;
    child.done.resolve(answer);
    const outcomes = await Promise.all(pending);
    expect(signedCallsBeforeAwait, "slots are reserved before the first await").toBe(8);
    expect(child.runner).toHaveBeenCalledTimes(8);
    expect(outcomes.filter(outcome => !outcome.ok)).toHaveLength(4);
    for (const outcome of outcomes.filter(outcome => !outcome.ok)) {
      expect(outcome).toMatchObject({ ok: false, packetId: null, reason: expect.stringContaining("maxActiveChildren=8") });
    }
    expect(session.projected.filter(row => row.meta.kind === "delegation/admission-refused")).toHaveLength(4);
    expect(session.rows.filter(row => row.kind === "delegation-started")).toHaveLength(8);
    expect(handoffs.listHandoffPackets(dir)).toHaveLength(8);
  });

  it.each([2, 10])("honours an operator capacity of %s", async limit => {
    const dir = workspace(), session = recorder(), child = held();
    const pending = Array.from({ length: limit + 1 }, () => spawn(dir, session, {
      maxActiveChildren: limit, runner: child.runner }));
    child.done.resolve(answer);
    const outcomes = await Promise.all(pending);
    expect(outcomes.filter(outcome => outcome.ok)).toHaveLength(limit);
    expect(child.runner).toHaveBeenCalledTimes(limit);
  });

  it("shares the root limit with descendants, even under a wider descendant configuration", async () => {
    const dir = workspace(), session = recorder(), child = held();
    let descendant: Awaited<ReturnType<typeof spawnSubagent>> | undefined;
    const first = spawn(dir, session, { maxActiveChildren: 1, runner: async context => {
      descendant = await spawn(dir, recorder("child-session"), { parent: context.identity,
        maxActiveChildren: 100, runner: child.runner });
      return answer;
    } });
    // Broken admission must still finish the regression rather than hang.
    child.done.resolve(answer);
    expect((await first).ok).toBe(true);
    expect(descendant).toMatchObject({ ok: false, packetId: null, reason: expect.stringContaining("maxActiveChildren=1") });
    expect(child.runner).not.toHaveBeenCalled();
  });

  it("keeps retained children counted and frees their slot on close", async () => {
    const dir = workspace(), session = recorder();
    const resource = { continue: vi.fn(async () => answer), close: vi.fn() };
    const retained = await spawn(dir, session, { maxActiveChildren: 1,
      request: { runAs: "retained", goal: "bounded work", continuable: true },
      runner: async () => ({ ...answer, continuation: resource }) });
    expect(retained.ok && retained.handle).toBeTruthy();
    const refused = await spawn(dir, session, { maxActiveChildren: 1 });
    if (retained.ok) await retained.handle?.close("reported", "released");
    expect(refused.ok).toBe(false);
    expect((await spawn(dir, session, { maxActiveChildren: 1 })).ok).toBe(true);
    expect(resource.close).toHaveBeenCalledTimes(1);
  });

  it("holds an abandoned runner's slot until execution really returns", async () => {
    const dir = workspace(), session = recorder(), child = held(), controller = new AbortController();
    const pending = spawn(dir, session, { maxActiveChildren: 1, runner: child.runner,
      signal: controller.signal, cancelGraceMs: 0 });
    await child.entered.promise;
    controller.abort();
    const abandoned = await pending;
    const whileRunning = await spawn(dir, session, { maxActiveChildren: 1 });
    child.done.resolve(answer);
    await vi.waitFor(async () => expect((await spawn(dir, session, { maxActiveChildren: 1 })).ok).toBe(true));
    expect(abandoned).toMatchObject({ ok: false, reason: expect.stringContaining("execution stop unconfirmed") });
    expect(whileRunning.ok, "accounting settlement cannot create spare execution capacity").toBe(false);
  });

  it("releases reservations on signing failure and announcement failure", async () => {
    const dir = workspace(), session = recorder();
    vi.spyOn(packets, "mintDelegationPacketAsync").mockRejectedValueOnce(new Error("signer refused"));
    expect((await spawn(dir, session, { maxActiveChildren: 1 })).ok).toBe(false);
    expect((await spawn(dir, session, { maxActiveChildren: 1 })).ok).toBe(true);
    const broken = recorder("announcement-failure");
    vi.spyOn(broken, "recordLoopEvent").mockImplementationOnce(() => { throw new Error("writer refused"); });
    await expect(spawn(dir, broken, { maxActiveChildren: 1 })).rejects.toThrow("writer refused");
    expect((await spawn(dir, broken, { maxActiveChildren: 1 })).ok).toBe(true);
  });

  it("releases an unstarted slot even when packet cleanup fails", async () => {
    const dir = workspace(), session = recorder();
    vi.spyOn(session, "recordLoopEvent").mockImplementationOnce(() => { throw new Error("announcement refused"); });
    vi.spyOn(handoffs, "removeHandoffPacketIfCurrent").mockImplementationOnce(() => { throw new Error("cleanup refused"); });
    await expect(spawn(dir, session, { maxActiveChildren: 1 })).rejects.toThrow("cleanup refused");
    expect((await spawn(dir, session, { maxActiveChildren: 1 })).ok).toBe(true);
  });

  it("isolates root sessions and workspaces while sharing canonical workspace aliases", async () => {
    const dir = workspace(), other = workspace(), session = recorder(), child = held();
    const alias = join(dir, "workspace-alias");
    symlinkSync(dir, alias);
    const pending = spawn(dir, session, { maxActiveChildren: 1, runner: child.runner });
    await child.entered.promise;
    const sameRoot = await spawn(alias, recorder(session.sessionId), { maxActiveChildren: 1 });
    const otherSession = await spawn(dir, recorder("different-root"), { maxActiveChildren: 1 });
    const otherWorkspace = await spawn(other, recorder(session.sessionId), { maxActiveChildren: 1 });
    child.done.resolve(answer);
    await pending;
    expect(sameRoot.ok).toBe(false);
    expect(otherSession.ok).toBe(true);
    expect(otherWorkspace.ok).toBe(true);
  });

  it("allows an operator to disable delegation with zero capacity", async () => {
    const dir = workspace(), session = recorder(), runner = vi.fn(async () => answer);
    const outcome = await spawn(dir, session, { maxActiveChildren: 0, runner });
    expect(outcome).toMatchObject({ ok: false, packetId: null, reason: expect.stringContaining("maxActiveChildren=0") });
    expect(runner).not.toHaveBeenCalled();
    expect(handoffs.listHandoffPackets(dir)).toHaveLength(0);
  });

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, "8"])("fails closed for invalid operator limit %s", async invalid => {
    const dir = workspace(), session = recorder(), runner = vi.fn(async () => answer);
    const outcome = await spawn(dir, session, { maxActiveChildren: invalid as number, runner });
    expect(outcome).toMatchObject({ ok: false, packetId: null, reason: expect.stringContaining("maxActiveChildren must be") });
    expect(runner).not.toHaveBeenCalled();
    expect(handoffs.listHandoffPackets(dir)).toHaveLength(0);
  });

  it("takes the tool limit from its capability, snapshots it, and ignores model attempts to widen it", async () => {
    const dir = workspace(), session = recorder(), child = held();
    const capability = { identity: rootIdentity("default"), runner: child.runner, session, maxActiveChildren: 1 };
    const tool = delegateTool(capability);
    capability.maxActiveChildren = 100;
    const execution = { workspace: dir, arguments: { runAs: "child", goal: "bounded work", maxActiveChildren: 100 } } as unknown as ToolExecution;
    const pending = tool.body(execution);
    await child.entered.promise;
    const second = tool.body(execution);
    child.done.resolve(answer);
    const [first, next] = await Promise.all([pending, second]);
    expect(first.ok).toBe(true);
    expect(next).toMatchObject({ ok: false, output: expect.stringContaining("maxActiveChildren=1") });
    expect(child.runner).toHaveBeenCalledTimes(1);
  });

  it("preserves the root pool when a descendant workflow snapshots its identity", async () => {
    const dir = workspace(), session = recorder(), runner = vi.fn(async () => answer);
    let descendant: ToolBodyResult | undefined;
    await spawn(dir, session, { maxActiveChildren: 1, runner: async context => {
      const tool = workflowTool({ identity: context.identity, runner, session: nativeSession(dir, context.childSessionId) });
      descendant = await tool.body({ workspace: dir, token: "descendant-workflow", arguments: {
        plan: { kind: "agent", id: "nested", runAs: "grandchild", goal: "bounded work" }
      } } as unknown as ToolExecution);
      return answer;
    } });
    expect(descendant).toMatchObject({ ok: false, output: expect.stringContaining("maxActiveChildren=1") });
    expect(runner).not.toHaveBeenCalled();
  });

  it("forwards snapshotted operator capacity through the workflow tool", async () => {
    const dir = workspace(), session = nativeSession(dir, "workflow-root"), runner = vi.fn(async () => answer);
    const capability = { identity: rootIdentity("default"), runner, session, maxActiveChildren: 0 };
    const tool = workflowTool(capability);
    capability.maxActiveChildren = 100;
    const result = await tool.body({ workspace: dir, token: "workflow-cap", arguments: {
      maxActiveChildren: 100, plan: { kind: "agent", id: "nested", runAs: "child", goal: "bounded work" }
    } } as unknown as ToolExecution);
    expect(result).toMatchObject({ ok: false, output: expect.stringContaining("maxActiveChildren=0") });
    expect(runner).not.toHaveBeenCalled();
  });

});
