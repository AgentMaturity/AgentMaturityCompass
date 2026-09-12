/** AUTHORED UNEXECUTED. Actual public ACP/CLI/TS and HTTP, cold and hostile inputs. */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { afterEach, describe, expect, test } from "vitest";
import { AMCNativeClient } from "../src/sdk/nativeAgentClient.js";
import { NATIVE_ORDERED_INPUT_FORMAT } from "../src/attachments/nativeOrderedInput.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { budgetsPath, loadBudgetsConfig, signBudgetsConfig } from "../src/budgets/budgets.js";
import { sha256Hex } from "../src/utils/hash.js";
import { orderedCleanup, orderedWorkspace, openedOrdered, orderedHarness, orderedRequest, orderedCold, GIF64 } from "./fixtures/nativeOrderedImageHarness.js";
import { geminiInputParts, geminiInputBlocks, GEMINI_EXPECTED_INPUT, geminiTextResponse, geminiSse, geminiFrame } from "./fixtures/nativeGeminiStream.js";
import { imageInput } from "./fixtures/nativeAcpImageRuntime.js";

const clients: AMCNativeClient[] = [];
afterEach(async () => { try { for (const client of clients.splice(0).reverse()) await client.close(); } finally { await orderedCleanup(); } });
const cli: readonly [string, ...string[]] = [process.execPath, "--import", import.meta.resolve("tsx"), fileURLToPath(new URL("./fixtures/nativeGeminiCli.ts", import.meta.url))];
const env = (backend: string) => ({ AMC_NATIVE_GEMINI_FIXTURE: "1", AMC_GEMINI_FIXTURE_KEY: "disposable-not-a-provider-key",
  AMC_SESSION_STORE: backend, AMC_VAULT_PASSPHRASE: "ordered-image-fixture-passphrase" });
