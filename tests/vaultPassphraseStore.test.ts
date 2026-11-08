import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  forgetVaultPassphrase,
  getRememberedVaultPassphrase,
  rememberEnabled,
  rememberedStores,
  rememberVaultPassphrase
} from "../src/vault/passphraseStore.js";

const dirs: string[] = [];
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("vault passphrase store (file backend)", () => {
  function tempEnv(): { env: NodeJS.ProcessEnv; file: string; workspace: string } {
    const dir = tempDir("amc-remember-");
    const file = join(dir, "credentials.json");
    return { env: { AMC_VAULT_REMEMBER_FILE: file } as NodeJS.ProcessEnv, file, workspace: join(dir, "ws") };
  }

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

  test("rememberEnabled reads the AMC_VAULT_REMEMBER opt-out (LIVE-VAULT-03)", () => {
    for (const off of ["0", "false", "off", "no", " OFF ", "No"]) expect(rememberEnabled({ AMC_VAULT_REMEMBER: off }), off).toBe(false);
    for (const on of [undefined, "", "1", "yes", "true"]) expect(rememberEnabled({ AMC_VAULT_REMEMBER: on }), String(on)).toBe(true);
  });

  test("disabled via AMC_VAULT_REMEMBER=0", () => {
    const { env, workspace } = tempEnv();
    const disabled = { ...env, AMC_VAULT_REMEMBER: "0" } as NodeJS.ProcessEnv;
    expect(getRememberedVaultPassphrase(workspace, disabled)).toBeNull();
    expect(() => rememberVaultPassphrase(workspace, "x", disabled)).toThrow(/disabled/);
  });

  test("without AMC_VAULT_REMEMBER_FILE the file lives in the AMC home, the directory the credentials store uses", () => {
    const home = join(tempDir("amc-remember-home-"), "amc-home");
    const env = { AMC_HOME: home } as NodeJS.ProcessEnv;
    const restore = forcePlatform("linux");
    try {
      const saved = rememberVaultPassphrase(join(home, "..", "ws"), "home-pass-123", env);
      expect(saved).toEqual({ backend: "file", location: join(home, "vault-credentials.json") });
      expect(statSync(home).mode & 0o777).toBe(0o700);
      expect(rememberedStores(env)).toBe(join(home, "vault-credentials.json"));
    } finally { restore(); }
  });
});

function forcePlatform(platform: NodeJS.Platform): () => void {
  const original = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { ...original, value: platform });
  return () => Object.defineProperty(process, "platform", original);
}

function forceStdinTty(isTTY: boolean): () => void {
  const original = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  Object.defineProperty(process.stdin, "isTTY", { value: isTTY, configurable: true, writable: true });
  return () => {
    if (original) Object.defineProperty(process.stdin, "isTTY", original);
    else delete (process.stdin as { isTTY?: boolean }).isTTY;
  };
}

/**
 * A stand-in for macOS security(1) on PATH, so these run on every platform and never touch a real keychain. It keeps
 * items as hex files, logs every argv and stdin, prints `find-generic-password -g` in security's two formats (quoted
 * plain text, or 0x<HEX> for anything else), and with FAKE_HANG_ADD never answers `security -i` (a Keychain dialog
 * nobody can see).
 */
function fakeSecurity(): { env: NodeJS.ProcessEnv; log: () => string; home: string } {
  const root = tempDir("amc-fake-security-");
  const bin = join(root, "bin");
  mkdirSync(bin);
  const script = `#!${process.execPath}
const fs = require("node:fs"), path = require("node:path");
const dir = process.env.FAKE_DIR, args = process.argv.slice(2);
const stdin = args[0] === "-i" ? fs.readFileSync(0, "utf8") : "";
fs.appendFileSync(path.join(dir, "calls.log"), JSON.stringify({ args, stdin }) + "\\n");
const opt = (list, flag) => list[list.indexOf(flag) + 1];
const item = (account) => path.join(dir, "item-" + account);
if (args[0] === "-i") {
  if (process.env.FAKE_HANG_ADD) setInterval(() => {}, 1000);
  else {
    const words = stdin.trim().split(/\\s+/);
    if (words[0] !== "add-generic-password" || opt(words, "-s") !== "amc-vault") process.exit(2);
    fs.writeFileSync(item(opt(words, "-a")), opt(words, "-X"));
  }
} else if (args[0] === "find-generic-password") {
  if (!fs.existsSync(item(opt(args, "-a")))) { process.stderr.write("security: The specified item could not be found in the keychain.\\n"); process.exit(44); }
  const hex = fs.readFileSync(item(opt(args, "-a")), "utf8"), text = Buffer.from(hex, "hex").toString("utf8");
  const plain = /^[\\x20-\\x5b\\x5d-\\x7e]*$/.test(text);
  process.stdout.write('keychain: "fake"\\nattributes:\\n');
  process.stderr.write(plain ? 'password: "' + text + '"\\n' : "password: 0x" + hex.toUpperCase() + '  "escaped"\\n');
} else if (args[0] === "delete-generic-password") {
  if (!fs.existsSync(item(opt(args, "-a")))) process.exit(44);
  fs.rmSync(item(opt(args, "-a")));
} else process.exit(1);
`;
  writeFileSync(join(bin, "security"), script);
  chmodSync(join(bin, "security"), 0o755);
  const home = join(root, "amc-home");
  return {
    env: { PATH: `${bin}:${process.env.PATH ?? ""}`, FAKE_DIR: root, AMC_HOME: home } as NodeJS.ProcessEnv,
    log: () => existsSync(join(root, "calls.log")) ? readFileSync(join(root, "calls.log"), "utf8") : "",
    home
  };
}

