/** Authored, UNEXECUTED. Real signed runtime, request binding and cold derivation;
 * only HTTP response bytes and tool result facts are scripted. No live provider.
 */
import { stepUsage } from "./helpers/stepUsage.js";
import { createHash } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { LoopInbox } from "../src/agent/inbox.js";
import { recordNativeOrderedMessage } from "../src/agent/nativeOrderedMessage.js";
import type { NativeInputPart } from "../src/attachments/nativeOrderedInput.js";
import { LocalCredentialsService } from "../src/credentials/localCredentialsService.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime, type LlmCallSpec, type PreparedCall } from "../src/llm/adapter/llmRuntime.js";
import type { HttpRequest, HttpResponse, HttpTransport } from "../src/llm/adapter/transport.js";
import type { StreamChunk, ToolUseContentBlock } from "../src/llm/streamChunk.js";
import { createOllamaRoute } from "../src/llm/providers/ollamaRoute.js";
import { readOllamaCallKey } from "../src/llm/providers/ollamaToolIdentity.js";
import { deriveSessionRequests } from "../src/llm/request/deriveRequest.js";
import { resolveRequestSources, type RequestSourceInput } from "../src/llm/request/requestSources.js";
import { parseRequestHeaderMeta } from "../src/session/requestHeaderMeta.js";
import { providerToolWireName } from "../src/llm/request/providerToolNames.js";
import type { ToolSchema } from "../src/llm/request/requestSpec.js";

const roots: string[] = [], writers = new Set<SessionService>(), stores: LocalCredentialsService[] = [];
afterEach(async () => {
  try { for (const writer of writers) writer.disposeWithoutClosing(); writers.clear(); for (const store of stores.splice(0)) await store.close(); }
  finally { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); vi.unstubAllEnvs(); }
});
const MODEL = "p05-scripted-model";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9l8AAAAASUVORK5CYII=";
const RAW = '{ "path" : "α.txt", "offset" : 1e0 }';
const schema = (name: string): ToolSchema => ({ name, description: "P05 fixture function", parameters: { type: "object",
  properties: { path: { type: "string" }, offset: { type: "number" } } } });
