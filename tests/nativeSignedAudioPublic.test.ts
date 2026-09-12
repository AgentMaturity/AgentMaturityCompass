/** AUTHORED UNEXECUTED. Actual public ACP, registered CLI, TS client and local HTTP. */
import { LoopInbox } from "../src/agent/inbox.js";
import { recordNativeAudioMessage } from "../src/agent/nativeAudioMessage.js";
import { outgrowSession, OUTGROW_ROWS } from "./helpers/outgrowSession.js";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { afterEach, describe, expect, test } from "vitest";
import { AMCNativeClient } from "../src/sdk/nativeAgentClient.js";
import { advertisesNativeAudio, ACP_NATIVE_AUDIO_CONTRACT } from "../src/acp/acpAudioInput.js";
import { NATIVE_AUDIO_INPUT_FORMAT } from "../src/attachments/nativeAudioInput.js";
import { NATIVE_AUDIO_FILE_MANIFEST_FORMAT } from "../src/attachments/nativeAudioFiles.js";
import { budgetsPath, loadBudgetsConfig, signBudgetsConfig } from "../src/budgets/budgets.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";
import { audioCleanup, audioWorkspace, audioParts, audioBlocks, expectedAudioWire, audioResponse, audioRequest, openedAudio, audioHarness, audioCold, wavBytes } from "./fixtures/nativeSignedAudio.js";
import { geminiSse, geminiFrame, geminiResponse } from "./fixtures/nativeGeminiStream.js";

const clients: AMCNativeClient[] = [];
afterEach(async () => { try { for (const client of clients.splice(0).reverse()) await client.close(); } finally { await audioCleanup(); } });
const command: readonly [string, ...string[]] = [process.execPath, "--import", import.meta.resolve("tsx"), fileURLToPath(new URL("./fixtures/nativeSignedAudioCli.ts", import.meta.url))];
const environment = (backend: string) => ({ AMC_NATIVE_AUDIO_FIXTURE: "1", AMC_AUDIO_FIXTURE_KEY: "disposable-not-a-provider-key",
  AMC_SESSION_STORE: backend, AMC_VAULT_PASSPHRASE: "ordered-image-fixture-passphrase" });
