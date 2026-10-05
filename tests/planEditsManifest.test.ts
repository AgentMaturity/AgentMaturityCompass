import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { landedBytes, landedSourceAt, planEdits, validatePlanEdits, type PlanEdit } from "./helpers/landedSource.js";

const SCRIPT = resolve("scripts/snapshot-plan-edit.mjs");
const MANIFEST = "unused-code/plan-edits/manifest.json";
const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const owned: string[] = [];
afterEach(() => { for (const dir of owned.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function scratch(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-plan-edits-")));
  owned.push(dir);
  return dir;
}
function put(root: string, path: string, content: string | Buffer): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}
function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid",
    "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}
function snapshot(cwd: string, ...args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8" });
}
const entry = (overrides: Partial<PlanEdit> = {}): PlanEdit => ({
  path: "src/a.ts", issue: "P0-06", baseCommit: "a".repeat(40),
  archivePath: "unused-code/plan-edits/P0-06/src/a.ts.landed", sha256: "b".repeat(64), ...overrides
});
const manifest = (files: unknown[]) => ({ schemaVersion: 1, decision: "D-15", files });

describe("committed plan-edits manifest (D-15)", () => {
  it("validates: schema, sorted unique paths, archives under plan-edits/<issue>/, archive sha256, 40-hex base", () => {
    const edits = planEdits();
    const raw = JSON.parse(readFileSync(resolve(MANIFEST), "utf8")) as { files: PlanEdit[] };
    expect(edits).toEqual(raw.files);
    for (const edit of edits) {
      expect(edit.archivePath.startsWith(`unused-code/plan-edits/${edit.issue}/`)).toBe(true);
      expect(edit.baseCommit).toMatch(/^[0-9a-f]{40}$/);
      expect(sha256(readFileSync(resolve(edit.archivePath)))).toBe(edit.sha256);
      expect(landedBytes(edit.path).equals(readFileSync(resolve(edit.archivePath)))).toBe(true);
    }
  });

  it("archives equal git show <baseCommit>:<path> when history is available", (ctx) => {
    const missing = planEdits().filter(edit =>
      spawnSync("git", ["cat-file", "-e", `${edit.baseCommit}^{commit}`]).status !== 0).map(edit => edit.baseCommit);
    if (missing.length) ctx.skip(`base commits not in this clone (shallow?): ${[...new Set(missing)].join(", ")}`);
    for (const edit of planEdits()) {
      const shown = spawnSync("git", ["show", `${edit.baseCommit}:${edit.path}`], { maxBuffer: 256 * 1024 * 1024 });
      expect(shown.status).toBe(0);
      expect(shown.stdout.equals(readFileSync(resolve(edit.archivePath)))).toBe(true);
    }
  });

  it("rejects malformed manifests", () => {
    expect(validatePlanEdits(manifest([]))).toEqual([]);
    expect(validatePlanEdits(manifest([entry()]))).toEqual([entry()]);
    const bad: Array<[unknown, string]> = [
      [{ ...manifest([]), schemaVersion: 2 }, "header"],
      [{ ...manifest([]), decision: "D-14" }, "header"],
      [{ schemaVersion: 1, decision: "D-15" }, "header"],
      [manifest([entry({ path: "src/b.ts", archivePath: "unused-code/plan-edits/P0-06/src/b.ts.landed" }), entry()]), "sorted"],
      [manifest([entry(), entry()]), "sorted"],
      [manifest([entry({ archivePath: "unused-code/elsewhere/src/a.ts.landed" })]), "archivePath"],
      [manifest([entry({ archivePath: "unused-code/plan-edits/P0-08/src/a.ts.landed" })]), "archivePath"],
      [manifest([entry({ baseCommit: "abc123" })]), "baseCommit"],
      [manifest([entry({ sha256: "B".repeat(64) })]), "sha256"],
      [manifest([entry({ issue: "P9-01", archivePath: "unused-code/plan-edits/P9-01/src/a.ts.landed" })]), "issue"],
      [manifest([entry({ path: "../outside.ts", archivePath: "unused-code/plan-edits/P0-06/../outside.ts.landed" })]), "path"],
      [manifest([entry({ path: "src\\a.ts", archivePath: "unused-code/plan-edits/P0-06/src\\a.ts.landed" })]), "path"],
    ];
    for (const [value, reason] of bad) expect(() => validatePlanEdits(value), reason).toThrow(reason);
  });
});

describe("landedSource helper", () => {
  function fixture() {
    const root = scratch();
    put(root, "src/a.ts", "live a\n");
    put(root, "src/b.ts", "live b\n");
    put(root, "unused-code/plan-edits/P0-06/src/a.ts.landed", "landed a\n");
    put(root, MANIFEST, JSON.stringify(manifest([entry({ sha256: sha256("landed a\n") })])));
    return root;
  }

  it("returns live bytes for an unregistered path and archive bytes for a registered one", () => {
    const root = fixture(), landed = landedSourceAt(root);
    expect(landed.landedText("src/b.ts")).toBe("live b\n");
    expect(landed.landedBytes("src/a.ts").toString("utf8")).toBe("landed a\n");
    expect(landed.landedText("src/a.ts")).toBe("landed a\n");
    expect(landed.planEdits().map(edit => edit.path)).toEqual(["src/a.ts"]);
  });

  it("normalizes ./, backslashes and absolute paths before the lookup", () => {
    const root = fixture(), landed = landedSourceAt(root);
    for (const path of ["./src/a.ts", "src\\a.ts", ".\\src\\a.ts", join(root, "src/a.ts"), "src/../src/a.ts"]) {
      expect(landed.landedText(path), path).toBe("landed a\n");
    }
  });

  it("throws when an archive no longer matches its manifest sha256", () => {
    const root = fixture();
    writeFileSync(join(root, "unused-code/plan-edits/P0-06/src/a.ts.landed"), "tampered\n");
    expect(() => landedSourceAt(root).landedBytes("src/a.ts"))
      .toThrow("Plan-edit snapshot changed: unused-code/plan-edits/P0-06/src/a.ts.landed");
  });
});

describe("scripts/snapshot-plan-edit.mjs", () => {
  function repo() {
    const root = scratch();
    git(root, "init", "-q");
    put(root, "src/z.ts", "z at base\n");
    put(root, "src/a.ts", "a at base\n");
    git(root, "add", ".");
    git(root, "commit", "-q", "-m", "base");
    put(root, "src/a.ts", "a edited in the working tree\n");
    return { root, base: git(root, "rev-parse", "HEAD") };
  }
  const read = (root: string) => JSON.parse(readFileSync(join(root, MANIFEST), "utf8")) as { schemaVersion: number; decision: string; files: PlanEdit[] };

  it("archives the base bytes, not the working tree, and writes a sorted manifest the helper accepts", () => {
    const { root, base } = repo();
    const result = snapshot(root, "--issue", "P0-06", "--base", "HEAD", "src/z.ts", "./src/a.ts");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const written = read(root);
    expect(written.schemaVersion).toBe(1);
    expect(written.decision).toBe("D-15");
    expect(written.files).toEqual([
      { path: "src/a.ts", issue: "P0-06", baseCommit: base, archivePath: "unused-code/plan-edits/P0-06/src/a.ts.landed", sha256: sha256("a at base\n") },
      { path: "src/z.ts", issue: "P0-06", baseCommit: base, archivePath: "unused-code/plan-edits/P0-06/src/z.ts.landed", sha256: sha256("z at base\n") },
    ]);
    expect(validatePlanEdits(written)).toHaveLength(2);
    expect(landedSourceAt(root).landedText("src/a.ts")).toBe("a at base\n");
  });

  it("refuses a path that is already registered and prints the existing entry", () => {
    const { root } = repo();
    expect(snapshot(root, "--issue", "P0-06", "--base", "HEAD", "src/a.ts").status).toBe(0);
    const before = readFileSync(join(root, MANIFEST), "utf8");
    const again = snapshot(root, "--issue", "P0-08", "--base", "HEAD", "src/a.ts");
    expect(again.status).not.toBe(0);
    expect(again.stderr).toContain("already registered");
    expect(again.stderr).toContain('"issue":"P0-06"');
    expect(readFileSync(join(root, MANIFEST), "utf8")).toBe(before);
  });

  it("refuses a bad issue key, a path outside the repository and a path absent at the base", () => {
    const { root } = repo();
    for (const [args, message] of [
      [["--issue", "P0-6", "--base", "HEAD", "src/a.ts"], "Issue key"],
      [["--issue", "P4-01", "--base", "HEAD", "src/a.ts"], "Issue key"],
      [["--issue", "P0-06", "--base", "HEAD", "../outside.ts"], "outside the repository"],
      [["--issue", "P0-06", "--base", "HEAD", "src/missing.ts"], "not present at HEAD"],
      [["--issue", "P0-06", "--base", "HEAD"], "Usage"],
    ] as const) {
      const result = snapshot(root, ...args);
      expect(result.status, message).not.toBe(0);
      expect(result.stderr).toContain(message);
    }
    expect(git(root, "status", "--porcelain", "--untracked-files=all")).toBe("M src/a.ts");
  });

  it("warns when the manifest has uncommitted entries from another issue", () => {
    const { root } = repo();
    expect(snapshot(root, "--issue", "P0-06", "--base", "HEAD", "src/a.ts").status).toBe(0);
    const other = snapshot(root, "--issue", "P0-08", "--base", "HEAD", "src/z.ts");
    expect(other.status).toBe(0);
    expect(other.stderr).toContain("uncommitted manifest entries from another issue: src/a.ts (P0-06)");
    expect(read(root).files.map(row => row.path)).toEqual(["src/a.ts", "src/z.ts"]);
  });
});
