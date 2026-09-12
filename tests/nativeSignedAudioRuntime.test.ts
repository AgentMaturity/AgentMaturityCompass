/** AUTHORED UNEXECUTED. Actual signed writer/runtime, only HTTP responses scripted. */
import { stepUsage } from "./helpers/stepUsage.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { budgetsPath, loadBudgetsConfig, signBudgetsConfig } from "../src/budgets/budgets.js";
import { afterEach, describe, expect, test } from "vitest";
import { SessionService } from "../src/session/sessionService.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { LoopInbox } from "../src/agent/inbox.js";
import { openAgentSession } from "../src/agent/agentSession.js";
import { recordNativeAudioMessage } from "../src/agent/nativeAudioMessage.js";
import { LocalCredentialsService } from "../src/credentials/localCredentialsService.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime, type PreparedCall, type LlmCallSpec } from "../src/llm/adapter/llmRuntime.js";
import { acpRouteFor } from "../src/acp/acpStdioMain.js";
import type { HttpRequest, HttpResponse, HttpTransport } from "../src/llm/adapter/transport.js";
import type { StreamChunk, ToolUseContentBlock } from "../src/llm/streamChunk.js";
import type { ToolSchema } from "../src/llm/request/requestSpec.js";
import { providerToolWireName } from "../src/llm/request/providerToolNames.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { audioCleanup, audioWorkspace, audioParts, audioResponse, expectedAudioWire, AUDIO_USAGE, audioCold } from "./fixtures/nativeSignedAudio.js";
import { geminiFrame, geminiResponse, geminiCallPart, GEMINI_RAW_ARGS } from "./fixtures/nativeGeminiStream.js";

