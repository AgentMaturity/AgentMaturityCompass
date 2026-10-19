import { generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import { z } from "zod";
import { canonicalize, isCanonicalSignatureBase64 } from "../../../../src/utils/json.js";
import { bindingSchema, contextFor, identifier, invalidInput, outcome, sameBinding, utcTime } from "./protocol.js";

const activationSchema = z.object({ binding: bindingSchema, activatedAt: utcTime }).strict();
const inputSchema = z.object({ context: contextFor("L1-GOV-02"), activationAvailable: z.boolean(), signatureMode: z.enum(["pinned", "unknown", "tampered"]),
  activation: activationSchema, authorizedAssessors: z.array(identifier).min(1), authorizedAuthorities: z.array(identifier).min(1),
  fria: z.object({ binding: bindingSchema, assessedAt: utcTime, approvedAt: utcTime, approverId: identifier,
    elements: z.object({ assessedUse: identifier, plannedPeriod: identifier, affectedGroups: identifier, identifiedRisks: identifier,
      humanOversight: identifier, riskMeasuresAndRedress: identifier }).strict() }).strict().nullable(),
  notification: z.object({ binding: bindingSchema, notifiedAt: utcTime, authorityId: identifier }).strict().nullable() }).strict();
const receiptSchema = z.object({ payload: activationSchema, signature: z.string().refine(isCanonicalSignatureBase64) }).strict();
type ActivationReceipt = z.infer<typeof receiptSchema>;

// The publisher is a local fixture authority. Its private key stays in this process and is never returned or serialized.
const authority = generateKeyPairSync("ed25519");
export function publishActivationFixture(input: unknown): { receipt: ActivationReceipt | null; pinnedPublicKey: KeyObject } {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { receipt: null, pinnedPublicKey: authority.publicKey };
  const value = parsed.data;
  const signer = value.signatureMode === "unknown" ? generateKeyPairSync("ed25519").privateKey : authority.privateKey;
  const signature = sign(null, Buffer.from(canonicalize(value.activation)), signer);
  if (value.signatureMode === "tampered") signature[0] = signature[0]! ^ 1;
  return { receipt: { payload: value.activation, signature: signature.toString("base64") }, pinnedPublicKey: authority.publicKey };
}

/** Checks a local draft's six structural fields and chronology, not their legal sufficiency or content quality. */
export function runFriaOracle(input: unknown, receipt: unknown, pinnedPublicKey: KeyObject) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const value = parsed.data;
  if (!value.activationAvailable) return outcome("not_evaluated", "activation_log_unavailable");
  if (receipt === null || receipt === undefined) return outcome("not_evaluated", "activation_receipt_missing");
  const signed = receiptSchema.safeParse(receipt);
  if (!signed.success) return outcome("fail", "activation_signature_invalid");
  let valid = false;
  try {
    valid = pinnedPublicKey.type === "public" && pinnedPublicKey.asymmetricKeyType === "ed25519"
      && canonicalize(signed.data.payload) === canonicalize(value.activation)
      && verify(null, Buffer.from(canonicalize(signed.data.payload)), pinnedPublicKey, Buffer.from(signed.data.signature, "base64"));
  } catch { /* A malformed or wrong authority key is a refusal. */ }
  if (!valid) return outcome("fail", "activation_signature_invalid");
  if (!sameBinding(value.context, value.activation.binding) || (value.fria && !sameBinding(value.context, value.fria.binding))
    || (value.notification && !sameBinding(value.context, value.notification.binding))) return outcome("fail", "binding_mismatch");
  if (!value.fria) return outcome("fail", "fria_missing");
  if (!value.authorizedAssessors.includes(value.fria.approverId)) return outcome("fail", "fria_approval_invalid");
  if (!value.notification) return outcome("not_evaluated", "authority_notification_missing");
  if (!value.authorizedAuthorities.includes(value.notification.authorityId)) return outcome("fail", "authority_notification_invalid");
  const assessed = Date.parse(value.fria.assessedAt), approved = Date.parse(value.fria.approvedAt);
  const notified = Date.parse(value.notification.notifiedAt), activated = Date.parse(value.activation.activatedAt);
  if (!(assessed <= approved && approved <= notified && notified < activated)) return outcome("fail", "fria_chronology_invalid");
  return outcome("pass", "fria_structure_and_chronology_valid", [`activate_plan:${value.context.planDigest}`]);
}