const nativeCall = (name: string, ordinal: number, id?: string) => `{"function":{"index":${ordinal},"name":${JSON.stringify(name)},"arguments":${RAW}}${id === undefined ? "" : `,"id":${JSON.stringify(id)}`}}`;
function frame(message: string, done = false, cached: number | null = 5): string {
  return `{"model":"${MODEL}","created_at":"2026-09-11T05:30:00Z","message":${message},"done":${done}${done
    ? `,"done_reason":"stop","prompt_eval_count":12,"eval_count":4${cached === null ? "" : `,"prompt_eval_cached_count":${cached}`}` : ""}}`;
}
function response(calls: string[] = [], options: { cached?: number | null; text?: string; trailing?: string } = {}): HttpResponse {
  const rows = [frame('{"role":"assistant","thinking":"Original reasoning α."}'),
    frame(JSON.stringify({ role: "assistant", content: options.text ?? (calls.length ? "Using the offered tools." : "The result was preserved.") }))];
  if (calls.length) rows.push(frame(`{"role":"assistant","tool_calls":[${calls.join(",")}]}`));
  rows.push(frame('{"role":"assistant","content":""}', true, options.cached));
  const bytes = Buffer.from(rows.join("\n") + "\n" + (options.trailing ?? ""));
  return { status: 200, headers: { "content-type": "application/x-ndjson" }, body: (async function* () {
    for (let at = 0; at < bytes.length; at += 3) yield bytes.subarray(at, at + 3);
  })() };
}
function harness(script: (HttpResponse | HttpTransport)[], backend = "sqlite", ordered = false) {
  vi.stubEnv("AMC_SESSION_STORE", backend); vi.stubEnv("AMC_VAULT_PASSPHRASE", "p05-unexecuted-fixture-passphrase");
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-p05-ollama-"))); roots.push(root);
  initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
  const writer = new SessionService(root); writers.add(writer);
  writer.open({ agentId: "default", harnessVersion: "p05-unexecuted", compositionDigest: "p05-fixture", policyDigest: "p05-fixture" });
  const system = writer.recordSystemPrompt("Use only this request's offered tools. Preserve keyed failures.");
  if (ordered) {
    const mutable = Buffer.from(PNG, "base64"), inbox = new LoopInbox(writer, () => {});
    const parts: NativeInputPart[] = [{ type: "text", text: "Before α" },
      { type: "image", image: { filename: "original.png", mediaType: "image/png", bytes: mutable } },
      { type: "text", text: "" }, { type: "text", text: "After" }];
    inbox.insert("next-turn", "", "followup", { wake: false, demotedFrom: null, parts });
    mutable.fill(0); // The already-queued original, not this mutable Buffer, is authority.
    writer.startTurn({ trigger: "user" }); writer.startStep();
    recordNativeOrderedMessage(writer, inbox.claim("next-turn")[0]!);
  } else {
    writer.startTurn({ trigger: "user" }); writer.recordUserMessage("Read and report the result honestly."); writer.startStep();
  }
  const credentials = new LocalCredentialsService({ env: {}, homeDir: join(root, "empty-home"), projectDir: null, includeDotenv: false, watch: false }); stores.push(credentials);
  const registry = new AdapterRegistry(); registry.register(createOllamaRoute({ model: MODEL }));
  const sent: HttpRequest[] = [];
  const transport: HttpTransport = async request => {
    sent.push({ ...request, body: Buffer.from(request.body), headers: { ...request.headers } });
    const next = script.shift(); if (!next) throw new Error("Unexpected P05 fixture transport dispatch");
    return typeof next === "function" ? next(request) : next;
  };
  const runtime = new LlmRuntime({ session: writer, credentials, registry, transport });
  const spec = (tools: readonly ToolSchema[] | null): LlmCallSpec => ({ providerId: "ollama", model: MODEL,
    params: { max_tokens: 64, think: true }, tools, systemPromptEventId: system.eventId, requiredProtocol: "ollama-chat",
    requiredCapabilities: ["text-input", "thinking-replay", "tool-replay"] });
  const finishStep = (call: PreparedCall) => writer.endStep({ stopReason: call.settled?.assembly.finishReason?.kind ?? "error", usage: stepUsage(call.settled?.assembly.usage) });
  const laterUser = () => { writer.endTurn({ reason: "complete" }); writer.sealTurn(); writer.startTurn({ trigger: "user" }); writer.recordUserMessage("Keep the complete history."); writer.startStep(); };
  const close = (error = false) => { writer.endTurn({ reason: error ? "error" : "complete" }); writer.sealTurn(); writer.close({ reason: "p05-fixture-ended" }); writers.delete(writer); };
  return { root, writer, registry, runtime, spec, sent, finishStep, laterUser, close };
}
async function drain(stream: AsyncIterable<StreamChunk>, seen: StreamChunk[] = []): Promise<StreamChunk[]> {
  for await (const chunk of stream) seen.push(chunk); return seen;
}
function calls(chunks: readonly StreamChunk[]): ToolUseContentBlock[] {
  return chunks.flatMap(chunk => chunk.type === "block-end" && chunk.block.kind === "tool_use" ? [chunk.block] : []);
}
function result(writer: SessionService, call: ToolUseContentBlock, error = false): void {
  writer.recordToolResult({ toolCallId: call.id, outcome: error ? "ERROR" : "OK", exitCode: error ? 1 : 0,
    timedOut: false, denied: false, content: error ? '{"isError":false,"output":"actual scripted failure"}' : "scripted result" });
}
function assertCold(h: ReturnType<typeof harness>, prepared: readonly PreparedCall[]): void {
  const derived = deriveSessionRequests({ workspace: h.root, sessionId: h.writer.sessionId });
  expect(derived).toHaveLength(prepared.length); expect(h.sent).toHaveLength(prepared.length);
  derived.forEach((row, index) => {
    const digest = createHash("sha256").update(h.sent[index]!.body).digest("hex");
    expect(row).toMatchObject({ status: "reconstructed", headerEventId: prepared[index]!.headerEventId,
      recordedDigest: digest, derivedDigest: digest, inconsistencies: [], detail: null });
    expect(row.bytes).toEqual(h.sent[index]!.body); expect(prepared[index]!.requestDigest).toBe(digest);
  });
}