async function socketServer(hang: boolean | "redirect" = false) {
  const sent: { body: Buffer; url: string | undefined; key: string | string[] | undefined }[] = [], errors: Error[] = [], active = new Set<ServerResponse>();
  let entered!: () => void, disconnected!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }), closed = new Promise<void>(resolve => { disconnected = resolve; });
  let redirected = 0;
  const server = createServer((request, response) => { void (async () => {
    active.add(response); response.once("close", () => { active.delete(response); disconnected(); });
    if (request.url === "/unowned-file-target") { redirected++; response.end(); return; }
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of request) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > 32 * 1024 * 1024) throw new Error("Fixture HTTP body bound"); chunks.push(bytes); }
    sent.push({ body: Buffer.concat(chunks), url: request.url, key: request.headers["x-goog-api-key"] });
    if (hang === "redirect") { response.writeHead(307, { location: "/unowned-file-target" }); response.end(); entered(); return; }
    response.writeHead(200, { "content-type": "text/event-stream" });
    if (hang) { response.write(geminiSse([geminiFrame(['{"text":"provisional α","thoughtSignature":"YQ=="}'], "hanging", null, null)])); entered(); return; }
    for await (const bytes of audioResponse(`socket-${sent.length}`).body) response.write(bytes);
    response.end(); entered();
  })().catch(error => { errors.push(error instanceof Error ? error : new Error(String(error))); response.destroy(); }); });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No local audio fixture port");
  return { sent, errors, started, closed, redirected: () => redirected, baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => { for (const response of active) response.destroy(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}
async function connect(root: string, backend: string, baseUrl: string, provider = "gemini-audio") {
  writeFileSync(join(root, ".native-audio-fixture"), "disposable native audio fixture\n");
  const client = await AMCNativeClient.start({ workspace: root, provider, model: "fixture-model", baseUrl, credential: "AMC_AUDIO_FIXTURE_KEY",
    credentialsMode: "operator-only", credentialsHome: join(root, "empty-home"), tools: "none", maxTokens: 64, command, timeoutMs: 30_000, env: environment(backend) });
  clients.push(client); return client;
}
/** A failed stream leaves partial usage; continuing past it requires the operator's signed uncertainty waiver (AMC-1534). */
function waiveUnknownUsage(root: string): string {
  const config = loadBudgetsConfig(root); config.budgets.perAgent.default!.unknownTokenUsage = "ALLOW_WITH_WARNING";
  writeFileSync(budgetsPath(root), YAML.stringify(config)); signBudgetsConfig(root); return root;
}
describe("native audio public paths (unexecuted)", () => {
  test("a signed provider failure is not public success just because the driver returns idle", async () => {
    let requests = 0;
    const { h, sessionId } = await openedAudio(waiveUnknownUsage(audioWorkspace()), { transport: async () => ++requests === 1
      ? geminiResponse([geminiFrame([], "failed-audio", "SAFETY")]) : audioResponse("after-failure") });
    const failed = await h.call("session/prompt", audioRequest(sessionId));
    expect(failed.error).toMatchObject({ code: -32603 }); expect(failed.result).toBeUndefined();
    const endings = h.sessions.get(sessionId)!.readEvents().filter(row => row.event_type === "turn/end");
    expect(JSON.parse(endings.at(-1)!.meta_json).reason).toBe("error");
    const later = await h.call("session/prompt", { sessionId, prompt: [{ type: "text", text: "Continue after the recorded failure" }] });
    expect(later.error, JSON.stringify({ later, rows: h.sessions.get(sessionId)!.readEvents().filter(row => ["turn/end", "llm/failure", "request/header"].includes(row.event_type)).map(row => [row.event_type, row.meta_json]) })).toBeUndefined();
    expect(later.result).toMatchObject({ stopReason: "end_turn" });
    expect(requests).toBe(2);
  });
  test("the actual signed max-token ending survives idle state on the public audio path", async () => {
    const { h, sessionId } = await openedAudio(audioWorkspace(), { transport: async () =>
      geminiResponse([geminiFrame(['{"text":"bounded answer"}'], "limited-audio", "MAX_TOKENS")]) });
    const limited = await h.call("session/prompt", audioRequest(sessionId));
    expect(limited.error).toBeUndefined(); expect(limited.result).toMatchObject({ stopReason: "max_tokens" });
    expect(JSON.parse(h.sessions.get(sessionId)!.readEvents().filter(row => row.event_type === "turn/end").at(-1)!.meta_json).reason).toBe("max_tokens");
  });
  test.each(["sqlite", "jsonl"])("%s actual ACP advertises exact audio, signs ordered originals and replays authenticated history", async backend => {
    const { h, root, initialized, sessionId } = await openedAudio(audioWorkspace(backend));
    expect(initialized.result).toMatchObject({ agentCapabilities: { promptCapabilities: { audio: true, image: true, embeddedContext: false },
      _meta: { "dev.agentmaturity.amc": { audioInput: ACP_NATIVE_AUDIO_CONTRACT } } } });
    const pending = h.begin("session/prompt", audioRequest(sessionId)); pending.bytes.fill(0);
    expect((await pending.result).error).toBeUndefined(); expect(h.sent).toHaveLength(1);
    expect(JSON.parse(h.sent[0]!.body.toString()).contents[0].parts).toEqual(expectedAudioWire());
    const rows = h.sessions.get(sessionId)!.readEvents(), source = rows.find(row => row.event_type === "loop/inbox" && JSON.parse(row.meta_json).payloadFormat === NATIVE_AUDIO_INPUT_FORMAT)!;
    expect(source).toBeDefined();
    expect(rows.filter(row => ["user/message", "user/attachment"].includes(row.event_type)).map(row => JSON.parse(row.meta_json).sourceContentIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    await h.call("_amc/session/release", { sessionId }); await h.close();
    const next = audioHarness(root); await next.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    expect((await next.call("session/load", { sessionId, cwd: root, mcpServers: [] })).error).toBeUndefined();
    expect(next.frames.filter(frame => frame.params?.update.sessionUpdate === "user_message_chunk").map(frame => frame.params!.update.content)).toEqual(audioBlocks());
    expect((await next.call("session/prompt", { sessionId, prompt: [{ type: "text", text: "Continue" }] })).error).toBeUndefined(); await next.close();
    expect(audioCold(root, sessionId).map(row => row.bytes)).toEqual([...h.sent, ...next.sent].map(request => request.body.toString("base64")));
  }, 120_000);
  test.each([
    { type: "audio", mimeType: "audio/mpeg", data: wavBytes().toString("base64") },
    { type: "audio", mimeType: "audio/wav", data: "AAAA" },
    { type: "audio", mimeType: "audio/wav", data: wavBytes().toString("base64") + " " },
    { type: "audio", mimeType: "audio/wav", uri: "https://unowned.invalid/speech.wav" },
    { type: "audio", mimeType: "audio/wav", data: wavBytes().toString("base64"), uri: "files/unowned" },
    { type: "video", mimeType: "video/mp4", data: "AAAA" }, { type: "resource_link", uri: "file:///unread.pdf", name: "document" },
    { type: "text", text: "annotation cannot be lost", annotations: { audience: ["assistant"] } }
  ])("unsupported sibling %j refuses the WHOLE prompt before inbox or HTTP", async hostile => {
    const { h, sessionId } = await openedAudio(), before = h.sessions.get(sessionId)!.readEvents();
    expect((await h.call("session/prompt", audioRequest(sessionId, [...audioBlocks(), hostile]))).error).toBeDefined();
    expect(h.sent).toEqual([]); expect(h.sessions.get(sessionId)!.readEvents()).toEqual(before);
  });
  test.each([{ provider: "gemini" }, { provider: "openai" }, { provider: "gemini-audio", audioInput: false }])("route/factory %j cannot opt in from peer content", async options => {
    const { h, initialized, sessionId } = await openedAudio(audioWorkspace(), options);
    expect(initialized.result).toMatchObject({ agentCapabilities: { promptCapabilities: { audio: false } } });
    expect((await h.call("session/prompt", audioRequest(sessionId))).error).toBeDefined(); expect(h.sent).toEqual([]);
  });
  test("exact negotiated contract is required, not an optimistic boolean or near version", () => {
    const capabilities = { promptCapabilities: { audio: true }, _meta: { "dev.agentmaturity.amc": { audioInput: ACP_NATIVE_AUDIO_CONTRACT } } };
    expect(advertisesNativeAudio(capabilities)).toBe(true);
    for (const contract of [{ ...ACP_NATIVE_AUDIO_CONTRACT, encoderVersion: 1 }, { ...ACP_NATIVE_AUDIO_CONTRACT, mimeTypes: ["audio/mpeg"] },
      { ...ACP_NATIVE_AUDIO_CONTRACT, format: "amc-image-input@2" }, { ...ACP_NATIVE_AUDIO_CONTRACT, encoderId: "openai-chat" }, {}]) {
      expect(advertisesNativeAudio({ ...capabilities, _meta: { "dev.agentmaturity.amc": { audioInput: contract } } })).toBe(false);
    }
    expect(advertisesNativeAudio({ promptCapabilities: { audio: true } })).toBe(false);
  });
  test.each(["reverse", "drop", "downgrade", "veto"])("preStep %s cannot execute or project a partial original", async attack => {
    const { h, sessionId } = await openedAudio(audioWorkspace(), { hooks: {
      preStep: async input => attack === "veto" ? { kind: "reject", by: "fixture-policy" }
        : { kind: "enter", messages: attack === "drop" ? [] : input.messages.map(message => attack === "reverse"
          ? { ...message, audioParts: [...message.audioParts!].reverse() } : { ...message, audioParts: undefined, text: "flattened audio" }) },
      turnStopping: async () => {}, notify: () => {}
    } });
    await h.call("session/prompt", audioRequest(sessionId)); expect(h.sent).toEqual([]);
    const rows = h.sessions.get(sessionId)!.readEvents();
    expect(rows.filter(row => ["request/header", "user/message", "user/attachment"].includes(row.event_type))).toEqual([]);
    if (attack === "veto") expect(rows.some(row => row.event_type === "loop/veto")).toBe(true);
  });
  test("signed budgets and resumed policy remain ahead of execution", async () => {
    const root = audioWorkspace(), config = loadBudgetsConfig(root); config.budgets.perAgent.default!.daily.maxLlmRequests = 1;
    writeFileSync(budgetsPath(root), YAML.stringify(config)); signBudgetsConfig(root);
    const { h, sessionId } = await openedAudio(root); await h.call("session/prompt", audioRequest(sessionId)); await h.call("session/prompt", audioRequest(sessionId));
    expect(h.sent).toHaveLength(1); await h.call("_amc/session/release", { sessionId }); await h.close();
    const changed = audioHarness(root, { policyDigest: sha256Hex("changed-audio-policy") }); await changed.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    expect((await changed.call("session/load", { sessionId, cwd: root, mcpServers: [] })).error).toBeDefined(); expect(changed.sent).toEqual([]);
    expect(changed.frames.filter(frame => frame.method === "session/update")).toEqual([]);
  });
  test.each(["sqlite", "jsonl"])("%s TypeScript -> actual registered ACP CLI -> socket HTTP -> restart and independent cold registry", async backend => {
    const root = audioWorkspace(backend), server = await socketServer();
    try {
      const first = await connect(root, backend, server.baseUrl), session = await first.newSession(), original = audioParts();
      const turn = session.promptAudioParts(original); for (const part of original) if (part.type === "audio") part.audio.bytes.fill(0); else if (part.type === "image") part.image.bytes.fill(0); original.reverse();
      expect((await turn.result).text).toBe("Original audio fixture answer"); await session.release(); await first.close(); expect(first.processClosed).toBe(true);
      const second = await connect(root, backend, server.baseUrl), loaded = await second.resumeSession(session.sessionId);
      expect(loaded.history.filter(item => item.update.sessionUpdate === "user_message_chunk").map(item => item.update.content)).toEqual(audioBlocks());
      expect((await loaded.prompt("Continue").result).text).toBe("Original audio fixture answer"); await second.close(); expect(second.processClosed).toBe(true);
      expect(server.errors).toEqual([]); expect(server.sent).toHaveLength(2);
      for (const request of server.sent) { expect(request.url).toBe("/v1beta/models/fixture-model:streamGenerateContent?alt=sse");
        expect(request.key).toBe("disposable-not-a-provider-key"); expect(JSON.parse(request.body.toString()).contents[0].parts).toEqual(expectedAudioWire()); }
      expect(audioCold(root, session.sessionId).map(row => row.bytes)).toEqual(server.sent.map(request => request.body.toString("base64")));
    } finally { for (const client of clients) await client.close(); await server.close(); }
  }, 120_000);
  test("public cancellation closes its actual HTTP connection and client process", async () => {
    const root = audioWorkspace(), server = await socketServer(true); let client: AMCNativeClient | undefined;
    try { client = await connect(root, "sqlite", server.baseUrl); const session = await client.newSession(), turn = session.promptAudioParts(audioParts());
      await server.started; turn.cancel(); expect((await turn.result).stopReason).toBe("cancelled"); await server.closed;
      await client.close(); expect(client.processClosed).toBe(true); expect(server.sent).toHaveLength(1);
    } finally { await client?.close(); await server.close(); }
  }, 60_000);
  test("native maximum does not widen the lower ACP frame and old Gemini cannot accept audio", async () => {
    const root = audioWorkspace(), server = await socketServer();
    try {
      const client = await connect(root, "sqlite", server.baseUrl), session = await client.newSession();
      await expect(session.promptAudioParts([{ type: "audio", audio: { filename: "large.wav", mediaType: "audio/wav", bytes: wavBytes(1, 300000) } }]).result).rejects.toThrow(/frame|limit|256/i);
      const controller = new AbortController(); controller.abort(); expect(() => session.promptAudioParts(audioParts(), { signal: controller.signal })).toThrow(/cancel/i);
      expect(server.sent).toEqual([]); await client.close();
      const old = await connect(root, "sqlite", server.baseUrl, "gemini"), oldSession = await old.newSession();
      expect(() => oldSession.promptAudioParts(audioParts())).toThrow(/advertise|contract/i); expect(server.sent).toEqual([]);
    } finally { for (const client of clients) await client.close(); await server.close(); }
  }, 60_000);
  test("actual agent-loop run admits a local ordered audio manifest, not a transcript or positional reorder", async () => {
    const root = audioWorkspace(), server = await socketServer(); writeFileSync(join(root, ".native-audio-fixture"), "disposable native audio fixture\n");
    writeFileSync(join(root, "original.wav"), wavBytes()); const manifest = join(root, "input.json");
    writeFileSync(manifest, canonicalize({ format: NATIVE_AUDIO_FILE_MANIFEST_FORMAT, parts: [
      { type: "audio", path: "original.wav", mimeType: "audio/wav" }, { type: "text", text: "after original  " }] }));
    const child = spawn(command[0]!, [...command.slice(1), "agent-loop", "run", "--provider", "gemini-audio", "--model", "fixture-model", "--base-url", server.baseUrl,
      "--credential", "AMC_AUDIO_FIXTURE_KEY", "--credentials-home", join(root, "empty-home"), "--tools", "none", "--max-tokens", "64", "--audio-input", manifest, "--json"],
    { cwd: root, env: { ...process.env, ...environment("sqlite") }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = ""; child.stdout!.on("data", bytes => { stdout += bytes.toString(); }); child.stderr!.on("data", bytes => { stderr += bytes.toString(); });
    const ended = new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", code => resolve(code)); }), timer = setTimeout(() => child.kill("SIGTERM"), 45_000);
    try {
      expect(await ended, stderr).toBe(0); const report = JSON.parse(stdout); expect(server.sent).toHaveLength(1);
      expect(JSON.parse(server.sent[0]!.body.toString()).contents[0].parts).toEqual([{ inlineData: { mimeType: "audio/wav", data: wavBytes().toString("base64") } }, { text: "after original  " },
        // The loop's context pre-step appends exactly one runtime-context snapshot after the operator's parts.
        { text: expect.stringContaining("Current runtime context") }]);
      expect(audioCold(root, report.sessionId)[0]!.bytes).toBe(server.sent[0]!.body.toString("base64"));
    } finally { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); await ended.catch(() => {}); await server.close(); }
  }, 60_000);
  test("original-audio HTTP is never replayed to a redirect target", async () => {
    const root = audioWorkspace(), server = await socketServer("redirect"); let client: AMCNativeClient | undefined;
    try { client = await connect(root, "sqlite", server.baseUrl); const session = await client.newSession();
      await expect(session.promptAudioParts(audioParts()).result).rejects.toBeDefined();
      expect(server.sent).toHaveLength(1); expect(server.redirected()).toBe(0); expect(server.errors).toEqual([]);
    } finally { await client?.close(); await server.close(); }
  }, 60_000);
  test.each(["sqlite", "jsonl"])("%s valid in-process audio history larger than the ACP aggregate replay bound refuses the whole load, not a prefix", async backend => {
    const { h, root, sessionId } = await openedAudio(audioWorkspace(backend));
    const session = h.sessions.get(sessionId)!;
    const outcome = await session.promptAudioParts!([{ type: "text", text: "must not leak as a replay prefix" },
      { type: "audio", audio: { filename: "first-original.wav", mediaType: "audio/wav", bytes: wavBytes(1, 44_956) } }]);
    expect(outcome.ok).toBe(true); expect(h.sent).toHaveLength(1);
    await h.call("_amc/session/release", { sessionId }); await h.close();
    expect(audioCold(root, sessionId)[0]!.status).toBe("reconstructed");
    // Every queued row and attachment stays within the signed per-event cap; the replayed aggregate is what must be refused whole.
    expect(outgrowSession(root, sessionId, writer => {
      const inbox = new LoopInbox(writer, () => {});
      for (let i = 0; i < OUTGROW_ROWS; i++) {
        inbox.insert("next-turn", "", "followup", { wake: false, demotedFrom: null,
          audioParts: [{ type: "audio", audio: { filename: `outgrow-${i}.wav`, mediaType: "audio/wav", bytes: wavBytes(1, 44_956) } }] });
        recordNativeAudioMessage(writer, inbox.claim("next-turn")[0]!);
      }
    })).toBeGreaterThan(OUTGROW_ROWS);
    const next = audioHarness(root); await next.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const loaded = await next.call("session/load", { sessionId, cwd: root, mcpServers: [] });
    expect(loaded.error).toMatchObject({ data: { reason: "history-output-limit" } });
    expect(next.sent).toEqual([]); expect(next.frames.filter(frame => frame.method === "session/update")).toEqual([]);
  }, 90_000);
});
