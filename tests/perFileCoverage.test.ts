import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { coverageFiles, coverageSourceFiles, checkPerFileCoverage } from "../scripts/per-file-coverage.mjs";

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
  it("normalizes verifier evidence alongside AMC source without changing file identity", () => {
    expect(coverageFiles({ total: {}, "src/a.ts": measures(8),
      "/tmp/clone/packages/verifier/src/index.ts": measures(8),
      "packages/verifier/src/records/evidence.ts": measures(8) }, "/tmp/clone"))
      .toEqual({ "src/a.ts": measures(8), "packages/verifier/src/index.ts": measures(8),
        "packages/verifier/src/records/evidence.ts": measures(8) });
  });
  it.each(["/tmp/other/packages/verifier/src/index.ts", "packages/other/src/index.ts",
    "packages/verifier/src-extra/index.ts", "packages/verifier/index.ts", "src-extra/index.ts",
    "packages/verifier/src/../../other/index.ts"])("rejects coverage outside the two exact source roots: %s", path => {
    expect(() => coverageFiles({ [path]: measures(8) }, "/tmp/clone")).toThrow(/outside source scope/);
  });
  it("inventories both source roots while preserving existing coverage exclusions", () => {
    const root = mkdtempSync(join(tmpdir(), "amc-coverage-inventory-"));
    try {
      for (const file of ["src/existing.ts", "src/console/view.ts", "src/dashboard/view.ts", "src/types.d.ts",
        "src/nested/tests/fixture.ts", "packages/verifier/src/index.ts", "packages/verifier/src/records/evidence.ts",
        "packages/verifier/src/types.d.ts", "packages/verifier/src/tests/fixture.ts", "packages/other/src/ignored.ts"]) {
        const path = join(root, file);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, "export const fixture = true;\n");
      }
      expect(coverageSourceFiles(root)).toEqual([
        "packages/verifier/src/index.ts", "packages/verifier/src/records/evidence.ts", "src/existing.ts"
      ]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("requires verifier files to meet the unchanged new-source minimums", () => {
    const file = "packages/verifier/src/index.ts";
    const files = coverageFiles({ "src/existing.ts": measures(8), [file]: measures(0) }, "/tmp/clone");
    const expected = ["src/existing.ts", file];
    expect(checkPerFileCoverage(files, baseline, expected)).toEqual([
      { file, metric: "lines", actual: 0, minimum: 65 },
      { file, metric: "functions", actual: 0, minimum: 75 },
      { file, metric: "branches", actual: 0, minimum: 59 },
      { file, metric: "statements", actual: 0, minimum: 64 }
    ]);
    expect(checkPerFileCoverage({ ...files, [file]: measures(8) }, baseline, expected)).toEqual([]);
  });
  it("refuses missing verifier evidence and stale verifier inventory", () => {
    const file = "packages/verifier/src/index.ts";
    const files = coverageFiles({ "src/existing.ts": measures(8) }, "/tmp/clone");
    expect(checkPerFileCoverage(files, baseline, ["src/existing.ts", file]))
      .toEqual([{ file, reason: "New source file has no coverage evidence" }]);
    expect(checkPerFileCoverage({ ...files, [file]: measures(8) }, baseline, ["src/existing.ts"]))
      .toEqual([{ file, reason: "Coverage evidence does not match the current source inventory" }]);
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
