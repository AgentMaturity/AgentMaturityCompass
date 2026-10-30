import { readFileSync } from "node:fs";
import { constants, zstdCompressSync } from "node:zlib";
import { afterEach, describe, expect, test, vi } from "vitest";
import { decodeDshSessionFrames } from "../src/importers/dshSessionFrames.js";
import { DSH_IMPORT_LIMITS } from "../src/importers/dshSessionContract.js";
import { SourceFormatError } from "../src/importers/sourceFormatError.js";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/dsh-v4/frame-${name}`, import.meta.url));
const plaintext = fixture("concatenated.jsonl").toString();
const header = plaintext.slice(0, plaintext.indexOf("\n") + 1);
const event = plaintext.slice(header.length);
const frame = (text: string | Buffer, checksum = true) => zstdCompressSync(text, { params: { [constants.ZSTD_c_checksumFlag]: checksum ? 1 : 0 } });
const stream = (...texts: Array<string | Buffer>) => Buffer.concat(texts.map(text => frame(text)));

afterEach(() => { vi.doUnmock("node:zlib"); vi.doUnmock("../src/importers/dshSessionContract.js"); vi.resetModules(); });

describe("pinned DSH v4 compressed frame import", () => {
  test("reads separate checksummed header and event frames from the offline compatibility fixture", () => {
    expect(decodeDshSessionFrames(fixture("concatenated.jsonl.zstd"))).toBe(plaintext);
  });

  test.each([0, 1, 2, 4, 5, 7])("refuses an incomplete first frame of %i bytes", length => {
    expect(() => decodeDshSessionFrames(frame(header).subarray(0, length))).toThrow(SourceFormatError);
  });

  test("refuses a missing checksum byte instead of recovering a prefix", () => {
    expect(() => decodeDshSessionFrames(Buffer.concat([frame(header), frame(event).subarray(0, -1)]))).toThrow(/incomplete/);
  });

  test("refuses corruption in a middle frame and never returns a clean suffix", () => {
    const corrupt = frame(event);
    corrupt[corrupt.length - 1] = corrupt[corrupt.length - 1]! ^ 0xFF;
    expect(() => decodeDshSessionFrames(Buffer.concat([frame(header), corrupt, frame(event)]))).toThrow(/checksum|validation/);
  });

  test("requires a checksum on every frame", () => {
    expect(() => decodeDshSessionFrames(Buffer.concat([frame(header), frame(event, false)]))).toThrow(/checksum/);
  });

  test("refuses invalid frame magic", () => {
    const invalid = frame(event); invalid[0] = 0;
    expect(() => decodeDshSessionFrames(Buffer.concat([frame(header), invalid]))).toThrow(/magic/);
  });

  test("refuses reserved frame descriptor bits", () => {
    const invalid = frame(header); invalid[4] = invalid[4]! | 0x08;
    expect(() => decodeDshSessionFrames(invalid)).toThrow(/reserved/);
  });

  test("refuses a reserved block type", () => {
    // Single-segment frame with one-byte content size, followed by reserved block type.
    const invalid = Buffer.from([0x28, 0xB5, 0x2F, 0xFD, 0x24, 0, 7, 0, 0, 0, 0, 0, 0]);
    expect(() => decodeDshSessionFrames(invalid)).toThrow(/reserved/);
  });

  test("requires the header to occupy its own complete frame", () => {
    expect(() => decodeDshSessionFrames(frame(plaintext))).toThrow(/header frame/);
  });

  test("refuses a frame containing an unterminated JSONL record", () => {
    expect(() => decodeDshSessionFrames(stream(header, event.trimEnd()))).toThrow(/newline/);
  });

  test("refuses malformed UTF-8 instead of replacing source bytes", () => {
    expect(() => decodeDshSessionFrames(stream(header, Buffer.from([0xFF, 0x0A])))).toThrow(/UTF-8/);
  });

  test("bounds compressed input before any frame parsing", () => {
    expect(() => decodeDshSessionFrames(Buffer.alloc(DSH_IMPORT_LIMITS.bytes + 1))).toThrow(/32 MiB/);
  });

  test("bounds decoded line bytes", () => {
    expect(() => decodeDshSessionFrames(stream(header, "x".repeat(DSH_IMPORT_LIMITS.lineBytes + 1) + "\n"))).toThrow(/4 MiB/);
  });

  test("bounds expanded document bytes before materializing a decompression bomb", async () => {
    vi.doMock("../src/importers/dshSessionContract.js", async importOriginal => {
      const actual = await importOriginal<typeof import("../src/importers/dshSessionContract.js")>();
      return { ...actual, DSH_IMPORT_LIMITS: { ...actual.DSH_IMPORT_LIMITS, bytes: 512 } };
    });
    const { decodeDshSessionFrames: bounded } = await import("../src/importers/dshSessionFrames.js");
    expect(() => bounded(stream(header, "x".repeat(600) + "\n"))).toThrow(/validation|limit/);
  });

  test("bounds native decoder window memory independently of output size", () => {
    const wideWindow = frame(header);
    // Convert the small single-segment frame to an unknown-size frame with a 64 MiB window.
    wideWindow[4] = 0x04; wideWindow[5] = 0x80;
    expect(() => decodeDshSessionFrames(wideWindow)).toThrow(/validation|limit/);
  });

  test("bounds empty event frames independently of nonempty record count", async () => {
    vi.doMock("../src/importers/dshSessionContract.js", async importOriginal => {
      const actual = await importOriginal<typeof import("../src/importers/dshSessionContract.js")>();
      return { ...actual, DSH_IMPORT_LIMITS: { ...actual.DSH_IMPORT_LIMITS, events: 2 } };
    });
    const { decodeDshSessionFrames: bounded } = await import("../src/importers/dshSessionFrames.js");
    expect(() => bounded(stream(header, "\n", "\n", "\n"))).toThrow(/event frames/);
  });

  test("bounds event records independently of compressed size", () => {
    expect(() => decodeDshSessionFrames(stream(header, "{}\n".repeat(DSH_IMPORT_LIMITS.events + 1)))).toThrow(/events/);
  });

  test("refuses a runtime without native zstd with a bounded typed reason", async () => {
    vi.doMock("node:zlib", () => ({ zstdDecompressSync: undefined }));
    const { decodeDshSessionFrames: unsupported } = await import("../src/importers/dshSessionFrames.js");
    expect(() => unsupported(fixture("concatenated.jsonl.zstd"))).toThrow(/native Zstandard/);
    try { unsupported(fixture("concatenated.jsonl.zstd")); } catch (error) {
      expect(error).toMatchObject({ code: "DSH_ZSTD_UNAVAILABLE", format: "dsh-session", detectedVersion: 4 });
    }
  });
});
