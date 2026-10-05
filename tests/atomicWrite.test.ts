import * as fs from "node:fs";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeFileAtomicSync } from "../src/tools/builtin/atomicWrite.js";

// A plain-object copy of node:fs, so `vi.spyOn` can replace one export.
vi.mock("node:fs", async (importOriginal) => ({ ...(await importOriginal<typeof import("node:fs")>()) }));

/**
 * The atomic write behind fs.write and fs.edit: a temp file in the same
 * directory, fsync, then rename. A reader sees the old bytes or the new
 * bytes, never a truncated mix, and a failed write leaves the target alone.
 */
const dirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-atomic-write-"));
  dirs.push(dir);
  return dir;
}

const leftovers = (dir: string): string[] => readdirSync(dir).filter((name) => name.includes(".amc-tmp-"));

describe("writeFileAtomicSync", () => {
  it("writes a new file and overwrites an existing one with the exact bytes", () => {
    const dir = workspace();
    const target = join(dir, "a.txt");

    writeFileAtomicSync(target, "first $$ é\n");
    expect(readFileSync(target)).toEqual(Buffer.from("first $$ é\n", "utf8"));

    const bytes = Buffer.from([0, 1, 2, 255, 10]);
    writeFileAtomicSync(target, bytes);
    expect(readFileSync(target)).toEqual(bytes);
  });

  it.skipIf(process.platform === "win32")("preserves the mode of the file it replaces", () => {
    const dir = workspace();
    const target = join(dir, "a.txt");
    writeFileSync(target, "old");
    chmodSync(target, 0o640);

    writeFileAtomicSync(target, "new");

    expect(statSync(target).mode & 0o777).toBe(0o640);
    expect(readFileSync(target, "utf8")).toBe("new");
  });

  it("leaves no temp files behind on success", () => {
    const dir = workspace();
    writeFileAtomicSync(join(dir, "a.txt"), "one");
    writeFileAtomicSync(join(dir, "a.txt"), "two");
    expect(leftovers(dir)).toEqual([]);
    expect(readdirSync(dir)).toEqual(["a.txt"]);
  });

  it("leaves the original byte-identical and removes the temp file when the rename fails", () => {
    const dir = workspace();
    const target = join(dir, "a.txt");
    writeFileSync(target, "original contents");
    const rename = vi.spyOn(fs, "renameSync").mockImplementation(() => {
      throw Object.assign(new Error("simulated rename failure"), { code: "EIO" });
    });

    expect(() => writeFileAtomicSync(target, "replacement")).toThrow("simulated rename failure");

    expect(rename).toHaveBeenCalled();
    expect(readFileSync(target, "utf8")).toBe("original contents");
    expect(leftovers(dir)).toEqual([]);
  });
});
