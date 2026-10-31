import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { verifyArtifact } from "../../packages/verifier/src/index.js";
import { readStagedRevocationList } from "../../src/keys/revocationList.js";
import { verifyRotationStatement } from "../../src/keys/rotationStatement.js";
import { applyTrustRootRotation } from "../../src/trust/rootRotation.js";
import { canonicalize } from "../../src/utils/json.js";
import { lowS, signingKeyId, type SigningAlgorithm } from "../../src/keys/algorithmPolicy.js";
interface Key { privateKey: KeyObject; publicKeyPem: string; keyId: string; algorithm: SigningAlgorithm }
function key(algorithm: SigningAlgorithm): Key {
  const pair = algorithm === "ed25519" ? generateKeyPairSync("ed25519") : generateKeyPairSync("ec", { namedCurve: "P-256" });
  const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  return { privateKey: pair.privateKey, publicKeyPem, keyId: signingKeyId(publicKeyPem)!, algorithm };
}
const tagged = (tag: string, value: unknown) => Buffer.concat([Buffer.from(`${tag}\0`), Buffer.from(canonicalize(value))]);
function signature(bytes: Buffer, owner: Key, der = false): string {
  return (owner.algorithm === "ed25519" ? sign(null, bytes, owner.privateKey) : der
    ? sign("sha256", bytes, { key: owner.privateKey, dsaEncoding: "der" })
    : lowS(sign("sha256", bytes, { key: owner.privateKey, dsaEncoding: "ieee-p1363" }))).toString("base64");
}
const dirs: string[] = [];
const fresh = () => { const dir = mkdtempSync(join(tmpdir(), "amc-statement-algorithm-")); dirs.push(dir); return dir; };
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const asOf = new Date("2026-10-06T00:00:00.000Z");
function admitted(owners: Key[], purposes: string[], roots: Key[] = [key("ed25519")], threshold = 1) {
  const list = { type: "amc.trust-list", version: 1, listId: "synthetic-algorithm-test", sequence: 1,
    issuedAt: "2026-09-01T00:00:00.000Z", expiresAt: "2027-09-01T00:00:00.000Z", entries: owners.map(owner => ({
      keyId: owner.keyId, algorithm: owner.algorithm, publicKeyPem: owner.publicKeyPem, purposes, subject: "synthetic test authority",
      validFrom: "2026-01-01T00:00:00.000Z", validTo: "2028-01-01T00:00:00.000Z", source: "operator" })), distrust: [] };
  return { asOf, trustRoots: roots.map(owner => owner.keyId), rootThreshold: threshold,
    trustLists: [{ list, signatures: roots.map(owner => ({ keyId: owner.keyId, publicKeyPem: owner.publicKeyPem,
      signature: signature(tagged("AMC_TRUST_LIST_V1", list), owner) })) }] };
}

it.each(["ed25519", "ecdsa-p256-sha256"] as const)("main and standalone revocation verification accept %s without changing trusted list identity", algorithm => {
  const signer = key(algorithm); const workspace = fresh(); const rel = "revocations.json";
  const list = { type: "amc.revocation-list", version: 1, listId: "keys:synthetic", sequence: 1, previousSha256: null,
    issuedAt: "2026-10-05T00:00:00.000Z", revoked: [{ id: "fixture-key", kind: "key", revokedAt: "2026-10-05T00:00:00.000Z", reason: "synthetic" }] };
  const make = (der = false) => ({ list, anchor: null, signature: { keyId: signer.keyId, signature: signature(tagged("AMC_REVOCATION_LIST_V1", list), signer, der) } });
  const location = { workspace, rel, listId: list.listId, trustedPublicKeyPems: [signer.publicKeyPem] };
  const publish = (value: unknown) => writeFileSync(join(workspace, `${rel}.pending`), canonicalize(value));
  const good = make(); publish(good);
  expect(readStagedRevocationList(location)).toEqual(good); // Real public bytes parser, not an export of its private verification helper.
  expect(verifyArtifact(Buffer.from(canonicalize(good)), admitted([signer], ["revocation-list"])).integrity.status).toBe("pass");
  expect(() => readStagedRevocationList({ ...location, trustedPublicKeyPems: [key(algorithm).publicKeyPem] })).toThrow(/not a trusted/);
  expect(() => readStagedRevocationList({ ...location, listId: "keys:other" })).toThrow(/not keys:other/);
  if (algorithm === "ecdsa-p256-sha256") {
    const invalid = make(true); publish(invalid); expect(() => readStagedRevocationList(location)).toThrow();
    expect(verifyArtifact(Buffer.from(canonicalize(invalid)), admitted([signer], ["revocation-list"])).integrity.status).toBe("fail");
  }
});

