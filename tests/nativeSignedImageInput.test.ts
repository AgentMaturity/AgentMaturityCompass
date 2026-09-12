/** AUTHORED, UNEXECUTED / UNQUALIFIED. Scripted HTTP, not a live provider or remote model probe. */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import YAML from "yaml";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { LocalCredentialsService } from "../src/credentials/localCredentialsService.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime, type LlmCallSpec } from "../src/llm/adapter/llmRuntime.js";
import { anthropicAdapter } from "../src/llm/providers/anthropicAdapter.js";
import { deepseekAdapter } from "../src/llm/providers/deepseekAdapter.js";
import { openaiAdapter } from "../src/llm/providers/openaiAdapter.js";
import type { LlmAdapter } from "../src/llm/adapter/adapterTypes.js";
import type { HttpRequest, HttpResponse } from "../src/llm/adapter/transport.js";
import { anthropicMessagesEncoder, anthropicMessagesEncoderV2 } from "../src/llm/request/anthropicMessagesEncoder.js";
import { anthropicMessagesEncoderV3 } from "../src/llm/request/anthropicMessagesEncoderV3.js";
import { anthropicMessagesEncoderV4 } from "../src/llm/request/anthropicMessagesEncoderV4.js";
import { deriveSessionRequests } from "../src/llm/request/deriveRequest.js";
import { RequestEncoderRegistry } from "../src/llm/request/requestEncoder.js";
import { BUILT_IN_REQUEST_ENCODERS } from "../src/llm/request/builtInEncoders.js";
import { providerToolWireName, usesProviderToolNames } from "../src/llm/request/providerToolNames.js";
import type { EncodableRequest } from "../src/llm/request/requestSpec.js";
import { ingestAttachment } from "../src/attachments/attachmentIngest.js";
import { assertNativeImageBytes, materializeNativeImages, MAX_NATIVE_IMAGE_BYTES, snapshotNativeImages } from "../src/attachments/nativeImageInput.js";
import { budgetsPath, loadBudgetsConfig, signBudgetsConfig } from "../src/budgets/budgets.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { sha256Hex } from "../src/utils/hash.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1sAAAAASUVORK5CYII=", "base64");
const dirs: string[] = [], writers = new Set<SessionService>(), credentials: LocalCredentialsService[] = [];
afterEach(async () => {
  for (const writer of writers) writer.disposeWithoutClosing();
  writers.clear();
  for (const store of credentials.splice(0)) await store.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function response(tool = false): HttpResponse {
  const frames: Record<string, unknown>[] = [
    { type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } },
    { type: "content_block_start", index: 0, content_block: tool
      ? { type: "tool_use", id: "image-read", name: providerToolWireName("fs.read"), input: {} }
      : { type: "text", text: "image fixture response" } }
  ];
  if (tool) frames.push({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"path":"fixture.txt"}' } });
  frames.push({ type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: tool ? "tool_use" : "end_turn" }, usage: { output_tokens: 3 } },
    { type: "message_stop" });
  const bytes = Buffer.from(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join(""));
  return { status: 200, headers: { "content-type": "text/event-stream" }, body: (async function* () {
    for (let i = 0; i < bytes.length; i += 7) yield bytes.subarray(i, i + 7);
  })() };
}
function harness(adapter: LlmAdapter = anthropicAdapter, responses: HttpResponse[] = [response()]) {
  const workspace = mkdtempSync(join(tmpdir(), "amc-signed-image-")); dirs.push(workspace);
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  const session = new SessionService(workspace); writers.add(session);
  session.open({ agentId: "default", harnessVersion: "image-fixture", compositionDigest: "image-fixture", policyDigest: "image-fixture" });
  const system = session.recordSystemPrompt("Describe the actual attached bytes. No external model support is asserted.");
  session.startTurn({ trigger: "user" }); session.startStep(); session.recordUserMessage("Describe this image.");
  const input = Buffer.from(PNG);
  expect(ingestAttachment({ session, filename: "pixel.png", content: input })).toMatchObject({ ok: true, sha256: sha256Hex(PNG), mimeType: "image/png" });
  input.fill(0); // The caller's live Buffer is no longer a possible reconstruction source.
  const store = new LocalCredentialsService({ env: {}, homeDir: join(workspace, "empty-credentials"), projectDir: null, includeDotenv: false, watch: false });
  credentials.push(store);
  const registry = new AdapterRegistry();
  registry.register({ providerId: "image-fixture", adapter, baseUrl: "https://image.invalid", credentialRef: null, models: ["fixture-model"] });
  const sent: HttpRequest[] = [];
  const runtime = new LlmRuntime({ session, credentials: store, registry, transport: async request => {
    sent.push({ ...request, body: Buffer.from(request.body), headers: { ...request.headers } });
    const next = responses.shift(); if (!next) throw new Error("Unexpected image fixture dispatch"); return next;
  } });
  const spec: LlmCallSpec = { providerId: "image-fixture", model: "fixture-model", params: { stream: true, max_tokens: 64 },
    systemPromptEventId: system.eventId, tools: null };
  const close = (reason: "complete" | "error" = "complete") => {
    session.endStep({ stopReason: reason, usage: null }); session.endTurn({ reason }); session.sealTurn();
    session.close({ reason: "fixture-completed" }); writers.delete(session);
  };
  return { workspace, session, runtime, spec, sent, close };
}
async function drain(stream: AsyncIterable<unknown>) { for await (const _ of stream) { /* actual runtime consumes fixture SSE */ } }
function cold(h: ReturnType<typeof harness>) {
  // The cold process decrypts blob-backed content, and read-only vault access has no test fallback: pass the passphrase explicitly.
  const result = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(new URL("./fixtures/nativeSignedImageCold.ts", import.meta.url)), h.workspace, h.session.sessionId],
    { encoding: "utf8", timeout: 30_000, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, AMC_VAULT_PASSPHRASE: process.env.AMC_VAULT_PASSPHRASE || "amc-test-passphrase" } });
  expect(result.error).toBeUndefined(); expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as { status: string; bytes: string | null; recordedDigest: string; derivedDigest: string | null; detail: string | null }[];
}
function corruptRow(h: ReturnType<typeof harness>, edit: (db: Database.Database, id: string, payloadPath: string | null) => void) {
  const db = new Database(join(h.workspace, ".amc", "evidence.sqlite"));
  try {
    // An attacker with file access is not stopped by SQL triggers; the cold reader must detect the damage on its own.
    for (const trigger of ["protect_evidence_immutable", "no_delete_evidence", "no_update_evidence"]) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
    const row = db.prepare("SELECT id, payload_path FROM evidence_events WHERE event_type = 'user/attachment'").get() as { id: string; payload_path: string | null };
    edit(db, row.id, row.payload_path);
  } finally { db.close(); }
}
const encodable = (): EncodableRequest => ({ model: "fixture-model", params: { max_tokens: 64, stream: true }, system: "Fixture",
  tools: [{ name: "fs.read", description: "read", parameters: { type: "object" } }],
  messages: [{ role: "user", parts: [{ kind: "text", text: "Look" }, { kind: "image", sha256: sha256Hex(PNG), bytes: PNG, mediaType: "image/png" }] }] });

