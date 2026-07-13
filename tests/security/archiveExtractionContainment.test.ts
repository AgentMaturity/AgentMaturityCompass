import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";
import { verifyPassportArtifactFile } from "../../src/passport/passportVerifier.js";
import { verifyPluginPackage } from "../../src/plugins/pluginPackage.js";
import { inspectTarGzipArchive } from "../../src/security/safeTarArchive.js";

const roots: string[] = [];

function root(): string {
  const path = mkdtempSync(join(tmpdir(), "amc-safe-tar-"));
  roots.push(path);
  return path;
}

function createArchive(source: string, member: string, output: string): void {
  const result = spawnSync("tar", ["-czf", output, "-C", source, member], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${result.stdout ?? ""}${result.stderr ?? ""}`);
  }
}

afterEach(() => {
  while (roots.length > 0) {
    const path = roots.pop();
    if (path) rmSync(path, { recursive: true, force: true });
  }
});

describe("untrusted tar archive containment", () => {
  test("Passport rejects a symlink member before extraction", () => {
    const dir = root();
    const bundleRoot = join(dir, "amc-passport");
    mkdirSync(bundleRoot, { recursive: true });
    writeFileSync(join(bundleRoot, "passport.json"), "{}\n");
    symlinkSync("/etc/passwd", join(bundleRoot, "signer.pub"));
    const archive = join(dir, "malicious.amcpass");
    createArchive(dir, "amc-passport", archive);

    const result = verifyPassportArtifactFile({ file: archive });

    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.message).join(" ")).toMatch(/link|special entry|archive type/i);
  });

  test("Plugin verification rejects a symlink member before extraction", () => {
    const dir = root();
    const bundleRoot = join(dir, "amc-plugin");
    mkdirSync(bundleRoot, { recursive: true });
    writeFileSync(join(bundleRoot, "manifest.json"), "{}\n");
    symlinkSync("/etc/passwd", join(bundleRoot, "publisher.pub"));
    const archive = join(dir, "malicious.amcplug");
    createArchive(dir, "amc-plugin", archive);

    expect(() => verifyPluginPackage({ file: archive })).toThrow(/link|special entry|archive type/i);
  });

  test("preflight enforces uncompressed member and total byte limits", () => {
    const dir = root();
    const bundleRoot = join(dir, "bundle");
    mkdirSync(bundleRoot, { recursive: true });
    writeFileSync(join(bundleRoot, "payload.txt"), "four");
    const archive = join(dir, "oversized.tgz");
    createArchive(dir, "bundle", archive);

    expect(() => inspectTarGzipArchive({
      file: archive,
      label: "test archive",
      limits: {
        maxEntries: 10,
        maxCompressedBytes: 1024 * 1024,
        maxEntryBytes: 3,
        maxTotalBytes: 3,
        maxPathBytes: 512,
      },
    })).toThrow(/size|byte|limit/i);
  });
});
