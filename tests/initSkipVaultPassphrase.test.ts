import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { lockVault, unlockVault } from "../src/vault/vault.js";
import { AGENT_ENV_MARKERS } from "../src/vault/operatorContext.js";

/**
 * LIVE-VAULT-04: `amc init --skip-vault` sealed the vault with "skip-vault-" + Date.now(), a value the vault file's mtime
 * gives away. It now seals it with a random passphrase that is remembered, never printed, and refuses when remembering
 * is off. Spawns the built CLI (run `npm run build` first), as the other CLI tests do.
 */
const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function initSkipVault(extraEnv: NodeJS.ProcessEnv = {}) {
  const root = mkdtempSync(join(tmpdir(), "amc-init-sv-"));
  roots.push(root);
  const workspace = join(root, "ws");
  const creds = join(root, "creds.json");
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1", AMC_VAULT_REMEMBER_FILE: creds, ...extraEnv };
  for (const name of ["AMC_VAULT_PASSPHRASE", "AMC_VAULT_PASSPHRASE_FILE", "AMC_VAULT_REMEMBER", "GITHUB_ACTIONS", ...AGENT_ENV_MARKERS]) {
    if (!(name in extraEnv)) delete env[name];
  }
  mkdirSync(workspace);
  const result = spawnSync(process.execPath, [resolve(process.cwd(), "dist/cli.js"), "init", "--skip-vault", "--profile", "dev"], {
    cwd: workspace, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
  });
  return { result, workspace, creds };
}

describe("amc init --skip-vault", () => {
  test("seals the vault with a remembered random passphrase and never prints it", () => {
    const { result, workspace, creds } = initSkipVault();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain(`Vault passphrase generated and remembered in ${creds}`);
    expect(result.stdout).not.toContain("skip-vault-");
    expect(result.stdout).not.toContain("export AMC_VAULT_PASSPHRASE=");
    const entries = Object.values(JSON.parse(readFileSync(creds, "utf8")) as Record<string, string>);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatch(/^amc-local-[A-Za-z0-9_-]{24}$/);
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(entries[0]);
    expect(() => unlockVault(workspace, entries[0]!)).not.toThrow();
    lockVault(workspace);
  });

  test("refuses before writing anything when AMC_VAULT_REMEMBER=0", () => {
    const { result, workspace, creds } = initSkipVault({ AMC_VAULT_REMEMBER: "0" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--skip-vault needs a passphrase to remember: export AMC_VAULT_PASSPHRASE, or unset AMC_VAULT_REMEMBER.");
    expect(existsSync(join(workspace, ".amc", "vault.amcvault"))).toBe(false);
    expect(existsSync(creds)).toBe(false);
  });
});
