import { describe, expect, test, vi } from "vitest";
import { LlmError } from "../src/llm/llmFailure.js";
import { resolveRetryPolicy } from "../src/llm/retryPolicy.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { pipelineToolSeam } from "../src/agent/pipelineToolSeam.js";
import { runStep, type StepRunnerInit } from "../src/agent/stepRunner.js";
import type { ToolDefinition } from "../src/tools/toolTypes.js";

const context = (agentId = "agent", signal = new AbortController().signal) => ({ agentId, turn: 1, step: 1, signal });
const tool = (overrides: Partial<ToolDefinition> = {}): ToolDefinition => ({
  name: "conditional", description: "Read a conditional fixture", actionClass: "READ_ONLY",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  body: () => ({ ok: true, output: "ran" }), ...overrides
});
const call = (name = "conditional", agentId = "agent") => ({ name, agentId, arguments: {}, requestedMode: "EXECUTE" as const });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe("WP13 step-owned tool availability", () => {
  test("a condition admits only its owning step and is sampled once", async () => {
    const registry = new ToolRegistry();
    const available = vi.fn(() => true);
    registry.define(tool({ available }));
    const pipeline = new ToolPipeline({ registry, workspace: "/tmp/amc-wp13-availability" });
    expect((await pipeline.execute(call())).denied?.stage).toBe("visibility");
    const dispose = await registry.prepareStep(context());
    expect((await pipeline.execute(call())).ok).toBe(true);
    expect((await pipeline.execute(call("conditional", "other"))).denied?.stage).toBe("visibility");
    expect(available).toHaveBeenCalledTimes(1);
    dispose(); dispose();
    expect((await pipeline.execute(call())).denied?.stage).toBe("visibility");
    expect(available).toHaveBeenCalledTimes(1);
  });

  test("a condition cannot mutate the owner context or strand its admission", async () => {
    const registry = new ToolRegistry();
    registry.define(tool({ available: step => {
      expect(() => Object.assign(step, { agentId: "other" })).toThrow();
      return true;
    } }));
    const input = context();
    const dispose = await registry.prepareStep(input);
    input.agentId = "changed by caller";
    dispose();
    expect(registry.visible("agent").has("conditional")).toBe(false);
    const next = await registry.prepareStep(context());
    next();
  });

  test("mutating a definition cannot opt out of its registered condition", async () => {
    const registry = new ToolRegistry();
    const definition = tool({ available: () => true });
    registry.define(definition);
    const dispose = await registry.prepareStep(context());
    Object.assign(definition, { available: undefined });
    dispose();
    expect(registry.visible("agent").has("conditional")).toBe(false);
    const pipeline = new ToolPipeline({ registry, workspace: "/tmp/amc-wp13-availability" });
    expect((await pipeline.execute(call())).denied?.stage).toBe("visibility");
  });

  test("a condition callback cannot mutate private registration state through its receiver", async () => {
    const registry = new ToolRegistry();
    registry.define(tool({ available: function(this: unknown) {
      if (this !== undefined) Object.assign(this as object, { available: undefined });
      return true;
    } }));
    const dispose = await registry.prepareStep(context());
    dispose();
    expect(registry.visible("agent").has("conditional")).toBe(false);
  });

  test("conditions changing between steps cannot retain authority", async () => {
    const registry = new ToolRegistry();
    let enabled = true;
    registry.define(tool({ available: () => enabled }));
    const dispose = await registry.prepareStep(context());
    enabled = false;
    expect(registry.visible("agent").has("conditional")).toBe(true);
    dispose();
    const next = await registry.prepareStep({ ...context(), step: 2 });
    expect(registry.visible("agent").has("conditional")).toBe(false);
    dispose(); // An old owner cannot dispose the next step.
    next();
    enabled = true;
    const last = await registry.prepareStep({ ...context(), step: 3 });
    dispose(); next();
    expect(registry.visible("agent").has("conditional")).toBe(true);
    last();
  });

  test.each(["global deny", "scope deny", "global allow", "scope allow"])("%s wins over availability", async restriction => {
    const registry = new ToolRegistry();
    registry.define(tool({ available: () => true }));
    const dispose = await registry.prepareStep(context());
    registry.restrict(restriction.includes("deny") ? { deny: new Set(["conditional"]) } : { allow: new Set(["other"]) },
      restriction.startsWith("scope") ? "agent" : undefined);
    registry.restrict({ allow: new Set(["conditional"]) }, "agent");
    expect(registry.visible("agent").has("conditional")).toBe(false);
    expect(registry.catalog("agent")).toEqual([]);
    dispose();
  });

  test("only an explicit boolean true admits a condition", async () => {
    const registry = new ToolRegistry();
    registry.define(tool({ available: () => "yes" as unknown as boolean }));
    const dispose = await registry.prepareStep(context());
    expect(registry.visible("agent").has("conditional")).toBe(false);
    dispose();
  });

  test("two failed conditions cannot publish a parallel success or retain ownership", async () => {
    const registry = new ToolRegistry();
    const first = deferred<boolean>(); const second = deferred<boolean>();
    registry.define(tool({ available: async () => true }));
    const removeFirst = registry.define(tool({ name: "first", available: async () => { await first.promise; throw new Error("first failed"); } }));
    const removeSecond = registry.define(tool({ name: "second", available: async () => { await second.promise; throw new Error("second failed"); } }));
    const preparation = registry.prepareStep(context());
    const rejected = expect(preparation).rejects.toThrow("first failed");
    first.resolve(false); await rejected;
    removeFirst(); removeSecond();
    const dispose = await registry.prepareStep(context());
    second.resolve(false); await Promise.resolve();
    expect(registry.visible("agent").has("conditional")).toBe(true);
    dispose();
    expect(registry.visible("agent").has("conditional")).toBe(false);
  });

  test("asynchronous denial never publishes a conditional tool", async () => {
    const registry = new ToolRegistry();
    const condition = deferred<boolean>();
    registry.define(tool({ available: () => condition.promise }));
    const preparation = registry.prepareStep(context());
    expect(registry.visible("agent").has("conditional")).toBe(false);
    condition.resolve(false);
    const dispose = await preparation;
    expect(registry.visible("agent").has("conditional")).toBe(false);
    dispose();
  });

  test("cancellation rejects pending preparation and ignores late admission", async () => {
    const registry = new ToolRegistry();
    const condition = deferred<boolean>();
    let enabled = false;
    registry.define(tool({ available: () => enabled || condition.promise }));
    const abort = new AbortController();
    const preparation = registry.prepareStep(context("agent", abort.signal));
    const rejected = expect(preparation).rejects.toThrow();
    abort.abort(new Error("step cancelled"));
    await rejected;
    enabled = true;
    const dispose = await registry.prepareStep({ ...context(), step: 2 });
    condition.resolve(true);
    await Promise.resolve();
    expect(registry.visible("agent").has("conditional")).toBe(true);
    dispose();
    expect(registry.visible("agent").has("conditional")).toBe(false);
  });

  test("a rejected preparation releases the owner and never admits parallel successes", async () => {
    const registry = new ToolRegistry();
    registry.define(tool({ available: async () => true }));
    const remove = registry.define(tool({ name: "broken", available: async () => { throw new Error("denied preparation"); } }));
    await expect(registry.prepareStep(context())).rejects.toThrow("denied preparation");
    expect(registry.visible("agent").size).toBe(0);
    remove();
    const dispose = await registry.prepareStep(context());
    expect(registry.visible("agent").has("conditional")).toBe(true);
    dispose();
  });

  test("re-registering even the same definition does not inherit its step admission", async () => {
    const registry = new ToolRegistry();
    const definition = tool({ available: () => true });
    const remove = registry.define(definition);
    const dispose = await registry.prepareStep(context());
    remove(); registry.define(definition);
    expect(registry.visible("agent").has("conditional")).toBe(false);
    dispose();
  });

  test.each(["step end", "new step", "restriction", "registration"])("%s during approval blocks the selected body", async change => {
    const registry = new ToolRegistry();
    const body = vi.fn(() => ({ ok: true, output: "must not run" }));
    const definition = tool({ available: change === "registration" ? undefined : () => true, body });
    const remove = registry.define(definition);
    const dispose = await registry.prepareStep(context());
    const entered = deferred<void>();
    const approval = deferred<"allow">();
    const pipeline = new ToolPipeline({ registry, workspace: "/tmp/amc-wp13-availability",
      approvalRequiredFor: new Set(["READ_ONLY"]), approve: () => { entered.resolve(); return approval.promise; } });
    const pending = pipeline.execute(call());
    await entered.promise;
    let next: (() => void) | undefined;
    if (change === "step end" || change === "new step") dispose();
    if (change === "new step") next = await registry.prepareStep({ ...context(), step: 2 });
    if (change === "restriction") registry.restrict({ deny: new Set(["conditional"]) });
    if (change === "registration") { remove(); registry.define(definition); }
    approval.resolve("allow");
    expect((await pending).denied?.stage).toBe("visibility");
    expect(body).not.toHaveBeenCalled();
    dispose(); next?.();
  });

  test("a guard cannot revoke availability then let the body run", async () => {
    const registry = new ToolRegistry();
    const body = vi.fn(() => ({ ok: true, output: "must not run" }));
    registry.define(tool({ available: () => true, body }));
    const dispose = await registry.prepareStep(context());
    registry.guard("narrows-without-denying", () => { registry.restrict({ deny: new Set(["conditional"]) }); });
    const pipeline = new ToolPipeline({ registry, workspace: "/tmp/amc-wp13-availability" });
    expect((await pipeline.execute(call())).denied?.stage).toBe("visibility");
    expect(body).not.toHaveBeenCalled();
    dispose();
  });

  test("an ownership change during preparation revokes the step before the model is prepared", async () => {
    const registry = new ToolRegistry();
    registry.define(tool({ available: async () => true }));
    const seam = pipelineToolSeam({ registry, pipeline: new ToolPipeline({ registry, workspace: "/tmp/amc-wp13-availability" }), agentId: "agent" });
    const prepare = vi.fn();
    let fences = 0;
    const init = { session: { assertDispatchFence() { if (++fences > 1) throw new Error("new owner"); } },
      tools: seam, llm: { prepare } } as unknown as StepRunnerInit;
    await expect(runStep(init, 1, 1, context().signal)).rejects.toThrow("new owner");
    expect(prepare).not.toHaveBeenCalled();
    expect(registry.visible("agent").has("conditional")).toBe(false);
  });

  test("retrying a successful step retains one admission and identical offered schemas", async () => {
    const registry = new ToolRegistry();
    const available = vi.fn(() => true);
    registry.define(tool({ available }));
    const seam = pipelineToolSeam({ registry, pipeline: new ToolPipeline({ registry, workspace: "/tmp/amc-wp13-availability" }), agentId: "agent" });
    const schemas: unknown[] = [];
    const retry = new LlmError("synthetic retry", "RATE_LIMIT");
    let attempt = 0;
    const prepare = vi.fn((spec: { tools: unknown }) => {
      schemas.push(spec.tools);
      const fail = ++attempt === 1;
      return { route: { retryPolicy: resolveRetryPolicy({ mode: "normal", maxRetries: 1 }, "fixture") },
        async *stream() { if (fail) throw retry; },
        settled: { outcomeEventId: "synthetic-outcome", assembly: { blocks: [], usage: null, finishReason: { kind: "stop" } } } };
    });
    const recordLoopEvent = vi.fn();
    const init = { session: { assertDispatchFence() {}, recordLoopEvent }, tools: seam, llm: { prepare },
      route: { providerId: "fixture", model: "fixture", params: {} }, systemPromptEventId: "fixture",
      retryRuntime: { random: () => 0, sleep: async () => {} }, notify() {} } as unknown as StepRunnerInit;
    expect(await runStep(init, 1, 1, context().signal)).toMatchObject({ ending: { reason: "complete" } });
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(recordLoopEvent).toHaveBeenCalledTimes(1);
    expect(schemas[0]).toBe(schemas[1]);
    expect(schemas[0]).toMatchObject([{ name: "conditional" }]);
    expect(available).toHaveBeenCalledTimes(1);
    expect(registry.visible("agent").has("conditional")).toBe(false);
  });

  test("deferred metadata is searchable without offering or executing it; hidden/code-only metadata stays private", async () => {
    const registry = new ToolRegistry();
    registry.define(tool({ name: "direct" }));
    registry.define(tool({ name: "lazy", exposure: "deferred" }));
    registry.define(tool({ name: "secret", exposure: "hidden" }));
    registry.define(tool({ name: "internal", parameters: undefined }));
    const seam = pipelineToolSeam({ registry, pipeline: new ToolPipeline({ registry, workspace: "/tmp/amc-wp13-availability" }), agentId: "agent" });
    expect(seam.schemas()?.map(item => item.name)).toEqual(["direct"]);
    expect(registry.catalog("agent").map(item => item.name)).toEqual(["direct", "lazy"]);
    expect(registry.catalog("agent").every(item => !("body" in item))).toBe(true);
  });

  test.each(["error", "cancel"])("runStep revokes availability on %s", async ending => {
    const registry = new ToolRegistry();
    registry.define(tool({ available: () => true }));
    const abort = new AbortController();
    const seam = pipelineToolSeam({ registry, pipeline: new ToolPipeline({ registry, workspace: "/tmp/amc-wp13-availability" }), agentId: "agent" });
    const prepare = vi.fn(() => {
      expect(registry.visible("agent").has("conditional")).toBe(true);
      if (ending === "cancel") abort.abort(new Error("cancelled model"));
      throw new Error("model boundary fixture");
    });
    // dispatchStepRequest is exercised up to real model preparation. No provider or ledger is needed for its failure.
    const init = { session: { assertDispatchFence() {} }, tools: seam, llm: { prepare },
      route: { providerId: "fixture", model: "fixture", params: {} }, systemPromptEventId: "fixture",
      retryRuntime: { policy: { maxAttempts: 1 } }, notify() {} } as unknown as StepRunnerInit;
    await expect(runStep(init, 1, 1, abort.signal)).rejects.toThrow("model boundary fixture");
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(registry.visible("agent").has("conditional")).toBe(false);
  });
});
