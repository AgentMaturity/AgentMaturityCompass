import { captureConfigSignatureAuthority } from "../config/configSignaturePair.js";
import { verifyWithKey } from "../keys/algorithmPolicy.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { targetProfilePayload } from "./targetProfile.js";

/** Internal v1 raw CONFIG-SIGNATURE preparation. No artifact envelope, alternate purpose, or signer fallback. */
export async function prepareTargetProfileSignatureAsync(params: {
  workspace: string; name: string; contextGraphHash: string; mapping: Record<string, number>;
}, assertInputsCurrent?: () => void) {
  const workspace = params.workspace, payload = targetProfilePayload({ ...params, mapping: { ...params.mapping } });
  assertInputsCurrent?.();
  const original = captureConfigSignatureAuthority(workspace), digest = Buffer.from(sha256Hex(canonicalize(payload)), "hex");
  const beforeSign = () => { assertInputsCurrent?.(); original.assertCurrent(); };
  beforeSign();
  const signed = await signWithPurposeKey(workspace, "config-signature", digest, { beforeSign });
  beforeSign();
  const signature = signed.signature.toString("base64");
  const assertCurrent = () => {
    original.assertCurrent(); assertPurposePublicationCurrent(workspace, original.captured, signed);
    if (!verifyWithKey(digest, original.publicKeyPem, Buffer.from(signature, "base64")))
      throw new Error("prepared target signature does not match the original actual config signer");
  };
  assertCurrent();
  const bytes = Buffer.from(JSON.stringify({ ...payload, signature }, null, 2));
  // The old-destination input gate is preparation-only. Scaffold publication retains its own expected-state CAS.
  return Object.freeze({ assertCurrent, get bytes() { return Buffer.from(bytes); } });
}
