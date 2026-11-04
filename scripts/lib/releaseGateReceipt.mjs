import { createHash } from "node:crypto";

/** Use AMC's release signer; callers supply the already-approved signing identity. */
export async function signGateReceipt(receipt, privateKeyPem, publicKeyPem) {
  const { signReleaseManifest, releasePublicKeyFingerprint } = await import("../../dist/release/releaseSigner.js");
  const { verifyCanonical } = await import("../../dist/keys/algorithmPolicy.js");
  const { canonicalize } = await import("../../dist/utils/json.js");
  const signature = signReleaseManifest(receipt, privateKeyPem);
  if (!verifyCanonical("ed25519", Buffer.from(canonicalize(receipt), "utf8"), publicKeyPem, Buffer.from(signature, "base64"))) throw new Error("Release gate signing key does not match the trusted public key");
  return { v: 1, algorithm: "ed25519", publicKeyFingerprint: releasePublicKeyFingerprint(publicKeyPem),
    payloadSha256: createHash("sha256").update(canonicalize(receipt)).digest("hex"), signature };
}

/** The public key must be pinned externally; a receipt never supplies its own trust root. */
export async function verifyGateReceipt(receipt, authentication, publicKeyPem) {
  const { releasePublicKeyFingerprint } = await import("../../dist/release/releaseSigner.js");
  const { verifyCanonical } = await import("../../dist/keys/algorithmPolicy.js");
  const { canonicalize } = await import("../../dist/utils/json.js");
  return authentication?.v === 1 && authentication.algorithm === "ed25519"
    && authentication.publicKeyFingerprint === releasePublicKeyFingerprint(publicKeyPem)
    && authentication.payloadSha256 === createHash("sha256").update(canonicalize(receipt)).digest("hex")
    && typeof authentication.signature === "string"
    && verifyCanonical("ed25519", Buffer.from(canonicalize(receipt), "utf8"), publicKeyPem, Buffer.from(authentication.signature, "base64"));
}
