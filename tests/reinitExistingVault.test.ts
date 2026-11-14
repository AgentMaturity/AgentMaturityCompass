import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { lockVault } from "../src/vault/vault.js";

// CLI-09: a second `amc quickstart --minimal` generated a new passphrase for the existing vault and failed with
// "Vault unlock failed: incorrect passphrase or corrupted vault", although no passphrase was given.
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("setting up a folder that already has a vault", () => {
  test.each([["quickstart", "--minimal"], ["init", "--minimal"]])("amc %s %s leaves the vault alone and says so", (...args) => {
    const root = mkdtempSync(join(tmpdir(), "amc-reinit-vault-"));
    roots.push(root);
    const previous = process.env.AMC_VAULT_PASSPHRASE;
    process.env.AMC_VAULT_PASSPHRASE = "synthetic-reinit-vault-passphrase";
    try { initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" }); } finally {
      lockVault(root);
      if (previous === undefined) delete process.env.AMC_VAULT_PASSPHRASE; else process.env.AMC_VAULT_PASSPHRASE = previous;
    }
    const vaultBefore = readFileSync(join(root, ".amc", "vault.amcvault"));
    const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1", HOME: root, AMC_VAULT_PASSPHRASE: "", AMC_VAULT_PASSPHRASE_FILE: "" };
    const run = spawnSync(process.execPath, ["--import", resolve("node_modules/tsx/dist/loader.mjs"), resolve("src/cli.ts"), ...args],
      { cwd: root, env, encoding: "utf8", timeout: 120_000, input: "" });
    const output = `${run.stdout}\n${run.stderr}`;
    expect(run.status, output).toBe(0);
    expect(output).not.toContain("Vault unlock failed");
    expect(output).toContain("already has an AMC vault");
    expect(readFileSync(join(root, ".amc", "vault.amcvault"))).toEqual(vaultBefore);
  }, 180_000);
});
