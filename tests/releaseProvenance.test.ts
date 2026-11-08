import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { generateProvenanceRecord } from "../src/release/releaseProvenance.js";

const outputs = { npmTgzSha256: "", sbomSha256: "", licensesSha256: "", secretScanSha256: "" };
const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const lockHash = (workspace: string) =>
  (generateProvenanceRecord({ workspace, toolVersion: "0.0.0", outputs }).inputs as { packageLockSha256: string }).packageLockSha256;

describe("release provenance inputs", () => {
  test("pins whichever lockfile exists, package-lock.json first", () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-provenance-"));
    try {
      expect(lockHash(dir)).toBe("");
      writeFileSync(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
      expect(lockHash(dir)).toBe(sha256(join(dir, "pnpm-lock.yaml")));
      writeFileSync(join(dir, "package-lock.json"), "{\"lockfileVersion\":3}\n");
      expect(lockHash(dir)).toBe(sha256(join(dir, "package-lock.json")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("AMC's own provenance pins its pnpm-lock.yaml instead of recording an empty hash", () => {
    expect(lockHash(process.cwd())).toBe(sha256(join(process.cwd(), "pnpm-lock.yaml")));
  });
});
