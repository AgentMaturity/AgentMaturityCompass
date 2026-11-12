/**
 * B1(b) (final overseer review, 2026-11-08): every `amc` command reads AMC_VAULT_PASSPHRASE_FILE, the form every documented
 * container sets (docker/entrypoint.sh, the Compose files, the Helm chart), when AMC_VAULT_PASSPHRASE is unset; the
 * variable wins. The file is read like the other private operator secret files (readPrivateTokenFile): a regular file
 * owned by this user, closed to group and others, never a symlink. Its value opens the vault in this process only: it
 * never enters the environment, so no child inherits it, and it is never printed. It is an explicit operator secret like
 * AMC_VAULT_PASSPHRASE, so the remembered-store operator gate does not apply; while it is set the store is not read.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { usersConfigPath } from "../src/auth/authApi.js";
import { startGateway } from "../src/gateway/server.js";
import { sha256Hex } from "../src/utils/hash.js";
import { AGENT_ENV_MARKERS } from "../src/vault/operatorContext.js";
import { unlockWithPassphraseFile } from "../src/vault/passphraseFile.js";
import { rememberVaultPassphrase, unlockWithRememberedPassphrase } from "../src/vault/passphraseStore.js";
import { lockVault, vaultStatus } from "../src/vault/vault.js";
import { unlockVaultInteractive } from "../src/vault/vaultCli.js";
import { initWorkspace } from "../src/workspace.js";

const PASSPHRASE = "synthetic-passphrase-file-vault";
const roots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  while (roots.length > 0) {
    const root = roots.pop()!;
    lockVault(join(root, "ws"));
    rmSync(root, { recursive: true, force: true });
  }
});

/** A workspace whose vault is locked in this process, with no passphrase in the environment. */
function fixture() {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", PASSPHRASE);
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
  const root = mkdtempSync(join(tmpdir(), "amc-passphrase-file-"));
  roots.push(root);
  const workspace = join(root, "ws");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  lockVault(workspace);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
  const secret = (value: string, mode: number, name = `vault-${mode.toString(8)}.pass`) => {
    const file = join(root, name);
    writeFileSync(file, `${value}\n`, { mode });
    chmodSync(file, mode);
    return file;
  };
  return { root, workspace, secret };
}

function stderrOf(run: () => void): string {
  const written: string[] = [];
  const spy = vi.spyOn(process.stderr, "write").mockImplementation(((chunk: string | Uint8Array) => { written.push(String(chunk)); return true; }) as never);
  try {
    run();
  } finally {
    spy.mockRestore();
  }
  return written.join("");
}

