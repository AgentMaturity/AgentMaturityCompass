/**
 * The eval guards (attempt scope, grading copy, fixture root) confine paths through `isWithin`. On Windows,
 * `path.relative` across drives returns an absolute path (`D:\secret.txt`), not a `..`-prefixed one, so a check
 * that only looks for `..` reads it as inside. Run here under win32 path semantics on any host.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("node:path", async () => {
  const actual = await vi.importActual<typeof import("node:path")>("node:path");
  return { ...actual.win32, default: actual.win32 };
});

const { isWithin } = await import("../../src/utils/pathSafety.js");

describe("isWithin under win32 path semantics", () => {
  it("refuses another drive, a parent climb and a sibling, and keeps a child named ..cache", () => {
    const root = "C:\\ws\\workspace\\output\\amc-eval\\r\\t\\1";
    expect(isWithin(root, "D:\\secret.txt"), "another drive comes back absolute from relative()").toBe(false);
    expect(isWithin(root, "C:\\ws\\evals\\suite.yaml")).toBe(false);
    expect(isWithin(root, "C:\\ws\\workspace\\output\\amc-eval\\r\\t\\2\\answer.txt")).toBe(false);
    expect(isWithin(root, `${root}\\answer.txt`)).toBe(true);
    expect(isWithin(root, `${root}\\..cache\\x`)).toBe(true);
    expect(isWithin(root, root)).toBe(true);
  });
});
