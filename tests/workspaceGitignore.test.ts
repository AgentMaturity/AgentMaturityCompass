import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";

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
