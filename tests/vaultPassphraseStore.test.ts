import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  forgetVaultPassphrase,
  getRememberedVaultPassphrase,
  rememberVaultPassphrase
} from "../src/vault/passphraseStore.js";

describe("vault passphrase store (file backend)", () => {
  const dirs: string[] = [];

  function tempEnv(): { env: NodeJS.ProcessEnv; file: string; workspace: string } {
    const dir = mkdtempSync(join(tmpdir(), "amc-remember-"));
    dirs.push(dir);
    const file = join(dir, "credentials.json");
    return { env: { AMC_VAULT_REMEMBER_FILE: file } as NodeJS.ProcessEnv, file, workspace: join(dir, "ws") };
  }

  afterEach(() => {
    while (dirs.length > 0) {
      const dir = dirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  test("remember, read back, and forget round-trip with 0600 file mode", () => {
    const { env, file, workspace } = tempEnv();
    expect(getRememberedVaultPassphrase(workspace, env)).toBeNull();

    const saved = rememberVaultPassphrase(workspace, "secret-pass-123", env);
    expect(saved.backend).toBe("file");
    expect(saved.location).toBe(file);
    expect(statSync(file).mode & 0o777).toBe(0o600);

    expect(getRememberedVaultPassphrase(workspace, env)?.passphrase).toBe("secret-pass-123");
    expect(getRememberedVaultPassphrase(workspace, env)?.backend).toBe("file");
    expect(getRememberedVaultPassphrase(join(workspace, "other"), env)).toBeNull();

    expect(forgetVaultPassphrase(workspace, env)).toBe(true);
    expect(getRememberedVaultPassphrase(workspace, env)).toBeNull();
    expect(forgetVaultPassphrase(workspace, env)).toBe(false);
  });

  test("stores are isolated per workspace path", () => {
    const { env, workspace } = tempEnv();
    rememberVaultPassphrase(workspace, "pass-a", env);
    rememberVaultPassphrase(`${workspace}-b`, "pass-b", env);
    expect(getRememberedVaultPassphrase(workspace, env)?.passphrase).toBe("pass-a");
    expect(getRememberedVaultPassphrase(`${workspace}-b`, env)?.passphrase).toBe("pass-b");
    forgetVaultPassphrase(workspace, env);
    expect(getRememberedVaultPassphrase(`${workspace}-b`, env)?.passphrase).toBe("pass-b");
  });

  test("disabled via AMC_VAULT_REMEMBER=0", () => {
    const { env, workspace } = tempEnv();
    const disabled = { ...env, AMC_VAULT_REMEMBER: "0" } as NodeJS.ProcessEnv;
    expect(getRememberedVaultPassphrase(workspace, disabled)).toBeNull();
    expect(() => rememberVaultPassphrase(workspace, "x", disabled)).toThrow(/disabled/);
  });
});
