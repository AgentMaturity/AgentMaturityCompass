import { getPublicKeyPem } from "../crypto/keys.js";
import { publicKeyFromPrivate } from "../crypto/keyHistoryEnvelope.js";
import { canonicalize } from "../utils/json.js";
import { vaultStatus } from "../vault/vault.js";
import { canonicalSigningKey } from "../keys/algorithmPolicy.js";
import { assertKeysetComplete, boundProviderKey, keysetDeclared } from "../keys/keyset.js";
import { keyPolicy, loadKeysConfig } from "../keys/keysConfig.js";
import { KeyProviderError } from "../keys/provider.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { assertSigningKeyUsable, getSigningKey, getSigningPublicKeyPem, getPurposeKeyHistory, readHistory } from "../keys/signingKeys.js";

/** Internal maintained-caller choice. Request bodies never select the synchronous compatibility branch. */
export interface RunHashPublicationOptions { beforePublish?: () => void; synchronousSeal?: boolean }
export interface PreparedRunHashSignature { readonly signature: string; assertCurrent(): void }

function signingEnabled() { if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing"); }

/** Capture before a producer's FIRST await. No response or signature is fabricated for this original-authority gate. */
export function captureRunHashAuthority(workspace: string, unsigned: boolean): () => void {
  if (unsigned) return () => {};
  signingEnabled();
  const captured = capturePurposePublication(workspace, "artifact-seal"), bound = boundProviderKey(workspace, "artifact-seal");
  const holder = bound?.binding.provider ?? "file", publicKeyPem = bound?.publicKeyPem ?? getSigningPublicKeyPem(workspace, "artifact-seal");
  const algorithm = canonicalSigningKey(publicKeyPem)?.algorithm, selectedPolicy = canonicalize(keyPolicy(loadKeysConfig(workspace)));
  if (algorithm === undefined) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, "the original run signer has no supported public key");
  const assertCurrent = () => {
    signingEnabled();
    if (canonicalize(assertKeysetComplete(workspace)) !== captured.keyset)
      throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, "the original run purpose generation changed while preparing publication");
    const policy = keyPolicy(loadKeysConfig(workspace));
    if (canonicalize(policy) !== selectedPolicy || !policy.allowed.includes(algorithm) || (holder === "file" && policy.requireNonExportable))
      throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, "current policy refuses the original run signer");
    assertSigningKeyUsable(workspace, "artifact-seal", publicKeyPem, holder);
    if (holder === "file") {
      if (!vaultStatus(workspace).unlocked) throw new Error("🔐 Vault locked. Run `amc vault unlock` first, or `amc setup` for first-time setup. Use --no-sign to skip signing where supported.");
      if (publicKeyFromPrivate(getSigningKey(workspace, "artifact-seal")) !== publicKeyPem)
        throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, "the original run vault key changed");
    }
  };
  assertCurrent(); return assertCurrent;
}

/** Raw 32-byte run digest, checked artifact-purpose signer, original holder retained across import and Describe waits. */
export async function prepareRunHashSignature(workspace: string, hashHex: string, unsigned: boolean, beforePublish?: () => void): Promise<PreparedRunHashSignature> {
  const actor = beforePublish;
  if (!unsigned) beforePublish = () => { signingEnabled(); actor?.(); signingEnabled(); };
  beforePublish?.();
  if (unsigned) return Object.freeze({ signature: "unsigned", assertCurrent() {} });
  if (!/^[0-9a-f]{64}$/i.test(hashHex)) throw new Error("Run seal requires a SHA-256 digest");
  const fixed = captureRunHashAuthority(workspace, false), captured = capturePurposePublication(workspace, "artifact-seal"), message = Buffer.from(hashHex, "hex");
  const beforeSign = () => { beforePublish?.(); fixed(); };
  const { signWithPurposeKey } = await import("../keys/purposeProviders.js");
  beforeSign();
  const signed = await signWithPurposeKey(workspace, "artifact-seal", message, { beforeSign });
  beforePublish?.(); fixed();
  const assertCurrent = () => { fixed(); assertPurposePublicationCurrent(workspace, captured, signed); };
  assertCurrent(); return Object.freeze({ signature: signed.signature.toString("base64"), assertCurrent });
}

/** Intrinsic run authority only. External report/ledger admission remains a separate caller boundary. */
export function runHashVerificationKeys(workspace: string): string[] {
  assertKeysetComplete(workspace);
  const keys = getPurposeKeyHistory(workspace, "artifact-seal");
  if (keysetDeclared(workspace) && boundProviderKey(workspace, "artifact-seal") === null) {
    const history = readHistory(workspace, "auditor", getPublicKeyPem(workspace, "auditor"));
    keys.push(...(history?.entries.filter(entry => entry.source === "imported").map(entry => entry.publicKeyPem) ?? []));
  }
  return keys;
}
