/** P2-08: ECDSA P-256 (IEEE P1363) is accepted by AMC's trust lists, admission and the standalone verifier; DER never is. */
import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { describe, expect, test } from "vitest";
import { verifyArtifact } from "../../packages/verifier/src/index.js";
import { admitKey, verifySignedTrustList } from "../../src/trust/index.js";
import { canonicalize } from "../../src/utils/json.js";
import { context } from "../trust/trustFixtures.js";

function p256() {
  const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const publicKeyPem = pair.publicKey.export({ format: "pem", type: "spki" }).toString();
  return { privateKey: pair.privateKey, publicKeyPem, keyId: createHash("sha256").update(publicKeyPem, "utf8").digest("hex") };
}
const tagged = (tag: string, value: unknown) => Buffer.concat([Buffer.from(tag, "ascii"), Buffer.from([0]), Buffer.from(canonicalize(value), "utf8")]);
const p1363 = (bytes: Buffer, key: KeyObject) => sign("sha256", bytes, { key, dsaEncoding: "ieee-p1363" }).toString("base64");
const der = (bytes: Buffer, key: KeyObject) => sign("sha256", bytes, key).toString("base64");

const root = p256();
const revoker = p256();
const asOf = new Date("2026-10-01T00:00:00.000Z");
const list = {
  type: "amc.trust-list", version: 1, listId: "ecdsa-p256", sequence: 1, issuedAt: "2026-09-01T00:00:00.000Z", expiresAt: "2027-09-01T00:00:00.000Z",
  entries: [{ keyId: revoker.keyId, algorithm: "ecdsa-p256-sha256", publicKeyPem: revoker.publicKeyPem, purposes: ["revocation-list"], subject: "TEST ONLY P-256 revocation key",
    validFrom: "2026-01-01T00:00:00.000Z", validTo: "2028-01-01T00:00:00.000Z", source: "operator" }],
  distrust: []
};
const signedList = (encode: typeof p1363) => ({ list, signatures: [{ keyId: root.keyId, publicKeyPem: root.publicKeyPem, signature: encode(tagged("AMC_TRUST_LIST_V1", list), root.privateKey) }] });
const revocations = { type: "amc.revocation-list", version: 1, listId: "leases:ws-ecdsa", sequence: 1, previousSha256: null, issuedAt: "2026-09-05T00:00:00.000Z",
  revoked: [{ id: "lease-1", kind: "lease", reason: "TEST ONLY", revokedAt: "2026-09-05T00:00:00.000Z" }] };
const revocationArtifact = (encode: typeof p1363) => Buffer.from(canonicalize({ anchor: null, list: revocations,
  signature: { keyId: revoker.keyId, signature: encode(tagged("AMC_REVOCATION_LIST_V1", revocations), revoker.privateKey) } }));

describe("ECDSA P-256 keys in trust lists and verifiers (P2-08)", () => {
  test("AMC verifies a P-256 root's trust list and admits its P-256 entry; a DER root signature is refused", () => {
    expect(verifySignedTrustList(signedList(p1363), { pinnedRootKeyIds: [root.keyId], now: asOf }).entries[0]!.algorithm).toBe("ecdsa-p256-sha256");
    expect(() => verifySignedTrustList(signedList(der), { pinnedRootKeyIds: [root.keyId], now: asOf })).toThrow();
    const admitted = admitKey({ publicKeyPem: revoker.publicKeyPem, purpose: "revocation-list", signature: "list", context: context({ asOf, lists: [list as never] }) });
    expect(admitted).toMatchObject({ status: "admitted", keyId: revoker.keyId });
    // An entry whose algorithm is not its key's is refused when the list is parsed.
    const mislabelled = { ...list, entries: [{ ...list.entries[0]!, algorithm: "ed25519" }] };
    expect(() => verifySignedTrustList({ list: mislabelled, signatures: [{ keyId: root.keyId, publicKeyPem: root.publicKeyPem, signature: p1363(tagged("AMC_TRUST_LIST_V1", mislabelled), root.privateKey) }] },
      { pinnedRootKeyIds: [root.keyId], now: asOf })).toThrow(/algorithm/);
  });

  test("the standalone verifier accepts the same list and a P-256 revocation list, and refuses DER", () => {
    const trustListReport = verifyArtifact(Buffer.from(canonicalize(signedList(p1363))), { trustLists: [], trustRoots: [root.keyId], asOf });
    expect(trustListReport.integrity.status).toBe("pass");
    expect(trustListReport.issuerAdmission.status).toBe("pass");
    expect(verifyArtifact(Buffer.from(canonicalize(signedList(der))), { trustLists: [], trustRoots: [root.keyId], asOf }).integrity.status).toBe("fail");

    const report = verifyArtifact(revocationArtifact(p1363), { trustLists: [signedList(p1363)], trustRoots: [root.keyId], asOf });
    expect(report.integrity.status).toBe("pass");
    expect(report.issuerAdmission.status).toBe("pass");
    expect(verifyArtifact(revocationArtifact(der), { trustLists: [signedList(p1363)], trustRoots: [root.keyId], asOf }).integrity.status).toBe("fail");
  });
});
