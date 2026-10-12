import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { lockVault } from "../src/vault/vault.js";
import { leaseRevocationPaths, revokeLease, revokedLeaseIdSet, signLeaseRevocations, verifyLeaseRevocationsSignature } from "../src/leases/leaseStore.js";
import { ensureLeaseRevocationStore, revokeLeaseForCli, resignLeaseRevocationsForCli } from "../src/leases/leaseCli.js";
import { sha256Hex } from "../src/utils/hash.js";
import { sign } from "node:crypto";
import { getPrivateKeyPem } from "../src/crypto/keys.js";
import { canonicalize } from "../src/utils/json.js";

// A one-shot hook that runs just before the revocations lock is taken: the gap between a caller's unlocked check
// and the locked publish, where another process can drop a file.
const beforeLock = vi.hoisted(() => ({ next: null as null | (() => void) }));
vi.mock("../src/lifecycle/controlFileLock.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lifecycle/controlFileLock.js")>();
  return { ...actual, withControlFileLock: ((input) => {
    const hook = beforeLock.next;
    beforeLock.next = null;
    hook?.();
    return actual.withControlFileLock(input);
  }) as typeof actual.withControlFileLock };
});

// Temporary signed-store fixtures, authored only. No production revocation or
// repair is performed; future source tests do not constitute installed proof.
const roots: string[] = [];
function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-revocation-writer-")); roots.push(root);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-revocation-writer-fixture");
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}
function snapshot(root: string) {
  const paths = leaseRevocationPaths(root);
  return { list: existsSync(paths.file) ? readFileSync(paths.file) : null, signature: existsSync(paths.legacySig) ? readFileSync(paths.legacySig) : null };
}
afterEach(() => {
  for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); }
  vi.unstubAllEnvs(); vi.restoreAllMocks();
});

describe("AMC-1542 revocation writer authenticates the prior snapshot", () => {
  it("preserves earlier revoked IDs while signing a healthy append and idempotent update", () => {
    const root = workspace();
    revokeLease(root, "older-revoked", "reviewed earlier compromise");
    revokeLeaseForCli({ workspace: root, leaseId: "new-revoked", reason: "new compromise" });
    expect(verifyLeaseRevocationsSignature(root).valid).toBe(true);
    expect(revokedLeaseIdSet(root)).toEqual(new Set(["older-revoked", "new-revoked"]));
    const repeated = revokeLease(root, "new-revoked", "reviewed reason update");
    expect(repeated.revocations).toHaveLength(2);
    expect(repeated.revocations.find(item => item.leaseId === "new-revoked")?.reason).toBe("reviewed reason update");
    expect(verifyLeaseRevocationsSignature(root).valid).toBe(true);
  });
  it.each(["removed-entry", "missing-list", "missing-signature", "invalid-signature", "invalid-json", "signed-malformed"] as const)("refuses %s without rewriting list or signature", variant => {
    const root = workspace();
    revokeLease(root, "older-revoked", "must remain revoked");
    const paths = leaseRevocationPaths(root);
    // P1-08: one signed file carries the list, its signature and its anchor.
    const body = JSON.parse(readFileSync(paths.file, "utf8"));
    const rewrite = (value: unknown) => writeFileSync(paths.file, JSON.stringify(value));
    if (variant === "removed-entry") rewrite({ ...body, list: { ...body.list, revoked: [] } });
    else if (variant === "missing-list") rmSync(paths.file);
    else if (variant === "missing-signature") rewrite({ list: body.list, anchor: body.anchor });
    else if (variant === "invalid-signature") rewrite({ ...body, signature: { ...body.signature, signature: Buffer.alloc(64).toString("base64") } });
    else if (variant === "invalid-json") writeFileSync(paths.file, "{");
    else {
      // Validly signed by the workspace key, but not a revocation list the schema admits.
      const list = { ...body.list, revoked: "not-a-list" };
      const signature = sign(null, Buffer.concat([Buffer.from("AMC_REVOCATION_LIST_V1\0", "latin1"), Buffer.from(canonicalize(list))]), getPrivateKeyPem(root, "auditor")).toString("base64");
      writeFileSync(paths.file, canonicalize({ ...body, list, signature: { ...body.signature, signature } }));
    }
    const before = snapshot(root);
    expect(() => revokeLeaseForCli({ workspace: root, leaseId: "unrelated-new-id", reason: "must not launder" })).toThrow(/revocation store unverifiable/);
    expect(snapshot(root)).toEqual(before);
    expect(() => revokedLeaseIdSet(root)).toThrow();
  });
  it("keeps a truly absent list and signature eligible for normal first-revocation bootstrap", () => {
    const root = workspace();
    const paths = leaseRevocationPaths(root);
    rmSync(paths.file, { force: true }); rmSync(paths.legacySig, { force: true });
    expect(revokeLease(root, "first-id", "first revocation").revocations.map(item => item.leaseId)).toEqual(["first-id"]);
    expect(verifyLeaseRevocationsSignature(root).valid).toBe(true);
  });
  it("does not overwrite the prior signed list when the signer is unavailable", () => {
    const root = workspace(); revokeLease(root, "older-revoked", "preserve");
    const before = snapshot(root);
    lockVault(root); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
    expect(() => revokeLease(root, "next-id", "signer unavailable")).toThrow();
    expect(snapshot(root)).toEqual(before);
  });
  it("lease issue bootstrap with the signer unavailable leaves no unsigned store behind (P0-30)", () => {
    const root = workspace();
    const paths = leaseRevocationPaths(root);
    rmSync(paths.file, { force: true }); rmSync(paths.legacySig, { force: true });
    lockVault(root); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
    expect(() => ensureLeaseRevocationStore(root)).toThrow(/locked/i);
    expect(snapshot(root)).toEqual({ list: null, signature: null });
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-revocation-writer-fixture");
    expect(ensureLeaseRevocationStore(root).signatureValid).toBe(true);
  });
  it.each(["revoke", "resign", "bootstrap"] as const)("%s refuses to publish a pair that would not verify (P0-30)", variant => {
    const root = workspace();
    if (variant === "bootstrap") {
      const paths = leaseRevocationPaths(root);
      rmSync(paths.file, { force: true }); rmSync(paths.legacySig, { force: true });
    } else revokeLease(root, "older-revoked", "must remain revoked");
    const before = snapshot(root);
    lockVault(root); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); vi.stubEnv("AMC_NO_SIGN", "1"); // ephemeral signer
    const publish = variant === "revoke" ? () => revokeLease(root, "next-id", "unverifiable signer")
      : variant === "resign" ? () => resignLeaseRevocationsForCli(root, sha256Hex(before.list!)) : () => ensureLeaseRevocationStore(root);
    expect(publish).toThrow(/would not verify/);
    expect(snapshot(root)).toEqual(before);
    if (variant !== "bootstrap") expect(revokedLeaseIdSet(root)).toEqual(new Set(["older-revoked"]));
  });
  it("leaves the deliberate reviewed repair path separate from ordinary revocation", () => {
    const root = workspace(); revokeLease(root, "older-revoked", "preserve");
    const paths = leaseRevocationPaths(root);
    const body = JSON.parse(readFileSync(paths.file, "utf8"));
    writeFileSync(paths.file, JSON.stringify({ ...body, updatedTs: body.updatedTs + 1 }));
    expect(() => revokeLease(root, "next-id", "ordinary operation")).toThrow(/revocation store unverifiable/);
    const repair = resignLeaseRevocationsForCli(root, sha256Hex(readFileSync(paths.file))); // explicit fixture-only operator repair
    expect(repair.wasValid).toBe(false);
    expect(repair.revocationCount).toBe(1);
    revokeLease(root, "next-id", "after reviewed repair");
    expect(revokedLeaseIdSet(root)).toEqual(new Set(["older-revoked", "next-id"]));
  });
});

