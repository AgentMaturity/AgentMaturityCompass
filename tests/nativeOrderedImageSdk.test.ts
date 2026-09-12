/** AUTHORED UNEXECUTED. Actual TS subprocess/CLI/native HTTP plus hostile peers. */
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { AMCNativeClient, AMCNativeProtocolError, AMCNativeRefusedError } from "../src/sdk/nativeAgentClient.js";
import { NATIVE_ORDERED_INPUT_FORMAT } from "../src/attachments/nativeOrderedInput.js";
import { checkAcpDefinition } from "../src/acp/acpSchema.js";
import { imageInput, IMAGE_FIXTURE_MARKER } from "./fixtures/nativeAcpImageRuntime.js";
import { chatImageStream } from "./fixtures/nativeChatImageStream.js";
import { orderedCleanup, orderedWorkspace, orderedParts, orderedBlocks, expectedImageWire, firstUserWire, orderedCold, PROVIDERS } from "./fixtures/nativeOrderedImageHarness.js";
const clients: AMCNativeClient[] = [], peerRoots: string[] = [];
afterEach(async () => { try { for (const client of clients.splice(0).reverse()) await client.close(); }
  finally { for (const root of peerRoots.splice(0)) rmSync(root, { recursive: true, force: true }); await orderedCleanup(); } });
