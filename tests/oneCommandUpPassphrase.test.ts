import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const seam = vi.hoisted(() => ({ vaultExists: false, events: [] as string[], remembered: null as null | { passphrase: string; backend: "file" } }));
vi.mock("../src/vault/vault.js", () => ({ vaultExists: () => seam.vaultExists }));
vi.mock("../src/vault/passphraseStore.js", () => ({
  getRememberedVaultPassphrase: () => { seam.events.push("load"); return seam.remembered; },
  rememberEnabled: (env: NodeJS.ProcessEnv = process.env) => !["0", "false", "off", "no"].includes((env.AMC_VAULT_REMEMBER ?? "").trim().toLowerCase()),
  rememberedLocation: () => "the store",
  rememberedStores: () => "the macOS Keychain (service amc-vault) or /home/x/.config/amc/vault-credentials.json",
  rememberVaultPassphrase: () => { seam.events.push("store"); return { backend: "file", location: "/home/x/.config/amc/vault-credentials.json" }; }
}));

import { ensureUpVaultPassphrase, printConsoleSignInStep } from "../src/studio/oneCommandUp.js";
import { AGENT_ENV_MARKERS } from "../src/vault/operatorContext.js";

const roots: string[] = [];
// The vitest worker inherits CLAUDECODE from a Claude Code shell; amc up refuses the store under it (LIVE-VAULT-01). A CI
// runner sets CI/GITHUB_ACTIONS, under which amc up never generates a passphrase (LIVE-VAULT-03).
beforeEach(() => { for (const name of [...AGENT_ENV_MARKERS, "CI", "GITHUB_ACTIONS", "AMC_VAULT_REMEMBER"]) vi.stubEnv(name, undefined); });
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  seam.vaultExists = false;
  seam.events = [];
  seam.remembered = null;
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

  it("never prints the generated passphrase or an export line for it, and names the store the operator's terminal reads", async () => {
    vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
    const lines = logged();
    await ensureUpVaultPassphrase("/nonexistent/amc-up-ws", true);
    expect(lines.some((line) => line.includes("export AMC_VAULT_PASSPHRASE="))).toBe(false);
    expect(lines.join("\n")).not.toContain(process.env.AMC_VAULT_PASSPHRASE!);
    expect(lines.join("\n")).toContain("Your own terminal (same user, same AMC_HOME) unlocks from that store; export AMC_VAULT_PASSPHRASE for other hosts.");
  });

  it.each(["CI", "GITHUB_ACTIONS"])("does not generate a passphrase on a CI runner (%s set), whose store dies with the job (LIVE-VAULT-03)", async (name) => {
    vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
    vi.stubEnv(name, "true");
    const lines = logged();
    const error = (await ensureUpVaultPassphrase("/nonexistent/amc-up-ws", true).catch((caught: unknown) => caught)) as Error;
    expect(error.message).toMatch(/^A CI runner's remembered store does not outlive the job, so amc up does not generate a passphrase here\.\n🔐 Vault passphrase required in non-interactive shells\./);
    expect(error.message).toContain("Option 2 — first-time setup in a terminal (remembers a generated passphrase):");
    expect(seam.events).not.toContain("store");
    expect(lines.join("\n")).not.toContain("generated one");
    expect(process.env.AMC_VAULT_PASSPHRASE).toBeUndefined();
  });

  it("with AMC_VAULT_REMEMBER=0 and no vault, refuses to generate instead of failing after it (Linux D4)", async () => {
    vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
    vi.stubEnv("AMC_VAULT_REMEMBER", "0");
    const lines = logged();
    await expect(ensureUpVaultPassphrase("/nonexistent/amc-up-ws", true)).rejects.toThrow(/^🔐 Vault passphrase required in non-interactive shells\.\n\nOption 1 — set passphrase/);
    expect(seam.events).not.toContain("store");
    expect(seam.events).not.toContain("load");
    expect(lines.join("\n")).not.toContain("generated one");
    expect(process.env.AMC_VAULT_PASSPHRASE).toBeUndefined();
  });

  it("with AMC_VAULT_REMEMBER=0 and a vault, names the opt-out instead of stores it does not read", async () => {
    vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
    vi.stubEnv("AMC_VAULT_REMEMBER", "0");
    seam.vaultExists = true;
    logged();
    const error = (await ensureUpVaultPassphrase("/nonexistent/amc-up-ws", true).catch((caught: unknown) => caught)) as Error;
    expect(error.message).toContain("already has a vault");
    expect(error.message).toContain("remembering is disabled by AMC_VAULT_REMEMBER=0");
    expect(error.message).not.toContain("vault-credentials.json");
    expect(seam.events).not.toContain("load");
  });

  it("never invents a passphrase for a vault that already exists", async () => {
    vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
    seam.vaultExists = true;
    logged();
    await expect(ensureUpVaultPassphrase("/nonexistent/amc-up-ws", true)).rejects.toThrow(/already has a vault.*AMC_VAULT_PASSPHRASE or in the macOS Keychain/);
    expect(seam.events).not.toContain("store");
    expect(process.env.AMC_VAULT_PASSPHRASE).toBeUndefined();
  });

  it("does not read the remembered store in a shell carrying an agent marker (LIVE-VAULT-01)", async () => {
    vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
    vi.stubEnv("CLAUDECODE", "1");
    seam.remembered = { passphrase: "remembered-up-pass-123", backend: "file" };
    logged();
    await expect(ensureUpVaultPassphrase("/nonexistent/amc-up-ws", true)).rejects.toThrow(
      /This shell carries the agent marker CLAUDECODE, so amc up does not use a remembered vault passphrase here\. Export AMC_VAULT_PASSPHRASE deliberately/);
    expect(seam.events).not.toContain("load");
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
    // Without a terminal the remembered passphrase is not used, so a password file alone meets a locked vault (final review).
    expect(lines.join("\n")).toContain("Without a terminal, export AMC_VAULT_PASSPHRASE (or set AMC_VAULT_PASSPHRASE_FILE) first, "
      + "then run amc user init --username <you> --password-file <file>.");
    lines.length = 0;
    mkdirSync(join(workspace, ".amc"));
    writeFileSync(join(workspace, ".amc", "users.yaml"), "users: []\n");
    printConsoleSignInStep(workspace, "http://127.0.0.1:3212/console");
    expect(lines).toEqual([]);
  });
});
