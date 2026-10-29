import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry, defineTool } from "../src/tools/toolRegistry.js";
import { ToolPipeline, RUN_CODE_TOOL, type ToolPipelineInit } from "../src/tools/toolPipeline.js";
import { registerCodeTransport } from "../src/codemode/runCodeTool.js";
import { CodeModeRunner, type CodeToolResult } from "../src/codemode/codeModeRunner.js";
import type { ToolDefinition, ToolExecution } from "../src/tools/toolTypes.js";

/**
 * WP15: Code Mode admission and settlement are bounded and observable.
 *
 * Each block names the gap row it pins (GAP_ANALYSIS 3.5, PI-048/D39, PXA-37, PXB-14..18, DXB-20, DXC-13, PXA-02).
 */
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function workdir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-code-settle-")));
  dirs.push(dir);
  return dir;
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function harness(options: {
  tools?: readonly ToolDefinition[];
  limits?: { wallMs: number; maxResultBytes: number; maxToolCalls: number; maxApprovalWaitMs?: number };
  pipeline?: Partial<ToolPipelineInit>;
  guard?: (execution: ToolExecution) => string | undefined;
} = {}) {
  const registry = new ToolRegistry();
  for (const tool of options.tools ?? []) registry.define(tool);
  if (options.guard) registry.guard("test", options.guard);
  let pipeline: ToolPipeline;
  registerCodeTransport(registry, {
    pipeline: () => pipeline,
    confined: () => true,
    limits: options.limits ?? { wallMs: 4_000, maxResultBytes: 20_000, maxToolCalls: 10 }
  });
  pipeline = new ToolPipeline({ registry, workspace: workdir(), mode: "code", ...options.pipeline });
  return {
    pipeline,
    run: (source: string, extra: { signal?: AbortSignal; args?: Record<string, unknown> } = {}) => pipeline.execute({
      name: RUN_CODE_TOOL, agentId: "alice", arguments: { source, ...extra.args }, requestedMode: "EXECUTE",
      ...(extra.signal ? { signal: extra.signal } : {})
    })
  };
}

describe("admission is reserved before the first await (3.5, PI-048, D39)", () => {
  it("a Promise.all burst admits exactly maxToolCalls while every dispatch is held", async () => {
    const hold = deferred<CodeToolResult>();
    let entered = 0;
    const runner = new CodeModeRunner({
      confined: true,
      limits: { wallMs: 4_000, maxResultBytes: 20_000, maxToolCalls: 3 },
      abandonGraceMs: 100,
      dispatch: async () => { entered += 1; return hold.promise; }
    });
    const outcome = await runner.run(
      "await Promise.all(Array.from({ length: 12 }, (_, i) => tools.echo({ i }))); return 'finished';"
    );
    hold.resolve({ ok: true, value: "late" });
    expect(outcome.failure).toBe("call-budget");
    expect(entered, "admission must count accepted calls, not completed ones").toBe(3);
    expect(outcome.calls).toHaveLength(3);
  });

  it("drops nonfinite, negative and fractional ids instead of admitting them", async () => {
    let entered = 0;
    const runner = new CodeModeRunner({ confined: true, dispatch: async () => { entered += 1; return { ok: true, value: null }; } });
    const outcome = await runner.run(`
      const { parentPort } = require("node:worker_threads");
      for (const id of [NaN, Infinity, -1, 1.5, 2 ** 60]) parentPort.postMessage({ kind: "call", id, name: "echo", args: {} });
      await new Promise((r) => setTimeout(r, 150));
      return "ok";
    `);
    expect(outcome.ok).toBe(true);
    expect(entered).toBe(0);
  });

  it("admits nothing after a verdict, even a call posted in the same tick", async () => {
    let entered = 0;
    const runner = new CodeModeRunner({ confined: true, dispatch: async () => { entered += 1; return { ok: true, value: null }; } });
    const outcome = await runner.run(`
      const { parentPort } = require("node:worker_threads");
      parentPort.postMessage({ kind: "done", value: "forged-early" });
      for (let id = 100; id < 110; id++) parentPort.postMessage({ kind: "call", id, name: "echo", args: {} });
      await new Promise((r) => setTimeout(r, 200));
      return "late";
    `);
    expect(outcome.value).toBe("forged-early");
    expect(entered, "a stopping program's calls must never reach the pipeline").toBe(0);
  });
});

