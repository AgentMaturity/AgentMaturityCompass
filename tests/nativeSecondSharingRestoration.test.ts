import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { restoreNativeSecondSharing } from "./helpers/restoreNativeSecondSharing.js";
const read = (path: string) => readFileSync(resolve(path), "utf8");
const hash = (source: string) => createHash("sha256").update(source).digest("hex");
type File = { originalPath: string; archivePath: string; originalSha256: string; currentSha256: string;
  edits: Array<{ currentStartLine: number; beforeLines: string[]; afterLines: string[] }> };
const manifest = JSON.parse(read("unused-code/2026-10-02-main/native-five-integration/second-source-restoration/restoration.json")) as { files: File[]; watchCore: File };
describe("bounded second native sharing provenance", () => {
  test("restores only the two current explainability modules needed by the older private-helper freeze", () => {
    expect(manifest.files.map(row => row.originalPath).sort()).toEqual(["src/diagnostic/evidenceDrilldown.ts", "src/diagnostic/questionScoreExplainability.ts"]);
  });
  for (const row of manifest.files) {
    test(row.originalPath + " restores the complete preserved original", () => {
      expect(hash(read(row.originalPath))).toBe(row.currentSha256);
      expect(hash(read(row.archivePath))).toBe(row.originalSha256);
      expect(restoreNativeSecondSharing(row.originalPath, read(row.originalPath))).toBe(read(row.archivePath));
    });
    test(row.originalPath + " refuses any unrelated byte change", () => {
      expect(() => restoreNativeSecondSharing(row.originalPath, read(row.originalPath) + "\n")).toThrow("Source changed beyond declared");
    });
  }
  test("preserves the complete previous Watch core and binds its declared inverse, current core and new helper", () => {
    const row = manifest.watchCore;
    const current = read(row.originalPath);
    expect(hash(current)).toBe(row.currentSha256);
    expect(hash(read(row.archivePath))).toBe(row.originalSha256);
    const lines = current.match(/[^\n]*\n|[^\n]+$/g) ?? [];
    for (const edit of [...row.edits].reverse()) {
      expect(lines.slice(edit.currentStartLine, edit.currentStartLine + edit.afterLines.length)).toEqual(edit.afterLines);
      lines.splice(edit.currentStartLine, edit.afterLines.length, ...edit.beforeLines);
    }
    expect(lines.join("")).toBe(read(row.archivePath));
    const old = JSON.parse(read("unused-code/2026-10-02-main/native-five-integration/watch-source-restoration.json"));
    expect(old.currentProductionFiles).toHaveLength(9);
    expect(old.currentProductionFiles.find((item: { path: string }) => item.path === row.originalPath).sha256).toBe(row.currentSha256);
    expect(hash(read(old.laterSharingProvenance.newHelper))).toBe(old.laterSharingProvenance.helperSha256);
  });
  test("leaves every unowned module unchanged", () => {
    expect(restoreNativeSecondSharing("src/watch/proofStats.ts", "unowned source")).toBe("unowned source");
  });
});
