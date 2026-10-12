/**
 * The release's update policy (P1-62 slice B; design §10.4 Ask, §14.4): built from the Activate answers, checked against
 * its schema and written as YAML on the ops-policy pattern (src/ops/policy.ts), signed beside it inside the package
 * (`update-policy.yaml.sig`, A4_PACKAGE). It is recorded, never enforced: no runner reads it until P2-34, and it says so.
 */
import YAML from "yaml";
import { z } from "zod";
import { sha256Hex } from "../utils/hash.js";
import { verifiedA4Digest } from "./a4Evidence.js";
import type { A4Answer } from "./a4Schema.js";
import { answerValues, listValue, textValue } from "./spec/aspire.js";

export const UPDATE_POLICY_PATH = "update-policy.yaml";
const ENFORCEMENT_NOTE = "Recorded and signed in the package; no runner enforces it yet (P2-34).";
const text = z.string().min(1).max(500).nullable();

const a4UpdatePolicySchema = z.strictObject({
  schema: z.literal("amc.a4-update-policy/v1"),
  channel: text,
  versionPin: text,
  approvalRequired: z.boolean(),
  windows: text,
  autoRollbackOn: z.array(z.string().min(1).max(500)).max(64),
  enforcement: z.literal("none"),
  enforcementNote: z.literal(ENFORCEMENT_NOTE)
});
export type A4UpdatePolicy = z.infer<typeof a4UpdatePolicySchema>;

/** The update policy from the answers; an approval requirement is assumed unless the answer is `not_required`. */
export function updatePolicyOf(answers: readonly A4Answer[]): A4UpdatePolicy {
  const values = answerValues(answers);
  const clip = (value: string | null): string | null => value === null ? null : value.slice(0, 500);
  return a4UpdatePolicySchema.parse({ schema: "amc.a4-update-policy/v1", channel: clip(textValue(values.get("updateChannel"))),
    versionPin: clip(textValue(values.get("updateVersionPin"))), approvalRequired: textValue(values.get("updateApproval")) !== "not_required",
    windows: clip(textValue(values.get("updateWindows"))), autoRollbackOn: listValue(values.get("autoRollbackOn")).slice(0, 64).map((entry) => entry.slice(0, 500)),
    enforcement: "none", enforcementNote: ENFORCEMENT_NOTE });
}

/** The YAML bytes the package carries (signed by the caller with A4_PACKAGE over their sha256). */
export const updatePolicyYaml = (answers: readonly A4Answer[]): Buffer => Buffer.from(YAML.stringify(updatePolicyOf(answers)), "utf8");

/**
 * The packaged policy checked now: its bytes against the signature beside them (this workspace's keys, or the notary the
 * signed trust config pins: a local audit trail, never a portable verdict) and against the schema. Anything unreadable
 * is `valid: false` with its reason.
 */
export function verifyUpdatePolicy(workspace: string, yaml: Buffer | null, sig: Buffer | null): { valid: boolean; reason: string | null; policy: A4UpdatePolicy | null } {
  if (yaml === null || sig === null) return { valid: false, reason: yaml === null ? "UPDATE_POLICY_MISSING" : "UPDATE_POLICY_SIGNATURE_MISSING", policy: null };
  try {
    const signed = JSON.parse(sig.toString("utf8")) as { digestSha256?: unknown; signature?: unknown; envelope?: unknown };
    const digest = sha256Hex(yaml);
    if (signed.digestSha256 !== digest || typeof signed.signature !== "string"
      || !verifiedA4Digest(workspace, digest, { signature: signed.signature, envelope: signed.envelope }, "A4_PACKAGE")) {
      return { valid: false, reason: "UPDATE_POLICY_SIGNATURE_INVALID", policy: null };
    }
    const policy = a4UpdatePolicySchema.safeParse(YAML.parse(yaml.toString("utf8")));
    return policy.success ? { valid: true, reason: null, policy: policy.data } : { valid: false, reason: "UPDATE_POLICY_INVALID", policy: null };
  } catch {
    return { valid: false, reason: "UPDATE_POLICY_UNREADABLE", policy: null };
  }
}
