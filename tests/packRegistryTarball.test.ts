import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { createPackTarball } from "../src/packs/packRegistry.js";

describe("createPackTarball", () => {
  test("creates a non-empty tarball buffer from a pack directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-pack-"));
    mkdirSync(join(dir, "scenarios"));
    writeFileSync(join(dir, "pack.yaml"), "name: demo-pack\nversion: 1.0.0\n", "utf8");
    writeFileSync(join(dir, "README.md"), "# Demo Pack\n", "utf8");
    writeFileSync(join(dir, "scenarios", "check.yaml"), "id: check-1\n", "utf8");

    const tarball = createPackTarball(dir);
    expect(tarball).toBeInstanceOf(Buffer);
    expect(tarball.byteLength).toBeGreaterThan(32);
  });
});
