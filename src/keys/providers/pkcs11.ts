/**
 * PKCS#11 (P2-08) through an optional wrapper and its pkcs11js peer, loaded only when a token is opened. The ref
 * id is a PKCS#11 URI naming the token and key labels (`pkcs11:token=amc;object=artifact-seal`, RFC 7512). The library
 * path comes from AMC_PKCS11_MODULE and the user PIN from AMC_PKCS11_PIN or AMC_PKCS11_PIN_FILE: never from workspace
 * config, so a workspace writer can neither load a library nor read a PIN. P-256 keys sign with CKM_ECDSA over a SHA-256
 * digest; Ed25519 keys with CKM_EDDSA (PKCS#11 3.0) only when the token lists it. A private key must be
 * CKA_EXTRACTABLE false and CKA_SENSITIVE true. Protection cannot be read from a token, so it is what the operator
 * states in AMC_PKCS11_PROTECTION (hsm or software), else "unknown", with basis "configured". Data keys wrap with
 * CKM_AES_GCM under a secret key of the named label.
 */
import { createHash, createPublicKey, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { signingKeyId, type SigningAlgorithm } from "../algorithmPolicy.js";
import { KeyProviderError, memoizedDescribe, type KeyProvider, type KeyRef } from "../provider.js";

type Handle = Buffer;
type Attribute = { type: number; value?: unknown };
/** The part of pkcs11js's PKCS11 class AMC calls (pkcs11js 2.x). */
export interface Pkcs11Module {
  C_GetSlotList(tokenPresent: boolean): Handle[];
  C_GetTokenInfo(slot: Handle): { label: string };
  C_GetMechanismList(slot: Handle): number[];
  C_OpenSession(slot: Handle, flags: number): Handle;
  C_Login(session: Handle, userType: number, pin: string): void;
  C_FindObjectsInit(session: Handle, template: Attribute[]): void;
  C_FindObjects(session: Handle, maxObjectCount: number): Handle[] | Handle | null;
  C_FindObjectsFinal(session: Handle): void;
  C_GetAttributeValue(session: Handle, object: Handle, template: Attribute[]): Array<{ type: number; value?: Buffer }>;
  C_SignInit(session: Handle, mechanism: { mechanism: number }, key: Handle): void;
  C_Sign(session: Handle, data: Buffer, out: Buffer): Buffer;
  C_EncryptInit(session: Handle, mechanism: { mechanism: number; parameter: unknown }, key: Handle): void;
  C_Encrypt(session: Handle, data: Buffer, out: Buffer): Buffer;
  C_DecryptInit(session: Handle, mechanism: { mechanism: number; parameter: unknown }, key: Handle): void;
  C_Decrypt(session: Handle, data: Buffer, out: Buffer): Buffer;
  C_CloseSession(session: Handle): void;
}

// PKCS#11 v3.0 header values (pkcs11t.h).
export const CK = {
  CKA_CLASS: 0x0, CKA_LABEL: 0x3, CKA_KEY_TYPE: 0x100, CKA_SENSITIVE: 0x103, CKA_EXTRACTABLE: 0x162, CKA_EC_PARAMS: 0x180, CKA_EC_POINT: 0x181,
  CKO_PUBLIC_KEY: 2, CKO_PRIVATE_KEY: 3, CKO_SECRET_KEY: 4, CKK_EC: 0x3, CKK_EC_EDWARDS: 0x40,
  CKM_ECDSA: 0x1041, CKM_EDDSA: 0x1057, CKM_AES_GCM: 0x1087, CKU_USER: 1, CKF_RW_SESSION: 0x2, CKF_SERIAL_SESSION: 0x4
} as const;
const CKR_USER_ALREADY_LOGGED_IN = 0x100;
const CKR_CRYPTOKI_ALREADY_INITIALIZED = 0x191;
const P256_PARAMS = Buffer.from("06082a8648ce3d030107", "hex");
const ED25519_PARAMS = [Buffer.from("06032b6570", "hex"), Buffer.from("130c656477617264733235353139", "hex")];
const P256_SPKI = Buffer.from("3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex");
const ED25519_SPKI = Buffer.from("302a300506032b6570032100", "hex");

function failure(code: "KEY_PROVIDER_UNAVAILABLE" | "KEY_PROVIDER_AUTH_FAILED" | "KEY_PROVIDER_KEY_REFUSED" | "KEY_PROVIDER_NOT_INSTALLED", detail: string): KeyProviderError {
  return new KeyProviderError(code, "pkcs11", detail);
}

/** A CKR_ return value as a code; the library's message is never copied. */
function mapped(error: unknown, action: string): KeyProviderError {
  if (error instanceof KeyProviderError) return error;
  const rv = typeof (error as { code?: unknown })?.code === "number" ? (error as { code: number }).code : -1;
  if ((rv >= 0xa0 && rv <= 0xa4) || rv === 0x101 || rv === 0x102) return failure("KEY_PROVIDER_AUTH_FAILED", `${action}: the token refused the PIN or login`);
  if (rv === 0x60 || rv === 0x63 || rv === 0x68 || rv === 0x70 || rv === 0x82 || rv === 0x11) return failure("KEY_PROVIDER_KEY_REFUSED", `${action}: the token refused the key or mechanism`);
  return failure("KEY_PROVIDER_UNAVAILABLE", `${action}: the token could not be reached or answered with an error`);
}

/** `pkcs11:token=<label>;object=<label>`, percent-decoded. */
function parsedUri(ref: KeyRef): { token: string; object: string } {
  const match = /^pkcs11:([^?]*)$/.exec(ref.id);
  const fields = new Map((match?.[1] ?? "").split(";").map(part => part.split("=", 2) as [string, string | undefined]));
  const decode = (value: string | undefined) => { try { return value ? decodeURIComponent(value) : ""; } catch { return ""; } };
  const token = decode(fields.get("token"));
  const object = decode(fields.get("object"));
  if (match === null || !token || !object || [...fields.keys()].some(key => key !== "token" && key !== "object") || ref.version !== undefined) {
    throw failure("KEY_PROVIDER_KEY_REFUSED", "keys ref id must be a PKCS#11 URI with exactly token= and object= (no version)");
  }
  return { token, object };
}

function loadModule(env: NodeJS.ProcessEnv): Pkcs11Module & { gcmParamsType: number } {
  const path = env.AMC_PKCS11_MODULE;
  if (!path) throw failure("KEY_PROVIDER_NOT_INSTALLED", "set AMC_PKCS11_MODULE to the PKCS#11 library path");
  let pkcs11js: { PKCS11: new () => Pkcs11Module & { load(path: string): void; C_Initialize(): void }; CK_PARAMS_AES_GCM?: number };
  try {
    const optional = createRequire(import.meta.url)("agent-maturity-compass-key-provider-pkcs11") as { loadPkcs11: () => typeof pkcs11js };
    pkcs11js = optional.loadPkcs11();
  } catch {
    throw failure("KEY_PROVIDER_NOT_INSTALLED", "install agent-maturity-compass-key-provider-pkcs11 and pkcs11js@2.1.7 to use keys provider pkcs11");
  }
  const module = new pkcs11js.PKCS11();
  try {
    module.load(path);
    module.C_Initialize();
  } catch (error) {
    // Another provider instance in this process initialized the same library already.
    if ((error as { code?: unknown })?.code !== CKR_CRYPTOKI_ALREADY_INITIALIZED) throw mapped(error, "initialize");
  }
  return Object.assign(module, { gcmParamsType: pkcs11js.CK_PARAMS_AES_GCM ?? 0 });
}

function pinOf(env: NodeJS.ProcessEnv): string {
  if (env.AMC_PKCS11_PIN) return env.AMC_PKCS11_PIN;
  if (env.AMC_PKCS11_PIN_FILE) {
    try { return readFileSync(env.AMC_PKCS11_PIN_FILE, "utf8").trim(); } catch { /* reported below */ }
  }
  throw failure("KEY_PROVIDER_AUTH_FAILED", "set AMC_PKCS11_PIN or AMC_PKCS11_PIN_FILE (the PIN is never read from config)");
}

/** The EC point from CKA_EC_POINT, with or without its DER OCTET STRING wrapper. */
function ecPoint(value: Buffer, size: number): Buffer {
  if (value.length === size + 2 && value[0] === 0x04 && value[1] === size) return value.subarray(2);
  if (value.length === size) return value;
  throw failure("KEY_PROVIDER_KEY_REFUSED", "the public key's CKA_EC_POINT has an unexpected size");
}

/**
 * `deps.module` replaces pkcs11js (tests inject an in-process fake); `deps.env` defaults to process.env. One session per
 * provider, logged in once; any error drops it so the next call opens a new one.
 */
export function pkcs11Provider(deps: { module?: Pkcs11Module & { gcmParamsType?: number }; env?: NodeJS.ProcessEnv } = {}): KeyProvider {
  const env = deps.env ?? process.env;
  let module: (Pkcs11Module & { gcmParamsType?: number }) | null = deps.module ?? null;
  let open: { token: string; slot: Handle; session: Handle } | null = null;

  const session = (token: string): { slot: Handle; session: Handle; pkcs11: Pkcs11Module & { gcmParamsType?: number } } => {
    const pkcs11 = (module ??= loadModule(env));
    if (open?.token === token) return { ...open, pkcs11 };
    if (open !== null) {
      pkcs11.C_CloseSession(open.session);
      open = null;
    }
    const slot = pkcs11.C_GetSlotList(true).find(candidate => pkcs11.C_GetTokenInfo(candidate).label.trim() === token);
    if (slot === undefined) throw failure("KEY_PROVIDER_UNAVAILABLE", "no present token has the configured label");
    const handle = pkcs11.C_OpenSession(slot, CK.CKF_SERIAL_SESSION | CK.CKF_RW_SESSION);
    try {
      pkcs11.C_Login(handle, CK.CKU_USER, pinOf(env));
    } catch (error) {
      if ((error as { code?: unknown })?.code !== CKR_USER_ALREADY_LOGGED_IN) {
        try { pkcs11.C_CloseSession(handle); } catch { /* the login failure is reported */ }
        throw error;
      }
    }
    open = { token, slot, session: handle };
    return { ...open, pkcs11 };
  };
  const run = <T>(ref: KeyRef, action: string, call: (s: ReturnType<typeof session>, uri: { token: string; object: string }) => T): T => {
    const uri = parsedUri(ref);
    try {
      return call(session(uri.token), uri);
    } catch (error) {
      if (open !== null) { try { module?.C_CloseSession(open.session); } catch { /* the original error is reported */ } }
      open = null;
      throw mapped(error, action);
    }
  };
  const find = (s: ReturnType<typeof session>, label: string, objectClass: number): Handle => {
    s.pkcs11.C_FindObjectsInit(s.session, [{ type: CK.CKA_CLASS, value: objectClass }, { type: CK.CKA_LABEL, value: label }]);
    let found: Handle[];
    try {
      const result = s.pkcs11.C_FindObjects(s.session, 2);
      found = Array.isArray(result) ? result : result ? [result] : [];
    } finally {
      s.pkcs11.C_FindObjectsFinal(s.session);
    }
    if (found.length !== 1) throw failure("KEY_PROVIDER_KEY_REFUSED", `the token holds ${found.length === 0 ? "no" : "more than one"} object of that label and class`);
    return found[0]!;
  };
  const attributes = (s: ReturnType<typeof session>, object: Handle, types: number[]): Map<number, Buffer> =>
    new Map(s.pkcs11.C_GetAttributeValue(s.session, object, types.map(type => ({ type }))).map(row => [row.type, row.value ?? Buffer.alloc(0)]));
  const assertNonExportable = (values: Map<number, Buffer>) => {
    const extractable = values.get(CK.CKA_EXTRACTABLE);
    const sensitive = values.get(CK.CKA_SENSITIVE);
    if (extractable?.length !== 1 || extractable[0] !== 0 || sensitive?.length !== 1 || sensitive[0] !== 1) {
      throw failure("KEY_PROVIDER_KEY_REFUSED", "the private or secret key must report CKA_EXTRACTABLE CK_FALSE and CKA_SENSITIVE CK_TRUE");
    }
  };

  const describe = memoizedDescribe(async ref => run(ref, "describe", (s, uri) => {
    const privateKey = find(s, uri.object, CK.CKO_PRIVATE_KEY);
    const secret = attributes(s, privateKey, [CK.CKA_EXTRACTABLE, CK.CKA_SENSITIVE, CK.CKA_KEY_TYPE]);
    assertNonExportable(secret);
    const publicKey = attributes(s, find(s, uri.object, CK.CKO_PUBLIC_KEY), [CK.CKA_EC_PARAMS, CK.CKA_EC_POINT]);
    const params = publicKey.get(CK.CKA_EC_PARAMS) ?? Buffer.alloc(0);
    const point = publicKey.get(CK.CKA_EC_POINT) ?? Buffer.alloc(0);
    const typeBytes = secret.get(CK.CKA_KEY_TYPE);
    const keyType = typeBytes?.length ? typeBytes.readUIntLE(0, Math.min(6, typeBytes.length)) : -1;
    let algorithm: SigningAlgorithm;
    let spki: Buffer;
    if (keyType === CK.CKK_EC && params.equals(P256_PARAMS)) {
      [algorithm, spki] = ["ecdsa-p256-sha256", Buffer.concat([P256_SPKI, ecPoint(point, 65)])];
    } else if (keyType === CK.CKK_EC_EDWARDS && ED25519_PARAMS.some(known => known.equals(params))) {
      [algorithm, spki] = ["ed25519", Buffer.concat([ED25519_SPKI, ecPoint(point, 32)])];
    } else {
      throw failure("KEY_PROVIDER_KEY_REFUSED", "the key is not an EC P-256 or Ed25519 key");
    }
    const mechanism = algorithm === "ed25519" ? CK.CKM_EDDSA : CK.CKM_ECDSA;
    if (!s.pkcs11.C_GetMechanismList(s.slot).includes(mechanism)) throw failure("KEY_PROVIDER_KEY_REFUSED", "the token does not list the signing mechanism for this key");
    const publicKeyPem = createPublicKey({ key: spki, format: "der", type: "spki" }).export({ format: "pem", type: "spki" }).toString();
    const stated = env.AMC_PKCS11_PROTECTION;
    return {
      ref, algorithm, publicKeyPem, keyId: signingKeyId(publicKeyPem) ?? "",
      protection: stated === "hsm" || stated === "software" ? stated : "unknown", protectionBasis: "configured", exportable: false
    };
  }));
  const gcm = (s: ReturnType<typeof session>, iv: Buffer, uri: { token: string; object: string }) => ({
    mechanism: CK.CKM_AES_GCM, parameter: { type: s.pkcs11.gcmParamsType ?? 0, iv, aad: Buffer.from(`${uri.token}/${uri.object}`, "utf8"), ivBits: 96, tagBits: 128 }
  });
  return {
    id: "pkcs11",
    describe,
    async sign(ref, message) {
      const { algorithm } = await describe(ref);
      return run(ref, "sign", (s, uri) => {
        const key = find(s, uri.object, CK.CKO_PRIVATE_KEY);
        assertNonExportable(attributes(s, key, [CK.CKA_EXTRACTABLE, CK.CKA_SENSITIVE]));
        const ecdsa = algorithm === "ecdsa-p256-sha256";
        s.pkcs11.C_SignInit(s.session, { mechanism: ecdsa ? CK.CKM_ECDSA : CK.CKM_EDDSA }, key);
        return Buffer.from(s.pkcs11.C_Sign(s.session, ecdsa ? createHash("sha256").update(message).digest() : Buffer.from(message), Buffer.alloc(64)));
      });
    },
    async wrapKey(ref, plaintextKey) {
      return run(ref, "wrapKey", (s, uri) => {
        const key = find(s, uri.object, CK.CKO_SECRET_KEY);
        assertNonExportable(attributes(s, key, [CK.CKA_EXTRACTABLE, CK.CKA_SENSITIVE]));
        const iv = randomBytes(12);
        s.pkcs11.C_EncryptInit(s.session, gcm(s, iv, uri), key);
        return Buffer.concat([iv, Buffer.from(s.pkcs11.C_Encrypt(s.session, Buffer.from(plaintextKey), Buffer.alloc(plaintextKey.length + 16)))]);
      });
    },
    async unwrapKey(ref, wrapped) {
      return run(ref, "unwrapKey", (s, uri) => {
        const bytes = Buffer.from(wrapped);
        if (bytes.length < 28) throw failure("KEY_PROVIDER_KEY_REFUSED", "not a PKCS#11 wrapped key");
        const key = find(s, uri.object, CK.CKO_SECRET_KEY);
        assertNonExportable(attributes(s, key, [CK.CKA_EXTRACTABLE, CK.CKA_SENSITIVE]));
        s.pkcs11.C_DecryptInit(s.session, gcm(s, bytes.subarray(0, 12), uri), key);
        return Buffer.from(s.pkcs11.C_Decrypt(s.session, bytes.subarray(12), Buffer.alloc(bytes.length)));
      });
    }
  };
}
