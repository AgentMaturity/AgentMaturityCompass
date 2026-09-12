/** AUTHORED UNEXECUTED. Public ACP wire and real native lifecycle; not acceptance. */
import { outgrowSession, OUTGROW_BYTES, OUTGROW_ROWS } from "./helpers/outgrowSession.js";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import { startAcpStdio } from "../src/acp/acpStdioMain.js";
import { checkAcpDefinition } from "../src/acp/acpSchema.js";
import { acpSupportsImageInput } from "../src/acp/acpPromptInput.js";
import { projectSessionUpdates } from "../src/acp/acpProjection.js";
import { validateAcpCommittedTail } from "../src/acp/acpCommittedUpdates.js";
import { projectAcpAttachment } from "../src/acp/acpImageHistory.js";
import { anthropicAdapter } from "../src/llm/providers/anthropicAdapter.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { decodeNativeImageInput, NATIVE_IMAGE_INPUT_FORMAT } from "../src/attachments/nativeImageInput.js";
import { budgetsPath, loadBudgetsConfig, signBudgetsConfig } from "../src/budgets/budgets.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { EvidenceEvent } from "../src/types.js";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { createNativeAcpImageFixture, IMAGE_PNG_BASE64 } from "./fixtures/nativeAcpImageRuntime.js";

type Frame = { id?: number; result?: Record<string, unknown>; error?: { code: number; message: string; data?: unknown };
  method?: string; params?: { sessionId: string; update: { sessionUpdate: string; content?: { type: string; text?: string; data?: string; mimeType?: string } } } };
