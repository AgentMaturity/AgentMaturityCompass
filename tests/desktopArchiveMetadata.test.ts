import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import YAML from "yaml";
import { assertNoAppleMetadata } from "../scripts/lib/tar-metadata.mjs";
import { read } from "./helpers/deployPackFixtures.js";

// Fixtures are written here, header by header: a host tar on macOS can itself add the metadata under test (D6).
function header(name: string, size: number, type: string): Buffer {
  const block = Buffer.alloc(512);
  block.write(name, 0, 100, "utf8");
  block.write("0000644\0", 100);
  block.write("0001750\0", 108);
  block.write("0001750\0", 116);
  block.write(`${size.toString(8).padStart(11, "0")}\0`, 124);
  block.write("00000000000\0", 136);
  block.write("        ", 148);
  block.write(type, 156);
  block.write("ustar\0", 257);
  block.write("00", 263);
  const checksum = block.reduce((sum, byte) => sum + byte, 0);
  block.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148);
  return block;
}
const entry = (name: string, body: string, type = "0") => {
  const bytes = Buffer.from(body, "utf8");
  return [header(name, bytes.length, type), bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512)];
};
/** One pax record: "<length> key=value\n", where the length counts its own digits. */
function paxRecord(key: string, value: string): string {
  const content = ` ${key}=${value}\n`;
  let length = content.length + 1;
  while (String(length).length + content.length !== length) length += 1;
  return `${length}${content}`;
}
const dir = mkdtempSync(join(tmpdir(), "amc-archive-metadata-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
function archive(name: string, ...entries: Buffer[][]): string {
  const path = join(dir, name);
  writeFileSync(path, gzipSync(Buffer.concat([...entries.flat(), Buffer.alloc(1024)])));
  return path;
}
const root = "amc-1.2.0-linux-x64";
const clean = () => [entry(`${root}/`, "", "5"), entry(`${root}/install.sh`, "#!/usr/bin/env sh\n")];

describe("Linux archives carry no macOS metadata (LIVE-DEPLOY-06, D6)", () => {
  it("passes a clean archive", () => {
    expect(() => assertNoAppleMetadata(archive("clean.tar.gz", ...clean()))).not.toThrow();
  });

  it("names a root-level AppleDouble entry, which the hosted installer's prefix check would refuse", () => {
    const path = archive("appledouble.tar.gz", entry("._amc-x", "\0\u0005\u0016\u0007"), ...clean());
    expect(() => assertNoAppleMetadata(path)).toThrow(/AppleDouble entry \._amc-x/);
    const nested = archive("nested.tar.gz", ...clean(), entry(`${root}/._install.sh`, "x"));
    expect(() => assertNoAppleMetadata(nested)).toThrow(new RegExp(`AppleDouble entry ${root}/\\._install\\.sh`));
  });

  it("names the entry a pax header gives extended attributes, and reads pax paths", () => {
    const xattr = entry("PaxHeader/install.sh", paxRecord("LIBARCHIVE.xattr.com.apple.provenance", "AQIAvx6SLjkPP1M="), "x");
    const path = archive("provenance.tar.gz", entry(`${root}/`, "", "5"), xattr, entry(`${root}/install.sh`, "#!/usr/bin/env sh\n"));
    expect(() => assertNoAppleMetadata(path)).toThrow(new RegExp(`extended attributes \\(LIBARCHIVE\\.xattr\\.com\\.apple\\.provenance\\) on ${root}/install\\.sh`));
    const schily = archive("schily.tar.gz", entry("PaxHeader/x", paxRecord("SCHILY.xattr.user.test", "1"), "x"), entry(`${root}/a`, "a"));
    expect(() => assertNoAppleMetadata(schily)).toThrow(/SCHILY\.xattr\.user\.test/);
    // A long name carried by a pax path record is the name that is checked.
    const longName = archive("long.tar.gz", entry("PaxHeader/long", paxRecord("path", `${root}/${"d/".repeat(60)}._shadow`), "x"), entry("short", "s"));
    expect(() => assertNoAppleMetadata(longName)).toThrow(/AppleDouble entry .*\/\._shadow/);
  });

  it("packages Linux archives without macOS metadata on the macos-15 release runner", () => {
    const tarCall = /run\("tar", \[[^\n]*\n?[^\n]*\);/.exec(read("scripts/package-desktop-installers.mjs"))?.[0] ?? "";
    expect(tarCall).toContain('"--no-mac-metadata", "--no-xattrs"');
    expect(tarCall).toContain('COPYFILE_DISABLE: "1"');
    expect(read("scripts/verify-desktop-installers.mjs")).toContain("assertNoAppleMetadata(archivePath)");
    const release = YAML.parse(read(".github/workflows/release.yml"));
    const packaging = Object.values(release.jobs as Record<string, { "runs-on"?: string; steps?: { run?: string }[] }>)
      .find((job) => job.steps?.some((step) => /package:desktop(?!:)/.test(step.run ?? "")));
    expect(packaging?.["runs-on"]).toBe("macos-15");
  });
});
