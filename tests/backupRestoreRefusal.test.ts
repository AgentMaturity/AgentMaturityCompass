/**
 * P2-06-D4: `amc backup restore` decides every refusal before it writes. A restore with --force into another
 * workspace's initialised directory is refused and leaves that workspace's bytes unchanged.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createBackup, restoreBackup } from "../src/ops/backup/backupEngine.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";
import { workspaceKeyTrust } from "./helpers/trustContext.js";

const BACKUP_PASS = "restore-refusal-backup-passphrase";
const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    for (const ws of ["a", "b", "c"]) lockVault(join(root, ws));
    rmSync(root, { recursive: true, force: true });
  }
});

/** Every file under dir with its bytes, so a test can show a tree is byte-for-byte unchanged. */
function treeBytes(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (path: string): void => {
    for (const name of readdirSync(path)) {
      const full = join(path, name);
      if (statSync(full).isDirectory()) walk(full);
      else out[relative(dir, full)] = readFileSync(full).toString("base64");
    }
  };
  walk(dir);
  return out;
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), "amc-restore-refusal-"));
  roots.push(root);
  vi.stubEnv("AMC_BACKUP_PASSPHRASE", BACKUP_PASS);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "restore-refusal-vault-passphrase");
  const a = join(root, "a"), b = join(root, "b");
  mkdirSync(a); mkdirSync(b);
  initWorkspace({ workspacePath: a, trustBoundaryMode: "isolated" });
  initWorkspace({ workspacePath: b, trustBoundaryMode: "isolated" });
  const backup = createBackup({ workspace: a, outFile: join(root, "a.amcbackup") });
  return { root, a, b, backup };
}

it("refuses --force into another workspace and leaves its bytes unchanged", async () => {
  const { a, b, backup } = setup();
  const before = treeBytes(b);
  await expect(restoreBackup({ backupFile: backup.outFile, toDir: b, force: true, passphrase: BACKUP_PASS, trust: workspaceKeyTrust(a) }))
    .rejects.toThrow(/another workspace/);
  expect(treeBytes(b)).toEqual(before);
});

it("refuses --force into another workspace on a machine that holds no marks for it", async () => {
  const { root, a, b, backup } = setup();
  vi.stubEnv("AMC_HOME", join(root, "other-machine"));
  const before = treeBytes(b);
  await expect(restoreBackup({ backupFile: backup.outFile, toDir: b, force: true, passphrase: BACKUP_PASS, trust: workspaceKeyTrust(a) }))
    .rejects.toThrow(/another workspace/);
  expect(treeBytes(b)).toEqual(before);
});

it("refuses a path where this machine accepted another key set, even with no workspace left there", async () => {
  const { root, a, b, backup } = setup();
  renameSync(join(b, ".amc"), join(root, "b-amc-moved"));
  await expect(restoreBackup({ backupFile: backup.outFile, toDir: b, force: true, passphrase: BACKUP_PASS, trust: workspaceKeyTrust(a) }))
    .rejects.toThrow(/FORK_DETECTED/);
  expect(readdirSync(b)).toEqual([]);
});

it("refuses without --force into an existing directory and leaves it unchanged", async () => {
  const { a, b, backup } = setup();
  const before = treeBytes(b);
  await expect(restoreBackup({ backupFile: backup.outFile, toDir: b, passphrase: BACKUP_PASS, trust: workspaceKeyTrust(a) }))
    .rejects.toThrow(/already exists/);
  expect(treeBytes(b)).toEqual(before);
});

it("restores into a new directory and, with --force, back over the same workspace", async () => {
  const { root, a, backup } = setup();
  const c = join(root, "c");
  const fresh = await restoreBackup({ backupFile: backup.outFile, toDir: c, passphrase: BACKUP_PASS, trust: workspaceKeyTrust(a) });
  expect(fresh.restoredTo).toBe(c);
  const again = await restoreBackup({ backupFile: backup.outFile, toDir: c, force: true, passphrase: BACKUP_PASS, trust: workspaceKeyTrust(a) });
  expect(again.restoredTo).toBe(c);
  expect(again.replacedTo).toMatch(/\.amc-pre-restore-/);
  expect(readdirSync(again.replacedTo!)).toEqual([".amc"]);
});

it("leaves no partial workspace when a write after the checks fails (new directory)", async () => {
  const { root, a, backup } = setup();
  const c = join(root, "c");
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "not-the-vault-passphrase"); // the restore's own audit row cannot be signed
  await expect(restoreBackup({ backupFile: backup.outFile, toDir: c, passphrase: BACKUP_PASS, trust: workspaceKeyTrust(a) })).rejects.toThrow();
  expect(readdirSync(root).sort()).toEqual(["a", "a.amcbackup", "b"]);
});

it("leaves the workspace unchanged when a write after the checks fails (--force over the same workspace)", async () => {
  const { root, a, backup } = setup();
  const c = join(root, "c");
  await restoreBackup({ backupFile: backup.outFile, toDir: c, passphrase: BACKUP_PASS, trust: workspaceKeyTrust(a) });
  lockVault(c);
  const before = treeBytes(c);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "not-the-vault-passphrase");
  await expect(restoreBackup({ backupFile: backup.outFile, toDir: c, force: true, passphrase: BACKUP_PASS, trust: workspaceKeyTrust(a) })).rejects.toThrow();
  expect(treeBytes(c)).toEqual(before);
});