describe("unlockWithPassphraseFile", () => {
  test.each(["600", "400"])("a private file (mode %s) opens the vault here; its value never enters the environment", (mode) => {
    const { workspace, secret } = fixture();
    const env: NodeJS.ProcessEnv = { AMC_VAULT_PASSPHRASE_FILE: secret(PASSPHRASE, parseInt(mode, 8)) };
    const err = stderrOf(() => unlockWithPassphraseFile(workspace, env));
    expect(vaultStatus(workspace).unlocked).toBe(true);
    expect(err).toBe("");
    expect(env.AMC_VAULT_PASSPHRASE).toBeUndefined();
    expect(Object.values(process.env)).not.toContain(PASSPHRASE);
  });

  test.each(["640", "604", "644", "660"])("a file group or others can read (mode %s) is refused and the vault stays locked", (mode) => {
    const { workspace, secret } = fixture();
    const err = stderrOf(() => unlockWithPassphraseFile(workspace, { AMC_VAULT_PASSPHRASE_FILE: secret(PASSPHRASE, parseInt(mode, 8)) }));
    expect(vaultStatus(workspace).unlocked).toBe(false);
    expect(err).toContain("AMC_VAULT_PASSPHRASE_FILE was not used");
    expect(err).toContain("must be private to its owner");
    expect(err).not.toContain(PASSPHRASE);
  });

  test("a symlink is refused, even to a private file", () => {
    const { root, workspace, secret } = fixture();
    const link = join(root, "link.pass");
    symlinkSync(secret(PASSPHRASE, 0o600), link);
    const err = stderrOf(() => unlockWithPassphraseFile(workspace, { AMC_VAULT_PASSPHRASE_FILE: link }));
    expect(vaultStatus(workspace).unlocked).toBe(false);
    expect(err).toContain("AMC_VAULT_PASSPHRASE_FILE was not used");
  });

  test("AMC_VAULT_PASSPHRASE wins: the file is not read", () => {
    const { workspace, secret } = fixture();
    const err = stderrOf(() => unlockWithPassphraseFile(workspace, { AMC_VAULT_PASSPHRASE: "another-passphrase-wins", AMC_VAULT_PASSPHRASE_FILE: secret(PASSPHRASE, 0o600) }));
    expect(vaultStatus(workspace).unlocked).toBe(false);
    expect(err).toBe("");
  });

  test("a wrong passphrase leaves the vault locked and says why, never printing a value", () => {
    const { workspace, secret } = fixture();
    const err = stderrOf(() => unlockWithPassphraseFile(workspace, { AMC_VAULT_PASSPHRASE_FILE: secret("not-the-vault-passphrase", 0o600) }));
    expect(vaultStatus(workspace).unlocked).toBe(false);
    expect(err).toContain("incorrect passphrase or corrupted vault");
    expect(err).not.toContain("not-the-vault-passphrase");
  });

  test("while the file is set, the remembered store is not read, even by an interactive operator", () => {
    const { root, workspace, secret } = fixture();
    mkdirSync(join(root, "home"), { mode: 0o700 });
    const env: NodeJS.ProcessEnv = { AMC_HOME: join(root, "home"), AMC_VAULT_REMEMBER_FILE: join(root, "home", "remembered.json") };
    rememberVaultPassphrase(workspace, PASSPHRASE, env);
    const tty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    try {
      unlockWithRememberedPassphrase(workspace, { ...env, AMC_VAULT_PASSPHRASE_FILE: secret(PASSPHRASE, 0o644) });
      expect(vaultStatus(workspace).unlocked).toBe(false);
      unlockWithRememberedPassphrase(workspace, env); // the control: without the file the store opens it
      expect(vaultStatus(workspace).unlocked).toBe(true);
    } finally {
      if (tty) Object.defineProperty(process.stdin, "isTTY", tty);
      else delete (process.stdin as { isTTY?: boolean }).isTTY;
    }
  });
});

describe("unlockVaultInteractive (amc vault unlock)", () => {
  test("reads AMC_VAULT_PASSPHRASE_FILE when AMC_VAULT_PASSPHRASE is unset, without a terminal", async () => {
    const { workspace, secret } = fixture();
    vi.stubEnv("AMC_VAULT_PASSPHRASE_FILE", secret(PASSPHRASE, 0o600));
    await unlockVaultInteractive(workspace);
    expect(vaultStatus(workspace).unlocked).toBe(true);
  });
});

/** Runs the built CLI as cron or `docker exec` would: no terminal, no passphrase, no agent marker, a private HOME, no store. */
function cli(root: string, workspace: string) {
  mkdirSync(join(root, "home"), { mode: 0o700 });
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: join(root, "home"), NO_COLOR: "1", AMC_VAULT_REMEMBER: "0" };
  for (const name of ["AMC_VAULT_PASSPHRASE", "AMC_VAULT_PASSPHRASE_FILE", ...AGENT_ENV_MARKERS]) delete env[name];
  return (extra: NodeJS.ProcessEnv, ...args: string[]) => spawnSync(process.execPath, [resolve(process.cwd(), "dist/cli.js"), ...args],
    { cwd: workspace, env: { ...env, ...extra }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 });
}

