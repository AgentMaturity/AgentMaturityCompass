import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { assertCompilerOutputOutsideSignedConfigTree } from "../../../src/catalog/compiler/outputPath.js";

let root: string;
let workspace: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "amc-p110-output-path-"));
  workspace = join(root, "workspace");
  mkdirSync(join(workspace, ".amc"), { recursive: true });
  writeFileSync(join(workspace, ".amc", "sentinel"), "owned synthetic protected-tree sentinel\n", { flag: "wx" });
});
afterEach(({ task }) => {
  if (task.result?.state === "fail") console.error(`P1-10 output-path fixture retained ${root}`);
  else rmSync(root, { recursive: true, force: true });
});

describe("compiler output path protection with real filesystem aliases", () => {
  test.each([".amc", ".amc/plan", ".amc/missing/nested/plan"])("refuses lexical protected target %s", relative => {
    expect(() => assertCompilerOutputOutsideSignedConfigTree(workspace, join(workspace, relative))).toThrow("reserved for signed configs");
  });

  test("ordinary missing outputs and a whole-segment .amcx sibling stay usable without creating directories", () => {
    for (const target of [join(workspace, "plans", "missing", "plan"), join(workspace, ".amcx", "plan"), join(root, "external", "plan")]) {
      expect(() => assertCompilerOutputOutsideSignedConfigTree(workspace, target)).not.toThrow();
      expect(() => lstatSync(target)).toThrow();
    }
    expect(readFileSync(join(workspace, ".amc", "sentinel"), "utf8")).toBe("owned synthetic protected-tree sentinel\n");
  });

  test("a workspace alias cannot hide a missing output in the physical signed tree", () => {
    const alias = join(root, "workspace-alias");
    symlinkSync(workspace, alias, "dir");
    expect(() => assertCompilerOutputOutsideSignedConfigTree(realpathSync(workspace), join(alias, ".amc", "missing", "plan"))).toThrow("reserved for signed configs");
  });

  test("an output alias into signed storage is refused through a missing nested suffix", () => {
    const alias = join(workspace, "exports");
    symlinkSync(join(workspace, ".amc"), alias, "dir");
    expect(() => assertCompilerOutputOutsideSignedConfigTree(workspace, join(alias, "missing", "plan"))).toThrow("reserved for signed configs");
  });

  test("a linked signed root protects both its lexical and physical locations", () => {
    const signed = join(workspace, ".amc"), physical = join(root, "signed-storage");
    renameSync(signed, physical);
    symlinkSync(physical, signed, "dir");
    expect(() => assertCompilerOutputOutsideSignedConfigTree(workspace, join(signed, "missing", "plan"))).toThrow("reserved for signed configs");
    expect(() => assertCompilerOutputOutsideSignedConfigTree(workspace, join(physical, "missing", "plan"))).toThrow("reserved for signed configs");
    expect(readFileSync(join(physical, "sentinel"), "utf8")).toBe("owned synthetic protected-tree sentinel\n");
  });

  test("a dangling output link fails closed instead of treating the existing link as a missing name", () => {
    const alias = join(workspace, "dangling");
    symlinkSync(join(root, "absent-target"), alias, "dir");
    expect(lstatSync(alias).isSymbolicLink()).toBe(true);
    expect(() => assertCompilerOutputOutsideSignedConfigTree(workspace, join(alias, "missing", "plan"))).toThrow(expect.objectContaining({ code: "ENOENT" }));
    expect(readFileSync(join(workspace, ".amc", "sentinel"), "utf8")).toBe("owned synthetic protected-tree sentinel\n");
  });

  test("a non-directory prefix fails closed without falling back to a lexical path", () => {
    const prefix = join(workspace, "regular-file");
    writeFileSync(prefix, "owned regular file\n", { flag: "wx" });
    expect(() => assertCompilerOutputOutsideSignedConfigTree(workspace, join(prefix, "plan"))).toThrow(expect.objectContaining({ code: "ENOTDIR" }));
    expect(readFileSync(prefix, "utf8")).toBe("owned regular file\n");
    expect(readFileSync(join(workspace, ".amc", "sentinel"), "utf8")).toBe("owned synthetic protected-tree sentinel\n");
  });
});
