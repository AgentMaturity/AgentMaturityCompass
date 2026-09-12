/** AUTHORED UNEXECUTED. Real native signed runtime/writer/default registry.
 * Only the HTTP edge and tool-result facts are scripted; no live provider claim.
 */
import { stepUsage } from "./helpers/stepUsage.js";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { SessionService } from "../src/session/sessionService.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { LocalCredentialsService } from "../src/credentials/localCredentialsService.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime, type PreparedCall, type LlmCallSpec } from "../src/llm/adapter/llmRuntime.js";
import { geminiAdapter } from "../src/llm/providers/geminiAdapter.js";
import { acpRouteFor } from "../src/acp/acpStdioMain.js";
import type { HttpRequest, HttpResponse, HttpTransport } from "../src/llm/adapter/transport.js";
import type { StreamChunk, ToolUseContentBlock } from "../src/llm/streamChunk.js";
import type { ToolSchema } from "../src/llm/request/requestSpec.js";
import { providerToolWireName } from "../src/llm/request/providerToolNames.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { LoopInbox } from "../src/agent/inbox.js";
import { recordNativeOrderedMessage } from "../src/agent/nativeOrderedMessage.js";
import { orderedCleanup, orderedWorkspace, orderedCold } from "./fixtures/nativeOrderedImageHarness.js";
import { geminiFrame, geminiResponse, geminiTextResponse, geminiCallPart, geminiInputParts,
  GEMINI_RAW_ARGS, GEMINI_EXPECTED_INPUT } from "./fixtures/nativeGeminiStream.js";

const writers = new Set<SessionService>(), stores: LocalCredentialsService[] = [];
afterEach(async () => {
  try { for (const writer of writers) writer.disposeWithoutClosing(); writers.clear(); for (const store of stores.splice(0)) await store.close(); }
  finally { await orderedCleanup(); }
});
const schema = (name: string): ToolSchema => ({ name, description: "Fixture function", parameters: { type: "object",
  properties: { path: { type: "string" }, offset: { type: "number" } } } });
