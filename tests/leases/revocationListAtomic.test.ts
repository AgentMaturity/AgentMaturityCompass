import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPrivateKeyPem, signHexDigest } from "../../src/crypto/keys.js";
import { loggedAnchor } from "../../src/keys/anchors.js";
import { getSigningKey, rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { encodeSignedRevocationList, nextRevocationList, revocationListSha256, signRevocationList } from "../../src/keys/revocationList.js";
import {
  leaseRevocationPaths, loadLeaseRevocations, readVerifiedLeaseRevocations, revokeLease, revokedLeaseIdSet, verifyLeaseRevocationsSignature
} from "../../src/leases/leaseStore.js";
import * as transparency from "../../src/transparency/logChain.js";
import * as containedFs from "../../src/utils/containedFs.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";

const roots: string[] = [];
function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-revocation-list-"));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); }
});

/** A 1.x store: revocations.json beside revocations.json.sig, signed by the auditor key over the file digest. */
function legacyPair(root: string, leaseIds: string[]): Buffer {
  const paths = leaseRevocationPaths(root);
  const bytes = Buffer.from(JSON.stringify({ v: 1, updatedTs: 1, revocations: leaseIds.map(leaseId => ({ leaseId, revokedTs: 1_700_000_000_000, reason: "1.x" })) }, null, 2));
  const digest = sha256Hex(bytes);
  mkdirSync(dirname(paths.legacyFile), { recursive: true });
  writeFileSync(paths.legacyFile, bytes);
  writeFileSync(paths.legacySig, JSON.stringify({ digestSha256: digest, signature: signHexDigest(digest, getPrivateKeyPem(root, "auditor")), signedTs: 1, signer: "auditor" }));
  return bytes;
}
const signedList = (root: string) => JSON.parse(readFileSync(leaseRevocationPaths(root).file, "utf8"));

