/**
 * AUTHORED IN-SESSION. A queued input above `retention.maxPayloadBytesPerEvent` is retained through the encrypted
 * spill store behind a signed `tool/spill-commitment` row (subject `loop/inbox`, naming the queued message), and
 * every reader that decodes a `loop/inbox` row — inbox replay, the three claim-time recorders, ACP ordered
 * continuity, audio provenance and the Studio task projection — resolves the descriptor through the commitment
 * before decoding. Nothing in here probes a live provider.
 */
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import type { SessionStoreAppendInput, SessionStoreAppendResult } from "../src/persistence/sessionEventStore.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { readLoopInboxMeta } from "../src/session/loopEventMeta.js";
import { SessionSpillCapError, sessionPayloadCap, sessionSpillCap } from "../src/session/sessionPayloadCap.js";
import { decodeSpilledInputDescriptor, resolveSpilledInboxPayload, SPILL_COMMITMENT_EVENT_TYPE, SPILL_INBOX_MESSAGE_META_KEY,
  SPILL_INBOX_SUBJECT, SPILL_SUBJECT_META_KEY, SPILLED_INPUT_FORMAT } from "../src/session/spill/spillInput.js";
import { extractSpillRef } from "../src/session/spill/spillTypes.js";
import { resolveSpillPath, spillRoot } from "../src/session/spill/spillStore.js";
import { LoopInbox, readQueuedInputBytes } from "../src/agent/inbox.js";
import { recordNativeOrderedMessage } from "../src/agent/nativeOrderedMessage.js";
import { recordNativeAudioMessage } from "../src/agent/nativeAudioMessage.js";
import { recordNativeImageMessage } from "../src/agent/nativeImageMessage.js";
import { encodeNativeOrderedInput, NATIVE_ORDERED_INPUT_FORMAT, snapshotNativeInputParts, type NativeInputPart } from "../src/attachments/nativeOrderedInput.js";
import { encodeNativeAudioInput, NATIVE_AUDIO_INPUT_FORMAT, snapshotNativeAudioParts, type NativeAudioPart } from "../src/attachments/nativeAudioInput.js";
import { encodeNativeImageInput, MAX_NATIVE_IMAGE_BYTES, NATIVE_IMAGE_INPUT_FORMAT, snapshotNativeImages, type NativeImageInput } from "../src/attachments/nativeImageInput.js";
import { validateAcpOrderedHistory } from "../src/acp/acpHistoryContinuity.js";
import { projectSessionUpdates } from "../src/acp/acpProjection.js";
import { validateNativeAudioProvenance } from "../src/session/nativeAudioProvenance.js";
import { readNativeTaskProjection } from "../src/studio/nativeTaskProjection.js";
import { lockVault } from "../src/vault/vault.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { EvidenceEvent } from "../src/types.js";
import { wavBytes } from "./fixtures/nativeSignedAudio.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1sAAAAASUVORK5CYII=", "base64");
const PASSPHRASE = "disposable-inbox-spill-fixture-passphrase";
const roots: string[] = [], writers = new Set<SessionService>();
afterEach(() => {
  for (const writer of writers) writer.disposeWithoutClosing();
  writers.clear();
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
  const root = mkdtempSync(join(tmpdir(), "amc-inbox-spill-")); roots.push(root);
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
  writer.open({ agentId: "default", harnessVersion: "inbox-spill-fixture", compositionDigest: "inbox-spill-fixture", policyDigest: "inbox-spill-fixture" });
  // The ordinary system-prompt blob provisions the workspace key; spill never provisions one.
  if (options.provision !== false) writer.recordSystemPrompt("Describe the queued bytes.");
  writer.startTurn({ trigger: "user" }); writer.startStep();
  return { root, writer, cap: sessionPayloadCap(root) };
}
function objectFiles(root: string): string[] {
  if (!existsSync(root) || !lstatSync(root).isDirectory()) return [];
  return readdirSync(root).flatMap(name => { const path = join(root, name); return lstatSync(path).isDirectory() ? objectFiles(path) : [path]; }).sort();
}
function lastTwo(events: readonly EvidenceEvent[]) {
  const commitment = events[events.length - 2]!, row = events[events.length - 1]!;
  return { commitment, row };
}
function payloadOf(root: string, row: EvidenceEvent): Buffer {
  const payload = readEventPayload(root, row);
  if (payload.status !== "ok") throw new Error(`payload ${payload.status}`);
  return payload.bytes;
}
function orderedParts(image: Buffer): NativeInputPart[] {
  return [{ type: "text", text: "Look" }, { type: "image", image: { filename: "large.png", mediaType: "image/png", bytes: image } }];
}
function updateData(updates: readonly { readonly [field: string]: unknown }[], type: string): Buffer[] {
  return updates.flatMap(update => {
    const content = update.content as { type?: string; data?: string } | undefined;
    return content?.type === type && typeof content.data === "string" ? [Buffer.from(content.data, "base64")] : [];
  });
}

describe("queued inputs above the per-event cap are retained through the signed spill store", () => {
  test("the loop/inbox commitment is durable before any object exists; the inbox row carries a descriptor and keeps its format; replay, claim, continuity and projection carry the original bytes", () => {
    const phases: string[] = [];
    let root = "";
    const h = opened({ admission: (input, commit) => {
      const meta = input.meta as Record<string, unknown>;
      if (input.eventType === SPILL_COMMITMENT_EVENT_TYPE && meta[SPILL_SUBJECT_META_KEY] === SPILL_INBOX_SUBJECT) {
        phases.push("commitment-admission");
        expect(input.payload).toBeUndefined();
        expect(objectFiles(spillRoot(root))).toEqual([]);
        const ref = extractSpillRef(JSON.stringify(input.meta));
        expect(ref?.locator).toMatch(/^amc-spill:v2:/);
        expect(existsSync(resolveSpillPath(root, ref!.locator!)!)).toBe(false);
        const written = commit();
        expect(objectFiles(spillRoot(root))).toEqual([]);
        phases.push("commitment-durable");
        return written;
      }
      if (input.eventType === "loop/inbox") {
        phases.push("inbox-admission");
        expect(objectFiles(spillRoot(root))).toHaveLength(1);
      }
      return commit();
    } });
    root = h.root;
    // The image itself is above the cap, so the attachment row a claim records spills too (fa2ffac6's path).
    const image = png(h.cap + 1);
    const parts = orderedParts(image);
    const expected = encodeNativeOrderedInput(snapshotNativeInputParts(parts));
    expect(Buffer.byteLength(expected, "utf8")).toBeGreaterThan(h.cap);
    const inbox = new LoopInbox(h.writer, () => {});
    const before = h.writer.readEvents().length;
    const receipt = inbox.insert("next-turn", "", "followup", { wake: false, demotedFrom: null, parts });
    expect(phases).toEqual(["commitment-admission", "commitment-durable", "inbox-admission"]);
    const events = h.writer.readEvents();
    expect(events).toHaveLength(before + 2);
    const { commitment, row } = lastTwo(events);
    expect(row.id).toBe(receipt.eventId);
    expect(row.event_type).toBe("loop/inbox");
    expect(commitment.event_type).toBe(SPILL_COMMITMENT_EVENT_TYPE);
    const commitmentMeta = JSON.parse(commitment.meta_json) as Record<string, unknown>;
    expect(commitmentMeta[SPILL_SUBJECT_META_KEY]).toBe("loop/inbox");
    expect(commitmentMeta[SPILL_INBOX_MESSAGE_META_KEY]).toBe(receipt.messageId);
    const ref = extractSpillRef(commitment.meta_json)!;
    expect(ref).toMatchObject({ bytes: Buffer.byteLength(expected, "utf8"), contentSha256: sha256Hex(Buffer.from(expected, "utf8")), maxInlineBytes: h.cap, unretrievable: null });
    // loop/inbox meta is a fixed hash pre-image: the reference rides on the commitment row, never on the inbox row.
    expect(extractSpillRef(row.meta_json)).toBeNull();
    expect(readLoopInboxMeta(row.meta_json)).toMatchObject({ op: "insert", payloadFormat: NATIVE_ORDERED_INPUT_FORMAT, messageIds: [receipt.messageId], origin: "followup" });
    const payload = payloadOf(root, row);
    expect(sha256Hex(payload)).toBe(row.payload_sha256);
    expect(decodeSpilledInputDescriptor(payload)).toEqual({ format: SPILLED_INPUT_FORMAT, contentSha256: ref.contentSha256, bytes: ref.bytes, locator: ref.locator });
    // The live lane holds the original parts, and a driver rebuilt over the rows alone holds the same.
    expect(encodeNativeOrderedInput(inbox.nextTurn[0]!.parts!)).toBe(expected);
    const replayed = new LoopInbox(h.writer, () => {});
    expect(replayed.nextTurn).toHaveLength(1);
    const message = replayed.nextTurn[0]!;
    expect(message.inputEventId).toBe(row.id);
    expect(message.messageId).toBe(receipt.messageId);
    expect(encodeNativeOrderedInput(message.parts!)).toBe(expected);
    const resolved = resolveSpilledInboxPayload({ workspace: root, event: row, messageId: receipt.messageId, payload, events });
    expect(resolved.status).toBe("ok");
    if (resolved.status !== "ok") throw new Error("detail" in resolved ? resolved.detail : resolved.status);
    expect(resolved.bytes.toString("utf8")).toBe(expected);
    expect(resolved.commitmentEventId).toBe(commitment.id);
    // Claiming records the content rows from the resolved bytes; the oversize image spills again as an attachment.
    const [claimed] = replayed.claim("next-turn");
    const last = recordNativeOrderedMessage(h.writer, claimed!);
    const rows = h.writer.readEvents();
    const attachment = rows.find(candidate => candidate.id === last.eventId)!;
    expect(attachment.event_type).toBe("user/attachment");
    expect(JSON.parse(attachment.meta_json)).toMatchObject({ sourceInputEventId: row.id, sourceInputFormat: NATIVE_ORDERED_INPUT_FORMAT, bytes: image.length });
    expect(extractSpillRef(attachment.meta_json)).not.toBeNull();
    expect(() => validateAcpOrderedHistory(root, rows)).not.toThrow();
    const projected = projectSessionUpdates(root, rows, 0, { includeUser: true });
    expect(projected.unsigned).toBe(0);
    expect(updateData(projected.updates, "image").some(bytes => bytes.equals(image))).toBe(true);
    const projection = readNativeTaskProjection(root, h.writer.sessionId, "default");
    expect(projection.history.status).toBe("authenticated");
    expect(projection.events.some(event => event.attachment?.sha256 === sha256Hex(image) && event.attachment.byteLength === image.length)).toBe(true);
  });

  test("a descriptor row is never treated as bytes: no preceding loop/inbox commitment, another message's commitment, a later commitment or a modified object refuses", () => {
    const h = opened();
    const image = png(h.cap + 1), parts = orderedParts(image);
    const expected = encodeNativeOrderedInput(snapshotNativeInputParts(parts));
    const inbox = new LoopInbox(h.writer, () => {});
    const receipt = inbox.insert("next-turn", "", "followup", { wake: false, demotedFrom: null, parts });
    const events = h.writer.readEvents();
    const { commitment, row } = lastTwo(events);
    const payload = payloadOf(h.root, row);
    const describe = { what: "Ordered", consequence: "no part may be projected." } as const;
    const withoutCommitment = events.filter(event => event.id !== commitment.id);
    expect(resolveSpilledInboxPayload({ workspace: h.root, event: row, messageId: receipt.messageId, payload, events: withoutCommitment })).toMatchObject({ status: "evidence-inconsistent" });
    expect(resolveSpilledInboxPayload({ workspace: h.root, event: row, messageId: "another-message", payload, events })).toMatchObject({ status: "evidence-inconsistent" });
    expect(resolveSpilledInboxPayload({ workspace: h.root, event: row, messageId: receipt.messageId, payload, events: [...withoutCommitment, commitment] })).toMatchObject({ status: "evidence-inconsistent" });
    expect(resolveSpilledInboxPayload({ workspace: h.root, event: row, messageId: receipt.messageId, payload, events: withoutCommitment.filter(event => event.id !== row.id) })).toMatchObject({ status: "evidence-inconsistent" });
    expect(() => readQueuedInputBytes(h.root, withoutCommitment, row, receipt.messageId, describe)).toThrow(/Ordered inbox payload is evidence-inconsistent/);
    expect(readQueuedInputBytes(h.root, events, row, receipt.messageId, describe).toString("utf8")).toBe(expected);
    // A row within the cap resolves as not spilled and reads its own payload.
    const small = inbox.insert("next-turn", "", "followup", { wake: false, demotedFrom: null, parts: orderedParts(PNG) });
    const all = h.writer.readEvents();
    expect(all).toHaveLength(events.length + 1);
    const smallRow = all[all.length - 1]!;
    expect(resolveSpilledInboxPayload({ workspace: h.root, event: smallRow, messageId: small.messageId, payload: payloadOf(h.root, smallRow), events: all })).toEqual({ status: "not-spilled" });
    expect(readQueuedInputBytes(h.root, all, smallRow, small.messageId, describe).toString("utf8")).toBe(encodeNativeOrderedInput(snapshotNativeInputParts(orderedParts(PNG))));
    // A modified object refuses everywhere the descriptor is read: the resolver, and a driver rebuilt over the rows.
    const path = resolveSpillPath(h.root, extractSpillRef(commitment.meta_json)!.locator!)!;
    const encoded = readFileSync(path);
    const flipped = Buffer.from(encoded); flipped[flipped.length - 1] ^= 0x01;
    writeFileSync(path, flipped);
    expect(resolveSpilledInboxPayload({ workspace: h.root, event: row, messageId: receipt.messageId, payload, events }).status).not.toBe("ok");
    expect(() => new LoopInbox(h.writer, () => {})).toThrow(/agent inbox/);
    expect(() => recordNativeOrderedMessage(h.writer, { messageId: receipt.messageId, text: "", origin: "followup", inputEventId: row.id, parts: snapshotNativeInputParts(parts) })).toThrow(/Ordered inbox payload/);
    rmSync(path);
    expect(resolveSpilledInboxPayload({ workspace: h.root, event: row, messageId: receipt.messageId, payload, events })).toMatchObject({ status: "missing" });
    expect(() => new LoopInbox(h.writer, () => {})).toThrow(/agent inbox/);
  });

  test("a queued audio input above the cap is retained, claimed into spilled audio attachment rows, and audio provenance validates end to end", () => {
    const h = opened();
    const audio = wavBytes(0xff81, h.cap + 2 - 44);
    expect(audio.length).toBeGreaterThan(h.cap);
    const audioParts: NativeAudioPart[] = [{ type: "text", text: "Listen" }, { type: "audio", audio: { filename: "long.wav", mediaType: "audio/wav", bytes: audio } }];
    const expected = encodeNativeAudioInput(snapshotNativeAudioParts(audioParts));
    const inbox = new LoopInbox(h.writer, () => {});
    const before = h.writer.readEvents().length;
    const receipt = inbox.insert("next-turn", "", "followup", { wake: false, demotedFrom: null, audioParts });
    const events = h.writer.readEvents();
    expect(events).toHaveLength(before + 2);
    const { commitment, row } = lastTwo(events);
    expect(JSON.parse(commitment.meta_json)).toMatchObject({ [SPILL_SUBJECT_META_KEY]: SPILL_INBOX_SUBJECT, [SPILL_INBOX_MESSAGE_META_KEY]: receipt.messageId });
    expect(readLoopInboxMeta(row.meta_json)?.payloadFormat).toBe(NATIVE_AUDIO_INPUT_FORMAT);
    expect(decodeSpilledInputDescriptor(payloadOf(h.root, row))).not.toBeNull();
    const replayed = new LoopInbox(h.writer, () => {});
    expect(encodeNativeAudioInput(replayed.nextTurn[0]!.audioParts!)).toBe(expected);
    const [claimed] = replayed.claim("next-turn");
    const claimRow = h.writer.readEvents().at(-1)!;
    expect(readLoopInboxMeta(claimRow.meta_json)?.op).toBe("claim");
    const last = recordNativeAudioMessage(h.writer, claimed!);
    const rows = h.writer.readEvents();
    const attachment = rows.find(candidate => candidate.id === last.eventId)!;
    expect(JSON.parse(attachment.meta_json)).toMatchObject({ mimeType: "audio/wav", bytes: audio.length, sourceInputEventId: row.id, sourceInputFormat: NATIVE_AUDIO_INPUT_FORMAT });
    // The audio attachment is itself above the cap: it now spills instead of refusing (its provenance reader resolves descriptors).
    expect(extractSpillRef(attachment.meta_json)).not.toBeNull();
    expect(rows[rows.indexOf(attachment) - 1]!.event_type).toBe(SPILL_COMMITMENT_EVENT_TYPE);
    expect(validateNativeAudioProvenance(h.root, rows)).toEqual([row.id, claimRow.id]);
    const projected = projectSessionUpdates(h.root, rows, 0, { includeUser: true });
    expect(updateData(projected.updates, "audio").some(bytes => bytes.equals(audio))).toBe(true);
    const projection = readNativeTaskProjection(h.root, h.writer.sessionId, "default");
    expect(projection.events.some(event => event.attachment?.type === "audio" && event.attachment.sha256 === sha256Hex(audio))).toBe(true);
    // Read side: without the loop/inbox commitment the provenance validator refuses rather than decoding the descriptor.
    expect(() => validateNativeAudioProvenance(h.root, rows.filter(event => event.id !== commitment.id))).toThrow(/evidence-inconsistent/);
  });

  test("a queued legacy image input above the cap is retained and claimed from the resolved bytes", () => {
    const h = opened();
    const image = png(h.cap + 1);
    const images: NativeImageInput[] = [{ filename: "large.png", mediaType: "image/png", bytes: image }];
    const expected = encodeNativeImageInput("Look", snapshotNativeImages(images));
    const inbox = new LoopInbox(h.writer, () => {});
    const receipt = inbox.insert("next-turn", "Look", "followup", { wake: false, demotedFrom: null, images });
    const events = h.writer.readEvents();
    const { commitment, row } = lastTwo(events);
    expect(JSON.parse(commitment.meta_json)).toMatchObject({ [SPILL_SUBJECT_META_KEY]: SPILL_INBOX_SUBJECT, [SPILL_INBOX_MESSAGE_META_KEY]: receipt.messageId });
    expect(readLoopInboxMeta(row.meta_json)?.payloadFormat).toBe(NATIVE_IMAGE_INPUT_FORMAT);
    expect(readQueuedInputBytes(h.root, events, row, receipt.messageId, { what: "Image", consequence: "no image may be projected." }).toString("utf8")).toBe(expected);
    const replayed = new LoopInbox(h.writer, () => {});
    const message = replayed.nextTurn[0]!;
    expect(message.text).toBe("Look");
    expect(encodeNativeImageInput(message.text, message.images!)).toBe(expected);
    const [claimed] = replayed.claim("next-turn");
    const last = recordNativeImageMessage(h.writer, claimed!)!;
    const attachment = h.writer.readEvents().find(candidate => candidate.id === last.eventId)!;
    expect(JSON.parse(attachment.meta_json)).toMatchObject({ sourceInputEventId: row.id, bytes: image.length });
  });

  test("above retention.maxBlobBytes a queued input is refused at the door with that key named, nothing recorded and the lane empty", () => {
    const h = opened();
    const blobCap = sessionSpillCap(h.root);
    // Two maximal images: their base64 in the queued row is above the default blob cap. Measured, not assumed.
    const parts: NativeInputPart[] = [
      { type: "image", image: { filename: "a.png", mediaType: "image/png", bytes: png(MAX_NATIVE_IMAGE_BYTES) } },
      { type: "image", image: { filename: "b.png", mediaType: "image/png", bytes: png(MAX_NATIVE_IMAGE_BYTES) } }
    ];
    const encoded = Buffer.byteLength(encodeNativeOrderedInput(snapshotNativeInputParts(parts)), "utf8");
    expect(encoded).toBeGreaterThan(blobCap);
    const inbox = new LoopInbox(h.writer, () => {});
    const before = h.writer.readEvents().length;
    let refusal: unknown;
    try { inbox.insert("next-turn", "", "followup", { wake: false, demotedFrom: null, parts }); }
    catch (error) { refusal = error; }
    expect(refusal).toBeInstanceOf(SessionSpillCapError);
    const message = (refusal as Error).message;
    expect(message).toContain(`${encoded} bytes`); expect(message).toContain(`${blobCap}-byte limit`);
    expect(message).toContain("retention.maxBlobBytes"); expect(message).toContain("amc ops sign");
    expect(h.writer.readEvents()).toHaveLength(before);
    expect(inbox.hasPending).toBe(false);
    expect(objectFiles(spillRoot(h.root))).toEqual([]);
  });
});
