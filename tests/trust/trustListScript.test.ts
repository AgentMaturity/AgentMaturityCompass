import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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
  it("root-rotate, root-sign and root-apply rotate a 2-of-2 root set, each holder signing alone (P1-08)", () => {
    for (const name of ["root-1", "root-2", "new-1", "new-2"]) expect(run("keygen", "--out", dir, "--name", name).status).toBe(0);
    const home = join(dir, "home");
    const rootsFile = join(home, "trust", "trust-roots.json");
    const pubId = (name: string) => createHash("sha256").update(readFileSync(join(dir, `${name}.pub`), "utf8")).digest("hex");
    mkdirSync(join(home, "trust"), { recursive: true });
    writeFileSync(rootsFile, JSON.stringify({ type: "amc.trust-roots", version: 1, roots: [pubId("root-1"), pubId("root-2")], threshold: 2, rootSetId: "acme-roots" }));
    const statement = join(dir, "rotation.json");
    const rotated = run("root-rotate", "--roots", rootsFile, "--new-pub", join(dir, "new-1.pub"), "--new-pub", join(dir, "new-2.pub"),
      "--new-threshold", "2", "--current-key", join(dir, "root-1.key"), "--out", statement);
    expect(rotated.status, rotated.stderr).toBe(0);
    const apply = () => spawnSync(process.execPath, [SCRIPT, "root-apply", "--statement", statement, "--root-pub", join(dir, "root-1.pub"), "--root-pub", join(dir, "root-2.pub")],
      { cwd: dir, encoding: "utf8", env: { ...process.env, AMC_HOME: home } });
    expect(apply().stderr).toContain("needs 2 distinct signatures from the current root set");
    expect(run("root-sign", "--statement", statement, "--key", join(dir, "new-1.key"), "--as", "current").stderr).toContain("is not a key of the current root set");
    for (const [key, as] of [["root-2", "current"], ["new-1", "new"], ["new-2", "new"]]) {
      const signed = run("root-sign", "--statement", statement, "--key", join(dir, `${key}.key`), "--as", as!);
      expect(signed.status, signed.stderr).toBe(0);
    }
    const applied = apply();
    expect(applied.status, applied.stderr).toBe(0);
    expect(JSON.parse(readFileSync(rootsFile, "utf8"))).toMatchObject({ roots: [pubId("new-1"), pubId("new-2")], threshold: 2, rootSetId: "acme-roots" });
    expect(apply().stderr).toContain("already applied");
  });
});
