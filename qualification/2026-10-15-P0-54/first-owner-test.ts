import { linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync,
  symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { assertOwnerMode, getMode, setMode, type AMCMode } from "../src/mode/mode.js";
import { sha256Hex } from "../src/utils/hash.js";

// P0-54's original sixteen paths are explicit: future CLI inventory cannot silently remove this contract.
const originalA4Paths = ["a4 approve", "a4 complete", "a4 deny", "a4 deploy record", "a4 deploy verify", "a4 export",
  "a4 gate-policy", "a4 hold", "a4 members", "a4 release", "a4 reopen", "a4 request-changes", "a4 resume",
  "a4 retire", "a4 rollback", "a4 tune"] as const;
const acknowledgePath = "a4 acknowledge"; // Accepted P1-57 addition, preserved alongside the original paths.
const readonlyPaths = ["a4 guide", "a4 list", "a4 show", "a4 readiness", "a4 verify", "run", "score run"];
const roots: string[] = [];
const records: Array<Record<string, unknown>> = [];
type Row = { path: string; kind: string; mode: number; inode: number; links: number; modifiedMs: number;
  bytes?: number; sha256?: string; target?: string };

function snapshot(root: string): Row[] {
  const rows: Row[] = [];
  const walk = (path: string) => {
    const stat = lstatSync(path);
    const row: Row = { path: relative(root, path) || ".", kind: stat.isSymbolicLink() ? "symlink" : stat.isDirectory() ? "directory" : "file",
      mode: stat.mode, inode: stat.ino, links: stat.nlink, modifiedMs: stat.mtimeMs };
    if (stat.isSymbolicLink()) row.target = readlinkSync(path);
    else if (stat.isFile()) { row.bytes = stat.size; row.sha256 = sha256Hex(readFileSync(path)); }
    rows.push(row);
    if (stat.isDirectory()) for (const name of readdirSync(path).sort()) walk(join(path, name));
  };
  walk(root); return rows;
}

function fixture(mode?: AMCMode): string {
  if (!["22", "24"].includes(process.versions.node.split(".")[0]!)) throw new Error("Use a qualified Node 22 or 24 fixture runtime.");
  const root = mkdtempSync(join(tmpdir(), "amc-a4-owner-mode-")); roots.push(root);
  const amc = join(root, ".amc"); mkdirSync(amc, { mode: 0o700 });
  const sentinel = join(amc, "owned-sentinel.txt"); writeFileSync(sentinel, "unchanged mode helper fixture\n", { mode: 0o600 });
  linkSync(sentinel, join(amc, "owned-hardlink.txt")); symlinkSync("owned-sentinel.txt", join(amc, "owned-symlink.txt"));
  if (mode !== undefined) setMode(root, mode);
  return root;
}

function observe(path: string, mode: AMCMode) {
  const workspace = fixture(mode);
  expect(getMode(workspace)).toBe(mode);
  const before = snapshot(workspace);
  let error: unknown;
  try { assertOwnerMode(workspace, path); } catch (caught) { error = caught; }
  const after = snapshot(workspace);
  records.push({ path, mode, error: error instanceof Error ? error.message : null, before, after });
  expect(after).toEqual(before);
  expect(getMode(workspace)).toBe(mode);
  return error;
}

afterAll(() => {
  try {
    const dir = process.env.AMC_P0_54_OWNER_MODE_EFFECTS_DIR;
    if (dir) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      writeFileSync(join(dir, "owner-mode-effects.json"), JSON.stringify(records, null, 2) + "\n", { mode: 0o600 });
    }
  } finally {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  }
});

describe("P0-54 actual owner-mode helper contracts", () => {
  test("retains every original A4 gate and the separately accepted acknowledge path", () => {
    expect(originalA4Paths).toHaveLength(16);
    expect(new Set(originalA4Paths).size).toBe(16);
    const source = readFileSync("src/mode/mode.ts", "utf8");
    const current = [...source.matchAll(/^\s*"(a4 [^"]+)"/gm)].map(match => match[1]);
    expect(current.sort()).toEqual([...originalA4Paths, acknowledgePath].sort());
  });

  test.each(originalA4Paths)("agent mode refuses the original path %s without changing bytes or links", path => {
    const error = observe(path, "agent");
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(`Command '${path}' is blocked in agent mode. Switch to owner mode with: amc mode owner`);
  });

  test.each(originalA4Paths)("owner mode permits the original path %s without changing bytes or links", path => {
    expect(observe(path, "owner")).toBeUndefined();
  });

  test("agent mode also refuses the accepted acknowledge path without changing bytes or links", () => {
    const error = observe(acknowledgePath, "agent");
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(`Command '${acknowledgePath}' is blocked in agent mode. Switch to owner mode with: amc mode owner`);
  });

  test("owner mode permits the accepted acknowledge path without changing bytes or links", () => {
    expect(observe(acknowledgePath, "owner")).toBeUndefined();
  });

  for (const mode of ["agent", "owner"] as const) {
    test.each(readonlyPaths)(`${mode} mode preserves the nonblocked read-only helper path %s`, path => {
      expect(observe(path, mode)).toBeUndefined();
    });
  }

  test("persists explicit agent/owner transitions using the real mode writer", () => {
    const workspace = fixture();
    for (const mode of ["agent", "owner", "agent"] as const) {
      setMode(workspace, mode);
      const file = join(workspace, ".amc", "mode.json"), value = JSON.parse(readFileSync(file, "utf8")) as { mode: unknown; updatedTs: unknown };
      expect(value.mode).toBe(mode); expect(Number.isInteger(value.updatedTs)).toBe(true);
      expect(lstatSync(file).mode & 0o777).toBe(0o644);
      expect(getMode(workspace)).toBe(mode);
    }
  });

  test("rereads independently rewritten mode bytes instead of caching a previous value", () => {
    const workspace = fixture("owner"), file = join(workspace, ".amc", "mode.json");
    expect(getMode(workspace)).toBe("owner");
    writeFileSync(file, JSON.stringify({ mode: "agent", updatedTs: 1 }));
    expect(getMode(workspace)).toBe("agent");
    expect(() => assertOwnerMode(workspace, "a4 approve")).toThrow("blocked in agent mode");
    writeFileSync(file, JSON.stringify({ mode: "owner", updatedTs: 2 }));
    expect(getMode(workspace)).toBe("owner"); expect(() => assertOwnerMode(workspace, "a4 approve")).not.toThrow();
  });

  test("preserves the existing missing-mode owner default without writing a mode file", () => {
    const workspace = fixture(), before = snapshot(workspace);
    expect(getMode(workspace)).toBe("owner"); expect(() => assertOwnerMode(workspace, "a4 approve")).not.toThrow();
    expect(snapshot(workspace)).toEqual(before);
  });

  test.each(["not JSON", "null", '{"mode":"unknown"}'])("preserves the existing owner fallback for mode bytes %j", bytes => {
    const workspace = fixture(); writeFileSync(join(workspace, ".amc", "mode.json"), bytes);
    const before = snapshot(workspace);
    expect(getMode(workspace)).toBe("owner"); expect(() => assertOwnerMode(workspace, "a4 approve")).not.toThrow();
    expect(snapshot(workspace)).toEqual(before);
  });
});
