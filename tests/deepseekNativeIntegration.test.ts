/** AUTHORED, UNEXECUTED. Native signed lifecycle, not live-provider acceptance.
 * Only HTTP transport is scripted. Runtime, adapter, writer, credentials store,
 * reconstruction registry, binding and ledger verification are the real code.
 */
import { stepUsage } from "./helpers/stepUsage.js";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { LocalCredentialsService } from "../src/credentials/localCredentialsService.js";
import { SessionService } from "../src/session/sessionService.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime, type LlmCallSpec, type PreparedCall } from "../src/llm/adapter/llmRuntime.js";
import type { HttpRequest, HttpResponse, HttpTransport } from "../src/llm/adapter/transport.js";
import { deepseekAdapter } from "../src/llm/providers/deepseekAdapter.js";
import { deriveSessionRequests } from "../src/llm/request/deriveRequest.js";
import { providerToolWireName } from "../src/llm/request/providerToolNames.js";
import type { ToolSchema } from "../src/llm/request/requestSpec.js";
import type { StreamChunk, ToolUseContentBlock } from "../src/llm/streamChunk.js";

const folders: string[] = [];
const writers = new Set<SessionService>();
const credentialStores: LocalCredentialsService[] = [];
afterEach(async () => {
  for (const writer of writers) writer.disposeWithoutClosing();
  writers.clear();
  for (const store of credentialStores.splice(0)) await store.close();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const firstReason = "First full reasoning: inspect α, retain every byte.\nDo not summarize.";
const secondReason = "Second full reasoning: the keyed read failed.\nExplain without hiding the failure.";
const rawArguments = '{ "path" : "α.txt", "offset" : 1e0 }';
const failedOutput = '{"isError":false,"detail":"fixture read failed"}';
const usage = { prompt_tokens: 12, prompt_cache_hit_tokens: 5, prompt_cache_miss_tokens: 7,
  completion_tokens: 4, total_tokens: 16, completion_tokens_details: { reasoning_tokens: 3 } };
const schema = (name: string): ToolSchema => ({ name, description: `Fixture ${name}`,
  parameters: { type: "object", properties: { path: { type: "string" }, offset: { type: "number" } } } });

function frame(delta: Record<string, unknown>, finish: string | null = null): Record<string, unknown> {
  return { id: "fixture-response", object: "chat.completion.chunk", model: "fixture-model",
    choices: [{ index: 0, delta, finish_reason: finish }], usage: finish === null ? null : usage };
}

function response(reasoning: string, text: string, call?: { wireName: string; id: string }): HttpResponse {
  const frames = [frame({ role: "assistant", content: "" }),
    frame({ reasoning_content: reasoning.slice(0, 17) }), frame({ reasoning_content: reasoning.slice(17) })];
  if (text) frames.push(frame({ content: text }));
  if (call) {
    frames.push(frame({ tool_calls: [{ index: 0, id: call.id, type: "function",
      function: { name: call.wireName, arguments: rawArguments.slice(0, 13) } }] }));
    frames.push(frame({ tool_calls: [{ index: 0,
      function: { arguments: rawArguments.slice(13) } }] }));
  }
  frames.push(frame({}, call ? "tool_calls" : "stop"));
  const bytes = Buffer.from(frames.map(value => `data: ${JSON.stringify(value)}\r\n\r\n`).join("") + "data: [DONE]\r\n\r\n");
  return { status: 200, headers: { "content-type": "text/event-stream" }, body: (async function* () {
    // Cross UTF-8, SSE, JSON and CRLF boundaries, rather than yielding whole frames.
    for (let offset = 0; offset < bytes.length; offset += 3) yield bytes.subarray(offset, offset + 3);
  })() };
}

function harness(script: HttpResponse[]) {
  const workspace = mkdtempSync(join(tmpdir(), "amc-deepseek-native-"));
  folders.push(workspace);
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  const session = new SessionService(workspace);
  writers.add(session);
  session.open({ agentId: "default", harnessVersion: "deepseek-fixture",
    compositionDigest: "deepseek-fixture-composition", policyDigest: "deepseek-fixture-policy" });
  const system = session.recordSystemPrompt("Use only the tools offered by this request.");
  session.startTurn({ trigger: "user" });
  session.recordUserMessage("Read the fixture file, and report a failure honestly.");
  session.startStep();
  const credentials = new LocalCredentialsService({ env: {}, homeDir: join(workspace, "empty-credentials"),
    projectDir: null, includeDotenv: false, watch: false });
  credentialStores.push(credentials);
  const sent: HttpRequest[] = [];
  const transport: HttpTransport = async request => {
    sent.push({ ...request, body: Buffer.from(request.body), headers: { ...request.headers } });
    const next = script.shift();
    if (!next) throw new Error("Unexpected fixture transport dispatch");
    return next;
  };
  const registry = new AdapterRegistry();
  registry.register({ providerId: "fixture-deepseek", adapter: deepseekAdapter,
    baseUrl: "https://deepseek.invalid", credentialRef: null, models: ["fixture-model"] });
  // Deliberately do not inject an encoder registry on either send or derive.
  const runtime = new LlmRuntime({ session, credentials, registry, transport });
  const spec = (tools: readonly ToolSchema[] | null): LlmCallSpec => ({
    providerId: "fixture-deepseek", model: "fixture-model", params: { max_tokens: 64 }, tools,
    systemPromptEventId: system.eventId, requiredProtocol: "deepseek-chat-completions",
    requiredCapabilities: ["text-input", "thinking-replay", "tool-replay"]
  });
  const finishStep = (call: PreparedCall) => session.endStep({
    stopReason: call.settled?.assembly.finishReason?.kind ?? "error", usage: stepUsage(call.settled?.assembly.usage)
  });
  const laterUser = (text: string) => {
    session.endTurn({ reason: "complete" }); session.sealTurn();
    session.startTurn({ trigger: "user" }); session.recordUserMessage(text); session.startStep();
  };
  const close = (failed = false) => {
    session.endTurn({ reason: failed ? "error" : "complete" }); session.sealTurn();
    session.close({ reason: "fixture-completed" });
    writers.delete(session);
  };
  return { workspace, session, sent, runtime, spec, finishStep, laterUser, close };
}

async function drain(stream: AsyncIterable<StreamChunk>, observed: StreamChunk[] = []): Promise<StreamChunk[]> {
  for await (const chunk of stream) observed.push(chunk);
  return observed;
}

function executableCalls(chunks: readonly StreamChunk[]): ToolUseContentBlock[] {
  return chunks.flatMap(chunk => chunk.type === "block-end" && chunk.block.kind === "tool_use" ? [chunk.block] : []);
}

function body(request: HttpRequest) {
  return JSON.parse(request.body.toString("utf8")) as {
    thinking: { type: string }; reasoning_effort?: string;
    messages: { role: string; content: string | null; reasoning_content?: string; tool_call_id?: string;
      tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[] }[];
    tools?: { type: string; function: { name: string } }[];
  };
}

function assertCold(h: ReturnType<typeof harness>, calls: readonly PreparedCall[]) {
  // Caller has closed the writer. The only reconstruction inputs are location
  // and session identity; sent bytes are used SOLELY as the comparison oracle.
  const derived = deriveSessionRequests({ workspace: h.workspace, sessionId: h.session.sessionId });
  expect(derived).toHaveLength(calls.length);
  expect(h.sent).toHaveLength(calls.length);
  derived.forEach((row, index) => {
    const digest = createHash("sha256").update(h.sent[index]!.body).digest("hex");
    expect(row).toMatchObject({ status: "reconstructed", headerEventId: calls[index]!.headerEventId,
      recordedDigest: digest, derivedDigest: digest, inconsistencies: [], detail: null });
    expect(row.bytes).toEqual(h.sent[index]!.body);
    expect(calls[index]!.requestDigest).toBe(digest);
  });
  const verified = verifyLedgerIntegrity(h.workspace);
  expect(verified.chain, verified.chain.errors.join("\n")).toEqual({ ok: true, errors: [] });
  // Local generated fixture trust is internal consistency, not an external anchor.
  expect(verified.trustRoot.anchored).toBe(false);
}

describe("native DeepSeek signed runtime integration (authored; not live acceptance)", () => {
  test("reasoning/tool/raw JSON -> keyed failure -> reasoning/text -> later user preserves BOTH reasoning texts cold", async () => {
    const wireName = providerToolWireName("fs.read");
    const h = harness([response(firstReason, "", { wireName, id: "call-read" }),
      response(secondReason, "The read failed."), response("Third reasoning.", "History retained.")]);
    const tools = [schema("fs.read"), schema("fs_read")]; // distinct names, not lossy dot replacement
    const first = h.runtime.prepare(h.spec(tools));
    expect(executableCalls(await drain(first.stream()))).toEqual([{ kind: "tool_use", id: "call-read",
      name: "fs.read", providerWireName: wireName, arguments: rawArguments }]);
    const row = h.session.readEvents().find(event => event.event_type === "tool/call")!;
    expect(JSON.parse(row.meta_json)).toMatchObject({ toolName: "fs.read", toolCallId: "call-read",
      providerName: { version: 1, wireName, headerEventId: first.headerEventId, encoderId: "deepseek-chat", encoderVersion: 1 } });
    const payload = readEventPayload(h.workspace, row);
    expect(payload.status).toBe("ok");
    if (payload.status !== "ok") throw new Error("Tool arguments unavailable");
    expect(payload.bytes.toString("utf8")).toBe(rawArguments);
    h.session.recordToolResult({ toolCallId: "call-read", outcome: "ERROR", exitCode: 1,
      timedOut: false, denied: false, content: failedOutput });
    h.finishStep(first); h.session.startStep();
    const second = h.runtime.prepare(h.spec(tools));
    expect(executableCalls(await drain(second.stream()))).toEqual([]);
    expect(second.settled?.assembly.usage).toMatchObject({ inputTokens: 7, cacheReadTokens: 5,
      outputTokens: 4, reasoningTokens: 3 });
    h.finishStep(second); h.laterUser("What failed earlier?");
    const third = h.runtime.prepare(h.spec(tools));
    await drain(third.stream()); h.finishStep(third);
    const sentSecond = body(h.sent[1]!);
    expect(sentSecond.messages.find(message => message.role === "assistant")).toMatchObject({
      reasoning_content: firstReason, tool_calls: [{ id: "call-read", type: "function",
        function: { name: wireName, arguments: rawArguments } }] });
    const toolResult = sentSecond.messages.find(message => message.role === "tool")!;
    expect(toolResult.tool_call_id).toBe("call-read");
    expect(JSON.parse(toolResult.content!)).toEqual({ type: "amc.tool-result", version: 1, isError: true, output: failedOutput });
    const later = body(h.sent[2]!);
    expect(later.messages.filter(message => message.role === "assistant").map(message => message.reasoning_content))
      .toEqual([firstReason, secondReason]);
    expect(later.messages.at(-1)).toEqual({ role: "user", content: "What failed earlier?" });
    expect(body(h.sent[0]!).thinking).toEqual({ type: "enabled" });
    expect(body(h.sent[0]!).reasoning_effort).toBe("high");
    for (const request of h.sent) {
      expect(request.url).toBe("https://deepseek.invalid/chat/completions");
      expect(request.headers.authorization).toBeUndefined();
    }
    h.close(); assertCold(h, [first, second, third]);
  });

  test("tools-free signed reasoning replay refuses before header/transport without discarding history", async () => {
    const h = harness([response(firstReason, "An answer without a tool call.")]);
    const first = h.runtime.prepare(h.spec([schema("fs.read")]));
    await drain(first.stream()); h.finishStep(first); h.laterUser("Continue without offered tools.");
    const headersBefore = h.session.readEvents().filter(row => row.event_type === "request/header").map(row => row.id);
    expect(() => h.runtime.prepare(h.spec(null))).toThrow(/thinking-replay-requires-offered-tools/);
    expect(h.sent).toHaveLength(1);
    expect(h.session.readEvents().filter(row => row.event_type === "request/header").map(row => row.id)).toEqual(headersBefore);
    h.session.endStep({ stopReason: "error", usage: null }); h.close(true); assertCold(h, [first]);
  });

  test("a removed historical tool is replayable but never re-authorized by that history", async () => {
    const wireName = providerToolWireName("fs.read");
    const h = harness([response(firstReason, "", { wireName, id: "old-call" }),
      response(secondReason, "", { wireName, id: "forbidden-repeat" })]);
    const first = h.runtime.prepare(h.spec([schema("fs.read")]));
    await drain(first.stream());
    h.session.recordToolResult({ toolCallId: "old-call", outcome: "ERROR", exitCode: 1,
      timedOut: false, denied: false, content: failedOutput });
    h.finishStep(first); h.session.startStep();
    const second = h.runtime.prepare(h.spec([schema("fs.stat")]));
    const seen: StreamChunk[] = [];
    await expect(drain(second.stream(), seen)).rejects.toMatchObject({ code: "AMC_LLM_UNOFFERED_TOOL_NAME" });
    const transmitted = body(h.sent[1]!);
    expect(transmitted.tools?.map(tool => tool.function.name)).toEqual([providerToolWireName("fs.stat")]);
    expect(transmitted.messages.find(message => message.role === "assistant")).toMatchObject({
      reasoning_content: firstReason, tool_calls: [{ id: "old-call", function: { name: wireName, arguments: rawArguments } }] });
    expect(executableCalls(seen)).toEqual([]);
    expect(h.session.readEvents().filter(row => row.event_type === "tool/call")).toHaveLength(1);
    h.finishStep(second); h.close(true); assertCold(h, [first, second]);
  });

  test("an unoffered valid alias cannot publish an executable tool block or signed tool/call", async () => {
    const h = harness([response(firstReason, "", { wireName: "unoffered_alias", id: "bad-call" })]);
    const call = h.runtime.prepare(h.spec([schema("fs.read")]));
    const seen: StreamChunk[] = [];
    await expect(drain(call.stream(), seen)).rejects.toMatchObject({ code: "AMC_LLM_UNOFFERED_TOOL_NAME" });
    expect(executableCalls(seen)).toEqual([]);
    expect(h.session.readEvents().filter(row => row.event_type === "tool/call")).toEqual([]);
    const failure = h.session.readEvents().find(row => row.event_type === "request/failure")!;
    expect(JSON.parse(failure.meta_json)).toMatchObject({ headerEventId: call.headerEventId,
      failure: { code: "AMC_LLM_UNOFFERED_TOOL_NAME" }, policy: { retryable: false } });
    h.finishStep(call); h.close(true); assertCold(h, [call]);
  });

  test.each([false, true])("offered authority stays immutable after prepare (return added alias=%s)", async added => {
    const original = "fs.read";
    const addedName = "fs.write";
    const h = harness([response(firstReason, "", {
      wireName: providerToolWireName(added ? addedName : original), id: "snapshot-call" })]);
    const tools = [{ ...schema(original) }];
    const call = h.runtime.prepare(h.spec(tools));
    tools[0]!.name = "renamed-after-prepare";
    tools.push({ ...schema(addedName) });
    const seen: StreamChunk[] = [];
    if (added) {
      await expect(drain(call.stream(), seen)).rejects.toMatchObject({ code: "AMC_LLM_UNOFFERED_TOOL_NAME" });
      expect(executableCalls(seen)).toEqual([]);
      expect(h.session.readEvents().filter(row => row.event_type === "tool/call")).toEqual([]);
    } else {
      await drain(call.stream(), seen);
      expect(executableCalls(seen).map(block => block.name)).toEqual([original]);
      h.session.recordToolResult({ toolCallId: "snapshot-call", outcome: "OK", exitCode: 0,
        timedOut: false, denied: false, content: "fixture result" });
    }
    expect(body(h.sent[0]!).tools?.map(tool => tool.function.name)).toEqual([providerToolWireName(original)]);
    h.finishStep(call); h.close(added); assertCold(h, [call]);
  });
});
