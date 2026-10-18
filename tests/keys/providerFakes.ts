/**
 * In-process fakes for the P2-08 key providers: AWS KMS, Google Cloud KMS, Azure Key Vault and a PKCS#11 token shaped
 * like pkcs11js. Each holds real Node key pairs, records every request, and answers in the provider's own encoding
 * (DER from AWS and Google ECDSA, r||s from Azure and PKCS#11). Nothing touches the network.
 */
import { createCipheriv, createDecipheriv, createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import type { KmsCall } from "../../src/keys/providers/awsKms.js";
import type { GcpKmsCall } from "../../src/keys/providers/gcpKms.js";
import type { AzureKeyVaultCalls } from "../../src/keys/providers/azureKeyVault.js";
import { CK, type Pkcs11Module } from "../../src/keys/providers/pkcs11.js";

export type FakeKind = "ed25519" | "p256";
export interface FakeKey { kind: FakeKind; privateKey: KeyObject; publicKey: KeyObject }

export function fakeKey(kind: FakeKind): FakeKey {
  const pair = kind === "ed25519" ? generateKeyPairSync("ed25519") : generateKeyPairSync("ec", { namedCurve: "P-256" });
  return { kind, privateKey: pair.privateKey, publicKey: pair.publicKey };
}
const spkiDer = (key: FakeKey) => key.publicKey.export({ format: "der", type: "spki" });
export const publicPem = (key: FakeKey) => key.publicKey.export({ format: "pem", type: "spki" }).toString();

// --- ECDSA P-256 over a precomputed digest (Node's sign always hashes), for the providers that sign digests ---
const P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const G: [bigint, bigint] = [0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n, 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n];
const mod = (x: bigint, m: bigint) => ((x % m) + m) % m;
const inv = (x: bigint, m: bigint) => {
  let [a, b, u, v] = [mod(x, m), m, 1n, 0n];
  while (a !== 0n) { const q = b / a; [a, b, u, v] = [b - q * a, a, v - q * u, u]; }
  return mod(v, m);
};
type Point = [bigint, bigint] | null;
const add = (p1: Point, p2: Point): Point => {
  if (p1 === null) return p2;
  if (p2 === null) return p1;
  if (p1[0] === p2[0] && mod(p1[1] + p2[1], P) === 0n) return null;
  const l = p1[0] === p2[0] ? mod((3n * p1[0] * p1[0] - 3n) * inv(2n * p1[1], P), P) : mod((p2[1] - p1[1]) * inv(p2[0] - p1[0], P), P);
  const x = mod(l * l - p1[0] - p2[0], P);
  return [x, mod(l * (p1[0] - x) - p1[1], P)];
};
const multiply = (k: bigint, point: Point): Point => {
  let result: Point = null;
  for (let addend = point; k > 0n; k >>= 1n, addend = add(addend, addend)) if (k & 1n) result = add(result, addend);
  return result;
};
const big = (bytes: Buffer) => BigInt(`0x${bytes.toString("hex") || "0"}`);
const hex32 = (value: bigint) => Buffer.from(value.toString(16).padStart(64, "0"), "hex");

/** r||s over `digest` (no further hashing), as a token or Key Vault signs a digest. */
function ecdsaSignDigest(privateKey: KeyObject, digest: Buffer): Buffer {
  const d = big(Buffer.from(privateKey.export({ format: "jwk" }).d!, "base64url"));
  for (;;) {
    const k = mod(big(randomBytes(40)), N - 1n) + 1n;
    const r = mod(multiply(k, G)![0], N);
    const s = mod(inv(k, N) * (big(digest) + r * d), N);
    if (r !== 0n && s !== 0n) return Buffer.concat([hex32(r), hex32(s)]);
  }
}

// --- a symmetric wrap key held by a fake service ---
function aead(key: Buffer) {
  return {
    seal: (plaintext: Uint8Array) => {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]);
    },
    open: (sealed: Uint8Array) => {
      const bytes = Buffer.from(sealed);
      const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
    }
  };
}

const serviceError = (name: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(`${name}: secret detail https://kms.internal.example/arn:aws:kms:eu-west-1:111122223333 PIN=1234`), { name, ...extra });

export const AWS_ARN = (id: string) => `arn:aws:kms:eu-west-1:111122223333:key/${id}`;

