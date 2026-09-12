/** Authored, UNEXECUTED. P01 selectors -> native encoder/adapter -> recorded usage.
 * Only upstream NDJSON is scripted. These are not live Ollama/model/cache measurements.
 */
import { stepUsage } from "./helpers/stepUsage.js";
import { EventEmitter } from "node:events";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverNativeProviders, routeFor, paramsFor } from "../src/cli-agent-options.js";
import { acpRouteFor, startAcpStdio, type AcpStdioHandle } from "../src/acp/acpStdioMain.js";
import { acpSupportsImageInput } from "../src/acp/acpPromptInput.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime, type PreparedCall } from "../src/llm/adapter/llmRuntime.js";
import type { HttpRequest, HttpResponse, HttpTransport } from "../src/llm/adapter/transport.js";
import { LocalCredentialsService } from "../src/credentials/localCredentialsService.js";
import { SessionService } from "../src/session/sessionService.js";
import { readAgentRunSummary, renderRunSummary } from "../src/agent/runReport.js";
import { projectNativeRunUsage } from "../src/agent/nativeRunUsage.js";
import { initWorkspace } from "../src/workspace.js";

const MODEL = "batch1-scripted-model:tag";
const roots: string[] = [], writers = new Set<SessionService>();
const stores: LocalCredentialsService[] = [], handles = new Set<AcpStdioHandle>();
afterEach(async () => {
  try {
    for (const handle of handles) await handle.close(); handles.clear();
    for (const writer of writers) writer.disposeWithoutClosing(); writers.clear();
    for (const store of stores.splice(0)) await store.close();
  } finally {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
  }
});
function workspace(): string {
  vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "batch1-unexecuted-fixture-passphrase");
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-batch1-ollama-"))); roots.push(root);
  initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
  return root;
}
function responseText(metrics: Record<string, unknown>, trailer = ""): string {
  const base = { model: MODEL, created_at: "2026-09-11T06:00:00Z" };
  return [
    JSON.stringify({ ...base, message: { role: "assistant", content: "Scripted native response." }, done: false }),
    JSON.stringify({ ...base, message: { role: "assistant", content: "" }, done: true, done_reason: "stop", ...metrics })
  ].join("\n") + "\n" + trailer;
}
function response(metrics: Record<string, unknown>, trailer = ""): HttpResponse {
  const bytes = Buffer.from(responseText(metrics, trailer));
  return { status: 200, headers: { "content-type": "application/x-ndjson" }, body: (async function* () {
    for (let offset = 0; offset < bytes.length; offset += 5) yield bytes.subarray(offset, offset + 5);
  })() };
}
function harness(surface: "cli" | "acp", reply: HttpResponse) {
  const root = workspace();
  const output = { log: vi.fn(), error: vi.fn(), fail: vi.fn() };
  const route = surface === "cli" ? routeFor(output, "ollama", {}, MODEL)
    : acpRouteFor({ workspace: root, agentId: "default", providerId: "ollama", model: MODEL, systemPrompt: "Recorded fixture." });
  if (route === null || "error" in route) throw new Error("Native Ollama selection was refused");
  const writer = new SessionService(root); writers.add(writer);
  writer.open({ agentId: "default", harnessVersion: "batch1-unexecuted", compositionDigest: "batch1-fixture", policyDigest: "batch1-fixture" });
  const system = writer.recordSystemPrompt("Use the selected native route. Report only observed facts.");
  writer.startTurn({ trigger: "user" }); writer.recordUserMessage("A scripted native request."); writer.startStep();
  const credentials = new LocalCredentialsService({ env: {}, homeDir: join(root, "empty-home"), projectDir: null, includeDotenv: false, watch: false });
  stores.push(credentials);
  const registry = new AdapterRegistry(); registry.register(route);
  const sent: HttpRequest[] = [];
  const transport: HttpTransport = async request => {
    if (sent.length) throw new Error("Unexpected additional fixture dispatch");
    sent.push({ ...request, body: Buffer.from(request.body), headers: { ...request.headers } });
    return reply;
  };
  const runtime = new LlmRuntime({ session: writer, credentials, registry, transport });
  const call = runtime.prepare({ providerId: route.providerId, model: MODEL, params: paramsFor("ollama", 37),
    tools: null, systemPromptEventId: system.eventId, requiredProtocol: "ollama-chat" });
  function finish(prepared: PreparedCall, failed = false) {
    writer.endStep({ stopReason: prepared.settled?.assembly.finishReason?.kind ?? "error", usage: stepUsage(prepared.settled?.assembly.usage) });
    writer.endTurn({ reason: failed ? "error" : "complete" }); writer.sealTurn();
    const events = writer.readEvents(), sessionId = writer.sessionId;
    writer.close({ reason: "batch1-fixture-ended" }); writers.delete(writer);
    // This harness has no running loop driver. Request failure stays in the
    // actual recorded outcome, not an invented driver-status enum value.
    return { events, summary: readAgentRunSummary(root, sessionId, "idle") };
  }
  return { call, sent, finish };
}
async function drain(call: PreparedCall): Promise<void> { for await (const _chunk of call.stream()) { /* consume the real decoder and recorder */ } }

