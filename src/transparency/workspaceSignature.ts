import { getPublicKeyPem, verifyHexDigestAny } from "../crypto/keys.js";
import { describePolicySigner } from "../crypto/signing/signer.js";
import { signatureEnvelopeSchema, verifySignatureEnvelope } from "../crypto/signing/signatureEnvelope.js";
import { canonicalSigningKey } from "../keys/algorithmPolicy.js";
import { assertKeysetComplete, boundProviderKey, keysetDeclared } from "../keys/keyset.js";
import { getPurposeKeyHistory, readHistory } from "../keys/signingKeys.js";

export type WorkspaceLogKind = "TRANSPARENCY_ROOT" | "MERKLE_ROOT";

function ordinaryKeys(workspace: string): string[] {
  const keys = getPurposeKeyHistory(workspace, "artifact-seal");
  // Explicit owner-imported legacy keys only while the complete committed key set is positively unbound.
  if (keysetDeclared(workspace) && boundProviderKey(workspace, "artifact-seal") === null) {
    const history = readHistory(workspace, "auditor", getPublicKeyPem(workspace, "auditor"));
    keys.push(...(history?.entries.filter(entry => entry.source === "imported").map(entry => entry.publicKeyPem) ?? []));
  }
  return keys;
}

function notaryKeys(workspace: string, kind: WorkspaceLogKind): string[] {
  const history = readHistory(workspace, "auditor", getPublicKeyPem(workspace, "auditor"));
  if (history === null) return [];
  // Historical local admission survives a later owner policy/pin change; it records no historical kind/time policy.
  const keys = history.entries.filter(entry => entry.source === "notary").map(entry => entry.publicKeyPem);
  try {
    const selected = describePolicySigner(workspace, kind);
    // Enabling an already-local key may retain source=local. Only its actual current selected pin supplies this case.
    if (selected.mode === "NOTARY" && history.entries.some(entry => canonicalSigningKey(entry.publicKeyPem)?.pem === selected.publicKeyPem)) {
      keys.push(selected.publicKeyPem);
    }
  } catch { /* Current policy supplies no fallback; authenticated historical notary admission remains independent. */ }
  return keys;
}

/**
 * Local workspace-log integrity, not independent anchoring or historical policy-at-signing.
 * Only actual log readers supply the hardcoded kind. No arbitrary-key override, signing, initialization, or repair.
 */
export function verifyWorkspaceLogSignature(workspace: string, kind: WorkspaceLogKind, digestHex: string,
  signed: { signature: string; envelope?: unknown }): boolean {
  try {
    assertKeysetComplete(workspace);
    if (signed.envelope !== undefined) {
      const envelope = signatureEnvelopeSchema.parse(signed.envelope);
      if (envelope.sigB64 !== signed.signature) return false;
      const keys = envelope.signer.type === "NOTARY" ? notaryKeys(workspace, kind) : ordinaryKeys(workspace);
      return verifySignatureEnvelope(digestHex, envelope, { trustedPublicKeys: keys, requireTrustedKey: true });
    }
    return verifyHexDigestAny(digestHex, signed.signature, ordinaryKeys(workspace));
  } catch { return false; }
}