describe("the built CLI without a terminal (run `npm run build` first)", () => {
  test("amc verify with only AMC_VAULT_PASSPHRASE_FILE passes beside a running gateway; a refused or missing file is NOT EVALUATED", { timeout: 180_000 }, async () => {
    const { root, workspace, secret } = fixture();
    vi.stubEnv("AMC_VAULT_PASSPHRASE", PASSPHRASE); // the in-process gateway signs with the vault
    const monitor = sha256Hex(readFileSync(join(workspace, ".amc", "keys", "monitor_ed25519.pub")));
    const amc = cli(root, workspace);
    const verify = (extra: NodeJS.ProcessEnv) => amc(extra, "verify", "--expect-monitor", monitor);
    const gateway = await startGateway({ workspace, listenPort: 0, proxyPort: 0, logger: { log() {}, error() {} } });
    try {
      const open = `1 session open: ${gateway.gatewaySessionId} (gateway;`;
      const ok = verify({ AMC_VAULT_PASSPHRASE_FILE: secret(PASSPHRASE, 0o600) });
      expect(ok.status, ok.stdout + ok.stderr).toBe(0);
      expect(ok.stdout).toContain("Ledger verification PASSED");
      expect(ok.stdout).toContain(open);
      const refused = verify({ AMC_VAULT_PASSPHRASE_FILE: secret(PASSPHRASE, 0o644) });
      expect(refused.status).toBe(1);
      expect(refused.stdout).toContain("Ledger verification NOT EVALUATED");
      expect(refused.stderr).toContain("AMC_VAULT_PASSPHRASE_FILE was not used");
      const none = verify({});
      expect(none.status).toBe(1);
      expect(none.stdout).toContain("Ledger verification NOT EVALUATED");
      expect(none.stdout).toContain("vault locked: export AMC_VAULT_PASSPHRASE");
      expect(none.stdout).toContain(open);
      // The other CLI verdicts take the same path: session verify renders it, verify all exits through verifyAllExit.
      const session = amc({}, "session", "verify", "--expect-monitor", monitor);
      expect(session.status).toBe(1);
      expect(session.stdout).toContain("Ledger verification NOT EVALUATED");
      const all = amc({}, "verify", "all", "--json", "--expect-monitor", monitor);
      expect(all.status).toBe(1);
      const report = JSON.parse(all.stdout) as { status: string; checks: Array<{ id: string; status: string }> };
      expect(report.status).toBe("INCOMPLETE");
      expect(report.checks.find((check) => check.id === "ledger-hash-chain")?.status).toBe("SKIP");
      expect(all.stderr).toContain("INCOMPLETE: critical checks not performed: ledger-hash-chain");
      const allWithFile = amc({ AMC_VAULT_PASSPHRASE_FILE: secret(PASSPHRASE, 0o600) }, "verify", "all", "--json", "--expect-monitor", monitor);
      expect(allWithFile.status, allWithFile.stderr).toBe(0);
      expect((JSON.parse(allWithFile.stdout) as typeof report).checks.find((check) => check.id === "ledger-hash-chain")?.status).toBe("PASS");
      for (const run of [ok, refused, none, session, all, allWithFile]) {
        expect(run.stdout + run.stderr).not.toMatch(/authentication failed|missing seal/);
        expect(run.stdout + run.stderr).not.toContain(PASSPHRASE);
      }
    } finally {
      await gateway.close();
    }
  });

  test("amc init without a terminal creates a signed vault from only AMC_VAULT_PASSPHRASE_FILE", { timeout: 120_000 }, () => {
    const { root, secret } = fixture();
    const fresh = join(root, "fresh");
    mkdirSync(fresh);
    const amc = cli(root, fresh);
    const init = amc({ AMC_VAULT_PASSPHRASE_FILE: secret(PASSPHRASE, 0o600) }, "init");
    expect(init.status, init.stdout + init.stderr).toBe(0);
    expect(existsSync(join(fresh, ".amc", "vault.amcvault"))).toBe(true);
    expect(init.stdout + init.stderr).not.toContain(PASSPHRASE);
  });

  // The hint `amc up` prints for a shell without a terminal: a password file alone meets a locked vault (final review).
  test("amc user init --password-file signs users.yaml with only AMC_VAULT_PASSPHRASE_FILE, and not without it", { timeout: 120_000 }, () => {
    const { root, workspace, secret } = fixture();
    const amc = cli(root, workspace);
    const password = secret("owner-cli-password-123", 0o600, "owner.pw");
    const locked = amc({}, "user", "init", "--username", "owner", "--password-file", password);
    expect(locked.status).not.toBe(0);
    expect(existsSync(usersConfigPath(workspace))).toBe(false);
    const signed = amc({ AMC_VAULT_PASSPHRASE_FILE: secret(PASSPHRASE, 0o600) }, "user", "init", "--username", "owner", "--password-file", password);
    expect(signed.status, signed.stdout + signed.stderr).toBe(0);
    expect(signed.stdout).toContain("Users config created");
    expect(signed.stdout + signed.stderr).not.toContain(PASSPHRASE);
  });
});
