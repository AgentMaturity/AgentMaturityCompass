import { generateKeyPairSync, sign, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  addRotationSignature, encodeRotationStatement, rotationStatementBytes, rotationStatementSha256, signRotationStatement,
  verifyRotationChain, verifyRotationStatement, type KeyRotationStatementV1, type SignedKeyRotationStatement, type VerifyRotationOptions
} from "../../src/keys/rotationStatement.js";
import { ed25519KeyId } from "../../src/trust/trustList.js";

type Pair = ReturnType<typeof pair>;
const pair = () => {
  const keys = generateKeyPairSync("ed25519");
  const publicPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
  return { publicPem, privatePem: keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(), keyId: ed25519KeyId(publicPem)! };
};
const EXPECTED = { workspaceId: "acme-prod-eu-1", purpose: "artifact-seal" } as const;

function statement(previous: Pair | null, next: Pair, patch: Partial<KeyRotationStatementV1> = {}): KeyRotationStatementV1 {
  return {
    type: "amc.key-rotation", version: 1, ...EXPECTED, sequence: 1,
    previousStatementSha256: null, previousKeyId: previous?.keyId ?? null, nextKeyId: next.keyId, nextPublicKeyPem: next.publicPem,
    reason: "scheduled", overlap: { notBefore: "2026-12-01T00:00:00.000Z", notAfter: "2026-12-15T00:00:00.000Z" },
    issuedAt: "2026-12-01T00:00:00.000Z", ...patch
  };
}
const bytes = (signed: SignedKeyRotationStatement) => encodeRotationStatement(signed);
const firstOf = (current: Pair, extra: Partial<VerifyRotationOptions> = {}): VerifyRotationOptions =>
  ({ expected: EXPECTED, trustedCurrentPublicKeyPem: current.publicPem, previous: null, ...extra });

