import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { lockVault } from "../src/vault/vault.js";

// CLI-02: `amc vault unlock` unlocks only its own process; it must say so instead of "Vault unlocked: yes".
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function amc(cwd: string, args: string[], env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ["--import", resolve("node_modules/tsx/dist/loader.mjs"), resolve("src/cli.ts"), ...args],
    { cwd, env: { ...env, NO_COLOR: "1" }, encoding: "utf8", timeout: 120_000 });
}

describe("amc vault unlock", () => {
  test("says the unlock lasted only for its own command and names what reaches the next one", () => {
    const passphrase = "synthetic-vault-unlock-honest";
    const root = mkdtempSync(join(tmpdir(), "amc-vault-unlock-honest-"));
    roots.push(root);
    const previous = process.env.AMC_VAULT_PASSPHRASE;
    process.env.AMC_VAULT_PASSPHRASE = passphrase;
    try { initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" }); } finally {
      lockVault(root);
      if (previous === undefined) delete process.env.AMC_VAULT_PASSPHRASE; else process.env.AMC_VAULT_PASSPHRASE = previous;
    }
    const env: NodeJS.ProcessEnv = { ...process.env, AMC_VAULT_PASSPHRASE: passphrase, HOME: root };
    const unlock = amc(root, ["vault", "unlock"], env);
    expect(unlock.status, unlock.stderr).toBe(0);
    expect(unlock.stdout).not.toContain("Vault unlocked: yes");
    expect(unlock.stdout).toContain("unlocked only while this command ran");
    expect(unlock.stdout).toContain("Export AMC_VAULT_PASSPHRASE, or set AMC_VAULT_PASSPHRASE_FILE");

    const status = amc(root, ["vault", "status"], { ...env, AMC_VAULT_PASSPHRASE: "" });
    expect(status.stdout).toContain("unlocked=no"); // what the unlock output told the user to expect
  }, 180_000);
});