describe("vault passphrase store (macOS Keychain backend, B1)", () => {
  const restores: Array<() => void> = [];
  afterEach(() => { while (restores.length > 0) restores.pop()!(); });
  function asMac(tty: boolean): void { restores.push(forcePlatform("darwin"), forceStdinTty(tty)); }

  test("stores through security's stdin, never its arguments, and reads the exact passphrase back", () => {
    asMac(true);
    const { env, log } = fakeSecurity();
    for (const [index, passphrase] of ["plain-pass-123", "two  spaces  ", "ünï 🔐 \\ \"quoted\""].entries()) {
      const workspace = join(tmpdir(), `amc-keychain-ws-${index}`);
      expect(rememberVaultPassphrase(workspace, passphrase, env)).toEqual({ backend: "keychain", location: "the macOS Keychain (service amc-vault)" });
      expect(getRememberedVaultPassphrase(workspace, env)).toEqual({ passphrase, backend: "keychain" });
      const calls = log().trim().split("\n").map((line) => JSON.parse(line) as { args: string[]; stdin: string });
      const hex = Buffer.from(passphrase, "utf8").toString("hex");
      for (const call of calls) {
        expect(call.args.join(" ")).not.toContain(passphrase);
        expect(call.args.join(" ")).not.toContain(hex);
      }
      expect(calls.some((call) => call.args[0] === "-i" && call.stdin.includes(`-X ${hex}`))).toBe(true);
      expect(forgetVaultPassphrase(workspace, env)).toBe(true);
      expect(getRememberedVaultPassphrase(workspace, env)).toBeNull();
    }
  });

  test("a Keychain that never answers is abandoned and the passphrase goes to the 0600 file in the AMC home", () => {
    asMac(true);
    const { env, home } = fakeSecurity();
    const workspace = join(tmpdir(), "amc-keychain-hang-ws");
    const started = Date.now();
    const saved = rememberVaultPassphrase(workspace, "hang-pass-123", { ...env, FAKE_HANG_ADD: "1" });
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(saved).toEqual({ backend: "file", location: join(home, "vault-credentials.json") });
    expect(statSync(saved.location).mode & 0o777).toBe(0o600);
    expect(getRememberedVaultPassphrase(workspace, env)).toEqual({ passphrase: "hang-pass-123", backend: "file" });
  }, 30_000);

  test("a non-interactive shell never asks the Keychain to store", () => {
    asMac(false);
    const { env, log, home } = fakeSecurity();
    const saved = rememberVaultPassphrase(join(tmpdir(), "amc-keychain-notty-ws"), "notty-pass-123", env);
    expect(saved).toEqual({ backend: "file", location: join(home, "vault-credentials.json") });
    expect(log()).not.toContain("add-generic-password");
    expect(log()).not.toContain("\"-i\"");
  });

  test("AMC_VAULT_REMEMBER_FILE keeps the Keychain out entirely", () => {
    asMac(true);
    const { env, log } = fakeSecurity();
    const file = join(tempDir("amc-remember-override-"), "creds.json");
    const saved = rememberVaultPassphrase(join(tmpdir(), "amc-keychain-override-ws"), "override-pass", { ...env, AMC_VAULT_REMEMBER_FILE: file });
    expect(saved).toEqual({ backend: "file", location: file });
    expect(log()).toBe("");
  });
});
