import type { Stats } from "node:fs";
import { linkSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

// A concurrent atomic replace shows a reader the old inode with a link count of 0. The stubs below reproduce that
// moment for one path: the next N lstat or fstat results for it report nlink 0, everything else passes through.
const race = vi.hoisted(() => ({ path: "", lstatZero: 0, fstatZero: 0 }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const unlinked = (stat: Stats): Stats => Object.assign(Object.create(Object.getPrototypeOf(stat) as object) as Stats, stat, { nlink: 0 });
  const lstatSync = ((path: string, ...rest: unknown[]) => {
    const stat = (actual.lstatSync as (...args: unknown[]) => Stats)(path, ...rest);
    if (race.lstatZero > 0 && String(path) === race.path) { race.lstatZero -= 1; return unlinked(stat); }
    return stat;
  }) as typeof actual.lstatSync;
  const fstatSync = ((fd: number, ...rest: unknown[]) => {
    const stat = (actual.fstatSync as (...args: unknown[]) => Stats)(fd, ...rest);
    if (race.fstatZero > 0 && stat.isFile()) { race.fstatZero -= 1; return unlinked(stat); }
    return stat;
  }) as typeof actual.fstatSync;
  return { ...actual, lstatSync, fstatSync, default: { ...actual, lstatSync, fstatSync } };
});
const { readContainedOrNull } = await import("../src/utils/containedFs.js");

// LIVE-RUNTIME-22 (fix3 P-2): a read racing an atomic replace retries on the path; a hard link is still refused.
const roots: string[] = [];
afterEach(() => {
  Object.assign(race, { path: "", lstatZero: 0, fstatZero: 0 });
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function root(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-contained-replace-"));
  roots.push(dir);
  return dir;
}

describe("contained reads across an atomic replace", () => {
  test("a file renamed over the name reads as the new contents", () => {
    const dir = root();
    writeFileSync(join(dir, "state.json"), "old");
    writeFileSync(join(dir, "next.json"), "new");
    renameSync(join(dir, "next.json"), join(dir, "state.json"));
    expect(readContainedOrNull(dir, "state.json", 1024)?.toString()).toBe("new");
  });

  test("an unlinked inode seen at lstat or fstat is retried, never reported as a hard link", () => {
    const dir = root();
    writeFileSync(join(dir, "state.json"), "current");
    Object.assign(race, { path: join(dir, "state.json"), lstatZero: 1 });
    expect(readContainedOrNull(dir, "state.json", 1024)?.toString()).toBe("current");
    Object.assign(race, { path: join(dir, "state.json"), fstatZero: 1 });
    expect(readContainedOrNull(dir, "state.json", 1024)?.toString()).toBe("current");
  });

  test("a replace that never settles is still refused, never read as absent", () => {
    const dir = root();
    writeFileSync(join(dir, "state.json"), "current");
    Object.assign(race, { path: join(dir, "state.json"), lstatZero: 100 });
    expect(() => readContainedOrNull(dir, "state.json", 1024)).toThrow("was replaced while it was read");
  });

  test("a real hard link is refused", () => {
    const dir = root();
    writeFileSync(join(dir, "state.json"), "current");
    linkSync(join(dir, "state.json"), join(dir, "other.json"));
    expect(() => readContainedOrNull(dir, "state.json", 1024)).toThrow("refusing a hard link");
  });
});
