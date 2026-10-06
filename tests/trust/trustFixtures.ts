import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { canonicalize } from "../../src/utils/json.js";
import type { DistrustEntry, TrustContext, TrustList, TrustListEntry } from "../../src/trust/index.js";

export interface TestKey { publicKeyPem: string; privateKeyPem: string; keyId: string }

export function testKey(): TestKey {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return {
    publicKeyPem,
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    keyId: createHash("sha256").update(publicKeyPem, "utf8").digest("hex")
  };
}

export function listEntry(key: TestKey, overrides: Partial<TrustListEntry> = {}): TrustListEntry {
  return {
    keyId: key.keyId, algorithm: "ed25519", publicKeyPem: key.publicKeyPem,
    purposes: ["artifact-seal"], subject: "test auditor",
    validFrom: "2026-01-01T00:00:00.000Z", validTo: "2027-01-01T00:00:00.000Z",
    source: "operator", ...overrides
  };
}

export function trustList(entries: TrustListEntry[], overrides: Partial<TrustList> = {}): TrustList {
  return {
    type: "amc.trust-list", version: 1, listId: "tenant-a", sequence: 1,
    issuedAt: "2026-06-01T00:00:00.000Z", expiresAt: "2027-06-01T00:00:00.000Z",
    entries, distrust: [], ...overrides
  };
}

/** Signs exactly as the spec says, independently of src/trust: tag, one 0x00 byte, canonical JSON. */
export function rawSignature(list: unknown, root: TestKey) {
  const bytes = Buffer.concat([Buffer.from("AMC_TRUST_LIST_V1", "ascii"), Buffer.from([0]), Buffer.from(canonicalize(list), "utf8")]);
  return { keyId: root.keyId, publicKeyPem: root.publicKeyPem, signature: sign(null, bytes, root.privateKeyPem).toString("base64") };
}

export function context(overrides: Partial<TrustContext> = {}): TrustContext {
  return {
    mode: "pinned", asOf: new Date("2026-10-06T00:00:00.000Z"), lists: [], explicitPins: [],
    distrust: [], allowUnpinned: false, allowUnanchored: false, ...overrides
  };
}

export function distrustEntry(keyId: string, overrides: Partial<DistrustEntry> = {}): DistrustEntry {
  return { keyId, distrustedFrom: null, reason: "key-compromise", note: "test", source: "operator", ...overrides };
}
