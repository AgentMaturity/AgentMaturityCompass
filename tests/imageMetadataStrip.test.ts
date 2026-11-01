/**
 * PXB-42: image metadata (EXIF with GPS, IPTC, XMP, text/comment chunks) is stripped at the one row a request reads,
 * and the row records the source and sent digests. Fixtures are built here so each metadata block is known.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { LoopInbox } from "../src/agent/inbox.js";
import { recordNativeOrderedMessage } from "../src/agent/nativeOrderedMessage.js";
import { recordNativeAudioMessage } from "../src/agent/nativeAudioMessage.js";
import { validateAcpOrderedHistory } from "../src/acp/acpHistoryContinuity.js";
import type { AcpFailure } from "../src/acp/acpErrors.js";
import { validateNativeAudioProvenance } from "../src/session/nativeAudioProvenance.js";
import { ingestAttachment } from "../src/attachments/attachmentIngest.js";
import { ImageMetadataStripError, stripNativeImageMetadata } from "../src/attachments/imageMetadataStrip.js";
import { nativeImageMediaType } from "../src/attachments/nativeImageInput.js";
import { resolveRequestSources } from "../src/llm/request/requestSources.js";
import type { EvidenceEvent } from "../src/types.js";
import { sha256Hex } from "../src/utils/hash.js";
import { wavBytes } from "./fixtures/nativeSignedAudio.js";

const be16 = (value: number) => { const out = Buffer.alloc(2); out.writeUInt16BE(value); return out; };
const segment = (marker: number, body: Buffer) => Buffer.concat([Buffer.from([0xff, marker]), be16(body.length + 2), body]);
/** EXIF with a GPS IFD (tag 0x8825) holding GPSLatitude 37/1 46/1 3000/100. */
const GPS_TIFF = Buffer.concat([Buffer.from("MM\0*\0\0\0\x08", "latin1"),
  Buffer.from("000188250004000000010000001a" + "00000000", "hex"), // IFD0: GPS IFD pointer at 26, no next IFD
  Buffer.from("000100020005000000030000002c" + "00000000", "hex"), // GPS IFD: latitude rationals at 44
  Buffer.from("00000025000000010000002e0000000100000bb800000064", "hex")]);
const APP0 = segment(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1"));
const APP1 = segment(0xe1, Buffer.concat([Buffer.from("Exif\0\0", "latin1"), GPS_TIFF]));
const XMP = segment(0xe1, Buffer.from("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>creator-secret</x:xmpmeta>", "latin1"));
const APP13 = segment(0xed, Buffer.from("Photoshop 3.0\x008BIM\x04\x04\0\0\0\0\0\x08iptc-secret", "latin1"));
const APP14 = segment(0xee, Buffer.from("Adobe\0\x64\0\0\0\0\x01", "latin1"));
const COM = segment(0xfe, Buffer.from("comment-secret", "latin1"));
const DQT = segment(0xdb, Buffer.concat([Buffer.from([0]), Buffer.alloc(64, 1)]));
const SOF0 = segment(0xc0, Buffer.from([8, 0, 1, 0, 1, 1, 1, 0x11, 0]));
const DHT = segment(0xc4, Buffer.concat([Buffer.from([0, 1]), Buffer.alloc(15), Buffer.from([0])]));
const SCAN = Buffer.concat([segment(0xda, Buffer.from([1, 1, 0, 0, 63, 0])), Buffer.from([0x00, 0xff, 0x00, 0x3f, 0xff, 0xd9])]);
const SOI = Buffer.from([0xff, 0xd8]);
const JPEG = Buffer.concat([SOI, APP0, APP1, XMP, APP13, APP14, COM, DQT, SOF0, DHT, SCAN]);
const CLEAN_JPEG = Buffer.concat([SOI, APP0, APP14, DQT, SOF0, DHT, SCAN]);

const pngChunk = (type: string, data: Buffer) => {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]), crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([be16(0), be16(data.length), body, crc]);
};
const PNG_SIG = Buffer.from("89504e470d0a1a0a", "hex");
const IHDR = pngChunk("IHDR", Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 0, 0, 0, 0]));
const IDAT = pngChunk("IDAT", deflateSync(Buffer.from([0, 0x80])));
const IEND = pngChunk("IEND", Buffer.alloc(0));
const TEXT = pngChunk("tEXt", Buffer.from("GPS\0lat=37.7749 lon=-122.4194", "latin1"));
const PNG = Buffer.concat([PNG_SIG, IHDR, TEXT, pngChunk("eXIf", GPS_TIFF), pngChunk("tIME", Buffer.from([7, 234, 10, 31, 12, 0, 0])),
  pngChunk("zTXt", Buffer.from("k\0\0x", "latin1")), pngChunk("iTXt", Buffer.from("k\0\0\0\0\0v", "latin1")), IDAT, IEND]);
