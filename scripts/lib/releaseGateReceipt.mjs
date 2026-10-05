import { createHash } from "node:crypto";

/** Use AMC's release signer; callers supply the already-approved signing identity. */
export async function signGateReceipt(receipt, privateKeyPem, publicKeyPem) {
  const { signReleaseManifest, verifyReleaseManifest, releasePublicKeyFingerprint } = await import("../../dist/release/releaseSigner.js");
  const { canonicalize } = await import("../../dist/utils/json.js");
  const signature = signReleaseManifest(receipt, privateKeyPem);
  if (!verifyReleaseManifest(receipt, signature, publicKeyPem)) throw new Error("Release gate signing key does not match the trusted public key");
  return { v: 1, algorithm: "ed25519", publicKeyFingerprint: releasePublicKeyFingerprint(publicKeyPem),
    payloadSha256: createHash("sha256").update(canonicalize(receipt)).digest("hex"), signature };
}

/** The public key must be pinned externally; a receipt never supplies its own trust root. */
export async function verifyGateReceipt(receipt, authentication, publicKeyPem) {
  const { verifyReleaseManifest, releasePublicKeyFingerprint } = await import("../../dist/release/releaseSigner.js");
  const { canonicalize } = await import("../../dist/utils/json.js");
  return authentication?.v === 1 && authentication.algorithm === "ed25519"
    && authentication.publicKeyFingerprint === releasePublicKeyFingerprint(publicKeyPem)
    && authentication.payloadSha256 === createHash("sha256").update(canonicalize(receipt)).digest("hex")
    && verifyReleaseManifest(receipt, authentication.signature, publicKeyPem);
}
