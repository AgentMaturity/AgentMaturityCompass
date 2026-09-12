/** AUTHORED UNEXECUTED / UNQUALIFIED. Actual selected Chat runtime and signed
 * sources, with only HTTP scripted. Never an installed-package or model claim.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { Command } from "commander";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { ingestAttachment } from "../src/attachments/attachmentIngest.js";
import { MAX_NATIVE_IMAGE_BYTES } from "../src/attachments/nativeImageInput.js";
import { loadNativeImageFiles } from "../src/attachments/nativeImageFiles.js";
import { runComposedTurn } from "../src/kernel/agentLoopRunner.js";
import { registerAgentCommands } from "../src/cli-agent-commands.js";
import { LocalCredentialsService } from "../src/credentials/localCredentialsService.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime, type LlmCallSpec } from "../src/llm/adapter/llmRuntime.js";
import type { LlmAdapter } from "../src/llm/adapter/adapterTypes.js";
import type { HttpRequest } from "../src/llm/adapter/transport.js";
import { openaiAdapter } from "../src/llm/providers/openaiAdapter.js";
import { openaiChatEncoder } from "../src/llm/request/openaiChatEncoder.js";
import { openaiChatEncoderV2 } from "../src/llm/request/openaiChatEncoderV2.js";
import { openaiChatEncoderV3 } from "../src/llm/request/openaiChatEncoderV3.js";
import { openaiChatEncoderV4 } from "../src/llm/request/openaiChatEncoderV4.js";
import { BUILT_IN_REQUEST_ENCODERS } from "../src/llm/request/builtInEncoders.js";
import { RequestEncoderRegistry } from "../src/llm/request/requestEncoder.js";
import { providerToolWireName, usesProviderToolNames } from "../src/llm/request/providerToolNames.js";
import type { EncodablePart, EncodableRequest } from "../src/llm/request/requestSpec.js";
import { resolveRequestSources } from "../src/llm/request/requestSources.js";
import * as publicLlm from "../src/llm/index.js";
import * as publicRoot from "../src/index.js";
import * as publicSdk from "../src/sdk/index.js";
import * as publicNative from "../src/sdk/nativeAgentClient.js";
import { paramsFor, routeFor } from "../src/cli-agent-options.js";
import { acpSupportsImageInput } from "../src/acp/acpPromptInput.js";
import { budgetsPath, loadBudgetsConfig, signBudgetsConfig } from "../src/budgets/budgets.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { sha256Hex } from "../src/utils/hash.js";
import { chatImageStream } from "./fixtures/nativeChatImageStream.js";
import { IMAGE_FIXTURE_MARKER, IMAGE_PNG_BASE64 } from "./fixtures/nativeAcpImageRuntime.js";

const PNG = Buffer.from(IMAGE_PNG_BASE64, "base64");
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
const roots: string[] = [], writers = new Set<SessionService>(), credentials: LocalCredentialsService[] = [];
afterEach(async () => {
  try {
    for (const writer of writers) writer.disposeWithoutClosing(); writers.clear();
    for (const store of credentials.splice(0)) await store.close();
  } finally { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); vi.unstubAllEnvs(); }
});
function harness(adapter: LlmAdapter = openaiAdapter, responses = [chatImageStream()], backend = "sqlite") {
  vi.stubEnv("AMC_SESSION_STORE", backend); vi.stubEnv("AMC_VAULT_PASSPHRASE", "chat-image-fixture-passphrase");
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-chat-image-"))); roots.push(root);
  initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
  const session = new SessionService(root); writers.add(session);
  session.open({ agentId: "default", harnessVersion: "chat-image-fixture", compositionDigest: "chat-image-fixture", policyDigest: "chat-image-fixture" });
  const system = session.recordSystemPrompt("Describe original signed images; HTTP fixture, not a model claim.");
  session.startTurn({ trigger: "user" }); session.startStep(); session.recordUserMessage("Compare the attached bytes.");
  const bytes = Buffer.from(PNG);
  expect(ingestAttachment({ session, filename: "pixel.png", content: bytes })).toMatchObject({ ok: true, sha256: sha256Hex(PNG), mimeType: "image/png" });
  bytes.fill(0);
  const store = new LocalCredentialsService({ env: {}, projectDir: null, homeDir: join(root, "empty-credentials"), includeDotenv: false, watch: false });
  credentials.push(store);
  const registry = new AdapterRegistry();
  registry.register({ providerId: "openai", adapter, baseUrl: "https://chat-image.invalid", credentialRef: null, models: ["fixture-model"] });
  const sent: HttpRequest[] = [];
  const runtime = new LlmRuntime({ session, credentials: store, registry, transport: async request => {
    sent.push({ ...request, body: Buffer.from(request.body), headers: { ...request.headers } });
    const response = responses.shift(); if (!response) throw new Error("Unexpected Chat fixture dispatch"); return response;
  } });
  const spec: LlmCallSpec = { providerId: "openai", model: "fixture-model", params: { max_tokens: 64 }, tools: null, systemPromptEventId: system.eventId };
  const close = (reason: "complete" | "error" = "complete") => {
    session.endStep({ stopReason: reason, usage: null }); session.endTurn({ reason }); session.sealTurn();
    session.close({ reason: "fixture-completed" }); writers.delete(session);
  };
  return { root, session, runtime, registry, spec, sent, close };
}
async function drain(stream: AsyncIterable<unknown>) {
  const chunks: unknown[] = []; for await (const chunk of stream) chunks.push(chunk); return chunks;
}
async function cli(root: string, args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, ["--import", import.meta.resolve("tsx"),
    fileURLToPath(new URL("./fixtures/nativeChatCli.ts", import.meta.url)), "agent-loop", "run", ...args],
  { cwd: root, env: { ...process.env, ...env }, stdio: "pipe", shell: false });
  let stdout = "", stderr = "", failure: Error | undefined;
  child.stdin.end(); child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
  const timer = setTimeout(() => { failure = new Error("Chat CLI source fixture timed out"); child.kill("SIGKILL"); }, 60_000);
  return new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
    child.stdout.on("data", (chunk: string) => { stdout += chunk; if (Buffer.byteLength(stdout) > 8 * 1024 * 1024) {
      failure = new Error("Chat CLI fixture stdout exceeded bound"); child.kill("SIGKILL");
    } });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; if (Buffer.byteLength(stderr) > 1024 * 1024) {
      failure = new Error("Chat CLI fixture stderr exceeded bound"); child.kill("SIGKILL");
    } });
    child.once("error", error => { failure = error; });
    child.once("close", code => { clearTimeout(timer); if (failure) reject(failure); else resolve({ stdout, stderr, code }); });
  });
}
function cold(h: { root: string; session: { sessionId: string } }) {
  const child = spawnSync(process.execPath, ["--import", import.meta.resolve("tsx"),
    fileURLToPath(new URL("./fixtures/nativeSignedImageCold.ts", import.meta.url)), h.root, h.session.sessionId],
  { encoding: "utf8", timeout: 30_000, maxBuffer: 32 * 1024 * 1024 });
  expect(child.error).toBeUndefined(); expect(child.status, child.stderr).toBe(0);
  return JSON.parse(child.stdout) as { status: string; bytes: string | null; recordedDigest: string; derivedDigest: string | null }[];
}
const imagePart = (bytes = PNG, mediaType = "image/png"): EncodablePart => ({ kind: "image", bytes, mediaType, sha256: sha256Hex(bytes) });
const imageWire = (bytes = PNG, mediaType = "image/png") => ({ type: "image_url", image_url: { url: `data:${mediaType};base64,${bytes.toString("base64")}`, detail: "auto" } });
const input = (): EncodableRequest => ({ model: "fixture-model", params: { max_tokens: 64 }, system: "Fixture",
  tools: [{ name: "fs.read", description: "read", parameters: { type: "object", properties: {} } }],
  messages: [{ role: "user", parts: [{ kind: "text", text: "Look" }, imagePart()] }] });

describe("native Chat signed-image encoder and runtime (not executed)", () => {
  test.each(["sqlite", "jsonl"])("%s: selected runtime sends original binary images and a closed writer reconstructs cold through the default registry", async backend => {
    const h = harness(openaiAdapter, [chatImageStream()], backend);
    const call = h.runtime.prepare(h.spec); const chunks = await drain(call.stream());
    expect(chunks).toContainEqual({ type: "usage", usage: { inputTokens: 8, outputTokens: 3, cacheReadTokens: 2 } });
    expect(h.sent).toHaveLength(1); const transmitted = h.sent[0]!;
    expect(transmitted.url).toBe("https://chat-image.invalid/v1/chat/completions"); expect(transmitted.headers.authorization).toBeUndefined();
    const body = JSON.parse(transmitted.body.toString("utf8"));
    expect(body).toMatchObject({ model: "fixture-model", max_tokens: 64, stream: true, stream_options: { include_usage: true } });
    expect(body.messages).toEqual([
      { role: "system", content: "Describe original signed images; HTTP fixture, not a model claim." },
      { role: "user", content: [{ type: "text", text: "Compare the attached bytes." }, imageWire()] }
    ]);
    expect(body.input).toBeUndefined(); expect(body.previous_response_id).toBeUndefined();
    const attachment = h.session.readEvents().find(row => row.event_type === "user/attachment")!;
    expect(readEventPayload(h.root, attachment)).toEqual({ status: "ok", bytes: PNG });
    expect(JSON.parse(attachment.meta_json)).toMatchObject({ mimeType: "image/png", bytes: PNG.length });
    const header = h.session.readEvents().find(row => row.event_type === "request/header")!;
    expect(JSON.parse(header.meta_json)).toMatchObject({ encoderId: "openai-chat", encoderVersion: 4 });
    h.close(); expect(cold(h)).toEqual([expect.objectContaining({ status: "reconstructed", bytes: transmitted.body.toString("base64"),
      recordedDigest: sha256Hex(transmitted.body), derivedDigest: call.requestDigest })]);
    const integrity = verifyLedgerIntegrity(h.root); expect(integrity.chain.ok, integrity.chain.errors.join("\n")).toBe(true);
    expect(integrity.trustRoot.anchored).toBe(false);
  }, 60_000);
  test.each(["sqlite", "jsonl"])("%s: real registered CLI action sends Chat images through local HTTP and leaves a cold-reconstructable closed session", async backend => {
    vi.stubEnv("AMC_SESSION_STORE", backend); vi.stubEnv("AMC_VAULT_PASSPHRASE", "chat-cli-fixture-passphrase");
    const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-chat-cli-"))); roots.push(root);
    initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
    writeFileSync(join(root, ".native-image-fixture"), IMAGE_FIXTURE_MARKER);
    const file = join(root, "pixel.png"); writeFileSync(file, PNG);
    const sent: { method?: string; url?: string; body: Buffer }[] = [], serverErrors: Error[] = [];
    const server = createServer((request, response) => {
      void (async () => {
        const chunks: Buffer[] = []; let size = 0;
        for await (const part of request) {
          const bytes = Buffer.from(part); size += bytes.length;
          if (size > 32 * 1024 * 1024) throw new Error("Chat CLI fixture request exceeded bound"); chunks.push(bytes);
        }
        sent.push({ method: request.method, url: request.url, body: Buffer.concat(chunks) });
        if (request.method !== "POST" || request.url !== "/v1/chat/completions") throw new Error("Unexpected CLI fixture HTTP route");
        const scripted = chatImageStream(); response.writeHead(scripted.status, scripted.headers);
        for await (const bytes of scripted.body) response.write(bytes); response.end();
      })().catch(error => { serverErrors.push(error instanceof Error ? error : new Error(String(error))); response.destroy(); });
    });
    try {
      await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
      const address = server.address(); if (!address || typeof address === "string") throw new Error("No fixture HTTP port");
      const result = await cli(root, ["--provider", "openai", "--model", "fixture-model", "--base-url", `http://127.0.0.1:${address.port}`,
        "--credential", "AMC_CHAT_IMAGE_FIXTURE_KEY", "--credentials-home", join(root, "empty-fixture-home"),
        "--tools", "none", "--no-delegate", "--max-tokens", "64", "--image", file, "--json", "Describe the original image"],
      { AMC_NATIVE_IMAGE_FIXTURE: "1", AMC_CHAT_IMAGE_FIXTURE_KEY: "disposable-fixture-only-not-a-provider-key",
        AMC_SESSION_STORE: backend, AMC_VAULT_PASSPHRASE: "chat-cli-fixture-passphrase" });
      expect(result.code, result.stderr).toBe(0); expect(serverErrors).toEqual([]); expect(sent).toHaveLength(1);
      const summary = JSON.parse(result.stdout); expect(typeof summary.sessionId).toBe("string");
      const body = JSON.parse(sent[0]!.body.toString("utf8"));
      expect(body.messages.find((message: { role: string }) => message.role === "user").content)
        .toEqual([{ type: "text", text: "Describe the original image" }, imageWire(),
          // The loop's context pre-step appends exactly one runtime-context snapshot after the operator's parts.
          { type: "text", text: expect.stringContaining("Current runtime context") }]);
      expect(body).toMatchObject({ max_tokens: 64, stream: true, stream_options: { include_usage: true } });
      expect(body.input).toBeUndefined(); rmSync(file);
      // The CLI process has closed before this fresh default-registry reader.
      expect(cold({ root, session: { sessionId: summary.sessionId } })).toEqual([
        expect.objectContaining({ status: "reconstructed", bytes: sent[0]!.body.toString("base64") })
      ]);
    } finally {
      server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }, 120_000);
  test("actual CLI parsing and composed local file input select Chat4; deleting the caller file does not remove signed cold sources", async () => {
    const program = new Command(); registerAgentCommands(program, { log: () => {}, error: () => {}, fail: () => {} });
    const command = program.commands.find(item => item.name() === "agent-loop")!.commands.find(item => item.name() === "run")!;
    expect(command.parseOptions(["--provider", "openai", "--model", "fixture-model", "--image", "one.png", "--image", "two.gif"]).unknown).toEqual([]);
    expect(command.opts()).toMatchObject({ provider: "openai", model: "fixture-model", image: ["one.png", "two.gif"] });
    vi.stubEnv("AMC_SESSION_STORE", "sqlite"); vi.stubEnv("AMC_VAULT_PASSPHRASE", "chat-image-fixture-passphrase");
    const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-chat-composed-"))); roots.push(root);
    initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
    const file = join(root, "pixel.png"); writeFileSync(file, PNG);
    const route = routeFor({ log: () => {}, error: () => {}, fail: () => {} }, "openai", {}, "fixture-model")!;
    const sent: Buffer[] = [];
    const outcome = await runComposedTurn({ workspace: root, agentId: "default", systemPrompt: "Chat original image fixture", prompt: "Describe",
      images: loadNativeImageFiles([file]), route: { providerId: route.providerId, model: "fixture-model", params: paramsFor(route.providerId, 64) },
      routes: [{ ...route, credentialRef: null, baseUrl: "https://chat-composed.invalid" }],
      transport: async request => { sent.push(Buffer.from(request.body)); return chatImageStream(); },
      credentials: { homeDir: join(root, "no-credentials"), projectDir: null, includeDotenv: false, watch: false } });
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0]!.toString("utf8")).messages.find((message: { role: string }) => message.role === "user").content)
      .toEqual([{ type: "text", text: "Describe" }, imageWire()]);
    rmSync(file); // Only this test's disposable caller file, never ledger history.
    expect(cold({ root, session: { sessionId: outcome.sessionId } })).toEqual([
      expect.objectContaining({ status: "reconstructed", bytes: sent[0]!.toString("base64") })
    ]);
  }, 60_000);
  test("images, fragmented raw function arguments, canonical offered identity, keyed failure and later text history replay together", async () => {
    const raw = '{ "path" : "fixture.txt" }';
    const h = harness(openaiAdapter, [chatImageStream({ toolName: providerToolWireName("fs.read"), rawArguments: raw }), chatImageStream(), chatImageStream()]);
    const tools = [{ name: "fs.read", description: "read", parameters: { type: "object", properties: {} } }];
    await drain(h.runtime.prepare({ ...h.spec, tools }).stream());
    const called = h.session.readEvents().find(row => row.event_type === "tool/call")!;
    expect(JSON.parse(called.meta_json)).toMatchObject({ toolName: "fs.read", providerName: { encoderVersion: 4, wireName: providerToolWireName("fs.read") } });
    expect(readEventPayload(h.root, called)).toEqual({ status: "ok", bytes: Buffer.from(raw) });
    h.session.recordToolResult({ toolCallId: "image-read", outcome: "ERROR", exitCode: 1, timedOut: false, denied: false, content: "Fixture policy refused reading" });
    h.session.endStep({ stopReason: "tool_calls", usage: null }); h.session.startStep();
    await drain(h.runtime.prepare({ ...h.spec, tools: [] }).stream());
    const replay = JSON.parse(h.sent[1]!.body.toString("utf8")); expect(replay.tools).toEqual([]);
    expect(replay.messages.find((item: { role: string }) => item.role === "assistant").tool_calls).toEqual([
      { id: "image-read", type: "function", function: { name: providerToolWireName("fs.read"), arguments: raw } }
    ]);
    const result = replay.messages.find((item: { role: string }) => item.role === "tool");
    expect(result.tool_call_id).toBe("image-read");
    expect(JSON.parse(result.content)).toEqual({ type: "amc.tool-result", version: 1, isError: true, output: "Fixture policy refused reading" });
    h.session.endStep({ stopReason: "complete", usage: null }); h.session.endTurn({ reason: "complete" }); h.session.sealTurn();
    h.session.startTurn({ trigger: "user" }); h.session.startStep(); h.session.recordUserMessage("Use the original image again.");
    await drain(h.runtime.prepare({ ...h.spec, tools: [] }).stream());
    expect(h.sent[2]!.body.toString("utf8")).toContain(IMAGE_PNG_BASE64);
    h.close(); expect(cold(h).map(row => row.bytes)).toEqual(h.sent.map(row => row.body.toString("base64")));
  }, 60_000);
  test("post-prepare mutation does not grant an unoffered response alias", async () => {
    const h = harness(openaiAdapter, [chatImageStream({ toolName: providerToolWireName("fs.write") })]);
    const tools = [{ name: "fs.read", description: "read", parameters: { type: "object" } }];
    const call = h.runtime.prepare({ ...h.spec, tools }); tools[0]!.name = "fs.write";
    await expect(drain(call.stream())).rejects.toThrow();
    expect(JSON.parse(h.sent[0]!.body.toString("utf8")).tools[0].function.name).toBe(providerToolWireName("fs.read"));
    expect(h.session.readEvents().some(row => row.event_type === "tool/call")).toBe(false); h.close("error");
  });
  test.each([1, 2, 3])("historical Chat v%s refuses image source before header and HTTP", encoderVersion => {
    const h = harness({ ...openaiAdapter, encoderVersion });
    expect(() => h.runtime.prepare(h.spec)).toThrow(/image/);
    expect(h.sent).toEqual([]); expect(h.session.readEvents().some(row => row.event_type === "request/header")).toBe(false); h.close("error");
  });
  test("all historical identities retain fixed text bytes; v4 delegates non-image function/error bytes to v3", () => {
    const registry = new RequestEncoderRegistry(BUILT_IN_REQUEST_ENCODERS);
    const plain: EncodableRequest = { ...input(), tools: null, messages: [{ role: "user", parts: [{ kind: "text", text: "one" }, { kind: "text", text: "two" }] }] };
    const golden = '{"max_tokens":64,"messages":[{"content":"Fixture","role":"system"},{"content":"onetwo","role":"user"}],"model":"fixture-model","stream":true,"stream_options":{"include_usage":true}}';
    for (const encoder of [openaiChatEncoder, openaiChatEncoderV2, openaiChatEncoderV3, openaiChatEncoderV4]) {
      expect(registry.get(encoder.id, encoder.version)).toBe(encoder); expect(encoder.encode(plain).toString("utf8")).toBe(golden);
      if (encoder.version < 4) expect(() => encoder.encode(input())).toThrow(/image/);
    }
    const mixed: EncodableRequest = { ...input(), params: { max_tokens: 64, tool_choice: { type: "function", function: { name: "fs.read" } } }, messages: [
      ...plain.messages, { role: "assistant", parts: [{ kind: "tool_use", toolCallId: "c1", toolName: "fs.read", argumentsJson: '{ "a": 1 }' }] },
      { role: "tool", parts: [{ kind: "tool_result", toolCallId: "c1", isError: true, text: '{"isError":false}' }] }
    ] };
    expect(openaiChatEncoderV4.encode(mixed)).toEqual(openaiChatEncoderV3.encode(mixed));
    expect(mixed.tools![0]!.name).toBe("fs.read"); expect(publicLlm.openaiChatEncoderV4).toBe(openaiChatEncoderV4);
    for (const surface of [publicRoot.llm, publicSdk.llm, publicNative.llm]) {
      expect(surface.openaiChatEncoderV4).toBe(openaiChatEncoderV4);
      expect(surface.openaiAdapter).toBe(openaiAdapter);
      expect(surface.DEFAULT_REQUEST_ENCODERS.get("openai-chat", 4)).toBe(openaiChatEncoderV4);
    }
    expect(publicLlm.OPENAI_CHAT_TEXT_CAPABILITIES.features["image-input"]).toBe("unsupported");
    expect(usesProviderToolNames("openai-chat", 4)).toBe(true); expect(usesProviderToolNames("openai-chat", 5)).toBe(false);
  });
  test("image-only and ordered signed content cannot shift adjacent empty, assistant or multiple keyed-result messages", () => {
    const request: EncodableRequest = { ...input(), messages: [
      { role: "user", parts: [] }, { role: "user", parts: [imagePart()] }, { role: "assistant", parts: [] },
      { role: "assistant", parts: [{ kind: "tool_use", toolCallId: "a", toolName: "fs.read", argumentsJson: " {} " }] },
      { role: "tool", parts: [{ kind: "tool_result", toolCallId: "a", text: "first", isError: false }, { kind: "tool_result", toolCallId: "b", text: "second", isError: true }] },
      { role: "user", parts: [{ kind: "text", text: "prefix" }, imagePart(GIF, "image/gif"), { kind: "text", text: "signed suffix" }, imagePart()] },
      { role: "user", parts: [{ kind: "text", text: "ordinary" }, { kind: "text", text: "text" }] }
    ] };
    const messages = JSON.parse(openaiChatEncoderV4.encode(request).toString("utf8")).messages;
    expect(messages.map((message: { role: string }) => message.role)).toEqual(["system", "user", "assistant", "tool", "tool", "user", "user"]);
    expect(messages[1]).toEqual({ role: "user", content: [imageWire()] }); expect(messages[2].content).toBeNull();
    expect(messages.slice(3, 5).map((message: { tool_call_id: string }) => message.tool_call_id)).toEqual(["a", "b"]);
    expect(messages[5].content).toEqual([{ type: "text", text: "prefix" }, imageWire(GIF, "image/gif"), { type: "text", text: "signed suffix" }, imageWire()]);
    expect(messages[6]).toEqual({ role: "user", content: "ordinarytext" });
    expect(JSON.parse(openaiChatEncoderV4.encode({ ...request, system: null }).toString("utf8")).messages).toEqual(messages.slice(1));
    // This is encoder-level signed order, NOT acceptance of public ACP interleaving.
  });
  test("actual CLI route and public capability select exactly Chat4, without a DeepSeek/model-support inference", () => {
    const fail = vi.fn(), route = routeFor({ log: () => {}, error: () => {}, fail }, "openai", {}, "fixture-model")!;
    expect(route.adapter).toBe(openaiAdapter); expect(fail).not.toHaveBeenCalled();
    const registry = new AdapterRegistry(); registry.register(route);
    const pinned = registry.pin({ providerId: "openai", model: "fixture-model" });
    expect(pinned).toMatchObject({ encoderId: "openai-chat", encoderVersion: 4, capabilities: { modelSupport: "not-probed" } });
    expect(acpSupportsImageInput(pinned)).toBe(true);
    for (const version of [0, 1, 2, 3, 5]) expect(acpSupportsImageInput({ ...pinned, encoderVersion: version })).toBe(false);
    expect(acpSupportsImageInput({ ...pinned, capabilities: null })).toBe(false);
    expect(acpSupportsImageInput({ ...pinned, encoderId: "unknown" })).toBe(false);
    expect(acpSupportsImageInput({ ...pinned, capabilities: { ...pinned.capabilities!, protocol: "deepseek-chat-completions" } })).toBe(false);
    expect(publicLlm.DEEPSEEK_CAPABILITIES.features["image-input"]).toBe("unsupported");
  });
  test.each(["assistant", "tool", "system"] as const)("%s images cannot acquire a user role", role => {
    expect(() => openaiChatEncoderV4.encode({ ...input(), messages: [{ role, parts: [imagePart()] }] })).toThrow();
  });
  test("hostile payload commitments, aggregate history and reserved params refuse without URL/file substitution", () => {
    const oversized = Buffer.alloc(MAX_NATIVE_IMAGE_BYTES + 1); PNG.copy(oversized);
    const invalid: EncodablePart[] = [{ kind: "image", sha256: sha256Hex(PNG) },
      { kind: "image", bytes: PNG, mediaType: "image/jpeg", sha256: sha256Hex(PNG) },
      { kind: "image", bytes: PNG, mediaType: "image/png", sha256: "0".repeat(64) },
      imagePart(Buffer.from("https://never-fetch.invalid/image.png")), imagePart(oversized)];
    for (const part of invalid) expect(() => openaiChatEncoderV4.encode({ ...input(), messages: [{ role: "user", parts: [part] }] })).toThrow();
    expect(() => openaiChatEncoderV4.encode({ ...input(), messages: Array.from({ length: 9 }, () => ({ role: "user" as const, parts: [imagePart()] })) })).toThrow(/limits/);
    const large = Buffer.alloc(3 * 1024 * 1024); PNG.copy(large); // Size/header fixture, not codec validation.
    expect(() => openaiChatEncoderV4.encode({ ...input(), messages: Array.from({ length: 3 }, () => ({ role: "user" as const, parts: [imagePart(large)] })) })).toThrow(/limits/);
    expect(() => openaiChatEncoderV4.encode({ ...input(), system: "x".repeat(32 * 1024 * 1024) })).toThrow(/request-body bound/);
    for (const params of [{ messages: [] }, { tools: [] }, { stream: false }, { stream_options: {} },
      { tool_choice: { type: "function", function: { name: "unoffered" } } }, { modalities: ["audio"] }]) {
      expect(() => openaiChatEncoderV4.encode({ ...input(), params })).toThrow();
    }
  });
  test.each(["missing", "pruned", "tampered", "mime", "length", "surface"] as const)("cold reconstruction keeps the %s provenance distinction", async mode => {
    const h = harness(); await drain(h.runtime.prepare(h.spec).stream()); h.close();
    // Mutate ONLY this test's fresh disposable workspace after closing its writer.
    const db = new Database(join(h.root, ".amc", "evidence.sqlite"));
    try {
      for (const trigger of ["protect_evidence_immutable", "no_delete_evidence", "no_update_evidence"]) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
      const row = db.prepare("SELECT id, meta_json FROM evidence_events WHERE session_id = ? AND event_type = 'user/attachment'").get(h.session.sessionId) as { id: string; meta_json: string };
      if (mode === "missing") db.prepare("UPDATE evidence_events SET payload_inline = NULL, payload_path = NULL, canonical_payload_path = NULL WHERE id = ?").run(row.id);
      else if (mode === "pruned") db.prepare("UPDATE evidence_events SET payload_pruned = 1 WHERE id = ?").run(row.id);
      else if (mode === "tampered") db.prepare("UPDATE evidence_events SET payload_inline = ? WHERE id = ?").run("changed original bytes", row.id);
      else {
        const meta = JSON.parse(row.meta_json);
        if (mode === "mime") meta.mimeType = "image/jpeg";
        if (mode === "length") meta.bytes++;
        if (mode === "surface") meta.amcSession.surface.part.sha256 = "0".repeat(64);
        db.prepare("UPDATE evidence_events SET meta_json = ? WHERE id = ?").run(JSON.stringify(meta), row.id);
      }
    } finally { db.close(); }
    expect(cold(h)[0]).toMatchObject({ status: mode === "missing" ? "payload-missing" : mode === "pruned" ? "payload-pruned" : "evidence-inconsistent", bytes: null });
  }, 60_000);
  test("signed source role/length/MIME contradictions refuse before request encoding", () => {
    const h = harness(), rows = h.session.readEvents(), original = rows.find(row => row.event_type === "user/attachment")!;
    for (const change of ["role", "length", "mime"]) {
      const meta = JSON.parse(original.meta_json);
      if (change === "role") meta.amcSession.surface.role = "assistant";
      if (change === "length") meta.bytes++;
      if (change === "mime") meta.mimeType = "image/jpeg";
      const result = resolveRequestSources({ workspace: h.root, events: rows.map(row => row.id === original.id ? { ...row, meta_json: JSON.stringify(meta) } : row),
        model: h.spec.model, params: h.spec.params, systemPromptEventId: h.spec.systemPromptEventId,
        toolSchemaEventId: null, toolSchemaSha256: null, projectionCutoffEventId: rows[rows.length - 1]!.id });
      expect(result.failure?.kind).toBe("evidence-inconsistent"); expect(result.request).toBeNull();
    }
    expect(h.sent).toEqual([]); h.close("error");
  });
  test("signed budget and cancellation still refuse before Chat image HTTP", async () => {
    const h = harness(), config = loadBudgetsConfig(h.root); config.budgets.perAgent.default!.daily.maxLlmRequests = 1;
    writeFileSync(budgetsPath(h.root), YAML.stringify(config)); signBudgetsConfig(h.root);
    await drain(h.runtime.prepare(h.spec).stream());
    await expect(drain(h.runtime.prepare(h.spec).stream())).rejects.toThrow(/request budget exhausted/); expect(h.sent).toHaveLength(1);
    const abort = new AbortController(), call = h.runtime.prepare({ ...h.spec, signal: abort.signal }); abort.abort();
    await expect(drain(call.stream())).rejects.toThrow(/cancelled before budget/); expect(h.sent).toHaveLength(1); h.close("error");
  });
  test.each([{ reasoning_content: "opaque thinking" }, { audio: { id: "audio" } }, { refusal: "not representable" }])("image admission does not widen unsupported output: %j", async unsupportedDelta => {
    const h = harness(openaiAdapter, [chatImageStream({ unsupportedDelta })]);
    await expect(drain(h.runtime.prepare(h.spec).stream())).rejects.toThrow(/unsupported/);
    expect(h.session.readEvents().some(row => row.event_type === "tool/call")).toBe(false); h.close("error");
  });
  test("missing reported usage is not fabricated for image requests", async () => {
    const h = harness(openaiAdapter, [chatImageStream({ omitUsage: true })]);
    await expect(drain(h.runtime.prepare(h.spec).stream())).rejects.toThrow(); h.close("error");
  });
});
