/**
 * AUTHORED IN-SESSION. A user attachment above `retention.maxPayloadBytesPerEvent` is retained through the
 * encrypted spill store behind a signed commitment row, and every reader that hands its bytes to a model or a
 * client resolves and re-verifies them. Scripted HTTP only; no live provider is probed.
 */
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import type { SessionStoreAppendInput, SessionStoreAppendResult } from "../src/persistence/sessionEventStore.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { extractEnvelope } from "../src/session/sessionTypes.js";
import { SessionPayloadCapError, SessionSpillCapError, sessionPayloadCap, sessionSpillCap } from "../src/session/sessionPayloadCap.js";
import { decodeSpilledInputDescriptor, resolveSpilledInputPayload, SPILL_COMMITMENT_EVENT_TYPE, SPILL_SUBJECT_META_KEY,
  SpilledInputRetentionError } from "../src/session/spill/spillInput.js";
import { extractSpillRef, SPILL_META_KEY } from "../src/session/spill/spillTypes.js";
import { resolveSpillPath, spillRoot } from "../src/session/spill/spillStore.js";
import { retrieveSpilledContent, verifySpilledContent } from "../src/session/spill/spillEvidence.js";
import { eraseSessionSpills, exportSessionSpills, inventorySessionSpills } from "../src/session/spill/spillLifecycle.js";
import { projectAcpAttachment } from "../src/acp/acpImageHistory.js";
import { projectSessionUpdates } from "../src/acp/acpProjection.js";
import { deriveSessionRequests } from "../src/llm/request/deriveRequest.js";
import { LocalCredentialsService } from "../src/credentials/localCredentialsService.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime, type LlmCallSpec } from "../src/llm/adapter/llmRuntime.js";
import { anthropicAdapter } from "../src/llm/providers/anthropicAdapter.js";
import type { HttpRequest, HttpResponse } from "../src/llm/adapter/transport.js";
import { lockVault } from "../src/vault/vault.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { EvidenceEvent } from "../src/types.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1sAAAAASUVORK5CYII=", "base64");
const PASSPHRASE = "disposable-attachment-spill-fixture-passphrase";
const roots: string[] = [], writers = new Set<SessionService>(), credentials: LocalCredentialsService[] = [];
afterEach(async () => {
  for (const writer of writers) writer.disposeWithoutClosing();
  writers.clear();
  for (const store of credentials.splice(0)) await store.close();
  for (const root of roots.splice(0)) { try { lockVault(root); } catch { /* no vault */ } rmSync(root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});

/** A PNG header followed by a deterministic non-repeating body: passes the media sniff, sized exactly as asked. */
function png(bytes: number): Buffer {
  const out = Buffer.alloc(bytes);
  for (let i = 0; i < bytes; i++) out[i] = (i * 7919 + (i >> 8)) & 0xff;
  PNG.copy(out);
  return out;
}
type Admission = (input: SessionStoreAppendInput, commit: () => SessionStoreAppendResult) => SessionStoreAppendResult;
function opened(options: { provision?: boolean; admission?: Admission } = {}) {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", PASSPHRASE);
  const root = mkdtempSync(join(tmpdir(), "amc-attachment-spill-")); roots.push(root);
  initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
  const inner = openSessionEventStore(root);
  const store = options.admission ? new Proxy(inner, {
    get(target, key) {
      if (key === "appendSessionEvent") return (input: SessionStoreAppendInput) => options.admission!(input, () => target.appendSessionEvent(input));
      const value: unknown = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    }
  }) : inner;
  const writer = new SessionService(root, store); writers.add(writer);
  writer.open({ agentId: "default", harnessVersion: "spill-fixture", compositionDigest: "spill-fixture", policyDigest: "spill-fixture" });
  // The ordinary system-prompt blob provisions the workspace key; spill never provisions one.
  const system = options.provision === false ? null : writer.recordSystemPrompt("Describe the attached bytes.");
  writer.startTurn({ trigger: "user" }); writer.startStep();
  if (options.provision !== false) writer.recordUserMessage("Look at this.");
  return { root, writer, system: system!, cap: sessionPayloadCap(root) };
}
function objectFiles(root: string): string[] {
  if (!existsSync(root) || !lstatSync(root).isDirectory()) return [];
  return readdirSync(root).flatMap(name => { const path = join(root, name); return lstatSync(path).isDirectory() ? objectFiles(path) : [path]; }).sort();
}
function coldRows(root: string, sessionId: string): EvidenceEvent[] {
  const reader = openSessionEventStore(root, undefined, { readOnly: true });
  try { return [...reader.readSessionEvents(sessionId)]; } finally { reader.close(); }
}
function attachmentRows(events: readonly EvidenceEvent[]) {
  const commitment = events.find(row => row.event_type === SPILL_COMMITMENT_EVENT_TYPE)!;
  const attachment = events.find(row => row.event_type === "user/attachment")!;
  return { commitment, attachment };
}
function sseResponse(): HttpResponse {
  const frames = [
    { type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "spill fixture response" } },
    { type: "content_block_stop", index: 0 }, { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } }, { type: "message_stop" }
  ];
  const bytes = Buffer.from(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join(""));
  return { status: 200, headers: { "content-type": "text/event-stream" }, body: (async function* () { yield bytes; })() };
}
async function drain(stream: AsyncIterable<unknown>) { for await (const _ of stream) { /* consume */ } }
function dropTriggers(db: Database.Database) {
  for (const trigger of ["protect_evidence_immutable", "no_delete_evidence", "no_update_evidence"]) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
}

