import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runDoctorFix } from "../src/doctor/doctorFix.js";
import { amcGitignoreCheck } from "../src/doctor/secretFileChecks.js";
import { initWorkspace } from "../src/workspace.js";
import { ensureAmcGitignore } from "../src/workspaceGitignore.js";

/**
 * H1: a new workspace keeps its secrets and runtime state out of git. A committed .amc workspace is supported (the GitHub
 * Action uses one as it is), so only those are ignored; signed configuration, keys' public halves, the encrypted vault
 * and the evidence stay committable. An operator's own .amc/.gitignore is never replaced.
 */
const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

// The developer's own git configuration and global excludes stay out of the verdicts.
const gitEnv = (root: string) => ({ ...process.env, GIT_CONFIG_GLOBAL: join(root, "no-gitconfig"), GIT_CONFIG_NOSYSTEM: "1", XDG_CONFIG_HOME: root, HOME: root });

function repoWithWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-gitignore-"));
  roots.push(root);
  expect(spawnSync("git", ["init", "-q"], { cwd: root, env: gitEnv(root) }).status).toBe(0);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "gitignore-test-pass-123");
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}

function ignored(root: string, path: string): boolean {
  const result = spawnSync("git", ["check-ignore", "-q", "--no-index", path], { cwd: root, env: gitEnv(root) });
  expect([0, 1]).toContain(result.status);
  return result.status === 0;
}

describe("a new workspace's .amc/.gitignore", () => {
  it("ignores secrets and runtime state and leaves the committable workspace alone", () => {
    const root = repoWithWorkspace();
    for (const path of [".amc/local-vault-passphrase", ".amc/studio/admin.token", ".amc/studio/state.json", ".amc/studio/sessions/s.json",
      ".amc/studio-demo-host/demo-vault-passphrase", ".amc/blobs/unvaulted.key", ".amc/license.key", ".amc/hooks/claude-code.lease",
      ".amc/auth/api-keys.json", ".amc/evidence.sqlite-shm", ".amc/.keyset-locks/x.lock"]) {
      expect(ignored(root, path), path).toBe(true);
    }
    for (const path of [".amc/.gitignore", ".amc/vault.amcvault", ".amc/trust.yaml", ".amc/trust.yaml.sig", ".amc/keys/monitor_ed25519.pub",
      ".amc/keys/keyset.json", ".amc/evidence.sqlite", ".amc/blobs/index.jsonl", ".amc/plugins/installed.lock.json", ".amc/action-policy.yaml"]) {
      expect(ignored(root, path), path).toBe(false);
    }
  });

  it("never replaces one the operator already has", () => {
    const root = mkdtempSync(join(tmpdir(), "amc-gitignore-own-"));
    roots.push(root);
    mkdirSync(join(root, ".amc"));
    writeFileSync(join(root, ".amc", ".gitignore"), "*\n");
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "gitignore-test-pass-123");
    initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
    expect(readFileSync(join(root, ".amc", ".gitignore"), "utf8")).toBe("*\n");
  });
});

describe("amc doctor's amc-gitignore check (LIVE-VAULT-11)", () => {
  const git = (root: string, ...args: string[]) => spawnSync("git", args, { cwd: root, env: gitEnv(root), encoding: "utf8" });

  it("fails while .amc/.gitignore is missing, and passes once it is written", () => {
    const root = repoWithWorkspace();
    rmSync(join(root, ".amc", ".gitignore"));
    const missing = amcGitignoreCheck(root, gitEnv(root));
    expect(missing).toMatchObject({ id: "amc-gitignore", status: "FAIL", message: ".amc/local-vault-passphrase is not git-ignored in this repository" });
    expect(missing.fixHint).toContain("amc up (writes .amc/.gitignore once)");
    ensureAmcGitignore(join(root, ".amc"));
    expect(amcGitignoreCheck(root, gitEnv(root))).toEqual({ id: "amc-gitignore", status: "PASS", message: ".amc secrets are git-ignored" });
  });

  it("fails for a secret committed before the ignore file existed, and says to remove and rotate it", () => {
    const root = repoWithWorkspace();
    mkdirSync(join(root, ".amc", "studio"), { recursive: true });
    writeFileSync(join(root, ".amc", "studio", "admin.token"), `${"a".repeat(64)}\n`);
    expect(git(root, "add", "-f", ".amc/studio/admin.token").status).toBe(0);
    expect(git(root, "-c", "user.email=t@example.invalid", "-c", "user.name=t", "commit", "-q", "-m", "x").status).toBe(0);
    const tracked = amcGitignoreCheck(root, gitEnv(root));
    expect(tracked).toMatchObject({ status: "FAIL", message: ".amc/studio/admin.token is committed to this repository" });
    expect(tracked.fixHint).toBe('Run: git rm --cached .amc/studio/admin.token && git commit, then rotate it (docs/VAULT.md "When to rotate")');
  });

  it("amc doctor-fix writes a missing .amc/.gitignore, and leaves it missing under --dry-run", async () => {
    const root = repoWithWorkspace();
    rmSync(join(root, ".amc", ".gitignore"));
    await runDoctorFix(root, { dryRun: true });
    expect(existsSync(join(root, ".amc", ".gitignore"))).toBe(false);
    await runDoctorFix(root);
    expect(amcGitignoreCheck(root, gitEnv(root))).toMatchObject({ status: "PASS" });
  });

  it("is INFO outside a git repository", () => {
    const root = mkdtempSync(join(tmpdir(), "amc-gitignore-norepo-"));
    roots.push(root);
    mkdirSync(join(root, ".amc"));
    expect(amcGitignoreCheck(root, gitEnv(root))).toMatchObject({ id: "amc-gitignore", status: "INFO" });
  });
});
