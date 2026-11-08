import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { authenticateUser, usersConfigPath } from "../src/auth/authApi.js";
import { AGENT_ENV_MARKERS } from "../src/vault/operatorContext.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * LIVE-VAULT-06: `amc user init|add|password` without a terminal take `--password-file` (never an inline password),
 * `amc user init` never replaces an existing users.yaml without `--force`, and `amc user password` resets a password.
 * Spawns the built CLI (run `npm run build` first) with stdin from /dev/null, as a script or service would.
 */
const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop()!;
    lockVault(join(root, "ws"));
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-cli-users-"));
  roots.push(root);
  const workspace = join(root, "ws");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const secret = (name: string, value: string) => { const file = join(root, name); writeFileSync(file, `${value}\n`, { mode: 0o600 }); return file; };
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1", AMC_VAULT_REMEMBER: "0" };
  for (const name of AGENT_ENV_MARKERS) delete env[name];
  const amc = (...args: string[]) => {
    const result = spawnSync(process.execPath, [resolve(process.cwd(), "dist/cli.js"), ...args], { cwd: workspace, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { status: result.status, out: `${result.stdout}\n${result.stderr}` };
  };
  return { workspace, secret, amc };
}

describe("amc user without a terminal", () => {
  test("init takes --password-file, refuses to replace users.yaml without --force, and password resets it", () => {
    const { workspace, secret, amc } = fixture();
    const first = secret("owner.pw", "owner-cli-pass-123");
    const init = amc("user", "init", "--username", "owner", "--password-file", first);
    expect(init.status, init.out).toBe(0);
    expect(existsSync(usersConfigPath(workspace))).toBe(true);
    const created = readFileSync(usersConfigPath(workspace));

    const again = amc("user", "init", "--username", "owner", "--password-file", first);
    expect(again.status).toBe(1);
    expect(again.out).toContain("users.yaml already exists; pass --force to replace every account, or use amc user add");
    expect(readFileSync(usersConfigPath(workspace))).toEqual(created);

    const forced = amc("user", "init", "--username", "owner", "--password-file", first, "--force");
    expect(forced.status, forced.out).toBe(0);

    const reset = amc("user", "password", "owner", "--password-file", secret("owner-new.pw", "owner-cli-pass-456"));
    expect(reset.status, reset.out).toBe(0);
    expect(authenticateUser({ workspace, username: "owner", password: "owner-cli-pass-456" }).ok).toBe(true);
    expect(authenticateUser({ workspace, username: "owner", password: "owner-cli-pass-123" }).ok).toBe(false);
    expect(`${init.out}${reset.out}`).not.toContain("owner-cli-pass-");
  });

  test("without --password-file it names the option instead of failing in the prompt; an empty or short file is refused (LIVE-VAULT-13)", () => {
    const { secret, amc } = fixture();
    const missing = amc("user", "init", "--username", "owner");
    expect(missing.status).toBe(1);
    expect(missing.out).toContain("No terminal for the password prompt: pass --password-file <path> (a private file holding the password).");
    const empty = amc("user", "init", "--username", "owner", "--password-file", secret("empty.pw", ""));
    expect(empty.status).toBe(1);
    expect(empty.out).toContain("password file is empty");
    const eleven = amc("user", "init", "--username", "owner", "--password-file", secret("eleven.pw", "eleven-char"));
    expect(eleven.status).toBe(1);
    expect(eleven.out).toContain("password must be at least 12 characters");
    expect(amc("user", "init", "--username", "owner", "--password-file", secret("twelve.pw", "twelve-chars")).status).toBe(0);
    const add = amc("user", "add", "--username", "viewer", "--role", "VIEWER");
    expect(add.status).toBe(1);
    expect(add.out).toContain("--password-file");
  });
});