describe("user attachments above the per-event cap are retained through the signed spill store", () => {
  test("a signed commitment row is durable before any object exists; the attachment row carries a descriptor and the same reference", () => {
    const phases: string[] = [];
    let root = "";
    const h = opened({ admission: (input, commit) => {
      if (input.eventType === SPILL_COMMITMENT_EVENT_TYPE) {
        phases.push("commitment-admission");
        expect(input.payload).toBeUndefined();
        expect(extractEnvelope(JSON.stringify(input.meta))?.surface).toEqual({ op: "none" });
        expect((input.meta as Record<string, unknown>)[SPILL_SUBJECT_META_KEY]).toBe("user/attachment");
        expect(objectFiles(spillRoot(root))).toEqual([]);
        const ref = extractSpillRef(JSON.stringify(input.meta));
        expect(ref?.locator).toMatch(/^amc-spill:v2:/);
        expect(existsSync(resolveSpillPath(root, ref!.locator!)!)).toBe(false);
        const written = commit();
        expect(objectFiles(spillRoot(root))).toEqual([]);
        phases.push("commitment-durable");
        return written;
      }
      if (input.eventType === "user/attachment") {
        phases.push("attachment-admission");
        expect(objectFiles(spillRoot(root))).toHaveLength(1);
      }
      return commit();
    } });
    root = h.root;
    const original = png(h.cap + 1);
    const before = h.writer.readEvents().length;
    const ref = h.writer.recordUserAttachment({ filename: "large.png", content: original, mimeType: "image/png", kind: "image" });
    expect(phases).toEqual(["commitment-admission", "commitment-durable", "attachment-admission"]);
    const events = h.writer.readEvents();
    expect(events).toHaveLength(before + 2);
    const { commitment, attachment } = attachmentRows(events);
    expect(attachment.id).toBe(ref.eventId);
    expect(events.indexOf(commitment)).toBe(events.indexOf(attachment) - 1);
    const spilled = extractSpillRef(attachment.meta_json)!;
    expect(spilled).toEqual(extractSpillRef(commitment.meta_json));
    expect(spilled).toMatchObject({ v: 2, contentSha256: sha256Hex(original), bytes: original.length, maxInlineBytes: h.cap, unretrievable: null });
    const meta = JSON.parse(attachment.meta_json) as Record<string, unknown>;
    expect(meta).toMatchObject({ filename: "large.png", mimeType: "image/png", bytes: original.length });
    const payload = readEventPayload(h.root, attachment);
    expect(payload.status).toBe("ok");
    const descriptor = decodeSpilledInputDescriptor((payload as { bytes: Buffer }).bytes)!;
    expect(descriptor).toEqual({ format: "amc-spilled-input@1", contentSha256: spilled.contentSha256, bytes: original.length, locator: spilled.locator });
    expect((payload as { bytes: Buffer }).bytes.length).toBeLessThanOrEqual(h.cap);
    expect(spilled.previewBytes).toBe((payload as { bytes: Buffer }).bytes.length);
    // The on-disk object is ciphertext, and both rows resolve to the original bytes.
    const encoded = readFileSync(resolveSpillPath(h.root, spilled.locator!)!);
    expect(encoded.includes(original.subarray(64, 128))).toBe(false);
    expect(retrieveSpilledContent(h.root, attachment)).toEqual(original);
    expect(retrieveSpilledContent(h.root, commitment)).toEqual(original);
    expect(resolveSpilledInputPayload({ workspace: h.root, event: attachment, payload: (payload as { bytes: Buffer }).bytes, events }))
      .toMatchObject({ status: "ok", commitmentEventId: commitment.id });
    expect(verifySpilledContent(h.root, events)).toMatchObject({ ok: true, checked: 2, errors: [] });
    // Exactly at the cap is still one inline signed row with no spill reference.
    const fits = h.writer.recordUserAttachment({ filename: "fits.png", content: png(h.cap), mimeType: "image/png", kind: "image" });
    const inline = h.writer.readEvents().find(row => row.id === fits.eventId)!;
    expect(extractSpillRef(inline.meta_json)).toBeNull();
    expect(JSON.parse(inline.meta_json)).not.toHaveProperty(SPILL_META_KEY);
    expect(h.writer.readEvents()).toHaveLength(before + 3);
  });

  test("the live request carries the original bytes and a fresh process derives identical request bytes from the spilled row", async () => {
    const h = opened();
    const original = png(3 * h.cap + 17);
    h.writer.recordUserAttachment({ filename: "large.png", content: original, mimeType: "image/png", kind: "image" });
    const store = new LocalCredentialsService({ env: {}, homeDir: join(h.root, "empty-credentials"), projectDir: null, includeDotenv: false, watch: false });
    credentials.push(store);
    const registry = new AdapterRegistry();
    registry.register({ providerId: "spill-fixture", adapter: anthropicAdapter, baseUrl: "https://spill.invalid", credentialRef: null, models: ["fixture-model"] });
    const sent: HttpRequest[] = [];
    const runtime = new LlmRuntime({ session: h.writer, credentials: store, registry, transport: async request => {
      sent.push({ ...request, body: Buffer.from(request.body), headers: { ...request.headers } }); return sseResponse();
    } });
    const spec: LlmCallSpec = { providerId: "spill-fixture", model: "fixture-model", params: { stream: true, max_tokens: 64 }, systemPromptEventId: h.system.eventId, tools: null };
    const call = runtime.prepare(spec); await drain(call.stream());
    expect(sent).toHaveLength(1);
    const body = JSON.parse(sent[0]!.body.toString("utf8"));
    const image = body.messages.flatMap((m: { content: { type: string }[] }) => m.content).find((p: { type: string }) => p.type === "image");
    expect(Buffer.from(image.source.data, "base64")).toEqual(original);
    const header = h.writer.readEvents().find(row => row.event_type === "request/header")!;
    const { commitment, attachment } = attachmentRows(h.writer.readEvents());
    const sourceIds = (JSON.parse(header.meta_json) as { sourceEventIds: string[] }).sourceEventIds;
    expect(sourceIds).toContain(attachment.id); expect(sourceIds).toContain(commitment.id);
    h.writer.endStep({ stopReason: "complete", usage: null }); h.writer.endTurn({ reason: "complete" }); h.writer.sealTurn();
    h.writer.close({ reason: "fixture-completed" }); writers.delete(h.writer);
    const result = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(new URL("./fixtures/nativeSignedImageCold.ts", import.meta.url)), h.root, h.writer.sessionId],
      { encoding: "utf8", timeout: 30_000, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, AMC_VAULT_PASSPHRASE: PASSPHRASE } });
    expect(result.error).toBeUndefined(); expect(result.status, result.stderr).toBe(0);
    const rows = JSON.parse(result.stdout) as { status: string; bytes: string | null; recordedDigest: string; derivedDigest: string | null; detail: string | null }[];
    expect(rows).toHaveLength(1);
    expect(rows[0], rows[0]!.detail ?? "no detail").toMatchObject({ status: "reconstructed", bytes: sent[0]!.body.toString("base64"), recordedDigest: sha256Hex(sent[0]!.body), derivedDigest: call.requestDigest });
  });

  test("a text attachment above the cap is retained through spill and replays as its original text", () => {
    const h = opened();
    const text = Buffer.from(Array.from({ length: h.cap + 512 }, (_, i) => String.fromCharCode(0x61 + (i * 7) % 26)).join(""), "utf8");
    const recorded = h.writer.recordUserAttachment({ filename: "notes.txt", content: text, mimeType: "text/plain", kind: "text" });
    const events = h.writer.readEvents();
    const { commitment, attachment } = attachmentRows(events);
    expect(attachment.id).toBe(recorded.eventId);
    expect(events.indexOf(commitment)).toBeLessThan(events.indexOf(attachment));
    expect(extractSpillRef(attachment.meta_json)).toMatchObject({ bytes: text.byteLength, contentSha256: sha256Hex(text), maxInlineBytes: h.cap });
    const payload = readEventPayload(h.root, attachment);
    expect(payload.status).toBe("ok");
    expect(decodeSpilledInputDescriptor((payload as { bytes: Buffer }).bytes)).toMatchObject({ contentSha256: sha256Hex(text), bytes: text.byteLength });
    const resolved = resolveSpilledInputPayload({ workspace: h.root, event: attachment, payload: (payload as { bytes: Buffer }).bytes, events });
    expect(resolved.status).toBe("ok");
    expect((resolved as { bytes: Buffer }).bytes.equals(text)).toBe(true);
    expect((resolved as { commitmentEventId: string | null }).commitmentEventId).toBe(commitment.id);
    expect(projectAcpAttachment(h.root, attachment, events)).toEqual({ sessionUpdate: "user_message_chunk", content: { type: "text", text: text.toString("utf8") } });
  });

  test("ACP history projection resolves the spilled attachment and refuses a modified, missing or uncommitted object", () => {
    const h = opened();
    const original = png(h.cap + 4096);
    h.writer.recordUserAttachment({ filename: "large.png", content: original, mimeType: "image/png", kind: "image" });
    const events = h.writer.readEvents();
    const { commitment, attachment } = attachmentRows(events);
    const update = projectAcpAttachment(h.root, attachment, events);
    expect(update).toEqual({ sessionUpdate: "user_message_chunk", content: { type: "image", mimeType: "image/png", data: original.toString("base64") } });
    const projected = projectSessionUpdates(h.root, events, 0, { includeUser: true });
    expect(projected.updates.some(item => (item.content as { data?: string } | undefined)?.data === original.toString("base64"))).toBe(true);
    // Read-side ordering: a spilled attachment whose commitment row is absent from the supplied history is refused.
    const withoutCommitment = events.filter(row => row.id !== commitment.id);
    expect(() => projectAcpAttachment(h.root, attachment, withoutCommitment)).toThrow(/cannot be replayed \(evidence-inconsistent\)/);
    // The session/load door enforces the same ordering: the projection passes its own history to the attachment projector.
    expect(() => projectSessionUpdates(h.root, withoutCommitment, 0, { includeUser: true })).toThrow(/evidence-inconsistent/);
    const path = resolveSpillPath(h.root, extractSpillRef(attachment.meta_json)!.locator!)!;
    const encoded = readFileSync(path);
    const flipped = Buffer.from(encoded); flipped[flipped.length - 1] ^= 0x01;
    writeFileSync(path, flipped);
    expect(() => projectAcpAttachment(h.root, attachment, events)).toThrow(/evidence-inconsistent/);
    rmSync(path);
    expect(() => projectAcpAttachment(h.root, attachment, events)).toThrow(/payload-missing/);
  });

  test("request derivation reports a modified object as inconsistent evidence and a deleted commitment row as unreconstructable evidence", async () => {
    const h = opened();
    const original = png(h.cap + 1);
    h.writer.recordUserAttachment({ filename: "large.png", content: original, mimeType: "image/png", kind: "image" });
    const store = new LocalCredentialsService({ env: {}, homeDir: join(h.root, "empty-credentials"), projectDir: null, includeDotenv: false, watch: false });
    credentials.push(store);
    const registry = new AdapterRegistry();
    registry.register({ providerId: "spill-fixture", adapter: anthropicAdapter, baseUrl: "https://spill.invalid", credentialRef: null, models: ["fixture-model"] });
    const runtime = new LlmRuntime({ session: h.writer, credentials: store, registry, transport: async () => sseResponse() });
    await drain(runtime.prepare({ providerId: "spill-fixture", model: "fixture-model", params: { stream: true, max_tokens: 64 }, systemPromptEventId: h.system.eventId, tools: null }).stream());
    h.writer.endStep({ stopReason: "complete", usage: null }); h.writer.endTurn({ reason: "complete" }); h.writer.sealTurn();
    h.writer.close({ reason: "fixture-completed" }); writers.delete(h.writer);
    const sessionId = h.writer.sessionId;
    expect(deriveSessionRequests({ workspace: h.root, sessionId })[0]).toMatchObject({ status: "reconstructed" });
    const { commitment, attachment } = attachmentRows(coldRows(h.root, sessionId));
    const path = resolveSpillPath(h.root, extractSpillRef(attachment.meta_json)!.locator!)!;
    const encoded = readFileSync(path);
    const flipped = Buffer.from(encoded); flipped[flipped.length - 1] ^= 0x01;
    writeFileSync(path, flipped);
    expect(deriveSessionRequests({ workspace: h.root, sessionId })[0]).toMatchObject({ status: "evidence-inconsistent", bytes: null });
    writeFileSync(path, encoded);
    expect(deriveSessionRequests({ workspace: h.root, sessionId })[0]).toMatchObject({ status: "reconstructed" });
    const db = new Database(join(h.root, ".amc", "evidence.sqlite"));
    try { dropTriggers(db); db.prepare("DELETE FROM evidence_events WHERE id = ?").run(commitment.id); } finally { db.close(); }
    expect(deriveSessionRequests({ workspace: h.root, sessionId })[0]).toMatchObject({ status: "evidence-inconsistent", bytes: null });
  });

  test("retention, erasure and export already cover the spilled attachment through its signed references", () => {
    const h = opened();
    const original = png(h.cap + 1);
    h.writer.recordUserAttachment({ filename: "large.png", content: original, mimeType: "image/png", kind: "image" });
    const events = h.writer.readEvents();
    const { commitment, attachment } = attachmentRows(events);
    const inventory = inventorySessionSpills({ workspace: h.root, events });
    expect(inventory.ok).toBe(true);
    expect(inventory.entries).toHaveLength(1);
    expect(inventory.entries[0]).toMatchObject({ status: "retained", eventIds: [commitment.id, attachment.id].sort() });
    const destination = join(h.root, "spill-export");
    const exported = exportSessionSpills({ workspace: h.root, events, destination });
    expect(exported.entries).toHaveLength(1); expect(exported.entries[0]!.status).toBe("exported");
    const erased = eraseSessionSpills({ workspace: h.root, events, scope: { sessionIds: [h.writer.sessionId] }, reason: "fixture erasure" });
    expect(erased.ok).toBe(true); expect(erased.entries[0]!.status).toBe("removed");
    expect(existsSync(resolveSpillPath(h.root, attachment && extractSpillRef(attachment.meta_json)!.locator!)!)).toBe(false);
    const payload = readEventPayload(h.root, attachment) as { bytes: Buffer };
    expect(resolveSpilledInputPayload({ workspace: h.root, event: attachment, payload: payload.bytes, events })).toMatchObject({ status: "missing" });
    expect(() => projectAcpAttachment(h.root, attachment, events)).toThrow(/payload-missing/);
    expect(verifySpilledContent(h.root, events)).toMatchObject({ ok: true, errors: [] });
    expect(verifySpilledContent(h.root, events).missing).toHaveLength(2);
  });

  test("above retention.maxBlobBytes the attachment is still refused with the fix named and nothing recorded", () => {
    const h = opened();
    const blobCap = sessionSpillCap(h.root);
    expect(blobCap).toBeGreaterThan(h.cap);
    const before = h.writer.readEvents().length;
    let refusal: unknown;
    try { h.writer.recordUserAttachment({ filename: "huge.txt", content: Buffer.alloc(blobCap + 1, 0x61), mimeType: "text/plain", kind: "text" }); }
    catch (error) { refusal = error; }
    expect(refusal).toBeInstanceOf(SessionSpillCapError);
    const message = (refusal as Error).message;
    expect(message).toContain(`${blobCap + 1} bytes`); expect(message).toContain(`${blobCap}-byte limit`);
    expect(message).toContain("retention.maxBlobBytes"); expect(message).toContain("amc ops sign");
    expect(h.writer.readEvents()).toHaveLength(before);
    expect(objectFiles(spillRoot(h.root))).toEqual([]);
  });

  test("audio stays fail-closed at the per-event cap because its provenance validators read the row payload directly", () => {
    const h = opened();
    const before = h.writer.readEvents().length;
    expect(() => h.writer.recordUserAttachment({ filename: "long.wav", content: Buffer.alloc(h.cap + 1), mimeType: "audio/wav", kind: "audio",
      sourceInputEventId: "x", sourceInputIndex: 0, sourceInputFormat: "amc-audio-input@1", sourceContentIndex: 0 })).toThrow(SessionPayloadCapError);
    expect(h.writer.readEvents()).toHaveLength(before);
  });

  test("before any blob has provisioned the workspace key, the spill store cannot prepare and the attachment is refused with nothing recorded", () => {
    // Spill never provisions a key (docs/SESSION_SPILL_LIFECYCLE.md), so an oversize attachment that would be a
    // session's very first blob fails at `prepare`; the ordinary blob written next provisions the key.
    const fresh = opened({ provision: false });
    const count = fresh.writer.readEvents().length;
    let refusal: unknown;
    try { fresh.writer.recordUserAttachment({ filename: "large.png", content: png(fresh.cap + 1), mimeType: "image/png", kind: "image" }); }
    catch (error) { refusal = error; }
    expect(refusal).toBeInstanceOf(SpilledInputRetentionError);
    expect((refusal as SpilledInputRetentionError).stage).toBe("prepare");
    expect((refusal as Error).message).toContain("Nothing was recorded");
    expect(fresh.writer.readEvents()).toHaveLength(count);
    expect(objectFiles(spillRoot(fresh.root))).toEqual([]);
    fresh.writer.recordUserMessage("provisions the key");
    fresh.writer.recordUserAttachment({ filename: "large.png", content: png(fresh.cap + 1), mimeType: "image/png", kind: "image" });
    expect(fresh.writer.readEvents()).toHaveLength(count + 3);
    expect(objectFiles(spillRoot(fresh.root))).toHaveLength(1);
  });

  test("a commitment refused at admission never publishes an object or an attachment row", () => {
    let root = "";
    const h = opened({ admission: (input, commit) => {
      if (input.eventType === SPILL_COMMITMENT_EVENT_TYPE) { expect(objectFiles(spillRoot(root))).toEqual([]); throw new Error("fixture: commitment refused"); }
      return commit();
    } });
    root = h.root;
    const before = h.writer.readEvents().length;
    let refusal: unknown;
    try { h.writer.recordUserAttachment({ filename: "large.png", content: png(h.cap + 1), mimeType: "image/png", kind: "image" }); }
    catch (error) { refusal = error; }
    expect(refusal).toBeInstanceOf(SpilledInputRetentionError);
    expect((refusal as SpilledInputRetentionError).stage).toBe("commit");
    expect(objectFiles(spillRoot(root))).toEqual([]);
    expect(h.writer.readEvents()).toHaveLength(before);
  });
});
