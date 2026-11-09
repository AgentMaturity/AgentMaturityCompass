/**
 * Follow-up 1 to B1: one reader for the vault passphrase (src/vault/passphraseFile.ts). AMC_VAULT_PASSPHRASE always wins;
 * else AMC_VAULT_PASSPHRASE_FILE through readSecretMountFile, which takes a file private to its owner (0600/0400, not a
 * symlink) or a mounted secret this user cannot change: Compose secrets (a read-only bind under /run/secrets, owned by
 * whoever owns the host file) and Kubernetes secret volumes (root-owned files behind the `..data` symlinks, on a
 * read-only mount). Refused: group- or world-writable files and files this user could replace. Bootstrap, host
 * bootstrap, studio start, doctor and `amc up` read it through the same reader; before, the first four read the file
 * with no check, and the file won over the variable.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AGENT_ENV_MARKERS } from "../src/vault/operatorContext.js";
import { bootstrapVaultPassphrase, VaultPassphraseFileError, vaultPassphraseFromEnv } from "../src/vault/passphraseFile.js";
import { readSecretMountFile, secretLookup, userCanChange } from "../src/vault/secretMountFile.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

const VALUE = "synthetic-mounted-secret-value";
const roots: string[] = [];
const asRoot = process.getuid?.() === 0;

afterEach(() => {
  vi.unstubAllEnvs();
  while (roots.length > 0) {
    const root = roots.pop()!;
    if (existsSync(join(root, "ws"))) lockVault(join(root, "ws"));
    rmSync(root, { recursive: true, force: true });
  }
});

function root(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-mounted-secret-"));
  roots.push(dir);
  return dir;
}

function file(path: string, mode: number, value = VALUE): string {
  writeFileSync(path, `${value}\n`, { mode });
  chmodSync(path, mode);
  return path;
}

/** A Kubernetes secret volume as the kubelet writes it: the key is a symlink through `..data` to a timestamped directory. */
function kubernetesVolume(mode = 0o644): { mount: string; key: string; dataDir: string; target: string } {
  const mount = join(root(), "run", "secrets");
  const dataDir = join(mount, "..2026_11_09_00_00_00.000000001");
  mkdirSync(dataDir, { recursive: true });
  const target = file(join(dataDir, "amc_vault_passphrase"), mode);
  symlinkSync("..2026_11_09_00_00_00.000000001", join(mount, "..data"));
  symlinkSync("..data/amc_vault_passphrase", join(mount, "amc_vault_passphrase"));
  return { mount, key: join(mount, "amc_vault_passphrase"), dataDir, target };
}

