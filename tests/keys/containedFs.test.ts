import { cpSync, linkSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureSigningKeys } from "../../src/crypto/keys.js";
import { getSigningKey, rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { leaseRevocationPaths, readVerifiedLeaseRevocations, revokeLease } from "../../src/leases/leaseStore.js";
import { lockVault } from "../../src/vault/vault.js";

// P1-08 security review: key and revocation files are reached only through real directories below the workspace, opened
// without following a final symlink, refused when hard-linked, and re-checked after open so a swap is caught.
const swap = vi.hoisted(() => ({ path: null as string | null, run: null as null | (() => void) }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const openSync = ((path: import("node:fs").PathLike, ...rest: unknown[]) => {
    if (swap.path !== null && String(path) === swap.path && swap.run) { const run = swap.run; swap.run = null; run(); }
    return (actual.openSync as (...args: unknown[]) => number)(path, ...rest);
  }) as typeof actual.openSync;
  return { ...actual, openSync, default: { ...actual, openSync } };
});

const PASS = "amc-test-passphrase";
const roots: string[] = [];
afterEach(() => {
  swap.path = null;
  swap.run = null;
  for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); }
});
function dir(prefix: string): string {
  const made = mkdtempSync(join(tmpdir(), prefix));
  roots.push(made);
  return made;
}
function workspace(): string {
  const root = dir("amc-contained-");
  ensureSigningKeys(root);
  return root;
}

describe("contained key files (P1-08, security review)", () => {
  it("refuses a keys directory that is a symlink, even to a faithful copy", () => {
    const root = workspace();
    const keys = join(root, ".amc", "keys");
    const copy = join(dir("amc-keys-copy-"), "keys");
    cpSync(keys, copy, { recursive: true });
    rmSync(keys, { recursive: true });
    symlinkSync(copy, keys);
    expect(() => getSigningKey(root, "receipt")).toThrow(/symlink/);
  });

  it("refuses a symlinked parent (.amc) of the keys directory", () => {
    const root = workspace();
    lockVault(root);
    const amc = join(root, ".amc");
    const moved = join(dir("amc-moved-"), ".amc");
    renameSync(amc, moved);
    symlinkSync(moved, amc);
    expect(() => getSigningKey(root, "receipt")).toThrow(/symlink/);
  });

  it("refuses a symlinked key file and a dangling symlink in place of the key set", () => {
    const root = workspace();
    const keyset = join(root, ".amc", "keys", "keyset.json");
    const elsewhere = join(dir("amc-elsewhere-"), "keyset.json");
    writeFileSync(elsewhere, readFileSync(keyset));
    rmSync(keyset);
    symlinkSync(elsewhere, keyset);
    expect(() => getSigningKey(root, "receipt")).toThrow(/symlink/);
    rmSync(keyset);
    symlinkSync(join(root, "missing-target.json"), keyset);
    expect(() => getSigningKey(root, "receipt")).toThrow(/symlink/);
  });

  it("refuses a key file hard-linked to a file outside the keys directory", () => {
    const root = workspace();
    const pub = join(root, ".amc", "keys", "receipt.pub");
    const outside = join(dir("amc-hardlink-"), "receipt.pub");
    linkSync(pub, outside);
    expect(() => getSigningKey(root, "receipt")).toThrow(/hard link|link count/);
  });

  it("catches a symlink swapped in between the check and the open", () => {
    const root = workspace();
    rotatePurposeKeys({ workspace: root, purposes: ["receipt"], passphrase: PASS });
    const pub = join(root, ".amc", "keys", "receipt.pub");
    const elsewhere = join(dir("amc-swap-"), "receipt.pub");
    writeFileSync(elsewhere, readFileSync(pub));
    writeFileSync(pub, readFileSync(pub)); // a new mtime: the next check re-reads the file instead of trusting its memo
    swap.path = pub;
    swap.run = () => { rmSync(pub); symlinkSync(elsewhere, pub); };
    expect(() => getSigningKey(root, "receipt")).toThrow(/ELOOP|symlink|changed/);
  });

  it("refuses a symlinked lease revocations directory", () => {
    const root = workspace();
    revokeLease(root, "lease-a", "fixture");
    const leases = join(root, ".amc", "studio", "leases");
    const moved = join(dir("amc-leases-"), "leases");
    cpSync(leases, moved, { recursive: true });
    rmSync(leases, { recursive: true });
    symlinkSync(moved, leases);
    expect(readVerifiedLeaseRevocations(root)).toEqual({ ok: false, reason: expect.stringMatching(/symlink/) });
    expect(() => revokeLease(root, "lease-b", "must not write through the link")).toThrow();
    expect(readFileSync(join(moved, "revocations.signed.json"), "utf8")).not.toContain("lease-b");
    expect(leaseRevocationPaths(root).file.startsWith(leases)).toBe(true);
  });

  it("writes never go through an existing symlinked staging name", () => {
    const root = workspace();
    const victim = join(dir("amc-victim-"), "victim.txt");
    writeFileSync(victim, "keep me");
    mkdirSync(join(root, ".amc", "keys", "statements", "receipt"), { recursive: true });
    symlinkSync(victim, join(root, ".amc", "keys", "statements", "receipt", "1.json.keyset-staged"));
    expect(() => rotatePurposeKeys({ workspace: root, purposes: ["receipt"], passphrase: PASS })).toThrow();
    expect(readFileSync(victim, "utf8")).toBe("keep me");
  });
});
