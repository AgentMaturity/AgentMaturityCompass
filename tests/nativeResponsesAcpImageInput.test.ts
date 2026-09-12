/** AUTHORED UNEXECUTED. Actual ACP/native session/driver/Responses runtime.
 * These disposable fixtures are not public-provider or installed-client proof.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { checkAcpDefinition } from "../src/acp/acpSchema.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { decodeNativeImageInput, NATIVE_IMAGE_INPUT_FORMAT } from "../src/attachments/nativeImageInput.js";
import { budgetsPath, loadBudgetsConfig, signBudgetsConfig } from "../src/budgets/budgets.js";
import { sha256Hex } from "../src/utils/hash.js";
import { createNativeAcpImageFixture, IMAGE_PNG_BASE64 } from "./fixtures/nativeAcpImageRuntime.js";

type Frame = { id?: number; method?: string; result?: Record<string, unknown>; error?: { code: number; message: string; data?: unknown };
  params?: { sessionId: string; update: { sessionUpdate: string; content?: { type: string; data?: string; mimeType?: string; text?: string } } } };
type Fixture = ReturnType<typeof createNativeAcpImageFixture>;
const roots: string[] = [], fixtures: Fixture[] = [];
afterEach(async () => {
  try { for (const fixture of fixtures.splice(0).reverse()) await fixture.close(); }
  finally { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); vi.unstubAllEnvs(); }
});
function workspace(backend = "sqlite") {
  vi.stubEnv("AMC_SESSION_STORE", backend); vi.stubEnv("AMC_VAULT_PASSPHRASE", "responses-acp-fixture-passphrase");
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-responses-acp-"))); roots.push(root);
  initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" }); return root;
}
function harness(root: string, options: Parameters<typeof createNativeAcpImageFixture>[2] = {}) {
  const frames: Frame[] = [], waiters = new Map<number, (frame: Frame) => void>(); let serial = 0;
  const fixture = createNativeAcpImageFixture(root, bytes => {
    for (const line of bytes.toString("utf8").trimEnd().split("\n")) {
      const frame = JSON.parse(line) as Frame; frames.push(frame); if (frame.id !== undefined) waiters.get(frame.id)?.(frame);
    }
  }, { provider: "openai-responses", ...options }); fixtures.push(fixture);
  const begin = (method: string, params: unknown) => {
    const id = ++serial;
    const result = new Promise<Frame>((resolve, reject) => {
      const timer = setTimeout(() => { waiters.delete(id); reject(new Error(`No ACP fixture reply for ${method}`)); }, 15_000);
      waiters.set(id, frame => { clearTimeout(timer); waiters.delete(id); resolve(frame); });
    });
    const bytes = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); fixture.agent.connection.ingest(bytes);
    return { id, result, bytes };
  };
  return { ...fixture, frames, begin, call: (method: string, params: unknown) => begin(method, params).result,
    cancel: (sessionId: string) => fixture.agent.connection.ingest(Buffer.from(JSON.stringify({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId } }) + "\n")) };
}
async function opened(root = workspace(), options: Parameters<typeof createNativeAcpImageFixture>[2] = {}) {
  const h = harness(root, options);
  const initial = await h.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
  expect(initial.error).toBeUndefined(); expect(await checkAcpDefinition("InitializeResponse", initial.result)).toEqual({ ok: true });
  expect(initial.result).toMatchObject({ agentCapabilities: { promptCapabilities: { image: true, audio: false, embeddedContext: false } } });
  const created = await h.call("session/new", { cwd: root, mcpServers: [] }); expect(created.error).toBeUndefined();
  return { h, root, sessionId: created.result!.sessionId as string };
}
const image = () => ({ type: "image", mimeType: "image/png", data: IMAGE_PNG_BASE64 });
const prompt = (sessionId: string, blocks: unknown[] = [image()]) => ({ sessionId, prompt: blocks });
function history(root: string, sessionId: string) {
  const store = openSessionEventStore(root, undefined, { readOnly: true });
  try { return store.readSessionEvents(sessionId); } finally { store.close(); }
}
function cold(root: string, sessionId: string) {
  const result = spawnSync(process.execPath, ["--import", import.meta.resolve("tsx"),
    fileURLToPath(new URL("./fixtures/nativeSignedImageCold.ts", import.meta.url)), root, sessionId],
  { encoding: "utf8", timeout: 30_000, maxBuffer: 32 * 1024 * 1024 });
  expect(result.error).toBeUndefined(); expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as { status: string; bytes: string | null }[];
}

describe("Responses images through the real public ACP path (not executed)", () => {
  test.each(["sqlite", "jsonl"])("%s: standard image-only prompt becomes signed immutable input, then load and text continuation reconstruct cold", async backend => {
    const { h, root, sessionId } = await opened(workspace(backend));
    const request = prompt(sessionId); expect(await checkAcpDefinition("PromptRequest", request)).toEqual({ ok: true });
    const call = h.begin("session/prompt", request); call.bytes.fill(0);
    const reply = await call.result; expect(reply.error).toBeUndefined();
    expect(await checkAcpDefinition("PromptResponse", reply.result)).toEqual({ ok: true });
    expect(h.sent).toHaveLength(1);
    expect(JSON.parse(h.sent[0]!.body.toString("utf8")).input).toEqual([{ role: "user", content: [
      { type: "input_image", image_url: `data:image/png;base64,${IMAGE_PNG_BASE64}`, detail: "auto" }
    ] }]);
    const rows = h.sessions.get(sessionId)!.readEvents();
    const inbox = rows.find(row => row.event_type === "loop/inbox" && JSON.parse(row.meta_json).payloadFormat === NATIVE_IMAGE_INPUT_FORMAT)!;
    const payload = readEventPayload(root, inbox); expect(payload.status).toBe("ok");
    if (payload.status !== "ok") throw new Error("Expected original inbox bytes");
    expect(decodeNativeImageInput(payload.bytes)).toMatchObject({ text: "", images: [{ data: IMAGE_PNG_BASE64, mediaType: "image/png" }] });
    expect(inbox.meta_json).not.toContain(IMAGE_PNG_BASE64);
    const attachment = rows.find(row => row.event_type === "user/attachment")!;
    expect(JSON.parse(attachment.meta_json)).toMatchObject({ sourceInputEventId: inbox.id, sourceInputIndex: 0, mimeType: "image/png", bytes: Buffer.from(IMAGE_PNG_BASE64, "base64").length });
    expect(attachment.payload_sha256).toBe(sha256Hex(Buffer.from(IMAGE_PNG_BASE64, "base64")));
    expect((await h.call("_amc/session/release", { sessionId })).error).toBeUndefined(); await h.close();
    const prefix = history(root, sessionId);
    const next = harness(root); await next.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const load = next.begin("session/load", { sessionId, cwd: root, mcpServers: [] }); expect((await load.result).error).toBeUndefined();
    const images = next.frames.filter(frame => frame.params?.update.content?.type === "image");
    expect(images).toHaveLength(1); expect(images[0]!.params!.update.content).toEqual(image());
    expect(next.frames.indexOf(images[0]!)).toBeLessThan(next.frames.findIndex(frame => frame.id === load.id));
    expect(history(root, sessionId).slice(0, prefix.length)).toEqual(prefix);
    expect((await next.call("session/prompt", prompt(sessionId, [{ type: "text", text: "Use that original image" }]))).error).toBeUndefined();
    expect(next.sent[0]!.body.toString("utf8")).toContain(IMAGE_PNG_BASE64); await next.close();
    expect(cold(root, sessionId)).toEqual([...h.sent, ...next.sent].map(request => expect.objectContaining({ status: "reconstructed", bytes: request.body.toString("base64") })));
  }, 90_000);
  test("legacy-factory prefix/images preserve Responses content; unattested interleave refuses atomically", async () => {
    const { h, sessionId } = await opened(workspace(), { orderedImageInput: false });
    const gif = { type: "image", mimeType: "image/gif", data: "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" };
    const blocks = [{ type: "text", text: "Compare" }, { type: "resource_link", name: "reference", uri: "https://not-fetched.invalid" }, image(), gif];
    expect((await h.call("session/prompt", prompt(sessionId, blocks))).error).toBeUndefined();
    expect(JSON.parse(h.sent[0]!.body.toString("utf8")).input[0].content).toEqual([
      { type: "input_text", text: "Compare\n[linked resource: https://not-fetched.invalid]" },
      { type: "input_image", image_url: `data:image/png;base64,${IMAGE_PNG_BASE64}`, detail: "auto" },
      { type: "input_image", image_url: `data:image/gif;base64,${gif.data}`, detail: "auto" }
    ]);
    const before = h.sessions.get(sessionId)!.readEvents();
    const rejected = await h.call("session/prompt", prompt(sessionId, [image(), { type: "text", text: "Not representable here" }]));
    expect(rejected.error).toMatchObject({ code: -32602, message: expect.stringContaining("No reordering was performed") });
    expect(h.sent).toHaveLength(1); expect(h.sessions.get(sessionId)!.readEvents()).toEqual(before);
  });
  test.each([
    { type: "image", mimeType: "image/png", uri: "file:///never-opened.png" },
    { type: "image", mimeType: "image/jpeg", data: IMAGE_PNG_BASE64 },
    { type: "image", mimeType: "image/png", data: IMAGE_PNG_BASE64 + "\n" },
    { type: "audio", mimeType: "audio/wav", data: "AAAA" },
    { type: "resource", resource: { uri: "file:///never-opened", text: "unsupported embedded input" } },
    { type: "unknown", text: "do not silently drop" }
  ])("malformed/unsupported public block refuses before inbox or HTTP: %j", async block => {
    const { h, sessionId } = await opened(); const before = h.sessions.get(sessionId)!.readEvents();
    expect((await h.call("session/prompt", prompt(sessionId, [{ type: "text", text: "Valid prefix" }, block]))).error?.code).toBe(-32602);
    expect(h.sessions.get(sessionId)!.readEvents()).toEqual(before); expect(h.sent).toEqual([]);
    expect((await h.call("session/prompt", prompt(sessionId, [{ type: "text", text: "Text still works" }]))).error).toBeUndefined();
  });
  test("actual preStep veto retains signed input but projects no image and does not dispatch", async () => {
    const { h, sessionId } = await opened(workspace(), { hooks: { preStep: async () => ({ kind: "reject", by: "responses-image-policy" }), turnStopping: async () => {}, notify: () => {} } });
    await h.call("session/prompt", prompt(sessionId)); const rows = h.sessions.get(sessionId)!.readEvents();
    expect(rows.some(row => row.event_type === "loop/inbox")).toBe(true);
    expect(rows.some(row => row.event_type === "loop/veto" && JSON.parse(row.meta_json).by === "responses-image-policy")).toBe(true);
    expect(rows.some(row => row.event_type === "user/attachment")).toBe(false); expect(h.sent).toEqual([]);
  });
  test("actual public cancellation during preStep cannot expose queued images", async () => {
    let entered!: () => void; const ready = new Promise<void>(resolve => { entered = resolve; });
    const { h, sessionId } = await opened(workspace(), { hooks: { preStep: async (input, next) => {
      entered(); if (!input.signal.aborted) await new Promise<void>(resolve => input.signal.addEventListener("abort", () => resolve(), { once: true })); return next();
    }, turnStopping: async () => {}, notify: () => {} } });
    const turn = h.begin("session/prompt", prompt(sessionId)); await ready; h.cancel(sessionId);
    expect((await turn.result).result).toMatchObject({ stopReason: "cancelled" });
    const rows = h.sessions.get(sessionId)!.readEvents();
    expect(rows.some(row => row.event_type === "loop/cancel")).toBe(true);
    expect(rows.some(row => row.event_type === "user/attachment")).toBe(false); expect(h.sent).toEqual([]);
  });
  test("signed budget still refuses a second public Responses image dispatch", async () => {
    const root = workspace(), config = loadBudgetsConfig(root); config.budgets.perAgent.default!.daily.maxLlmRequests = 1;
    writeFileSync(budgetsPath(root), YAML.stringify(config)); signBudgetsConfig(root);
    const { h, sessionId } = await opened(root); await h.call("session/prompt", prompt(sessionId)); await h.call("session/prompt", prompt(sessionId));
    expect(h.sent).toHaveLength(1);
    expect(h.sessions.get(sessionId)!.readEvents().some(row => row.event_type === "turn/end" && JSON.parse(row.meta_json).reason === "error")).toBe(true);
  });
  test("a different continuation policy cannot load signed Responses image history", async () => {
    const { h, root, sessionId } = await opened(); await h.call("session/prompt", prompt(sessionId));
    await h.call("_amc/session/release", { sessionId }); await h.close(); const prefix = history(root, sessionId);
    const next = harness(root, { policyDigest: sha256Hex("different-policy") }); await next.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    expect((await next.call("session/load", { sessionId, cwd: root, mcpServers: [] })).error).toBeDefined();
    expect(next.frames.filter(frame => frame.method === "session/update")).toEqual([]); expect(next.sent).toEqual([]);
    expect(history(root, sessionId)).toEqual(prefix);
  });
  test.each(["missing", "pruned", "tampered", "mime"])("%s signed image history refuses load without partial public replay", async mode => {
    const { h, root, sessionId } = await opened(); await h.call("session/prompt", prompt(sessionId));
    await h.call("_amc/session/release", { sessionId }); await h.close();
    // Hostile evidence ONLY in the fresh disposable workspace above.
    const db = new Database(join(root, ".amc", "evidence.sqlite"));
    try {
      for (const trigger of ["protect_evidence_immutable", "no_delete_evidence", "no_update_evidence"]) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
      const row = db.prepare("SELECT id, meta_json FROM evidence_events WHERE session_id = ? AND event_type = 'user/attachment'").get(sessionId) as { id: string; meta_json: string };
      if (mode === "missing") db.prepare("UPDATE evidence_events SET payload_inline = NULL, payload_path = NULL, canonical_payload_path = NULL WHERE id = ?").run(row.id);
      if (mode === "pruned") db.prepare("UPDATE evidence_events SET payload_pruned = 1 WHERE id = ?").run(row.id);
      if (mode === "tampered") db.prepare("UPDATE evidence_events SET payload_inline = ? WHERE id = ?").run("altered bytes", row.id);
      if (mode === "mime") db.prepare("UPDATE evidence_events SET meta_json = ? WHERE id = ?").run(JSON.stringify({ ...JSON.parse(row.meta_json), mimeType: "image/jpeg" }), row.id);
    } finally { db.close(); }
    expect(cold(root, sessionId)[0]).toMatchObject({ status: mode === "missing" ? "payload-missing" : mode === "pruned" ? "payload-pruned" : "evidence-inconsistent", bytes: null });
    const next = harness(root); await next.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    expect((await next.call("session/load", { sessionId, cwd: root, mcpServers: [] })).error).toBeDefined();
    expect(next.frames.filter(frame => frame.method === "session/update")).toEqual([]); expect(next.sent).toEqual([]);
  }, 60_000);
});
