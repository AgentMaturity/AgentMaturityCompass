import { describe, expect, test, vi } from "vitest";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { toolSearchTool } from "../src/tools/builtin/toolSearchTool.js";
import type { ToolDefinition } from "../src/tools/toolTypes.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";

const parameters = { type: "object", properties: {}, additionalProperties: false };
const digest = sha256Hex(canonicalize(parameters));
const definition = (name = "weather", overrides: Partial<ToolDefinition> = {}): ToolDefinition & { parameters: Record<string, unknown> } => ({
  name, description: "Weather forecast", actionClass: "READ_ONLY", exposure: "deferred",
  body: () => ({ ok: true, output: "weather body" }), ...overrides, parameters: overrides.parameters ?? parameters
});
function fixture(record = vi.fn(() => "activation-event")) {
  const registry = new ToolRegistry();
  registry.define(definition());
  registry.synchronizeLoadout("alice", "catalog-one");
  registry.define(toolSearchTool({
    catalog: scope => registry.catalog(scope),
    discovered: (scope, schemas) => registry.rememberDiscovery(scope, schemas),
    activate: (execution, request) => registry.activate(execution.agentId, request, record, execution.signal)
  }));
  const pipeline = new ToolPipeline({ registry, workspace: "/tmp/amc-tool-loadout" });
  const run = (args: Record<string, unknown>, agentId = "alice", requestedMode: "EXECUTE" | "SIMULATE" = "EXECUTE", signal?: AbortSignal) =>
    pipeline.execute({ name: "tool_search", agentId, arguments: args, requestedMode, ...(signal ? { signal } : {}) });
  const search = () => run({ query: "weather" });
  const activate = (name = "weather", schemaDigestSha256 = digest) => run({ activate: { name, schemaDigestSha256 } });
  return { registry, pipeline, run, search, activate, record };
}

