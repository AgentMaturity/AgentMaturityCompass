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

  // rename(2) checks only the directory, so without an explicit check a
  // read-only (or mode 000, never-read) file would be silently replaced.
  // Root bypasses permission bits, so the check is meaningless there.
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "refuses a target the caller may not write, as an in-place write would",
    () => {
      const dir = workspace();
      for (const mode of [0o444, 0o000]) {
        const target = join(dir, `locked-${mode.toString(8)}.txt`);
        writeFileSync(target, "locked contents");
        chmodSync(target, mode);

        expect(() => writeFileAtomicSync(target, "replacement")).toThrow(expect.objectContaining({ code: "EACCES" }));

        chmodSync(target, 0o600);
        expect(readFileSync(target, "utf8")).toBe("locked contents");
      }
      expect(leftovers(dir)).toEqual([]);
    },
  );

  it("writes a file whose name is close to the 255-byte name limit", () => {
    const dir = workspace();
    const target = join(dir, `${"a".repeat(236)}.txt`);
    writeFileSync(target, "old");

    writeFileAtomicSync(target, "new");

    expect(readFileSync(target, "utf8")).toBe("new");
    expect(leftovers(dir)).toEqual([]);
  });
});

// Windows retries must revalidate after their wait; an earlier verdict cannot authorize a later rename.
it("rechecks the commit guard before every rename retry", () => {
  const dir = workspace();
  const target = join(dir, "a.txt");
  writeFileSync(target, "original");
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  const rename = fs.renameSync;
  let attempts = 0;
  let checks = 0;
  vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
    if (++attempts === 1) {
      writeFileSync(target, "concurrent write");
      throw Object.assign(new Error("temporarily busy"), { code: "EPERM" });
    }
    rename(from, to);
  });
  try {
    Object.defineProperty(process, "platform", { value: "win32" });
    expect(() => writeFileAtomicSync(target, "replacement", { beforeCommit: () => {
      checks++;
      if (readFileSync(target, "utf8") !== "original") throw new Error("changed before commit");
    } })).toThrow("changed before commit");
  } finally {
    Object.defineProperty(process, "platform", platform);
  }
  expect(checks).toBe(2);
  expect(attempts).toBe(1);
  expect(readFileSync(target, "utf8")).toBe("concurrent write");
  expect(leftovers(dir)).toEqual([]);
});

it.each([false, true])("cleans up only its own failed exclusive create (competing replacement: %s)", replaced => {
  const dir = workspace();
  const target = join(dir, "new.txt");
  const write = fs.writeFileSync;
  vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
    if (typeof file === "number") {
      if (replaced) {
        fs.unlinkSync(target);
        write(target, "competing replacement");
      }
      throw new Error("create write failed");
    }
    write(file, data, options);
  });
  expect(() => writeFileAtomicSync(target, "replacement", { createOnly: true })).toThrow("create write failed");
  expect(fs.existsSync(target)).toBe(replaced);
  if (replaced) expect(readFileSync(target, "utf8")).toBe("competing replacement");
  expect(leftovers(dir)).toEqual([]);
});