it.each([
  ["ed25519", "ecdsa-p256-sha256"], ["ecdsa-p256-sha256", "ed25519"], ["ecdsa-p256-sha256", "ecdsa-p256-sha256"]
] as const)("scheduled rotation keeps previous %s authority and proves next %s possession", (previousAlgorithm, nextAlgorithm) => {
  const previous = key(previousAlgorithm); const next = key(nextAlgorithm);
  const statement = { type: "amc.key-rotation", version: 1, workspaceId: "synthetic-workspace", purpose: "artifact-seal", sequence: 1,
    previousStatementSha256: null, previousKeyId: previous.keyId, nextKeyId: next.keyId, nextPublicKeyPem: next.publicKeyPem, reason: "scheduled",
    overlap: null, issuedAt: "2026-10-05T00:00:00.000Z" };
  const message = tagged("AMC_KEY_ROTATION_V1", statement);
  const rows = [{ by: "previous", keyId: previous.keyId, signature: signature(message, previous) },
    { by: "next", keyId: next.keyId, signature: signature(message, next) }];
  const bytes = (signatures = rows) => Buffer.from(canonicalize({ statement, signatures }));
  const options = { expected: { workspaceId: statement.workspaceId, purpose: "artifact-seal" as const }, trustedCurrentPublicKeyPem: previous.publicKeyPem, previous: null };
  expect(verifyRotationStatement(bytes(), options).valid).toBe(true);
  expect(verifyArtifact(bytes(), admitted([previous], ["artifact-seal"])).integrity.status).toBe("pass");
  expect(verifyRotationStatement(bytes(rows.filter(row => row.by === "next")), options).valid).toBe(false); // New key's possession never authorizes a scheduled rotation.
  expect(verifyRotationStatement(bytes(), { ...options, trustedCurrentPublicKeyPem: key(previousAlgorithm).publicKeyPem }).valid).toBe(false);
  expect(verifyRotationStatement(bytes(), { ...options, expected: { ...options.expected, workspaceId: "other" } }).valid).toBe(false);
  const p256Index = rows.findIndex((_row, index) => (index === 0 ? previous : next).algorithm === "ecdsa-p256-sha256");
  const derRows = rows.map((row, index) => index === p256Index ? { ...row, signature: signature(message, index === 0 ? previous : next, true) } : row);
  expect(verifyRotationStatement(bytes(derRows), options).valid).toBe(false);
  expect(verifyArtifact(bytes(derRows), admitted([previous], ["artifact-seal"])).integrity.status).toBe("fail");
});

it("root-set rotation accepts two P-256 current authorizers and two new possession signatures while keeping both thresholds", () => {
  const current = [key("ecdsa-p256-sha256"), key("ecdsa-p256-sha256")]; const next = [key("ecdsa-p256-sha256"), key("ecdsa-p256-sha256")];
  const statement = { type: "amc.root-rotation", version: 1, rootSetId: "synthetic-roots", sequence: 1, previousSha256: null,
    previousRoots: current.map(owner => owner.keyId), previousThreshold: 2, newRoots: next.map(owner => owner.keyId), newThreshold: 2,
    newRootPublicKeyPems: next.map(owner => owner.publicKeyPem), allowDecrease: false, issuedAt: "2026-10-05T00:00:00.000Z" };
  const message = tagged("amc.root-rotation/v1", statement);
  const rows = [...current.map(owner => ({ by: "current", keyId: owner.keyId, signature: signature(message, owner) })),
    ...next.map(owner => ({ by: "new", keyId: owner.keyId, signature: signature(message, owner) }))].sort((a, b) => a.by.localeCompare(b.by) || a.keyId.localeCompare(b.keyId));
  const encode = (signatures = rows) => Buffer.from(canonicalize({ statement, signatures }));
  function apply(bytes: Buffer) {
    const amcHome = fresh(); mkdirSync(join(amcHome, "trust"));
    writeFileSync(join(amcHome, "trust", "trust-roots.json"), JSON.stringify({ type: "amc.trust-roots", version: 1,
      roots: current.map(owner => owner.keyId), threshold: 2, rootSetId: statement.rootSetId }));
    return applyTrustRootRotation({ statement: bytes, currentRootPublicKeyPems: current.map(owner => owner.publicKeyPem), amcHome });
  }
  expect(apply(encode())).toMatchObject({ sequence: 1, threshold: 2, roots: statement.newRoots });
  expect(verifyArtifact(encode(), admitted([], [], current, 2)).integrity.status).toBe("pass");
  expect(() => apply(encode(rows.filter(row => row.by === "new")))).toThrow(/needs 2|current/);
  expect(() => apply(encode(rows.filter(row => row.by === "current" || row.keyId === next[0]!.keyId)))).toThrow(/possession/);
  const derRows = rows.map((row, index) => index === 0 ? { ...row, signature: signature(message, current.find(owner => owner.keyId === row.keyId)!, true) } : row);
  expect(() => apply(encode(derRows))).toThrow();
  expect(verifyArtifact(encode(derRows), admitted([], [], current, 2)).integrity.status).toBe("fail");
});
