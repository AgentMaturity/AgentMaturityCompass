import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initToolsConfig, loadToolsConfig, signToolsConfig, toolsConfigPath } from "../src/toolhub/toolhubValidators.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import type { ToolDefinition } from "../src/tools/toolTypes.js";
import { webSearchTool, type WebSearchProvider, type WebSearchReceipt } from "../src/tools/builtin/webSearchTool.js";
import { todoTool, readSessionTodo } from "../src/tools/builtin/todoTool.js";
import { planTool, readSessionPlan } from "../src/tools/builtin/planTool.js";

/**
 * web_search, todo and plan (AMC-1549).
 *
 * web_search ships with NO provider and refuses until composition supplies
 * one; the provider's requests go through the same origin-allowlisted, capped
 * fetch as web_fetch. todo and plan are signed, session-bound records under
 * the session's own directory, and a tampered or foreign record refuses.
 */
const PASS = "native-tool-breadth-pass";
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = process.env["AMC_VAULT_PASSPHRASE"] ?? PASS;
  const dir = mkdtempSync(join(tmpdir(), "amc-native-breadth-"));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initToolsConfig(dir);
  return dir;
}

function signPolicy(dir: string, hostAllowlist: string[]): void {
  const config = loadToolsConfig(dir);
  config.tools.allowedTools.push({ name: "web_search", actionClass: "NETWORK_EXTERNAL", allow: { hostAllowlist } } as (typeof config.tools.allowedTools)[number]);
  writeFileSync(toolsConfigPath(dir), YAML.stringify(config));
  signToolsConfig(dir);
}

function pipeline(dir: string, tool: ToolDefinition, agentId = "default") {
  const registry = new ToolRegistry();
  registry.define(tool);
  const p = new ToolPipeline({ registry, workspace: dir });
  return (args: Record<string, unknown>, mode: "EXECUTE" | "SIMULATE" = "EXECUTE") =>
    p.execute({ name: tool.name, agentId, arguments: args, requestedMode: mode });
}

const jsonProvider = (endpoint: string): WebSearchProvider => ({
  id: "test-json",
  origin: new URL(endpoint).origin,
  async search({ query, get }) {
    const response = await get(`${endpoint}?q=${encodeURIComponent(query)}`);
    return JSON.parse(response.body) as { title: string; url: string; snippet: string }[];
  }
});

describe("web_search", () => {
  it("refuses until a provider is configured — there is no default", async () => {
    const dir = workspace();
    signPolicy(dir, ["search.example.test"]);
    const outcome = await pipeline(dir, webSearchTool({ record: () => undefined }))({ query: "eu ai act" });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("no search provider is configured");
  });

  it("refuses a provider whose endpoint origin is not on the signed web_search allowlist", async () => {
    const dir = workspace();
    signPolicy(dir, []);
    const calls: string[] = [];
    const fetchStub = (async (input: unknown) => { calls.push(String(input)); return new Response("[]"); }) as typeof fetch;
    const outcome = await pipeline(dir, webSearchTool({ provider: jsonProvider("http://127.0.0.1:1/search"), record: () => undefined, fetch: fetchStub }))({ query: "x" });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("no allowlisted origins");
    expect(calls).toEqual([]);
  });

  it("renders redacted results and writes a digest receipt", async () => {
    const dir = workspace();
    signPolicy(dir, ["search.example.test"]);
    const body = JSON.stringify([
      { title: "NIST AI RMF", url: "https://www.nist.gov/itl/ai-risk-management-framework", snippet: "token ghp_abcdefghijklmnopqrstuvwxyz0123456789 leaked" }
    ]);
    const fetchStub = (async () => new Response(body, { headers: { "content-type": "application/json" } })) as typeof fetch;
    const receipts: WebSearchReceipt[] = [];
    const outcome = await pipeline(dir, webSearchTool({ provider: jsonProvider("https://search.example.test/api"), record: (r) => { receipts.push(r); }, fetch: fetchStub }))({ query: "nist ai rmf" });
    expect(outcome.ok).toBe(true);
    expect(outcome.output).toContain("NIST AI RMF");
    expect(outcome.output).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(receipts[0]).toMatchObject({ auditType: "NATIVE_WEB_SEARCH", provider: "test-json", resultCount: 1, redactions: { github_token: 1 } });
    expect(JSON.stringify(receipts[0])).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
  });

  it("refuses a provider request to an origin other than the one it declared, even if allowlisted", async () => {
    const dir = workspace();
    signPolicy(dir, ["search.example.test", "other.example.test"]);
    const calls: string[] = [];
    const fetchStub = (async (input: unknown) => { calls.push(String(input)); return new Response("[]"); }) as typeof fetch;
    const provider: WebSearchProvider = { ...jsonProvider("https://other.example.test/api"), origin: "https://search.example.test" };
    const outcome = await pipeline(dir, webSearchTool({ provider, record: () => undefined, fetch: fetchStub }))({ query: "x" });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("declared origin");
    expect(calls).toEqual([]);
  });
});