const writers = new Set<SessionService>(), stores: LocalCredentialsService[] = [];
afterEach(async () => { try { for (const writer of writers) writer.disposeWithoutClosing(); writers.clear(); for (const store of stores.splice(0)) await store.close(); } finally { await audioCleanup(); } });
const schema = (name: string): ToolSchema => ({ name, description: "Fixture function", parameters: { type: "object", properties: { path: { type: "string" }, offset: { type: "number" } } } });
const drain = async (stream: AsyncIterable<StreamChunk>, seen: StreamChunk[] = []) => { for await (const chunk of stream) seen.push(chunk); return seen; };
const calls = (chunks: readonly StreamChunk[]): ToolUseContentBlock[] => chunks.flatMap(chunk => chunk.type === "block-end" && chunk.block.kind === "tool_use" ? [chunk.block] : []);
function harness(script: (HttpResponse | HttpTransport)[], backend = "sqlite") {
  const root = audioWorkspace(backend), writer = new SessionService(root); writers.add(writer);
  writer.open({ agentId: "default", harnessVersion: "audio-runtime", compositionDigest: "audio-runtime", policyDigest: "audio-runtime" });
  const system = writer.recordSystemPrompt("Preserve original audio and exact historical function authority.");
  const inbox = new LoopInbox(writer, () => {}), parts = audioParts();
  inbox.insert("next-turn", "", "followup", { wake: false, demotedFrom: null, audioParts: parts });
  for (const part of parts) if (part.type === "audio") part.audio.bytes.fill(0); else if (part.type === "image") part.image.bytes.fill(0);
  parts.reverse(); writer.startTurn({ trigger: "user" }); writer.startStep(); recordNativeAudioMessage(writer, inbox.claim("next-turn")[0]!);
  const selected = acpRouteFor({ workspace: root, agentId: "default", providerId: "gemini-audio", model: "fixture-model", systemPrompt: "fixture" });
  if ("error" in selected) throw new Error(selected.error);
  const registry = new AdapterRegistry(); registry.register({ ...selected, credentialRef: null });
  const credentials = new LocalCredentialsService({ env: {}, projectDir: null, homeDir: join(root, "empty-home"), includeDotenv: false, watch: false }); stores.push(credentials);
  const sent: HttpRequest[] = [], runtime = new LlmRuntime({ session: writer, registry, credentials, transport: async request => {
    sent.push({ ...request, headers: { ...request.headers }, body: Buffer.from(request.body) });
    const next = script.shift(); if (!next) throw new Error("Unexpected audio fixture dispatch"); return typeof next === "function" ? next(request) : next;
  } });
  const spec = (tools: readonly ToolSchema[] | null): LlmCallSpec => ({ providerId: "gemini-audio", model: "fixture-model", params: { generationConfig: { maxOutputTokens: 64 } },
    systemPromptEventId: system.eventId, tools, requiredProtocol: "gemini-generate-content" });
  const finish = (call: PreparedCall) => writer.endStep({ stopReason: call.settled?.assembly.finishReason?.kind ?? "error", usage: stepUsage(call.settled?.assembly.usage) });
  const close = (failed = false) => { writer.endTurn({ reason: failed ? "error" : "complete" }); writer.sealTurn(); writer.close({ reason: "fixture-completed" }); writers.delete(writer); };
  return { root, writer, runtime, sent, spec, finish, close };
}
function result(writer: SessionService, id: string, error = false) {
  writer.recordToolResult({ toolCallId: id, outcome: error ? "ERROR" : "OK", exitCode: error ? 1 : 0, timedOut: false, denied: false,
    content: error ? '{"isError":false,"text":"actual failure"}' : "actual fixture result" });
}
describe("native audio Gemini2 signed runtime (unexecuted)", () => {
  test("a failed native multi-step audio prompt cannot lend its signed text to the next successful prompt", async () => {
    const root = audioWorkspace(), selected = acpRouteFor({ workspace: root, agentId: "default", providerId: "gemini-audio", model: "fixture-model", systemPrompt: "fixture" });
    // The failed step leaves partial usage; the signed budget (AMC-1534) blocks the next prompt unless the operator signs this waiver.
    const budgets = loadBudgetsConfig(root); budgets.budgets.perAgent.default!.unknownTokenUsage = "ALLOW_WITH_WARNING";
    writeFileSync(budgetsPath(root), YAML.stringify(budgets)); signBudgetsConfig(root);
    if ("error" in selected) throw new Error(selected.error);
    const registry = new AdapterRegistry(); registry.register({ ...selected, credentialRef: null });
    const credentials = new LocalCredentialsService({ env: {}, projectDir: null, homeDir: join(root, "empty-home"), includeDotenv: false, watch: false }); stores.push(credentials);
    let observed!: SessionService, request = 0;
    const session = openAgentSession({ workspace: root, agentId: "default", tools: "none", maxSteps: 3,
      route: { providerId: "gemini-audio", model: "fixture-model", params: { generationConfig: { maxOutputTokens: 64 } } },
      systemPrompt: "Use the explicitly offered fixture function", harnessVersion: "audio-failure-cursor",
      compositionDigest: "audio-failure-cursor", policyDigest: "audio-failure-cursor",
      // Only the function's returned fact and provider HTTP are scripted. The
      // real native session/driver/authority/writer and result cursor are used.
      bindTools: () => ({ schemas: () => [schema("fixture_tool")], executionMode: () => "exclusive" as const,
        execute: async () => ({ outcome: "OK" as const, content: "scripted fixture function result", exitCode: 0, denied: false, timedOut: false }) }),
      makeLlm: writer => {
        observed = writer;
        return new LlmRuntime({ session: writer, credentials, registry, transport: async () => {
          request++;
          if (request === 1) return geminiResponse([geminiFrame(['{"text":"text belonging only to the failed prompt"}', geminiCallPart("fixture_tool", "fixture-key", "{}")], "first-step")]);
          if (request === 2) return geminiResponse([geminiFrame([], "failed-step", "SAFETY")]);
          if (request === 3) return audioResponse("successful-next-prompt");
          throw new Error("Unexpected extra request");
        } });
      } });
    try {
      expect(await session.promptAudioParts(audioParts())).toMatchObject({ ok: false });
      expect(observed.readEvents().some(row => row.event_type === "assistant/block" && readEventPayload(root, row).status === "ok")).toBe(true);
      const next = await session.prompt("Continue without misattributing earlier text");
      expect(next, JSON.stringify({ next, failures: observed.readEvents().filter(row => ["request/failure", "loop/retry"].includes(row.event_type)).map(row => { const { amcSession, amcSessionWriter, ...rest } = JSON.parse(row.meta_json); return [row.event_type, amcSession.turn, rest]; }) })).toMatchObject({ ok: true, text: "Original audio fixture answer", turnEndReason: "complete" });
      expect(request).toBe(3);
    } finally { await session.close(); }
  });
  test.each(["sqlite", "jsonl"])("%s exact original audio/Parts/tool failures, usage and default fresh-process reconstruction", async backend => {
    const raw = ['{"thought":true,"text":"reason α","thoughtSignature":"YQ=="}', geminiCallPart(providerToolWireName("fs.read"), "provider:key"),
      geminiCallPart("fs_read"), '{"thoughtSignature":"Yg=="}'];
    const h = harness([geminiResponse([geminiFrame(raw, "first", "STOP", AUDIO_USAGE)]), audioResponse("second"), audioResponse("third")], backend);
    const first = h.runtime.prepare(h.spec([schema("fs.read"), schema("fs_read")])), offered = calls(await drain(first.stream()));
    expect(offered.map(call => call.name)).toEqual(["fs.read", "fs_read"]); expect(offered[0]!.arguments).toBe(GEMINI_RAW_ARGS);
    expect(offered[0]!.id).toBe("provider:key"); expect(offered[1]!.id).toMatch(/^amc-gemini-local-/);
    for (const row of h.writer.readEvents().filter(event => event.event_type === "tool/call")) {
      expect(readEventPayload(h.root, row)).toEqual({ status: "ok", bytes: Buffer.from(GEMINI_RAW_ARGS) });
      expect(JSON.parse(row.meta_json)).toMatchObject({ providerName: { encoderId: "gemini-generate-content", encoderVersion: 2, headerEventId: first.headerEventId } });
    }
    result(h.writer, offered[0]!.id, true); result(h.writer, offered[1]!.id); h.finish(first); h.writer.startStep();
    const second = h.runtime.prepare(h.spec(null)); await drain(second.stream()); h.finish(second);
    h.writer.endTurn({ reason: "complete" }); h.writer.sealTurn(); h.writer.startTurn({ trigger: "user" }); h.writer.recordUserMessage("Continue original audio"); h.writer.startStep();
    const third = h.runtime.prepare(h.spec(null)); await drain(third.stream()); h.finish(third);
    expect(second.settled?.assembly.usage).toEqual({ inputTokens: 7, cacheReadTokens: 5, outputTokens: 7, reasoningTokens: 3 });
    for (const request of h.sent) { expect(JSON.parse(request.body.toString()).contents[0].parts).toEqual(expectedAudioWire()); expect(request.url).toContain(":streamGenerateContent?alt=sse"); }
    const replay = h.sent[1]!.body.toString(); for (const part of raw) expect(replay).toContain(part);
    expect(replay).not.toContain(offered[1]!.id);
    expect(JSON.parse(replay).contents.at(-1).parts).toEqual([
      { functionResponse: { name: providerToolWireName("fs.read"), id: "provider:key", response: { error: '{"isError":false,"text":"actual failure"}' } } },
      { functionResponse: { name: "fs_read", response: { output: "actual fixture result" } } }
    ]);
    h.close(); const derived = audioCold(h.root, h.writer.sessionId);
    expect(derived.map(row => row.status)).toEqual(["reconstructed", "reconstructed", "reconstructed"]);
    expect(derived.map(row => row.bytes)).toEqual(h.sent.map(request => request.body.toString("base64")));
    expect(verifyLedgerIntegrity(h.root).chain).toEqual({ ok: true, errors: [] });
  }, 120_000);
  test.each(["generated-audio", "bad-usage", "trailing-frame", "unoffered", "duplicate-id"])("%s cannot publish a valid call prefix", async attack => {
    const wire = providerToolWireName(attack === "unoffered" ? "fs.write" : "fs.read"), part = geminiCallPart(wire, "one");
    const parts = attack === "generated-audio" ? [part, '{"inlineData":{"mimeType":"audio/wav","data":"AAAA"}}'] : attack === "duplicate-id" ? [part, part] : [part];
    const usage = attack === "bad-usage" ? { ...AUDIO_USAGE, candidatesTokensDetails: [{ modality: "AUDIO", tokenCount: 4 }] } : AUDIO_USAGE;
    const h = harness([geminiResponse([geminiFrame(parts, "hostile", "STOP", usage)], attack === "trailing-frame" ? "data: {unfinished" : "")]);
    const call = h.runtime.prepare(h.spec([schema("fs.read")])), seen: StreamChunk[] = [];
    await expect(drain(call.stream(), seen)).rejects.toBeDefined(); expect(calls(seen)).toEqual([]);
    expect(h.writer.readEvents().filter(row => row.event_type === "tool/call")).toEqual([]); h.finish(call); h.close(true);
  });
  test("replaying a removed historical function does not authorize its next provider call", async () => {
    const wire = providerToolWireName("fs.read"), h = harness([geminiResponse([geminiFrame([geminiCallPart(wire, "old")], "old", "STOP", AUDIO_USAGE)]),
      geminiResponse([geminiFrame([geminiCallPart(wire, "new")], "new", "STOP", AUDIO_USAGE)])]);
    const first = h.runtime.prepare(h.spec([schema("fs.read")])); await drain(first.stream()); result(h.writer, "old"); h.finish(first); h.writer.startStep();
    const next = h.runtime.prepare(h.spec([schema("fs.stat")])), seen: StreamChunk[] = [];
    await expect(drain(next.stream(), seen)).rejects.toMatchObject({ code: "AMC_LLM_UNOFFERED_TOOL_NAME" });
    expect(calls(seen)).toEqual([]); expect(h.writer.readEvents().filter(row => row.event_type === "tool/call")).toHaveLength(1); h.finish(next); h.close(true);
  });
  test("in-flight cancellation retains observations but never promotes an unfinished call", async () => {
    const controller = new AbortController(); let entered!: () => void, released = false;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const h = harness([async request => ({ status: 200, headers: { "content-type": "text/event-stream" }, body: (async function* () {
      try { yield Buffer.from(`data: ${geminiFrame([geminiCallPart(providerToolWireName("fs.read"), "cancel")], "cancel", null, null)}\n\n`); entered();
        if (!request.signal?.aborted) await new Promise<void>(resolve => request.signal!.addEventListener("abort", () => resolve(), { once: true }));
        throw new DOMException("Fixture abort", "AbortError");
      } finally { released = true; }
    })() })]);
    const call = h.runtime.prepare({ ...h.spec([schema("fs.read")]), signal: controller.signal }), seen: StreamChunk[] = [];
    const completion = expect(drain(call.stream(), seen)).rejects.toBeDefined(); await started; controller.abort(); await completion;
    expect(released).toBe(true); expect(calls(seen)).toEqual([]); expect(h.writer.readEvents().filter(row => row.event_type === "tool/call")).toEqual([]);
    h.finish(call); h.close(true);
  });
  test("a real Gemini1 signed function remains bound to its old offer when audio is appended under Gemini2", async () => {
    const root = audioWorkspace(), writer = new SessionService(root); writers.add(writer);
    writer.open({ agentId: "default", harnessVersion: "audio-upgrade", compositionDigest: "audio-upgrade", policyDigest: "audio-upgrade" });
    const system = writer.recordSystemPrompt("Original versioned calls stay bound to their original requests.");
    writer.startTurn({ trigger: "user" }); writer.recordUserMessage("Legacy request"); writer.startStep();
    const registry = new AdapterRegistry();
    for (const providerId of ["gemini", "gemini-audio"]) {
      const selected = acpRouteFor({ workspace: root, agentId: "default", providerId, model: "fixture-model", systemPrompt: "fixture" });
      if ("error" in selected) throw new Error(selected.error); registry.register({ ...selected, credentialRef: null });
    }
    const credentials = new LocalCredentialsService({ env: {}, projectDir: null, homeDir: join(root, "empty-home"), includeDotenv: false, watch: false }); stores.push(credentials);
    const sent: Buffer[] = [], original = geminiCallPart(providerToolWireName("fs.read"), "old-provider-key");
    const runtime = new LlmRuntime({ session: writer, credentials, registry, transport: async request => {
      sent.push(Buffer.from(request.body)); return sent.length === 1 ? geminiResponse([geminiFrame([original], "old-response")]) : audioResponse("new-response");
    } });
    const common = { model: "fixture-model", params: { generationConfig: { maxOutputTokens: 64 } }, systemPromptEventId: system.eventId };
    const first = runtime.prepare({ ...common, providerId: "gemini", tools: [schema("fs.read")] }); await drain(first.stream()); result(writer, "old-provider-key");
    writer.endStep({ stopReason: first.settled!.assembly.finishReason!.kind, usage: stepUsage(first.settled!.assembly.usage) }); writer.endTurn({ reason: "complete" }); writer.sealTurn();
    const inbox = new LoopInbox(writer, () => {}); inbox.insert("next-turn", "", "followup", { wake: false, demotedFrom: null, audioParts: audioParts() });
    writer.startTurn({ trigger: "user" }); writer.startStep(); recordNativeAudioMessage(writer, inbox.claim("next-turn")[0]!);
    const next = runtime.prepare({ ...common, providerId: "gemini-audio", tools: null }); await drain(next.stream());
    expect(sent[1]!.toString()).toContain(original);
    const historical = writer.readEvents().find(event => event.event_type === "tool/call")!;
    expect(JSON.parse(historical.meta_json)).toMatchObject({ providerName: { encoderVersion: 1, headerEventId: first.headerEventId } });
    expect(JSON.parse(writer.readEvents().find(event => event.id === next.headerEventId)!.meta_json).encoderVersion).toBe(2);
    writer.endStep({ stopReason: next.settled!.assembly.finishReason!.kind, usage: stepUsage(next.settled!.assembly.usage) }); writer.endTurn({ reason: "complete" }); writer.sealTurn();
    writer.close({ reason: "fixture-completed" }); writers.delete(writer);
    expect(audioCold(root, writer.sessionId).map(row => row.bytes)).toEqual(sent.map(body => body.toString("base64")));
  });
});