describe.each(["cli", "acp"] as const)("P01 %s-selected Ollama recorded usage", surface => {
  it.each([
    { prompt: 12, output: 4, cached: undefined, input: 12, read: null, eligible: 0, hits: 0, rate: null, share: null },
    { prompt: 12, output: 4, cached: 0, input: 12, read: 0, eligible: 1, hits: 0, rate: 0, share: 0 },
    { prompt: 12, output: 4, cached: 5, input: 7, read: 5, eligible: 1, hits: 1, rate: 1, share: 5 / 12 },
    { prompt: 0, output: 0, cached: 0, input: 0, read: 0, eligible: 1, hits: 0, rate: 0, share: null }
  ])("preserves omitted versus reported cache counts ($cached)", async row => {
    const h = harness(surface, response({ prompt_eval_count: row.prompt, eval_count: row.output, load_duration: 9000,
      ...(row.cached === undefined ? {} : { prompt_eval_cached_count: row.cached }) }));
    await drain(h.call);
    const { events, summary } = h.finish(h.call), usage = summary.usage!;
    const contract = discoverNativeProviders("ollama").usageCache;
    expect(usage.cache.basis).toBe(contract.tokenShareBasis);
    expect(usage.requestCache?.basis).toBe(contract.requestHitRateBasis);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toMatchObject({ url: "http://127.0.0.1:11434/api/chat", redirect: "error" });
    expect(h.sent[0]!.headers.authorization).toBeUndefined();
    expect(JSON.parse(h.sent[0]!.body.toString())).toMatchObject({ model: MODEL, options: { num_predict: 37 } });
    const header = events.find(event => event.event_type === "request/header")!;
    const outcome = events.find(event => event.event_type === "request/response")!;
    expect(JSON.parse(header.meta_json)).toMatchObject({ providerId: "ollama", model: MODEL, encoderId: "ollama-chat", encoderVersion: 1 });
    expect(JSON.parse(outcome.meta_json)).toMatchObject({ headerEventId: header.id, adapterId: "ollama-chat", adapterVersion: 1,
      outcome: "completed", usage: { reported: true, complete: true, inputTokens: row.input, outputTokens: row.output,
        cacheReadTokens: row.read, cacheWriteTokens: null, reasoningTokens: null } });
    expect(usage).toMatchObject({ status: "recorded", requests: 1, reportedRequests: 1, completeRequests: 1,
      totals: { inputTokens: { observedTokens: row.input }, outputTokens: { observedTokens: row.output },
        cacheReadTokens: { observedTokens: row.read }, cacheWriteTokens: { observedTokens: null, reportedRequests: 0 } },
      cache: { readShare: row.share, eligibleRequests: row.eligible, unreportedWriteRequests: row.eligible },
      requestCache: { hitRequests: row.hits, eligibleRequests: row.eligible, excludedRequests: 1 - row.eligible, hitRate: row.rate } });
    expect(usage.requestReports).toEqual([expect.objectContaining({ headerEventId: header.id, outcomeEventId: outcome.id,
      providerId: "ollama", model: MODEL, usageStatus: "complete", cacheReadTokens: row.read })]);
    const text = renderRunSummary(summary);
    expect(text).toContain("provider ollama");
    expect(text).toContain("cache write unreported");
    if (row.cached === undefined) expect(text).toContain("Request cache-read hit rate: unavailable");
    expect(JSON.parse(JSON.stringify(summary)).usage.totals.cacheWriteTokens.observedTokens).toBeNull();
  });

  it("retains reported usage from a failed stream without admitting a request-cache denominator", async () => {
    const h = harness(surface, response({ prompt_eval_count: 12, eval_count: 4, prompt_eval_cached_count: 5 }, '{"unfinished":'));
    await expect(drain(h.call)).rejects.toBeDefined();
    const { events, summary } = h.finish(h.call, true);
    expect(events.filter(event => event.event_type === "request/response")).toHaveLength(0);
    expect(events.filter(event => event.event_type === "request/failure")).toHaveLength(1);
    expect(summary.usage).toMatchObject({ status: "partial", completeRequests: 0, reportedRequests: 1,
      totals: { inputTokens: { observedTokens: 7 }, cacheReadTokens: { observedTokens: 5 }, outputTokens: { observedTokens: 4 } },
      cache: { readShare: null, eligibleRequests: 0 },
      requestCache: { eligibleRequests: 0, excludedRequests: 1, hitRate: null } });
    expect(summary.usage?.requestReports?.[0]).toMatchObject({ outcome: "failed", usageStatus: "partial" });
  });

  it("withholds rates for inconsistent outcome links rather than dropping inconvenient evidence", async () => {
    const h = harness(surface, response({ prompt_eval_count: 12, eval_count: 4, prompt_eval_cached_count: 5 }));
    await drain(h.call);
    const { events, summary } = h.finish(h.call);
    const outcome = events.find(event => event.event_type === "request/response")!;
    // Mutate only a copied projection input, never the actual signed store.
    const invalid = projectNativeRunUsage([...events, outcome], summary.sessionId);
    expect(discoverNativeProviders("ollama").usageCache.invalidEvidence).toBe("rates-unavailable");
    expect(invalid).toMatchObject({ status: "invalid", cache: { readShare: null }, requestCache: { hitRate: null } });
    expect(invalid.issues).toContainEqual({ eventId: outcome.id, code: "USAGE_OUTCOME_LINK_INVALID_OR_DUPLICATE" });
  });

  it.each([
    { prompt_eval_count: 12 },
    { prompt_eval_count: 12, eval_count: 4, prompt_eval_cached_count: 13 },
    { prompt_eval_count: 12, eval_count: 4, prompt_eval_cached_count: null }
  ])("does not turn malformed or missing reported usage into measured zero: %j", async metrics => {
    const h = harness(surface, response(metrics));
    await expect(drain(h.call)).rejects.toBeDefined();
    const { summary } = h.finish(h.call, true);
    expect(summary.usage).toMatchObject({ status: "unavailable", reportedRequests: 0, completeRequests: 0,
      totals: { inputTokens: { observedTokens: null }, outputTokens: { observedTokens: null }, cacheReadTokens: { observedTokens: null } },
      requestCache: { eligibleRequests: 0, hitRequests: 0, hitRate: null } });
  });
});

