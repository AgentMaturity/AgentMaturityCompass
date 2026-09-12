/** P08 server/admission regressions — authored, not executed. Protocol fakes are
 * deliberate: the signed-evidence regressions live in cosProduct08Continuity. */
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createAcpAgent, type AcpAgent, type AcpAgentInit } from "../src/acp/acpAgentServer.js";
import { ACP_RUNTIME_FORMAT, ACP_RUNTIME_LIMITS, ACP_RUNTIME_META_KEY } from "../src/acp/acpRuntimeContracts.js";
import { checkAcpDefinition } from "../src/acp/acpSchema.js";
import type { AgentPromptResult, AgentSession } from "../src/agent/agentSession.js";
import type { NativeInputPart } from "../src/attachments/nativeOrderedInput.js";
import type { NativeAudioPart } from "../src/attachments/nativeAudioInput.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { anthropicAdapter } from "../src/llm/providers/anthropicAdapter.js";
import { geminiAudioAdapter } from "../src/llm/providers/geminiAudioAdapter.js";

type Frame = Record<string, unknown>;
const directories: string[] = [], agents: AcpAgent[] = [], unblock: (() => void)[] = [];
afterEach(async () => {
  for (const finish of unblock.splice(0)) finish();
  for (const agent of agents.splice(0)) await agent.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});
const success = (): AgentPromptResult => ({ ok: true, text: "not a signed update", status: "idle",
  validation: { status: "not-requested", turn: null, configSha256: null, checks: [] } });
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1sAAAAASUVORK5CYII=";
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((accept, refuse) => { resolve = accept; reject = refuse; });
  return { promise, resolve, reject };
}
function route(audio = false) {
  const registry = new AdapterRegistry(), providerId = audio ? "gemini-audio" : "anthropic";
  registry.register({ providerId, adapter: audio ? geminiAudioAdapter : anthropicAdapter,
    baseUrl: "https://unused.invalid", credentialRef: null, models: ["fixture"] });
  return registry.pin({ providerId, model: "fixture" });
}
function harness(options: Partial<Omit<AcpAgentInit, "workspace" | "agentId" | "write" | "sessionFactory">> = {}) {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-p08-runtime-"))); directories.push(workspace);
  const frames: Frame[] = [], replies = new Map<number, ReturnType<typeof deferred<Frame>>>();
  let nextId = 0;
  const prompt = vi.fn<AgentSession["prompt"]>(async () => success());
  const parts = vi.fn(async (_parts: readonly NativeInputPart[]) => success());
  const audio = vi.fn(async (_parts: readonly NativeAudioPart[]) => success());
  const cancel = vi.fn<AgentSession["cancel"]>(), release = vi.fn(async () => {}), close = vi.fn(async () => {});
  const log = vi.fn();
  const sessionFactory = vi.fn(({ sessionId }: { sessionId: string }): AgentSession => ({ sessionId,
    prompt, promptParts: parts, promptAudioParts: audio, cancel, release, close, readEvents: () => [] }));
  const agent = createAcpAgent({ workspace, agentId: "default", sessionFactory, log, ...options,
    write: bytes => {
      const frame = JSON.parse(bytes.toString("utf8")) as Frame; frames.push(frame);
      if (typeof frame.id === "number") { replies.get(frame.id)?.resolve(frame); replies.delete(frame.id); }
    } });
  agents.push(agent);
  const prepare = (method: string, params: unknown) => {
    const id = ++nextId, reply = deferred<Frame>(); replies.set(id, reply);
    return { id, result: reply.promise, frame: { jsonrpc: "2.0", id, method, params } };
  };
  const ingest = (...messages: Frame[]) => agent.connection.ingest(Buffer.from(messages.map(message => JSON.stringify(message)).join("\n") + "\n"));
  const begin = (method: string, params: unknown) => { const pending = prepare(method, params); ingest(pending.frame); return pending; };
  const call = (method: string, params: unknown) => begin(method, params).result;
  const cancelFrame = (sessionId: string, extra: Frame = {}) => ({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId, ...extra } });
  return { workspace, frames, agent, prompt, parts, audio, cancel, release, close, sessionFactory, log, prepare, ingest, begin, call, cancelFrame };
}
async function open(h: ReturnType<typeof harness>) {
  const initialized = await h.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
  const created = await h.call("session/new", { cwd: h.workspace, mcpServers: [] });
  const sessionId = (created.result as { sessionId: string }).sessionId;
  return { sessionId, initialized };
}
const textPrompt = (sessionId: string) => ({ sessionId, prompt: [{ type: "text", text: "hello" }] });