describe("key rotation statements (P1-08)", () => {
  const k0 = pair();
  const k1 = pair();
  const k2 = pair();
  const root = pair();
  const first = signRotationStatement(statement(k0, k1), { previous: k0.privatePem, next: k1.privatePem });

  it("a scheduled rotation signed by the trusted previous key and the next key is valid", () => {
    expect(verifyRotationStatement(bytes(first), firstOf(k0))).toMatchObject({ valid: true });
  });

  it("without a next signature it is invalid: possession of the new key is not proven", () => {
    const previousOnly = { ...first, signatures: first.signatures.filter(row => row.by === "previous") };
    expect(verifyRotationStatement(Buffer.from(JSON.stringify(previousOnly)), firstOf(k0))).toMatchObject({ valid: false });
    expect(verifyRotationStatement(bytes(previousOnly), firstOf(k0))).toEqual({ valid: false, reason: expect.stringMatching(/possession/) });
  });

  describe("authority comes from the key the verifier trusts, never from the statement (security review)", () => {
    const attacker = pair();

    it("refuses a forged statement signed by the new key only", () => {
      const nextOnly = signRotationStatement(statement(k0, attacker), { next: attacker.privatePem });
      expect(verifyRotationStatement(bytes(nextOnly), firstOf(k0))).toEqual({ valid: false, reason: expect.stringMatching(/not authorized/) });
      // Claiming the purpose had no key yet does not help: the verifier knows k0, and a first key needs a root.
      const firstKeyClaim = signRotationStatement(statement(null, attacker), { next: attacker.privatePem });
      expect(verifyRotationStatement(bytes(firstKeyClaim), firstOf(k0))).toEqual({ valid: false, reason: expect.stringMatching(/previousKeyId/) });
      expect(verifyRotationStatement(bytes(firstKeyClaim), firstOf(k0, { trustedCurrentPublicKeyPem: null }))).toEqual({ valid: false, reason: expect.stringMatching(/root/) });
    });

    it("refuses a statement signed by a key the statement itself names as previous", () => {
      const selfNamed = signRotationStatement(statement(attacker, k1), { previous: attacker.privatePem, next: k1.privatePem });
      expect(verifyRotationStatement(bytes(selfNamed), firstOf(k0))).toEqual({ valid: false, reason: expect.stringMatching(/previousKeyId is not the key this verifier trusts/) });
      expect(verifyRotationStatement(bytes(selfNamed), firstOf(attacker))).toMatchObject({ valid: true }); // only valid for a verifier that trusts the attacker key
    });

    it("refuses cross-purpose and cross-keyset replay", () => {
      expect(verifyRotationStatement(bytes(first), firstOf(k0, { expected: { ...EXPECTED, purpose: "receipt" } })))
        .toEqual({ valid: false, reason: expect.stringMatching(/not acme-prod-eu-1\/receipt/) });
      expect(verifyRotationStatement(bytes(first), firstOf(k0, { expected: { ...EXPECTED, workspaceId: "acme-prod-us-1" } })))
        .toEqual({ valid: false, reason: expect.stringMatching(/not acme-prod-us-1/) });
    });
  });

  describe("one byte encoding per statement (security review)", () => {
    const canonical = bytes(first);
    const text = canonical.toString("utf8");

    it("refuses an added unknown field", () => {
      const extra = JSON.parse(text);
      extra.statement.note = "x";
      expect(verifyRotationStatement(Buffer.from(JSON.stringify(extra)), firstOf(k0))).toMatchObject({ valid: false });
      expect(verifyRotationStatement(Buffer.from(text.replace('{"signatures"', '{"comment":"x","signatures"')), firstOf(k0))).toMatchObject({ valid: false });
    });

    it("refuses reordered keys, duplicated keys, whitespace and re-spelled values", () => {
      const reordered = JSON.stringify({ statement: first.statement, signatures: first.signatures });
      expect(reordered).not.toBe(text);
      for (const variant of [
        reordered,
        text.replace('"reason":"scheduled"', '"reason":"key-compromise","reason":"scheduled"'),
        text.replace('"sequence":1', '"sequence":1.0'),
        text.replace('"reason":"scheduled"', '"reason":"sch\\u0065duled"'),
        `${text}\n`,
        JSON.stringify(JSON.parse(text), null, 2)
      ]) {
        expect(verifyRotationStatement(Buffer.from(variant), firstOf(k0)), variant.slice(0, 60)).toEqual({ valid: false, reason: expect.stringMatching(/canonical/) });
      }
    });

    it("refuses a bit-flipped signature, a non-canonical base64 spelling and a non-canonical S", () => {
      const row = first.signatures.find(item => item.by === "previous")!;
      const raw = Buffer.from(row.signature, "base64");
      const withSignature = (signature: string) => Buffer.from(text.replace(row.signature, signature));
      const flipped = Buffer.from(raw); flipped[5] = flipped[5]! ^ 0x01;
      expect(verifyRotationStatement(withSignature(flipped.toString("base64")), firstOf(k0))).toEqual({ valid: false, reason: expect.stringMatching(/does not verify/) });
      const respelled = `${row.signature.slice(0, 85)}${String.fromCharCode(row.signature.charCodeAt(85) + 1)}==`;
      expect(Buffer.from(respelled, "base64").equals(raw)).toBe(true);
      expect(verifyRotationStatement(withSignature(respelled), firstOf(k0))).toEqual({ valid: false, reason: expect.stringMatching(/canonical base64/) });
      // S + L encodes the same signature value; the verifier must refuse it (strict Ed25519).
      const L = (1n << 252n) + 27742317777372353535851937790883648493n;
      let s = 0n;
      for (let i = 31; i >= 0; i -= 1) s = (s << 8n) | BigInt(raw[32 + i]!);
      const malleable = Buffer.from(raw);
      let t = s + L;
      for (let i = 0; i < 32; i += 1) { malleable[32 + i] = Number(t & 0xffn); t >>= 8n; }
      expect(t).toBe(0n);
      expect(verify(null, rotationStatementBytes(first.statement), k0.publicPem, raw)).toBe(true);
      expect(verify(null, rotationStatementBytes(first.statement), k0.publicPem, malleable)).toBe(false);
      expect(verifyRotationStatement(withSignature(malleable.toString("base64")), firstOf(k0))).toMatchObject({ valid: false });
    });

    it("refuses duplicate or unsorted signature rows and re-spelled times or PEMs", () => {
      const dup = { ...first, signatures: [...first.signatures, first.signatures[0]!] };
      expect(verifyRotationStatement(Buffer.from(JSON.stringify(dup)), firstOf(k0))).toMatchObject({ valid: false });
      expect(() => encodeRotationStatement({ ...first, signatures: [...first.signatures].reverse() })).toThrow(/sorted/);
      expect(() => signRotationStatement(statement(k0, k1, { issuedAt: "2026-12-01T00:00:00Z" }), { previous: k0.privatePem, next: k1.privatePem })).toThrow(/toISOString/);
      expect(() => signRotationStatement(statement(k0, k1, { nextPublicKeyPem: k1.publicPem.replace(/\n/g, "\r\n") }), { previous: k0.privatePem, next: k1.privatePem })).toThrow(/canonical/);
    });

    it("the signed bytes carry the domain tag and every field", () => {
      const signedBytes = rotationStatementBytes(first.statement);
      expect(signedBytes.subarray(0, 20).toString("latin1")).toBe("AMC_KEY_ROTATION_V1\0");
      for (const field of ["previousStatementSha256", "sequence", "issuedAt", "purpose", "workspaceId", "overlap"]) {
        expect(signedBytes.toString("utf8")).toContain(`"${field}"`);
      }
      // A signature over the bare canonical statement (no tag) does not verify.
      const untagged = sign(null, Buffer.from(signedBytes.subarray(20)), k0.privatePem).toString("base64");
      const row = first.signatures.find(item => item.by === "previous")!;
      expect(verifyRotationStatement(Buffer.from(bytes(first).toString("utf8").replace(row.signature, untagged)), firstOf(k0))).toMatchObject({ valid: false });
    });
  });

  it("key-compromise signed only by the previous key is invalid, and valid with a pinned root", () => {
    const compromise = statement(k0, k1, { reason: "key-compromise", overlap: null });
    const byPrevious = signRotationStatement(compromise, { previous: k0.privatePem, next: k1.privatePem });
    const roots = { publicKeyPems: [root.publicPem] };
    expect(verifyRotationStatement(bytes(byPrevious), firstOf(k0, { roots }))).toEqual({ valid: false, reason: expect.stringMatching(/root signature/) });
    const withRoot = addRotationSignature(byPrevious, "root", root.privatePem);
    expect(verifyRotationStatement(bytes(withRoot), firstOf(k0, { roots }))).toMatchObject({ valid: true });
    // A root the verifier did not pin never counts.
    expect(verifyRotationStatement(bytes(withRoot), firstOf(k0))).toMatchObject({ valid: false });
    // A key-compromise statement carries no overlap.
    const overlapping = signRotationStatement({ ...compromise, overlap: first.statement.overlap }, { next: k1.privatePem, roots: [root.privatePem] });
    expect(verifyRotationStatement(bytes(overlapping), firstOf(k0, { roots }))).toMatchObject({ valid: false });
  });

  it("refuses a 31-day overlap", () => {
    const long = signRotationStatement(statement(k0, k1, { overlap: { notBefore: "2026-12-01T00:00:00.000Z", notAfter: "2027-01-01T00:00:00.000Z" } }),
      { previous: k0.privatePem, next: k1.privatePem });
    expect(verifyRotationStatement(bytes(long), firstOf(k0))).toEqual({ valid: false, reason: expect.stringMatching(/maxOverlapDays/) });
  });

  it("refuses a sequence gap and a wrong previousStatementSha256", () => {
    const second = (patch: Partial<KeyRotationStatementV1>): SignedKeyRotationStatement =>
      signRotationStatement(statement(k1, k2, { sequence: 2, previousStatementSha256: rotationStatementSha256(first), ...patch }), { previous: k1.privatePem, next: k2.privatePem });
    const afterFirst = { expected: EXPECTED, trustedCurrentPublicKeyPem: k1.publicPem, previous: first };
    expect(verifyRotationStatement(bytes(second({})), afterFirst)).toMatchObject({ valid: true });
    expect(verifyRotationStatement(bytes(second({ sequence: 3 })), afterFirst)).toEqual({ valid: false, reason: expect.stringMatching(/does not follow/) });
    expect(verifyRotationStatement(bytes(second({ previousStatementSha256: "0".repeat(64) })), afterFirst))
      .toEqual({ valid: false, reason: expect.stringMatching(/previousStatementSha256/) });
    expect(verifyRotationChain([bytes(first), bytes(second({}))], { expected: EXPECTED, initialPublicKeyPem: k0.publicPem })).toMatchObject({ valid: true });
    expect(verifyRotationChain([bytes(first), bytes(second({ sequence: 3 }))], { expected: EXPECTED, initialPublicKeyPem: k0.publicPem })).toMatchObject({ valid: false, index: 1 });
  });

  it("a trust-list-root rotation is authorized by the old and new roots, or by threshold other roots", () => {
    const other1 = pair();
    const other2 = pair();
    const expected = { workspaceId: "trust-roots", purpose: "trust-list-root" } as const;
    const rootRotation = statement(k0, k1, expected);
    const byOthers = signRotationStatement(rootRotation, { next: k1.privatePem, roots: [other1.privatePem] });
    const roots = { publicKeyPems: [other1.publicPem, other2.publicPem], threshold: 2 };
    const opts = { expected, trustedCurrentPublicKeyPem: k0.publicPem, previous: null, roots };
    expect(verifyRotationStatement(bytes(byOthers), opts)).toMatchObject({ valid: false });
    expect(verifyRotationStatement(bytes(addRotationSignature(byOthers, "root", other2.privatePem)), opts)).toMatchObject({ valid: true });
    const byOldAndNew = signRotationStatement(rootRotation, { previous: k0.privatePem, next: k1.privatePem });
    expect(verifyRotationStatement(bytes(byOldAndNew), { ...opts, roots: undefined })).toMatchObject({ valid: true });
  });

  it("refuses a tampered statement and a signature by the wrong key", () => {
    const tampered = Buffer.from(bytes(first).toString("utf8").replace('"reason":"scheduled"', '"reason":"superseded"'));
    expect(verifyRotationStatement(tampered, firstOf(k0))).toEqual({ valid: false, reason: expect.stringMatching(/does not verify/) });
    expect(() => addRotationSignature(first, "previous", k2.privatePem)).toThrow(/previous key/);
    expect(() => addRotationSignature(first, "root", k0.privatePem)).toThrow(/root other than/);
  });
});
