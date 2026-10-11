import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  addRotationSignature, rotationStatementSha256, signRotationStatement, verifyRotationChain, verifyRotationStatement,
  type KeyRotationStatementV1, type SignedKeyRotationStatement
} from "../../src/keys/rotationStatement.js";
import { ed25519KeyId } from "../../src/trust/trustList.js";

const pair = () => {
  const keys = generateKeyPairSync("ed25519");
  const publicPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
  return { publicPem, privatePem: keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(), keyId: ed25519KeyId(publicPem)! };
};

function statement(previous: ReturnType<typeof pair>, next: ReturnType<typeof pair>, patch: Partial<KeyRotationStatementV1> = {}): KeyRotationStatementV1 {
  return {
    type: "amc.key-rotation", version: 1, workspaceId: "acme-prod-eu-1", purpose: "artifact-seal", sequence: 1,
    previousStatementSha256: null, previousKeyId: previous.keyId, nextKeyId: next.keyId, nextPublicKeyPem: next.publicPem,
    reason: "scheduled", overlap: { notBefore: "2026-12-01T00:00:00.000Z", notAfter: "2026-12-15T00:00:00.000Z" },
    issuedAt: "2026-12-01T00:00:00.000Z", ...patch
  };
}

describe("key rotation statements (P1-08)", () => {
  const k0 = pair();
  const k1 = pair();
  const k2 = pair();
  const root = pair();
  const first = signRotationStatement(statement(k0, k1), { previous: k0.privatePem, next: k1.privatePem });

  it("a scheduled rotation signed by the previous and next keys is valid", () => {
    expect(verifyRotationStatement(first, { previous: null, previousPublicKeyPem: k0.publicPem })).toMatchObject({ valid: true });
  });

  it("without a next signature it is invalid: possession of the new key is not proven", () => {
    const previousOnly = { ...first, signatures: first.signatures.filter(row => row.by === "previous") };
    expect(verifyRotationStatement(previousOnly, { previous: null, previousPublicKeyPem: k0.publicPem }))
      .toEqual({ valid: false, reason: expect.stringMatching(/possession/) });
  });

  it("without a previous signature a scheduled rotation is not authorized", () => {
    const nextOnly = signRotationStatement(statement(k0, k1), { next: k1.privatePem });
    expect(verifyRotationStatement(nextOnly, { previous: null, previousPublicKeyPem: k0.publicPem })).toMatchObject({ valid: false });
  });

  it("key-compromise signed only by the previous key is invalid, and valid with a pinned root", () => {
    const compromise = statement(k0, k1, { reason: "key-compromise", overlap: null });
    const byPrevious = signRotationStatement(compromise, { previous: k0.privatePem, next: k1.privatePem });
    expect(verifyRotationStatement(byPrevious, { previous: null, previousPublicKeyPem: k0.publicPem, roots: { publicKeyPems: [root.publicPem] } }))
      .toEqual({ valid: false, reason: expect.stringMatching(/root signature/) });
    const withRoot = addRotationSignature(byPrevious, "root", root.privatePem);
    expect(verifyRotationStatement(withRoot, { previous: null, previousPublicKeyPem: k0.publicPem, roots: { publicKeyPems: [root.publicPem] } }))
      .toMatchObject({ valid: true });
    // A root the verifier did not pin never counts.
    expect(verifyRotationStatement(withRoot, { previous: null, previousPublicKeyPem: k0.publicPem })).toMatchObject({ valid: false });
    // A key-compromise statement carries no overlap.
    const overlapping = signRotationStatement({ ...compromise, overlap: first.statement.overlap }, { next: k1.privatePem, roots: [root.privatePem] });
    expect(verifyRotationStatement(overlapping, { previous: null, roots: { publicKeyPems: [root.publicPem] } })).toMatchObject({ valid: false });
  });

  it("refuses a 31-day overlap", () => {
    const long = signRotationStatement(statement(k0, k1, { overlap: { notBefore: "2026-12-01T00:00:00.000Z", notAfter: "2027-01-01T00:00:00.000Z" } }),
      { previous: k0.privatePem, next: k1.privatePem });
    expect(verifyRotationStatement(long, { previous: null, previousPublicKeyPem: k0.publicPem }))
      .toEqual({ valid: false, reason: expect.stringMatching(/maxOverlapDays/) });
  });

  it("refuses a sequence gap and a wrong previousStatementSha256", () => {
    const second = (patch: Partial<KeyRotationStatementV1>): SignedKeyRotationStatement =>
      signRotationStatement(statement(k1, k2, { sequence: 2, previousStatementSha256: rotationStatementSha256(first), ...patch }), { previous: k1.privatePem, next: k2.privatePem });
    expect(verifyRotationStatement(second({}), { previous: first })).toMatchObject({ valid: true });
    expect(verifyRotationStatement(second({ sequence: 3 }), { previous: first })).toEqual({ valid: false, reason: expect.stringMatching(/does not follow/) });
    expect(verifyRotationStatement(second({ previousStatementSha256: "0".repeat(64) }), { previous: first }))
      .toEqual({ valid: false, reason: expect.stringMatching(/previousStatementSha256/) });
    expect(verifyRotationChain([first, second({})], { initialPublicKeyPem: k0.publicPem })).toMatchObject({ valid: true });
    expect(verifyRotationChain([first, second({ sequence: 3 })], { initialPublicKeyPem: k0.publicPem })).toMatchObject({ valid: false, index: 1 });
  });

  it("a trust-list-root rotation is authorized by the old and new roots, or by threshold other roots", () => {
    const other1 = pair();
    const other2 = pair();
    const rootRotation = statement(k0, k1, { purpose: "trust-list-root", workspaceId: "trust-roots" });
    const byOthers = signRotationStatement(rootRotation, { next: k1.privatePem, roots: [other1.privatePem] });
    const roots = { publicKeyPems: [other1.publicPem, other2.publicPem], threshold: 2 };
    expect(verifyRotationStatement(byOthers, { previous: null, roots })).toMatchObject({ valid: false });
    expect(verifyRotationStatement(addRotationSignature(byOthers, "root", other2.privatePem), { previous: null, roots })).toMatchObject({ valid: true });
    const byOldAndNew = signRotationStatement(rootRotation, { previous: k0.privatePem, next: k1.privatePem });
    expect(verifyRotationStatement(byOldAndNew, { previous: null, previousPublicKeyPem: k0.publicPem })).toMatchObject({ valid: true });
  });

  it("refuses a tampered statement and a signature by the wrong key", () => {
    const tampered = { ...first, statement: { ...first.statement, reason: "superseded" } };
    expect(verifyRotationStatement(tampered, { previous: null, previousPublicKeyPem: k0.publicPem })).toMatchObject({ valid: false });
    expect(() => addRotationSignature(first, "previous", k2.privatePem)).toThrow(/previous key/);
    expect(() => addRotationSignature(first, "root", k0.privatePem)).toThrow(/root other than/);
  });
});
