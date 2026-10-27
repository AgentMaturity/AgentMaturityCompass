// Proposed destination: tests/keys/asyncKeyRevokeDigestV2.test.ts. Additive v2 successor; frozen v1/race tests stay intact.
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { revokeKeyAsync, rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { getSigningKey, getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { boundKeyset, commitKeyset } from "../../src/keys/keyset.js";
import { keyRevocationLocation, readKeyRevocations } from "../../src/keys/keyRevocations.js";
import { nextRevocationList, publishRevocationList, readAnchoredRevocationList, revocationListSha256 } from "../../src/keys/revocationList.js";
import { withControlFileLock } from "../../src/lifecycle/controlFileLock.js";
import { logSequence } from "../../src/keys/anchorLog.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { canonicalize } from "../../src/utils/json.js";
import { lockVault } from "../../src/vault/vault.js";
import { verifyArtifact } from "../../packages/verifier/src/index.js";
import { signTrustList } from "../../src/trust/trustList.js";
import { AWS_ARN, awsFake, fakeKey } from "./providerFakes.js";
import { listEntry, testKey, trustList } from "../trust/trustFixtures.js";

const roots: Array<{ root: string; ws: string }> = [], PASS = "owned-async-revoke-v2-passphrase";
afterEach(() => { vi.unstubAllEnvs(); for (const { root, ws } of roots.splice(0)) { lockVault(ws); rmSync(root, { recursive: true, force: true }); } });
describe("async key-revoke owner flow selects digest-v2 before provider signing", () => {
  test.each(["ed25519", "p256"] as const)("a large existing v1 list is extended safely by a %s AWS purpose signer using one explicit v2 envelope", async kind => {
    const root = mkdtempSync(join(tmpdir(), "amc-owner-revoke-v2-")), ws = join(root, "workspace"); roots.push({ root, ws });
    vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS);
    initWorkspace({ workspacePath: ws, trustBoundaryMode: "isolated" });
    rotatePurposeKeys({ workspace: ws, purposes: ["receipt"], passphrase: PASS });
    const retired = signingKeyId(getSigningPublicKeyPem(ws, "receipt"))!;
    rotatePurposeKeys({ workspace: ws, purposes: ["receipt"], passphrase: PASS });
    const location = keyRevocationLocation(ws), current = readAnchoredRevocationList(location)!;
    const rows = [0, 1].map(n => ({ id: `retired-certificate-${n}`, kind: "certificate" as const, reason: "x".repeat(3000), revokedAt: new Date().toISOString() }));
    const large = nextRevocationList(location.listId, { sequence: current.list.sequence, sha256: revocationListSha256(current.list) }, rows, 0);
    const old = withControlFileLock({ root: join(ws, ".amc", "keys"), name: "key-revocations", operation: () =>
      publishRevocationList(location, large, getSigningKey(ws, "revocation-list"), logSequence) });
    expect(old.signatureVersion).toBeUndefined();

    const key = fakeKey(kind), ref = { provider: "aws-kms" as const, id: AWS_ARN("large-owner-revocation") }, fake = awsFake({ [ref.id]: key });
    const provider = awsKmsProvider(fake.call), description = await provider.describe(ref), keyset = boundKeyset(ws)!;
    // Owned, authenticated key-set fixture state; current bind CLI remains ledger-row-only until its other callers migrate.
    commitKeyset(ws, { keys: keyset.keys, providers: { ...keyset.providers, "revocation-list": {
      provider: ref.provider, id: ref.id, keyId: description.keyId, algorithm: description.algorithm,
      protection: description.protection, protectionBasis: description.protectionBasis } },
      writes: [{ path: join(ws, ".amc", "keys", "revocation-list-provider.pub"), bytes: description.publicKeyPem, mode: 0o644 }] });
    await expect(revokeKeyAsync(ws, "receipt", retired, "superseded", PASS, { provider })).resolves.toMatchObject({ sequence: large.sequence + 1 });
    const published = readAnchoredRevocationList(keyRevocationLocation(ws))!;
    expect(published.signatureVersion).toBe(2); expect(published.list.previousSha256).toBe(revocationListSha256(large));
    expect(published.list.revoked.map(row => row.id).sort()).toEqual([...rows.map(row => row.id), retired].sort());
    const legacy = Buffer.from("AMC_REVOCATION_LIST_V1\0" + canonicalize(published.list)); expect(legacy.length).toBeGreaterThan(4096);
    const exact = Buffer.concat([Buffer.from("AMC_REVOCATION_LIST_V2_DIGEST\0"), createHash("sha256").update(legacy).digest()]);
    const requests = fake.requests.filter(row => row.operation === "Sign"); expect(requests).toHaveLength(1);
    expect(Buffer.from(requests[0]!.input.Message as Uint8Array)).toEqual(exact); expect(requests[0]!.input.MessageType).toBe("RAW");
    expect(readKeyRevocations(ws, true).map(row => row.keyId)).toContain(retired); expect(getSigningKey(ws, "receipt")).toContain("PRIVATE KEY");

    const externalRoot = testKey(), entry = listEntry({ ...externalRoot, keyId: description.keyId, publicKeyPem: description.publicKeyPem },
      { algorithm: description.algorithm, purposes: ["revocation-list"] });
    const authority = signTrustList(trustList([entry]), externalRoot.privateKeyPem, { signatureVersion: 2 });
    const report = verifyArtifact(Buffer.from(canonicalize(published)), { asOf: new Date("2026-10-20T23:59:59.000Z"),
      trustRoots: [externalRoot.keyId], trustLists: [authority], knownSequences: { [large.listId]: large.sequence } });
    expect(report.integrity.status).toBe("pass"); expect(report.issuerAdmission.status).toBe("pass");
  });
});