const CLEAN_PNG = Buffer.concat([PNG_SIG, IHDR, IDAT, IEND]);

const riffChunk = (fourcc: string, data: Buffer) => {
  const size = Buffer.alloc(4); size.writeUInt32LE(data.length);
  return Buffer.concat([Buffer.from(fourcc, "latin1"), size, data, Buffer.alloc(data.length & 1)]);
};
const riff = (...chunks: Buffer[]) => {
  const body = Buffer.concat([Buffer.from("WEBP", "latin1"), ...chunks]), size = Buffer.alloc(4);
  size.writeUInt32LE(body.length);
  return Buffer.concat([Buffer.from("RIFF", "latin1"), size, body]);
};
const vp8x = (flags: number) => riffChunk("VP8X", Buffer.from([flags, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
const VP8L = riffChunk("VP8L", Buffer.from([0x2f, 0, 0, 0, 0]));
const WEBP = riff(vp8x(0x0c), VP8L, riffChunk("EXIF", Buffer.concat([GPS_TIFF, Buffer.from([1])])), riffChunk("XMP ", Buffer.from("<x:xmpmeta/>")));
const CLEAN_WEBP = riff(vp8x(0), VP8L);

const GIF_BASE = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
const NETSCAPE = Buffer.concat([Buffer.from([0x21, 0xff, 11]), Buffer.from("NETSCAPE2.0", "latin1"), Buffer.from([3, 1, 0, 0, 0])]);
const GIF_XMP = Buffer.concat([Buffer.from([0x21, 0xff, 11]), Buffer.from("XMP DataXMP", "latin1"), Buffer.from([5]), Buffer.from("<x:x>"), Buffer.from([0])]);
const GIF_COMMENT = Buffer.concat([Buffer.from([0x21, 0xfe, 6]), Buffer.from("secret", "latin1"), Buffer.from([0])]);
const GCE = Buffer.from([0x21, 0xf9, 4, 0, 0, 0, 0, 0]);
const gif = (...blocks: Buffer[]) => Buffer.concat([GIF_BASE.subarray(0, 19), ...blocks, GIF_BASE.subarray(19)]);
const GIF = gif(NETSCAPE, GIF_XMP, GIF_COMMENT, GCE);
const CLEAN_GIF = gif(NETSCAPE, GCE);

const CASES = [
  { mediaType: "image/jpeg", filename: "photo.jpg", bytes: JPEG, clean: CLEAN_JPEG },
  { mediaType: "image/png", filename: "photo.png", bytes: PNG, clean: CLEAN_PNG },
  { mediaType: "image/webp", filename: "photo.webp", bytes: WEBP, clean: CLEAN_WEBP },
  { mediaType: "image/gif", filename: "photo.gif", bytes: GIF, clean: CLEAN_GIF }
] as const;
const SECRETS = ["Exif", "creator-secret", "iptc-secret", "comment-secret", "lat=37.7749", "XMP", "secret"];
const refusal = (fn: () => unknown) => { try { fn(); } catch (error) { return error; } throw new Error("expected a refusal"); };

describe("image metadata stripping", () => {
  test.each(CASES)("$mediaType: metadata is removed and the image keeps its type", ({ mediaType, bytes, clean }) => {
    expect(nativeImageMediaType(bytes)).toBe(mediaType);
    const stripped = stripNativeImageMetadata(bytes, mediaType);
    expect(stripped.equals(clean)).toBe(true);
    expect(nativeImageMediaType(stripped)).toBe(mediaType);
    for (const secret of SECRETS) expect(stripped.includes(secret)).toBe(false);
    expect(stripped.includes(GPS_TIFF)).toBe(false);
    expect(stripNativeImageMetadata(stripped, mediaType).equals(stripped)).toBe(true);
  });

  test.each(CASES)("$mediaType: a truncated container is refused, never passed through", ({ mediaType, bytes }) => {
    for (const cut of [1, 3, 9]) {
      const error = refusal(() => stripNativeImageMetadata(bytes.subarray(0, bytes.length - cut), mediaType));
      expect(error).toBeInstanceOf(ImageMetadataStripError);
      expect((error as ImageMetadataStripError).reason).toBe("malformed-container");
    }
  });

  test("each parser guard refuses its malformed shape with a typed reason", () => {
    const malformed = (bytes: Buffer, mediaType: string) => (refusal(() => stripNativeImageMetadata(bytes, mediaType)) as ImageMetadataStripError).reason;
    expect(malformed(CLEAN_PNG, "image/bmp")).toBe("unsupported-format");
    // JPEG: no frame header before the scan; a segment length past the end; a scan-only marker before SOS.
    expect(malformed(Buffer.concat([SOI, APP0, DQT, SCAN]), "image/jpeg")).toBe("malformed-container");
    expect(malformed(Buffer.concat([SOI, Buffer.from([0xff, 0xe1, 0xff, 0xff]), APP0, SOF0, SCAN]), "image/jpeg")).toBe("malformed-container");
    expect(malformed(Buffer.concat([SOI, Buffer.from([0xff, 0xd0, 0, 2]), SOF0, SCAN]), "image/jpeg")).toBe("malformed-container");
    // PNG: a kept chunk with a bad CRC; bytes after IEND; IHDR not first.
    const badCrc = Buffer.from(IHDR); badCrc[badCrc.length - 1] ^= 1;
    expect(malformed(Buffer.concat([PNG_SIG, badCrc, IDAT, IEND]), "image/png")).toBe("malformed-container");
    expect(malformed(Buffer.concat([CLEAN_PNG, TEXT]), "image/png")).toBe("malformed-container");
    expect(malformed(Buffer.concat([PNG_SIG, IHDR, IHDR, IDAT, IEND]), "image/png")).toBe("malformed-container");
    // WebP: a chunk outside the declared RIFF size; a chunk size past the RIFF end; VP8X not first.
    expect(malformed(Buffer.concat([CLEAN_WEBP, riffChunk("JUNK", Buffer.alloc(0))]), "image/webp")).toBe("malformed-container");
    const longChunk = Buffer.from(CLEAN_WEBP); longChunk.writeUInt32LE(0xff, 16);
    expect(malformed(longChunk, "image/webp")).toBe("malformed-container");
    expect(malformed(riff(VP8L, vp8x(0)), "image/webp")).toBe("malformed-container");
    // GIF: an unknown block; bytes after the trailer; sub-blocks with no terminator.
    expect(malformed(gif(Buffer.from([0x99])), "image/gif")).toBe("malformed-container");
    expect(malformed(Buffer.concat([CLEAN_GIF, Buffer.from([0x3b])]), "image/gif")).toBe("malformed-container");
    expect(malformed(Buffer.concat([GIF_BASE.subarray(0, 19), Buffer.from([0x21, 0xfe, 9, 0x41]), Buffer.from([0x3b])]), "image/gif")).toBe("malformed-container");
  });
});

describe("PXB-42 review: every scan is walked and unknown chunks are dropped", () => {
  const SCAN2 = Buffer.concat([segment(0xda, Buffer.from([1, 1, 0, 0, 63, 0])), Buffer.from([0x12, 0xff, 0xd0, 0x34])]);
  const progressive = (between: Buffer) => Buffer.concat([SOI, APP0, DQT, SOF0, DHT, SCAN2, between, DHT, SCAN]);

  test("JPEG: APPn and COM segments between progressive scans are dropped", () => {
    const stripped = stripNativeImageMetadata(progressive(Buffer.concat([COM, APP1])), "image/jpeg");
    expect(stripped.equals(progressive(Buffer.alloc(0)))).toBe(true);
    for (const secret of ["comment-secret", "Exif"]) expect(stripped.includes(secret)).toBe(false);
  });

  test("JPEG: bytes after EOI (an appended MPF image with Exif GPS) are not sent", () => {
    const appended = Buffer.concat([SOI, APP1, DQT, SOF0, DHT, SCAN]);
    const stripped = stripNativeImageMetadata(Buffer.concat([CLEAN_JPEG, appended]), "image/jpeg");
    expect(stripped.equals(CLEAN_JPEG)).toBe(true);
    expect(stripped.includes(GPS_TIFF)).toBe(false);
  });

  test("JPEG: a scan with no EOI is refused", () => {
    const error = refusal(() => stripNativeImageMetadata(Buffer.concat([SOI, APP0, DQT, SOF0, DHT, SCAN2]), "image/jpeg"));
    expect((error as ImageMetadataStripError).reason).toBe("malformed-container");
  });

  test("PNG: an unknown ancillary chunk is dropped and an unknown critical chunk is refused", () => {
    const withPrivate = Buffer.concat([PNG_SIG, IHDR, pngChunk("prVt", Buffer.from("owner-secret")), pngChunk("pHYs", Buffer.alloc(9)), IDAT, IEND]);
    expect(stripNativeImageMetadata(withPrivate, "image/png").equals(Buffer.concat([PNG_SIG, IHDR, pngChunk("pHYs", Buffer.alloc(9)), IDAT, IEND]))).toBe(true);
    const critical = Buffer.concat([PNG_SIG, IHDR, pngChunk("ZZZZ", Buffer.alloc(1)), IDAT, IEND]);
    expect((refusal(() => stripNativeImageMetadata(critical, "image/png")) as ImageMetadataStripError).reason).toBe("malformed-container");
  });

  test("WebP: an unknown chunk is dropped", () => {
    const stripped = stripNativeImageMetadata(riff(vp8x(0), VP8L, riffChunk("META", Buffer.from("owner-secret"))), "image/webp");
    expect(stripped.equals(CLEAN_WEBP)).toBe(true);
  });

  test("GIF: a plain-text extension is dropped", () => {
    const plainText = Buffer.concat([Buffer.from([0x21, 0x01, 12]), Buffer.alloc(12), Buffer.from([12]), Buffer.from("owner-secret"), Buffer.from([0])]);
    expect(stripNativeImageMetadata(gif(NETSCAPE, plainText, GCE), "image/gif").equals(CLEAN_GIF)).toBe(true);
  });
});

const roots: string[] = [], writers = new Set<SessionService>();
afterEach(() => {
  for (const writer of writers) writer.disposeWithoutClosing();
  writers.clear();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function opened() {
  const root = mkdtempSync(join(tmpdir(), "amc-image-metadata-")); roots.push(root);
  initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
  const writer = new SessionService(root); writers.add(writer);
  writer.open({ agentId: "default", harnessVersion: "metadata-fixture", compositionDigest: "metadata-fixture", policyDigest: "metadata-fixture" });
  const system = writer.recordSystemPrompt("Describe the attached images; fixture, not a model claim.");
  return { root, writer, system };
}
function requestImages(root: string, systemPromptEventId: string, events: readonly EvidenceEvent[]) {
  const result = resolveRequestSources({ workspace: root, events, model: "fixture-model", params: { max_tokens: 64 }, systemPromptEventId,
    toolSchemaEventId: null, toolSchemaSha256: null, projectionCutoffEventId: events[events.length - 1]!.id });
  expect(result.failure).toBeNull();
  return result.request!.messages.flatMap(message => message.parts).flatMap(part => part.kind === "image" ? [{ ...part, bytes: part.bytes ?? Buffer.alloc(0) }] : []); // missing bytes fail the equality checks
}
const withMeta = (events: readonly EvidenceEvent[], id: string, edit: (meta: Record<string, unknown>) => void) => events.map(row => {
  if (row.id !== id) return row;
  const meta = JSON.parse(row.meta_json) as Record<string, unknown>; edit(meta);
  return { ...row, meta_json: JSON.stringify(meta) };
});

describe("the attachment row a provider request reads", () => {
  test("holds stripped bytes and records the source and sent digests for every format", () => {
    const { root, writer, system } = opened();
    writer.startTurn({ trigger: "user" }); writer.startStep();
    for (const { filename, bytes } of CASES) expect(ingestAttachment({ session: writer, filename, content: bytes })).toMatchObject({ ok: true });
    const events = writer.readEvents(), rows = events.filter(row => row.event_type === "user/attachment");
    expect(rows).toHaveLength(CASES.length);
    rows.forEach((row, index) => {
      const { bytes, clean } = CASES[index]!;
      expect(JSON.parse(row.meta_json)).toMatchObject({ bytes: clean.length, sourceSha256: sha256Hex(bytes), sentSha256: sha256Hex(clean) });
      expect(row.payload_sha256).toBe(sha256Hex(clean));
    });
    const sent = requestImages(root, system.eventId, events);
    expect(sent.map(part => part.mediaType)).toEqual(CASES.map(item => item.mediaType));
    sent.forEach((part, index) => {
      expect(part.bytes.equals(CASES[index]!.clean)).toBe(true);
      expect(part.sha256).toBe(sha256Hex(CASES[index]!.clean));
      for (const secret of SECRETS) expect(part.bytes.includes(secret)).toBe(false);
    });
  });

  test("a malformed image is refused at the row with nothing recorded", () => {
    const { writer } = opened();
    writer.startTurn({ trigger: "user" }); writer.startStep();
    const before = writer.readEvents().length;
    const truncated = Buffer.concat([SOI, APP1, APP0, Buffer.from([0xff, 0xd9])]);
    expect(refusal(() => writer.recordUserAttachment({ filename: "broken.jpg", content: truncated, mimeType: "image/jpeg", kind: "image" })))
      .toBeInstanceOf(ImageMetadataStripError);
    expect(ingestAttachment({ session: writer, filename: "broken.jpg", content: truncated })).toMatchObject({ ok: false, reason: expect.stringMatching(/malformed-container/) });
    expect(writer.readEvents()).toHaveLength(before);
  });

  test("ordered input keeps the original signed in the inbox and its projected rows still verify against it", () => {
    const { root, writer, system } = opened();
    const inbox = new LoopInbox(writer, () => {});
    inbox.insert("next-turn", "", "followup", { wake: false, demotedFrom: null, parts: [
      { type: "text", text: "Where was this taken?" }, { type: "image", image: { filename: "photo.jpg", mediaType: "image/jpeg", bytes: JPEG } },
      { type: "image", image: { filename: "photo.png", mediaType: "image/png", bytes: PNG } }] });
    writer.startTurn({ trigger: "user" }); writer.startStep();
    const [claimed] = inbox.claim("next-turn");
    recordNativeOrderedMessage(writer, claimed!);
    const events = writer.readEvents();
    expect(() => validateAcpOrderedHistory(root, events)).not.toThrow();
    expect(requestImages(root, system.eventId, events).map(part => part.bytes.toString("hex"))).toEqual([CLEAN_JPEG, CLEAN_PNG].map(bytes => bytes.toString("hex")));
    // A row without its source digest must equal the source byte for byte; a forged source digest is refused too.
    const image = events.find(row => row.event_type === "user/attachment")!;
    const reason = (edit: (meta: Record<string, unknown>) => void) => (refusal(() => validateAcpOrderedHistory(root, withMeta(events, image.id, edit))) as AcpFailure).acpData;
    expect(reason(meta => { delete meta.sourceSha256; })).toEqual({ reason: "ordered-image-rewritten" });
    expect(reason(meta => { meta.sourceSha256 = sha256Hex(CLEAN_JPEG); })).toEqual({ reason: "ordered-image-rewritten" });
  });

  test("a row recorded before stripping (no source digest) still verifies when it equals its source byte for byte", () => {
    const { root, writer } = opened();
    const inbox = new LoopInbox(writer, () => {});
    inbox.insert("next-turn", "", "followup", { wake: false, demotedFrom: null, parts: [
      { type: "text", text: "Already clean." }, { type: "image", image: { filename: "clean.jpg", mediaType: "image/jpeg", bytes: CLEAN_JPEG } }] });
    writer.startTurn({ trigger: "user" }); writer.startStep();
    const [claimed] = inbox.claim("next-turn");
    recordNativeOrderedMessage(writer, claimed!);
    const events = writer.readEvents(), image = events.find(row => row.event_type === "user/attachment")!;
    expect(() => validateAcpOrderedHistory(root, withMeta(events, image.id, meta => { delete meta.sourceSha256; delete meta.sentSha256; }))).not.toThrow();
  });

  test("an audio bundle's image rows verify against the original image the same way", () => {
    const { root, writer } = opened();
    const inbox = new LoopInbox(writer, () => {});
    inbox.insert("next-turn", "", "followup", { wake: false, demotedFrom: null, audioParts: [
      { type: "text", text: "Listen, then look." }, { type: "audio", audio: { filename: "original.wav", mediaType: "audio/wav", bytes: wavBytes() } },
      { type: "image", image: { filename: "photo.webp", mediaType: "image/webp", bytes: WEBP } }] });
    writer.startTurn({ trigger: "user" }); writer.startStep();
    const [claimed] = inbox.claim("next-turn");
    recordNativeAudioMessage(writer, claimed!);
    const events = writer.readEvents();
    expect(() => validateNativeAudioProvenance(root, events)).not.toThrow();
    const image = events.find(row => row.event_type === "user/attachment" && JSON.parse(row.meta_json).mimeType === "image/webp")!;
    expect(JSON.parse(image.meta_json)).toMatchObject({ bytes: CLEAN_WEBP.length, sourceSha256: sha256Hex(WEBP) });
    expect(() => validateNativeAudioProvenance(root, withMeta(events, image.id, meta => { delete meta.sourceSha256; }))).toThrow(/original binary/);
  });
});
