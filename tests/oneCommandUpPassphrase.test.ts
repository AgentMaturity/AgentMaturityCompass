import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const seam = vi.hoisted(() => ({ vaultExists: false, opensWith: "", answers: {} as Record<string, unknown>, asked: [] as Array<{ name: string; validate?: (v: string) => unknown }>, events: [] as string[], remembered: null as null | { passphrase: string; backend: "file" } }));
vi.mock("../src/vault/vault.js", () => ({ vaultExists: () => seam.vaultExists, vaultOpensWith: (_ws: string, passphrase: string) => passphrase === seam.opensWith }));
vi.mock("inquirer", () => ({ default: { prompt: async (questions: Array<{ name: string; validate?: (v: string) => unknown }>) => {
  seam.asked.push(...questions);
  return Object.fromEntries(questions.map((question) => [question.name, seam.answers[question.name]]));
} } }));
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
beforeEach(() => { for (const name of [...AGENT_ENV_MARKERS, "CI", "GITHUB_ACTIONS", "AMC_VAULT_REMEMBER", "AMC_VAULT_PASSPHRASE_FILE"]) vi.stubEnv(name, undefined); });
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  seam.vaultExists = false;
  seam.opensWith = "";
  seam.answers = {};
  seam.asked = [];
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
    expect(seam.events.slice(0, 3)).toEqual(["load", "No vault passphrase found in a non-interactive shell; generated one for this workspace.", "store"]);
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

// 2026-11-14: amc up in a terminal offered a new passphrase for a vault that already existed, failed the unlock, and
// remembered the wrong passphrase. A vault that exists is asked for its own passphrase, checked before use.
describe("amc up in a terminal with a vault that already exists", () => {
  const original = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  beforeEach(() => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true, writable: true });
    vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
    seam.vaultExists = true;
    seam.opensWith = "the-real-vault-pass";
  });
  afterEach(() => {
    if (original) Object.defineProperty(process.stdin, "isTTY", original);
    else delete (process.stdin as { isTTY?: boolean }).isTTY;
  });

  function workspaceWithSavedFile(value: string): string {
    const root = mkdtempSync(join(tmpdir(), "amc-up-existing-"));
    roots.push(root);
    mkdirSync(join(root, ".amc"));
    writeFileSync(join(root, ".amc", "local-vault-passphrase"), `${value}\n`, { mode: 0o600 });
    return root;
  }

  it("never offers to generate one: it asks for the vault's passphrase and refuses one that does not open it", async () => {
    seam.answers = { entered: "the-real-vault-pass", rememberChoice: true };
    logged();
    await ensureUpVaultPassphrase("/nonexistent/amc-up-ws", true);
    expect(seam.asked.map((question) => question.name)).toEqual(["entered", "rememberChoice"]);
    const validate = seam.asked[0]!.validate!;
    expect(validate("a-new-generated-one")).toBe("That passphrase does not open this vault.");
    expect(validate("the-real-vault-pass")).toBe(true);
    expect(process.env.AMC_VAULT_PASSPHRASE).toBe("the-real-vault-pass");
    expect(seam.events).toContain("store");
  });

  it("offers the passphrase bare amc saved only when it opens the vault, and uses it on a yes", async () => {
    seam.answers = { useSaved: true, rememberChoice: false };
    logged();
    await ensureUpVaultPassphrase(workspaceWithSavedFile("the-real-vault-pass"), true);
    expect(seam.asked.map((question) => question.name)).toEqual(["useSaved", "rememberChoice"]);
    // No key set committed on this machine (a clone, a copy, a 1.x vault): "no" is the default answer (SH-SANDBOX-07).
    expect((seam.asked[0] as { default?: boolean }).default).toBe(false);
    expect(process.env.AMC_VAULT_PASSPHRASE).toBe("the-real-vault-pass");
    expect(seam.events).not.toContain("store");
  });

  it("does not offer a saved file that does not open the vault, and asks instead when the offer is declined", async () => {
    seam.answers = { useSaved: false, entered: "the-real-vault-pass", rememberChoice: false };
    logged();
    await ensureUpVaultPassphrase(workspaceWithSavedFile("some-other-vault-pass"), true);
    expect(seam.asked.map((question) => question.name)).toEqual(["entered", "rememberChoice"]);
    seam.asked = [];
    vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
    await ensureUpVaultPassphrase(workspaceWithSavedFile("the-real-vault-pass"), true);
    expect(seam.asked.map((question) => question.name)).toEqual(["useSaved", "entered", "rememberChoice"]);
  });

  it("does not use a remembered passphrase that no longer opens the vault", async () => {
    seam.remembered = { passphrase: "a-wrong-remembered-one", backend: "file" };
    seam.answers = { entered: "the-real-vault-pass", rememberChoice: true };
    const lines = logged();
    await ensureUpVaultPassphrase("/nonexistent/amc-up-ws", true);
    expect(lines.join("\n")).toContain("does not open this workspace's vault, so it is not used");
    expect(process.env.AMC_VAULT_PASSPHRASE).toBe("the-real-vault-pass");
    expect(seam.events).toContain("store");
  });

  it("still sets up a new passphrase when there is no vault", async () => {
    seam.vaultExists = false;
    seam.answers = { choice: "auto", rememberChoice: false };
    logged();
    await ensureUpVaultPassphrase("/nonexistent/amc-up-ws", true);
    expect(seam.asked.map((question) => question.name)).toEqual(["choice", "rememberChoice"]);
    expect(process.env.AMC_VAULT_PASSPHRASE).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});