describe("settlement is observed, bounded and immutable (3.5, PI-048, D39, PXB-18)", () => {
  it("an early return with an unawaited call never reads as a clean completion", async () => {
    const hold = deferred<CodeToolResult>();
    const runner = new CodeModeRunner({ confined: true, abandonGraceMs: 100, dispatch: () => hold.promise });
    const outcome = await runner.run("void tools.write({}); await new Promise((r) => setTimeout(r, 50)); return 'returned';");
    expect(outcome.calls.map((call) => call.status), "an abandoned accepted call is unknown, never ok").toEqual(["unknown"]);
    hold.resolve({ ok: true, value: "late" });
  });

  it("observes the worker's exit and a late settle neither mutates the result nor rejects", async () => {
    const rejections: unknown[] = [];
    const watch = (reason: unknown): void => { rejections.push(reason); };
    process.on("unhandledRejection", watch);
    try {
      const hold = deferred<CodeToolResult>();
      const runner = new CodeModeRunner({ confined: true, abandonGraceMs: 50, dispatch: () => hold.promise });
      const outcome = await runner.run("void tools.slow({}); return 'returned';");
      expect(outcome.workerExitMs, "published completion requires an observed worker exit").not.toBeNull();
      const before = JSON.stringify(outcome.calls);
      hold.resolve({ ok: true, value: "late" });
      await sleep(100);
      expect(JSON.stringify(outcome.calls)).toBe(before);
      expect(Object.isFrozen(outcome.calls)).toBe(true);
      expect(rejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", watch);
    }
  });

  it("reports run_code's effect as unknown when a sub-call outlives the grace", async () => {
    const hold = deferred<void>();
    const stuck = defineTool({
      name: "stuck", actionClass: "READ_ONLY", description: "ignores cancellation",
      body: async () => { await hold.promise; return { ok: true, output: "late" }; }
    });
    const h = harness({ tools: [stuck] });
    const outcome = await h.run("void tools.stuck({}); await new Promise((r) => setTimeout(r, 50)); return 'returned';");
    hold.resolve();
    expect(outcome.effect, "the loop maps this to TOOL_OUTCOME_UNKNOWN, never OK").toBe("unknown");
    expect(outcome.output).toContain("unknown stuck");
  }, 15_000);

  it("refuses an aborted call before any worker exists", async () => {
    const controller = new AbortController();
    controller.abort();
    const runner = new CodeModeRunner({ confined: true, dispatch: async () => ({ ok: true, value: null }) });
    const outcome = await runner.run("return 1;", controller.signal);
    expect(outcome.failure).toBe("cancelled");
    expect(outcome.workerStarted).toBe(false);
  });

  it("holds a worker slot until the worker has actually exited (PXB-18)", async () => {
    const runner = new CodeModeRunner({
      confined: true, limits: { wallMs: 300, maxResultBytes: 1_000, maxToolCalls: 1 }, dispatch: async () => ({ ok: true, value: null })
    });
    const started = Date.now();
    const outcomes = await Promise.all(Array.from({ length: 5 }, () => runner.run("while (true) {}")));
    expect(outcomes.every((outcome) => outcome.failure === "timeout")).toBe(true);
    expect(Date.now() - started, "a fifth spinning program waits for a slot, so two wall budgets pass").toBeGreaterThanOrEqual(580);
  });
});

describe("the enclosing signal reaches every sub-call through the same pipeline (PXA-37)", () => {
  it("aborting run_code aborts an in-flight nested call", async () => {
    let sawAbort = false;
    const waits = defineTool({
      name: "waits", actionClass: "READ_ONLY", description: "waits for its signal",
      body: (execution) => new Promise((resolve) => {
        execution.signal?.addEventListener("abort", () => { sawAbort = true; resolve({ ok: false, output: "stopped" }); });
      })
    });
    const h = harness({ tools: [waits] });
    const controller = new AbortController();
    const running = h.run("return await tools.waits({});", { signal: controller.signal });
    await sleep(300);
    controller.abort();
    const outcome = await running;
    expect(sawAbort, "the nested body must see the parent's cancellation").toBe(true);
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("cancelled");
  });
});

describe("approval waits do not consume the execution budget (DXB-20)", () => {
  const write = (ran: { count: number }) => defineTool({
    name: "write", actionClass: "WRITE_LOW", description: "a write",
    body: () => { ran.count += 1; return { ok: true, output: "wrote" }; }
  });

  it("a sub-call approved after the wall budget still completes", async () => {
    const ran = { count: 0 };
    const h = harness({
      tools: [write(ran)],
      limits: { wallMs: 400, maxResultBytes: 20_000, maxToolCalls: 10 },
      pipeline: { approvalRequiredFor: new Set(["WRITE_LOW"]), approve: async () => { await sleep(900); return "allow"; } }
    });
    const outcome = await h.run("return await tools.write({});");
    expect(outcome.ok, outcome.output).toBe(true);
    expect(ran.count).toBe(1);
  });

  it("a sub-call whose approval answers after the program timed out is re-checked before its body", async () => {
    const ran = { count: 0 };
    const h = harness({
      tools: [write(ran)],
      limits: { wallMs: 2_000, maxResultBytes: 20_000, maxToolCalls: 10, maxApprovalWaitMs: 300 },
      pipeline: { approvalRequiredFor: new Set(["WRITE_LOW"]), approve: async () => { await sleep(800); return "allow"; } }
    });
    const outcome = await h.run("return await tools.write({});");
    expect(outcome.output).toContain("waited on approvals");
    await sleep(1_000);
    expect(ran.count, "the grant arrived after the program's verdict: the body must not run").toBe(0);
  });

  it("a sub-call approved after the program timed out never runs, and a bound gate sees the withdrawal", async () => {
    const ran = { count: 0 };
    let gateSawAbort = false;
    const h = harness({
      tools: [write(ran)],
      limits: { wallMs: 2_000, maxResultBytes: 20_000, maxToolCalls: 10, maxApprovalWaitMs: 300 },
      // The answerer ignores cancellation and grants late: the pipeline must still refuse to dispatch.
      pipeline: { approvalRequiredFor: new Set(["WRITE_LOW"]), approve: async () => { await sleep(800); return "allow"; } }
    });
    h.pipeline.bindApprovalGate({
      gates: (name) => name === "write",
      ask: (execution) => new Promise((resolve) => {
        execution.signal?.addEventListener("abort", () => { gateSawAbort = true; resolve({ approvalRequestIds: ["late-grant"] }); });
      })
    });
    const outcome = await h.run("return await tools.write({});");
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("timeout");
    await sleep(1_000);
    expect(gateSawAbort, "the pending approval is withdrawn through the sub-call signal").toBe(true);
    expect(ran.count, "a late grant must never dispatch the body").toBe(0);
  });
});

describe("program console output is captured, never written to AMC's stdout (PXB-14)", () => {
  it("keeps a forged JSON line off the host stdout and returns it to the model", async () => {
    const writes = vi.spyOn(process.stdout, "write");
    try {
      const h = harness();
      const outcome = await h.run("console.log('{\"forged\":true}'); return 1;");
      await sleep(100);
      expect(writes.mock.calls.some(([chunk]) => String(chunk).includes("forged"))).toBe(false);
      expect(outcome.ok).toBe(true);
      expect(outcome.output).toContain('{"forged":true}');
    } finally {
      writes.mockRestore();
    }
  });

  it("returns what a failing program logged before it threw", async () => {
    const h = harness();
    const outcome = await h.run("console.error('partial progress'); throw new Error('deliberate');");
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("deliberate");
    expect(outcome.output).toContain("partial progress");
  });

  it("bounds what it keeps", async () => {
    const runner = new CodeModeRunner({ confined: true, dispatch: async () => ({ ok: true, value: null }) });
    const outcome = await runner.run("for (let i = 0; i < 2000; i++) console.log('y'.repeat(100)); return 1;");
    expect(Buffer.byteLength(outcome.console, "utf8")).toBeLessThan(70 * 1024);
    expect(outcome.console).toContain("console bytes dropped");
  });
});

describe("write sub-calls respect the exclusive-write barrier (PXB-15)", () => {
  function overlapProbe() {
    const state = { active: 0, maxActive: 0 };
    const tool = (name: string) => defineTool({
      name, actionClass: "WRITE_LOW", description: "records overlap",
      body: async () => {
        state.active += 1;
        state.maxActive = Math.max(state.maxActive, state.active);
        await sleep(60);
        state.active -= 1;
        return { ok: true, output: name };
      }
    });
    return { state, tools: [tool("w1"), tool("w2")] };
  }

  it("Promise.all of two write sub-calls never overlaps their bodies", async () => {
    const probe = overlapProbe();
    const h = harness({ tools: probe.tools });
    const outcome = await h.run("return await Promise.all([tools.w1({}), tools.w2({}), tools.w1({})]);");
    expect(outcome.ok, outcome.output).toBe(true);
    expect(probe.state.maxActive).toBe(1);
  });

  it("a write cancelled while it waits for its turn never runs and does not hold the line", async () => {
    const hold = deferred<void>();
    let second = 0;
    let third = 0;
    const registry = new ToolRegistry();
    registry.define(defineTool({ name: "first", actionClass: "WRITE_LOW", description: "x", body: async () => { await hold.promise; return { ok: true, output: "1" }; } }));
    registry.define(defineTool({ name: "second", actionClass: "WRITE_LOW", description: "x", body: () => { second += 1; return { ok: true, output: "2" }; } }));
    registry.define(defineTool({ name: "third", actionClass: "WRITE_LOW", description: "x", body: () => { third += 1; return { ok: true, output: "3" }; } }));
    const pipeline = new ToolPipeline({ registry, workspace: workdir() });
    const call = (name: string, signal?: AbortSignal) => pipeline.execute({ name, agentId: "alice", arguments: {}, requestedMode: "EXECUTE",
      ...(signal ? { signal } : {}) });
    const first = call("first");
    const controller = new AbortController();
    const waiting = call("second", controller.signal);
    const after = call("third");
    controller.abort();
    const cancelled = await waiting;
    expect(cancelled.ok).toBe(false);
    expect(cancelled.output).toContain("not dispatched");
    hold.resolve();
    await Promise.all([first, after]);
    expect(second).toBe(0);
    expect(third).toBe(1);
  });

  it("two parallel run_code calls never overlap their write sub-calls", async () => {
    const probe = overlapProbe();
    const h = harness({ tools: probe.tools });
    const [a, b] = await Promise.all([h.run("return await tools.w1({});"), h.run("return await tools.w2({});")]);
    expect(a.ok && b.ok).toBe(true);
    expect(probe.state.maxActive).toBe(1);
  });
});

describe("sub-calls carry a structured outcome (PXA-02 via WP33, DXC-13)", () => {
  it("surfaces a sub-call's exit code to the program", async () => {
    const exits = defineTool({
      name: "exits", actionClass: "READ_ONLY", description: "exits 2",
      body: () => ({ ok: false, output: "boom", exitCode: 2 })
    });
    const h = harness({ tools: [exits] });
    const outcome = await h.run("try { await tools.exits({}); return 'no'; } catch (e) { return { exitCode: e.exitCode, status: e.status }; }");
    expect(outcome.output).toContain('"exitCode":2');
    expect(outcome.output).toContain('"status":"failed"');
  });

  it("lists a failed sub-call as failed and a guard refusal as denied", async () => {
    const throws = defineTool({ name: "throws", actionClass: "READ_ONLY", description: "x", body: () => { throw new Error("broken"); } });
    const blocked = defineTool({ name: "blocked", actionClass: "READ_ONLY", description: "x", body: () => ({ ok: true, output: "no" }) });
    const h = harness({ tools: [throws, blocked], guard: (execution) => (execution.name === "blocked" ? "nope" : undefined) });
    const outcome = await h.run("try { await tools.throws({}); } catch {} try { await tools.blocked({}); } catch {} return 'done';");
    expect(outcome.output).toContain("failed throws");
    expect(outcome.output).toContain("denied blocked");
  });

  it("timeoutMs narrows the composed wall budget and can never raise it", async () => {
    const h = harness({ limits: { wallMs: 1_500, maxResultBytes: 20_000, maxToolCalls: 10 } });
    let started = Date.now();
    const narrowed = await h.run("while (true) {}", { args: { timeoutMs: 200, description: "spin" } });
    expect(narrowed.output).toContain("200ms");
    expect(Date.now() - started).toBeLessThan(1_400);
    started = Date.now();
    const clamped = await h.run("while (true) {}", { args: { timeoutMs: 60_000 } });
    expect(clamped.output).toContain("1500ms");
  });
});

describe("a large valid result is returned rather than failed (PXB-16)", () => {
  it("returns a 1 MB string under the default limits", async () => {
    const runner = new CodeModeRunner({ confined: true, dispatch: async () => ({ ok: true, value: null }) });
    const outcome = await runner.run("return 'z'.repeat(1_000_000);");
    expect(outcome.ok).toBe(true);
    expect(String(outcome.value)).toHaveLength(1_000_000);
  });
});
