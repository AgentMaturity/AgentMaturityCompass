import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { diffSnapshots, snapshotDirectory, toPosixPath } from "./setup/repoWorkspaceGuard.global.js";

describe("repository workspace guard helpers", () => {
  const roots: string[] = [];
  const tempRoot = (): string => {
    const root = mkdtempSync(join(tmpdir(), "amc-repo-guard-"));
    roots.push(root);
    return root;
  };

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  test("no change gives an empty diff", () => {
    const root = tempRoot();
    writeFileSync(join(root, "trust.yaml"), "a");
    expect(diffSnapshots(snapshotDirectory(root), snapshotDirectory(root))).toEqual([]);
  });

  test("lists changed, created and deleted files by relative path", () => {
    const root = tempRoot();
    writeFileSync(join(root, "changed.yaml"), "before");
    writeFileSync(join(root, "deleted.yaml"), "gone");
    const before = snapshotDirectory(root);
    writeFileSync(join(root, "changed.yaml"), "after");
    writeFileSync(join(root, "created.yaml"), "new");
    unlinkSync(join(root, "deleted.yaml"));
    expect(diffSnapshots(before, snapshotDirectory(root))).toEqual([
      "changed.yaml (changed)",
      "created.yaml (created)",
      "deleted.yaml (deleted)"
    ]);
  });

  test("lists a change inside a nested directory", () => {
    const root = tempRoot();
    mkdirSync(join(root, "keys"));
    writeFileSync(join(root, "keys", "auditor_ed25519.pub"), "old key");
    const before = snapshotDirectory(root);
    writeFileSync(join(root, "keys", "auditor_ed25519.pub"), "new key");
    expect(diffSnapshots(before, snapshotDirectory(root))).toEqual(["keys/auditor_ed25519.pub (changed)"]);
  });

  test("a missing directory snapshots as empty", () => {
    expect(snapshotDirectory(join(tempRoot(), "absent"))).toEqual({});
  });

  test("normalises Windows-style separators to /", () => {
    expect(toPosixPath("keys\\auditor_ed25519.pub")).toBe("keys/auditor_ed25519.pub");
    expect(toPosixPath("transparency\\log\\0001.json")).toBe("transparency/log/0001.json");
  });
});
