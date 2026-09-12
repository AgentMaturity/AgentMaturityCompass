/** AUTHORED UNEXECUTED. Real TypeScript subprocess client, signed native fixture
 * and separate hostile wire peer. No installed package or live-model claim.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { AMCNativeClient, AMCNativeProtocolError, AMCNativeRefusedError } from "../src/sdk/nativeAgentClient.js";
import { checkAcpDefinition } from "../src/acp/acpSchema.js";
import { IMAGE_FIXTURE_MARKER, IMAGE_PNG_BASE64, imageInput } from "./fixtures/nativeAcpImageRuntime.js";

const roots: string[] = [], clients: AMCNativeClient[] = [];
const peer = fileURLToPath(new URL("./fixtures/nativeAcpImageClientPeer.mjs", import.meta.url));
const runtime = fileURLToPath(new URL("./fixtures/nativeAcpImageRuntime.ts", import.meta.url));
const coldFixture = fileURLToPath(new URL("./fixtures/nativeSignedImageCold.ts", import.meta.url));
afterEach(async () => {
  try { for (const client of clients.splice(0).reverse()) await client.close(); }
  finally { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); }
});
function workspace() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-image-sdk-"))); roots.push(root); return root;
}
async function peerClient(mode = "good", root = workspace()) {
  const capture = join(root, "peer-requests.jsonl");
  const client = await AMCNativeClient.start({ workspace: root, provider: "anthropic", model: "fixture-model",
    command: [process.execPath, peer, mode, capture], timeoutMs: 10_000 }); clients.push(client);
  const requests = () => readFileSync(capture, "utf8").trim().split("\n").map(line => JSON.parse(line) as {
    method: string; params: { sessionId?: string; prompt?: { type: string; text?: string; data?: string; mimeType?: string }[] }
  });
  return { client, root, requests };
}
async function nativeClient(root: string, backend: string, provider: "anthropic" | "openai-responses" | "openai" = "anthropic") {
  const client = await AMCNativeClient.start({ workspace: root, provider, model: "fixture-model",
    command: [process.execPath, "--import", import.meta.resolve("tsx"), runtime], timeoutMs: 30_000,
    env: { AMC_NATIVE_IMAGE_FIXTURE: "1", AMC_SESSION_STORE: backend, AMC_VAULT_PASSPHRASE: "native-image-sdk-fixture-passphrase" } });
  clients.push(client); return client;
}

describe("public TypeScript native images (not executed)", () => {
  test("sends standard image fields from an immutable snapshot and preserves the text API", async () => {
    const { client, requests } = await peerClient(); const session = await client.newSession();
    const image = imageInput();
    const turn = session.prompt("Original text", { images: [image] }); image.bytes.fill(0);
    expect((await turn.result).verification).toBe("not-verified");
    await session.prompt("Legacy text only").result;
    const prompts = requests().filter(row => row.method === "session/prompt");
    expect(prompts[0]!.params.prompt).toEqual([{ type: "text", text: "Original text" },
      { type: "image", mimeType: "image/png", data: IMAGE_PNG_BASE64 }]);
    expect(prompts[1]!.params.prompt).toEqual([{ type: "text", text: "Legacy text only" }]);
    expect(await checkAcpDefinition("PromptRequest", prompts[0]!.params)).toEqual({ ok: true });
    await client.close(); expect(client.processClosed).toBe(true);
  });
  test("image-only works and pre-aborted image submission sends nothing", async () => {
    const { client, requests } = await peerClient(); const session = await client.newSession();
    await session.prompt("", { images: [imageInput()] }).result;
    const before = requests(); const abort = new AbortController(); abort.abort();
    expect(() => session.prompt("No dispatch", { signal: abort.signal, images: [imageInput()] })).toThrow(/cancelled before submission/);
    expect(requests()).toEqual(before);
  });
  test.each(["no-image", "truthy-image"])("%s capability never authorizes images or implicit fallback", async mode => {
    const { client, requests } = await peerClient(mode); const session = await client.newSession();
    expect(() => session.prompt("Look", { images: [imageInput()] })).toThrow(AMCNativeRefusedError);
    expect(requests().some(row => row.method === "session/prompt")).toBe(false);
    await session.prompt("Text remains supported").result;
    expect(requests().filter(row => row.method === "session/prompt")).toHaveLength(1);
  });
  test("oversized image wire input is refused locally without breaking the child or stranding the turn", async () => {
    const { client, requests } = await peerClient(); const session = await client.newSession();
    // Header-valid, not a full codec-valid image. This isolates the wire bound.
    const bytes = Buffer.alloc(200_000); Buffer.from(IMAGE_PNG_BASE64, "base64").copy(bytes);
    await expect(session.prompt("Wire bound", { images: [{ filename: "large.png", mediaType: "image/png", bytes }] }).result)
      .rejects.toThrow(/ACP ingress frame limit/);
    expect(requests().some(row => row.method === "session/prompt")).toBe(false);
    expect(client.processClosed).toBe(false); await session.prompt("Still correlated").result;
  });
  test("the public cancellation path settles an image turn and refuses concurrent work", async () => {
    const { client, requests } = await peerClient("cancel"); const session = await client.newSession();
    const turn = session.prompt("Cancelable", { images: [imageInput()] });
    expect(() => session.prompt("Concurrent", { images: [imageInput()] })).toThrow(/already active/);
    const iterator = turn[Symbol.asyncIterator](); await iterator.next(); turn.cancel();
    expect((await turn.result).stopReason).toBe("cancelled"); await iterator.return?.();
    expect(requests().filter(row => row.method === "session/cancel")).toHaveLength(1);
    await client.close(); expect(client.processClosed).toBe(true);
  });
  test("release/load exposes image history only as history, never as verified new output", async () => {
    const { client } = await peerClient(); const first = await client.newSession();
    await first.prompt("Look", { images: [imageInput()] }).result; await first.release();
    const loaded = await client.resumeSession(first.sessionId);
    expect(loaded.history).toHaveLength(1);
    expect(loaded.history[0]!.update.content).toEqual({ type: "image", mimeType: "image/png", data: IMAGE_PNG_BASE64 });
    const turn = await loaded.prompt("Next text").result;
    expect(turn.updates).toEqual([]); expect(turn.verification).toBe("not-verified");
  });
  test.each(["bad-base64", "mime", "uri-only", "assistant-image", "oversize-history"])("hostile %s image replay fails closed and reaps the owned peer", async mode => {
    const { client } = await peerClient(mode);
    await expect(client.resumeSession("image-wire-session")).rejects.toBeInstanceOf(AMCNativeProtocolError);
    await client.close(); expect(client.processClosed).toBe(true);
  });
  test("a late image cannot extend the load-response window, regardless of pipe chunking", async () => {
    const { client } = await peerClient("late-image");
    try {
      const loaded = await client.resumeSession("image-wire-session");
      expect(loaded.history).toEqual([]); // A reply may arrive before the hostile next chunk.
    } catch (error) { expect(error).toBeInstanceOf(AMCNativeProtocolError); }
    // Wait for the peer fault, not our own close, so graceful teardown cannot
    // masquerade as detection of an out-of-window image.
    const deadline = Date.now() + 10_000;
    while (!client.processClosed && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    expect(client.processClosed).toBe(true);
    await expect(client.newSession()).rejects.toThrow(/invalid or uncorrelated/);
  });
  test("unsolicited user image during a prompt is not accepted as output", async () => {
    const { client } = await peerClient("unsolicited-image"); const session = await client.newSession();
    await expect(session.prompt("Look", { images: [imageInput()] }).result).rejects.toThrow(/invalid or uncorrelated/);
    await client.close(); expect(client.processClosed).toBe(true);
  });
  test.each(["sqlite", "jsonl"].flatMap(backend => (["anthropic", "openai-responses", "openai"] as const).map(provider => ({ backend, provider }))))("$provider/$backend real subprocess image input, signed release/load and independent cold bytes", async ({ backend, provider }) => {
    const root = workspace(); writeFileSync(join(root, ".native-image-fixture"), IMAGE_FIXTURE_MARKER);
    const first = await nativeClient(root, backend, provider); const session = await first.newSession();
    const input = imageInput(); const turn = session.prompt("Describe the attached bytes", { images: [input] }); input.bytes.fill(0);
    const result = await turn.result; expect(result.text).toBe("Native image fixture response"); expect(result.verification).toBe("not-verified");
    const id = session.sessionId; await session.release(); await first.close(); expect(first.processClosed).toBe(true);
    const second = await nativeClient(root, backend, provider); const loaded = await second.resumeSession(id);
    const images = loaded.history.filter(row => (row.update.content as { type?: string } | undefined)?.type === "image");
    expect(images).toHaveLength(1); expect(images[0]!.update.content).toEqual({ type: "image", mimeType: "image/png", data: IMAGE_PNG_BASE64 });
    expect((await loaded.prompt("Use the original image").result).text).toBe("Native image fixture response");
    await second.close(); expect(second.processClosed).toBe(true);
    const sent = readFileSync(join(root, ".native-image-http.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line) as { body: string });
    expect(sent).toHaveLength(2);
    for (const request of sent) {
      const bytes = Buffer.from(request.body, "base64"); expect(bytes.toString("utf8")).toContain(IMAGE_PNG_BASE64);
      if (provider === "openai-responses") {
        const body = JSON.parse(bytes.toString("utf8"));
        expect(body.input.flatMap((item: { content?: unknown }) => Array.isArray(item.content) ? item.content : [])).toContainEqual({
          type: "input_image", image_url: `data:image/png;base64,${IMAGE_PNG_BASE64}`, detail: "auto"
        });
        expect(body).toMatchObject({ store: false, stream: true, max_output_tokens: 64 });
        expect(body.messages).toBeUndefined();
      } else if (provider === "openai") {
        const body = JSON.parse(bytes.toString("utf8"));
        expect(body.messages.flatMap((item: { content?: unknown }) => Array.isArray(item.content) ? item.content : [])).toContainEqual({
          type: "image_url", image_url: { url: `data:image/png;base64,${IMAGE_PNG_BASE64}`, detail: "auto" }
        });
        expect(body).toMatchObject({ stream: true, stream_options: { include_usage: true }, max_tokens: 64 });
        expect(body.input).toBeUndefined();
      }
    }
    // Only workspace/session identity reaches the fresh default-registry reader.
    const child = spawnSync(process.execPath, ["--import", import.meta.resolve("tsx"), coldFixture, root, id],
      { encoding: "utf8", timeout: 30_000, maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, AMC_SESSION_STORE: backend, AMC_VAULT_PASSPHRASE: "native-image-sdk-fixture-passphrase" } });
    expect(child.error).toBeUndefined(); expect(child.status, child.stderr).toBe(0);
    const derived = JSON.parse(child.stdout) as { status: string; bytes: string }[];
    expect(derived.map(row => row.status)).toEqual(["reconstructed", "reconstructed"]);
    expect(derived.map(row => row.bytes)).toEqual(sent.map(row => row.body));
  }, 120_000);
});