describe("readSecretMountFile: the accepted container layouts", () => {
  test("a Kubernetes secret volume (root-owned, behind ..data, read-only mount) is read; every lookup directory is checked", () => {
    const volume = kubernetesVolume(0o644);
    const asked: string[] = [];
    // A read-only mount: this user can change nothing on the lookup (the stand-in for EROFS and root-owned directories).
    expect(readSecretMountFile(volume.key, "Vault passphrase", (path) => { asked.push(path); return false; })).toBe(VALUE);
    const real = (path: string) => resolve(path).replace(/^\/var\//, "/private/var/");
    expect(asked.map(real)).toEqual(expect.arrayContaining([real(volume.target), real(volume.mount), real(volume.dataDir), "/"]));
  });

  test("a Compose secret (a read-only bind of a host file this user owns, mode 0644) is read", () => {
    const secrets = join(root(), "run", "secrets");
    mkdirSync(secrets, { recursive: true });
    expect(readSecretMountFile(file(join(secrets, "amc_vault_passphrase"), 0o644), "Vault passphrase", () => false)).toBe(VALUE);
  });

  test.each([0o600, 0o400])("a file private to its owner (mode %o) needs no mount", (mode) => {
    expect(readSecretMountFile(file(join(root(), "vault.pass"), mode), "Vault passphrase")).toBe(VALUE);
  });

  test.skipIf(asRoot)("a real root-owned file reached through system paths is read with the real probe", () => {
    const candidate = ["/etc/shells", "/etc/protocols"].find((path) => {
      try {
        const stat = statSync(path);
        return stat.isFile() && stat.uid === 0 && (stat.mode & 0o022) === 0 && stat.size > 0 && stat.size <= 16_384;
      } catch {
        return false;
      }
    });
    if (candidate === undefined) return;
    expect(readSecretMountFile(candidate, "Probe")).toBe(readFileSync(candidate, "utf8").trim());
  });
});

describe("readSecretMountFile: the refused layouts", () => {
  test.each([0o664, 0o646, 0o666])("a group- or world-writable file (mode %o) is refused even on a read-only mount", (mode) => {
    const volume = kubernetesVolume(mode);
    expect(() => readSecretMountFile(volume.key, "Vault passphrase", () => false)).toThrow(/it is group- or world-writable/);
  });

  test("a symlink in a directory this user can change is refused: the link could be repointed", () => {
    const volume = kubernetesVolume(0o644);
    const real = statSync(volume.mount);
    const probe = (path: string) => { try { const stat = statSync(path); return stat.ino === real.ino && stat.dev === real.dev; } catch { return false; } };
    expect(() => readSecretMountFile(volume.key, "Vault passphrase", probe)).toThrow(/this user can change .*run\/secrets$/);
  });

  test("a link repointed while the file is judged is refused: the path must still name the file that was opened", () => {
    const volume = kubernetesVolume(0o644);
    const next = join(volume.mount, "..2026_11_09_00_05_00.000000002");
    mkdirSync(next);
    file(join(next, "amc_vault_passphrase"), 0o644, "swapped-in-value");
    let swapped = false;
    const probe = () => {
      if (!swapped) { rmSync(join(volume.mount, "..data")); symlinkSync("..2026_11_09_00_05_00.000000002", join(volume.mount, "..data")); swapped = true; }
      return false;
    };
    expect(() => readSecretMountFile(volume.key, "Vault passphrase", probe)).toThrow(/changed while it was read/);
  });

  test("a file this user can rewrite is refused, wherever it sits", () => {
    const volume = kubernetesVolume(0o644);
    const target = statSync(volume.target);
    const probe = (path: string) => { try { return statSync(path).ino === target.ino; } catch { return false; } };
    expect(() => readSecretMountFile(volume.key, "Vault passphrase", probe)).toThrow(/this user can change .*amc_vault_passphrase$/);
  });

  test.skipIf(asRoot)("with the real probe, a readable file in this user's own directory is refused (it could replace it)", () => {
    expect(() => readSecretMountFile(file(join(root(), "vault.pass"), 0o644), "Vault passphrase")).toThrow(/must be private to its owner .*this user can change/);
    const volume = kubernetesVolume(0o600); // private, but reached through a symlink this user can repoint
    expect(() => readSecretMountFile(volume.key, "Vault passphrase")).toThrow(/this user can change/);
  });

  test("an empty, oversized, missing or non-regular file is refused", () => {
    const dir = root();
    expect(() => readSecretMountFile(file(join(dir, "empty"), 0o600, ""), "Vault passphrase")).toThrow(/empty or exceeds/);
    expect(() => readSecretMountFile(file(join(dir, "big"), 0o600, "x".repeat(16_385)), "Vault passphrase")).toThrow(/empty or exceeds/);
    expect(() => readSecretMountFile(join(dir, "missing"), "Vault passphrase")).toThrow(/ENOENT/);
    expect(() => readSecretMountFile(dir, "Vault passphrase", () => false)).toThrow(/must be a regular file/);
  });

  test.skipIf(asRoot)("the real probe: this user's own directory is changeable even at 0555, a root-owned one is not", () => {
    const dir = root();
    chmodSync(dir, 0o555);
    try {
      expect(userCanChange(dir)).toBe(true);
    } finally {
      chmodSync(dir, 0o755);
    }
    expect(userCanChange("/")).toBe(false);
    expect(secretLookup("/").dirs).toEqual([]);
  });
});

describe("vaultPassphraseFromEnv: AMC_VAULT_PASSPHRASE always wins", () => {
  test("the variable wins over a file, and the file is not read (a missing one is not an error)", () => {
    expect(vaultPassphraseFromEnv({ AMC_VAULT_PASSPHRASE: "inline-wins", AMC_VAULT_PASSPHRASE_FILE: file(join(root(), "f"), 0o600) })).toBe("inline-wins");
    expect(vaultPassphraseFromEnv({ AMC_VAULT_PASSPHRASE: "inline-wins", AMC_VAULT_PASSPHRASE_FILE: "/nonexistent/amc-passphrase" })).toBe("inline-wins");
  });

  test("the file alone is read; a refused one throws without its value; neither is null", () => {
    const dir = root();
    expect(vaultPassphraseFromEnv({ AMC_VAULT_PASSPHRASE_FILE: file(join(dir, "ok"), 0o600) })).toBe(VALUE);
    const refused = (() => { try { vaultPassphraseFromEnv({ AMC_VAULT_PASSPHRASE_FILE: file(join(dir, "open"), 0o666) }); } catch (error) { return error; } return null; })();
    expect(refused).toBeInstanceOf(VaultPassphraseFileError);
    expect((refused as Error).message).toMatch(/^AMC_VAULT_PASSPHRASE_FILE was not used, so the vault stays locked: .*group- or world-writable/);
    expect((refused as Error).message).not.toContain(VALUE);
    expect(vaultPassphraseFromEnv({ AMC_VAULT_PASSPHRASE: "", AMC_VAULT_PASSPHRASE_FILE: " " })).toBeNull();
  });

  test("bootstrap reads the file only: unset, refused; with the variable also set, refused; alone, read", () => {
    const secret = file(join(root(), "boot"), 0o600);
    expect(() => bootstrapVaultPassphrase({})).toThrow("Bootstrap requires AMC_VAULT_PASSPHRASE_FILE. Refusing to run with inline passphrase.");
    expect(() => bootstrapVaultPassphrase({ AMC_VAULT_PASSPHRASE: "inline", AMC_VAULT_PASSPHRASE_FILE: secret })).toThrow(/AMC_VAULT_PASSPHRASE is also set/);
    expect(bootstrapVaultPassphrase({ AMC_VAULT_PASSPHRASE_FILE: secret })).toBe(VALUE);
  });
});

/** The built CLI as a container's entrypoint or cron runs it: no terminal, no inherited passphrase, no agent marker. */
function amc(cwd: string, extra: NodeJS.ProcessEnv, ...args: string[]) {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: join(cwd, "..", "home"), NO_COLOR: "1", AMC_VAULT_REMEMBER: "0", ...extra };
  for (const name of ["AMC_VAULT_PASSPHRASE", ...AGENT_ENV_MARKERS]) if (!(name in extra)) delete env[name];
  return spawnSync(process.execPath, [resolve(process.cwd(), "dist/cli.js"), ...args], { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 });
}

