import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { signSerializedPayloadWithAuditor } from "../org/orgSigner.js";
import { binderSignatureSchema, type AuditBinderJson } from "./binderSchema.js";

/** Canonical JSON signed by the workspace auditor key (vault or notary, per the trust config), as binder.sig is. */
function signAuditorJson(workspace: string, value: unknown) {
  const canonical = canonicalize(value);
  const signed = signSerializedPayloadWithAuditor(workspace, canonical);
  return binderSignatureSchema.parse({
    digestSha256: sha256Hex(Buffer.from(canonical, "utf8")),
    signature: signed.signature,
    signedTs: signed.signedTs,
    signer: "auditor",
    envelope: signed.envelope
  });
}

export function signBinderJson(workspace: string, binder: AuditBinderJson) {
  return signAuditorJson(workspace, binder);
}

/** P0-20: an industry-pack audit (everything but its signature) signed through the binder signing path. */
export function signIndustryPackAuditJson(workspace: string, body: unknown) {
  return signAuditorJson(workspace, body);
}