const drain = async (stream: AsyncIterable<StreamChunk>, seen: StreamChunk[] = []) => { for await (const chunk of stream) seen.push(chunk); return seen; };
const calls = (chunks: readonly StreamChunk[]): ToolUseContentBlock[] => chunks.flatMap(chunk => chunk.type === "block-end" && chunk.block.kind === "tool_use" ? [chunk.block] : []);
function harness(script: (HttpResponse | HttpTransport)[], backend = "sqlite") {
  const root = orderedWorkspace(backend), writer = new SessionService(root); writers.add(writer);
  writer.open({ agentId: "default", harnessVersion: "gemini-fixture", compositionDigest: "gemini-fixture", policyDigest: "gemini-fixture" });
  const system = writer.recordSystemPrompt("Use only the offered functions and preserve their failures.");
  const inbox = new LoopInbox(writer, () => {}), input = geminiInputParts();
  inbox.insert("next-turn", "", "followup", { wake: false, demotedFrom: null, parts: input });
  for (const part of input) if (part.type === "image") part.image.bytes.fill(0);
  writer.startTurn({ trigger: "user" }); writer.startStep(); recordNativeOrderedMessage(writer, inbox.claim("next-turn")[0]!);
  const registry = new AdapterRegistry(), route = acpRouteFor({ workspace: root, agentId: "default", systemPrompt: "fixture", providerId: "gemini", model: "fixture-model" });
  if ("error" in route) throw new Error(route.error);
  registry.register({ ...route, credentialRef: null });
  const credentials = new LocalCredentialsService({ env: {}, projectDir: null, homeDir: join(root, "empty-home"), includeDotenv: false, watch: false }); stores.push(credentials);
  const sent: HttpRequest[] = [];
  const transport: HttpTransport = async request => {
    sent.push({ ...request, body: Buffer.from(request.body), headers: { ...request.headers } });
    const next = script.shift(); if (!next) throw new Error("Unexpected Gemini dispatch"); return typeof next === "function" ? next(request) : next;
  };
  const runtime = new LlmRuntime({ session: writer, credentials, registry, transport }); // no custom encoders
  const spec = (tools: readonly ToolSchema[] | null): LlmCallSpec => ({ providerId: "gemini", model: "fixture-model", systemPromptEventId: system.eventId,
    params: { generationConfig: { maxOutputTokens: 64 } }, tools, requiredProtocol: "gemini-generate-content" });
  const finishStep = (call: PreparedCall) => writer.endStep({ stopReason: call.settled?.assembly.finishReason?.kind ?? "error", usage: stepUsage(call.settled?.assembly.usage) });
  const later = (text: string) => { writer.endTurn({ reason: "complete" }); writer.sealTurn(); writer.startTurn({ trigger: "user" }); writer.recordUserMessage(text); writer.startStep(); };
  const close = (failed = false) => { writer.endTurn({ reason: failed ? "error" : "complete" }); writer.sealTurn(); writer.close({ reason: "fixture-completed" }); writers.delete(writer); };
  return { root, writer, runtime, sent, spec, finishStep, later, close };
}
function result(writer: SessionService, id: string, error = false) {
  writer.recordToolResult({ toolCallId: id, outcome: error ? "ERROR" : "OK", exitCode: error ? 1 : 0,
    timedOut: false, denied: false, content: error ? '{"isError":false,"detail":"actual scripted failure"}' : "scripted native result" });
}
describe("native Gemini signed lifecycle (unexecuted)", () => {
  test.each(["sqlite", "jsonl"])("%s raw signed thoughts/calls/ordered originals, keyed failures and default cold replay", async backend => {
    const rawParts = ['{"thought":true,"text":"reason α","thoughtSignature":"YQ=="}',
      geminiCallPart(providerToolWireName("fs.read"), "raw:key"), geminiCallPart("fs_read"), '{"thoughtSignature":"Yg=="}'];
    const h = harness([geminiResponse([geminiFrame(rawParts, "first")]), geminiTextResponse("second"), geminiTextResponse("third")], backend);
    const first = h.runtime.prepare(h.spec([schema("fs.read"), schema("fs_read")]));
    const offered = calls(await drain(first.stream())); expect(offered.map(call => call.name)).toEqual(["fs.read", "fs_read"]);
    expect(offered[0]).toMatchObject({ id: "raw:key", providerWireName: providerToolWireName("fs.read"), arguments: GEMINI_RAW_ARGS });
    expect(offered[1]!.id).toMatch(/^amc-gemini-local-/);
    const callRows = h.writer.readEvents().filter(row => row.event_type === "tool/call");
    for (const [index, row] of callRows.entries()) {
      const payload = readEventPayload(h.root, row); expect(payload.status).toBe("ok");
      if (payload.status !== "ok") throw new Error("Missing arguments"); expect(payload.bytes.toString()).toBe(GEMINI_RAW_ARGS);
      expect(JSON.parse(row.meta_json)).toMatchObject({ providerName: { headerEventId: first.headerEventId,
        encoderId: "gemini-generate-content", encoderVersion: 1 }, gemini: { headerEventId: first.headerEventId, partIndex: index + 1, partJson: rawParts[index + 1] } });
    }
    result(h.writer, offered[0]!.id, true); result(h.writer, offered[1]!.id);
    h.finishStep(first); h.writer.startStep();
    // Removing offered functions does not erase their signed history or re-grant authority.
    const second = h.runtime.prepare(h.spec(null)); await drain(second.stream()); h.finishStep(second); h.later("Keep the original history.");
    const third = h.runtime.prepare(h.spec(null)); await drain(third.stream()); h.finishStep(third);
    expect(second.settled?.assembly.usage).toEqual({ inputTokens: 7, cacheReadTokens: 5, outputTokens: 7, reasoningTokens: 3 });
    for (const request of h.sent) {
      expect(request.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/fixture-model:streamGenerateContent?alt=sse");
      expect(JSON.parse(request.body.toString()).contents[0].parts).toEqual(GEMINI_EXPECTED_INPUT);
      expect(request.headers.authorization).toBeUndefined();
    }
    const replay = h.sent[1]!.body.toString(); for (const part of rawParts) expect(replay).toContain(part);
    const responses = JSON.parse(replay).contents.at(-1).parts;
    expect(responses[0]).toEqual({ functionResponse: { name: providerToolWireName("fs.read"), id: "raw:key",
      response: { error: '{"isError":false,"detail":"actual scripted failure"}' } } });
    expect(responses[1]).toEqual({ functionResponse: { name: "fs_read", response: { output: "scripted native result" } } });
    expect(replay).not.toContain(offered[1]!.id);
    h.close();
    expect(orderedCold(h.root, h.writer.sessionId).map(row => row.bytes)).toEqual(h.sent.map(request => request.body.toString("base64")));
    expect(verifyLedgerIntegrity(h.root).chain).toEqual({ ok: true, errors: [] });
  }, 120_000);
  test.each(["unoffered", "added-after-prepare", "malformed-sibling", "trailing-frame", "duplicate-id"])("%s cannot create executable or signed tool authority", async attack => {
    const original = providerToolWireName("fs.read"), foreign = providerToolWireName("fs.write");
    const part = geminiCallPart(attack === "unoffered" || attack === "added-after-prepare" ? foreign : original, "one");
    const parts = attack === "malformed-sibling" ? [part, '{"inlineData":{"mimeType":"audio/wav","data":"AAAA"}}']
      : attack === "duplicate-id" ? [part, part] : [part];
    const h = harness([geminiResponse([geminiFrame(parts)], attack === "trailing-frame" ? "data: {unfinished" : "")]);
    const tools = [schema("fs.read")], first = h.runtime.prepare(h.spec(tools));
    tools.push(schema("fs.write")); const seen: StreamChunk[] = [];
    await expect(drain(first.stream(), seen)).rejects.toBeDefined();
    expect(calls(seen)).toEqual([]); expect(h.writer.readEvents().filter(row => row.event_type === "tool/call")).toEqual([]);
    expect(h.writer.readEvents().some(row => row.event_type === "request/failure")).toBe(true);
    expect(JSON.parse(h.sent[0]!.body.toString()).tools[0].functionDeclarations.map((tool: { name: string }) => tool.name)).toEqual([original]);
    h.finishStep(first); h.close(true);
    expect(orderedCold(h.root, h.writer.sessionId)[0]!.bytes).toBe(h.sent[0]!.body.toString("base64"));
  });
  test("removed historical function remains replayable but is not currently executable", async () => {
    const wire = providerToolWireName("fs.read"), h = harness([
      geminiResponse([geminiFrame([geminiCallPart(wire, "old")], "old-response")]),
      geminiResponse([geminiFrame([geminiCallPart(wire, "new")], "new-response")])]);
    const first = h.runtime.prepare(h.spec([schema("fs.read")])); await drain(first.stream()); result(h.writer, "old"); h.finishStep(first); h.writer.startStep();
    const next = h.runtime.prepare(h.spec([schema("fs.stat")])); const seen: StreamChunk[] = [];
    await expect(drain(next.stream(), seen)).rejects.toMatchObject({ code: "AMC_LLM_UNOFFERED_TOOL_NAME" });
    expect(calls(seen)).toEqual([]); expect(h.writer.readEvents().filter(row => row.event_type === "tool/call")).toHaveLength(1);
    h.finishStep(next); h.close(true);
  });
  test("in-flight cancellation closes the body, retains observed raw provenance and never completes a tool", async () => {
    const controller = new AbortController(); let released = false, entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const h = harness([async request => ({ status: 200, headers: { "content-type": "text/event-stream" }, body: (async function* () {
      try {
        yield Buffer.from(`data: ${geminiFrame([geminiCallPart(providerToolWireName("fs.read"), "cancelled-call")], "cancelled-response", null, null)}\n\n`);
        entered();
        if (!request.signal?.aborted) await new Promise<void>(resolve => request.signal!.addEventListener("abort", () => resolve(), { once: true }));
        throw new DOMException("Fixture abort", "AbortError");
      } finally { released = true; }
    })() })]);
    const call = h.runtime.prepare({ ...h.spec([schema("fs.read")]), signal: controller.signal });
    const seen: StreamChunk[] = [], completion = drain(call.stream(), seen); const rejected = expect(completion).rejects.toBeDefined();
    await started; controller.abort(); await rejected;
    expect(released).toBe(true); expect(calls(seen)).toEqual([]);
    expect(h.writer.readEvents().filter(row => row.event_type === "tool/call")).toEqual([]);
    const dropped = h.writer.readEvents();
    expect(dropped.some(row => { const payload = readEventPayload(h.root, row); return payload.status === "ok" && payload.bytes.includes(Buffer.from("c2lnbmF0dXJl")); })).toBe(true);
    h.finishStep(call); h.close(true);
  });
  test("unsupported params and cross-model signed history refuse before a new request header", async () => {
    const h = harness([geminiTextResponse()]); const first = h.runtime.prepare(h.spec(null)); await drain(first.stream()); h.finishStep(first); h.later("continue");
    const before = h.writer.readEvents().filter(row => row.event_type === "request/header");
    expect(() => h.runtime.prepare({ ...h.spec(null), params: { generationConfig: { maxOutputTokens: 64 }, cachedContent: "cachedContents/unsigned" } })).toThrow();
    const other = new AdapterRegistry(); other.register({ providerId: "gemini", adapter: geminiAdapter, baseUrl: "https://never.invalid", credentialRef: null, models: ["different-model"] });
    const credentials = new LocalCredentialsService({ env: {}, projectDir: null, homeDir: join(h.root, "empty-other"), includeDotenv: false, watch: false }); stores.push(credentials);
    const runtime = new LlmRuntime({ session: h.writer, credentials, registry: other, transport: async () => { throw new Error("must not dispatch"); } });
    expect(() => runtime.prepare({ ...h.spec(null), model: "different-model" })).toThrow(/original|model|reconstruct/i);
    expect(h.writer.readEvents().filter(row => row.event_type === "request/header")).toEqual(before);
    h.writer.endStep({ stopReason: "error", usage: null }); h.close(true);
  });
});