describe("P05 Ollama signed lifecycle (unexecuted)", () => {
  test.each(["sqlite", "jsonl"])("%s ordered originals -> native calls -> keyed failure -> tools-free reasoning -> exact cold requests", async backend => {
    const alias = providerToolWireName("fs.read");
    const h = harness([response([nativeCall(alias, 0), nativeCall("fs_read", 1, "upstream-second")]), response(), response()], backend, true);
    const first = h.runtime.prepare(h.spec([schema("fs.read"), schema("fs_read")]));
    const offered = calls(await drain(first.stream()));
    expect(offered.map(call => call.name)).toEqual(["fs.read", "fs_read"]);
    expect(offered[0]).toMatchObject({ arguments: RAW, providerWireName: alias });
    expect(readOllamaCallKey(offered[0]!.id)).toMatchObject({ ordinal: 0, wireId: null, wireIndex: 0 });
    expect(readOllamaCallKey(offered[1]!.id)).toMatchObject({ ordinal: 1, wireId: "upstream-second", wireIndex: 1 });
    const rows = h.writer.readEvents().filter(row => row.event_type === "tool/call");
    expect(rows).toHaveLength(2);
    for (const [index, row] of rows.entries()) {
      const payload = readEventPayload(h.root, row); expect(payload.status).toBe("ok");
      if (payload.status !== "ok") throw new Error("Missing recorded arguments");
      expect(payload.bytes.toString()).toBe(RAW);
      expect(JSON.parse(row.meta_json)).toMatchObject({ toolCallId: offered[index]!.id, toolName: offered[index]!.name,
        providerName: { version: 1, headerEventId: first.headerEventId, encoderId: "ollama-chat", encoderVersion: 1 } });
    }
    result(h.writer, offered[0]!, true); result(h.writer, offered[1]!);
    h.finishStep(first); h.writer.startStep();
    const second = h.runtime.prepare(h.spec(null)); await drain(second.stream()); h.finishStep(second);
    h.laterUser(); const third = h.runtime.prepare(h.spec(null)); await drain(third.stream()); h.finishStep(third);
    for (const sent of h.sent) {
      expect(sent.url).toBe("http://127.0.0.1:11434/api/chat"); expect(sent.headers.authorization).toBeUndefined();
      expect(sent.redirect).toBe("error"); expect(sent.cancelBodyOnReturn).toBe(true);
      expect(JSON.parse(sent.body.toString()).messages.slice(1, 5)).toEqual([
        { role: "user", content: "Before α" }, { role: "user", content: "", images: [PNG] },
        { role: "user", content: "" }, { role: "user", content: "After" }
      ]);
    }
    const replay = h.sent[1]!.body.toString(), decoded = JSON.parse(replay);
    expect(replay.split(RAW)).toHaveLength(3); expect(replay).not.toContain("amc-ollama-call-v1:"); expect(decoded.tools).toBeUndefined();
    const toolResults = decoded.messages.filter((message: { role: string }) => message.role === "tool");
    expect(toolResults[0].tool_name).toBe(alias); expect(toolResults[0].tool_call_id).toBeUndefined();
    expect(JSON.parse(toolResults[0].content)).toEqual({ type: "amc.tool-result", version: 1, isError: true,
      output: '{"isError":false,"output":"actual scripted failure"}' });
    expect(toolResults[1]).toMatchObject({ tool_name: "fs_read", tool_call_id: "upstream-second" });
    expect(second.settled?.assembly.usage).toEqual({ inputTokens: 7, cacheReadTokens: 5, outputTokens: 4 });
    h.close(); assertCold(h, [first, second, third]);
  });
  test.each(["unoffered", "added-after-prepare", "malformed-trailer"])("%s produces a signed failure, not native tool authority", async attack => {
    const original = "fs.read", foreign = "fs.write";
    const h = harness([response([nativeCall(providerToolWireName(attack === "malformed-trailer" ? original : foreign), 0)],
      { trailing: attack === "malformed-trailer" ? '{"unfinished":' : "" })]);
    const tools = [schema(original)], call = h.runtime.prepare(h.spec(tools));
    if (attack === "added-after-prepare") tools.push(schema(foreign));
    const seen: StreamChunk[] = []; await expect(drain(call.stream(), seen)).rejects.toBeDefined();
    expect(calls(seen)).toEqual([]); expect(h.writer.readEvents().filter(row => row.event_type === "tool/call")).toEqual([]);
    expect(h.writer.readEvents().filter(row => row.event_type === "request/failure")).toHaveLength(1);
    expect(JSON.parse(h.sent[0]!.body.toString()).tools.map((tool: { function: { name: string } }) => tool.function.name)).toEqual([providerToolWireName(original)]);
    h.finishStep(call); h.close(true); assertCold(h, [call]);
  });
  test("a historical function is replayable after removal but cannot regain current authority", async () => {
    const alias = providerToolWireName("fs.read"), h = harness([response([nativeCall(alias, 0)]), response([nativeCall(alias, 0)])]);
    const first = h.runtime.prepare(h.spec([schema("fs.read")])), old = calls(await drain(first.stream()))[0]!;
    result(h.writer, old); h.finishStep(first); h.writer.startStep();
    const second = h.runtime.prepare(h.spec([schema("fs.stat")])), seen: StreamChunk[] = [];
    await expect(drain(second.stream(), seen)).rejects.toMatchObject({ code: "AMC_LLM_UNOFFERED_TOOL_NAME" });
    expect(calls(seen)).toEqual([]); expect(h.writer.readEvents().filter(row => row.event_type === "tool/call")).toHaveLength(1);
    expect(h.sent[1]!.body.toString()).toContain(RAW);
    h.finishStep(second); h.close(true); assertCold(h, [first, second]);
  });
  test("missing cache counts remain absent through signed runtime settlement", async () => {
    const h = harness([response([], { cached: null })]), call = h.runtime.prepare(h.spec(null));
    await drain(call.stream()); expect(call.settled?.assembly.usage).toEqual({ inputTokens: 12, outputTokens: 4 });
    h.finishStep(call); h.close(); assertCold(h, [call]);
  });
  test("native call provenance requires the exact original signed header, model, schema and name binding", async () => {
    const h = harness([response([nativeCall(providerToolWireName("fs.read"), 0)]), response()]);
    const first = h.runtime.prepare(h.spec([schema("fs.read")])); const block = calls(await drain(first.stream()))[0]!;
    result(h.writer, block); h.finishStep(first); h.writer.startStep();
    const second = h.runtime.prepare(h.spec(null)); await drain(second.stream()); h.finishStep(second);
    const events = h.writer.readEvents(), headerRow = events.find(row => row.id === second.headerEventId)!;
    const header = parseRequestHeaderMeta(headerRow.meta_json)!;
    const input: RequestSourceInput = { workspace: h.root, events, model: header.model, params: header.params,
      systemPromptEventId: header.systemPromptEventId, toolSchemaEventId: header.toolSchemaEventId,
      toolSchemaSha256: header.toolSchemaSha256, projectionCutoffEventId: header.projectionCutoffEventId };
    expect(resolveRequestSources(input).failure).toBeNull();
    expect(resolveRequestSources({ ...input, model: "different-model" }).failure?.kind).toBe("evidence-inconsistent");
    const forged = events.map(row => row.event_type !== "tool/call" ? row : { ...row,
      meta_json: JSON.stringify({ ...JSON.parse(row.meta_json), providerName: { ...JSON.parse(row.meta_json).providerName, wireName: providerToolWireName("fs.write") } }) });
    expect(resolveRequestSources({ ...input, events: forged }).failure?.kind).toBe("evidence-inconsistent");
    const missing = events.map(row => row.event_type !== "tool/call" ? row : { ...row,
      meta_json: JSON.stringify({ ...JSON.parse(row.meta_json), providerName: undefined }) });
    expect(resolveRequestSources({ ...input, events: missing }).failure?.kind).toBe("evidence-inconsistent");
    h.close(); assertCold(h, [first, second]);
  });
  test("in-flight cancellation retains partial evidence and closes the HTTP body without closing tools", async () => {
    const controller = new AbortController(); let entered!: () => void, released = false, closed = false;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const h = harness([async request => ({ status: 200, headers: { "content-type": "application/x-ndjson" },
      body: (async function* () {
        try {
          yield Buffer.from(frame(`{"role":"assistant","tool_calls":[${nativeCall(providerToolWireName("fs.read"), 0)}]}`) + "\n");
          entered();
          if (!request.signal?.aborted) await new Promise<void>(resolve => request.signal!.addEventListener("abort", () => resolve(), { once: true }));
          throw new DOMException("P05 fixture aborted", "AbortError");
        } finally { released = true; }
      })(), close: async () => { closed = true; } })]);
    const call = h.runtime.prepare({ ...h.spec([schema("fs.read")]), signal: controller.signal }), seen: StreamChunk[] = [];
    const completion = drain(call.stream(), seen), rejection = expect(completion).rejects.toBeDefined();
    await started; controller.abort(); await rejection;
    expect(released).toBe(true); expect(closed).toBe(true); expect(calls(seen)).toEqual([]);
    expect(h.writer.readEvents().filter(row => row.event_type === "tool/call")).toEqual([]);
    expect(h.writer.readEvents().some(row => {
      const payload = readEventPayload(h.root, row); if (payload.status !== "ok") return false;
      try {
        const dropped = JSON.parse(payload.bytes.toString("utf8")) as { type?: unknown; content?: unknown };
        return dropped.type === "amc.provider-tool-drop" && typeof dropped.content === "string" && dropped.content.includes(RAW);
      } catch { return false; }
    })).toBe(true);
    h.finishStep(call); h.close(true); assertCold(h, [call]);
  });
});
