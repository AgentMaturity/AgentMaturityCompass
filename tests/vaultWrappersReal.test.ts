import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { storeWithTtl, readWithTtl } from "../src/vault/memoryTtl.js";
import { snapshotBeforeChange, undoChange } from "../src/vault/undoLayer.js";
import { mintSecretToken, resolveSecretToken } from "../src/vault/secretsBroker.js";
import { redactScreenshot } from "../src/vault/screenshotRedact.js";

/**
 * G1-39: four barrel-exported vault wrappers returned success objects without
 * performing the operation — storeWithTtl discarded the value, undoChange
 * always reported restored, mintSecretToken returned a token referring to
 * nothing, and redactScreenshot claimed a scrubbed file it never wrote.
 */
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("vault wrappers perform the operation they report", () => {
  it("storeWithTtl actually stores the value", () => {
    const result = storeWithTtl("k1", { secret: "value" }, "test", 60);
    expect(result.stored).toBe(true);
    expect(readWithTtl("k1")?.value).toEqual({ secret: "value" });
  });

  it("undoChange restores only what was recorded", () => {
    const snap = snapshotBeforeChange("res-1", "update", { before: "state" });
    expect(snap.canUndo).toBe(true);
    const undone = undoChange(snap.snapshotId);
    expect(undone.restored).toBe(true);
    expect(undone.reversePayload).toEqual({ before: "state" });

    // An unknown snapshot must not report success.
    expect(undoChange("never-recorded").restored).toBe(false);
    // Nor may the same snapshot be undone twice.
    expect(undoChange(snap.snapshotId).restored).toBe(false);
  });

  it("mintSecretToken produces a resolvable token", () => {
    const token = mintSecretToken("OPENAI_API_KEY", "read", 60);
    const resolved = resolveSecretToken(token.tokenId);
    expect(resolved?.secretName).toBe("OPENAI_API_KEY");
    expect(resolved?.scope).toBe("read");
    expect(resolveSecretToken("bogus-token")).toBeNull();
  });

  it("expired tokens stop resolving", () => {
    const token = mintSecretToken("SECRET", "read", -1);
    expect(resolveSecretToken(token.tokenId)).toBeNull();
  });

  it("redactScreenshot writes a real output file", () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-redact-"));
    dirs.push(dir);
    const input = join(dir, "shot.jpg");
    // Minimal JPEG with an APP1/EXIF segment the redactor should strip.
    writeFileSync(input, Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 1, 2, 3, 4, 0xff, 0xd9]));
    const result = redactScreenshot(input);
    expect(result.redacted).toBe(true);
    // The claimed output must exist on disk, not just in the return value.
    expect(readFileSync(result.outputPath).length).toBeGreaterThan(0);
  });
});
