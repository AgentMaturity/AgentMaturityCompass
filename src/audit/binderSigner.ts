import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { prepareFileSignatureWithAuditor, signSerializedPayloadWithAuditor } from "../org/orgSigner.js";
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

export async function prepareBinderSignatureAsync(workspace: string, binder: AuditBinderJson, beforeSign: () => void) {
  const bytes = Buffer.from(canonicalize(binder), "utf8");
  const prepared = await prepareFileSignatureWithAuditor(workspace, "binder.json", bytes, "BUNDLE", beforeSign);
  const signature = binderSignatureSchema.parse(JSON.parse(prepared.signatureBytes) as unknown);
  if (signature.envelope === undefined) throw new Error("prepared audit binder has no signer envelope");
  const publicKeyPem = Buffer.from(signature.envelope.pubkeyB64, "base64").toString("utf8");
  return { signature, publicKeyPem, assertCurrent: prepared.assertCurrent };
}
