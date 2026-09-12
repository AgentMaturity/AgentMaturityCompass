/** AUTHORED UNEXECUTED. Real public ACP/native driver/HTTP/cold and hostile evidence. */
import { outgrowSession, OUTGROW_BYTES, OUTGROW_ROWS } from "./helpers/outgrowSession.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import YAML from "yaml";
import { afterEach, describe, expect, test } from "vitest";
import { checkAcpDefinition } from "../src/acp/acpSchema.js";
import { flattenPrompt } from "../src/acp/acpPromptInput.js";
import { decodeNativeOrderedInput, NATIVE_ORDERED_INPUT_FORMAT } from "../src/attachments/nativeOrderedInput.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { budgetsPath, loadBudgetsConfig, signBudgetsConfig } from "../src/budgets/budgets.js";
import { sha256Hex } from "../src/utils/hash.js";
import { imageInput, IMAGE_PNG_BASE64 } from "./fixtures/nativeAcpImageRuntime.js";
import { orderedCleanup, orderedWorkspace, orderedHarness, openedOrdered, orderedBlocks,
  orderedRequest, expectedImageWire, firstUserWire, orderedCold, PROVIDERS } from "./fixtures/nativeOrderedImageHarness.js";

afterEach(orderedCleanup);
describe("ordered image input through public ACP (unexecuted)", () => {
  test.each(["sqlite", "jsonl"].flatMap(backend => PROVIDERS.map(provider => ({ backend, provider }))))("$provider/$backend exact public sequence, original signed rows, release/load and independent cold bytes", async ({ backend, provider }) => {
    const { h, root, sessionId, initialized } = await openedOrdered(orderedWorkspace(backend), provider);
    expect(initialized.result).toMatchObject({ agentCapabilities: { _meta: { "dev.agentmaturity.amc": { orderedImageInput: NATIVE_ORDERED_INPUT_FORMAT } } } });
    expect(await checkAcpDefinition("InitializeResponse", initialized.result)).toEqual({ ok: true });
    const request = orderedRequest(sessionId); expect(await checkAcpDefinition("PromptRequest", request)).toEqual({ ok: true });
    const operation = h.begin("session/prompt", request); operation.bytes.fill(0);
    expect((await operation.result).error).toBeUndefined(); expect(h.sent).toHaveLength(1);
    expect(firstUserWire(provider, h.sent[0]!.body)).toEqual(expectedImageWire(provider));
    const rows = h.sessions.get(sessionId)!.readEvents();
    const input = rows.find(row => row.event_type === "loop/inbox" && JSON.parse(row.meta_json).payloadFormat === NATIVE_ORDERED_INPUT_FORMAT)!;
    const payload = readEventPayload(root, input); if (payload.status !== "ok") throw new Error(`Input ${payload.status}`);
    const parts = decodeNativeOrderedInput(payload.bytes);
    expect(parts.map(part => part.type)).toEqual(orderedBlocks().map(part => part.type));
    expect(parts.filter(part => part.type === "text").map(part => part.text)).toEqual(["  before\n", "", "after first", "after second  "]);
    const projected = rows.filter(row => ["user/message", "user/attachment"].includes(row.event_type));
    expect(projected.map(row => JSON.parse(row.meta_json).sourceContentIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const row of projected) {
      expect(JSON.parse(row.meta_json)).toMatchObject({ sourceInputEventId: input.id, sourceInputFormat: NATIVE_ORDERED_INPUT_FORMAT });
      const bytes = readEventPayload(root, row); if (bytes.status !== "ok") throw new Error(`Part ${bytes.status}`);
      expect(row.payload_sha256).toBe(sha256Hex(bytes.bytes));
    }
    expect(h.frames.filter(frame => frame.params?.update.sessionUpdate === "user_message_chunk")).toEqual([]);
    expect((await h.call("_amc/session/release", { sessionId })).error).toBeUndefined(); await h.close();
    const next = orderedHarness(root, provider); await next.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const loading = next.begin("session/load", { sessionId, cwd: root, mcpServers: [] });
    expect((await loading.result).error).toBeUndefined();
    const userHistory = next.frames.filter(frame => frame.params?.update.sessionUpdate === "user_message_chunk");
    expect(userHistory.map(frame => frame.params!.update.content)).toEqual(orderedBlocks());
    expect(userHistory.every(frame => next.frames.indexOf(frame) < next.frames.findIndex(item => item.id === loading.id))).toBe(true);
    expect((await next.call("session/prompt", { sessionId, prompt: [{ type: "text", text: "Use the originals again" }] })).error).toBeUndefined();
    expect(firstUserWire(provider, next.sent[0]!.body)).toEqual(expectedImageWire(provider)); await next.close();
    expect(orderedCold(root, sessionId).map(row => row.bytes)).toEqual([...h.sent, ...next.sent].map(request => request.body.toString("base64")));
  }, 90_000);
  test.each(PROVIDERS)("%s standard unextended text-after-image is ordered, while legacy flatten still refuses", async provider => {
    const { h, sessionId } = await openedOrdered(orderedWorkspace(), provider);
    const blocks: ({ type: string } & Record<string, string>)[] = [{ type: "image", mimeType: "image/png", data: IMAGE_PNG_BASE64 }, { type: "text", text: "  after\n" }];
    expect(() => flattenPrompt(blocks, true)).toThrow(/without reordering/);
    expect((await h.call("session/prompt", { sessionId, prompt: blocks })).error).toBeUndefined();
    expect(firstUserWire(provider, h.sent[0]!.body)).toEqual(expectedImageWire(provider, blocks));
  });
  test("resource references remain explicitly unfetched text at their original position", async () => {
    const { h, sessionId } = await openedOrdered();
    const prompt = [{ type: "image", mimeType: "image/png", data: IMAGE_PNG_BASE64 },
      { type: "resource_link", name: "unfetched", uri: "https://never-fetch.invalid/reference" }, { type: "text", text: "suffix" }];
    expect((await h.call("session/prompt", orderedRequest(sessionId, prompt))).error).toBeUndefined();
    expect(firstUserWire("openai", h.sent[0]!.body)).toEqual(expectedImageWire("openai", [{ type: "image", mimeType: "image/png", data: IMAGE_PNG_BASE64 },
      { type: "text", text: "[linked resource: https://never-fetch.invalid/reference]" }, { type: "text", text: "suffix" }]));
  });
  test.each(["deepseek", "stub"])("%s cannot inherit ordered-image capability by protocol analogy", async provider => {
    const { h, sessionId, initialized } = await openedOrdered(orderedWorkspace(), provider);
    expect(JSON.stringify(initialized.result)).not.toContain(NATIVE_ORDERED_INPUT_FORMAT);
    const before = h.sessions.get(sessionId)!.readEvents();
    expect((await h.call("session/prompt", orderedRequest(sessionId))).error?.code).toBe(-32602);
    expect(h.sent).toEqual([]); expect(h.sessions.get(sessionId)!.readEvents()).toEqual(before);
  });
  test("missing factory method and unknown requested version refuse without downgrade", async () => {
    const { h, sessionId } = await openedOrdered(); const before = h.sessions.get(sessionId)!.readEvents();
    const request = orderedRequest(sessionId);
    expect((await h.call("session/prompt", { ...request, _meta: { "dev.agentmaturity.amc": { inputFormat: "amc-image-input@999" } } })).error?.code).toBe(-32602);
    delete h.sessions.get(sessionId)!.promptParts;
    expect((await h.call("session/prompt", request)).error?.code).toBe(-32602);
    expect(h.sessions.get(sessionId)!.readEvents()).toEqual(before); expect(h.sent).toEqual([]);
  });
  test.each(["reverse", "drop", "downgrade", "duplicate", "rewrite"])("actual preStep %s attack cannot project any prefix or dispatch", async mode => {
    const { h, sessionId } = await openedOrdered(orderedWorkspace(), "openai", { hooks: {
      preStep: async input => {
        const message = input.messages[0]!;
        if (mode === "drop") return { kind: "enter", messages: [] };
        if (mode === "duplicate") return { kind: "enter", messages: [message, message] };
        if (mode === "downgrade") return { kind: "enter", messages: [{ messageId: message.messageId, origin: message.origin, text: "flattened" }] };
        return { kind: "enter", messages: [{ ...message, parts: mode === "reverse" ? [...message.parts!].reverse()
          : [{ type: "text", text: "rewritten prefix" }, ...message.parts!.slice(1)] }] };
      }, turnStopping: async () => {}, notify: () => {}
    } });
    await h.call("session/prompt", orderedRequest(sessionId));
    const rows = h.sessions.get(sessionId)!.readEvents();
    expect(rows.some(row => row.event_type === "loop/inbox")).toBe(true);
    expect(rows.filter(row => ["user/message", "user/attachment", "request/header"].includes(row.event_type))).toEqual([]);
    expect(h.sent).toEqual([]); expect(rows.some(row => row.event_type === "turn/end" && JSON.parse(row.meta_json).reason === "error")).toBe(true);
  });
  test("explicit veto and cancellation retain their signed identities without exposing the sequence", async () => {
    const veto = await openedOrdered(orderedWorkspace(), "openai", { hooks: {
      preStep: async () => ({ kind: "reject", by: "ordered-policy" }), turnStopping: async () => {}, notify: () => {}
    } });
    await veto.h.call("session/prompt", orderedRequest(veto.sessionId));
    expect(veto.h.sessions.get(veto.sessionId)!.readEvents().some(row => row.event_type === "loop/veto" && JSON.parse(row.meta_json).by === "ordered-policy")).toBe(true);
    expect(veto.h.sent).toEqual([]);
    let enter!: () => void; const entered = new Promise<void>(resolve => { enter = resolve; });
    const cancelled = await openedOrdered(orderedWorkspace(), "openai", { hooks: {
      preStep: async (input, next) => { enter(); if (!input.signal.aborted) await new Promise<void>(resolve => input.signal.addEventListener("abort", () => resolve(), { once: true })); return next(); },
      turnStopping: async () => {}, notify: () => {}
    } });
    const operation = cancelled.h.begin("session/prompt", orderedRequest(cancelled.sessionId)); await entered; cancelled.h.cancel(cancelled.sessionId);
    expect((await operation.result).result).toMatchObject({ stopReason: "cancelled" });
    const rows = cancelled.h.sessions.get(cancelled.sessionId)!.readEvents();
    expect(rows.some(row => row.event_type === "loop/cancel")).toBe(true);
    expect(rows.some(row => ["user/message", "user/attachment"].includes(row.event_type))).toBe(false); expect(cancelled.h.sent).toEqual([]);
  });
  test("signed budgets and changed continuation policies still govern ordered input", async () => {
    const root = orderedWorkspace(), config = loadBudgetsConfig(root); config.budgets.perAgent.default!.daily.maxLlmRequests = 1;
    writeFileSync(budgetsPath(root), YAML.stringify(config)); signBudgetsConfig(root);
    const { h, sessionId } = await openedOrdered(root);
    await h.call("session/prompt", orderedRequest(sessionId)); await h.call("session/prompt", orderedRequest(sessionId)); expect(h.sent).toHaveLength(1);
    await h.call("_amc/session/release", { sessionId }); await h.close();
    const next = orderedHarness(root, "openai", { policyDigest: sha256Hex("different-policy") }); await next.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    expect((await next.call("session/load", { sessionId, cwd: root, mcpServers: [] })).error).toBeDefined();
    expect(next.frames.filter(frame => frame.method === "session/update")).toEqual([]); expect(next.sent).toEqual([]);
  });
  test.each(["missing", "pruned", "tampered", "mime", "source-index"])("%s original image evidence remains distinct and cannot emit partial ordered history", async mode => {
    const { h, root, sessionId } = await openedOrdered(); await h.call("session/prompt", orderedRequest(sessionId));
    await h.call("_amc/session/release", { sessionId }); await h.close();
    // ONLY this newly minted disposable fixture is intentionally mutated.
    const db = new Database(join(root, ".amc", "evidence.sqlite"));
    try {
      for (const trigger of ["protect_evidence_immutable", "no_delete_evidence", "no_update_evidence"]) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
      const row = db.prepare("SELECT id, meta_json FROM evidence_events WHERE session_id = ? AND event_type = 'user/attachment' LIMIT 1").get(sessionId) as { id: string; meta_json: string };
      if (mode === "missing") db.prepare("UPDATE evidence_events SET payload_inline = NULL, payload_path = NULL, canonical_payload_path = NULL WHERE id = ?").run(row.id);
      if (mode === "pruned") db.prepare("UPDATE evidence_events SET payload_pruned = 1 WHERE id = ?").run(row.id);
      if (mode === "tampered") db.prepare("UPDATE evidence_events SET payload_inline = ? WHERE id = ?").run("altered original", row.id);
      if (mode === "mime") db.prepare("UPDATE evidence_events SET meta_json = ? WHERE id = ?").run(JSON.stringify({ ...JSON.parse(row.meta_json), mimeType: "image/jpeg" }), row.id);
      if (mode === "source-index") db.prepare("UPDATE evidence_events SET meta_json = ? WHERE id = ?").run(JSON.stringify({ ...JSON.parse(row.meta_json), sourceContentIndex: 99 }), row.id);
    } finally { db.close(); }
    if (mode === "source-index") {
      // Byte derivation is deliberately not signature authentication. These same
      // request bytes can reconstruct while verified load rejects edited metadata.
      expect(orderedCold(root, sessionId)[0]).toMatchObject({ status: "reconstructed", bytes: h.sent[0]!.body.toString("base64") });
    } else expect(orderedCold(root, sessionId)[0]).toMatchObject({ status: mode === "missing" ? "payload-missing" : mode === "pruned" ? "payload-pruned" : "evidence-inconsistent", bytes: null });
    const next = orderedHarness(root); await next.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    expect((await next.call("session/load", { sessionId, cwd: root, mcpServers: [] })).error).toBeDefined();
    expect(next.frames.filter(frame => frame.method === "session/update")).toEqual([]); expect(next.sent).toEqual([]);
  }, 60_000);
  test("a legitimate local ordered session that outgrows the ACP aggregate replay bound refuses load before any partial replay", async () => {
    const { h, root, sessionId } = await openedOrdered(); const bytes = Buffer.alloc(OUTGROW_BYTES); imageInput().bytes.copy(bytes);
    expect((await h.sessions.get(sessionId)!.promptParts!([{ type: "image", image: { filename: "first.png", mediaType: "image/png", bytes } },
      { type: "text", text: "after the first image" }])).ok).toBe(true);
    await h.call("_amc/session/release", { sessionId }); await h.close();
    // Each row stays within the signed per-event cap; the aggregate is what ACP replay must refuse whole.
    expect(outgrowSession(root, sessionId, writer => {
      for (let i = 0; i < OUTGROW_ROWS; i++) writer.recordUserAttachment({ filename: `outgrow-${i}.png`, content: bytes, mimeType: "image/png", kind: "image" });
    })).toBeGreaterThan(OUTGROW_ROWS);
    const next = orderedHarness(root); await next.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    expect((await next.call("session/load", { sessionId, cwd: root, mcpServers: [] })).error).toMatchObject({ code: -32603, data: { reason: "history-output-limit" } });
    expect(next.frames.filter(frame => frame.method === "session/update")).toEqual([]);
  }, 60_000);
  test.each([
    { type: "audio", mimeType: "audio/wav", data: "AAAA" }, { type: "image", mimeType: "image/jpeg", data: IMAGE_PNG_BASE64 },
    { type: "image", mimeType: "image/png", uri: "file:///never-read.png" }, { type: "unknown", text: "not silently lost" }
  ])("unsupported ordered content refuses before inbox admission: %j", async block => {
    const { h, sessionId } = await openedOrdered(); const before = h.sessions.get(sessionId)!.readEvents();
    expect((await h.call("session/prompt", orderedRequest(sessionId, [...orderedBlocks(), block]))).error?.code).toBe(-32602);
    expect(h.sessions.get(sessionId)!.readEvents()).toEqual(before); expect(h.sent).toEqual([]);
  });
});