describe("P01 actual ACP launcher composition with scripted native HTTP", () => {
  it("runs the selected Ollama route with the shared token bound, frames-only stdout and unknown cache reporting", async () => {
    const root = workspace(), input = new EventEmitter(), frames: Record<string, unknown>[] = [], diagnostics: string[] = [];
    const fetched: { url: string; options?: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
      fetched.push({ url, options });
      if (url !== "http://127.0.0.1:11434/api/chat") throw new Error("Unexpected fixture endpoint");
      return new Response(responseText({ prompt_eval_count: 12, eval_count: 4 }), {
        status: 200, headers: { "content-type": "application/x-ndjson" }
      });
    }));
    const handle = startAcpStdio({ workspace: root, agentId: "default", providerId: "ollama", model: MODEL,
      systemPrompt: "Use the exact selected native route.", maxTokens: 41, maxSteps: 1, tools: "none",
      credentialsMode: "operator-only", credentialsHome: join(root, "empty-home"), stdin: input,
      stdout: { write: chunk => {
        // Any banner or non-protocol output fails JSON parsing, rather than being skipped.
        for (const line of chunk.toString("utf8").trimEnd().split("\n")) frames.push(JSON.parse(line));
        return true;
      } }, stderr: { write: line => { diagnostics.push(line); return true; } } });
    handles.add(handle);
    const request = async (id: number, method: string, params: Record<string, unknown>) => {
      input.emit("data", Buffer.from(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"));
      return vi.waitFor(() => {
        const reply = frames.find(frame => frame.id === id);
        if (!reply) throw new Error(`No ACP fixture response for ${method}`);
        expect(reply).not.toHaveProperty("error");
        return reply.result as Record<string, unknown>;
      }, { timeout: 10000 });
    };
    const initialized = await request(1, "initialize", { protocolVersion: 1, clientCapabilities: {} });
    const selected = acpRouteFor({ workspace: root, agentId: "default", providerId: "ollama", model: MODEL, systemPrompt: "" });
    if ("error" in selected) throw new Error(selected.error);
    const registry = new AdapterRegistry(); registry.register(selected);
    expect(initialized.agentCapabilities).toMatchObject({ promptCapabilities: {
      image: acpSupportsImageInput(registry.pin({ providerId: "ollama", model: MODEL })), audio: false
    } });
    expect(fetched).toHaveLength(0); // Discovery/initialize must not probe the model.
    const opened = await request(2, "session/new", { cwd: root, mcpServers: [] });
    const sessionId = opened.sessionId as string;
    const result = await request(3, "session/prompt", { sessionId, prompt: [{ type: "text", text: "Scripted ACP task." }] });
    expect(result.stopReason).toBe("end_turn");
    expect(fetched).toHaveLength(1);
    const sent = fetched[0]!, body = sent.options?.body;
    if (!(body instanceof Uint8Array)) throw new Error("Native HTTP fixture did not receive encoded bytes");
    expect(JSON.parse(Buffer.from(body).toString())).toMatchObject({ model: MODEL, options: { num_predict: 41 }, stream: true });
    expect(new Headers(sent.options?.headers).has("authorization")).toBe(false);
    expect(frames.every(frame => frame.jsonrpc === "2.0")).toBe(true);
    expect(frames.some(frame => frame.method === "session/update")).toBe(true);
    const summary = readAgentRunSummary(root, sessionId, "idle");
    expect(summary.usage).toMatchObject({ reportedRequests: 1, totals: { cacheReadTokens: { observedTokens: null }, cacheWriteTokens: { observedTokens: null } },
      requestCache: { eligibleRequests: 0, excludedRequests: 1, hitRate: null } });
    expect(diagnostics).toEqual([]);
    await handle.close(); handles.delete(handle);
  }, 30000);
});
