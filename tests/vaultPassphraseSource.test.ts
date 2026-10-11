import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initHostVault } from "../src/identity/hostVault.js";
import { parseOrgRoleList, runOrg } from "../src/org/orgRun.js";
import { lockVault, vaultPaths } from "../src/vault/vault.js";
import { decryptVaultPayload } from "../src/vault/vaultCrypto.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * A passphrase written in AMC's source is public: a vault sealed with it opens for anyone, private signing keys
 * included. Only AMC_VAULT_PASSPHRASE (and AMC_HOST_VAULT_PASSPHRASE for the host vault) supplies a passphrase.
 * NODE_ENV=test (removed from the vault in cb7893e1, which shipped no test for it) and VITEST never do: anyone who
 * can set an environment variable on a production run could set them. This suite's own passphrase comes from
 * tests/setup/vaultPassphrase.ts.
 */
const SOURCE_PASSPHRASES = ["amc-test-passphrase", "amc-host-vault-test-passphrase", "amc-local-default-passphrase"];
const roots: string[] = [];

function dir(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  roots.push(path);
  return path;
}

function opensWithSourcePassphrase(vaultFile: string): boolean {
  const envelope = JSON.parse(readFileSync(vaultFile, "utf8"));
  return SOURCE_PASSPHRASES.some((phrase) => {
    try {
      decryptVaultPayload(envelope, phrase);
      return true;
    } catch {
      return false;
    }
  });
}

/** No passphrase from the environment; `signal` is the only test signal the process sees. */
function withoutPassphrase(signal: Record<string, string>): void {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
  vi.stubEnv("AMC_HOST_VAULT_PASSPHRASE", "");
  for (const [name, value] of Object.entries(signal)) vi.stubEnv(name, value);
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0).reverse()) {
    lockVault(root);
    rmSync(root, { recursive: true, force: true });
  }
});

describe("in-process: a test signal never selects a vault passphrase", () => {
  test.each<Record<string, string>>([{ NODE_ENV: "test" }, { VITEST: "1" }, { VITEST: "true" }])("workspace vault under %o", (signal) => {
    withoutPassphrase(signal);
    const ws = dir("amc-passphrase-source-");
    expect(() => initWorkspace({ workspacePath: ws, trustBoundaryMode: "isolated" }))
      .toThrow(/AMC_VAULT_PASSPHRASE environment variable is required/);
    expect(existsSync(vaultPaths(ws).vaultFile)).toBe(false);
  });

  test.each<Record<string, string>>([{ NODE_ENV: "test" }, { VITEST: "1" }])("host vault under %o", (signal) => {
    withoutPassphrase(signal);
    const host = dir("amc-passphrase-source-host-");
    expect(() => initHostVault(host)).toThrow(/passphrase/i);
    expect(existsSync(join(host, "host-vault", "vault.amcvault"))).toBe(false);
  });

  test("an org run does not report its artifact signed because NODE_ENV=test is set", () => {
    withoutPassphrase({ NODE_ENV: "test" });
    const out = runOrg({ workspace: dir("amc-passphrase-source-org-"), orgRunId: "org-env", roles: parseOrgRoleList("REV_QA_LEAD"),
      goal: "Check the signing claim.", heartbeatPolicy: { intervalMinutes: 5, maxStaleMinutes: 15, plateauAfterHeartbeats: 1 } });
    expect(out.signaturePath).toBeNull();
    expect(out.artifact.surfaces.Vault.status).toBe("degraded");
    expect(out.artifact.surfaces.Vault.refs).toEqual([]);
  });
});

/**
 * Outside the test runner: a plain Node process that has VITEST or NODE_ENV=test set and no passphrase, as a
 * production run with a stray variable would.
 */
describe("a non-test process with a test signal set", () => {
  const module = (path: string) => JSON.stringify(pathToFileURL(resolve(path)).href);
  const script = `
    import { initWorkspace } from ${module("src/workspace.ts")};
    import { initHostVault } from ${module("src/identity/hostVault.ts")};
    import { ensureVaultAndPublicKeys, getVaultPrivateKeyPem } from ${module("src/vault/vault.ts")};
    const [mode, target] = process.argv.slice(1);
    const attempt = (fn) => { try { fn(); return "ok"; } catch (error) { return String(error.message); } };
    const out = mode === "init"
      ? { workspace: attempt(() => initWorkspace({ workspacePath: target, trustBoundaryMode: "isolated" })),
          host: attempt(() => initHostVault(target + "-host")) }
      : { ensure: attempt(() => ensureVaultAndPublicKeys(target)), key: attempt(() => getVaultPrivateKeyPem(target, "monitor")) };
    console.log(JSON.stringify(out));`;

  function child(signal: Record<string, string>, mode: "init" | "existing", target: string): Record<string, string> {
    const env: NodeJS.ProcessEnv = { ...process.env, AMC_HOME: dir("amc-passphrase-source-home-"), ...signal };
    for (const name of Object.keys(env)) {
      if (name.startsWith("VITEST") && !(name in signal)) delete env[name];
    }
    for (const name of ["AMC_VAULT_PASSPHRASE", "AMC_VAULT_PASSPHRASE_FILE", "AMC_HOST_VAULT_PASSPHRASE", "AMC_NO_SIGN"]) delete env[name];
    if (!("NODE_ENV" in signal)) delete env.NODE_ENV;
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script, mode, target],
      { encoding: "utf8", env, timeout: 60_000 });
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(result.stdout.trim().split("\n").at(-1) ?? "{}") as Record<string, string>;
  }

  test.each<Record<string, string>>([{ VITEST: "1" }, { VITEST: "true" }, { NODE_ENV: "test" }])("seals nothing with a source passphrase under %o", (signal) => {
    const parent = dir("amc-passphrase-source-child-");
    const ws = join(parent, "ws");
    const out = child(signal, "init", ws);
    expect(out.workspace).toMatch(/AMC_VAULT_PASSPHRASE environment variable is required/);
    expect(out.host).toMatch(/passphrase/i);
    for (const vaultFile of [vaultPaths(ws).vaultFile, join(`${ws}-host`, "host-vault", "vault.amcvault")]) {
      if (existsSync(vaultFile)) expect(opensWithSourcePassphrase(vaultFile), vaultFile).toBe(false);
    }
    expect(existsSync(vaultPaths(ws).vaultFile)).toBe(false);
  }, 90_000);

  test("NODE_ENV=test on an existing vault behaves as production: no passphrase error, the vault stays locked", () => {
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "passphrase-source-existing-vault");
    const ws = dir("amc-passphrase-source-existing-");
    initWorkspace({ workspacePath: ws, trustBoundaryMode: "isolated" });
    const out = child({ NODE_ENV: "test" }, "existing", ws);
    expect(out.ensure).toBe("ok");
    expect(out.key).toMatch(/Vault locked/);
  }, 90_000);
});