describe("WP13 governed deferred loadouts", () => {
  test("discovery alone offers nothing; activation records before publishing the exact schema", async () => {
    const f = fixture();
    expect(f.registry.offered("alice").has("weather")).toBe(false);
    expect((await f.activate()).ok).toBe(false);
    expect((await f.search()).ok).toBe(true);
    f.record.mockImplementation(() => {
      expect(f.registry.offered("alice").has("weather")).toBe(false);
      return "activation-event";
    });
    const result = await f.activate();
    expect(result.ok).toBe(true);
    expect(JSON.parse(result.output)).toEqual({ activation: { name: "weather", schemaDigestSha256: digest, revision: 1, evidenceRef: "activation-event" } });
    expect(f.record).toHaveBeenCalledWith({ name: "weather", schemaDigestSha256: digest, revision: 1 });
    expect(f.registry.offered("alice").has("weather")).toBe(true);
    expect(f.registry.offered("bob").has("weather")).toBe(false);
  });

  test.each(["hidden", "direct"] as const)("%s tools cannot be activated even with a guessed valid digest", async exposure => {
    const f = fixture(); f.registry.define(definition("other", { exposure }));
    await f.search();
    expect((await f.activate("other")).ok).toBe(false);
    expect(f.record).not.toHaveBeenCalled();
  });

  test.each(["wrong digest", "scope denial", "global denial", "reload", "schema mutation", "catalog change"] as const)(
    "%s cannot inherit discovery or activation", async change => {
      const f = fixture(); const schema = structuredClone(parameters);
      const remove = f.registry.define(definition("changing", { parameters: schema }));
      await f.search();
      if (change === "scope denial") f.registry.restrict({ deny: new Set(["weather"]) }, "alice");
      if (change === "global denial") f.registry.restrict({ deny: new Set(["weather"]) });
      if (change === "reload") { remove(); f.registry.define(definition("changing")); }
      if (change === "schema mutation") Object.assign(schema, { title: "changed" });
      if (change === "catalog change") f.registry.synchronizeLoadout("alice", "catalog-two");
      const target = change === "reload" || change === "schema mutation" ? "changing" : "weather";
      expect((await f.activate(target, change === "wrong digest" ? "0".repeat(64) : digest)).ok).toBe(false);
      expect(f.registry.offered("alice").has(target)).toBe(false);
      expect(f.record).not.toHaveBeenCalled();
    }
  );

  test("a scoped replacement cannot inherit a global registration's discovery or activation", async () => {
    const f = fixture(); await f.search(); await f.activate();
    f.registry.define(definition(), "alice");
    expect(f.registry.offered("alice").has("weather")).toBe(false);
    expect((await f.activate()).ok).toBe(false);
    expect(f.record).toHaveBeenCalledTimes(1);
  });

  test("a failed or missing evidence reference never publishes an activation", async () => {
    for (const record of [vi.fn(() => { throw new Error("writer failed"); }), vi.fn(() => "")]) {
      const f = fixture(record); await f.search();
      expect((await f.activate()).ok).toBe(false);
      expect(f.registry.offered("alice").has("weather")).toBe(false);
    }
  });

  test.each(["revoke", "cancel", "catalog", "schema"] as const)("%s during evidence commit cannot publish stale activation", async change => {
    const f = fixture();
    const mutable = structuredClone(parameters);
    if (change === "schema") f.registry.define(definition("weather", { parameters: mutable }), "alice");
    await f.search(); const controller = new AbortController();
    f.record.mockImplementation(() => {
      if (change === "revoke") f.registry.restrict({ deny: new Set(["weather"]) });
      if (change === "cancel") controller.abort();
      if (change === "catalog") f.registry.synchronizeLoadout("alice", "catalog-two");
      if (change === "schema") Object.assign(mutable, { title: "changed during record" });
      return "stale-record";
    });
    expect((await f.run({ activate: { name: "weather", schemaDigestSha256: digest } }, "alice", "EXECUTE", controller.signal)).ok).toBe(false);
    expect(f.registry.offered("alice").has("weather")).toBe(false);
  });

  test("an already cancelled activation writes no preparation evidence", async () => {
    const f = fixture(); await f.search(); const controller = new AbortController(); controller.abort();
    expect(() => f.registry.activate("alice", { name: "weather", schemaDigestSha256: digest }, f.record, controller.signal)).toThrow();
    expect(f.record).not.toHaveBeenCalled(); expect(f.registry.offered("alice").has("weather")).toBe(false);
  });

  test("simulation never writes evidence or changes the loadout", async () => {
    const f = fixture(); await f.search();
    const result = await f.run({ activate: { name: "weather", schemaDigestSha256: digest } }, "alice", "SIMULATE");
    expect(result.ok).toBe(true); expect(result.output).toContain("SIMULATE");
    expect(f.record).not.toHaveBeenCalled(); expect(f.registry.offered("alice").has("weather")).toBe(false);
  });

  test("narrowing revokes an activation permanently even when the restriction is removed", async () => {
    const f = fixture(); await f.search(); await f.activate();
    const release = f.registry.restrict({ deny: new Set(["weather"]) }, "alice");
    release(); expect(f.registry.offered("alice").has("weather")).toBe(false);
    expect((await f.activate()).ok).toBe(false);
  });

  test("an active schema still meets the original effect-time guard", async () => {
    const f = fixture(); const body = vi.fn(() => ({ ok: true, output: "must not run" }));
    f.registry.define(definition("guarded", { body }));
    await f.search(); expect((await f.activate("guarded")).ok).toBe(true);
    f.registry.guard("target-policy", execution => execution.name === "guarded" ? "policy denies" : undefined);
    const result = await f.pipeline.execute({ name: "guarded", agentId: "alice", arguments: {}, requestedMode: "EXECUTE" });
    expect(result.denied?.stage).toBe("guard"); expect(body).not.toHaveBeenCalled();
  });

  test("activation never satisfies the target's approval requirement", async () => {
    const f = fixture(); await f.search(); await f.activate();
    const approve = vi.fn(async () => "deny" as const);
    const pipeline = new ToolPipeline({ registry: f.registry, workspace: "/tmp/amc-tool-loadout",
      approve, approvalRequiredFor: new Set(["READ_ONLY"]) });
    const result = await pipeline.execute({ name: "weather", agentId: "alice", arguments: {}, requestedMode: "EXECUTE" });
    expect(result.denied?.stage).toBe("approval"); expect(approve).toHaveBeenCalledOnce();
  });

  test("malformed argument schemas cannot enter the offered loadout", async () => {
    const f = fixture(); const parameters = { type: "not-a-json-schema-type" };
    f.registry.define(definition("malformed", { parameters })); await f.search();
    expect((await f.activate("malformed", sha256Hex(canonicalize(parameters)))).ok).toBe(false);
    expect(f.registry.offered("alice").has("malformed")).toBe(false); expect(f.record).not.toHaveBeenCalled();
  });

  test("reentrant evidence writers cannot publish two activations with one revision", () => {
    const f = fixture(); const second = definition("second"); f.registry.define(second);
    f.registry.rememberDiscovery("alice", [definition(), second]);
    expect(() => f.registry.activate("alice", { name: "weather", schemaDigestSha256: digest }, () => {
      f.registry.activate("alice", { name: "second", schemaDigestSha256: digest }, () => "inner");
      return "outer";
    })).toThrow(/stale/);
    expect(f.registry.offered("alice").has("weather")).toBe(false);
    expect(f.registry.offered("alice").has("second")).toBe(true);
  });

  test("reentrant evidence writers cannot exceed the loadout cap or reuse a revision", () => {
    const f = fixture();
    const schemas = Array.from({ length: 21 }, (_, index) => definition(`slot${index}`));
    for (const schema of schemas) f.registry.define(schema);
    for (let index = 0; index < 19; index++) {
      f.registry.rememberDiscovery("alice", [schemas[index]]);
      f.registry.activate("alice", { name: schemas[index].name, schemaDigestSha256: digest }, () => "record");
    }
    f.registry.rememberDiscovery("alice", schemas.slice(19));
    expect(() => f.registry.activate("alice", { name: "slot19", schemaDigestSha256: digest }, () => {
      f.registry.activate("alice", { name: "slot20", schemaDigestSha256: digest }, () => "inner");
      return "outer";
    })).toThrow(/stale/);
    expect(f.registry.offered("alice").size).toBe(21);
    expect(f.registry.offered("alice").has("slot19")).toBe(false);
    expect(f.registry.offered("alice").has("slot20")).toBe(true);
  });

  test("conditional activations survive step finalization but not a later denied condition", async () => {
    const f = fixture(); let allowed = true;
    f.registry.define(definition("conditional", { available: () => allowed }));
    const context = { agentId: "alice", turn: 1, step: 1, signal: new AbortController().signal };
    const dispose = await f.registry.prepareStep(context);
    await f.search(); expect((await f.activate("conditional")).ok).toBe(true); dispose();
    expect(f.registry.offered("alice").has("conditional")).toBe(false);
    const second = await f.registry.prepareStep({ ...context, step: 2 });
    expect(f.registry.offered("alice").has("conditional")).toBe(true); second(); allowed = false;
    const third = await f.registry.prepareStep({ ...context, step: 3 });
    expect(f.registry.offered("alice").has("conditional")).toBe(false); third(); allowed = true;
    const fourth = await f.registry.prepareStep({ ...context, step: 4 });
    expect(f.registry.offered("alice").has("conditional")).toBe(false); fourth();
  });

  test("active loadouts and remembered discovery remain bounded", async () => {
    const f = fixture();
    for (let index = 0; index < 21; index++) f.registry.define(definition(`weather${index}`));
    for (let index = 0; index < 20; index++) {
      f.registry.rememberDiscovery("alice", [definition(`weather${index}`)]);
      expect((await f.activate(`weather${index}`)).ok).toBe(true);
    }
    f.registry.rememberDiscovery("alice", [definition("weather20")]);
    expect((await f.activate("weather20")).ok).toBe(false);
    expect(f.registry.offered("alice").size).toBe(21); // 20 deferred schemas plus tool_search.
    expect(f.record).toHaveBeenCalledTimes(20);
  });

  test.each([{}, { activate: {} }, { activate: { name: "weather", schemaDigestSha256: "bad" } },
    { query: "weather", activate: { name: "weather", schemaDigestSha256: digest } },
    { activate: { name: "weather", schemaDigestSha256: digest, extra: true } }])("invalid activation arguments fail closed: %j", async args => {
    const f = fixture(); await f.search(); expect((await f.run(args)).ok).toBe(false); expect(f.record).not.toHaveBeenCalled();
  });
});
