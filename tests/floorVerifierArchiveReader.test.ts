/**
 * The standalone verifier's tar.gz reader on archives built byte by byte here (no system tar, so the same bytes on
 * every platform): pax and GNU long names, ustar prefixes, skipped links, folders and AppleDouble members, and each
 * refusal (not gzip, a non-octal size, a member past the end, a name outside the archive, a duplicate, too many members).
 */
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, test } from "vitest";
import { ARCHIVE_LIMITS, isGzip, readTarGz, rootedAt } from "../packages/verifier/src/archive.js";

interface Entry { name: string; data?: string | Buffer; type?: string; prefix?: string; size?: string }

function header(entry: Entry, size: number): Buffer {
  const block = Buffer.alloc(512);
  block.write(entry.name, 0, 100, "utf8");
  block.write("0000644\0", 100, "ascii");
  block.write(entry.size ?? `${size.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
  block.write(entry.type ?? "0", 156, 1, "ascii");
  block.write("ustar\0" + "00", 257, "ascii");
  if (entry.prefix) block.write(entry.prefix, 345, 155, "utf8");
  return block;
}

function tar(entries: Entry[], end = true): Buffer {
  const parts: Buffer[] = [];
  for (const entry of entries) {
    const data = Buffer.from(entry.data ?? "");
    parts.push(header(entry, data.length), data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  if (end) parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}
const tgz = (entries: Entry[], end = true) => gzipSync(tar(entries, end));
const pax = (records: string[]) => records.map(record => {
  let length = record.length + 3;
  while (`${length} ${record}\n`.length !== length) length += 1;
  return `${length} ${record}\n`;
}).join("");
const text = (archive: ReturnType<typeof readTarGz>) => Object.fromEntries([...archive.members].map(([name, data]) => [name, data.toString("utf8")]));

const defaultMembers = ARCHIVE_LIMITS.members;
afterEach(() => { ARCHIVE_LIMITS.members = defaultMembers; });

describe("isGzip", () => {
  test("needs the two gzip magic bytes and more than two bytes", () => {
    expect(isGzip(tgz([{ name: "a.txt", data: "a" }]))).toBe(true);
    expect(isGzip(Uint8Array.from([0x1f, 0x8b]))).toBe(false);
    expect(isGzip(Uint8Array.from([0x1f, 0x00, 0x00]))).toBe(false);
    expect(isGzip(Uint8Array.from([0x00, 0x8b, 0x00]))).toBe(false);
  });
});

describe("readTarGz", () => {
  test("reads regular files, strips ./, joins a ustar prefix and skips folders, links and AppleDouble members", () => {
    const archive = readTarGz(tgz([
      { name: "./amc-passport/", type: "5" },
      { name: "./amc-passport/passport.json", data: "{\"v\":1}" },
      { name: "passport.sig", prefix: "amc-passport", data: "sig" },
      { name: "amc-passport/link", type: "2" },
      { name: "amc-passport/._passport.json", data: "attributes" },
      { name: "nul-type", type: "\0", data: "old tar" },
      { name: "global", type: "g", data: pax(["comment=ignored"]) }
    ]));
    expect(text(archive)).toEqual({ "amc-passport/passport.json": "{\"v\":1}", "amc-passport/passport.sig": "sig", "nul-type": "old tar" });
    expect(archive.appleDouble).toBe(1);
  });

  test("honours a pax path and a GNU long name for the next member only", () => {
    const long = `${"d".repeat(120)}/member.txt`;
    const archive = readTarGz(tgz([
      { name: "PaxHeader", type: "x", data: pax(["mtime=1", `path=${long}`]) },
      { name: "short-ignored", data: "from pax" },
      { name: "././@LongLink", type: "L", data: "gnu/long-name.txt\0" },
      { name: "short-ignored-2", data: "from gnu" },
      { name: "plain.txt", data: "plain" }
    ]));
    expect(text(archive)).toEqual({ [long]: "from pax", "gnu/long-name.txt": "from gnu", "plain.txt": "plain" });
  });

  test("a pax header without a path record leaves the header name in force", () => {
    expect([...readTarGz(tgz([{ name: "PaxHeader", type: "x", data: pax(["mtime=1"]) }, { name: "kept.txt", data: "k" }])).members.keys()]).toEqual(["kept.txt"]);
  });

  test("reads an archive with no end-of-archive blocks", () => {
    expect(text(readTarGz(tgz([{ name: "only.txt", data: "x" }], false)))).toEqual({ "only.txt": "x" });
  });

  test("refuses bytes that are not gzip", () => {
    expect(() => readTarGz(Buffer.from("plain text, not an archive"))).toThrow(/^not a readable gzip archive within 512 MiB \(/);
  });

  test("refuses a size that is not octal", () => {
    expect(() => readTarGz(tgz([{ name: "a.txt", data: "a", size: "12x\0" }]))).toThrow("a tar header has a size that is not octal");
  });

  test("refuses a member whose data runs past the end of the archive", () => {
    const whole = tar([{ name: "a.txt", data: "a".repeat(1000) }], false);
    expect(() => readTarGz(gzipSync(whole.subarray(0, 1024)))).toThrow("the archive ends inside a member");
  });

  test("refuses a malformed pax header", () => {
    expect(() => readTarGz(tgz([{ name: "PaxHeader", type: "x", data: "zero path=a\n" }, { name: "a.txt", data: "a" }]))).toThrow("a pax header is malformed");
  });

  test("refuses absolute names and .. segments", () => {
    expect(() => readTarGz(tgz([{ name: "/etc/passwd", data: "x" }]))).toThrow("the archive member \"/etc/passwd\" points outside the archive");
    expect(() => readTarGz(tgz([{ name: "a/../../b", data: "x" }]))).toThrow(/points outside the archive/);
  });

  test("refuses a name that appears twice", () => {
    expect(() => readTarGz(tgz([{ name: "passport.json", data: "1" }, { name: "./passport.json", data: "2" }]))).toThrow("the archive holds passport.json twice");
  });

  test("refuses more members than the limit", () => {
    ARCHIVE_LIMITS.members = 2;
    expect(() => readTarGz(tgz([{ name: "a", data: "1" }, { name: "b", data: "2" }, { name: "c", data: "3" }]))).toThrow("more than 2 archive members");
  });
});

describe("rootedAt", () => {
  test("keys members below the top folder, falls back to the root, and is null without the marker", () => {
    const foldered = readTarGz(tgz([{ name: "amc-passport/passport.json", data: "p" }, { name: "amc-passport/x/y.txt", data: "y" }, { name: "other.txt", data: "o" }]));
    expect(Object.fromEntries([...rootedAt(foldered, "amc-passport", "passport.json")!].map(([k, v]) => [k, v.toString()]))).toEqual({ "passport.json": "p", "x/y.txt": "y" });
    const flat = readTarGz(tgz([{ name: "passport.json", data: "p" }, { name: "sig", data: "s" }]));
    expect([...rootedAt(flat, "amc-passport", "passport.json")!.keys()].sort()).toEqual(["passport.json", "sig"]);
    expect(rootedAt(flat, "amc-passport", "manifest.json")).toBeNull();
  });
});
