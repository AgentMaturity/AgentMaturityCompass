import { getSigningKey, getSigningPublicKeyPem, signHexDigest } from "../keys.js";
import { sha256Hex } from "../../utils/hash.js";
import type { SignKind, SignedDigest, SignatureEnvelope } from "./signerTypes.js";

const CONFIG_KINDS: ReadonlySet<SignKind> = new Set(["INSTALLED_LOCK", "COMPLIANCE_MAPS", "OPS_POLICY", "TRANSFORM_PLAN", "CONTROL_PLAN"]);

export function signDigestWithVault(params: {
  workspace: string;
  kind: SignKind;
  digestHex: string;
}): SignedDigest {
  // P1-08: policy and configuration kinds sign with config-signature, every artifact with artifact-seal; the envelope
  // names the key that actually signed.
  const purpose = CONFIG_KINDS.has(params.kind) ? "config-signature" : "artifact-seal";
  const privateKeyPem = getSigningKey(params.workspace, purpose);
  const publicKeyPem = getSigningPublicKeyPem(params.workspace, purpose);
  const signature = signHexDigest(params.digestHex, privateKeyPem);
  const envelope: SignatureEnvelope = {
    v: 1,
    alg: "ed25519",
    pubkeyB64: Buffer.from(publicKeyPem, "utf8").toString("base64"),
    fingerprint: sha256Hex(Buffer.from(publicKeyPem, "utf8")),
    sigB64: signature,
    signedTs: Date.now(),
    signer: {
      type: "VAULT",
      attestationLevel: "SOFTWARE"
    }
  };
  return {
    digestSha256: params.digestHex,
    signature,
    signedTs: envelope.signedTs,
    signer: "auditor",
    envelope
  };
}

