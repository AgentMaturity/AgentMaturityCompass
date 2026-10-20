/** Proposed tests/keys/sessionCredentialSignerIdentity.test.ts. Real public APIs; E-only, not executed. */
import { createECDH, createPublicKey, randomUUID, sign, verify } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { addPublicKeyToHistory } from "../../src/crypto/keys.js";
import { getPurposeKeyHistory } from "../../src/keys/signingKeys.js";
import { revokeKey } from "../../src/keys/purposeKeys.js";
import { lowS, signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { verifySessionToken } from "../../src/auth/sessionTokens.js";
import { verifyPairingToken } from "../../src/pairing/pairingCodes.js";
import { initWorkspace } from "../../src/workspace.js";
import { lockVault } from "../../src/vault/vault.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { fakeKey, publicPem } from "./providerFakes.js";

const roots: string[] = [];
const PASS = "credential-signer-identity-passphrase";
afterEach(() => { for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); } vi.unstubAllEnvs(); });
const ORDER = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
const mod = (value: bigint) => (value % ORDER + ORDER) % ORDER;
function inverse(value: bigint): bigint {
  let a = mod(value), b = ORDER, x = 1n, y = 0n;
  while (b !== 0n) { const quotient = a / b; [a, b] = [b, a - quotient * b]; [x, y] = [y, x - quotient * y]; }
  if (a !== 1n) throw new Error("test scalar has no inverse");
  return mod(x);
}

/** Reuses the existing catalog ambiguity construction; Node independently proves both verifications. */
function ambiguousToken(payload: Record<string, unknown>, primary: ReturnType<typeof fakeKey>) {
  const bytes = Buffer.from(JSON.stringify(payload));
  const signature = lowS(sign("sha256", bytes, { key: primary.privateKey, dsaEncoding: "ieee-p1363" }));
  const jwk = primary.privateKey.export({ format: "jwk" });
  if (!jwk.d) throw new Error("owned fixture scalar missing");
  const d = BigInt(`0x${Buffer.from(jwk.d, "base64url").toString("hex")}`);
  const r = BigInt(`0x${signature.subarray(0, 32).toString("hex")}`), z = BigInt(`0x${sha256Hex(bytes)}`);
  const alternateScalar = mod(-d - 2n * z * inverse(r));
  expect(alternateScalar).toBeGreaterThan(0n);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(Buffer.from(alternateScalar.toString(16).padStart(64, "0"), "hex"));
  const alternatePem = createPublicKey({ key: Buffer.concat([Buffer.from("3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex"), ecdh.getPublicKey()]),
    format: "der", type: "spki" }).export({ format: "pem", type: "spki" }).toString();
  expect(signingKeyId(alternatePem)).not.toBe(signingKeyId(publicPem(primary)));
  for (const pem of [publicPem(primary), alternatePem]) {
    expect(verify("sha256", bytes, { key: pem, dsaEncoding: "ieee-p1363" }, signature)).toBe(true);
  }
  return { token: `${bytes.toString("base64url")}.${signature.toString("base64url")}`, alternatePem };
}

test("a revoked P-256 credential cannot move to another admitted key that verifies the identical signature", () => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS);
  const root = mkdtempSync(join(tmpdir(), "amc-credential-signer-identity-")); roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  const primary = fakeKey("p256"), primaryPem = publicPem(primary), now = Date.now();
  const session = ambiguousToken({ v: 1, userId: "owned-user", username: "owned", roles: ["VIEWER"], issuedTs: now,
    expiresTs: now + 60_000, nonce: randomUUID().replace(/-/g, "") }, primary);
  const paired = ambiguousToken({ v: 1, pairingId: "pair_owned", issuedTs: now, expiresTs: now + 60_000,
    nonce: randomUUID().replace(/-/g, "") }, primary);
  // Real owner-authorized exact session history; no manual history, keyset or revocation bytes.
  // The existing import API admits a reviewed public key without requiring a provider PoP or that private key.
  for (const pem of [primaryPem, session.alternatePem, paired.alternatePem]) {
    addPublicKeyToHistory(root, "session", pem, "imported");
  }
  expect(getPurposeKeyHistory(root, "session")).toEqual(expect.arrayContaining([primaryPem, session.alternatePem, paired.alternatePem]));
  const accepted = () => [verifySessionToken({ workspace: root, token: session.token }).ok,
    verifyPairingToken({ workspace: root, token: paired.token }).ok];
  expect(accepted()).toEqual([true, true]);
  // The signed, sequenced owner revocation names the primary key. Both alternative keys remain unrevoked.
  revokeKey(root, "session", signingKeyId(primaryPem)!, "key-compromise", PASS);
  expect(getPurposeKeyHistory(root, "session")).toEqual(expect.arrayContaining([primaryPem, session.alternatePem, paired.alternatePem]));
  expect(accepted()).toEqual([false, false]);
});
