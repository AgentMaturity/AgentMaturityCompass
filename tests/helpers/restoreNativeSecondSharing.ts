import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const manifest = JSON.parse(readFileSync(resolve(
  "unused-code/2026-10-02-main/native-five-integration/second-source-restoration/restoration.json"), "utf8")) as {
  files: Array<{ originalPath: string; archivePath: string; originalSha256: string; currentSha256: string;
    edits: Array<{ currentStartLine: number; beforeLines: string[]; afterLines: string[] }> }>;
};
const hash = (source: string) => createHash("sha256").update(source).digest("hex");

/** Reverse only the reviewed receipt-sharing edits for the older private-helper visibility freeze. */
export function restoreNativeSecondSharing(file: string, source: string): string {
  const row = manifest.files.find(value => value.originalPath === file);
  if (!row) return source;
  if (hash(source) !== row.currentSha256) {
    throw new Error("Source changed beyond declared native second sharing: " + file);
  }
  const archived = readFileSync(resolve(row.archivePath), "utf8");
  if (hash(archived) !== row.originalSha256) throw new Error("Native second original archive changed: " + file);
  const lines = source.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  for (const edit of [...row.edits].reverse()) {
    const start = edit.currentStartLine;
    if (!Number.isInteger(start) || start < 0 || start + edit.afterLines.length > lines.length
      || lines.slice(start, start + edit.afterLines.length).join("") !== edit.afterLines.join("")) {
      throw new Error("Declared native second edit changed: " + file);
    }
    lines.splice(start, edit.afterLines.length, ...edit.beforeLines);
  }
  const restored = lines.join("");
  if (hash(restored) !== row.originalSha256 || restored !== archived) {
    throw new Error("Native second original does not match: " + file);
  }
  return restored;
}
