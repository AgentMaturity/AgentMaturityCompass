import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { restoreWatchReceiptSharing } from "./helpers/restoreWatchReceiptSharing.js";

const read = (path: string) => readFileSync(resolve(path), "utf8");
const hash = (source: string) => createHash("sha256").update(source).digest("hex");
const manifest = JSON.parse(read(
  "unused-code/2026-10-02-main/native-five-integration/watch-source-restoration.json")) as {
  files: Array<{ originalPath: string; archivePath: string; originalSha256: string; currentSha256: string }>;
  currentProductionFiles: Array<{ path: string; sha256: string }>;
};

describe("bounded watch receipt sharing reversal", () => {
  test("binds exactly five older source freezes and all current production modules", () => {
    expect(manifest.files.map(row => row.originalPath).sort()).toEqual([
      "bishengObservability", "lmnrObservability", "narrowTaskBroadMisalignment", "openCompass", "trismAgentic"
    ].map(name => `src/watch/${name}LiveDrift.ts`).sort());
    expect(manifest.currentProductionFiles).toHaveLength(9);
    expect(manifest.currentProductionFiles.some(row => row.path === "src/watch/liveDriftReceiptValidation.ts")).toBe(true);
    for (const row of manifest.currentProductionFiles) expect(hash(read(row.path))).toBe(row.sha256);
  });
  for (const row of manifest.files) {
    test(`${row.originalPath} reconstructs the complete preserved original`, () => {
      const current = read(row.originalPath), original = read(row.archivePath);
      expect(hash(current)).toBe(row.currentSha256);
      expect(hash(original)).toBe(row.originalSha256);
      expect(restoreWatchReceiptSharing(row.originalPath, current)).toBe(original);
    });
    test(`${row.originalPath} refuses unrelated mismatch-policy changes`, () => {
      const current = read(row.originalPath);
      const changed = current.replace("function metadataMismatchReasons", "function alteredMetadataMismatchReasons");
      expect(changed).not.toBe(current);
      expect(() => restoreWatchReceiptSharing(row.originalPath, changed)).toThrow("Source changed beyond declared");
    });
    test(`${row.originalPath} refuses a changed receipt-sharing edit`, () => {
      const current = read(row.originalPath);
      const changed = current.replace("createLiveDriftMetadataReceiptEnricher", "alteredReceiptEnricher");
      expect(changed).not.toBe(current);
      expect(() => restoreWatchReceiptSharing(row.originalPath, changed)).toThrow("Source changed beyond declared");
    });
  }
  test("leaves unowned modules unchanged", () => {
    const path = "src/watch/proofStats.ts", source = read(path);
    expect(restoreWatchReceiptSharing(path, source)).toBe(source);
  });
});