describe("todo and plan records", () => {
  it("writes a signed, session-bound todo list and chains revisions", async () => {
    const dir = workspace();
    const run = pipeline(dir, todoTool({ sessionId: "sess-a" }));
    const first = await run({ items: [{ id: "1", content: "Read the policy", status: "in_progress" }] });
    expect(first.ok).toBe(true);
    expect(first.output).toContain("[~] Read the policy");
    const second = await run({ items: [{ id: "1", content: "Read the policy", status: "completed" }, { id: "2", content: "Draft", status: "pending" }] });
    expect(second.ok).toBe(true);
    const record = readSessionTodo(dir, "sess-a");
    expect(record?.revision).toBe(2);
    expect(record?.previousSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(record?.sessionId).toBe("sess-a");
    expect(record?.items.map((item) => item.status)).toEqual(["completed", "pending"]);
  });

  it("refuses to build on a tampered record", async () => {
    const dir = workspace();
    const run = pipeline(dir, todoTool({ sessionId: "sess-b" }));
    await run({ items: [{ id: "1", content: "one", status: "pending" }] });
    const file = join(dir, ".amc", "native-tools", "sess-b", "todo.json");
    const stored = JSON.parse(readFileSync(file, "utf8")) as { record: { items: { content: string }[] } };
    stored.record.items[0]!.content = "edited outside the tool";
    writeFileSync(file, JSON.stringify(stored));
    const outcome = await run({ items: [{ id: "1", content: "two", status: "pending" }] });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("signature");
    expect(() => readSessionTodo(dir, "sess-b")).toThrow(/signature/);
  });

  it("refuses a record that belongs to a different agent", async () => {
    const dir = workspace();
    await pipeline(dir, todoTool({ sessionId: "sess-c" }), "agent-one")({ items: [{ id: "1", content: "x", status: "pending" }] });
    const outcome = await pipeline(dir, todoTool({ sessionId: "sess-c" }), "agent-two")({ items: [] });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("bound to");
  });

  it("refuses an unsafe session id, at construction or when a resolver yields one", async () => {
    expect(() => todoTool({ sessionId: "../escape" })).toThrow(/session id/);
    const outcome = await pipeline(workspace(), todoTool({ sessionId: () => "../escape" }))({ items: [] });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("session id");
  });

  it("reads a session resolver at call time, as agentToolset's rebindable sessionId requires", async () => {
    const dir = workspace();
    let current = "sess-first";
    const run = pipeline(dir, todoTool({ sessionId: () => current }));
    await run({ items: [{ id: "1", content: "first", status: "pending" }] });
    current = "sess-forked";
    await run({ items: [{ id: "1", content: "forked", status: "pending" }] });
    expect(readSessionTodo(dir, "sess-first")?.items[0]?.content).toBe("first");
    expect(readSessionTodo(dir, "sess-forked")?.items[0]?.content).toBe("forked");
    expect(readSessionTodo(dir, "sess-forked")?.revision).toBe(1);
  });

  it("plan is the same signed store with its own record kind", async () => {
    const dir = workspace();
    const run = pipeline(dir, planTool({ sessionId: "sess-p" }));
    const outcome = await run({ summary: "Map obligations", steps: [{ id: "s1", title: "Collect sources", status: "done" }, { id: "s2", title: "Encode", status: "blocked" }] });
    expect(outcome.ok).toBe(true);
    expect(outcome.output).toContain("Map obligations");
    expect(readSessionPlan(dir, "sess-p")?.steps).toHaveLength(2);
    expect(readSessionTodo(dir, "sess-p")).toBeNull();
    const simulated = await run({ steps: [] }, "SIMULATE");
    expect(simulated.output).toContain("SIMULATE");
    expect(readSessionPlan(dir, "sess-p")?.revision).toBe(1);
  });
});