async function socketServer(mode: "normal" | "hang" | "redirect" = "normal") {
  const sent: { body: Buffer; url: string | undefined; key: string | string[] | undefined }[] = [], errors: Error[] = [];
  let entered!: () => void, disconnected!: () => void, redirected = 0;
  const started = new Promise<void>(resolve => { entered = resolve; }), closed = new Promise<void>(resolve => { disconnected = resolve; });
  const active = new Set<ServerResponse>();
  const server = createServer((request, response) => { void (async () => {
    active.add(response); response.once("close", () => { active.delete(response); disconnected(); });
    if (request.url === "/redirect-target") { redirected++; response.end(); return; }
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of request) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > 32 * 1024 * 1024) throw new Error("Fixture input bound"); chunks.push(bytes); }
    sent.push({ body: Buffer.concat(chunks), url: request.url, key: request.headers["x-goog-api-key"] });
    if (mode === "redirect") { response.writeHead(307, { location: "/redirect-target" }); response.end(); entered(); return; }
    response.writeHead(200, { "content-type": "text/event-stream" });
    if (mode === "hang") {
      response.write(geminiSse([geminiFrame(['{"text":"provisional α","thoughtSignature":"YQ=="}'], "hanging", null, null)])); entered(); return;
    }
    const scripted = geminiTextResponse(`socket-${sent.length}`); for await (const chunk of scripted.body) response.write(chunk);
    response.end(); entered();
  })().catch(error => { errors.push(error instanceof Error ? error : new Error(String(error))); response.destroy(); }); });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No fixture port");
  return { sent, errors, started, closed, redirected: () => redirected, baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => { for (const response of active) response.destroy(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}
async function connect(root: string, backend: string, baseUrl: string) {
  writeFileSync(join(root, ".native-gemini-fixture"), "disposable native Gemini fixture\n");
  const client = await AMCNativeClient.start({ workspace: root, provider: "gemini", model: "fixture-model", baseUrl,
    credential: "AMC_GEMINI_FIXTURE_KEY", credentialsMode: "operator-only", credentialsHome: join(root, "empty-home"),
    tools: "none", maxTokens: 64, command: cli, timeoutMs: 30_000, env: env(backend) }); clients.push(client); return client;
}
describe("native Gemini public seams (unexecuted)", () => {
  test.each(["sqlite", "jsonl"])("%s public ACP exact advertisement, source-bound order, resume and independent cold registry", async backend => {
    let response = 0; const transport = async () => geminiTextResponse(`acp-${++response}`);
    const { root, h, sessionId, initialized } = await openedOrdered(orderedWorkspace(backend), "gemini", { transport });
    expect(initialized.result).toMatchObject({ agentCapabilities: { promptCapabilities: { image: true, audio: false, embeddedContext: false },
      _meta: { "dev.agentmaturity.amc": { orderedImageInput: NATIVE_ORDERED_INPUT_FORMAT } } } });
    const request = h.begin("session/prompt", orderedRequest(sessionId, geminiInputBlocks())); request.bytes.fill(0);
    expect((await request.result).error).toBeUndefined();
    expect(JSON.parse(h.sent[0]!.body.toString()).contents[0].parts).toEqual(GEMINI_EXPECTED_INPUT);
    const rows = h.sessions.get(sessionId)!.readEvents();
    const inbox = rows.find(row => row.event_type === "loop/inbox" && JSON.parse(row.meta_json).payloadFormat === NATIVE_ORDERED_INPUT_FORMAT)!;
    expect(inbox).toBeDefined();
    const projected = rows.filter(row => ["user/message", "user/attachment"].includes(row.event_type));
    expect(projected.map(row => JSON.parse(row.meta_json).sourceContentIndex)).toEqual([0, 1, 2, 3]);
    expect(projected.every(row => JSON.parse(row.meta_json).sourceInputEventId === inbox.id)).toBe(true);
    for (const row of projected) { const payload = readEventPayload(root, row); if (payload.status !== "ok") throw new Error("missing source"); expect(sha256Hex(payload.bytes)).toBe(row.payload_sha256); }
    await h.call("_amc/session/release", { sessionId }); await h.close();
    const next = orderedHarness(root, "gemini", { transport }); await next.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    expect((await next.call("session/load", { sessionId, cwd: root, mcpServers: [] })).error).toBeUndefined();
    expect(next.frames.filter(frame => frame.params?.update.sessionUpdate === "user_message_chunk").map(frame => frame.params!.update.content)).toEqual(geminiInputBlocks());
    expect((await next.call("session/prompt", { sessionId, prompt: [{ type: "text", text: "Continue the originals" }] })).error).toBeUndefined(); await next.close();
    expect(orderedCold(root, sessionId).map(row => row.bytes)).toEqual([...h.sent, ...next.sent].map(request => request.body.toString("base64")));
  }, 120_000);
  test.each([
    { type: "image", mimeType: "image/gif", data: GIF64 }, { type: "image", mimeType: "image/png", uri: "file:///unread.png" },
    { type: "audio", mimeType: "audio/wav", data: "AAAA" }, { type: "unknown", text: "not erased" }
  ])("unsupported public content refuses before inbox and HTTP: %j", async block => {
    const { h, sessionId } = await openedOrdered(orderedWorkspace(), "gemini", { transport: async () => geminiTextResponse() });
    const before = h.sessions.get(sessionId)!.readEvents();
    expect((await h.call("session/prompt", orderedRequest(sessionId, [geminiInputBlocks()[1]!, block]))).error).toBeDefined();
    expect(h.sent).toEqual([]); expect(h.sessions.get(sessionId)!.readEvents()).toEqual(before);
  });
  test("Gemini does not bypass immutable preStep admission, signed budgets or resumed policy", async () => {
    const attacked = await openedOrdered(orderedWorkspace(), "gemini", { transport: async () => geminiTextResponse(), hooks: {
      preStep: async input => ({ kind: "enter", messages: input.messages.map(message => ({ ...message, parts: [...message.parts!].reverse() })) }),
      turnStopping: async () => {}, notify: () => {}
    } });
    await attacked.h.call("session/prompt", orderedRequest(attacked.sessionId, geminiInputBlocks()));
    expect(attacked.h.sent).toEqual([]);
    expect(attacked.h.sessions.get(attacked.sessionId)!.readEvents().filter(row => ["request/header", "user/message", "user/attachment"].includes(row.event_type))).toEqual([]);
    const root = orderedWorkspace(), config = loadBudgetsConfig(root); config.budgets.perAgent.default!.daily.maxLlmRequests = 1;
    writeFileSync(budgetsPath(root), YAML.stringify(config)); signBudgetsConfig(root);
    const { h, sessionId } = await openedOrdered(root, "gemini", { transport: async () => geminiTextResponse() });
    await h.call("session/prompt", orderedRequest(sessionId, geminiInputBlocks()));
    await h.call("session/prompt", orderedRequest(sessionId, geminiInputBlocks())); expect(h.sent).toHaveLength(1);
    await h.call("_amc/session/release", { sessionId }); await h.close();
    const changed = orderedHarness(root, "gemini", { transport: async () => geminiTextResponse(), policyDigest: sha256Hex("changed-policy") });
    await changed.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    expect((await changed.call("session/load", { sessionId, cwd: root, mcpServers: [] })).error).toBeDefined();
    expect(changed.sent).toEqual([]);
  });
  test.each(["sqlite", "jsonl"])("%s TypeScript -> registered ACP CLI -> actual socket HTTP -> restart/cold history", async backend => {
    const root = orderedWorkspace(backend), server = await socketServer();
    try {
      const first = await connect(root, backend, server.baseUrl), session = await first.newSession(), parts = geminiInputParts();
      const turn = session.promptParts(parts); for (const part of parts) if (part.type === "image") part.image.bytes.fill(0); parts.reverse();
      expect((await turn.result).text).toBe("Gemini fixture answer"); await session.release(); await first.close(); expect(first.processClosed).toBe(true);
      const second = await connect(root, backend, server.baseUrl), loaded = await second.resumeSession(session.sessionId);
      expect(loaded.history.filter(item => item.update.sessionUpdate === "user_message_chunk").map(item => item.update.content)).toEqual(geminiInputBlocks());
      expect((await loaded.prompt("Continue").result).text).toBe("Gemini fixture answer"); await second.close(); expect(second.processClosed).toBe(true);
      expect(server.errors).toEqual([]); expect(server.sent).toHaveLength(2);
      for (const request of server.sent) {
        expect(request.url).toBe("/v1beta/models/fixture-model:streamGenerateContent?alt=sse"); expect(request.key).toBe("disposable-not-a-provider-key");
        const body = JSON.parse(request.body.toString()); expect(body.contents[0].parts).toEqual(GEMINI_EXPECTED_INPUT); expect(body.generationConfig).toEqual({ maxOutputTokens: 64 });
      }
      expect(orderedCold(root, session.sessionId).map(row => row.bytes)).toEqual(server.sent.map(request => request.body.toString("base64")));
    } finally { for (const client of clients) await client.close(); await server.close(); }
  }, 120_000);
  test("actual in-flight public cancellation disposes its HTTP connection and child", async () => {
    const root = orderedWorkspace(), server = await socketServer("hang"); let client: AMCNativeClient | undefined;
    try {
      client = await connect(root, "sqlite", server.baseUrl); const session = await client.newSession(), turn = session.promptParts(geminiInputParts());
      await server.started; turn.cancel(); expect((await turn.result).stopReason).toBe("cancelled"); await server.closed;
      await client.close(); expect(client.processClosed).toBe(true); expect(server.sent).toHaveLength(1);
    } finally { await client?.close(); await server.close(); }
  }, 60_000);
  test("custom Gemini API-key header is never forwarded through a redirect", async () => {
    const root = orderedWorkspace(), server = await socketServer("redirect"); let client: AMCNativeClient | undefined;
    try {
      client = await connect(root, "sqlite", server.baseUrl); const session = await client.newSession();
      const outcome = await session.prompt("Do not follow redirect").result.then(value => ({ value }), error => ({ error }));
      expect("error" in outcome || ("value" in outcome && outcome.value.stopReason !== "end_turn")).toBe(true);
      expect(server.redirected()).toBe(0);
    } finally { await client?.close(); await server.close(); }
  }, 60_000);
  test("actual agent-loop run selects Gemini native body and original CLI image", async () => {
    const root = orderedWorkspace(), server = await socketServer();
    writeFileSync(join(root, ".native-gemini-fixture"), "disposable native Gemini fixture\n"); writeFileSync(join(root, "pixel.png"), imageInput().bytes);
    const child = spawn(cli[0]!, [...cli.slice(1), "agent-loop", "run", "--provider", "gemini", "--model", "fixture-model",
      "--base-url", server.baseUrl, "--credential", "AMC_GEMINI_FIXTURE_KEY", "--credentials-home", join(root, "empty-home"),
      "--tools", "none", "--max-tokens", "64", "--image", join(root, "pixel.png"), "--json", "Describe the original image"],
    { cwd: root, env: { ...process.env, ...env("sqlite") }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = ""; child.stdout!.on("data", bytes => { stdout += bytes.toString(); }); child.stderr!.on("data", bytes => { stderr += bytes.toString(); });
    const ended = new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", code => resolve(code)); });
    const timer = setTimeout(() => child.kill("SIGTERM"), 45_000);
    try {
      expect(await ended, stderr).toBe(0); const report = JSON.parse(stdout); expect(typeof report.sessionId).toBe("string");
      expect(server.sent).toHaveLength(1); expect(JSON.parse(server.sent[0]!.body.toString()).contents[0].parts).toEqual([
        { text: "Describe the original image" }, GEMINI_EXPECTED_INPUT[1],
        // The loop's context pre-step appends exactly one runtime-context snapshot after the operator's parts.
        { text: expect.stringContaining("Current runtime context") } ]);
      expect(orderedCold(root, report.sessionId)[0]!.bytes).toBe(server.sent[0]!.body.toString("base64"));
    } finally { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); await ended.catch(() => {}); await server.close(); }
  }, 60_000);
});
