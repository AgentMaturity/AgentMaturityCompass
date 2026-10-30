import { publicKeyFromPrivate } from "../crypto/keyHistoryEnvelope.js";
import { sha256Hex } from "../utils/hash.js";
import type { LocalPurpose } from "./vaultPayload.js";

// Fixed private roster: source additions require deliberate matching review of the public purpose set.
const purposeRoster = Object.freeze([
  "ledger-row", "receipt", "artifact-seal", "revocation-list", "config-signature", "lease", "session"
] as const);
const isPurpose = (value: unknown): value is LocalPurpose =>
  typeof value === "string" && (purposeRoster as readonly string[]).includes(value);

const refused = (): never => { throw new Error("original cached vault purpose material is unavailable or changed"); };

/** Own data only: absence may compare as undefined; inherited/accessor observations always refuse. */
function ownData(value: unknown, name: string): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return refused();
  const descriptor = Object.getOwnPropertyDescriptor(value, name);
  if (descriptor === undefined) {
    if (name in value) return refused();
    return undefined;
  }
  if (!Object.hasOwn(descriptor, "value")) return refused();
  return descriptor.value;
}

/** A temporary actual observation; neither this object nor its private string enters a returned closure. */
function observe(payload: unknown, keyset: unknown, purpose: LocalPurpose) {
  const keys = ownData(payload, "keys"), expected = ownData(keyset, "keys");
  for (const local of purposeRoster) {
    const record = ownData(keys, local), keyId = record === undefined ? undefined : ownData(record, "keyId");
    const named = ownData(expected, local);
    if ((keyId !== undefined && typeof keyId !== "string") || (named !== undefined && typeof named !== "string")
      || keyId !== named) refused();
  }
  const record = ownData(keys, purpose), keyId = ownData(record, "keyId"), privateKeyPem = ownData(record, "privateKeyPem");
  if (typeof record !== "object" || record === null || typeof keyId !== "string" || typeof privateKeyPem !== "string") return refused();
  return { record, keyId, privateKeyPem };
}

/** Separate lexical factory: parameters retain only a weak record reference and scalar observations. */
function materialNegative(original: WeakRef<object>, keyId: string, digest: string, purpose: LocalPurpose) {
  return (payload: unknown, keyset: unknown): void => {
    const current = observe(payload, keyset, purpose);
    if (current.record !== original.deref() || current.keyId !== keyId
      || sha256Hex(Buffer.from(current.privateKeyPem, "utf8")) !== digest) refused();
  };
}

/** Internal material comparison only. Actual map/session provenance belongs solely to vault.ts. */
export function captureVaultPurposeMaterial(payload: unknown, keyset: unknown, purpose: LocalPurpose) {
  if (!isPurpose(purpose)) return refused();
  const current = observe(payload, keyset, purpose);
  let actualId: string;
  try { actualId = sha256Hex(Buffer.from(publicKeyFromPrivate(current.privateKeyPem), "utf8")); }
  catch { return refused(); }
  if (actualId !== current.keyId) refused();
  return materialNegative(new WeakRef(current.record), current.keyId, sha256Hex(Buffer.from(current.privateKeyPem, "utf8")), purpose);
}
