import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { addRotationSignature, encodeRotationStatement, signRotationStatement, type KeyRotationStatementV1 } from "../../src/keys/rotationStatement.js";
import { applyTrustRootRotation, loadTrustContext, signTrustList } from "../../src/trust/index.js";
import { listEntry, testKey, trustList, type TestKey } from "./trustFixtures.js";

const NOW = new Date("2026-10-06T00:00:00.000Z");
const homes: string[] = [];
afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }); });

function home(roots: TestKey[], threshold = 1): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-root-rotation-"));
  homes.push(dir);
  mkdirSync(join(dir, "trust"), { recursive: true });
  writeFileSync(join(dir, "trust", "trust-roots.json"), JSON.stringify({ type: "amc.trust-roots", version: 1, roots: roots.map(root => root.keyId), threshold }));
  return dir;
}
const statement = (from: TestKey, to: TestKey): KeyRotationStatementV1 => ({
  type: "amc.key-rotation", version: 1, workspaceId: "trust-roots", purpose: "trust-list-root", sequence: 1, previousStatementSha256: null,
  previousKeyId: from.keyId, nextKeyId: to.keyId, nextPublicKeyPem: to.publicKeyPem, reason: "scheduled", overlap: null, issuedAt: "2026-10-05T00:00:00.000Z"
});
const pems = (...keys: TestKey[]) => keys.map(key => key.publicKeyPem);

describe("trust-list root rotation (P1-08)", () => {
  it("the old and new roots together rotate a root; the new root then signs lists and the old one no longer counts", () => {
    const [a, b, aNext] = [testKey(), testKey(), testKey()];
    const amcHome = home([a, b]);
    const bytes = encodeRotationStatement(signRotationStatement(statement(a, aNext), { previous: a.privateKeyPem, next: aNext.privateKeyPem }));
    expect(applyTrustRootRotation({ statement: bytes, rootPublicKeyPems: pems(a, b), amcHome })).toMatchObject({ replaced: a.keyId, added: aNext.keyId });
    const listFile = join(amcHome, "trust", "amc-trust-list.json");
    writeFileSync(listFile, JSON.stringify(signTrustList(trustList([listEntry(testKey())]), aNext.privateKeyPem)));
    expect(loadTrustContext({ amcHome, now: NOW }).lists).toHaveLength(1);
    writeFileSync(listFile, JSON.stringify(signTrustList(trustList([listEntry(testKey())], { sequence: 2 }), a.privateKeyPem)));
    expect(() => loadTrustContext({ amcHome, now: NOW })).toThrow(/TRUST_LIST_SIGNATURE_INVALID/);
    // Replaying the applied statement fails: the key it replaces is no longer pinned.
    expect(() => applyTrustRootRotation({ statement: bytes, rootPublicKeyPems: pems(a, b, aNext), amcHome })).toThrow(/not pinned/);
  });

  it("threshold other roots can rotate a lost root; fewer cannot, and the new key alone never can", () => {
    const [a, b, c, aNext] = [testKey(), testKey(), testKey(), testKey()];
    const amcHome = home([a, b, c], 2);
    const byB = signRotationStatement(statement(a, aNext), { next: aNext.privateKeyPem, roots: [b.privateKeyPem] });
    expect(() => applyTrustRootRotation({ statement: encodeRotationStatement(byB), rootPublicKeyPems: pems(a, b, c), amcHome })).toThrow(/root rotation refused/);
    const byNextOnly = signRotationStatement(statement(a, aNext), { next: aNext.privateKeyPem });
    expect(() => applyTrustRootRotation({ statement: encodeRotationStatement(byNextOnly), rootPublicKeyPems: pems(a, b, c), amcHome })).toThrow(/root rotation refused/);
    const byBC = addRotationSignature(byB, "root", c.privateKeyPem);
    expect(applyTrustRootRotation({ statement: encodeRotationStatement(byBC), rootPublicKeyPems: pems(a, b, c), amcHome }).roots).toEqual([aNext.keyId, b.keyId, c.keyId]);
    expect(JSON.parse(readFileSync(join(amcHome, "trust", "trust-roots.json"), "utf8")).threshold).toBe(2);
  });

  it("an older list signed by roots that survive the rotation stays refused after it", () => {
    const [a, b, c, aNext] = [testKey(), testKey(), testKey(), testKey()];
    const amcHome = home([a, b, c], 2);
    const listFile = join(amcHome, "trust", "amc-trust-list.json");
    const signedBy = (sequence: number, ...keys: TestKey[]) => {
      const list = trustList([listEntry(testKey())], { sequence });
      return { list, signatures: keys.flatMap(key => signTrustList(list, key.privateKeyPem).signatures) };
    };
    const older = signedBy(4, b, c);
    writeFileSync(listFile, JSON.stringify(signedBy(5, b, c)));
    expect(loadTrustContext({ amcHome, now: NOW }).lists[0]?.sequence).toBe(5);
    applyTrustRootRotation({ statement: encodeRotationStatement(signRotationStatement(statement(a, aNext), { previous: a.privateKeyPem, next: aNext.privateKeyPem })), rootPublicKeyPems: pems(a, b, c), amcHome });
    writeFileSync(listFile, JSON.stringify(older));
    expect(() => loadTrustContext({ amcHome, now: NOW })).toThrow(/ROLLBACK_DETECTED/);
  });
});
