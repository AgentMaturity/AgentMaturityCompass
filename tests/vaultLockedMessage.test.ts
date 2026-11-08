/**
 * Follow-up 5: the "Vault locked" signing refusal suggested only `amc vault unlock`, which refuses without a terminal
 * (cron, `docker exec`, `kubectl exec`, agent shells). The text is now written once (src/vault/vaultLockedError.ts),
 * names the paths that work (AMC_VAULT_PASSPHRASE, AMC_VAULT_PASSPHRASE_FILE, `amc vault unlock` from a terminal), and
 * keeps the fixed prefix the readers map to 423 VAULT_LOCKED.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { respondUsersMutationError } from "../src/auth/authApi.js";
import { respondReportSigningError } from "../src/studio/reportSigningError.js";
import { getVaultPrivateKeyPem, lockVault } from "../src/vault/vault.js";
import { isVaultLockedError, VAULT_LOCKED_MESSAGE, VAULT_LOCKED_NO_SIGN_MESSAGE, VAULT_LOCKED_PREFIX } from "../src/vault/vaultLockedError.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  while (roots.length > 0) {
    const root = roots.pop()!;
    lockVault(root);
    rmSync(root, { recursive: true, force: true });
  }
});

function lockedWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-vault-locked-msg-"));
  roots.push(root);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-vault-locked-message");
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  lockVault(root);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
  return root;
}

const thrown = (run: () => unknown): Error => {
  try { run(); } catch (error) { return error as Error; }
  throw new Error("expected a refusal");
};

describe("the Vault locked refusal", () => {
  test("names the paths that work without a terminal, and keeps the prefix", () => {
    for (const message of [VAULT_LOCKED_MESSAGE, VAULT_LOCKED_NO_SIGN_MESSAGE]) {
      expect(message.startsWith(VAULT_LOCKED_PREFIX)).toBe(true);
      expect(message).toContain("Export AMC_VAULT_PASSPHRASE, or set AMC_VAULT_PASSPHRASE_FILE, or run `amc vault unlock` from a terminal");
      expect(message).not.toContain("Run `amc vault unlock` first");
    }
  });

  test("a locked vault throws the central text, and both readers map it to 423 VAULT_LOCKED", () => {
    const error = thrown(() => getVaultPrivateKeyPem(lockedWorkspace(), "monitor"));
    expect([VAULT_LOCKED_MESSAGE, VAULT_LOCKED_NO_SIGN_MESSAGE]).toContain(error.message);
    expect(isVaultLockedError(error)).toBe(true);
    const replies: Array<[number, string | undefined]> = [];
    expect(respondReportSigningError(error, (status, body) => replies.push([status, body.code]))).toBe(true);
    expect(respondUsersMutationError({ method: "POST", url: "/users/add" }, error, (status, body) => replies.push([status, body.code]))).toBe(true);
    expect(replies).toEqual([[423, "VAULT_LOCKED"], [423, "VAULT_LOCKED"]]);
  });

  test("other errors are not read as a locked vault", () => {
    for (const error of [new Error("Vault unlock failed"), new Error(`signing refused: ${VAULT_LOCKED_PREFIX}`), "🔐 Vault locked. (not an Error)"]) {
      expect(isVaultLockedError(error)).toBe(false);
      expect(respondReportSigningError(error, () => undefined)).toBe(false);
    }
  });

  test("no source file writes its own Vault locked text: every throw uses vaultLockedError.ts", () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|js)$/.test(name) && path !== join("src", "vault", "vaultLockedError.ts")
          && /["'`]🔐 Vault locked\./.test(readFileSync(path, "utf8"))) offenders.push(path);
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
  });
});
