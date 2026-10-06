import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const SCRIPT = resolve("scripts/trust-list.mjs");
const dir = mkdtempSync(join(tmpdir(), "amc-trust-list-script-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const run = (...args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: "utf8" });
const keyIdOf = (stdout: string) => /[0-9a-f]{64}/.exec(stdout)?.[0] ?? "";

describe("scripts/trust-list.mjs (maintainer tooling)", () => {
  it("prints usage for --help and refuses an unknown subcommand", () => {
    const help = run("--help");
    expect(help.status).toBe(0);
    for (const command of ["keygen", "init", "add", "distrust", "sign", "verify"]) expect(help.stdout).toContain(command);
    const unknown = run("publish");
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain("Usage");
  });

  it("builds, signs and verifies a list end to end, and refuses an unpinned root or a change after signing", () => {
    const root = run("keygen", "--out", dir, "--name", "root");
    expect(root.status, root.stderr).toBe(0);
    expect(statSync(join(dir, "root.key")).mode & 0o777).toBe(0o600);
    const rootId = keyIdOf(root.stdout);
    expect(run("keygen", "--out", dir, "--name", "auditor").status).toBe(0);
    const list = join(dir, "list.json");
    expect(run("init", "--list-id", "acme-prod", "--out", list, "--days", "90").status).toBe(0);
    const added = run("add", "--list", list, "--pubkey", join(dir, "auditor.pub"), "--purpose", "artifact-seal",
      "--purpose", "revocation-list", "--subject", "Acme prod auditor");
    expect(added.status, added.stderr).toBe(0);
    const distrusted = run("distrust", "--list", list, "--key-id", "b".repeat(64), "--reason", "exposed-in-public-history",
      "--note", "tracked in a public repository");
    expect(distrusted.status, distrusted.stderr).toBe(0);
    const signed = run("sign", "--list", list, "--key", join(dir, "root.key"));
    expect(signed.status, signed.stderr).toBe(0);

    const ok = run("verify", "--list", list, "--root", rootId);
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toContain("acme-prod");
    const file = JSON.parse(readFileSync(list, "utf8")) as { list: { entries: Array<{ purposes: string[] }>; distrust: unknown[] }; signatures: unknown[] };
    expect(file.list.entries[0]!.purposes).toEqual(["artifact-seal", "revocation-list"]);
    expect(file.list.distrust).toHaveLength(1);
    expect(file.signatures).toHaveLength(1);

    const stranger = run("verify", "--list", list, "--root", "e".repeat(64));
    expect(stranger.status).toBe(1);
    expect(stranger.stderr).toContain("TRUST_LIST_SIGNATURE_INVALID");
    expect(run("add", "--list", list, "--pubkey", join(dir, "root.pub"), "--purpose", "release", "--subject", "release").status).toBe(0);
    expect(run("verify", "--list", list, "--root", rootId).stderr).toContain("TRUST_LIST_SIGNATURE_INVALID");
  });

  it("creates missing directories with mode 0700 on a fresh machine", () => {
    const roots = join(dir, "fresh", "amc-roots");
    expect(run("keygen", "--out", roots, "--name", "root").status).toBe(0);
    expect(statSync(roots).mode & 0o777).toBe(0o700);
    const list = join(dir, "fresh", "home", "trust", "amc-trust-list.json");
    const init = run("init", "--list-id", "fresh", "--out", list);
    expect(init.status, init.stderr).toBe(0);
    expect(statSync(join(dir, "fresh", "home", "trust")).mode & 0o777).toBe(0o700);
  });

  it("adds a CRLF public key in canonical form and refuses a private key file", () => {
    const list = join(dir, "keys.json");
    expect(run("init", "--list-id", "keys", "--out", list).status).toBe(0);
    const pub = readFileSync(join(dir, "auditor.pub"), "utf8");
    const crlf = join(dir, "auditor-crlf.pub");
    writeFileSync(crlf, pub.replaceAll("\n", "\r\n"));
    const added = run("add", "--list", list, "--pubkey", crlf, "--purpose", "artifact-seal", "--subject", "x");
    expect(added.status, added.stderr).toBe(0);
    expect((JSON.parse(readFileSync(list, "utf8")) as { list: { entries: Array<{ publicKeyPem: string }> } }).list.entries[0]!.publicKeyPem).toBe(pub);
    const before = readFileSync(list, "utf8");
    const secret = run("add", "--list", list, "--pubkey", join(dir, "auditor.key"), "--purpose", "release", "--subject", "x");
    expect(secret.status).toBe(1);
    expect(secret.stderr).toContain("TRUST_LIST_INVALID");
    expect(readFileSync(list, "utf8")).toBe(before);
  });

  it("refuses an invalid entry instead of writing it", () => {
    const list = join(dir, "bad.json");
    expect(run("init", "--list-id", "bad", "--out", list).status).toBe(0);
    const before = readFileSync(list, "utf8");
    const bad = run("add", "--list", list, "--pubkey", join(dir, "auditor.pub"), "--purpose", "everything", "--subject", "x");
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("TRUST_LIST_INVALID");
    expect(readFileSync(list, "utf8")).toBe(before);
  });
});
