/**
 * P1-38 capability matrix, native half: each native HTTP route through the REAL LlmRuntime and fetch transport against
 * a local server that plays that provider's wire format. No key, no provider, no network beyond loopback. Passing
 * tests record what they prove into test-results/capabilities/native.json for scripts/gen-capability-matrix.mjs.
 * The stub route is excluded: it is a synthetic demonstration, not a provider.
 */
import { createHash } from "node:crypto";
import { afterAll, describe, expect, test } from "vitest";
import type { LlmRouteConfig } from "../src/llm/adapter/adapterRegistry.js";
import { anthropicAdapter } from "../src/llm/providers/anthropicAdapter.js";
import { openaiAdapter } from "../src/llm/providers/openaiAdapter.js";
import { openaiResponsesAdapter } from "../src/llm/providers/openaiResponsesAdapter.js";
import { deepseekAdapter } from "../src/llm/providers/deepseekAdapter.js";
import { deepseekParams } from "../src/llm/providers/deepseekContract.js";
import { geminiAdapter } from "../src/llm/providers/geminiAdapter.js";
import { geminiAudioAdapter } from "../src/llm/providers/geminiAudioAdapter.js";
import { geminiParams } from "../src/llm/providers/geminiContract.js";
import { createOllamaRoute } from "../src/llm/providers/ollamaRoute.js";
import { ollamaParams } from "../src/llm/providers/ollamaContract.js";
import { providerToolWireName } from "../src/llm/request/providerToolNames.js";
import type { ToolSchema } from "../src/llm/request/requestSpec.js";
import { CapabilityRecorder, capabilityRoute } from "./helpers/capabilityResults.js";
import { chatSse, drain, runtimeHarness } from "./helpers/fixtureProviderHarness.js";
import { anthropicTextStream } from "./helpers/llmStubUpstream.js";
import { geminiCallPart, geminiFrame, geminiSse } from "./fixtures/nativeGeminiStream.js";
import { responsesImageStream } from "./fixtures/nativeResponsesImageStream.js";

const recorder = new CapabilityRecorder("native", "tests/nativeCapabilityContract.test.ts");
afterAll(() => { recorder.write(); });

const TEXT = "Hello from the fixture.";
const ARGS = '{"path":"a.txt"}';
const MODEL = "fixture-model";
const readTool: ToolSchema = { name: "fs.read", description: "Read a fixture file",
  parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } };

const sse = (frames: readonly { event?: string; data: string }[]) =>
  frames.map((frame) => `${frame.event === undefined ? "" : `event: ${frame.event}\n`}data: ${frame.data}\n\n`).join("");
async function bytesOf(body: AsyncIterable<Uint8Array>): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
function anthropicTool(wire: string): string {
  return sse([
    { event: "message_start", data: JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 0 } } }) },
    { event: "content_block_start", data: JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_fixture", name: wire, input: {} } }) },
    { event: "content_block_delta", data: JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: ARGS } }) },
    { event: "content_block_stop", data: JSON.stringify({ type: "content_block_stop", index: 0 }) },
    { event: "message_delta", data: JSON.stringify({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 3 } }) },
    { event: "message_stop", data: JSON.stringify({ type: "message_stop" }) }]);
}
function deepseekSse(delta: Record<string, unknown>, finish: string): string {
  const frame = (value: Record<string, unknown>, reason: string | null) => ({ id: "fixture", object: "chat.completion.chunk", model: MODEL,
    choices: [{ index: 0, delta: value, finish_reason: reason }], usage: reason === null ? null
      : { prompt_tokens: 12, prompt_cache_hit_tokens: 5, prompt_cache_miss_tokens: 7, completion_tokens: 4, total_tokens: 16 } });
  return `${[frame({ role: "assistant", content: "" }, null), frame(delta, null), frame({}, finish)]
    .map((value) => `data: ${JSON.stringify(value)}\n\n`).join("")}data: [DONE]\n\n`;
}
function ollamaNdjson(message: Record<string, unknown>): string {
  const row = (value: Record<string, unknown>, done: boolean) => JSON.stringify({ model: MODEL, created_at: "2026-10-18T00:00:00Z", message: value, done,
    ...(done ? { done_reason: "stop", prompt_eval_count: 12, eval_count: 4 } : {}) });
  return `${row({ role: "assistant", ...message }, false)}\n${row({ role: "assistant", content: "" }, true)}\n`;
}

interface NativeProbe {
  readonly route: (origin: string) => LlmRouteConfig;
  readonly params: Record<string, unknown>;
  readonly contentType?: string;
  readonly text: () => Promise<string> | string;
  readonly tool: (wire: string) => Promise<string> | string;
}
const plain = (providerId: string, adapter: LlmRouteConfig["adapter"]) => (origin: string): LlmRouteConfig =>
  ({ providerId, adapter, baseUrl: origin, credentialRef: null, models: [MODEL] });
