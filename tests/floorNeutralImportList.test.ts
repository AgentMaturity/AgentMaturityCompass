/**
 * `listNeutralImports` (what `amc import list` and GET /api/v1/imports read): newest first, bounded by the limit, empty
 * for a workspace with no imports, and blind to non-JSON files in the manifests folder. A missing import id is refused
 * by name.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { listNeutralImports, loadNeutralImportManifest, runNeutralImport } from "../src/importers/neutralImporter.js";

const roots: string[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}
function traceInput(traceId: string): string {
  const dir = tempDir("amc-floor-neutral-list-input-");
  writeFileSync(join(dir, "traces.jsonl"), `${JSON.stringify({ traceId, agentId: "default", agentType: "assistant", input: "Summarize policy",
    output: "Policy summary", durationMs: 42, timestamp: Date.UTC(2026, 10, 17, 10, 0, 0), metadata: { model: "local-test" } })}\n`, "utf8");
  return dir;
}

describe("listNeutralImports", () => {
  test("is empty for a workspace that never imported", () => {
    expect(listNeutralImports({ workspace: tempDir("amc-floor-neutral-list-empty-") })).toEqual([]);
  });

  test("lists applied imports newest first and honours the limit", () => {
    const workspace = tempDir("amc-floor-neutral-list-ws-");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-17T10:00:00.000Z"));
    const first = runNeutralImport({ workspace, inputPath: traceInput("trace-first"), agentId: "default", mode: "import", retainOriginals: false });
    vi.setSystemTime(new Date("2026-11-17T11:00:00.000Z"));
    const second = runNeutralImport({ workspace, inputPath: traceInput("trace-second"), agentId: "default", mode: "import", retainOriginals: false });
    expect(first.applied && second.applied).toBe(true);
    expect(first.importId).not.toBe(second.importId);

    const manifestsDir = dirname(first.importManifestPath!);
    writeFileSync(join(manifestsDir, "notes.txt"), "not a manifest", "utf8");

    const listed = listNeutralImports({ workspace });
    expect(listed.map(row => row.importId)).toEqual([second.importId, first.importId]);
    expect(listed.map(row => row.createdAt)).toEqual(["2026-11-17T11:00:00.000Z", "2026-11-17T10:00:00.000Z"]);
    expect(listNeutralImports({ workspace, limit: 1 }).map(row => row.importId)).toEqual([second.importId]);
    expect(loadNeutralImportManifest({ workspace, importId: first.importId })).toEqual(listed[1]);
  });

  test("a dry run writes no manifest, and loading an unknown import is refused by name", () => {
    const workspace = tempDir("amc-floor-neutral-list-dry-");
    const dry = runNeutralImport({ workspace, inputPath: traceInput("trace-dry"), agentId: "default", mode: "dry-run" });
    expect(dry.applied).toBe(false);
    expect(listNeutralImports({ workspace })).toEqual([]);
    expect(() => loadNeutralImportManifest({ workspace, importId: dry.importId })).toThrow(`Neutral import not found: ${dry.importId}`);
  });
});