describe("revocation bootstrap and repair sign only reviewed bytes (P0-30 follow-up)", () => {
  it("bootstrap never signs a list that appeared after its unlocked absence check", () => {
    const root = workspace();
    const paths = leaseRevocationPaths(root);
    rmSync(paths.file, { force: true }); rmSync(paths.legacySig, { force: true });
    const planted = Buffer.from(JSON.stringify({ v: 1, updatedTs: 1, revocations: [] }));
    beforeLock.next = () => { mkdirSync(dirname(paths.file), { recursive: true }); writeFileSync(paths.file, planted); };
    expect(ensureLeaseRevocationStore(root).signatureValid).toBe(false);
    expect(snapshot(root)).toEqual({ list: planted, signature: null });
  });
  it("resign refuses a list that is not the one whose digest the operator reviewed", () => {
    const root = workspace(); revokeLease(root, "older-revoked", "preserve");
    const paths = leaseRevocationPaths(root);
    const reviewed = sha256Hex(readFileSync(paths.file));
    const swapped = Buffer.from(JSON.stringify({ v: 1, updatedTs: 2, revocations: [] }));
    const signature = snapshot(root).signature;
    beforeLock.next = () => writeFileSync(paths.file, swapped);
    expect(() => resignLeaseRevocationsForCli(root, reviewed)).toThrow(/reviewed/);
    expect(snapshot(root)).toEqual({ list: swapped, signature });
    expect(() => revokedLeaseIdSet(root)).toThrow();
  });
  it("resign refuses a missing list instead of vouching for an empty one", () => {
    const root = workspace(); revokeLease(root, "older-revoked", "preserve");
    const paths = leaseRevocationPaths(root);
    const reviewed = sha256Hex(readFileSync(paths.file));
    rmSync(paths.file);
    const before = snapshot(root);
    expect(() => resignLeaseRevocationsForCli(root, reviewed)).toThrow();
    expect(snapshot(root)).toEqual(before);
  });
});