// Follow-up 3: amc up honours AMC_VAULT_PASSPHRASE_FILE through the one reader (src/vault/passphraseFile.ts), before
// the remembered store, and a file it refuses is never replaced by a remembered, prompted or generated passphrase.
describe("amc up with AMC_VAULT_PASSPHRASE_FILE", () => {
  const original = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  beforeEach(() => { Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true, writable: true }); });
  afterEach(() => {
    if (original) Object.defineProperty(process.stdin, "isTTY", original);
    else delete (process.stdin as { isTTY?: boolean }).isTTY;
  });
  const secret = (mode: number): string => {
    const dir = mkdtempSync(join(tmpdir(), "amc-up-file-"));
    roots.push(dir);
    writeFileSync(join(dir, "vault.pass"), "up-file-passphrase-123\n", { mode });
    chmodSync(join(dir, "vault.pass"), mode);
    return join(dir, "vault.pass");
  };

  it("uses a private file and never reads the remembered store", async () => {
    vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
    vi.stubEnv("AMC_VAULT_PASSPHRASE_FILE", secret(0o600));
    seam.remembered = { passphrase: "remembered-up-pass-123", backend: "file" };
    const lines = logged();
    await ensureUpVaultPassphrase("/nonexistent/amc-up-ws", true);
    expect(process.env.AMC_VAULT_PASSPHRASE).toBe("up-file-passphrase-123");
    expect(seam.events).not.toContain("load");
    expect(seam.events).not.toContain("store");
    expect(lines.join("\n")).not.toContain("up-file-passphrase-123");
  });

  it("refuses a file the reader refuses, generating and storing nothing", async () => {
    vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
    vi.stubEnv("AMC_VAULT_PASSPHRASE_FILE", secret(0o666));
    logged();
    await expect(ensureUpVaultPassphrase("/nonexistent/amc-up-ws", true)).rejects.toThrow(/^AMC_VAULT_PASSPHRASE_FILE was not used, so the vault stays locked: .*group- or world-writable/);
    expect(seam.events).not.toContain("load");
    expect(seam.events).not.toContain("store");
    expect(process.env.AMC_VAULT_PASSPHRASE).toBeUndefined();
  });

  it("lets AMC_VAULT_PASSPHRASE win over the file", async () => {
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "explicit-up-pass-123");
    vi.stubEnv("AMC_VAULT_PASSPHRASE_FILE", "/nonexistent/amc-up-passphrase");
    logged();
    await ensureUpVaultPassphrase("/nonexistent/amc-up-ws", true);
    expect(process.env.AMC_VAULT_PASSPHRASE).toBe("explicit-up-pass-123");
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
