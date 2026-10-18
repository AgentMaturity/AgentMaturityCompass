/**
 * P1-38 contract: each reviewed pi-ai route through the REAL LlmRuntime, fetch transport, signed session and the
 * lockfile-installed pi-ai@1.3.0, against a local HTTP server that speaks the OpenAI Chat Completions stream.
 * No key, no provider, no network beyond loopback. Passing tests record the features they prove into
 * test-results/capabilities/pi-ai.json; scripts/gen-capability-matrix.mjs renders the matrix from that file.
 */
import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import type { SessionService } from "../../src/session/sessionService.js";
import { ingestAttachment } from "../../src/attachments/attachmentIngest.js";
import { LlmCapabilityError } from "../../src/llm/adapter/providerCapabilities.js";
import { providerToolWireName } from "../../src/llm/request/providerToolNames.js";
import type { EncodableRequest, ToolSchema } from "../../src/llm/request/requestSpec.js";
import { loadPiAi, PI_AI_PACKAGE, PI_AI_PROVIDERS, PI_AI_VERSION, type PiAiLibrary, type PiAiProviderId } from "../../src/llm/providers/piAi/piAiLoader.js";
import { createPiAiEncoder, piAiEncoderId, PI_AI_ENCODER_VERSION } from "../../src/llm/providers/piAi/piAiEncoder.js";
import { piAiRouteFor, PI_AI_ADAPTER_ID, PI_AI_CAPABILITIES } from "../../src/llm/providers/piAi/piAiAdapter.js";
import { CapabilityRecorder, capabilityRoute } from "../helpers/capabilityResults.js";
import { chatSse, drain, FIXTURE_KEY, piHarness, PI_FIXTURE_MODELS } from "../helpers/fixtureProviderHarness.js";
import { IMAGE_PNG_BASE64 } from "../fixtures/nativeAcpImageRuntime.js";

const recorder = new CapabilityRecorder("pi-ai", "tests/piAi/piAiAdapterContract.test.ts");
for (const provider of PI_AI_PROVIDERS) {
  recorder.route(capabilityRoute(`pi-ai:${provider}`, { id: PI_AI_ADAPTER_ID, version: 1, capabilities: PI_AI_CAPABILITIES,
    encoderId: piAiEncoderId(provider), encoderVersion: PI_AI_ENCODER_VERSION }, `${PI_AI_PACKAGE}@${PI_AI_VERSION}`));
}
const headers = (session: SessionService) => session.readEvents().filter((event) => event.event_type === "request/header");
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const readTool: ToolSchema = { name: "fs.read", description: "Read a fixture file",
  parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } };

describe("pi-ai routes behind the adapter seam (P1-38, local fixture server)", () => {
  test("pi routes declare unknown for every feature no contract test proves", () => {
    expect(Object.entries(PI_AI_CAPABILITIES.features).filter(([, support]) => support !== "unknown")).toEqual([
      ["text-input", "supported"], ["text-output", "supported"], ["tool-calls", "supported"], ["tool-replay", "supported"],
      ["tool-result-error-flag", "unsupported"], ["tool-result-error-text", "unsupported"], ["usage", "supported"]]);
  });

  for (const provider of PI_AI_PROVIDERS) {
    recorder.test(`pi-ai:${provider}`, ["text-input", "text-output", "usage"], "supported",
      `${provider}: the fixture receives exactly the bytes the signed header commits to, and text and usage decode`, async () => {
      const h = await piHarness(provider, [chatSse({ text: "Hello from the fixture." })]);
      const call = h.runtime.prepare(h.spec());
      const chunks = await drain(call.stream());
      expect(h.received).toHaveLength(1);
      const wire = h.received[0]!;
      expect(wire.url).toBe("/v1/chat/completions");
      expect(wire.headers.authorization).toBe(`Bearer ${FIXTURE_KEY}`);
      expect(sha256(wire.body)).toBe(call.requestDigest);
      const header = JSON.parse(headers(h.session)[0]!.meta_json) as Record<string, unknown>;
      expect(header).toMatchObject({ providerId: `pi-ai:${provider}`, encoderId: `pi-ai:${provider}`, encoderVersion: 1, requestDigest: sha256(wire.body) });
      const body = JSON.parse(wire.body.toString("utf8")) as Record<string, unknown>;
      expect(body).toMatchObject({ model: PI_FIXTURE_MODELS[provider], stream: true, stream_options: { include_usage: true },
        messages: [{ role: "system", content: "Answer from the fixture; this is not a model claim." }, { role: "user", content: [{ type: "text", text: "Say hello." }] }] });
      expect(chunks).toContainEqual({ type: "block-end", index: 0, block: { kind: "text", text: "Hello from the fixture." } });
      expect(chunks).toContainEqual({ type: "usage", usage: { inputTokens: 10, outputTokens: 3 } });
      expect(call.settled?.failure).toBeNull();
    });
  }

  for (const provider of PI_AI_PROVIDERS) {
    recorder.test(`pi-ai:${provider}`, ["tool-calls", "tool-replay"], "supported",
      `${provider}: a streamed tool call decodes under the offered name and replays as history`, async () => {
      const wireName = providerToolWireName("fs.read");
      const h = await piHarness(provider, [chatSse({ tool: { id: "call_fixture_1", name: wireName, args: '{"path":"a.txt"}' } }),
        chatSse({ text: "Read it." })]);
      const first = h.runtime.prepare(h.spec([readTool]));
      const chunks = await drain(first.stream());
      expect(chunks).toContainEqual({ type: "block-end", index: 1, block: { kind: "tool_use", id: "call_fixture_1", name: "fs.read",
        providerWireName: wireName, arguments: '{"path":"a.txt"}' } });
      h.session.recordToolResult({ toolCallId: "call_fixture_1", outcome: "OK", exitCode: 0, timedOut: false, denied: false, content: "file text" });
      h.finishStep(first); h.session.startStep();
      const second = h.runtime.prepare(h.spec([readTool]));
      await drain(second.stream());
      expect(h.received).toHaveLength(2);
      expect(sha256(h.received[1]!.body)).toBe(second.requestDigest);
      const replay = JSON.parse(h.received[1]!.body.toString("utf8")) as { messages: Record<string, unknown>[]; tools: unknown[] };
      expect(replay.messages.slice(2)).toEqual([
        { role: "assistant", content: null, tool_calls: [{ id: "call_fixture_1", type: "function", function: { name: wireName, arguments: '{"path":"a.txt"}' } }] },
        { role: "tool", content: "file text", tool_call_id: "call_fixture_1" }]);
      expect(replay.tools).toHaveLength(1);
    });
  }

  for (const provider of PI_AI_PROVIDERS) {
    recorder.test(`pi-ai:${provider}`, ["tool-result-error-flag", "tool-result-error-text"], "unsupported",
      `${provider}: a failed tool result is refused before a header, because the pinned encoding cannot carry it`, async () => {
      const wireName = providerToolWireName("fs.read");
      const h = await piHarness(provider, [chatSse({ tool: { id: "call_fixture_2", name: wireName, args: '{"path":"a.txt"}' } })]);
      const first = h.runtime.prepare(h.spec([readTool]));
      await drain(first.stream());
      h.session.recordToolResult({ toolCallId: "call_fixture_2", outcome: "ERROR", exitCode: 1, timedOut: false, denied: false, content: "no such file" });
      h.finishStep(first); h.session.startStep();
      expect(() => h.runtime.prepare(h.spec([readTool]))).toThrow(LlmCapabilityError);
      expect(headers(h.session)).toHaveLength(1);
      expect(h.received).toHaveLength(1);
      // Why it is unsupported, not unknown: pi-ai@1.3.0 sends a failed and a successful result as identical bytes.
      const library = await loadPiAi();
      const payload = (isError: boolean) => capturePayload(library, provider, [
        { role: "user", content: [{ type: "text", text: "go" }], timestamp: 0 },
        { role: "assistant", content: [{ type: "toolCall", id: "c1", name: "fs_read", arguments: { path: "a" } }], api: "openai-completions",
          provider, model: PI_FIXTURE_MODELS[provider], usage: zeroUsage, stopReason: "toolUse", timestamp: 0 },
        { role: "toolResult", toolCallId: "c1", toolName: "fs_read", content: [{ type: "text", text: "out" }], isError, timestamp: 0 }]);
      expect(payload(true)).toBe(payload(false));
    });
  }

  test.each(PI_AI_PROVIDERS)("%s: image input is refused before any request/header row exists", async (provider) => {
    const h = await piHarness(provider, []);
    expect(ingestAttachment({ session: h.session, filename: "pixel.png", content: Buffer.from(IMAGE_PNG_BASE64, "base64") }))
      .toMatchObject({ ok: true });
    let refused: unknown;
    try { h.runtime.prepare(h.spec()); } catch (error) { refused = error; }
    expect(refused).toBeInstanceOf(LlmCapabilityError);
    expect(refused).toMatchObject({ capability: "image-input", support: "unknown" });
    expect(headers(h.session)).toEqual([]);
    expect(h.received).toEqual([]);
  });

  test.each(PI_AI_PROVIDERS)("%s: a stream without a usage frame settles with usage unknown, never zero", async (provider) => {
    const h = await piHarness(provider, [chatSse({ text: "No usage follows.", usage: false })]);
    const call = h.runtime.prepare(h.spec());
    await expect(drain(call.stream())).rejects.toMatchObject({ code: "AMC_LLM_STREAM_USAGE_MISSING" });
    expect(call.settled?.assembly.usage).toBeNull();
    const settlement = h.session.readEvents().find((event) => event.event_type === "request/failure");
    // The settlement row keeps its compatibility numerics but marks them unreported: a reader sees unknown, not zero.
    expect(JSON.parse(settlement!.meta_json)).toMatchObject({ outcome: "failed",
      usage: { reported: false, complete: false, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null } });
  });

  test("params without a reviewed mapping, and an output bound above the pinned catalog limit, are refused before a header", async () => {
    const h = await piHarness("groq", []);
    for (const params of [{ max_tokens: 64, top_p: 0.5 }, { max_tokens: 64, stream: false }, {}, { max_tokens: 10_000_000 }, { max_tokens: 64, temperature: 9 }]) {
      expect(() => h.runtime.prepare(h.spec(null, params))).toThrow(/pi-ai routes|exceeds the pinned catalog limit/);
    }
    expect(headers(h.session)).toEqual([]);
    expect(h.received).toEqual([]);
  });

  test("route selection refuses unknown routes, unknown models and reasoning models", async () => {
    await expect(piAiRouteFor("pi-ai:openai", {}, "gpt-4o")).rejects.toThrow(/reviewed pi-ai routes are pi-ai:groq, pi-ai:huggingface, pi-ai:together/);
    await expect(piAiRouteFor("pi-ai:groq", {}, undefined)).rejects.toThrow("--model is required for provider pi-ai:groq");
    await expect(piAiRouteFor("pi-ai:groq", {}, "no-such-model")).rejects.toThrow('has no groq model "no-such-model"');
    await expect(piAiRouteFor("pi-ai:groq", {}, "openai/gpt-oss-120b")).rejects.toThrow(/reasoning model/);
    const { route } = await piAiRouteFor("pi-ai:together", {}, PI_FIXTURE_MODELS.together);
    expect(route).toMatchObject({ providerId: "pi-ai:together", baseUrl: "https://api.together.ai/v1", models: [PI_FIXTURE_MODELS.together] });
  });

  test.each(PI_AI_PROVIDERS)("%s: the encoder's bytes equal what pi-ai's own send path transmits through its fetch option", async (provider) => {
    const library = await loadPiAi();
    let seen: { model: unknown; context: unknown; options: Record<string, unknown> } | null = null;
    const spy: PiAiLibrary = { ...library, streamCompletions: (model, context, options) => {
      seen = { model, context, options }; return library.streamCompletions(model, context, options);
    } };
    const request: EncodableRequest = { model: PI_FIXTURE_MODELS[provider], params: { max_tokens: 64, temperature: 0.2 }, system: "Fixture system.",
      tools: [readTool], messages: [
        { role: "user", parts: [{ kind: "text", text: "Read a.txt" }] },
        { role: "assistant", parts: [{ kind: "text", text: "Reading." }, { kind: "tool_use", toolCallId: "call_7", toolName: "fs.read", argumentsJson: '{"path":"a.txt"}' }] },
        { role: "tool", parts: [{ kind: "tool_result", toolCallId: "call_7", isError: false, text: "file text" }] },
        { role: "user", parts: [{ kind: "text", text: "Thanks." }] }] };
    const bytes = createPiAiEncoder(spy, provider).encode(request);
    expect(seen).not.toBeNull();
    const { onPayload: _capture, ...sendOptions } = seen!.options;
    let transmitted: unknown = null;
    const events = library.streamCompletions(seen!.model as never, seen!.context, { ...sendOptions, fetch: async (_url: unknown, init: { body?: unknown }) => {
      transmitted = init.body; throw new Error("fixture: stop after capturing the body");
    } }) as AsyncIterable<{ type: string }>;
    for await (const event of events) if (event.type === "error" || event.type === "done") break;
    expect(typeof transmitted).toBe("string");
    expect(Buffer.from(transmitted as string, "utf8").equals(bytes)).toBe(true);
    expect(createPiAiEncoder(library, provider).encode(request).equals(bytes)).toBe(true);
  });
});

const zeroUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

function capturePayload(library: PiAiLibrary, provider: PiAiProviderId, messages: unknown[]): string {
  let payload: unknown;
  library.streamCompletions(library.catalogs[provider][PI_FIXTURE_MODELS[provider]]!, library.normalizeContext({ messages }),
    { apiKey: "x", cacheRetention: "none", maxTokens: 64, onPayload: (value: unknown) => { payload = value; throw new Error("captured"); } });
  return JSON.stringify(payload);
}
