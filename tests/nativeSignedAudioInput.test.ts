/** AUTHORED UNEXECUTED. Original byte/MIME/order/queue/projection contracts. */
import { writeFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { assertNativeAudioBytes, decodeNativeAudioInput, encodeNativeAudioInput, materializeNativeAudioParts,
  NATIVE_AUDIO_INPUT_FORMAT, snapshotNativeAudioParts, type NativeAudioPart } from "../src/attachments/nativeAudioInput.js";
import { loadNativeAudioManifest, NATIVE_AUDIO_FILE_MANIFEST_FORMAT } from "../src/attachments/nativeAudioFiles.js";
import { encodeNativeImageInput, snapshotNativeImages } from "../src/attachments/nativeImageInput.js";
import { encodeNativeOrderedInput, snapshotNativeInputParts } from "../src/attachments/nativeOrderedInput.js";
import { LoopInbox } from "../src/agent/inbox.js";
import { recordNativeAudioMessage } from "../src/agent/nativeAudioMessage.js";
import { SessionService } from "../src/session/sessionService.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { validateNativeAudioProvenance } from "../src/session/nativeAudioProvenance.js";
import { foldSurfaceEntries } from "../src/session/surfaceProjection.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";
import { DEFAULT_REQUEST_ENCODERS } from "../src/llm/request/deriveRequest.js";
import { geminiContentEncoder } from "../src/llm/request/geminiContentEncoder.js";
import { geminiContentEncoderV2 } from "../src/llm/request/geminiContentEncoderV2.js";
import type { EncodableRequest } from "../src/llm/request/requestSpec.js";
import * as publicSdk from "../src/sdk/index.js";
import { audioCleanup, audioWorkspace, audioParts, audioInput, wavBytes } from "./fixtures/nativeSignedAudio.js";
import { imageInput, IMAGE_PNG_BASE64 } from "./fixtures/nativeAcpImageRuntime.js";

afterEach(audioCleanup);
function writerAt(root: string): SessionService {
  const writer = new SessionService(root);
  writer.open({ agentId: "default", harnessVersion: "audio-fixture", compositionDigest: "audio-fixture", policyDigest: "audio-fixture" });
  return writer;
}
describe("signed original audio input (unexecuted)", () => {
  test("immutable original bytes, digest, lengths, empty text and order survive caller mutation", () => {
    const source = audioParts(), snapshot = snapshotNativeAudioParts(source), payload = encodeNativeAudioInput(snapshot);
    for (const part of source) if (part.type === "audio") part.audio.bytes.fill(0); else if (part.type === "image") part.image.bytes.fill(0);
    source.reverse(); source.splice(0);
    expect(encodeNativeAudioInput(snapshot)).toBe(payload); expect(decodeNativeAudioInput(Buffer.from(payload))).toEqual(snapshot);
    expect(snapshot.map(part => part.type)).toEqual(["text", "audio", "text", "image", "text", "audio", "text"]);
    expect(snapshot[2]).toEqual({ type: "text", text: "" }); expect(Object.isFrozen(snapshot)).toBe(true);
    const part = snapshot[1]; if (part?.type !== "audio") throw new Error("audio fixture missing");
    expect(part.audio).toMatchObject({ mediaType: "audio/wav", byteLength: 48, sha256: sha256Hex(wavBytes()) });
    expect(Buffer.from(part.audio.data, "base64")).toEqual(wavBytes());
    const opened = materializeNativeAudioParts(snapshot); if (opened[1]?.type === "audio") opened[1].audio.bytes.fill(0);
    expect(encodeNativeAudioInput(snapshot)).toBe(payload);
  });
  test.each(["high-bit-magic", "riff-length", "data-length", "float", "stereo-align", "byte-rate", "sample-rate", "trailing", "odd-samples"])("%s original header contradictions are rejected", attack => {
    let bytes = wavBytes();
    if (attack === "high-bit-magic") bytes[0] = bytes[0]! | 0x80;
    if (attack === "riff-length") bytes.writeUInt32LE(1, 4);
    if (attack === "data-length") bytes.writeUInt32LE(2, 40);
    if (attack === "float") bytes.writeUInt16LE(3, 20);
    if (attack === "stereo-align") bytes.writeUInt16LE(2, 22);
    if (attack === "byte-rate") bytes.writeUInt32LE(1, 28);
    if (attack === "sample-rate") bytes.writeUInt32LE(0, 24);
    if (attack === "trailing") bytes = Buffer.concat([bytes, Buffer.from([0])]);
    if (attack === "odd-samples") { bytes = bytes.subarray(0, 47); bytes.writeUInt32LE(39, 4); bytes.writeUInt32LE(3, 40); }
    expect(() => assertNativeAudioBytes(bytes, "audio/wav")).toThrow();
  });
  test("MIME, path, unsupported siblings, hidden fields and canonical envelope cannot be normalized away", () => {
    for (const parts of [[], [{ type: "text", text: "no audio" }], [{ type: "audio", audio: { ...audioInput(), mediaType: "audio/mpeg" } }],
      [{ type: "audio", audio: { ...audioInput(), filename: "../original.wav" } }], [...audioParts(), { type: "video", data: "AAAA" }],
      [...audioParts(), { type: "text", text: "\ud800" }], [...audioParts(), { type: "text", text: "kept?", extra: true }],
      Array.from({ length: 9 }, () => ({ type: "audio", audio: audioInput() }))]) {
      expect(() => snapshotNativeAudioParts(parts as NativeAudioPart[])).toThrow();
    }
    const extra = audioParts(); Object.defineProperty(extra, Symbol("hidden"), { value: "no" });
    expect(() => snapshotNativeAudioParts(extra)).toThrow();
    const payload = encodeNativeAudioInput(snapshotNativeAudioParts(audioParts()));
    for (const text of [payload + "\n", payload.slice(0, -1), payload.replace(NATIVE_AUDIO_INPUT_FORMAT, "amc-audio-input@200"),
      payload.replace('"byteLength":48', '"byteLength":47'), payload.replace(sha256Hex(wavBytes()), "0".repeat(64))]) {
      expect(() => decodeNativeAudioInput(Buffer.from(text))).toThrow();
    }
  });
  test("historical image1/2 and Gemini1 byte contracts remain distinct, with cold v2 public registration", () => {
    expect(encodeNativeImageInput("legacy", snapshotNativeImages([imageInput()]))).toBe(`{"format":"amc-image-input@1","images":[{"data":"${IMAGE_PNG_BASE64}","filename":"pixel.png","mediaType":"image/png"}],"text":"legacy"}`);
    expect(encodeNativeOrderedInput(snapshotNativeInputParts([{ type: "image", image: imageInput() }, { type: "text", text: "" }]))).toBe(`{"format":"amc-image-input@2","parts":[{"image":{"data":"${IMAGE_PNG_BASE64}","filename":"pixel.png","mediaType":"image/png"},"type":"image"},{"text":"","type":"text"}]}`);
    const text: EncodableRequest = { model: "fixture-model", params: { generationConfig: { maxOutputTokens: 64 } }, system: null, tools: null,
      messages: [{ role: "user", parts: [{ kind: "text", text: "original" }] }] };
    expect(geminiContentEncoder.encode(text).toString()).toBe('{"contents":[{"parts":[{"text":"original"}],"role":"user"}],"generationConfig":{"maxOutputTokens":64}}');
    expect(geminiContentEncoderV2.encode(text)).toEqual(geminiContentEncoder.encode(text));
    expect(DEFAULT_REQUEST_ENCODERS.get("gemini-generate-content", 1)).toBe(geminiContentEncoder);
    expect(DEFAULT_REQUEST_ENCODERS.get("gemini-generate-content", 2)).toBe(geminiContentEncoderV2);
    expect(publicSdk.NATIVE_AUDIO_INPUT_FORMAT).toBe(NATIVE_AUDIO_INPUT_FORMAT);
    const audio: EncodableRequest = { ...text, messages: [{ role: "user", parts: [{ kind: "audio", bytes: wavBytes(), mediaType: "audio/wav", sha256: sha256Hex(wavBytes()) }] }] };
    for (const identity of ["gemini-generate-content@1", "anthropic-messages@1", "anthropic-messages@4", "openai-chat@1", "openai-chat@4", "openai-responses@3", "deepseek-chat@1"]) {
      const at = identity.lastIndexOf("@"), encoder = DEFAULT_REQUEST_ENCODERS.get(identity.slice(0, at), Number(identity.slice(at + 1)));
      expect(encoder).not.toBeNull(); expect(() => encoder!.encode(audio)).toThrow();
    }
  });
  test("accessor-backed arrays or nested image fields refuse without executing the accessor", () => {
    let reads = 0;
    const indexed = audioParts();
    Object.defineProperty(indexed, "0", { enumerable: true, configurable: true, get: () => { reads++; return { type: "text", text: "changed" }; } });
    expect(() => snapshotNativeAudioParts(indexed)).toThrow(/accessor/i); expect(reads).toBe(0);
    const image = imageInput();
    Object.defineProperty(image, "bytes", { enumerable: true, get: () => { reads++; return Buffer.from(IMAGE_PNG_BASE64, "base64"); } });
    expect(() => snapshotNativeAudioParts([{ type: "audio", audio: audioInput() }, { type: "image", image }])).toThrow(/data fields/i);
    expect(reads).toBe(0);
    class ForeignParts extends Array<NativeAudioPart> {}
    expect(() => snapshotNativeAudioParts(ForeignParts.of({ type: "audio", audio: audioInput() }))).toThrow(/ordinary/i);
    expect(() => snapshotNativeAudioParts([{ type: "audio", audio: { ...audioInput(), filename: "file:original.wav" } }])).toThrow(/filename/i);
    expect(() => snapshotNativeAudioParts([{ type: "audio", audio: audioInput() }, { type: "image", image: {
      filename: "pixel.gif", mediaType: "image/gif", bytes: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") } }])).toThrow(/PNG/i);
    const extraImage = { ...imageInput(), uri: "files/unowned" };
    expect(() => snapshotNativeAudioParts([{ type: "audio", audio: audioInput() }, { type: "image", image: extraImage }])).toThrow(/data fields/i);
  });
  test.each(["sqlite", "jsonl"])("%s queue replay and signed projection bind every original part and separate media ordinals", backend => {
    const root = audioWorkspace(backend), writer = writerAt(root);
    try {
      const inbox = new LoopInbox(writer, () => {}), receipt = inbox.insert("next-turn", "", "followup", { wake: false, demotedFrom: null, audioParts: audioParts() });
      expect(new LoopInbox(writer, () => {}).nextTurn).toEqual(inbox.nextTurn);
      writer.startTurn({ trigger: "user" }); writer.startStep(); const claim = inbox.claim("next-turn")[0]!;
      const before = writer.readEvents();
      expect(() => recordNativeAudioMessage(writer, { ...claim, audioParts: [...claim.audioParts!].reverse() })).toThrow(); expect(writer.readEvents()).toEqual(before);
      recordNativeAudioMessage(writer, claim);
      const events = writer.readEvents(), rows = events.filter(row => ["user/message", "user/attachment"].includes(row.event_type));
      expect(rows.map(row => JSON.parse(row.meta_json).sourceContentIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(rows.every(row => JSON.parse(row.meta_json).sourceInputEventId === receipt.eventId)).toBe(true);
      expect(rows.filter(row => row.event_type === "user/attachment").map(row => JSON.parse(row.meta_json).sourceInputIndex)).toEqual([0, 0, 1]);
      expect(readEventPayload(root, rows[1]!)).toEqual({ status: "ok", bytes: wavBytes() });
      expect(readEventPayload(root, rows[2]!)).toEqual({ status: "ok", bytes: Buffer.alloc(0) });
      expect(validateNativeAudioProvenance(root, events)).toContain(receipt.eventId);
      const surface = foldSurfaceEntries(events);
      expect(() => validateNativeAudioProvenance(root, events, [...surface].reverse())).toThrow();
      expect(() => validateNativeAudioProvenance(root, events, surface.slice(1))).toThrow();
      expect(() => validateNativeAudioProvenance(root, events, surface.map(entry => ({ ...entry, sourceEventId: "replaced-audio" })))).toThrow();
    } finally { writer.disposeWithoutClosing(); }
  });
  test("local manifest keeps original order and refuses symlinks, MIME swaps, URLs and mixed unknown content", () => {
    const root = audioWorkspace(), file = join(root, "original.wav"), manifest = join(root, "input.json"); writeFileSync(file, wavBytes());
    const value = { format: NATIVE_AUDIO_FILE_MANIFEST_FORMAT, parts: [{ type: "audio", path: "original.wav", mimeType: "audio/wav" }, { type: "text", text: "after  " }] };
    writeFileSync(manifest, canonicalize(value)); const parts = loadNativeAudioManifest(manifest);
    expect(parts.map(part => part.type)).toEqual(["audio", "text"]); if (parts[0]?.type === "audio") expect(parts[0].audio.bytes).toEqual(wavBytes());
    symlinkSync(file, join(root, "linked.wav"));
    for (const path of ["linked.wav", "https://unowned.invalid/a.wav", "data:audio/wav;base64,AAAA"]) {
      writeFileSync(manifest, canonicalize({ ...value, parts: [{ type: "audio", path, mimeType: "audio/wav" }] }));
      expect(() => loadNativeAudioManifest(manifest)).toThrow();
    }
    writeFileSync(manifest, canonicalize({ ...value, parts: [...value.parts, { type: "resource", path: "unread.bin", mimeType: "application/pdf" }] }));
    expect(() => loadNativeAudioManifest(manifest)).toThrow(/supports|unsupported/i);
  });
});