describe("native signed original image bytes (authored, not executed)", () => {
  test("actual runtime transport receives original image bytes; a fresh process reconstructs identical request bytes after writer closure", async () => {
    const h = harness(); const call = h.runtime.prepare(h.spec); await drain(call.stream());
    const attachment = h.session.readEvents().find(row => row.event_type === "user/attachment")!;
    expect(JSON.parse(attachment.meta_json)).toMatchObject({ mimeType: "image/png", bytes: PNG.length });
    expect(readEventPayload(h.workspace, attachment)).toEqual({ status: "ok", bytes: PNG });
    expect(h.sent).toHaveLength(1);
    const body = JSON.parse(h.sent[0]!.body.toString("utf8"));
    const image = body.messages.flatMap((m: { content: { type: string }[] }) => m.content).find((p: { type: string }) => p.type === "image");
    expect(image.source).toEqual({ type: "base64", media_type: "image/png", data: PNG.toString("base64") });
    expect(Buffer.from(image.source.data, "base64")).toEqual(PNG);
    expect(h.sent[0]!.url).toBe("https://image.invalid/v1/messages");
    expect(h.sent[0]!.headers["anthropic-version"]).toBe("2023-06-01");
    expect(h.sent[0]!.headers["x-api-key"]).toBeUndefined();
    h.close();
    const rows = cold(h); expect(rows).toHaveLength(1);
    expect(rows[0], rows[0]!.detail ?? "no detail").toMatchObject({ status: "reconstructed", bytes: h.sent[0]!.body.toString("base64"), recordedDigest: sha256Hex(h.sent[0]!.body), derivedDigest: call.requestDigest });
    const verified = verifyLedgerIntegrity(h.workspace);
    expect(verified.chain, verified.chain.errors.join("\n")).toEqual({ ok: true, errors: [] });
    expect(verified.trustRoot.anchored).toBe(false);
  });
  test("image + provider-safe offered tool + keyed failed result remain reconstructable", async () => {
    const h = harness(anthropicAdapter, [response(true), response()]);
    const spec = { ...h.spec, tools: [{ name: "fs.read", description: "read", parameters: { type: "object" } }] };
    const first = h.runtime.prepare(spec); await drain(first.stream());
    const tool = h.session.readEvents().find(row => row.event_type === "tool/call")!;
    expect(JSON.parse(tool.meta_json)).toMatchObject({ toolName: "fs.read", providerName: { encoderVersion: 4, wireName: providerToolWireName("fs.read") } });
    h.session.recordToolResult({ toolCallId: "image-read", outcome: "ERROR", exitCode: 1, timedOut: false, denied: false, content: "Read refused by fixture" });
    h.session.endStep({ stopReason: "tool_calls", usage: null }); h.session.startStep();
    const second = h.runtime.prepare(spec); await drain(second.stream());
    expect(h.sent[1]!.body.toString("utf8")).toContain('"is_error":true');
    h.close(); expect(cold(h).map(row => row.bytes)).toEqual(h.sent.map(row => row.body.toString("base64")));
  });
  test.each(["missing", "pruned", "tampered", "mime"] as const)("cold reconstruction distinguishes %s evidence", async mode => {
    const h = harness(); await drain(h.runtime.prepare(h.spec).stream()); h.close();
    corruptRow(h, (db, id, payloadPath) => {
      if (mode === "missing") db.prepare("UPDATE evidence_events SET payload_inline = NULL, payload_path = NULL, canonical_payload_path = NULL WHERE id = ?").run(id);
      // What retention does: mark the row pruned and unlink the blob.
      if (mode === "pruned") { db.prepare("UPDATE evidence_events SET payload_pruned = 1, payload_pruned_ts = ? WHERE id = ?").run(Date.now(), id); if (payloadPath) rmSync(join(h.workspace, payloadPath), { force: true }); }
      if (mode === "tampered") db.prepare("UPDATE evidence_events SET payload_inline = ? WHERE id = ?").run("altered readable image bytes", id);
      if (mode === "mime") {
        const row = db.prepare("SELECT meta_json FROM evidence_events WHERE id = ?").get(id) as { meta_json: string };
        db.prepare("UPDATE evidence_events SET meta_json = ? WHERE id = ?").run(JSON.stringify({ ...JSON.parse(row.meta_json), mimeType: "image/jpeg" }), id);
      }
    });
    const expected = mode === "missing" ? "payload-missing" : mode === "pruned" ? "payload-pruned" : "evidence-inconsistent";
    expect(cold(h)[0]).toMatchObject({ status: expected, bytes: null });
    if (mode === "mime") expect(verifyLedgerIntegrity(h.workspace).chain.ok).toBe(false);
  });
  test.each([deepseekAdapter, { ...openaiAdapter, encoderVersion: 3 }])("unsupported or historical native provider refuses signed images before a header or HTTP", adapter => {
    const h = harness(adapter);
    const params = adapter === deepseekAdapter ? { max_tokens: 64, thinking: { type: "disabled" } } : { max_tokens: 64 };
    expect(() => h.runtime.prepare({ ...h.spec, params })).toThrow(/image-input/);
    expect(h.sent).toEqual([]); expect(h.session.readEvents().some(row => row.event_type === "request/header")).toBe(false); h.close("error");
  });
  test("signed request budgets still refuse a subsequent image request before HTTP", async () => {
    const h = harness(); const config = loadBudgetsConfig(h.workspace);
    config.budgets.perAgent.default!.daily.maxLlmRequests = 1;
    writeFileSync(budgetsPath(h.workspace), YAML.stringify(config)); signBudgetsConfig(h.workspace);
    await drain(h.runtime.prepare(h.spec).stream());
    await expect(drain(h.runtime.prepare(h.spec).stream())).rejects.toThrow(/request budget exhausted/);
    expect(h.sent).toHaveLength(1); h.close("error");
  });
  test("historical encoders stay registered, refuse images, and v4 keeps v3 text/tool/cache bytes", () => {
    const registry = new RequestEncoderRegistry(BUILT_IN_REQUEST_ENCODERS);
    for (const encoder of [anthropicMessagesEncoder, anthropicMessagesEncoderV2, anthropicMessagesEncoderV3]) {
      expect(registry.get(encoder.id, encoder.version)).toBe(encoder); expect(() => encoder.encode(encodable())).toThrow(/image/);
    }
    const input = encodable(); const text = { ...input, messages: input.messages.map(message => ({ ...message, parts: message.parts.filter(part => part.kind !== "image") })) };
    expect(anthropicMessagesEncoderV4.encode(text)).toEqual(anthropicMessagesEncoderV3.encode(text));
    expect(usesProviderToolNames("anthropic-messages", 4)).toBe(true);
  });
  test("hostile image input never becomes a URL, inferred MIME, permissive base64 or oversized payload", () => {
    expect(() => assertNativeImageBytes(PNG, "image/jpeg")).toThrow();
    expect(() => assertNativeImageBytes(Buffer.from("https://example.invalid/a.png"), "image/png")).toThrow();
    expect(() => assertNativeImageBytes(Buffer.alloc(MAX_NATIVE_IMAGE_BYTES + 1), "image/png")).toThrow();
    expect(() => assertNativeImageBytes(Buffer.from("not an image"), null)).toThrow();
    expect(() => snapshotNativeImages([{ filename: "payload.exe.png", bytes: PNG, mediaType: "image/png" }])).toThrow();
    expect(() => materializeNativeImages([{ filename: "pixel.png", mediaType: "image/png", data: PNG.toString("base64") + "\n" }])).toThrow();
    const input = encodable();
    expect(() => anthropicMessagesEncoderV4.encode({ ...input, messages: [{ role: "user", parts: [{ kind: "image", sha256: sha256Hex(PNG) }] }] })).toThrow(/bytes/);
    expect(() => anthropicMessagesEncoderV4.encode({ ...input, messages: [{ role: "assistant", parts: input.messages[0]!.parts }] })).toThrow(/user/);
    expect(() => anthropicMessagesEncoderV4.encode({ ...input, params: { messages: [] } })).toThrow(/collides/);
  });
});
