import { assertSha256HexDigest } from "../keys.js";
import { sha256Hex } from "../../utils/hash.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../../keys/purposePublication.js";
import { signWithPurposeKey } from "../../keys/purposeProviders.js";
import { signingPurposeForKind, type SignKind, type SignedDigest, type SignatureEnvelope } from "./signerTypes.js";

/** Awaitable workspace-policy route. The existing VAULT protocol mode names this route, not a hardware assertion. */
export async function signDigestWithPurpose(params: { workspace: string; kind: SignKind; digestHex: string; beforeSign?: () => void }): Promise<SignedDigest> {
  const workspace = params.workspace, kind = params.kind, digestHex = params.digestHex, beforeSign = params.beforeSign;
  assertSha256HexDigest(digestHex);
  if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing");
  beforeSign?.();
  const purpose = signingPurposeForKind(kind), captured = capturePurposePublication(workspace, purpose);
  const signed = await signWithPurposeKey(workspace, purpose, Buffer.from(digestHex, "hex"), { beforeSign });
  assertPurposePublicationCurrent(workspace, captured, signed);
  const signature = signed.signature.toString("base64"), envelope: SignatureEnvelope = {
    v: 1, alg: signed.algorithm, pubkeyB64: Buffer.from(signed.publicKeyPem, "utf8").toString("base64"),
    fingerprint: sha256Hex(Buffer.from(signed.publicKeyPem, "utf8")), sigB64: signature, signedTs: Date.now(),
    signer: { type: "VAULT", attestationLevel: "SOFTWARE" }
  };
  return { digestSha256: digestHex, signature, signedTs: envelope.signedTs, signer: "auditor", envelope };
}