/** AWS KMS: keys by ARN; `origin`, `state` and `fail` steer DescribeKey and errors. */
export function awsFake(signing: Record<string, FakeKey & { origin?: string; state?: string }>, opts: { fail?: string } = {}) {
  const requests: Array<{ operation: string; input: Record<string, unknown>; region: string | undefined }> = [];
  const wrap = aead(randomBytes(32));
  const call: KmsCall = async (operation, input, region) => {
    requests.push({ operation, input, region });
    if (opts.fail) throw serviceError(opts.fail, { $metadata: { httpStatusCode: 400 } });
    const key = signing[String(input.KeyId)];
    switch (operation) {
      case "GetPublicKey":
        if (!key) throw serviceError("NotFoundException");
        return { KeyId: input.KeyId, PublicKey: spkiDer(key), KeyUsage: "SIGN_VERIFY", KeySpec: key.kind === "ed25519" ? "ECC_NIST_EDWARDS25519" : "ECC_NIST_P256",
          SigningAlgorithms: key.kind === "ed25519" ? ["ED25519_SHA_512", "ED25519_PH_SHA_512"] : ["ECDSA_SHA_256"] };
      case "DescribeKey":
        if (!key) throw serviceError("NotFoundException");
        return { KeyMetadata: { KeyId: input.KeyId, KeyState: key.state ?? "Enabled", Origin: key.origin ?? "AWS_KMS" } };
      case "Sign": {
        if (!key) throw serviceError("NotFoundException");
        const message = input.Message as Uint8Array;
        return { Signature: key.kind === "ed25519" ? sign(null, message, key.privateKey) : sign("sha256", message, key.privateKey) };
      }
      case "Encrypt": return { CiphertextBlob: wrap.seal(input.Plaintext as Uint8Array) };
      case "Decrypt":
        try { return { Plaintext: wrap.open(input.CiphertextBlob as Uint8Array) }; } catch { throw serviceError("InvalidCiphertextException"); }
    }
  };
  return { call, requests };
}

export const GCP_KEY = "projects/amc-test/locations/europe-west1/keyRings/amc/cryptoKeys/artifact-seal";

/** Google Cloud KMS: version "1" of GCP_KEY is `key`, with `protectionLevel`. */
export function gcpFake(key: FakeKey, protectionLevel: "HSM" | "SOFTWARE") {
  const requests: Array<{ operation: string; request: Record<string, unknown> }> = [];
  const wrap = aead(randomBytes(32));
  const call: GcpKmsCall = async (operation, request) => {
    requests.push({ operation, request });
    if (operation === "encrypt") return { ciphertext: wrap.seal(request.plaintext as Uint8Array) };
    if (operation === "decrypt") {
      try { return { plaintext: wrap.open(request.ciphertext as Uint8Array) }; } catch { throw Object.assign(new Error("decrypt failed"), { code: 3 }); }
    }
    if (request.name !== `${GCP_KEY}/cryptoKeyVersions/1`) throw Object.assign(new Error("NOT_FOUND"), { code: 5 });
    if (operation === "getPublicKey") return { pem: publicPem(key), algorithm: key.kind === "ed25519" ? "EC_SIGN_ED25519" : "EC_SIGN_P256_SHA256", protectionLevel, name: request.name };
    const digest = (request.digest as { sha256?: Buffer } | undefined)?.sha256;
    if (key.kind === "ed25519") return { signature: sign(null, request.data as Buffer, key.privateKey) };
    const raw = ecdsaSignDigest(key.privateKey, digest!);
    // Cloud KMS answers ECDSA in DER.
    const derInt = (v: Buffer) => { let i = 0; while (i < 31 && v[i] === 0) i++; const b = v.subarray(i); return Buffer.concat([Buffer.from([2, b.length + (b[0]! & 0x80 ? 1 : 0)]), b[0]! & 0x80 ? Buffer.from([0]) : Buffer.alloc(0), b]); };
    const body = Buffer.concat([derInt(raw.subarray(0, 32)), derInt(raw.subarray(32))]);
    return { signature: Buffer.concat([Buffer.from([0x30, body.length]), body]) };
  };
  return { call, requests };
}

export const AZURE_KEY = "https://amc-test.vault.azure.net/keys/artifact-seal";
export const AZURE_WRAP_KEY = "https://amc-test.vault.azure.net/keys/data-key";