async function peer(mode = "good") {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-ordered-peer-"))); peerRoots.push(root); const capture = join(root, "requests.jsonl");
  const client = await AMCNativeClient.start({ workspace: root, provider: "openai", model: "fixture-model", timeoutMs: 10_000,
    command: [process.execPath, fileURLToPath(new URL("./fixtures/nativeOrderedImageClientPeer.mjs", import.meta.url)), mode, capture] }); clients.push(client);
  return { client, requests: () => readFileSync(capture, "utf8").trim().split("\n").map(line => JSON.parse(line)) };
}
describe("ordered images in the public TypeScript client (unexecuted)", () => {
  test("synchronous original-byte snapshot and explicit negotiated metadata preserve every block", async () => {
    const { client, requests } = await peer(); const session = await client.newSession(); const parts = orderedParts();
    const turn = session.promptParts(parts); for (const part of parts) if (part.type === "image") part.image.bytes.fill(0); parts.reverse();
    expect((await turn.result).verification).toBe("not-verified");
    const sent = requests().find(row => row.method === "session/prompt"); expect(sent.params.prompt).toEqual(orderedBlocks());
    expect(sent.params._meta).toEqual({ "dev.agentmaturity.amc": { inputFormat: NATIVE_ORDERED_INPUT_FORMAT } });
    expect(await checkAcpDefinition("PromptRequest", sent.params)).toEqual({ ok: true });
    await session.release(); const loaded = await client.resumeSession(session.sessionId);
    expect(loaded.history.map(row => row.update.content)).toEqual(orderedBlocks());
    await loaded.prompt("Legacy text").result;
    const last = requests().filter(row => row.method === "session/prompt").at(-1)!;
    expect(last.params).toEqual({ sessionId: session.sessionId, prompt: [{ type: "text", text: "Legacy text" }] });
  });
  test.each(["missing", "truthy", "future", "no-image"])("%s peer cannot authorize ordered submission", async mode => {
    const { client, requests } = await peer(mode); const session = await client.newSession();
    expect(() => session.promptParts(orderedParts())).toThrow(AMCNativeRefusedError);
    expect(requests().some(row => row.method === "session/prompt")).toBe(false); await session.prompt("Text still works").result;
  });
  test("lower input frame bound and pre-abort leave no stranded turn or subprocess", async () => {
    const { client, requests } = await peer(); const session = await client.newSession(); const bytes = Buffer.alloc(200_000); imageInput().bytes.copy(bytes);
    await expect(session.promptParts([{ type: "image", image: { filename: "large.png", mediaType: "image/png", bytes } }, { type: "text", text: "suffix" }]).result)
      .rejects.toThrow(/ACP ingress frame limit/);
    const abort = new AbortController(); abort.abort(); expect(() => session.promptParts(orderedParts(), { signal: abort.signal })).toThrow(/cancelled before submission/);
    expect(requests().some(row => row.method === "session/prompt")).toBe(false); expect(client.processClosed).toBe(false);
    await session.promptParts(orderedParts()).result;
  });
  test("ordered and legacy prompts share concurrency, release and public cancellation", async () => {
    const { client, requests } = await peer("cancel"); const session = await client.newSession(); const turn = session.promptParts(orderedParts());
    expect(() => session.prompt("Concurrent legacy")).toThrow(/already active/); expect(() => session.promptParts(orderedParts())).toThrow(/already active/);
    await expect(session.release()).rejects.toThrow(); const iterator = turn[Symbol.asyncIterator](); await iterator.next(); turn.cancel();
    expect((await turn.result).stopReason).toBe("cancelled"); await iterator.return?.();
    expect(requests().filter(row => row.method === "session/cancel")).toHaveLength(1);
    await client.close(); expect(client.processClosed).toBe(true);
  });
  test.each(["malformed", "oversize"])("%s ordered history fails closed and closes the hostile peer", async mode => {
    const { client } = await peer(mode); await expect(client.resumeSession("ordered-wire-session")).rejects.toBeInstanceOf(AMCNativeProtocolError);
    await client.close(); expect(client.processClosed).toBe(true);
  });
  test("an unsolicited input image is not accepted as fresh model output", async () => {
    const { client } = await peer("unsolicited"); const session = await client.newSession();
    await expect(session.promptParts(orderedParts()).result).rejects.toThrow(/invalid or uncorrelated/);
    await client.close(); expect(client.processClosed).toBe(true);
  });
  test.each(["sqlite", "jsonl"].flatMap(backend => PROVIDERS.map(provider => ({ backend, provider }))))("$provider/$backend actual subprocess signed ordered lifecycle and cold reconstruction", async ({ backend, provider }) => {
    const root = orderedWorkspace(backend); writeFileSync(join(root, ".native-image-fixture"), IMAGE_FIXTURE_MARKER);
    const connect = async () => { const client = await AMCNativeClient.start({ workspace: root, provider, model: "fixture-model", timeoutMs: 30_000,
      command: [process.execPath, "--import", import.meta.resolve("tsx"), fileURLToPath(new URL("./fixtures/nativeAcpImageRuntime.ts", import.meta.url))],
      env: { AMC_NATIVE_IMAGE_FIXTURE: "1", AMC_SESSION_STORE: backend, AMC_VAULT_PASSPHRASE: "ordered-image-fixture-passphrase" } }); clients.push(client); return client; };
    const first = await connect(), session = await first.newSession(); const parts = orderedParts(); const turn = session.promptParts(parts);
    for (const part of parts) if (part.type === "image") part.image.bytes.fill(0);
    expect((await turn.result).text).toBe("Native image fixture response"); await session.release(); await first.close(); expect(first.processClosed).toBe(true);
    const second = await connect(), loaded = await second.resumeSession(session.sessionId);
    expect(loaded.history.filter(row => row.update.sessionUpdate === "user_message_chunk").map(row => row.update.content)).toEqual(orderedBlocks());
    expect((await loaded.prompt("Continue originals").result).text).toBe("Native image fixture response"); await second.close(); expect(second.processClosed).toBe(true);
    const sent = readFileSync(join(root, ".native-image-http.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line) as { body: string });
    expect(sent).toHaveLength(2); for (const row of sent) expect(firstUserWire(provider, Buffer.from(row.body, "base64"))).toEqual(expectedImageWire(provider));
    expect(orderedCold(root, session.sessionId).map(row => row.bytes)).toEqual(sent.map(row => row.body));
  }, 120_000);
  test.each(["sqlite", "jsonl"])("%s actual registered ACP CLI and socket HTTP preserve order", async backend => {
    const root = orderedWorkspace(backend); writeFileSync(join(root, ".native-image-fixture"), IMAGE_FIXTURE_MARKER);
    const sent: Buffer[] = [], errors: Error[] = [];
    const server = createServer((request, response) => { void (async () => {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of request) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > 32 * 1024 * 1024) throw new Error("Fixture request bound"); chunks.push(bytes); }
      if (request.method !== "POST" || request.url !== "/v1/chat/completions") throw new Error("Wrong actual CLI route");
      sent.push(Buffer.concat(chunks)); const scripted = chatImageStream(); response.writeHead(scripted.status, scripted.headers);
      for await (const chunk of scripted.body) response.write(chunk); response.end();
    })().catch(error => { errors.push(error instanceof Error ? error : new Error(String(error))); response.destroy(); }); });
    let client: AMCNativeClient | undefined;
    try {
      await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
      const address = server.address(); if (!address || typeof address === "string") throw new Error("No fixture port");
      client = await AMCNativeClient.start({ workspace: root, provider: "openai", model: "fixture-model", baseUrl: `http://127.0.0.1:${address.port}`,
        credential: "AMC_ORDERED_FIXTURE_KEY", credentialsMode: "operator-only", credentialsHome: join(root, "empty-home"), tools: "none", maxTokens: 64,
        command: [process.execPath, "--import", import.meta.resolve("tsx"), fileURLToPath(new URL("./fixtures/nativeOrderedAcpCli.ts", import.meta.url))], timeoutMs: 30_000,
        env: { AMC_NATIVE_IMAGE_FIXTURE: "1", AMC_ORDERED_FIXTURE_KEY: "disposable-not-a-provider-key", AMC_SESSION_STORE: backend, AMC_VAULT_PASSPHRASE: "ordered-image-fixture-passphrase" } }); clients.push(client);
      const session = await client.newSession(); expect((await session.promptParts(orderedParts()).result).text).toBe("Native image fixture response");
      expect(errors).toEqual([]); expect(sent).toHaveLength(1); expect(firstUserWire("openai", sent[0]!)).toEqual(expectedImageWire("openai"));
      await client.close(); expect(client.processClosed).toBe(true);
      expect(orderedCold(root, session.sessionId).map(row => row.bytes)).toEqual(sent.map(bytes => bytes.toString("base64")));
    } finally { await client?.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  }, 120_000);
});
