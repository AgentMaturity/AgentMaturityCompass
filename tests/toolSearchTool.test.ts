import { describe, expect, test, vi } from "vitest";
import { toolSearchTool, type ToolSearchSchema } from "../src/tools/builtin/toolSearchTool.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";

const parameters = { type: "object", properties: { city: { type: "string" } }, required: ["city"] };
const forecast = { name: "weather.forecast", description: "Forecast weather and rain", parameters };

function fixture(catalog: (agentId: string) => readonly ToolSearchSchema[]) {
  const registry = new ToolRegistry();
  registry.define(toolSearchTool({ catalog }));
  const pipeline = new ToolPipeline({ registry, workspace: "/tmp/amc-tool-search-tests" });
  return (args: Record<string, unknown>, agentId = "alice", signal?: AbortSignal) => pipeline.execute({
    name: "tool_search", agentId, arguments: args, requestedMode: "EXECUTE", ...(signal ? { signal } : {})
  });
}

describe("deferred tool discovery", () => {
  test("returns reviewed metadata and schema digests without invoking or publishing bodies", async () => {
    const body = vi.fn();
    const run = fixture(() => [{ ...forecast, body, privateToken: "must-not-be-published" }]);
    const result = await run({ query: "weather" });
    expect(result.ok).toBe(true);
    expect(JSON.parse(result.output)).toEqual({ tools: [{ ...forecast, schemaDigestSha256: sha256Hex(canonicalize(parameters)) }] });
    expect(result.output).not.toContain("must-not-be-published");
    expect(body).not.toHaveBeenCalled();
  });

  test("uses TF-IDF relevance with deterministic name ordering for ties", async () => {
    const same = { description: "Weather forecast", parameters: {} };
    const run = fixture(() => [
      { name: "zeta", ...same }, { name: "unrelated", description: "Read files", parameters: {} },
      { name: "alpha", ...same }, { name: "focused", description: "Forecast forecast forecast", parameters: {} }
    ]);
    const result = await run({ query: "forecast" });
    expect(result.ok).toBe(true);
    expect(JSON.parse(result.output).tools.map((tool: ToolSearchSchema) => tool.name)).toEqual(["focused", "alpha", "zeta"]);
  });

  test("rechecks the calling scope and current catalog on every search", async () => {
    let allowed = true;
    const catalog = vi.fn((agentId: string) => allowed && agentId === "alice" ? [forecast] : []);
    const run = fixture(catalog);
    expect(JSON.parse((await run({ query: "weather" })).output).tools).toHaveLength(1);
    expect(JSON.parse((await run({ query: "weather" }, "bob")).output).tools).toEqual([]);
    allowed = false;
    expect(JSON.parse((await run({ query: "weather" })).output).tools).toEqual([]);
    expect(catalog.mock.calls).toEqual([["alice"], ["bob"], ["alice"]]);
  });

  test("bounds a large catalog by the default and explicit result limits", async () => {
    const run = fixture(() => Array.from({ length: 2_000 }, (_, index) => ({
      name: `weather${String(index).padStart(4, "0")}`, description: "Weather forecast", parameters: {}
    })));
    expect(JSON.parse((await run({ query: "weather" })).output).tools).toHaveLength(5);
    expect(JSON.parse((await run({ query: "weather", limit: 20 })).output).tools).toHaveLength(20);
    expect(JSON.parse((await run({ query: "no-matching-term" })).output).tools).toEqual([]);
  });

  test.each([
    {}, { query: "" }, { query: "   " }, { query: "x".repeat(1_001) },
    { query: "weather", limit: 0 }, { query: "weather", limit: 21 },
    { query: "weather", limit: 1.5 }, { query: "weather", extra: true }
  ])("rejects invalid discovery arguments before reading the catalog: %j", async args => {
    const catalog = vi.fn(() => [forecast]);
    const result = await fixture(catalog)(args);
    expect(result.ok).toBe(false);
    expect(catalog).not.toHaveBeenCalled();
  });

  test("fails closed when catalog admission throws and does not publish the error", async () => {
    const run = fixture(() => { throw new Error("secret-policy-error"); });
    const result = await run({ query: "weather" });
    expect(result.ok).toBe(false);
    expect(result.output).not.toContain("secret-policy-error");
    expect(result.output).not.toContain("weather.forecast");
  });

  test("cancellation during catalog admission publishes no metadata", async () => {
    const controller = new AbortController();
    const run = fixture(() => { controller.abort(); return [forecast]; });
    const result = await run({ query: "weather" }, "alice", controller.signal);
    expect(result.ok).toBe(false);
    expect(result.output).not.toContain("weather.forecast");
  });

  test("cancellation does not inspect a catalog or run a body", async () => {
    const controller = new AbortController(); controller.abort();
    const catalog = vi.fn(() => [forecast]);
    const result = await fixture(catalog)({ query: "weather" }, "alice", controller.signal);
    expect(result.ok).toBe(false);
    expect(catalog).not.toHaveBeenCalled();
  });
});