const PROBES: Readonly<Record<string, NativeProbe>> = {
  anthropic: { route: plain("anthropic", anthropicAdapter), params: { max_tokens: 64, stream: true },
    text: () => sse(anthropicTextStream({ text: [TEXT], inputTokens: 10, outputTokens: 3 })), tool: anthropicTool },
  openai: { route: plain("openai", openaiAdapter), params: { max_tokens: 64 },
    text: () => chatSse({ text: TEXT }), tool: (wire) => chatSse({ tool: { id: "call_fixture", name: wire, args: ARGS } }) },
  "openai-responses": { route: plain("openai-responses", openaiResponsesAdapter), params: { max_output_tokens: 64 },
    text: () => bytesOf(responsesImageStream({ text: TEXT }).body),
    tool: (wire) => bytesOf(responsesImageStream({ toolName: wire, rawArguments: ARGS, callId: "call_fixture" }).body) },
  deepseek: { route: plain("deepseek", deepseekAdapter), params: deepseekParams({ max_tokens: 64, thinking: { type: "disabled" } }),
    text: () => deepseekSse({ content: TEXT }, "stop"),
    tool: (wire) => deepseekSse({ tool_calls: [{ index: 0, id: "call_fixture", type: "function", function: { name: wire, arguments: ARGS } }] }, "tool_calls") },
  gemini: { route: plain("gemini", geminiAdapter), params: geminiParams({ generationConfig: { maxOutputTokens: 64 } }),
    text: () => geminiSse([geminiFrame([JSON.stringify({ text: TEXT })])]).toString("utf8"),
    tool: (wire) => geminiSse([geminiFrame([geminiCallPart(wire, "call_fixture", ARGS)])]).toString("utf8") },
  "gemini-audio": { route: plain("gemini-audio", geminiAudioAdapter), params: geminiParams({ generationConfig: { maxOutputTokens: 64 } }),
    text: () => geminiSse([geminiFrame([JSON.stringify({ text: TEXT })])]).toString("utf8"),
    tool: (wire) => geminiSse([geminiFrame([geminiCallPart(wire, "call_fixture", ARGS)])]).toString("utf8") },
  ollama: { route: (origin) => createOllamaRoute({ model: MODEL, baseUrl: origin }), params: ollamaParams({ max_tokens: 64 }),
    contentType: "application/x-ndjson", text: () => ollamaNdjson({ content: TEXT }),
    tool: (wire) => ollamaNdjson({ content: "", tool_calls: [{ function: { index: 0, name: wire, arguments: JSON.parse(ARGS) as unknown }, id: "call_fixture" }] }) }
};
const ROUTES = Object.keys(PROBES);

async function harness(routeId: string, response: string) {
  const probe = PROBES[routeId]!;
  const h = await runtimeHarness({ responses: [response], model: MODEL, params: probe.params, route: probe.route,
    ...(probe.contentType === undefined ? {} : { contentType: probe.contentType }) });
  recorder.route(capabilityRoute(routeId, h.route.adapter));
  return h;
}
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

describe("native routes against local wire fixtures (P1-38 capability matrix)", () => {
  test.each(ROUTES)("%s: a text reply decodes with reported usage, and the fixture received exactly the signed bytes", async (routeId) => {
    const h = await harness(routeId, await PROBES[routeId]!.text());
    const call = h.runtime.prepare(h.spec());
    const chunks = await drain(call.stream());
    expect(call.settled?.failure).toBeNull();
    expect(h.received).toHaveLength(1);
    expect(sha256(h.received[0]!.body)).toBe(call.requestDigest);
    expect(chunks.some((chunk) => chunk.type === "block-end" && chunk.block.kind === "text" && chunk.block.text === TEXT)).toBe(true);
    expect(chunks.some((chunk) => chunk.type === "usage")).toBe(true);
    recorder.prove(routeId, ["text-input", "text-output", "usage"], "supported",
      "%s: a text reply decodes with reported usage, and the fixture received exactly the signed bytes");
  });

  test.each(ROUTES)("%s: a tool call decodes under the offered name", async (routeId) => {
    const wire = providerToolWireName("fs.read");
    const h = await harness(routeId, await PROBES[routeId]!.tool(wire));
    const call = h.runtime.prepare(h.spec([readTool]));
    const chunks = await drain(call.stream());
    expect(call.settled?.failure).toBeNull();
    expect(sha256(h.received[0]!.body)).toBe(call.requestDigest);
    const calls = chunks.flatMap((chunk) => chunk.type === "block-end" && chunk.block.kind === "tool_use" ? [chunk.block] : []);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ name: "fs.read", providerWireName: wire });
    expect(JSON.parse(calls[0]!.arguments)).toEqual(JSON.parse(ARGS));
    recorder.prove(routeId, ["tool-calls"], "supported", "%s: a tool call decodes under the offered name");
  });
});
