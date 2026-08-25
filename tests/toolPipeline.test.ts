import { describe, expect, it } from "vitest";
import { ToolRegistry, defineTool } from "../src/tools/toolRegistry.js";
import { ToolPipeline, type ToolApprovalAnswer } from "../src/tools/toolPipeline.js";
import type { ToolExecution } from "../src/tools/toolTypes.js";

/**
 * P4.1's four verification criteria, each as a test that fails if the property
 * is lost:
 *
 *   1. a call traverses the pipeline with a denied-then-approved path
 *   2. a guard cannot launder a denial by ordering
 *   3. outcome fields are orthogonal (exitCode AND timedOut)
 *   4. arguments are frozen
 */
const WORKSPACE = "/tmp/amc-tool-pipeline-tests";

function echoTool(overrides: Partial<Parameters<typeof defineTool>[0]> = {}) {
  return defineTool({
    name: "echo",
    actionClass: "READ_ONLY",
    description: "returns its argument",
    body: (execution) => ({ output: String(execution.arguments.text ?? "") }),
    ...overrides
  });
}

describe("a call traverses the full pipeline", () => {
  it("is denied, then proceeds once approval is granted", async () => {
    const registry = new ToolRegistry();
    registry.define(echoTool({ name: "deploy", actionClass: "DEPLOY" }));

    let answer: ToolApprovalAnswer = "deny";
    const pipeline = new ToolPipeline({
      registry,
      workspace: WORKSPACE,
      approvalRequiredFor: new Set(["DEPLOY"]),
      approve: async () => answer
    });

    const call = { name: "deploy", agentId: "a", arguments: { text: "ship" }, requestedMode: "EXECUTE" as const };

    const denied = await pipeline.execute(call);
    expect(denied.ok).toBe(false);
    expect(denied.denied?.stage).toBe("approval");
    expect(denied.output, "a denied call must not produce the tool's output").toBe("");

    answer = "allow";
    const allowed = await pipeline.execute(call);
    expect(allowed.ok).toBe(true);
    expect(allowed.output).toBe("ship");
  });

  it("denies an unanswered approval rather than treating silence as yes", async () => {
    const registry = new ToolRegistry();
    registry.define(echoTool({ name: "deploy", actionClass: "DEPLOY" }));
    const pipeline = new ToolPipeline({
      registry,
      workspace: WORKSPACE,
      approvalRequiredFor: new Set(["DEPLOY"]),
      approve: async () => { throw new Error("answerer is down"); }
    });

    const outcome = await pipeline.execute({
      name: "deploy", agentId: "a", arguments: {}, requestedMode: "EXECUTE"
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.denied?.reason).toBe("approval unavailable");
  });

  it("denies when approval is required and no answerer is composed at all", async () => {
    const registry = new ToolRegistry();
    registry.define(echoTool({ name: "deploy", actionClass: "DEPLOY" }));
    const pipeline = new ToolPipeline({
      registry, workspace: WORKSPACE, approvalRequiredFor: new Set(["DEPLOY"])
    });

    const outcome = await pipeline.execute({
      name: "deploy", agentId: "a", arguments: {}, requestedMode: "EXECUTE"
    });
    expect(outcome.denied?.stage).toBe("approval");
  });

  it("reports an unknown tool as a visibility denial, distinct from a policy one", async () => {
    const pipeline = new ToolPipeline({ registry: new ToolRegistry(), workspace: WORKSPACE });
    const outcome = await pipeline.execute({
      name: "nope", agentId: "a", arguments: {}, requestedMode: "EXECUTE"
    });
    expect(outcome.denied?.stage).toBe("visibility");
    expect(outcome.denied?.guardLabel).toBeNull();
  });
});

describe("a guard cannot launder a denial by ordering", () => {
  it("stays denied no matter where a permissive guard is registered", async () => {
    // The type has no allow inhabitant, so a guard that WANTS to permit can
    // only return undefined — which means "leave unchanged", not "allow".
    // Registering it first, last, globally and per-scope must all read the same.
    for (const order of ["permissive-first", "permissive-last"] as const) {
      const registry = new ToolRegistry();
      registry.define(echoTool());
      const permissive = (): string | undefined => undefined;
      const denying = (): string => "policy forbids echo";

      if (order === "permissive-first") {
        registry.guard("permissive", permissive);
        registry.guard("denying", denying);
      } else {
        registry.guard("denying", denying);
        registry.guard("permissive", permissive);
      }

      const pipeline = new ToolPipeline({ registry, workspace: WORKSPACE });
      const outcome = await pipeline.execute({
        name: "echo", agentId: "a", arguments: { text: "hi" }, requestedMode: "EXECUTE"
      });
      expect(outcome.ok, order).toBe(false);
      expect(outcome.denied?.stage, order).toBe("guard");
      expect(outcome.denied?.guardLabel, order).toBe("denying");
    }
  });

  it("is not overturned by an approval granted upstream", async () => {
    // Approval runs BEFORE guards precisely so that a grant cannot reach past
    // a policy denial. If these stages were reordered this test goes red.
    const registry = new ToolRegistry();
    registry.define(echoTool({ name: "deploy", actionClass: "DEPLOY" }));
    registry.guard("firewall", () => "blocked by policy");

    const pipeline = new ToolPipeline({
      registry,
      workspace: WORKSPACE,
      approvalRequiredFor: new Set(["DEPLOY"]),
      approve: async () => "allow"
    });

    const outcome = await pipeline.execute({
      name: "deploy", agentId: "a", arguments: {}, requestedMode: "EXECUTE"
    });
    expect(outcome.denied?.stage, "the guard is the last word").toBe("guard");
  });

  it("cannot be cleared by a post-execute filter", async () => {
    // Filters rewrite output. A denied call has no output to rewrite, and the
    // filter must not run at all on one.
    const registry = new ToolRegistry();
    registry.define(echoTool());
    registry.guard("denying", () => "no");
    let filterRan = false;
    const pipeline = new ToolPipeline({
      registry,
      workspace: WORKSPACE,
      filters: [(text) => { filterRan = true; return `${text}-filtered`; }]
    });

    const outcome = await pipeline.execute({
      name: "echo", agentId: "a", arguments: {}, requestedMode: "EXECUTE"
    });
    expect(outcome.denied).not.toBeNull();
    expect(filterRan, "a denied call never reaches the filters").toBe(false);
  });

  it("lets a scoped guard deny what the global layer left alone", async () => {
    const registry = new ToolRegistry();
    registry.define(echoTool());
    registry.guard("scoped", () => "this agent may not echo", "restricted-agent");
    const pipeline = new ToolPipeline({ registry, workspace: WORKSPACE });

    const free = await pipeline.execute({
      name: "echo", agentId: "free-agent", arguments: { text: "hi" }, requestedMode: "EXECUTE"
    });
    const restricted = await pipeline.execute({
      name: "echo", agentId: "restricted-agent", arguments: { text: "hi" }, requestedMode: "EXECUTE"
    });

    expect(free.ok).toBe(true);
    expect(restricted.denied?.guardLabel).toBe("scoped");
  });
});

describe("outcome fields are orthogonal", () => {
  it("reports a timeout AND an exit code, not one collapsed status", async () => {
    // A killed process has both. A single status enum would have to pick one,
    // and whichever it picked would be a lie about the other.
    const registry = new ToolRegistry();
    registry.define(defineTool({
      name: "slow",
      actionClass: "READ_ONLY",
      description: "times out",
      body: () => ({ output: "partial", exitCode: 143, timedOut: true })
    }));
    const pipeline = new ToolPipeline({ registry, workspace: WORKSPACE });

    const outcome = await pipeline.execute({
      name: "slow", agentId: "a", arguments: {}, requestedMode: "EXECUTE"
    });
    expect(outcome.timedOut).toBe(true);
    expect(outcome.exitCode).toBe(143);
    expect(outcome.output, "output survives a timeout").toBe("partial");
  });

  it("keeps denial separate from exit status", async () => {
    const registry = new ToolRegistry();
    registry.define(echoTool());
    registry.guard("denying", () => "no");
    const pipeline = new ToolPipeline({ registry, workspace: WORKSPACE });

    const outcome = await pipeline.execute({
      name: "echo", agentId: "a", arguments: {}, requestedMode: "EXECUTE"
    });
    expect(outcome.denied).not.toBeNull();
    expect(outcome.exitCode, "a call that never ran has no exit status").toBeNull();
    expect(outcome.timedOut).toBe(false);
  });

  it("distinguishes a tool that threw from a tool that was denied", async () => {
    const registry = new ToolRegistry();
    registry.define(defineTool({
      name: "boom", actionClass: "READ_ONLY", description: "throws",
      body: () => { throw new Error("disk on fire"); }
    }));
    const pipeline = new ToolPipeline({ registry, workspace: WORKSPACE });

    const outcome = await pipeline.execute({
      name: "boom", agentId: "a", arguments: {}, requestedMode: "EXECUTE"
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.denied, "policy allowed this call; it simply failed").toBeNull();
    expect(outcome.output).toContain("disk on fire");
  });
});

describe("arguments are frozen", () => {
  it("cannot be mutated by a guard between the decision and the body", async () => {
    const registry = new ToolRegistry();
    let seenByBody = "";
    registry.define(defineTool({
      name: "echo", actionClass: "READ_ONLY", description: "echo",
      body: (execution) => {
        seenByBody = String(execution.arguments.path ?? "");
        return { output: seenByBody };
      }
    }));

    let mutationThrew = false;
    registry.guard("tamperer", (execution: ToolExecution) => {
      try {
        (execution.arguments as Record<string, unknown>).path = "/etc/shadow";
      } catch {
        mutationThrew = true;
      }
      return undefined;
    });

    const pipeline = new ToolPipeline({ registry, workspace: WORKSPACE });
    await pipeline.execute({
      name: "echo", agentId: "a", arguments: { path: "/safe/file" }, requestedMode: "EXECUTE"
    });

    expect(mutationThrew, "frozen in strict mode, so the write throws").toBe(true);
    expect(seenByBody, "the body ran on the arguments that were approved").toBe("/safe/file");
  });

  it("is detached from the caller's object", async () => {
    const registry = new ToolRegistry();
    registry.define(echoTool());
    const pipeline = new ToolPipeline({ registry, workspace: WORKSPACE });

    const caller = { text: "original", nested: { deep: "value" } };
    const result = await pipeline.execute({
      name: "echo", agentId: "a", arguments: caller, requestedMode: "EXECUTE"
    });
    caller.text = "changed after the call";

    expect(result.output).toBe("original");
    expect(Object.isFrozen(caller), "the caller keeps its own mutable object").toBe(false);
  });

  it("freezes nested structures, not just the top level", async () => {
    const registry = new ToolRegistry();
    let nestedFrozen = false;
    registry.define(defineTool({
      name: "peek", actionClass: "READ_ONLY", description: "peek",
      body: (execution) => {
        nestedFrozen = Object.isFrozen((execution.arguments as { nested: unknown }).nested);
        return { output: "" };
      }
    }));
    const pipeline = new ToolPipeline({ registry, workspace: WORKSPACE });

    await pipeline.execute({
      name: "peek", agentId: "a", arguments: { nested: { deep: [1, 2] } }, requestedMode: "EXECUTE"
    });
    expect(nestedFrozen).toBe(true);
  });

  it("refuses arguments JSON would silently mangle", async () => {
    const registry = new ToolRegistry();
    registry.define(echoTool());
    const pipeline = new ToolPipeline({ registry, workspace: WORKSPACE });

    // NaN becomes null and an undefined member vanishes. Recording arguments
    // that differ from the ones the tool ran is worse than refusing the call.
    await expect(pipeline.execute({
      name: "echo", agentId: "a", arguments: { limit: Number.NaN }, requestedMode: "EXECUTE"
    })).rejects.toThrow(/losslessly JSON-serializable/);

    await expect(pipeline.execute({
      name: "echo", agentId: "a", arguments: { cb: () => "x" }, requestedMode: "EXECUTE"
    })).rejects.toThrow(/losslessly JSON-serializable/);
  });
});

describe("restrictions narrow, never widen", () => {
  it("hides a globally registered tool from a restricted scope", async () => {
    const registry = new ToolRegistry();
    registry.define(echoTool());
    registry.define(echoTool({ name: "write", actionClass: "WRITE_HIGH" }));
    registry.restrict({ deny: new Set(["write"]) }, "limited");

    expect([...registry.visible("limited").keys()]).toEqual(["echo"]);
    expect([...registry.visible("other").keys()].sort()).toEqual(["echo", "write"]);
  });

  it("shows only what an allow-list names", () => {
    // The narrowing direction of `allow`, which the deny-list tests do not
    // exercise: dropping the allow check entirely leaves those green.
    const registry = new ToolRegistry();
    registry.define(echoTool());
    registry.define(echoTool({ name: "write", actionClass: "WRITE_HIGH" }));
    registry.restrict({ allow: new Set(["echo"]) }, "reader");

    expect([...registry.visible("reader").keys()]).toEqual(["echo"]);
    expect([...registry.visible("other").keys()].sort()).toEqual(["echo", "write"]);
  });

  it("cannot re-admit a name the global layer denied", () => {
    // An allow-list in a scope intersects with what is already visible. If it
    // could union, a scope would be able to grant itself a tool the
    // deployment removed.
    const registry = new ToolRegistry();
    registry.define(echoTool());
    registry.define(echoTool({ name: "write", actionClass: "WRITE_HIGH" }));
    registry.restrict({ deny: new Set(["write"]) });
    registry.restrict({ allow: new Set(["echo", "write"]) }, "greedy");

    expect([...registry.visible("greedy").keys()]).toEqual(["echo"]);
  });
});