type Fixture = ReturnType<typeof createNativeAcpImageFixture>;
const roots: string[] = [], fixtures: Fixture[] = [];
afterEach(async () => {
  try { for (const fixture of fixtures.splice(0).reverse()) await fixture.close(); }
  finally { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); vi.unstubAllEnvs(); }
});
function workspace(backend = "sqlite"): string {
  vi.stubEnv("AMC_SESSION_STORE", backend); vi.stubEnv("AMC_VAULT_PASSPHRASE", "native-acp-image-fixture-passphrase");
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-acp-image-"))); roots.push(root);
  initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" }); return root;
}
function harness(root: string, options: Parameters<typeof createNativeAcpImageFixture>[2] = {}) {
  const frames: Frame[] = [];
  const waiters = new Map<number, (frame: Frame) => void>(); let nextId = 0;
  const fixture = createNativeAcpImageFixture(root, bytes => {
    for (const line of bytes.toString("utf8").trimEnd().split("\n")) {
      const frame = JSON.parse(line) as Frame; frames.push(frame);
      if (frame.id !== undefined) waiters.get(frame.id)?.(frame);
    }
  }, options); fixtures.push(fixture);
  const begin = (method: string, params: unknown) => {
    const id = ++nextId;
    const result = new Promise<Frame>((resolve, reject) => {
      const timer = setTimeout(() => { waiters.delete(id); reject(new Error(`ACP fixture did not answer ${method}`)); }, 15_000);
      waiters.set(id, frame => { clearTimeout(timer); waiters.delete(id); resolve(frame); });
    });
    const bytes = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    fixture.agent.connection.ingest(bytes);
    return { id, result, bytes };
  };
  return { ...fixture, frames, begin,
    call: (method: string, params: unknown) => begin(method, params).result,
    notify: (method: string, params: unknown) => fixture.agent.connection.ingest(Buffer.from(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n")) };
}
async function opened(root = workspace(), options: Parameters<typeof createNativeAcpImageFixture>[2] = {}) {
  const h = harness(root, options);
  const initialized = await h.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
  expect(initialized.error).toBeUndefined();
  expect(await checkAcpDefinition("InitializeResponse", initialized.result)).toEqual({ ok: true });
  const opened = await h.call("session/new", { cwd: root, mcpServers: [] });
  expect(opened.error).toBeUndefined();
  return { h, root, sessionId: opened.result!.sessionId as string };
}
const image = () => ({ type: "image", mimeType: "image/png", data: IMAGE_PNG_BASE64 });
const prompt = (sessionId: string, blocks: unknown[] = [image()]) => ({ sessionId, prompt: blocks });
function history(root: string, sessionId: string): readonly EvidenceEvent[] {
  const store = openSessionEventStore(root, undefined, { readOnly: true });
  try { return store.readSessionEvents(sessionId); } finally { store.close(); }
}
function cold(root: string, sessionId: string) {
  const child = spawnSync(process.execPath, ["--import", import.meta.resolve("tsx"),
    fileURLToPath(new URL("./fixtures/nativeSignedImageCold.ts", import.meta.url)), root, sessionId],
  { encoding: "utf8", timeout: 30_000, maxBuffer: 32 * 1024 * 1024 });
  expect(child.error).toBeUndefined(); expect(child.status, child.stderr).toBe(0);
  return JSON.parse(child.stdout) as { status: string; bytes: string | null }[];
}

describe("ACP signed images: public wire and lifecycle (not executed)", () => {
  test.each(["anthropic", "openai", "openai-responses", "deepseek", "stub"])("actual stdio composition advertises only the selected %s protocol", async providerId => {
    const root = workspace(), input = new EventEmitter(), frames: Frame[] = [];
    const handle = startAcpStdio({ workspace: root, agentId: "default", providerId,
      ...(providerId === "stub" ? {} : { model: "fixture-model" }), systemPrompt: "Fixture", stdin: input,
      credentialsMode: "operator-only", credentialsHome: join(root, "empty-home"),
      stdout: { write: bytes => { frames.push(JSON.parse(bytes.toString("utf8")) as Frame); return true; } }, stderr: { write: () => true } });
    try {
      input.emit("data", Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: 1, clientCapabilities: {} } }) + "\n"));
      await vi.waitFor(() => expect(frames).toHaveLength(1));
      expect(frames[0]!.result).toMatchObject({ agentCapabilities: { promptCapabilities: { image: providerId === "anthropic" || providerId === "openai-responses" || providerId === "openai", audio: false, embeddedContext: false } } });
      expect(await checkAcpDefinition("InitializeResponse", frames[0]!.result)).toEqual({ ok: true });
    } finally { await handle.close(); }
  });
  test.each([1, 2, 3, 4])("historical encoder version %s does not inherit v4 image capability", async encoderVersion => {
    const h = harness(workspace(), { adapter: { ...anthropicAdapter, encoderVersion } });
    const response = await h.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    expect(response.result).toMatchObject({ agentCapabilities: { promptCapabilities: { image: encoderVersion === 4 } } });
    expect(h.sent).toEqual([]);
    expect(acpSupportsImageInput()).toBe(false);
    expect(acpSupportsImageInput({ encoderId: "unknown", encoderVersion: 4, capabilities: anthropicAdapter.capabilities ?? null })).toBe(false);
  });
  test.each(["sqlite", "jsonl"])("%s: raw wire image bytes enter the durable inbox and reconstruct cold after writer close", async backend => {
    const { h, root, sessionId } = await opened(workspace(backend));
    const body = prompt(sessionId, [{ type: "text", text: "Describe" }, { type: "resource_link", name: "reference", uri: "https://never-fetch.invalid/info" }, image()]);
    expect(await checkAcpDefinition("PromptRequest", body)).toEqual({ ok: true });
    const call = h.begin("session/prompt", body); call.bytes.fill(0); // Transport must own its bytes.
    const reply = await call.result; expect(reply.error).toBeUndefined();
    expect(await checkAcpDefinition("PromptResponse", reply.result)).toEqual({ ok: true });
    expect(h.sent).toHaveLength(1);
    const encoded = JSON.parse(h.sent[0]!.body.toString("utf8"));
    expect(encoded.messages[0].content).toEqual([
      { type: "text", text: "Describe\n[linked resource: https://never-fetch.invalid/info]" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: IMAGE_PNG_BASE64 }, cache_control: { type: "ephemeral" } }
    ]);
    const rows = h.sessions.get(sessionId)!.readEvents();
    const queued = rows.find(row => row.event_type === "loop/inbox" && JSON.parse(row.meta_json).payloadFormat === NATIVE_IMAGE_INPUT_FORMAT)!;
    const payload = readEventPayload(root, queued); expect(payload.status).toBe("ok");
    if (payload.status !== "ok") throw new Error("Fixture input unavailable");
    expect(decodeNativeImageInput(payload.bytes).images[0]!.data).toBe(IMAGE_PNG_BASE64);
    expect(queued.meta_json).not.toContain(IMAGE_PNG_BASE64);
    const attachment = rows.find(row => row.event_type === "user/attachment")!;
    expect(JSON.parse(attachment.meta_json)).toMatchObject({ mimeType: "image/png", sourceInputEventId: queued.id, sourceInputIndex: 0 });
    expect(attachment.payload_sha256).toBe(sha256Hex(Buffer.from(IMAGE_PNG_BASE64, "base64")));
    expect(h.frames.filter(frame => frame.params?.update.sessionUpdate === "user_message_chunk")).toEqual([]);
    await h.close();
    expect(cold(root, sessionId)).toEqual([expect.objectContaining({ status: "reconstructed", bytes: h.sent[0]!.body.toString("base64") })]);
  }, 60_000);
  test("image-only and legacy text-only requests use the same public session", async () => {
    const { h, sessionId } = await opened();
    expect((await h.call("session/prompt", prompt(sessionId))).error).toBeUndefined();
    expect(JSON.parse(h.sent[0]!.body.toString("utf8")).messages[0].content).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/png", data: IMAGE_PNG_BASE64 }, cache_control: { type: "ephemeral" } }
    ]);
    expect((await h.call("session/prompt", prompt(sessionId, [{ type: "text", text: "Continue" }]))).error).toBeUndefined();
    expect(h.sent).toHaveLength(2); expect(h.sent[1]!.body.toString("utf8")).toContain(IMAGE_PNG_BASE64);
  });
  test("ordered distinct image formats preserve MIME/bytes and signed inbox indices", async () => {
    const { h, root, sessionId } = await opened();
    const gif = { type: "image", mimeType: "image/gif", data: "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" };
    expect((await h.call("session/prompt", prompt(sessionId, [{ type: "text", text: "Compare in order" }, image(), gif]))).error).toBeUndefined();
    const body = JSON.parse(h.sent[0]!.body.toString("utf8"));
    const sources = body.messages[0].content.filter((part: { type: string }) => part.type === "image").map((part: { source: unknown }) => part.source);
    expect(sources).toEqual([
      { type: "base64", media_type: "image/png", data: IMAGE_PNG_BASE64 },
      { type: "base64", media_type: "image/gif", data: gif.data }
    ]);
    const attachments = h.sessions.get(sessionId)!.readEvents().filter(row => row.event_type === "user/attachment");
    expect(attachments.map(row => JSON.parse(row.meta_json).sourceInputIndex)).toEqual([0, 1]);
    expect(attachments.map(row => row.payload_sha256)).toEqual([IMAGE_PNG_BASE64, gif.data].map(data => sha256Hex(Buffer.from(data, "base64"))));
    await h.close(); expect(cold(root, sessionId)[0]!.bytes).toBe(h.sent[0]!.body.toString("base64"));
  }, 60_000);
  test("an unattested legacy factory refuses text/image interleaving rather than reordering it", async () => {
    const { h, sessionId } = await opened(workspace(), { orderedImageInput: false });
    const before = h.sessions.get(sessionId)!.readEvents();
    const result = await h.call("session/prompt", prompt(sessionId, [image(), { type: "text", text: "Text after this image" }]));
    expect(result.error).toMatchObject({ code: -32602, message: expect.stringContaining("No reordering was performed") });
    expect(h.sent).toEqual([]); expect(h.sessions.get(sessionId)!.readEvents()).toEqual(before);
  });
  test.each([
    { type: "audio", mimeType: "audio/wav", data: "AAAA" },
    { type: "resource", resource: { uri: "file:///not-opened", text: "embedded" } },
    { type: "unknown", text: "do not drop" },
    { type: "image", mimeType: "image/png", uri: "file:///not-opened.png" },
    { type: "image", mimeType: "image/png", data: IMAGE_PNG_BASE64 + "\n" },
    { type: "image", mimeType: "image/jpeg", data: IMAGE_PNG_BASE64 },
    { type: "image", mimeType: "image/svg+xml", data: "PHN2Zy8+" }
  ])("refuses an unsupported or malformed block atomically: %j", async block => {
    const { h, sessionId } = await opened();
    const before = h.sessions.get(sessionId)!.readEvents();
    const reply = await h.call("session/prompt", prompt(sessionId, [{ type: "text", text: "Valid text must not hide bad content" }, block]));
    expect(reply.error?.code).toBe(-32602); expect(h.sent).toEqual([]);
    expect(h.sessions.get(sessionId)!.readEvents()).toEqual(before);
    expect((await h.call("session/prompt", prompt(sessionId, [{ type: "text", text: "Still usable" }]))).error).toBeUndefined();
  });
  test("over-count images and unsupported selected provider refuse before inbox commitment", async () => {
    const a = await opened();
    expect((await a.h.call("session/prompt", prompt(a.sessionId, Array.from({ length: 9 }, image)))).error?.code).toBe(-32602);
    expect(a.h.sent).toEqual([]);
    const b = await opened(workspace(), { provider: "deepseek" });
    const before = b.h.sessions.get(b.sessionId)!.readEvents();
    expect((await b.h.call("session/prompt", prompt(b.sessionId))).error?.message).toMatch(/unsupported.*protocol/);
    expect(b.h.sessions.get(b.sessionId)!.readEvents()).toEqual(before); expect(b.h.sent).toEqual([]);
  });
  test("real preStep veto retains signed input but no attachment or provider dispatch", async () => {
    const { h, sessionId } = await opened(workspace(), { hooks: {
      preStep: async () => ({ kind: "reject", by: "fixture-policy" }), turnStopping: async () => {}, notify: () => {}
    } });
    await h.call("session/prompt", prompt(sessionId));
    const rows = h.sessions.get(sessionId)!.readEvents();
    expect(rows.some(row => row.event_type === "loop/inbox")).toBe(true);
    expect(rows.some(row => row.event_type === "loop/veto" && JSON.parse(row.meta_json).by === "fixture-policy")).toBe(true);
    expect(rows.some(row => row.event_type === "user/attachment")).toBe(false); expect(h.sent).toEqual([]);
  });
  test("cancellation during real preStep never projects queued images", async () => {
    let entered!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const { h, sessionId } = await opened(workspace(), { hooks: {
      preStep: async (input, next) => { entered();
        if (!input.signal.aborted) await new Promise<void>(resolve => input.signal.addEventListener("abort", () => resolve(), { once: true }));
        return next(); }, turnStopping: async () => {}, notify: () => {}
    } });
    const turn = h.begin("session/prompt", prompt(sessionId)); await ready;
    h.notify("session/cancel", { sessionId });
    expect((await turn.result).result).toMatchObject({ stopReason: "cancelled" });
    const rows = h.sessions.get(sessionId)!.readEvents();
    expect(rows.some(row => row.event_type === "loop/cancel")).toBe(true);
    expect(rows.some(row => row.event_type === "user/attachment")).toBe(false); expect(h.sent).toEqual([]);
  });
  test("existing signed request budget still blocks a second image dispatch", async () => {
    const root = workspace(), config = loadBudgetsConfig(root);
    config.budgets.perAgent.default!.daily.maxLlmRequests = 1;
    writeFileSync(budgetsPath(root), YAML.stringify(config)); signBudgetsConfig(root);
    const { h, sessionId } = await opened(root);
    await h.call("session/prompt", prompt(sessionId)); await h.call("session/prompt", prompt(sessionId));
    expect(h.sent).toHaveLength(1);
    expect(h.sessions.get(sessionId)!.readEvents().some(row => row.event_type === "turn/end" && JSON.parse(row.meta_json).reason === "error")).toBe(true);
  });
  test.each(["sqlite", "jsonl"])("%s: released image history replays before load response and continues the original signed session", async backend => {
    const { h, root, sessionId } = await opened(workspace(backend));
    await h.call("session/prompt", prompt(sessionId));
    expect((await h.call("_amc/session/release", { sessionId })).error).toBeUndefined(); await h.close();
    const prefix = history(root, sessionId);
    const next = harness(root); await next.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const loading = next.begin("session/load", { sessionId, cwd: root, mcpServers: [] });
    expect((await loading.result).error).toBeUndefined();
    const replay = next.frames.filter(frame => frame.params?.update.content?.type === "image");
    expect(replay).toHaveLength(1); expect(replay[0]!.params!.update.content).toEqual(image());
    expect(next.frames.indexOf(replay[0]!)).toBeLessThan(next.frames.findIndex(frame => frame.id === loading.id));
    expect(await checkAcpDefinition("ContentBlock", replay[0]!.params!.update.content)).toEqual({ ok: true });
    expect(history(root, sessionId).slice(0, prefix.length)).toEqual(prefix);
    await next.call("session/prompt", prompt(sessionId, [{ type: "text", text: "Continue original image" }]));
    expect(next.sent[0]!.body.toString("utf8")).toContain(IMAGE_PNG_BASE64); await next.close();
    expect(cold(root, sessionId).map(row => row.bytes)).toEqual([...h.sent, ...next.sent].map(request => request.body.toString("base64")));
  }, 60_000);
  test.each(["missing", "pruned", "tampered", "mime"])("public image evidence remains explicitly %s after writer release", async mode => {
    const { h, root, sessionId } = await opened(); await h.call("session/prompt", prompt(sessionId));
    await h.call("_amc/session/release", { sessionId }); await h.close();
    // Hostile fixture ONLY: the root was freshly minted by this test. Never
    // execute these mutations against an operator workspace or retained receipt.
    const db = new Database(join(root, ".amc", "evidence.sqlite"));
    try {
      for (const trigger of ["protect_evidence_immutable", "no_delete_evidence", "no_update_evidence"]) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
      const row = db.prepare("SELECT id, meta_json FROM evidence_events WHERE session_id = ? AND event_type = 'user/attachment'").get(sessionId) as { id: string; meta_json: string };
      if (mode === "missing") db.prepare("UPDATE evidence_events SET payload_inline = NULL, payload_path = NULL, canonical_payload_path = NULL WHERE id = ?").run(row.id);
      if (mode === "pruned") db.prepare("UPDATE evidence_events SET payload_pruned = 1 WHERE id = ?").run(row.id);
      if (mode === "tampered") db.prepare("UPDATE evidence_events SET payload_inline = ? WHERE id = ?").run("changed binary bytes", row.id);
      if (mode === "mime") db.prepare("UPDATE evidence_events SET meta_json = ? WHERE id = ?").run(JSON.stringify({ ...JSON.parse(row.meta_json), mimeType: "image/jpeg" }), row.id);
    } finally { db.close(); }
    expect(cold(root, sessionId)[0]).toMatchObject({ status: mode === "missing" ? "payload-missing" : mode === "pruned" ? "payload-pruned" : "evidence-inconsistent", bytes: null });
    const next = harness(root); await next.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    expect((await next.call("session/load", { sessionId, cwd: root, mcpServers: [] })).error).toBeDefined();
    expect(next.frames.filter(frame => frame.method === "session/update")).toEqual([]); expect(next.sent).toEqual([]);
  }, 60_000);
  test("image history cannot bypass the native continuation policy binding", async () => {
    const { h, root, sessionId } = await opened(); await h.call("session/prompt", prompt(sessionId));
    await h.call("_amc/session/release", { sessionId }); await h.close();
    const prefix = history(root, sessionId);
    const next = harness(root, { policyDigest: sha256Hex("different-operator-policy") });
    await next.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const response = await next.call("session/load", { sessionId, cwd: root, mcpServers: [] });
    expect(response.error).toBeDefined(); expect(next.sent).toEqual([]);
    expect(next.frames.filter(frame => frame.method === "session/update")).toEqual([]);
    expect(history(root, sessionId)).toEqual(prefix);
  });
  test("projection checks image surface role/digest/length; authentication rejects modified metadata", async () => {
    const { h, root, sessionId } = await opened(); await h.call("session/prompt", prompt(sessionId));
    const rows = h.sessions.get(sessionId)!.readEvents(), original = rows.find(row => row.event_type === "user/attachment")!;
    for (const change of ["role", "digest", "length"]) {
      const meta = JSON.parse(original.meta_json);
      if (change === "role") meta.amcSession.surface.role = "assistant";
      if (change === "digest") meta.amcSession.surface.part.sha256 = "0".repeat(64);
      if (change === "length") meta.bytes++;
      const altered = { ...original, meta_json: JSON.stringify(meta) };
      expect(() => projectAcpAttachment(root, altered)).toThrow(/evidence-inconsistent/);
      expect(() => validateAcpCommittedTail(root, sessionId, rows.map(row => row.id === original.id ? altered : row), 0, null)).toThrow();
    }
    const unavailable = { ...original, payload_pruned: 1 };
    expect(() => projectSessionUpdates(root, [unavailable], 0, { includeUser: true })).toThrow(/payload-pruned/);
    expect(projectSessionUpdates(root, [{ ...original, writer_sig: "unsigned" }], 0, { includeUser: true })).toEqual({ updates: [], unsigned: 1 });
  });
  test("large signed local image history fails ACP load before any partial replay", async () => {
    const { h, root, sessionId } = await opened();
    // Every row stays within the signed per-event cap; a legitimate local session
    // can still outgrow the ACP aggregate replay bound, and loading it must refuse
    // the whole replay rather than truncate it.
    const bytes = Buffer.alloc(OUTGROW_BYTES); Buffer.from(IMAGE_PNG_BASE64, "base64").copy(bytes);
    const result = await h.sessions.get(sessionId)!.prompt("Local image within the signed event cap", [{ filename: "first.png", mediaType: "image/png", bytes }]);
    expect(result.ok).toBe(true);
    await h.call("_amc/session/release", { sessionId }); await h.close();
    expect(outgrowSession(root, sessionId, writer => {
      for (let i = 0; i < OUTGROW_ROWS; i++) writer.recordUserAttachment({ filename: `outgrow-${i}.png`, content: bytes, mimeType: "image/png", kind: "image" });
    })).toBeGreaterThan(OUTGROW_ROWS);
    const next = harness(root); await next.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const response = await next.call("session/load", { sessionId, cwd: root, mcpServers: [] });
    expect(response.error).toMatchObject({ code: -32603, data: { reason: "history-output-limit" } });
    expect(next.frames.filter(frame => frame.method === "session/update")).toEqual([]);
    expect(next.sent).toEqual([]);
  }, 60_000);
  test("aggregate history is bounded over real signed image rows, and text attachments retain their meaning", () => {
    const root = workspace(), writer = new SessionService(root);
    writer.open({ agentId: "default", harnessVersion: "history-bound", compositionDigest: "history-bound", policyDigest: "history-bound" });
    try {
      writer.startTurn({ trigger: "user" }); writer.startStep();
      writer.recordUserAttachment({ filename: "note.txt", content: "Original text attachment", mimeType: "text/plain", kind: "text" });
      expect(projectSessionUpdates(root, writer.readEvents(), 0, { includeUser: true }).updates).toEqual([
        { sessionUpdate: "user_message_chunk", content: { type: "text", text: "Original text attachment" } }
      ]);
      const bytes = Buffer.alloc(OUTGROW_BYTES); Buffer.from(IMAGE_PNG_BASE64, "base64").copy(bytes);
      for (let i = 0; i < OUTGROW_ROWS; i++) writer.recordUserAttachment({ filename: `history-${i}.png`, content: bytes, mimeType: "image/png", kind: "image" });
      writer.endStep({ stopReason: "complete", usage: null }); writer.endTurn({ reason: "complete" }); writer.sealTurn();
      const rows = writer.readEvents();
      expect(() => validateAcpCommittedTail(root, writer.sessionId, rows, 0, null)).not.toThrow();
      expect(() => projectSessionUpdates(root, rows, 0, { includeUser: true })).toThrow(/aggregate bound/);
    } finally { writer.disposeWithoutClosing(); }
  }, 60_000);
});
