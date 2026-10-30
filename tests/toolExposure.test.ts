import { describe, expect, test, vi } from "vitest";
import { gateToolCallsOnApproval } from "../src/agent/approvalGate.js";
import { pipelineToolSeam } from "../src/agent/pipelineToolSeam.js";
import { ToolPipeline, type ToolApprovalAnswer } from "../src/tools/toolPipeline.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import type { ToolDefinition } from "../src/tools/toolTypes.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";

type Exposure = NonNullable<ToolDefinition["exposure"]>;
const workspace = "/tmp/amc-tool-exposure";
const parameters = { type: "object", properties: {}, additionalProperties: false };
const definition = (exposure?: Exposure, name = "target"): ToolDefinition => ({
  name, actionClass: "READ_ONLY", description: "Synthetic exposure fixture", parameters,
  ...(exposure === undefined ? {} : { exposure }), body: () => ({ ok: true, output: "ran" })
});
const call = (nested = false) => ({ name: "target", agentId: "agent", arguments: {}, requestedMode: "EXECUTE" as const,
  parentToken: nested ? "trusted-program-token" : null });

describe("PI-046 tool exposure routes", () => {
  test.each([
    [undefined, false, true], [undefined, true, true],
    ["direct", false, true], ["direct", true, true],
    ["deferred", false, true], ["deferred", true, true],
    ["model-only", false, true], ["model-only", true, false],
    ["code-only", false, false], ["code-only", true, true],
    ["hidden", false, false], ["hidden", true, false]
  ] as const)("%s with nested=%s has callable=%s", async (exposure, nested, allowed) => {
    const registry = new ToolRegistry(), body = vi.fn(() => ({ ok: true, output: "ran" }));
    registry.define({ ...definition(exposure), body });
    const record = vi.fn();
    const pipeline = new ToolPipeline({ registry, workspace, record });
    const result = await pipeline.execute(call(nested));
    expect(result.ok).toBe(allowed);
    expect(body).toHaveBeenCalledTimes(allowed ? 1 : 0);
    expect(record).toHaveBeenCalledTimes(1);
    if (!allowed) expect(result.denied?.stage).toBe("visibility");
    expect(registry.visible("agent").has("target")).toBe(true);
  });

  test.each([["model-only", true], ["code-only", false], ["hidden", false], ["hidden", true]] as const)(
    "%s rejects nested=%s before approval or guards and records its own class", async (exposure, nested) => {
      const registry = new ToolRegistry(); registry.define(definition(exposure));
      const approve = vi.fn(async (): Promise<ToolApprovalAnswer> => "allow"), guard = vi.fn(() => undefined), record = vi.fn();
      registry.guard("ordinary-policy", guard);
      const pipeline = new ToolPipeline({ registry, workspace, approve, approvalRequiredFor: new Set(["READ_ONLY"]), record });
      const result = await pipeline.execute(call(nested));
      expect(result.denied?.stage).toBe("visibility");
      expect(approve).not.toHaveBeenCalled(); expect(guard).not.toHaveBeenCalled();
      expect(record).toHaveBeenCalledTimes(1);
      expect(record.mock.calls[0]?.[0]).toMatchObject({ name: "target", actionClass: "READ_ONLY", parentToken: call(nested).parentToken });
    }
  );

  test.each([
    ["hidden", "direct", false], ["hidden", "direct", true],
    ["model-only", "direct", true], ["code-only", "direct", false],
    ["model-only", "code-only", false], ["model-only", "code-only", true],
    ["code-only", "model-only", false], ["code-only", "model-only", true],
    ["direct", "hidden", false], ["direct", "hidden", true]
  ] as const)("global %s and scoped %s cannot widen nested=%s", async (globalExposure, scopedExposure, nested) => {
    const registry = new ToolRegistry(), body = vi.fn(() => ({ ok: true, output: "must not run" }));
    registry.define(definition(globalExposure));
    registry.define({ ...definition(scopedExposure), body }, "agent");
    const pipeline = new ToolPipeline({ registry, workspace });
    expect((await pipeline.execute(call(nested))).denied?.stage).toBe("visibility");
    expect(body).not.toHaveBeenCalled();
  });

  test("a captured refused route cannot become admitted when its global exposure is removed", () => {
    const registry = new ToolRegistry();
    const remove = registry.define(definition("hidden"));
    registry.define(definition("direct"), "agent");
    const admitted = registry.admissionCheck("target", "agent");
    remove();
    expect(admitted()).toBe(false);
  });

  test("registration exposure is immutable even when a caller mutates its original definition", async () => {
    const registry = new ToolRegistry(), global = definition("code-only");
    registry.define(global); registry.define(definition("direct"), "agent");
    Object.assign(global, { exposure: "direct" });
    const pipeline = new ToolPipeline({ registry, workspace });
    expect((await pipeline.execute(call())).denied?.stage).toBe("visibility");
    expect((await pipeline.execute(call(true))).ok).toBe(true);
  });

  test("model-only is offered directly while code-only and hidden cannot be discovered or activated", () => {
    const registry = new ToolRegistry();
    for (const exposure of ["direct", "deferred", "model-only", "code-only", "hidden"] as const) {
      registry.define(definition(exposure, exposure));
    }
    expect([...registry.offered("agent").keys()]).toEqual(["direct", "model-only"]);
    expect(registry.catalog("agent").map(tool => tool.name)).toEqual(["direct", "deferred", "model-only"]);
    registry.synchronizeLoadout("agent", "synthetic-exposure-catalog");
    const digest = sha256Hex(canonicalize(parameters)), record = vi.fn(() => "must-not-be-recorded");
    for (const name of ["code-only", "hidden"]) {
      registry.rememberDiscovery("agent", [{ name, parameters }]);
      expect(() => registry.activate("agent", { name, schemaDigestSha256: digest }, record)).toThrow();
    }
    expect(record).not.toHaveBeenCalled();
  });

  test("ordinary no-schema tools retain programmatic and nested execution", async () => {
    const registry = new ToolRegistry(); registry.define({ ...definition(), parameters: undefined });
    const pipeline = new ToolPipeline({ registry, workspace });
    expect((await pipeline.execute(call())).ok).toBe(true);
    expect((await pipeline.execute(call(true))).ok).toBe(true);
    expect(registry.catalog("agent")).toEqual([]);
  });

  test.each([["model-only", false], ["code-only", true], ["direct", false], ["direct", true]] as const)(
    "%s on nested=%s retains ordinary approvals and final guards", async (exposure, nested) => {
      const registry = new ToolRegistry(), body = vi.fn(() => ({ ok: true, output: "ran" }));
      registry.define({ ...definition(exposure), body });
      let answer: ToolApprovalAnswer = "deny", denied = false;
      const approve = vi.fn(async () => answer);
      registry.guard("ordinary-policy", () => denied ? "policy refuses" : undefined);
      const pipeline = new ToolPipeline({ registry, workspace, approve, approvalRequiredFor: new Set(["READ_ONLY"]) });
      expect((await pipeline.execute(call(nested))).denied?.stage).toBe("approval");
      answer = "allow"; denied = true;
      expect((await pipeline.execute(call(nested))).denied).toMatchObject({ stage: "guard", guardLabel: "ordinary-policy" });
      denied = false;
      expect((await pipeline.execute(call(nested))).ok).toBe(true);
      expect(body).toHaveBeenCalledTimes(1); expect(approve).toHaveBeenCalledTimes(3);
    }
  );

  test.each([["code-only", false], ["model-only", true], ["hidden", false], ["hidden", true]] as const)(
    "a global %s change during approval revokes the scoped route with nested=%s", async (exposure, nested) => {
      const registry = new ToolRegistry(), body = vi.fn(() => ({ ok: true, output: "must not run" }));
      const removeGlobal = registry.define(definition("direct"));
      registry.define({ ...definition("direct"), body }, "agent");
      const pipeline = new ToolPipeline({ registry, workspace, approvalRequiredFor: new Set(["READ_ONLY"]),
        approve: async () => { removeGlobal(); registry.define(definition(exposure)); return "allow"; } });
      expect((await pipeline.execute(call(nested))).denied?.stage).toBe("visibility");
      expect(body).not.toHaveBeenCalled();
    }
  );

  test.each(["code-only", "hidden"] as const)("a top-level %s call never raises the composed human approval gate", async exposure => {
    const registry = new ToolRegistry(); registry.define(definition(exposure));
    const pipeline = new ToolPipeline({ registry, workspace });
    const seam = pipelineToolSeam({ registry, pipeline, agentId: "agent" });
    const request = vi.fn(async () => { throw new Error("unreachable approval request"); });
    const gated = gateToolCallsOnApproval(seam, { request }, { actionClass: "READ_ONLY", riskTier: "low" });
    const result = await gated.execute({ callId: "exposure-approval", toolName: "target", rawArguments: "{}", sessionId: "synthetic",
      turn: 1, step: 1, parentToken: null, dispatch: "native", signal: new AbortController().signal });
    expect(result.outcome).toBe("DENIED"); expect(request).not.toHaveBeenCalled();
  });
});