describe("P08 prompt-scoped cancellation and admission (unexecuted)", () => {
  test("same-read prompt/cancel refuses native work before admission; idle cancellation does not hit the next turn", async () => {
    const h = harness(), { sessionId } = await open(h);
    const pending = h.prepare("session/prompt", textPrompt(sessionId));
    h.ingest(pending.frame, h.cancelFrame(sessionId));
    expect((await pending.result).result).toEqual({ stopReason: "cancelled" });
    expect(h.prompt).not.toHaveBeenCalled(); expect(h.cancel).not.toHaveBeenCalled();
    const next = h.prepare("session/prompt", textPrompt(sessionId));
    h.ingest(h.cancelFrame(sessionId), next.frame);
    expect((await next.result).result).toMatchObject({ stopReason: "end_turn" });
    expect(h.prompt).toHaveBeenCalledTimes(1); expect(h.cancel).not.toHaveBeenCalled();
    expect(h.frames.filter(frame => frame.method === "session/update")).toEqual([]);
  });

  test("two same-read prompts cannot both claim an idle session", async () => {
    const h = harness(), { sessionId } = await open(h);
    const first = h.prepare("session/prompt", textPrompt(sessionId)), second = h.prepare("session/prompt", textPrompt(sessionId));
    h.ingest(first.frame, second.frame);
    expect((await first.result).result).toMatchObject({ stopReason: "end_turn" });
    expect((await second.result).error).toMatchObject({ code: -32602 });
    expect(h.prompt).toHaveBeenCalledTimes(1);
  });

  test("a cancelled rejected native promise returns cancelled, duplicate cancellation is delivered once, and another turn remains usable", async () => {
    const h = harness(), { sessionId } = await open(h), entered = deferred<void>(), gate = deferred<AgentPromptResult>();
    unblock.push(() => gate.resolve(success()));
    h.prompt.mockImplementationOnce(() => { entered.resolve(undefined); return gate.promise; });
    h.cancel.mockImplementationOnce(() => gate.reject(new Error("provider aborted")));
    const pending = h.begin("session/prompt", textPrompt(sessionId)); await entered.promise;
    h.ingest(h.cancelFrame(sessionId), h.cancelFrame(sessionId));
    expect((await pending.result).result).toEqual({ stopReason: "cancelled" });
    expect(h.cancel).toHaveBeenCalledTimes(1);
    expect((await h.call("session/prompt", textPrompt(sessionId))).result).toMatchObject({ stopReason: "end_turn" });
  });

  test("a cancel received after native resolution but before protocol settlement still wins", async () => {
    const h = harness(), { sessionId } = await open(h), entered = deferred<void>(), gate = deferred<AgentPromptResult>();
    unblock.push(() => gate.resolve(success()));
    h.prompt.mockImplementationOnce(() => { entered.resolve(undefined); return gate.promise; });
    const pending = h.begin("session/prompt", textPrompt(sessionId)); await entered.promise;
    gate.resolve(success()); h.ingest(h.cancelFrame(sessionId));
    expect((await pending.result).result).toEqual({ stopReason: "cancelled" });
  });

  test("request abort during schema admission commits no native prompt", async () => {
    const h = harness(), { sessionId } = await open(h);
    const pending = h.begin("session/prompt", textPrompt(sessionId));
    expect(h.agent.connection.abortInbound(pending.id)).toBe(true);
    expect((await pending.result).result).toEqual({ stopReason: "cancelled" });
    expect(h.prompt).not.toHaveBeenCalled();
  });

  test("native cancellation exceptions are contained and poison the session instead of claiming a clean cancel", async () => {
    const h = harness(), { sessionId } = await open(h), entered = deferred<void>(), gate = deferred<AgentPromptResult>();
    unblock.push(() => gate.resolve(success()));
    h.prompt.mockImplementationOnce(() => { entered.resolve(undefined); return gate.promise; });
    h.cancel.mockImplementation(() => { throw new Error("native cancellation failed"); });
    const pending = h.begin("session/prompt", textPrompt(sessionId)); await entered.promise;
    expect(() => h.ingest(h.cancelFrame(sessionId))).not.toThrow(); gate.resolve(success());
    expect((await pending.result).error).toMatchObject({ code: -32603 });
    expect((await h.call("session/prompt", textPrompt(sessionId))).error).toMatchObject({ code: -32603, message: expect.stringContaining("unusable") });
    expect(h.prompt).toHaveBeenCalledTimes(1);
  });

  test("malformed cancellation cannot cancel a valid active prompt", async () => {
    const h = harness(), { sessionId } = await open(h), entered = deferred<void>(), gate = deferred<AgentPromptResult>();
    unblock.push(() => gate.resolve(success()));
    h.prompt.mockImplementationOnce(() => { entered.resolve(undefined); return gate.promise; });
    const pending = h.begin("session/prompt", textPrompt(sessionId)); await entered.promise;
    h.ingest(h.cancelFrame(sessionId, { _meta: 9 })); gate.resolve(success());
    expect((await pending.result).result).toMatchObject({ stopReason: "end_turn" });
    expect(h.cancel).not.toHaveBeenCalled(); expect(h.log).toHaveBeenCalledWith(expect.stringContaining("malformed session/cancel"));
  });

  test.each([null, [], "amc-image-input@2", { inputFormat: null }, { inputFormat: "amc-image-input@999" }, { inputformat: "amc-image-input@2" }])(
    "malformed native metadata %j cannot downgrade into legacy execution", async extension => {
      const h = harness(), { sessionId } = await open(h);
      const response = await h.call("session/prompt", { ...textPrompt(sessionId), _meta: { [ACP_RUNTIME_META_KEY]: extension } });
      expect(response.error).toMatchObject({ code: -32602 }); expect(h.prompt).not.toHaveBeenCalled();
      expect(h.parts).not.toHaveBeenCalled(); expect(h.audio).not.toHaveBeenCalled();
    });

  test("unknown content fields and embedded resource bodies fail instead of being discarded", async () => {
    const h = harness(), { sessionId } = await open(h);
    for (const block of [{ type: "text", text: "hello", images: ["silently lost"] }, { type: "resource", resource: { uri: "file:///private", text: "body" } }]) {
      expect((await h.call("session/prompt", { sessionId, prompt: [block] })).error).toMatchObject({ code: -32602 });
    }
    expect(h.prompt).not.toHaveBeenCalled();
  });

  test("ordered image admission preserves empty and adjacent text, and never calls the legacy prompt", async () => {
    const h = harness({ promptRoute: route(), orderedImageInput: true }), { sessionId } = await open(h);
    const prompt = [{ type: "image", mimeType: "image/png", data: png }, { type: "text", text: "" },
      { type: "text", text: "  trailing\n" }];
    expect((await h.call("session/prompt", { sessionId, prompt })).result).toMatchObject({ stopReason: "end_turn" });
    expect(h.prompt).not.toHaveBeenCalled();
    expect(h.parts.mock.calls[0]?.[0]).toEqual([
      { type: "image", image: { filename: "acp-image-1.png", mediaType: "image/png", bytes: Buffer.from(png, "base64") } },
      { type: "text", text: "" }, { type: "text", text: "  trailing\n" }
    ]);
  });

  test("legacy prefix trimming is preserved, while an unattested ordered factory cannot accept text after an image", async () => {
    const h = harness({ promptRoute: route(), orderedImageInput: false }), { sessionId } = await open(h);
    const image = { type: "image", mimeType: "image/png", data: png };
    expect((await h.call("session/prompt", { sessionId, prompt: [{ type: "text", text: "  prefix  " }, image] })).error).toBeUndefined();
    expect(h.prompt.mock.calls[0]?.[0]).toBe("prefix");
    expect((await h.call("session/prompt", { sessionId, prompt: [image, { type: "text", text: "suffix" }] })).error).toMatchObject({ code: -32602 });
    expect(h.prompt).toHaveBeenCalledTimes(1); expect(h.parts).not.toHaveBeenCalled();
  });

  test("capabilities publish exact route/factory contracts and bounded limits without a verification claim", async () => {
    const h = harness({ promptRoute: route(true), orderedImageInput: true, audioInput: true }), { initialized } = await open(h);
    expect(initialized.result).toMatchObject({ agentCapabilities: { promptCapabilities: { image: true, audio: true, embeddedContext: false },
      _meta: { [ACP_RUNTIME_META_KEY]: { runtimeFormat: ACP_RUNTIME_FORMAT, verification: "not-verified", limits: ACP_RUNTIME_LIMITS,
        cancellation: "prompt-scoped", orderedImageInput: "amc-image-input@2", audioInput: {
          format: "amc-audio-input@1", encoderId: "gemini-generate-content", encoderVersion: 2, mimeTypes: ["audio/wav"] } } } } });
    expect(await checkAcpDefinition("InitializeResponse", initialized.result)).toEqual({ ok: true });
    const unsupported = harness({ orderedImageInput: true, audioInput: true }), other = await open(unsupported);
    expect(other.initialized.result).toMatchObject({ agentCapabilities: { promptCapabilities: { image: false, audio: false } } });
    expect(JSON.stringify(other.initialized.result)).not.toContain("amc-image-input@2");
  });

  test("the exact audio route admits original text/image/WAV/text order without flattening or transcription", async () => {
    const h = harness({ promptRoute: route(true), orderedImageInput: true, audioInput: true }), { sessionId } = await open(h);
    const wav = Buffer.alloc(44 + 3200);
    wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
    const prompt = [{ type: "text", text: "  before\n" }, { type: "image", mimeType: "image/png", data: png },
      { type: "audio", mimeType: "audio/wav", data: wav.toString("base64") }, { type: "text", text: "" }, { type: "text", text: "after  " }];
    expect((await h.call("session/prompt", { sessionId, prompt })).result).toMatchObject({ stopReason: "end_turn" });
    expect(h.prompt).not.toHaveBeenCalled(); expect(h.parts).not.toHaveBeenCalled();
    expect(h.audio.mock.calls[0]?.[0]).toEqual([
      { type: "text", text: "  before\n" },
      { type: "image", image: { filename: "acp-image-1.png", mediaType: "image/png", bytes: Buffer.from(png, "base64") } },
      { type: "audio", audio: { filename: "acp-audio-1.wav", mediaType: "audio/wav", bytes: wav } },
      { type: "text", text: "" }, { type: "text", text: "after  " }
    ]);
    const annotated = prompt.map((part, index) => index === 0 ? { ...part, _meta: { unsupported: true } } : part);
    expect((await h.call("session/prompt", { sessionId, prompt: annotated })).error).toMatchObject({ code: -32602 });
    expect(h.audio).toHaveBeenCalledTimes(1);
  });

  test("fork is explicitly unavailable without a context-preserving factory; initialize cannot be repeated", async () => {
    const h = harness(), { sessionId, initialized } = await open(h);
    expect(JSON.stringify(initialized.result)).not.toContain("authenticated-parent-history");
    expect((await h.call("session/fork", { sessionId, cwd: h.workspace })).error).toMatchObject({ code: -32601 });
    expect((await h.call("initialize", { protocolVersion: 1, clientCapabilities: {} })).error).toMatchObject({ code: -32600 });
  });

  test.each(["future-ending", "toString"])("an unsupported native ending %s never becomes a success-shaped empty response", async turnEndReason => {
    const h = harness(), { sessionId } = await open(h);
    h.prompt.mockResolvedValueOnce({ ...success(), turnEndReason } as AgentPromptResult);
    expect((await h.call("session/prompt", textPrompt(sessionId))).error).toMatchObject({ code: -32603 });
    expect(h.frames.filter(frame => frame.method === "session/update")).toEqual([]);
  });

  test("workspace aliases resolve to the process root, but additional roots and client MCP commands remain refused", async () => {
    const h = harness(); await h.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const alias = join(h.workspace, "alias"); symlinkSync(h.workspace, alias, "dir");
    expect((await h.call("session/new", { cwd: alias, mcpServers: [] })).result).toMatchObject({ sessionId: expect.any(String) });
    expect((await h.call("session/new", { cwd: h.workspace, additionalDirectories: [h.workspace], mcpServers: [] })).error).toMatchObject({ code: -32602 });
    expect((await h.call("session/new", { cwd: h.workspace, mcpServers: [{ name: "unreviewed", command: "never-run", args: [], env: [] }] })).error).toMatchObject({ code: -32602 });
    expect(h.sessionFactory).toHaveBeenCalledTimes(1);
  });

  test("release reserves its idle slot before async validation and a failed release cannot be reused", async () => {
    const h = harness(), { sessionId } = await open(h), releaseGate = deferred<void>();
    unblock.push(() => releaseGate.resolve(undefined)); h.release.mockImplementationOnce(() => releaseGate.promise);
    const releasing = h.prepare("_amc/session/release", { sessionId }), prompt = h.prepare("session/prompt", textPrompt(sessionId));
    h.ingest(releasing.frame, prompt.frame); expect((await prompt.result).error).toMatchObject({ code: -32602 });
    releaseGate.reject(new Error("release failed")); expect((await releasing.result).error).toMatchObject({ code: -32603 });
    expect((await h.call("session/prompt", textPrompt(sessionId))).error).toBeDefined();
    expect(h.prompt).not.toHaveBeenCalled();
  });
});
