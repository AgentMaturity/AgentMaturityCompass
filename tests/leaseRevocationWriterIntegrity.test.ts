import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { lockVault } from "../src/vault/vault.js";
import { leaseRevocationPaths, revokeLease, revokedLeaseIdSet, signLeaseRevocations, verifyLeaseRevocationsSignature } from "../src/leases/leaseStore.js";
import { revokeLeaseForCli, resignLeaseRevocationsForCli } from "../src/leases/leaseCli.js";

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
  return { list: existsSync(paths.file) ? readFileSync(paths.file) : null, signature: existsSync(paths.sig) ? readFileSync(paths.sig) : null };
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
    if (variant === "removed-entry") {
      const body = JSON.parse(readFileSync(paths.file, "utf8"));
      writeFileSync(paths.file, JSON.stringify({ ...body, revocations: [] }));
    } else if (variant === "missing-list") rmSync(paths.file);
    else if (variant === "missing-signature") rmSync(paths.sig);
    else if (variant === "invalid-signature") writeFileSync(paths.sig, "{}");
    else if (variant === "invalid-json") writeFileSync(paths.file, "{");
    else {
      writeFileSync(paths.file, JSON.stringify({ v: 1, updatedTs: Date.now(), revocations: "not-a-list" }));
      signLeaseRevocations(root); // deliberate malformed fixture, not an accepted store
    }
    const before = snapshot(root);
    expect(() => revokeLeaseForCli({ workspace: root, leaseId: "unrelated-new-id", reason: "must not launder" })).toThrow(/revocation store unverifiable/);
    expect(snapshot(root)).toEqual(before);
    expect(() => revokedLeaseIdSet(root)).toThrow();
  });
  it("keeps a truly absent list and signature eligible for normal first-revocation bootstrap", () => {
    const root = workspace();
    const paths = leaseRevocationPaths(root);
    rmSync(paths.file, { force: true }); rmSync(paths.sig, { force: true });
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
  it("leaves the deliberate reviewed repair path separate from ordinary revocation", () => {
    const root = workspace(); revokeLease(root, "older-revoked", "preserve");
    const paths = leaseRevocationPaths(root);
    const body = JSON.parse(readFileSync(paths.file, "utf8"));
    writeFileSync(paths.file, JSON.stringify({ ...body, updatedTs: body.updatedTs + 1 }));
    expect(() => revokeLease(root, "next-id", "ordinary operation")).toThrow(/revocation store unverifiable/);
    const repair = resignLeaseRevocationsForCli(root); // explicit fixture-only operator repair
    expect(repair.wasValid).toBe(false);
    expect(repair.revocationCount).toBe(1);
    revokeLease(root, "next-id", "after reviewed repair");
    expect(revokedLeaseIdSet(root)).toEqual(new Set(["older-revoked", "next-id"]));
  });
});