describe("single-file signed lease revocations (P1-08)", () => {
  it("reads a 1.x pair until the first write, which replaces it with one sequenced file anchored on the old digest", () => {
    const root = workspace();
    const paths = leaseRevocationPaths(root);
    const legacyBytes = legacyPair(root, ["lease-1x"]);
    expect(revokedLeaseIdSet(root)).toEqual(new Set(["lease-1x"]));

    revokeLease(root, "lease-new", "after upgrade");
    const { list, anchor } = signedList(root);
    expect(list).toMatchObject({ type: "amc.revocation-list", version: 1, listId: "leases:default", sequence: 1, previousSha256: sha256Hex(legacyBytes) });
    expect(list.revoked.map((row: { id: string }) => row.id)).toEqual(["lease-1x", "lease-new"]);
    expect(loggedAnchor(root, "REVOCATION_LIST", "leases:default")).toEqual({ sequence: 1, sha256: revocationListSha256(list), entryHash: anchor.transparencyEntryHash });
    // A 1.x binary now finds a signature without its list and refuses every lease instead of reading an empty store.
    expect(existsSync(paths.legacyFile)).toBe(false);
    expect(JSON.parse(readFileSync(paths.legacySig, "utf8"))).toMatchObject({ type: "amc.revocation-list-moved", previousSha256: sha256Hex(legacyBytes) });
    expect(revokedLeaseIdSet(root)).toEqual(new Set(["lease-1x", "lease-new"]));
    expect(loadLeaseRevocations(root).revocations.map(row => row.leaseId)).toEqual(["lease-1x", "lease-new"]);
  });

  it("ignores and reports a stale pair restored next to the newer single file", () => {
    const root = workspace();
    const paths = leaseRevocationPaths(root);
    const legacyBytes = legacyPair(root, ["lease-1x"]);
    const legacySig = readFileSync(paths.legacySig);
    revokeLease(root, "lease-new", "after upgrade");
    writeFileSync(paths.legacyFile, legacyBytes);
    writeFileSync(paths.legacySig, legacySig);
    expect(revokedLeaseIdSet(root)).toEqual(new Set(["lease-1x", "lease-new"]));
    expect(verifyLeaseRevocationsSignature(root)).toEqual({ valid: true, signatureExists: true, reason: "a superseded revocations.json pair is present and ignored" });
    revokeLease(root, "lease-third", "next write retires the stale pair");
    expect(existsSync(paths.legacyFile)).toBe(false);
    expect(signedList(root).list.sequence).toBe(2);
  });

  it("fails closed in every interrupted migration state", () => {
    const root = workspace();
    const paths = leaseRevocationPaths(root);
    legacyPair(root, ["lease-1x"]);
    rmSync(paths.legacyFile); // half of the 1.x pair
    expect(readVerifiedLeaseRevocations(root)).toEqual({ ok: false, reason: "revocation list missing but signature present" });
    expect(() => revokeLease(root, "x", "must not bootstrap over a half pair")).toThrow(/unverifiable/);
    expect(existsSync(paths.file)).toBe(false);
  });

  it("rolls a write forward when it crashed after logging, and back when it crashed before", () => {
    const root = workspace();
    const paths = leaseRevocationPaths(root);
    revokeLease(root, "lease-a", "first");
    const write = containedFs.writeContained;
    const crashOn = vi.spyOn(containedFs, "writeContained").mockImplementation((root, rel, bytes, mode) => {
      if (join(root, rel) === paths.file) throw new Error("simulated crash before the final rename");
      write(root, rel, bytes, mode);
    });
    expect(() => revokeLease(root, "lease-b", "crashes after its log entry")).toThrow(/simulated/);
    crashOn.mockRestore();
    expect(existsSync(paths.pending)).toBe(true);
    expect(revokedLeaseIdSet(root)).toEqual(new Set(["lease-a", "lease-b"]));
    expect(existsSync(paths.pending)).toBe(false);
    expect(signedList(root).list.sequence).toBe(2);

    const append = vi.spyOn(transparency, "appendTransparencyEntry").mockImplementation(() => { throw new Error("simulated crash before logging"); });
    expect(() => revokeLease(root, "lease-c", "never committed")).toThrow(/simulated/);
    append.mockRestore();
    expect(existsSync(paths.pending)).toBe(true);
    expect(revokedLeaseIdSet(root)).toEqual(new Set(["lease-a", "lease-b"]));
    expect(existsSync(paths.pending)).toBe(false);
    revokeLease(root, "lease-c", "retried");
    expect(signedList(root).list.sequence).toBe(3);
  });

  it("prunes revocations of leases that expired, keeping the sequence monotonic", () => {
    const root = workspace();
    revokeLease(root, "lease-expired", "expired long ago", { expiresTs: Date.now() - 60 * 60 * 1000 });
    revokeLease(root, "lease-live", "still valid", { expiresTs: Date.now() + 60 * 60 * 1000 });
    revokeLease(root, "lease-forever", "no expiry known");
    const { list } = signedList(root);
    expect(list.sequence).toBe(3);
    expect(list.revoked.map((row: { id: string }) => row.id)).toEqual(["lease-live", "lease-forever"]);
    expect(list.revoked[0].expiresAt).toMatch(/Z$/);
  });

  it("refuses a list signed by another auditor purpose's key after a purpose split (self-audit)", () => {
    const root = workspace();
    revokeLease(root, "lease-a", "revoked");
    rotatePurposeKeys({ workspace: root, purposes: ["config-signature"], passphrase: "amc-test-passphrase" });
    const { list } = signedList(root);
    const unrevoked = nextRevocationList(list.listId, { sequence: list.sequence, sha256: revocationListSha256(list) }, [], 0);
    const file = leaseRevocationPaths(root).file;
    rmSync(file);
    writeFileSync(file, encodeSignedRevocationList(signRevocationList(unrevoked, getSigningKey(root, "config-signature"))));
    expect(readVerifiedLeaseRevocations(root)).toMatchObject({ ok: false });
  });
});
