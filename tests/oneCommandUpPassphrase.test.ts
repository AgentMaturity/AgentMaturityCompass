import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const seam = vi.hoisted(() => ({ vaultExists: false, events: [] as string[] }));
vi.mock("../src/vault/vault.js", () => ({ vaultExists: () => seam.vaultExists }));
vi.mock("../src/vault/passphraseStore.js", () => ({
  getRememberedVaultPassphrase: () => null,
  rememberedLocation: () => "the store",
  rememberedStores: () => "the macOS Keychain (service amc-vault) or /home/x/.config/amc/vault-credentials.json",
  rememberVaultPassphrase: () => { seam.events.push("store"); return { backend: "file", location: "/home/x/.config/amc/vault-credentials.json" }; }
}));

import { ensureUpVaultPassphrase, printConsoleSignInStep } from "../src/studio/oneCommandUp.js";

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  seam.vaultExists = false;
  seam.events = [];
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function logged(): string[] {
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { const line = stripVTControlCharacters(args.join(" ")); lines.push(line); seam.events.push(line); });
  return lines;
}

describe("amc up in a non-interactive shell (B1)", () => {
  const original = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  beforeEach(() => { Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true, writable: true }); });
  afterEach(() => {
    if (original) Object.defineProperty(process.stdin, "isTTY", original);
    else delete (process.stdin as { isTTY?: boolean }).isTTY;
  });

  it("announces the generated passphrase before it tries to store it", async () => {
    vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
    logged();
    await ensureUpVaultPassphrase("/nonexistent/amc-up-ws", true);
    expect(process.env.AMC_VAULT_PASSPHRASE).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const generated = seam.events.findIndex((line) => line.includes("generated one for this workspace"));
    expect(generated).toBeGreaterThanOrEqual(0);
    expect(seam.events.indexOf("store")).toBeGreaterThan(generated);
    expect(seam.events.join("\n")).not.toContain(process.env.AMC_VAULT_PASSPHRASE!);
  });

  it("never invents a passphrase for a vault that already exists", async () => {
    vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
    seam.vaultExists = true;
    logged();
    await expect(ensureUpVaultPassphrase("/nonexistent/amc-up-ws", true)).rejects.toThrow(/already has a vault.*AMC_VAULT_PASSPHRASE or in the macOS Keychain/);
    expect(seam.events).not.toContain("store");
    expect(process.env.AMC_VAULT_PASSPHRASE).toBeUndefined();
  });
});

describe("amc up names the console sign-in step (B2)", () => {
  it("says how to create the first account while none exists, and nothing after", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-up-signin-"));
    roots.push(workspace);
    const lines = logged();
    printConsoleSignInStep(workspace, "http://127.0.0.1:3212/console");
    expect(lines.join("\n")).toContain("amc user init --username <you>");
    expect(lines.join("\n")).toContain("http://127.0.0.1:3212/console");
    lines.length = 0;
    mkdirSync(join(workspace, ".amc"));
    writeFileSync(join(workspace, ".amc", "users.yaml"), "users: []\n");
    printConsoleSignInStep(workspace, "http://127.0.0.1:3212/console");
    expect(lines).toEqual([]);
  });
});
