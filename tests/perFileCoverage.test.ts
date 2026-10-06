import { describe, expect, it } from "vitest";
import { coverageFiles, checkPerFileCoverage } from "../scripts/per-file-coverage.mjs";

const measures = (covered: number, total = 10) => Object.fromEntries(["lines", "functions", "branches", "statements"]
  .map(metric => [metric, { total, covered }]));
const baseline = { v: 1, files: { "src/existing.ts": measures(8) },
  newFileMinimum: { lines: 65, functions: 75, branches: 59, statements: 64 } };

describe("per-file coverage ratchet", () => {
  it("rejects a file regression even when another file increases the aggregate", () => {
    const failures = checkPerFileCoverage({ "src/existing.ts": measures(7), "src/new.ts": measures(100, 100) }, baseline);
    expect(failures).toHaveLength(4);
    expect(failures[0]).toMatchObject({ file: "src/existing.ts", actual: 70, minimum: 80 });
  });
  it("allows measured floors and improved coverage", () => {
    expect(checkPerFileCoverage({ "src/existing.ts": measures(8) }, baseline)).toEqual([]);
    expect(checkPerFileCoverage({ "src/existing.ts": measures(9) }, baseline)).toEqual([]);
  });
  it("refuses dilution by uncovered code even when the covered count is unchanged", () => {
    expect(checkPerFileCoverage({ "src/existing.ts": measures(8, 11) }, baseline)).toHaveLength(4);
  });
  it("enforces existing global minimums on new source files", () => {
    expect(checkPerFileCoverage({ "src/existing.ts": measures(8), "src/new.ts": measures(0) }, baseline)).toHaveLength(4);
    expect(checkPerFileCoverage({ "src/existing.ts": measures(8), "src/new.ts": measures(8) }, baseline)).toEqual([]);
  });
  it("refuses an omitted baseline file instead of shrinking the denominator", () => {
    expect(checkPerFileCoverage({}, baseline)).toEqual([{ file: "src/existing.ts", reason: expect.stringContaining("missing") }]);
  });
  it("refuses newly added source omitted from the coverage report", () => {
    expect(checkPerFileCoverage({ "src/existing.ts": measures(8) }, baseline, ["src/existing.ts", "src/missing.ts"]))
      .toEqual([{ file: "src/missing.ts", reason: "New source file has no coverage evidence" }]);
  });
  it("refuses stale coverage for source that no longer exists", () => {
    expect(checkPerFileCoverage({ "src/existing.ts": measures(8) }, baseline, []))
      .toEqual([{ file: "src/existing.ts", reason: "Coverage evidence does not match the current source inventory" }]);
  });
  it("normalizes paths to the exact clone root and rejects outside files", () => {
    expect(coverageFiles({ total: {}, "/tmp/clone/src/a.ts": measures(8) }, "/tmp/clone")).toEqual({ "src/a.ts": measures(8) });
    expect(() => coverageFiles({ "/tmp/other/src/a.ts": measures(8) }, "/tmp/clone")).toThrow(/outside/);
  });
  it("refuses empty evidence and impossible counts", () => {
    expect(() => coverageFiles({ total: {} }, "/tmp/clone")).toThrow(/no source files/);
    expect(() => coverageFiles({ "/tmp/clone/src/a.ts": measures(11) }, "/tmp/clone")).toThrow(/Invalid coverage counts/);
    expect(() => checkPerFileCoverage({ "src/existing.ts": measures(8) }, { ...baseline, files: {} })).toThrow(/Missing/);
  });
  it("applies a platform floor only on that platform and only to the metrics it names", () => {
    const withLinux = { ...baseline, platformFloors: { linux: { "src/existing.ts": { branches: { total: 10, covered: 6 } } } } };
    const branchesAtSix = { ...measures(8), branches: { total: 10, covered: 6 } };
    expect(checkPerFileCoverage({ "src/existing.ts": branchesAtSix }, withLinux, undefined, "linux")).toEqual([]);
    expect(checkPerFileCoverage({ "src/existing.ts": branchesAtSix }, withLinux, undefined, "darwin"))
      .toEqual([{ file: "src/existing.ts", metric: "branches", actual: 60, minimum: 80 }]);
    expect(checkPerFileCoverage({ "src/existing.ts": measures(7) }, withLinux, undefined, "linux")).toHaveLength(3);
  });
  it("refuses a platform floor for a file the shared baseline does not track", () => {
    const stale = { ...baseline, platformFloors: { linux: { "src/gone.ts": { lines: { total: 1, covered: 0 } } } } };
    expect(() => checkPerFileCoverage({ "src/existing.ts": measures(8) }, stale, undefined, "linux")).toThrow(/platform floor/);
  });
  it("treats files without executable statements as fully covered, without granting coverage to later code", () => {
    const empty = { ...baseline, files: { "src/existing.ts": measures(0, 0) } };
    expect(checkPerFileCoverage({ "src/existing.ts": measures(0, 0) }, empty)).toEqual([]);
    expect(checkPerFileCoverage({ "src/existing.ts": measures(0, 1) }, empty)).toHaveLength(4);
  });
});
