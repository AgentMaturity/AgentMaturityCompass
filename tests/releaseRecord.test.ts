import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { peeledTagCommit, recordFor, verifyRecord } from "../scripts/release-record.mjs";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const scratch = () => { const dir = mkdtempSync(join(tmpdir(), "amc-release-record-")); dirs.push(dir); return dir; };
const COMMIT = "a".repeat(40);

function gatedDir(): string {
  const dir = scratch();
  writeFileSync(join(dir, "agent-maturity-compass-2.0.0.tgz"), "tarball bytes");
  writeFileSync(join(dir, "sbom.cdx.json"), "{}\n");
  return dir;
}

describe("release record (P0-34)", () => {
  test("binds every gated file, the tag and the commit; a clean directory verifies", () => {
    const dir = gatedDir();
    const record = recordFor(dir, { tag: "v2.0.0", commit: COMMIT, tarball: "agent-maturity-compass-2.0.0.tgz" });
    expect(record).toMatchObject({ schema: "amc.release-record/1", tag: "v2.0.0", commit: COMMIT, version: "2.0.0" });
    expect(Object.keys(record.files)).toEqual(["agent-maturity-compass-2.0.0.tgz", "sbom.cdx.json"]);
    expect(verifyRecord(dir, record, { tag: "v2.0.0", commit: COMMIT })).toEqual([]);
  });

  test("a changed, missing or extra file, another commit or another tag fails", () => {
    const dir = gatedDir();
    const record = recordFor(dir, { tag: "v2.0.0", commit: COMMIT, tarball: "agent-maturity-compass-2.0.0.tgz" });
    expect(verifyRecord(dir, record, { tag: "v2.0.0", commit: "b".repeat(40) })).toEqual([`record names commit ${COMMIT}, expected ${"b".repeat(40)}`]);
    expect(verifyRecord(dir, record, { tag: "v2.0.1", commit: COMMIT })).toEqual(["record names tag v2.0.0, expected v2.0.1",
      "record names version 2.0.0, expected 2.0.1"]);
    writeFileSync(join(dir, "agent-maturity-compass-2.0.0.tgz"), "rebuilt bytes");
    writeFileSync(join(dir, "extra.tgz"), "x");
    rmSync(join(dir, "sbom.cdx.json"));
    expect(verifyRecord(dir, record, { tag: "v2.0.0", commit: COMMIT })).toEqual([
      "agent-maturity-compass-2.0.0.tgz: sha256 differs from the gated record", "sbom.cdx.json: missing", "extra.tgz: not in the gated record"]);
    expect(() => recordFor(dir, { tag: "v2.0.0", commit: COMMIT, tarball: "absent.tgz" })).toThrow("absent.tgz is not in");
  });

  test("reads the peeled commit of an annotated tag, else the lightweight tag", () => {
    const listing = `${"1".repeat(40)}\trefs/tags/v2.0.0\n${"2".repeat(40)}\trefs/tags/v2.0.0^{}\n${"3".repeat(40)}\trefs/tags/v2.0.0-rc\n`;
    expect(peeledTagCommit(listing, "v2.0.0")).toBe("2".repeat(40));
    expect(peeledTagCommit(`${"4".repeat(40)}\trefs/tags/v2.0.0\n`, "v2.0.0")).toBe("4".repeat(40));
    expect(peeledTagCommit("", "v2.0.0")).toBeNull();
  });

  test("the tag command refuses a tag that names another commit than the gated one", () => {
    const repo = scratch();
    const git = (...args: string[]) => spawnSync("git", args, { cwd: repo, encoding: "utf8" });
    git("init", "-q");
    git("-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "--allow-empty", "-m", "one");
    git("-c", "user.name=t", "-c", "user.email=t@example.invalid", "tag", "-a", "v2.0.0", "-m", "release");
    const head = git("rev-parse", "HEAD").stdout.trim();
    const script = resolve("scripts/release-record.mjs");
    const tag = (commit: string) => spawnSync(process.execPath, [script, "tag", "v2.0.0", commit, "--remote", "."], { cwd: repo, encoding: "utf8" });
    expect(tag(head).status).toBe(0);
    const moved = tag(COMMIT);
    expect(moved.status).toBe(1);
    expect(moved.stderr).toContain(`v2.0.0 names ${head}, not the gated commit ${COMMIT}`);
  });
});