describe("the built CLI (run `npm run build` first)", () => {
  test("doctor reads the file through the reader: a private file unlocks, a readable one in this user's directory is refused", { timeout: 180_000 }, () => {
    const dir = root();
    mkdirSync(join(dir, "home"), { mode: 0o700 });
    vi.stubEnv("AMC_VAULT_PASSPHRASE", VALUE);
    initWorkspace({ workspacePath: join(dir, "ws"), trustBoundaryMode: "isolated" });
    lockVault(join(dir, "ws"));
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    const vaultCheck = (run: ReturnType<typeof amc>) => (JSON.parse(run.stdout) as { checks: Array<{ id: string; status: string }> }).checks.find((check) => check.id === "vault")?.status;
    const ok = amc(join(dir, "ws"), { AMC_VAULT_PASSPHRASE_FILE: file(join(dir, "private.pass"), 0o600) }, "doctor", "--json");
    expect(vaultCheck(ok), ok.stderr).toBe("PASS");
    const refused = amc(join(dir, "ws"), { AMC_VAULT_PASSPHRASE_FILE: file(join(dir, "readable.pass"), 0o644) }, "doctor", "--json");
    expect(vaultCheck(refused)).toBe("WARN");
    expect(refused.stderr).toContain("AMC_VAULT_PASSPHRASE_FILE was not used");
    for (const run of [ok, refused]) expect(run.stdout + run.stderr).not.toContain(VALUE);
  });

  test.skipIf(asRoot)("bootstrap refuses a passphrase file this user could replace, before it creates anything", { timeout: 120_000 }, () => {
    const dir = root();
    mkdirSync(join(dir, "home"), { mode: 0o700 });
    mkdirSync(join(dir, "cwd"));
    const run = amc(join(dir, "cwd"), {
      AMC_VAULT_PASSPHRASE_FILE: file(join(dir, "readable.pass"), 0o644),
      AMC_BOOTSTRAP_OWNER_USERNAME_FILE: file(join(dir, "user"), 0o600, "owner"),
      AMC_BOOTSTRAP_OWNER_PASSWORD_FILE: file(join(dir, "password"), 0o600, "owner-password-1234")
    }, "bootstrap", "--workspace", join(dir, "boot-ws"));
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("AMC_VAULT_PASSPHRASE_FILE was not used");
    expect(existsSync(join(dir, "boot-ws", ".amc"))).toBe(false);
  });
});