/** Azure Key Vault: AZURE_KEY is an EC P-256 key (`kty`), AZURE_WRAP_KEY an RSA key. */
export function azureFake(key: FakeKey, opts: { kty?: "EC" | "EC-HSM"; exportable?: boolean } = {}) {
  const requests: Array<{ operation: string; args: unknown[] }> = [];
  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = key.publicKey.export({ format: "jwk" });
  const calls: AzureKeyVaultCalls = {
    async getKey(vaultUrl, name, version) {
      requests.push({ operation: "getKey", args: [vaultUrl, name, version] });
      if (name === "data-key") return { key: { kty: "RSA" }, properties: { enabled: true } };
      return { key: { kty: opts.kty ?? "EC-HSM", crv: "P-256", x: Buffer.from(jwk.x!, "base64url"), y: Buffer.from(jwk.y!, "base64url") }, properties: { enabled: true, exportable: opts.exportable ?? false } };
    },
    async sign(keyUrl, algorithm, digest) {
      requests.push({ operation: "sign", args: [keyUrl, algorithm, digest] });
      return { result: ecdsaSignDigest(key.privateKey, Buffer.from(digest)) };
    },
    async wrapKey(keyUrl, algorithm, plaintext) {
      requests.push({ operation: "wrapKey", args: [keyUrl, algorithm] });
      const { publicEncrypt, constants } = await import("node:crypto");
      return { result: publicEncrypt({ key: rsa.publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, plaintext) };
    },
    async unwrapKey(keyUrl, algorithm, wrapped) {
      requests.push({ operation: "unwrapKey", args: [keyUrl, algorithm] });
      const { privateDecrypt, constants } = await import("node:crypto");
      return { result: privateDecrypt({ key: rsa.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, wrapped) };
    }
  };
  return { calls, requests };
}

// --- a PKCS#11 token shaped like pkcs11js ---
interface TokenObject { handle: Buffer; attrs: Map<number, unknown>; key?: FakeKey; secret?: Buffer }
const bool = (value: boolean) => Buffer.from([value ? 1 : 0]);
const ulong = (value: number) => { const b = Buffer.alloc(8); b.writeUIntLE(value, 0, 6); return b; };
const pkcs11Error = (code: number) => Object.assign(new Error(`CKR_${code.toString(16)} PIN=1234 /usr/lib/softhsm/libsofthsm2.so`), { code });

export interface FakeTokenKey { label: string; key: FakeKey; extractable?: boolean; sensitive?: boolean; wrapOctetString?: boolean }

/** One token labelled `token` with user PIN `pin`; `mechanisms` defaults to CKM_ECDSA and CKM_EDDSA. */
export function pkcs11Fake(opts: { token: string; pin: string; keys: FakeTokenKey[]; secrets?: string[]; mechanisms?: number[] }) {
  const objects: TokenObject[] = [];
  let next = 1;
  const handle = () => Buffer.from([next++]);
  for (const entry of opts.keys) {
    const p256 = entry.key.kind === "p256";
    const params = p256 ? Buffer.from("06082a8648ce3d030107", "hex") : Buffer.from("06032b6570", "hex");
    const raw = p256 ? entry.key.publicKey.export({ format: "der", type: "spki" }).subarray(-65) : entry.key.publicKey.export({ format: "der", type: "spki" }).subarray(-32);
    const point = entry.wrapOctetString === false ? raw : Buffer.concat([Buffer.from([0x04, raw.length]), raw]);
    const keyType = p256 ? CK.CKK_EC : CK.CKK_EC_EDWARDS;
    objects.push({ handle: handle(), key: entry.key, attrs: new Map<number, unknown>([[CK.CKA_CLASS, CK.CKO_PRIVATE_KEY], [CK.CKA_LABEL, entry.label], [CK.CKA_KEY_TYPE, ulong(keyType)],
      [CK.CKA_EXTRACTABLE, bool(entry.extractable ?? false)], [CK.CKA_SENSITIVE, bool(entry.sensitive ?? true)]]) });
    objects.push({ handle: handle(), attrs: new Map<number, unknown>([[CK.CKA_CLASS, CK.CKO_PUBLIC_KEY], [CK.CKA_LABEL, entry.label], [CK.CKA_KEY_TYPE, ulong(keyType)],
      [CK.CKA_EC_PARAMS, params], [CK.CKA_EC_POINT, point]]) });
  }
  for (const label of opts.secrets ?? []) objects.push({ handle: handle(), secret: randomBytes(32), attrs: new Map<number, unknown>([[CK.CKA_CLASS, CK.CKO_SECRET_KEY], [CK.CKA_LABEL, label]]) });
  const slot = Buffer.from([0xaa]);
  const calls: string[] = [];
  let loggedIn = false;
  let search: TokenObject[] = [];
  let active: { mechanism: number; object: TokenObject; parameter?: { iv: Buffer; aad: Buffer } } | null = null;
  const objectOf = (h: Buffer) => objects.find(o => o.handle.equals(h)) ?? (() => { throw pkcs11Error(0x82); })();
  const requireLogin = () => { if (!loggedIn) throw pkcs11Error(0x101); };
  const module: Pkcs11Module & { gcmParamsType: number } = {
    gcmParamsType: 99,
    C_GetSlotList: () => [slot],
    C_GetTokenInfo: () => ({ label: opts.token.padEnd(32, " ") }),
    C_GetMechanismList: () => opts.mechanisms ?? [CK.CKM_ECDSA, CK.CKM_EDDSA, CK.CKM_AES_GCM],
    C_OpenSession: () => { calls.push("C_OpenSession"); return Buffer.from([0x55]); },
    C_Login: (_session, userType, pin) => { calls.push("C_Login"); if (userType !== CK.CKU_USER || pin !== opts.pin) throw pkcs11Error(0xa0); loggedIn = true; },
    C_FindObjectsInit: (_session, template) => {
      requireLogin();
      search = objects.filter(o => template.every(t => {
        const have = o.attrs.get(t.type);
        return Buffer.isBuffer(have) ? Buffer.isBuffer(t.value) && have.equals(t.value) : have === t.value;
      }));
    },
    C_FindObjects: (_session, max) => search.slice(0, max).map(o => o.handle),
    C_FindObjectsFinal: () => { search = []; },
    C_GetAttributeValue: (_session, h, template) => {
      const object = objectOf(h);
      return template.map(t => {
        // A sensitive attribute of a private key is never readable.
        if (object.key && t.type !== CK.CKA_CLASS && t.type !== CK.CKA_LABEL && t.type !== CK.CKA_KEY_TYPE && t.type !== CK.CKA_EXTRACTABLE && t.type !== CK.CKA_SENSITIVE) throw pkcs11Error(0x11);
        const value = object.attrs.get(t.type);
        return { type: t.type, value: Buffer.isBuffer(value) ? value : typeof value === "string" ? Buffer.from(value) : ulong(Number(value)) };
      });
    },
    C_SignInit: (_session, mechanism, h) => { requireLogin(); calls.push(`C_SignInit:${mechanism.mechanism}`); active = { mechanism: mechanism.mechanism, object: objectOf(h) }; },
    C_Sign: (_session, data) => {
      const { mechanism, object } = active!;
      active = null;
      if (mechanism === CK.CKM_ECDSA && object.key?.kind === "p256" && data.length === 32) return ecdsaSignDigest(object.key.privateKey, data);
      if (mechanism === CK.CKM_EDDSA && object.key?.kind === "ed25519") return sign(null, data, object.key.privateKey);
      throw pkcs11Error(0x63);
    },
    C_EncryptInit: (_session, mechanism, h) => { requireLogin(); active = { mechanism: mechanism.mechanism, object: objectOf(h), parameter: mechanism.parameter as { iv: Buffer; aad: Buffer } }; },
    C_Encrypt: (_session, data) => {
      const { object, parameter } = active!;
      active = null;
      const cipher = createCipheriv("aes-256-gcm", object.secret!, parameter!.iv);
      cipher.setAAD(parameter!.aad);
      return Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);
    },
    C_DecryptInit: (_session, mechanism, h) => { requireLogin(); active = { mechanism: mechanism.mechanism, object: objectOf(h), parameter: mechanism.parameter as { iv: Buffer; aad: Buffer } }; },
    C_Decrypt: (_session, data) => {
      const { object, parameter } = active!;
      active = null;
      const decipher = createDecipheriv("aes-256-gcm", object.secret!, parameter!.iv);
      decipher.setAAD(parameter!.aad);
      decipher.setAuthTag(data.subarray(data.length - 16));
      try { return Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]); } catch { throw pkcs11Error(0x40); }
    },
    C_CloseSession: () => { calls.push("C_CloseSession"); }
  };
  return { module, calls };
}
