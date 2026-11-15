import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

const store = vi.hoisted(() => ({ enabled: true, calls: [] as Array<{ workspace: string; passphrase: string }> }));
vi.mock("../../src/vault/passphraseStore.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/vault/passphraseStore.js")>()),
  rememberEnabled: () => store.enabled,
  rememberVaultPassphrase: (workspace: string, passphrase: string) => {
    store.calls.push({ workspace, passphrase });
    return { backend: "file", location: "/fixture/amc-home/vault-credentials.json" };
  }
}));

import { runQuickSetup } from "../../src/setup/quickSetup.js";
import { lockVault } from "../../src/vault/vault.js";

/** LIVE-VAULT-15: `amc setup` remembers the passphrase it generates (never printing it), or refuses when it cannot. */
const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  store.enabled = true;
  store.calls = [];
  while (roots.length > 0) {
    const root = roots.pop()!;
    lockVault(root);
    rmSync(root, { recursive: true, force: true });
  }
});

function setup(lines: string[]) {
  const cwd = mkdtempSync(join(tmpdir(), "amc-setup-pass-"));
  roots.push(cwd);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
  return { cwd, run: () => runQuickSetup({ cwd, provider: "openai", auto: true, logger: { log: (...args: unknown[]) => lines.push(args.join(" ")) } }) };
}

describe("amc setup with no AMC_VAULT_PASSPHRASE", () => {
  test("remembers the generated passphrase once and never logs it", async () => {
    const lines: string[] = [];
    const { cwd, run } = setup(lines);
    await run();
    const generated = process.env.AMC_VAULT_PASSPHRASE!;
    expect(generated).toMatch(/^amc-local-[A-Za-z0-9_-]{24}$/);
    expect(store.calls).toEqual([{ workspace: cwd, passphrase: generated }]);
    expect(lines).toContain("Vault passphrase generated and remembered in /fixture/amc-home/vault-credentials.json.");
    expect(lines.join("\n")).not.toContain(generated);
  });

  // CLI-24: a second run without a terminal stopped on a bare "vault locked" that pointed back at amc setup.
  test("a second run with the vault locked says why and what to do", async () => {
    const lines: string[] = [];
    const { cwd, run } = setup(lines);
    await run();
    lockVault(cwd);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
    await expect(run()).rejects.toThrow("This folder is already set up, and its vault is locked. Without a terminal, AMC does not use the passphrase");
    expect(store.calls).toHaveLength(1);
  });

  test("refuses before the workspace is created when remembering is off", async () => {
    const lines: string[] = [];
    const { cwd, run } = setup(lines);
    store.enabled = false;
    await expect(run()).rejects.toThrow("amc setup needs a passphrase to remember: export AMC_VAULT_PASSPHRASE, or unset AMC_VAULT_REMEMBER.");
    expect(existsSync(join(cwd, ".amc"))).toBe(false);
    expect(store.calls).toEqual([]);
  });
});
