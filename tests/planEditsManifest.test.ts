import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compiledPins } from "../scripts/snapshot-plan-edit.mjs";
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

/**
 * Where each archive came from: a pinned build output must equal its compiledContracts pin; any other
 * archive must equal the blob at its baseCommit, and that commit must be an ancestor of HEAD, so a
 * base rewritten by a squash merge fails here instead of skipping.
 */
function provenanceFailures(root: string, edits: readonly PlanEdit[]): string[] {
  const pins = compiledPins(root);
  return edits.flatMap(edit => {
    const archive = readFileSync(join(root, edit.archivePath));
    const pinned = pins.get(edit.path);
    if (pinned) return pinned.every(pin => pin === sha256(archive)) ? [] : [`${edit.path}: archive is not the pinned build`];
    if (spawnSync("git", ["merge-base", "--is-ancestor", edit.baseCommit, "HEAD"], { cwd: root }).status !== 0) {
      return [`${edit.path}: baseCommit ${edit.baseCommit} is not an ancestor of HEAD; re-run scripts/snapshot-plan-edit.mjs at the new base`];
    }
    const shown = spawnSync("git", ["cat-file", "blob", `${edit.baseCommit}:${edit.path}`], { cwd: root, maxBuffer: 256 * 1024 * 1024 });
    return shown.status === 0 && shown.stdout.equals(archive) ? [] : [`${edit.path}: archive differs from ${edit.baseCommit}:${edit.path}`];
  });
}

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

  it("archives equal the blob at an ancestor baseCommit, or the pinned build for dist/ outputs", (ctx) => {
    const missing = planEdits().filter(edit =>
      spawnSync("git", ["cat-file", "-e", `${edit.baseCommit}^{commit}`]).status !== 0).map(edit => edit.baseCommit);
    const shallow = spawnSync("git", ["rev-parse", "--is-shallow-repository"], { encoding: "utf8" }).stdout.trim() === "true";
    if (missing.length && shallow) ctx.skip(`base commits not in this shallow clone: ${[...new Set(missing)].join(", ")}`);
    expect(provenanceFailures(resolve("."), planEdits())).toEqual([]);
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
      [manifest([entry({ path: "package.json", archivePath: "unused-code/plan-edits/P0-06/package.json.landed" })]), "tests/helpers/packageEntries.ts"],
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
      [["--issue", "P0-06", "--base", "HEAD", "src"], "not present at HEAD"],
      [["--issue", "P0-06", "--base", "HEAD", "package.json"], "pinned by entries in tests/helpers/packageEntries.ts"],
      [["--issue", "P0-06", "--base", "HEAD"], "Usage"],
    ] as const) {
      const result = snapshot(root, ...args);
      expect(result.status, message).not.toBe(0);
      expect(result.stderr).toContain(message);
    }
    expect(git(root, "status", "--porcelain", "--untracked-files=all")).toBe("M src/a.ts");
  });

  it("runs when invoked through a symlinked script path", () => {
    const { root } = repo(), link = join(scratch(), "scripts");
    symlinkSync(dirname(SCRIPT), link);
    const result = spawnSync(process.execPath, [join(link, "snapshot-plan-edit.mjs"), "--issue", "P0-06", "--base", "HEAD", "src/a.ts"],
      { cwd: root, encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Archived src/a.ts");
    expect(read(root).files.map(row => row.path)).toEqual(["src/a.ts"]);
  });

  it("fails provenance, not skips, when a baseCommit is not an ancestor of HEAD", () => {
    const { root } = repo();
    git(root, "checkout", "-q", "-b", "side");
    git(root, "commit", "-q", "-am", "side");
    git(root, "checkout", "-q", "-");
    expect(snapshot(root, "--issue", "P0-06", "--base", "side", "src/a.ts").status).toBe(0);
    expect(provenanceFailures(root, landedSourceAt(root).planEdits())[0]).toContain("is not an ancestor of HEAD");
  });

  it("warns when the manifest has uncommitted entries from another issue", () => {
    const { root } = repo();
    expect(snapshot(root, "--issue", "P0-06", "--base", "HEAD", "src/a.ts").status).toBe(0);
    const other = snapshot(root, "--issue", "P0-08", "--base", "HEAD", "src/z.ts");
    expect(other.status).toBe(0);
    expect(other.stderr).toContain("uncommitted manifest entries from another issue: src/a.ts (P0-06)");
    expect(read(root).files.map(row => row.path)).toEqual(["src/a.ts", "src/z.ts"]);
  });

  describe("pinned build outputs under dist/", () => {
    const pins = { "dist/a.d.ts": "declare a\n", "dist/a.js": "emit a\n" };
    function distRepo(onDisk: Record<string, string>) {
      const root = scratch();
      git(root, "init", "-q");
      put(root, ".gitignore", "dist/\n");
      put(root, "src/a.ts", "a at base\n");
      put(root, "unused-code/x/restoration.json", JSON.stringify({ compiledContracts: Object.entries(pins)
        .map(([file, bytes]) => ({ source: "src/a.ts", file, sha256: sha256(bytes) })) }));
      git(root, "add", ".");
      git(root, "commit", "-q", "-m", "base");
      for (const [file, bytes] of Object.entries(onDisk)) put(root, file, bytes);
      put(root, "src/a.ts", "export const added = 1;\n");
      return root;
    }

    it("registering a source also archives its pinned build outputs from disk", () => {
      const root = distRepo(pins);
      const result = snapshot(root, "--issue", "P0-06", "--base", "HEAD", "src/a.ts");
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      const landed = landedSourceAt(root);
      expect(landed.planEdits().map(edit => edit.path)).toEqual(["dist/a.d.ts", "dist/a.js", "src/a.ts"]);
      put(root, "dist/a.d.ts", "declare a\nexport declare const added = 1;\n");
      expect(landed.landedText("dist/a.d.ts")).toBe("declare a\n");
      expect(landed.landedText("src/a.ts")).toBe("a at base\n");
      expect(provenanceFailures(root, landed.planEdits())).toEqual([]);
      expect(compiledPins(root).get("dist/a.js")).toEqual([sha256("emit a\n")]);
    });

    it("refuses a rebuilt output that no longer matches its pin and writes nothing", () => {
      const root = distRepo({ ...pins, "dist/a.d.ts": "declare a\nexport declare const added = 1;\n" });
      for (const path of ["src/a.ts", "dist/a.d.ts"]) {
        const result = snapshot(root, "--issue", "P0-06", "--base", "HEAD", path);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain("dist/a.d.ts on disk is not the pinned build");
      }
      expect(git(root, "status", "--porcelain", "--untracked-files=all")).toBe("M src/a.ts");
    });
  });
});
